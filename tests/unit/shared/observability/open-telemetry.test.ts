import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { trace, type Span, type SpanStatusCode } from '@opentelemetry/api';
import {
  buildTelemetryAttributes,
  toTelemetryLogContext,
  withTelemetrySpan,
} from '../../../../src/shared/observability/open-telemetry';

const createMockSpan = ({
  traceId,
  spanId,
}: {
  traceId: string;
  spanId: string;
}): {
  span: Span;
  end: ReturnType<typeof jest.fn>;
  setStatus: ReturnType<typeof jest.fn>;
  recordException: ReturnType<typeof jest.fn>;
} => {
  const end = jest.fn();
  const setStatus = jest.fn();
  const recordException = jest.fn();

  return {
    span: {
      end,
      setStatus,
      recordException,
      spanContext: () => ({
        traceId,
        spanId,
        traceFlags: 1,
      }),
    } as unknown as Span,
    end,
    setStatus,
    recordException,
  };
};

afterEach(() => {
  jest.restoreAllMocks();
});

describe('open telemetry helpers', () => {
  it('creates and closes root + child spans in successful execution', async () => {
    const root = createMockSpan({
      traceId: '11111111111111111111111111111111',
      spanId: '1111111111111111',
    });
    const child = createMockSpan({
      traceId: '11111111111111111111111111111111',
      spanId: '2222222222222222',
    });
    const startSpan = jest.fn()
      .mockReturnValueOnce(root.span)
      .mockReturnValueOnce(child.span);
    jest.spyOn(trace, 'getTracer').mockReturnValue({
      startSpan,
    } as unknown as ReturnType<typeof trace.getTracer>);

    const result = await withTelemetrySpan({
      component: 'scheduler',
      spanName: 'scheduler.execute',
      attributes: {
        sourceId: 'source-1',
      },
      run: async ({ traceContext, runInChildSpan }) => {
        const childResult = await runInChildSpan(
          {
            spanName: 'scheduler.list_sources',
          },
          () => 'child-ok',
        );

        expect(traceContext.traceId).toBe('11111111111111111111111111111111');
        expect(traceContext.spanId).toBe('1111111111111111');
        expect(traceContext.traceparent).toBe(
          '00-11111111111111111111111111111111-1111111111111111-01',
        );
        return childResult;
      },
    });

    expect(result).toBe('child-ok');
    expect(startSpan).toHaveBeenCalledTimes(2);
    expect(root.end).toHaveBeenCalledTimes(1);
    expect(child.end).toHaveBeenCalledTimes(1);
  });

  it('records exception and closes span when callback throws', async () => {
    const root = createMockSpan({
      traceId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      spanId: 'bbbbbbbbbbbbbbbb',
    });
    const startSpan = jest.fn().mockReturnValue(root.span);
    jest.spyOn(trace, 'getTracer').mockReturnValue({
      startSpan,
    } as unknown as ReturnType<typeof trace.getTracer>);

    await expect(
      withTelemetrySpan({
        component: 'collector',
        spanName: 'collector.execute',
        run: () => {
          throw new Error('telemetry_failure');
        },
      }),
    ).rejects.toThrow('telemetry_failure');

    expect(root.recordException).toHaveBeenCalledTimes(1);
    expect(root.setStatus).toHaveBeenCalledWith({
      code: 2 as SpanStatusCode,
      message: 'telemetry_failure',
    });
    expect(root.end).toHaveBeenCalledTimes(1);
  });

  it('builds default attributes and serializes log context', () => {
    process.env.SERVICE_NAME = 'alert-orchestration-service';
    process.env.STAGE = 'stg';

    const attributes = buildTelemetryAttributes({
      sourceId: 'source-1',
      tenantId: 'tenant-a',
      executionId: 'exec-123',
    });

    expect(attributes).toEqual({
      service: 'alert-orchestration-service',
      stage: 'stg',
      sourceId: 'source-1',
      tenantId: 'tenant-a',
      executionId: 'exec-123',
    });

    const logContext = toTelemetryLogContext({
      traceId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      spanId: 'bbbbbbbbbbbbbbbb',
      traceFlags: '01',
      traceparent: '00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01',
    });
    expect(logContext).toEqual({
      trace_id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      span_id: 'bbbbbbbbbbbbbbbb',
      traceparent: '00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01',
    });
  });
});
