import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DeleteMessageCommand, ReceiveMessageCommand, SendMessageCommand } from '@aws-sdk/client-sqs';
import { describe, expect, it } from '@jest/globals';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const SCRIPT_PATH = path.resolve(REPO_ROOT, 'scripts/reprocess-dlq-core.cjs');

type DlqSummary = {
  batchId: string;
  totals: {
    scanned: number;
    eligibleByDate: number;
    replayed: number;
    deletedFromDlq: number;
    skippedByDate: number;
    failed: number;
  };
  integrations: Record<
    string,
    {
      scanned: number;
      eligibleByDate: number;
      replayed: number;
      deletedFromDlq: number;
      skippedByDate: number;
      failed: number;
    }
  >;
};

type DlqReprocessorResult = {
  auditFilePath: string;
  summary: DlqSummary;
};

type DlqReprocessor = {
  run: (argv?: string[]) => Promise<DlqReprocessorResult>;
};

type DlqModule = {
  createDlqReprocessor: (params?: {
    client?: { send(command: unknown): Promise<unknown> };
    env?: NodeJS.ProcessEnv;
    now?: () => Date;
    newBatchId?: () => string;
    cwd?: string;
  }) => DlqReprocessor;
};

type StubMessage = {
  MessageId?: string;
  ReceiptHandle?: string;
  Body?: string;
  Attributes?: {
    SentTimestamp?: string;
  };
  MessageAttributes?: Record<
    string,
    {
      DataType: string;
      StringValue?: string;
    }
  >;
};

class StubSqsClient {
  public readonly sendCalls: unknown[] = [];

  constructor(private readonly receiveResponses: Array<{ Messages?: StubMessage[] }>) {}

  send(command: unknown): Promise<unknown> {
    this.sendCalls.push(command);

    if (command instanceof ReceiveMessageCommand) {
      return Promise.resolve(this.receiveResponses.shift() ?? { Messages: [] });
    }

    if (command instanceof SendMessageCommand) {
      return Promise.resolve({ MessageId: 'sent-1' });
    }

    if (command instanceof DeleteMessageCommand) {
      return Promise.resolve({});
    }

    throw new Error('Unsupported SQS command in test stub.');
  }
}

const createNowFactory = (values: string[]) => {
  let index = 0;

  return () => {
    const value = values[Math.min(index, values.length - 1)];
    index += 1;
    return new Date(value);
  };
};

const loadModule = async (): Promise<DlqModule> => {
  return (await import(SCRIPT_PATH)) as unknown as DlqModule;
};

const createBaseEnv = (): NodeJS.ProcessEnv => ({
  SALESFORCE_INTEGRATION_DLQ_URL: 'https://sqs.us-east-1.amazonaws.com/123/salesforce-dlq',
  SALESFORCE_INTEGRATION_QUEUE_URL: 'https://sqs.us-east-1.amazonaws.com/123/salesforce-main',
  HUBSPOT_INTEGRATION_DLQ_URL: 'https://sqs.us-east-1.amazonaws.com/123/hubspot-dlq',
  HUBSPOT_INTEGRATION_QUEUE_URL: 'https://sqs.us-east-1.amazonaws.com/123/hubspot-main',
});

