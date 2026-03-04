import {
  context,
  SpanStatusCode,
  trace,
  type Attributes,
  type Context,
  type Span,
  type SpanContext,
  type TraceFlags,
} from '@opentelemetry/api';
import { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';

const TRACEPARENT_REGEX = /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})(?:-[0-9a-f]+)?$/i;
const ZERO_TRACE_ID = '00000000000000000000000000000000';
const ZERO_SPAN_ID = '0000000000000000';
const DEFAULT_SERVICE_NAME = 'alert-orchestration-service';

let providerInitialized = false;

export interface TelemetryTraceContext {
  traceparent: string;
  traceId: string;
  spanId: string;
  traceFlags: string;
}

export interface TelemetryAttributesInput {
  service?: string;
  stage?: string;
  sourceId?: string;
  tenantId?: string;
  executionId?: string;
}

export interface TelemetrySpanOptions {
  component: string;
  spanName: string;
  parentTraceContext?: Partial<TelemetryTraceContext> | null;
  attributes?: Attributes;
}

export interface ChildTelemetrySpanOptions {
  spanName: string;
  attributes?: Attributes;
}

export interface TelemetrySpanScope {
  span: Span;
  traceContext: TelemetryTraceContext;
  runInChildSpan: <T>(
    options: ChildTelemetrySpanOptions,
    run: () => Promise<T> | T,
  ) => Promise<T>;
}

export interface TelemetryLogContext {
  trace_id: string;
  span_id: string;
  traceparent: string;
}

const normalizeHex = (value: string | undefined): string | null => {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
};

const ensureTracerProvider = (): void => {
  if (providerInitialized) {
    return;
  }

  trace.setGlobalTracerProvider(new BasicTracerProvider());
  providerInitialized = true;
};

const resolveServiceName = (): string => {
  const rawValue = process.env.OTEL_SERVICE_NAME ?? process.env.SERVICE_NAME;
  if (!rawValue) {
    return DEFAULT_SERVICE_NAME;
  }

  const normalized = rawValue.trim();
  return normalized.length > 0 ? normalized : DEFAULT_SERVICE_NAME;
};

const buildTraceparent = (spanContext: SpanContext): string => {
  const traceFlags = spanContext.traceFlags.toString(16).padStart(2, '0');
  return `00-${spanContext.traceId}-${spanContext.spanId}-${traceFlags}`;
};

const toTelemetryTraceContext = (span: Span): TelemetryTraceContext => {
  const spanContext = span.spanContext();
  return {
    traceparent: buildTraceparent(spanContext),
    traceId: spanContext.traceId,
    spanId: spanContext.spanId,
    traceFlags: spanContext.traceFlags.toString(16).padStart(2, '0'),
  };
};

const parseTraceFlags = (rawFlags: string | undefined): TraceFlags => {
  const normalized = normalizeHex(rawFlags);
  if (!normalized) {
    return 1 as TraceFlags;
  }

  const parsed = Number.parseInt(normalized, 16);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 255) {
    return 1 as TraceFlags;
  }

  return parsed as TraceFlags;
};

const toSpanContextFromFields = (
  input: Partial<TelemetryTraceContext>,
): SpanContext | null => {
  const traceId = normalizeHex(input.traceId);
  const spanId = normalizeHex(input.spanId);
  if (!traceId || !spanId) {
    return null;
  }

  const isValidTraceId = /^[0-9a-f]{32}$/.test(traceId) && traceId !== ZERO_TRACE_ID;
  const isValidSpanId = /^[0-9a-f]{16}$/.test(spanId) && spanId !== ZERO_SPAN_ID;
  if (!isValidTraceId || !isValidSpanId) {
    return null;
  }

  return {
    traceId,
    spanId,
    traceFlags: parseTraceFlags(input.traceFlags),
    isRemote: true,
  };
};

