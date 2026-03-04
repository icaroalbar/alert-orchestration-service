const { randomUUID } = require('node:crypto');
const { mkdirSync, writeFileSync } = require('node:fs');
const path = require('node:path');

const {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  SQSClient,
} = require('@aws-sdk/client-sqs');

const INTEGRATIONS = {
  salesforce: {
    dlqUrlEnv: 'SALESFORCE_INTEGRATION_DLQ_URL',
    queueUrlEnv: 'SALESFORCE_INTEGRATION_QUEUE_URL',
  },
  hubspot: {
    dlqUrlEnv: 'HUBSPOT_INTEGRATION_DLQ_URL',
    queueUrlEnv: 'HUBSPOT_INTEGRATION_QUEUE_URL',
  },
};

const DEFAULT_MAX_MESSAGES = 200;
const MAX_BATCH_SIZE = 10;

const parseArgs = (argv) => {
  const args = {
    integration: 'all',
    maxMessages: DEFAULT_MAX_MESSAGES,
    dryRun: false,
    since: null,
    until: null,
    auditFile: null,
  };

  const tokens = [...argv];
  while (tokens.length > 0) {
    const current = tokens.shift();
    if (!current || !current.startsWith('--')) {
      continue;
    }

    const [rawKey, rawValue] = current.slice(2).split('=', 2);
    const key = rawKey.trim();
    const value = rawValue ?? tokens.shift();

    switch (key) {
      case 'integration':
        args.integration = String(value || 'all').trim().toLowerCase();
        break;
      case 'max-messages':
        args.maxMessages = Number.parseInt(String(value || DEFAULT_MAX_MESSAGES), 10);
        break;
      case 'since':
        args.since = String(value || '').trim();
        break;
      case 'until':
        args.until = String(value || '').trim();
        break;
      case 'audit-file':
        args.auditFile = String(value || '').trim();
        break;
      case 'dry-run':
        args.dryRun = true;
        break;
      default:
        throw new Error(`Argumento não suportado: --${key}`);
    }
  }

  return args;
};

const parseIsoToMs = (value, fieldName) => {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`Valor inválido para ${fieldName}: "${value}". Use ISO-8601.`);
  }

  return parsed;
};

const resolveIntegrations = (requestedIntegration) => {
  if (requestedIntegration === 'all') {
    return Object.keys(INTEGRATIONS);
  }

  if (!INTEGRATIONS[requestedIntegration]) {
    throw new Error(
      `Integração inválida: "${requestedIntegration}". Use salesforce, hubspot ou all.`,
    );
  }

  return [requestedIntegration];
};

const resolveQueueUrls = ({ integration, env = process.env }) => {
  const config = INTEGRATIONS[integration];
  const dlqUrl = env[config.dlqUrlEnv];
  const queueUrl = env[config.queueUrlEnv];

  if (!dlqUrl || dlqUrl.trim().length === 0) {
    throw new Error(`Variável obrigatória ausente: ${config.dlqUrlEnv}`);
  }
  if (!queueUrl || queueUrl.trim().length === 0) {
    throw new Error(`Variável obrigatória ausente: ${config.queueUrlEnv}`);
  }

  return {
    dlqUrl: dlqUrl.trim(),
    queueUrl: queueUrl.trim(),
  };
};

const isWithinWindow = ({ sentTimestampMs, sinceMs, untilMs }) => {
  if (sinceMs !== null && sentTimestampMs < sinceMs) {
    return false;
  }
  if (untilMs !== null && sentTimestampMs > untilMs) {
    return false;
  }
  return true;
};

const cloneMessageAttributes = (attributes) => {
  if (!attributes) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(attributes).map(([name, attribute]) => [
      name,
      {
        DataType: attribute.DataType,
        StringValue: attribute.StringValue,
        BinaryValue: attribute.BinaryValue,
        StringListValues: attribute.StringListValues,
        BinaryListValues: attribute.BinaryListValues,
      },
    ]),
  );
};

const buildAuditFilePath = ({ batchId, auditFile, cwd = process.cwd() }) => {
  if (auditFile && auditFile.length > 0) {
    return path.resolve(cwd, auditFile);
  }

  return path.resolve(cwd, '.codex', 'runs', `dlq-reprocess-${batchId}.json`);
};

