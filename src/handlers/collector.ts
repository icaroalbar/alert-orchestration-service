import { nowIso } from '../shared/time/now-iso';

export interface CollectorEvent {
  sourceId: string;
  meta?: {
    executionId?: string;
    stage?: string;
  };
}

export interface CollectorResult {
  sourceId: string;
  processedAt: string;
  recordsSent: number;
}

export function handler(event: CollectorEvent): Promise<CollectorResult> {
  if (!event?.sourceId || event.sourceId.trim().length === 0) {
    throw new Error('sourceId is required for collector execution.');
  }

  return Promise.resolve({
    sourceId: event.sourceId,
    processedAt: nowIso(),
    recordsSent: 0,
  });
}