const toSpanContextFromTraceparent = (
  rawTraceparent: string | undefined,
): SpanContext | null => {
  const normalized = normalizeHex(rawTraceparent);
  if (!normalized) {
    return null;
  }

  const match = TRACEPARENT_REGEX.exec(normalized);
  if (!match) {
    return null;
  }

  const traceId = match[2];
  const spanId = match[3];
  if (traceId === ZERO_TRACE_ID || spanId === ZERO_SPAN_ID) {
    return null;
  }

  return {
    traceId,
    spanId,
    traceFlags: parseTraceFlags(match[4]),
    isRemote: true,
  };
};

const resolveParentContext = (input: Partial<TelemetryTraceContext> | null | undefined): Context => {
  if (!input) {
    return context.active();
  }

  const parentSpanContext =
    toSpanContextFromTraceparent(input.traceparent) ?? toSpanContextFromFields(input);
  if (!parentSpanContext) {
    return context.active();
  }

  return trace.setSpan(context.active(), trace.wrapSpanContext(parentSpanContext));
};

const normalizeAttributes = (attributes: Attributes | undefined): Attributes | undefined => {
  if (!attributes) {
    return undefined;
  }

  const entries = Object.entries(attributes).filter(([, value]) => value !== undefined && value !== null);
  if (entries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(entries);
};

const markErrorOnSpan = (span: Span, error: unknown): void => {
  if (error instanceof Error) {
    span.recordException(error);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message,
    });
    return;
  }

  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: String(error),
  });
};

const runWithTelemetryChildSpan = async <T>({
  component,
  parentContext,
  options,
  run,
}: {
  component: string;
  parentContext: Context;
  options: ChildTelemetrySpanOptions;
  run: () => Promise<T> | T;
}): Promise<T> => {
  const tracer = trace.getTracer(resolveServiceName(), component);
  const childSpan = tracer.startSpan(
    options.spanName,
    {
      attributes: normalizeAttributes(options.attributes),
    },
    parentContext,
  );

  const childContext = trace.setSpan(parentContext, childSpan);
  try {
    return await context.with(childContext, async () => run());
  } catch (error) {
    markErrorOnSpan(childSpan, error);
    throw error;
  } finally {
    childSpan.end();
  }
};

export const withTelemetrySpan = async <T>({
  component,
  spanName,
  parentTraceContext,
  attributes,
  run,
}: TelemetrySpanOptions & {
  run: (scope: TelemetrySpanScope) => Promise<T> | T;
}): Promise<T> => {
  ensureTracerProvider();

  const tracer = trace.getTracer(resolveServiceName(), component);
  const parentContext = resolveParentContext(parentTraceContext);
  const rootSpan = tracer.startSpan(
    spanName,
    {
      attributes: normalizeAttributes(attributes),
    },
    parentContext,
  );
  const rootSpanContext = trace.setSpan(parentContext, rootSpan);
  const traceContext = toTelemetryTraceContext(rootSpan);

  try {
    return await context.with(rootSpanContext, async () =>
      run({
        span: rootSpan,
        traceContext,
        runInChildSpan: <ChildResult>(
          options: ChildTelemetrySpanOptions,
          childRun: () => Promise<ChildResult> | ChildResult,
        ): Promise<ChildResult> =>
          runWithTelemetryChildSpan({
            component,
            parentContext: rootSpanContext,
            options,
            run: childRun,
          }),
      }),
    );
  } catch (error) {
    markErrorOnSpan(rootSpan, error);
    throw error;
  } finally {
    rootSpan.end();
  }
};

export const toTelemetryLogContext = (traceContext: TelemetryTraceContext): TelemetryLogContext => ({
  trace_id: traceContext.traceId,
  span_id: traceContext.spanId,
  traceparent: traceContext.traceparent,
});

export const buildTelemetryAttributes = ({
  service,
  stage,
  sourceId,
  tenantId,
  executionId,
}: TelemetryAttributesInput): Attributes => {
  return normalizeAttributes({
    service: service?.trim() || process.env.SERVICE_NAME || DEFAULT_SERVICE_NAME,
    stage: stage?.trim() || process.env.STAGE || 'unknown',
    sourceId: sourceId?.trim() || undefined,
    tenantId: tenantId?.trim() || undefined,
    executionId: executionId?.trim() || undefined,
  }) ?? {};
};