describe('reprocess-dlq script', () => {
  it('covers dry-run without enqueue/delete and writes audit summary', async () => {
    const { createDlqReprocessor } = await loadModule();
    const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'dlq-reprocess-dry-run-'));
    const client = new StubSqsClient([
      {
        Messages: [
          {
            MessageId: 'm-1',
            ReceiptHandle: 'rh-1',
            Body: '{"ok":true}',
            Attributes: {
              SentTimestamp: String(Date.parse('2026-03-04T10:05:00.000Z')),
            },
          },
          {
            MessageId: 'm-2',
            ReceiptHandle: 'rh-2',
            Body: '{"ok":true}',
            Attributes: {
              SentTimestamp: String(Date.parse('2026-03-04T10:10:00.000Z')),
            },
          },
        ],
      },
      { Messages: [] },
    ]);

    const reprocessor = createDlqReprocessor({
      client,
      env: createBaseEnv(),
      now: createNowFactory(['2026-03-04T10:00:00.000Z', '2026-03-04T10:20:00.000Z']),
      newBatchId: () => 'batch-dry-run',
      cwd: tmpDir,
    });

    const result = await reprocessor.run([
      '--integration',
      'salesforce',
      '--dry-run',
      '--since',
      '2026-03-04T10:00:00.000Z',
      '--until',
      '2026-03-04T10:30:00.000Z',
      '--audit-file',
      'audit-dry-run.json',
    ]);

    expect(result.summary.totals).toEqual({
      scanned: 2,
      eligibleByDate: 2,
      replayed: 2,
      deletedFromDlq: 0,
      skippedByDate: 0,
      failed: 0,
    });
    expect(
      client.sendCalls.some(
        (command) => command instanceof SendMessageCommand || command instanceof DeleteMessageCommand,
      ),
    ).toBe(false);

    const auditContent = JSON.parse(readFileSync(result.auditFilePath, 'utf8')) as DlqSummary;
    expect(auditContent.batchId).toBe('batch-dry-run');
    expect(auditContent.totals.replayed).toBe(2);
  });

  it('replays messages to main queue, deletes from DLQ and annotates replay attributes', async () => {
    const { createDlqReprocessor } = await loadModule();
    const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'dlq-reprocess-replay-'));
    const client = new StubSqsClient([
      {
        Messages: [
          {
            MessageId: 'm-1',
            ReceiptHandle: 'rh-1',
            Body: '{"customerId":10}',
            Attributes: {
              SentTimestamp: String(Date.parse('2026-03-04T10:05:00.000Z')),
            },
            MessageAttributes: {
              origin: {
                DataType: 'String',
                StringValue: 'integration-test',
              },
            },
          },
        ],
      },
      { Messages: [] },
    ]);

    const reprocessor = createDlqReprocessor({
      client,
      env: createBaseEnv(),
      now: createNowFactory([
        '2026-03-04T10:00:00.000Z',
        '2026-03-04T10:01:00.000Z',
        '2026-03-04T10:02:00.000Z',
      ]),
      newBatchId: () => 'batch-replay',
      cwd: tmpDir,
    });

    const result = await reprocessor.run([
      '--integration',
      'salesforce',
      '--max-messages',
      '1',
      '--audit-file',
      'audit-replay.json',
    ]);

    expect(result.summary.totals).toEqual({
      scanned: 1,
      eligibleByDate: 1,
      replayed: 1,
      deletedFromDlq: 1,
      skippedByDate: 0,
      failed: 0,
    });

    const sendCommand = client.sendCalls.find(
      (command): command is SendMessageCommand => command instanceof SendMessageCommand,
    );
    expect(sendCommand).toBeDefined();
    if (!sendCommand) {
      throw new Error('expected SendMessageCommand to be captured.');
    }

    expect(sendCommand.input.MessageAttributes?.replayBatchId?.StringValue).toBe('batch-replay');
    expect(sendCommand.input.MessageAttributes?.replayedFromDlq?.StringValue).toBe('true');
    expect(sendCommand.input.MessageAttributes?.replayIntegration?.StringValue).toBe('salesforce');
    expect(sendCommand.input.MessageAttributes?.origin?.StringValue).toBe('integration-test');
  });

  it('respects --since/--until window and increments skipped counters', async () => {
    const { createDlqReprocessor } = await loadModule();
    const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'dlq-reprocess-window-'));
    const client = new StubSqsClient([
      {
        Messages: [
          {
            MessageId: 'm-old',
            ReceiptHandle: 'rh-old',
            Body: '{"customerId":10}',
            Attributes: {
              SentTimestamp: String(Date.parse('2026-03-03T10:00:00.000Z')),
            },
          },
        ],
      },
      { Messages: [] },
    ]);

    const reprocessor = createDlqReprocessor({
      client,
      env: createBaseEnv(),
      now: createNowFactory(['2026-03-04T10:00:00.000Z', '2026-03-04T10:05:00.000Z']),
      newBatchId: () => 'batch-window',
      cwd: tmpDir,
    });

    const result = await reprocessor.run([
      '--integration',
      'salesforce',
      '--since',
      '2026-03-04T00:00:00.000Z',
      '--until',
      '2026-03-04T23:59:59.000Z',
      '--audit-file',
      'audit-window.json',
    ]);

    expect(result.summary.totals).toEqual({
      scanned: 1,
      eligibleByDate: 0,
      replayed: 0,
      deletedFromDlq: 0,
      skippedByDate: 1,
      failed: 0,
    });
  });

  it('fails fast for invalid argument values', async () => {
    const { createDlqReprocessor } = await loadModule();
    const reprocessor = createDlqReprocessor({
      client: new StubSqsClient([]),
      env: createBaseEnv(),
      now: createNowFactory(['2026-03-04T10:00:00.000Z']),
      newBatchId: () => 'batch-invalid',
    });

    await expect(reprocessor.run(['--since', 'invalid-date'])).rejects.toThrow(
      'Valor inválido para --since',
    );
    await expect(
      reprocessor.run([
        '--since',
        '2026-03-05T00:00:00.000Z',
        '--until',
        '2026-03-04T00:00:00.000Z',
      ]),
    ).rejects.toThrow('--since não pode ser maior que --until.');
    await expect(reprocessor.run(['--max-messages', '0'])).rejects.toThrow(
      '--max-messages deve ser inteiro positivo.',
    );
  });
});
