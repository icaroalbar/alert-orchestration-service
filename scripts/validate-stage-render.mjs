import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const run = (command) =>
  execSync(command, {
    encoding: 'utf8',
    env: process.env,
    stdio: 'pipe',
  });

const printCapturedOutput = (error) => {
  const stdout = error?.stdout ? String(error.stdout) : '';
  const stderr = error?.stderr ? String(error.stderr) : '';
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  return `${stdout}\n${stderr}`;
};

const staticFallback = () => {
  const serverless = readFileSync(new URL('../serverless.yml', import.meta.url), 'utf8');
  const checks = [
    "stage: ${opt:stage, 'dev'}",
    'prefix: ${self:service}-${self:provider.stage}',
    'region: ${self:custom.stages.${self:provider.stage}.region}',
    'logRetentionInDays: ${self:custom.stages.${self:provider.stage}.logRetentionInDays}',
    'lambda: ${self:custom.stages.${self:provider.stage}.tracing}',
    'SOURCES_TABLE_NAME: ${self:custom.stages.${self:provider.stage}.sourcesTableName}',
    'CURSORS_TABLE_NAME: ${self:custom.stages.${self:provider.stage}.cursorsTableName}',
    'CLIENT_EVENTS_TOPIC_ARN:',
    'name: ${self:custom.naming.prefix}-orchestration',
    'sourcesTableName: ${self:service}-dev-sources',
    'sourcesTableName: ${self:service}-stg-sources',
    'sourcesTableName: ${self:service}-prod-sources',
    'cursorsTableName: ${self:service}-dev-cursors',
    'cursorsTableName: ${self:service}-stg-cursors',
    'cursorsTableName: ${self:service}-prod-cursors',
    'clientEventsTopicName: ${self:service}-dev-client-events',
    'clientEventsTopicName: ${self:service}-stg-client-events',
    'clientEventsTopicName: ${self:service}-prod-client-events',
    'SourcesTable:',
    'CursorsTable:',
    'ClientEventsTopic:',
    'CollectorPublishPolicy:',
    'ClientEventsTopicArn:',
    'CollectorPublishPolicyArn:',
    'BillingMode: PAY_PER_REQUEST',
    'IndexName: active-nextRunAt-index',
    'AttributeName: expiresAt',
    'AttributeName: source',
    'SSEEnabled: true',
    'KmsMasterKeyId: alias/aws/sns',
    'ManagedPolicyName: ${self:custom.naming.prefix}-collector-sns-publish',
    'dev:',
    'stg:',
    'prod:',
  ];

  const missing = checks.filter((check) => !serverless.includes(check));
  if (missing.length > 0) {
    console.error('Falha no fallback estático de stage render:');
    for (const check of missing) {
      console.error(`- Ausente: ${check}`);
    }
    process.exit(1);
  }

  console.warn(
    '\nAviso: renderização multi-stage indisponível por rede. Fallback estático no serverless.yml concluído.',
  );
};

try {
  const output = run('npm run sls:print:all');
  if (output) process.stdout.write(output);
  process.exit(0);
} catch (error) {
  const output = printCapturedOutput(error);
  const networkIssue =
    output.includes('Unable to reach the Serverless API') ||
    output.includes('core.serverless.com') ||
    output.includes('EAI_AGAIN');

  if (!networkIssue) {
    process.exit(1);
  }

  staticFallback();
}
