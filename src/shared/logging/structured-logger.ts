export interface StructuredLoggerSink {
  info: (message: string) => void;
}

export interface StructuredLogger {
  info: (event: string, context?: Record<string, unknown>) => void;
}

const normalizeContext = (context: Record<string, unknown> | undefined): Record<string, unknown> => {
  if (!context) {
    return {};
  }

  return Object.fromEntries(Object.entries(context).filter(([, value]) => value !== undefined));
};

export const createStructuredLogger = ({
  component,
  sink = console,
  now = () => new Date().toISOString(),
}: {
  component: string;
  sink?: StructuredLoggerSink;
  now?: () => string;
}): StructuredLogger => {
  const normalizedComponent = component.trim();
  if (normalizedComponent.length === 0) {
    throw new Error('component is required for structured logger.');
  }

  return {
    info: (event: string, context?: Record<string, unknown>) => {
      const payload = {
        level: 'INFO',
        timestamp: now(),
        component: normalizedComponent,
        event,
        ...normalizeContext(context),
      };

      sink.info(JSON.stringify(payload));
    },
  };
};