const createDlqReprocessor = ({
  client = new SQSClient({}),
  env = process.env,
  now = () => new Date(),
  newBatchId = randomUUID,
  cwd = process.cwd(),
  writeAudit = ({ auditFilePath, summary }) => {
    mkdirSync(path.dirname(auditFilePath), { recursive: true });
    writeFileSync(auditFilePath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  },
} = {}) => {
  return {
    run: async (argv = process.argv.slice(2)) => {
      const options = parseArgs(argv);
      if (!Number.isInteger(options.maxMessages) || options.maxMessages <= 0) {
        throw new Error('--max-messages deve ser inteiro positivo.');
      }

      const sinceMs = parseIsoToMs(options.since, '--since');
      const untilMs = parseIsoToMs(options.until, '--until');
      if (sinceMs !== null && untilMs !== null && sinceMs > untilMs) {
        throw new Error('--since não pode ser maior que --until.');
      }

      const integrations = resolveIntegrations(options.integration);
      const batchId = newBatchId();
      const startedAt = now().toISOString();

      const summary = {
        batchId,
        startedAt,
        finishedAt: null,
        dryRun: options.dryRun,
        filters: {
          integration: options.integration,
          since: options.since,
          until: options.until,
          maxMessages: options.maxMessages,
        },
        totals: {
          scanned: 0,
          eligibleByDate: 0,
          replayed: 0,
          deletedFromDlq: 0,
          skippedByDate: 0,
          failed: 0,
        },
        integrations: {},
        failures: [],
      };

      let remaining = options.maxMessages;

      for (const integration of integrations) {
        if (remaining <= 0) {
          break;
        }

        const { dlqUrl, queueUrl } = resolveQueueUrls({ integration, env });
        const integrationStats = {
          scanned: 0,
          eligibleByDate: 0,
          replayed: 0,
          deletedFromDlq: 0,
          skippedByDate: 0,
          failed: 0,
        };
        summary.integrations[integration] = integrationStats;

        let shouldContinue = true;
        while (shouldContinue && remaining > 0) {
          const batchSize = Math.min(MAX_BATCH_SIZE, remaining);
          const receiveResponse = await client.send(
            new ReceiveMessageCommand({
              QueueUrl: dlqUrl,
              MaxNumberOfMessages: batchSize,
              AttributeNames: ['All'],
              MessageAttributeNames: ['All'],
              WaitTimeSeconds: 0,
              VisibilityTimeout: 30,
            }),
          );

          const messages = receiveResponse.Messages ?? [];
          if (messages.length === 0) {
            shouldContinue = false;
            break;
          }

          for (const message of messages) {
            if (remaining <= 0) {
              break;
            }

            remaining -= 1;
            integrationStats.scanned += 1;
            summary.totals.scanned += 1;

            const sentTimestampRaw = message.Attributes?.SentTimestamp;
            const sentTimestampMs = sentTimestampRaw ? Number.parseInt(sentTimestampRaw, 10) : 0;

            const shouldReplay = isWithinWindow({
              sentTimestampMs,
              sinceMs,
              untilMs,
            });

            if (!shouldReplay) {
              integrationStats.skippedByDate += 1;
              summary.totals.skippedByDate += 1;
              continue;
            }

            integrationStats.eligibleByDate += 1;
            summary.totals.eligibleByDate += 1;

            if (options.dryRun) {
              integrationStats.replayed += 1;
              summary.totals.replayed += 1;
              continue;
            }

            try {
              const messageAttributes = {
                ...cloneMessageAttributes(message.MessageAttributes),
                replayBatchId: {
                  DataType: 'String',
                  StringValue: batchId,
                },
                replayedFromDlq: {
                  DataType: 'String',
                  StringValue: 'true',
                },
                replayedAt: {
                  DataType: 'String',
                  StringValue: now().toISOString(),
                },
                replayIntegration: {
                  DataType: 'String',
                  StringValue: integration,
                },
              };

              await client.send(
                new SendMessageCommand({
                  QueueUrl: queueUrl,
                  MessageBody: message.Body ?? '{}',
                  MessageAttributes: messageAttributes,
                }),
              );
              integrationStats.replayed += 1;
              summary.totals.replayed += 1;

              if (message.ReceiptHandle) {
                await client.send(
                  new DeleteMessageCommand({
                    QueueUrl: dlqUrl,
                    ReceiptHandle: message.ReceiptHandle,
                  }),
                );
                integrationStats.deletedFromDlq += 1;
                summary.totals.deletedFromDlq += 1;
              }
            } catch (error) {
              integrationStats.failed += 1;
              summary.totals.failed += 1;
              summary.failures.push({
                integration,
                messageId: message.MessageId ?? null,
                reason: error instanceof Error ? error.message : String(error),
              });
            }
          }
        }
      }

      summary.finishedAt = now().toISOString();
      const auditFilePath = buildAuditFilePath({
        batchId,
        auditFile: options.auditFile,
        cwd,
      });

      writeAudit({
        auditFilePath,
        summary,
      });

      return {
        auditFilePath,
        summary,
      };
    },
  };
};

const runCli = async () => {
  const reprocessor = createDlqReprocessor();
  const result = await reprocessor.run(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
};

module.exports = {
  INTEGRATIONS,
  parseArgs,
  parseIsoToMs,
  resolveIntegrations,
  resolveQueueUrls,
  isWithinWindow,
  buildAuditFilePath,
  createDlqReprocessor,
  runCli,
};
