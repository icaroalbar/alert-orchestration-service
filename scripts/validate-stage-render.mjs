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
    'SALESFORCE_INTEGRATION_QUEUE_URL:',
    'SALESFORCE_INTEGRATION_QUEUE_ARN:',
    'HUBSPOT_INTEGRATION_QUEUE_URL:',
    'HUBSPOT_INTEGRATION_QUEUE_ARN:',
    'SALESFORCE_INTEGRATION_DLQ_URL:',
    'SALESFORCE_INTEGRATION_DLQ_ARN:',
    'HUBSPOT_INTEGRATION_DLQ_URL:',
    'HUBSPOT_INTEGRATION_DLQ_ARN:',
    'schedulerFunctionName: ${self:custom.naming.prefix}-scheduler',
    'orchestrationScheduleRuleName: ${self:custom.naming.prefix}-orchestration-schedule',
    'schedulerRoleName: ${self:custom.naming.prefix}-scheduler-role',
    'stateMachineRoleName: ${self:custom.naming.prefix}-state-machine-role',
    'collectorRoleName: ${self:custom.naming.prefix}-collector-role',
    'salesforceConsumerRoleName: ${self:custom.naming.prefix}-salesforce-consumer-role',
    'hubspotConsumerRoleName: ${self:custom.naming.prefix}-hubspot-consumer-role',
    'name: ${self:custom.naming.prefix}-orchestration',
    'name: ${self:custom.naming.orchestrationScheduleRuleName}',
    'description: Disparo global da orquestracao principal via EventBridge.',
    'rate: ${self:custom.stages.${self:provider.stage}.orchestrationScheduleExpression}',
    'trigger: scheduled',
    'source: eventbridge',
    'name: ${self:custom.naming.schedulerFunctionName}',
    'MainStateMachineExecutionRole',
    'SchedulerExecutionRole',
    'CollectorExecutionRole',
    'SalesforceConsumerExecutionRole',
    'HubspotConsumerExecutionRole',
    'sourcesTableName: ${self:service}-dev-sources',
    'sourcesTableName: ${self:service}-stg-sources',
    'sourcesTableName: ${self:service}-prod-sources',
    'orchestrationScheduleExpression: cron(0/30 * * * ? *)',
    'orchestrationScheduleExpression: cron(0/15 * * * ? *)',
    'orchestrationScheduleExpression: cron(0/5 * * * ? *)',
    'cursorsTableName: ${self:service}-dev-cursors',
    'cursorsTableName: ${self:service}-stg-cursors',
    'cursorsTableName: ${self:service}-prod-cursors',
    'clientEventsTopicName: ${self:service}-dev-client-events',
    'clientEventsTopicName: ${self:service}-stg-client-events',
    'clientEventsTopicName: ${self:service}-prod-client-events',
    'salesforceQueueName: ${self:service}-dev-salesforce-events',
    'salesforceQueueName: ${self:service}-stg-salesforce-events',
    'salesforceQueueName: ${self:service}-prod-salesforce-events',
    'hubspotQueueName: ${self:service}-dev-hubspot-events',
    'hubspotQueueName: ${self:service}-stg-hubspot-events',
    'hubspotQueueName: ${self:service}-prod-hubspot-events',
    'integrationQueueMessageRetentionSeconds: 1209600',
    'salesforceDlqName: ${self:service}-dev-salesforce-events-dlq',
    'salesforceDlqName: ${self:service}-stg-salesforce-events-dlq',
    'salesforceDlqName: ${self:service}-prod-salesforce-events-dlq',
    'hubspotDlqName: ${self:service}-dev-hubspot-events-dlq',
    'hubspotDlqName: ${self:service}-stg-hubspot-events-dlq',
    'hubspotDlqName: ${self:service}-prod-hubspot-events-dlq',
    'integrationDlqMessageRetentionSeconds: 1209600',
    'salesforceQueueMaxReceiveCount: 5',
    'hubspotQueueMaxReceiveCount: 5',
    'SourcesTable:',
    'CursorsTable:',
    'ClientEventsTopic:',
    'CollectorPublishPolicy:',
    'SalesforceIntegrationQueue:',
    'HubspotIntegrationQueue:',
    'SalesforceIntegrationDlq:',
    'HubspotIntegrationDlq:',
    'IntegrationQueuesPolicy:',
    'SalesforceIntegrationSubscription:',
    'HubspotIntegrationSubscription:',
    'SchedulerExecutionRoleArn:',
    'MainStateMachineExecutionRoleArn:',
    'CollectorExecutionRoleArn:',
    'SalesforceConsumerExecutionRoleArn:',
    'HubspotConsumerExecutionRoleArn:',
    'ClientEventsTopicArn:',
    'CollectorPublishPolicyArn:',
    'SalesforceIntegrationQueueUrl:',
    'SalesforceIntegrationQueueArn:',
    'HubspotIntegrationQueueUrl:',
    'HubspotIntegrationQueueArn:',
    'SalesforceIntegrationDlqUrl:',
    'SalesforceIntegrationDlqArn:',
    'HubspotIntegrationDlqUrl:',
    'HubspotIntegrationDlqArn:',
    'SalesforceIntegrationSubscriptionArn:',
    'HubspotIntegrationSubscriptionArn:',
    'BillingMode: PAY_PER_REQUEST',
    'IndexName: active-nextRunAt-index',
    'AttributeName: expiresAt',
    'AttributeName: source',
    'SSEEnabled: true',
    'KmsMasterKeyId: alias/aws/sns',
    'ManagedPolicyName: ${self:custom.naming.prefix}-collector-sns-publish',
    'MessageRetentionPeriod: ${self:custom.stages.${self:provider.stage}.integrationQueueMessageRetentionSeconds}',
    'MessageRetentionPeriod: ${self:custom.stages.${self:provider.stage}.integrationDlqMessageRetentionSeconds}',
    'VisibilityTimeout: 60',
    'ReceiveMessageWaitTimeSeconds: 20',
    'RedrivePolicy:',
    'maxReceiveCount: ${self:custom.stages.${self:provider.stage}.salesforceQueueMaxReceiveCount}',
    'maxReceiveCount: ${self:custom.stages.${self:provider.stage}.hubspotQueueMaxReceiveCount}',
    'Type: AWS::SQS::QueuePolicy',
    'Type: AWS::SNS::Subscription',
    'Service: sns.amazonaws.com',
    '- sqs:SendMessage',
    'aws:SourceArn:',
    'Ref: ClientEventsTopic',
    'Protocol: sqs',
    'RawMessageDelivery: true',
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
