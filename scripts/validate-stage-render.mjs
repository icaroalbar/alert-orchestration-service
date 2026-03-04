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
  const stateMachineFile = new URL(
    '../state-machines/main-orchestration-v1.asl.json',
    import.meta.url,
  );
  const checks = [
    "stage: ${opt:stage, 'dev'}",
    'prefix: ${self:service}-${self:provider.stage}',
    'region: ${self:custom.stages.${self:provider.stage}.region}',
    'logRetentionInDays: ${self:custom.stages.${self:provider.stage}.logRetentionInDays}',
    'lambda: ${self:custom.stages.${self:provider.stage}.tracing}',
    'httpApi:',
    'authorizers:',
    'sourceRegistryJwtAuthorizer:',
    'type: jwt',
    'identitySource: $request.header.Authorization',
    'issuerUrl: ${self:custom.stages.${self:provider.stage}.sourceRegistryJwtIssuerUrl}',
    'sourceRegistryReadScope: sources:read',
    'sourceRegistryWriteScope: sources:write',
    "sourceRegistryJwtIssuerUrl: ${env:SOURCE_REGISTRY_JWT_ISSUER_URL_DEV, 'https://auth.dev.alert-orchestration.internal'}",
    "sourceRegistryJwtIssuerUrl: ${env:SOURCE_REGISTRY_JWT_ISSUER_URL_STG, 'https://auth.stg.alert-orchestration.internal'}",
    "sourceRegistryJwtIssuerUrl: ${env:SOURCE_REGISTRY_JWT_ISSUER_URL_PROD, 'https://auth.alert-orchestration.internal'}",
    "sourceRegistryJwtAudience: ${env:SOURCE_REGISTRY_JWT_AUDIENCE_DEV, 'alert-orchestration-service-dev-source-registry-api'}",
    "sourceRegistryJwtAudience: ${env:SOURCE_REGISTRY_JWT_AUDIENCE_STG, 'alert-orchestration-service-stg-source-registry-api'}",
    "sourceRegistryJwtAudience: ${env:SOURCE_REGISTRY_JWT_AUDIENCE_PROD, 'alert-orchestration-service-prod-source-registry-api'}",
    'SOURCES_TABLE_NAME: ${self:custom.stages.${self:provider.stage}.sourcesTableName}',
    'CURSORS_TABLE_NAME: ${self:custom.stages.${self:provider.stage}.cursorsTableName}',
    'MAP_MAX_CONCURRENCY: ${self:custom.stages.${self:provider.stage}.mapMaxConcurrency}',
    'CLIENT_EVENTS_TOPIC_ARN:',
    'SALESFORCE_INTEGRATION_QUEUE_URL:',
    'SALESFORCE_INTEGRATION_QUEUE_ARN:',
    'HUBSPOT_INTEGRATION_QUEUE_URL:',
    'HUBSPOT_INTEGRATION_QUEUE_ARN:',
    'SALESFORCE_INTEGRATION_DLQ_URL:',
    'SALESFORCE_INTEGRATION_DLQ_ARN:',
    'HUBSPOT_INTEGRATION_DLQ_URL:',
    'HUBSPOT_INTEGRATION_DLQ_ARN:',
    "INTEGRATION_TARGETS: ${env:INTEGRATION_TARGETS, 'salesforce|hubspot'}",
    'schedulerFunctionName: ${self:custom.naming.prefix}-scheduler',
    'orchestrationStateMachineName: ${self:custom.naming.prefix}-orchestration',
    'orchestrationScheduleRuleName: ${self:custom.naming.prefix}-orchestration-schedule',
    'orchestrationLogGroupName: /aws/vendedlogs/states/${self:custom.naming.orchestrationStateMachineName}',
    'orchestrationDashboardName: ${self:custom.naming.prefix}-orchestration-observability',
    'schedulerRoleName: ${self:custom.naming.prefix}-scheduler-role',
    'stateMachineRoleName: ${self:custom.naming.prefix}-state-machine-role',
    'collectorRoleName: ${self:custom.naming.prefix}-collector-role',
    'salesforceConsumerRoleName: ${self:custom.naming.prefix}-salesforce-consumer-role',
    'hubspotConsumerRoleName: ${self:custom.naming.prefix}-hubspot-consumer-role',
    'name: ${self:custom.naming.orchestrationStateMachineName}',
    'name: ${self:custom.naming.orchestrationScheduleRuleName}',
    'tracingConfig:',
    'enabled: ${self:custom.stages.${self:provider.stage}.tracing}',
    'loggingConfig:',
    'level: ALL',
    'includeExecutionData: true',
    'Fn::Sub: ${MainOrchestrationStateMachineLogGroup.Arn}:*',
    'definition: ${file(./state-machines/main-orchestration-v1.asl.json)}',
    'description: Disparo global da orquestracao principal via EventBridge.',
    'rate: ${self:custom.stages.${self:provider.stage}.orchestrationScheduleExpression}',
    'trigger: scheduled',
    'source: eventbridge',
    'Service: states.amazonaws.com',
    'Sid: InvokeSchedulerLambda',
    'Sid: InvokeCollectorLambda',
    'name: ${self:custom.naming.schedulerFunctionName}',
    'handler: dist/handlers/collector.handler',
    'handler: dist/handlers/salesforce-consumer.handler',
    'handler: dist/handlers/hubspot-consumer.handler',
    'functionResponseType: ReportBatchItemFailures',
    'MainStateMachineExecutionRole',
    'SchedulerExecutionRole',
    'CollectorExecutionRole',
    'MainOrchestrationStateMachineLogGroup:',
    'LogGroupName: ${self:custom.naming.orchestrationLogGroupName}',
    'Sid: DeliverStepFunctionsExecutionLogs',
    'logs:CreateLogDelivery',
    'logs:GetLogDelivery',
    'logs:UpdateLogDelivery',
    'logs:DeleteLogDelivery',
    'logs:ListLogDeliveries',
    'logs:PutResourcePolicy',
    'logs:DescribeResourcePolicies',
    'logs:DescribeLogGroups',
    'Sid: PublishOrchestrationMetrics',
    'cloudwatch:PutMetricData',
    'cloudwatch:namespace: AlertOrchestrationService/Orchestration',
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
    'dlqAlarmTopicName: ${self:service}-dev-dlq-alarms',
    'dlqAlarmTopicName: ${self:service}-stg-dlq-alarms',
    'dlqAlarmTopicName: ${self:service}-prod-dlq-alarms',
    'salesforceDlqAlarmThreshold: 1',
    'salesforceDlqAlarmThreshold: 5',
    'hubspotDlqAlarmThreshold: 1',
    'hubspotDlqAlarmThreshold: 5',
    'dlqAlarmPeriodSeconds: 60',
    'dlqAlarmEvaluationPeriods: 1',
    'salesforceQueueMaxReceiveCount: 5',
    'hubspotQueueMaxReceiveCount: 5',
    'mapMaxConcurrency: 2',
    'mapMaxConcurrency: 5',
    'mapMaxConcurrency: 10',
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
    'DlqAlarmTopic:',
    'SalesforceIntegrationDlqVisibleMessagesAlarm:',
    'HubspotIntegrationDlqVisibleMessagesAlarm:',
    'Type: AWS::CloudWatch::Alarm',
    'Namespace: AWS/SQS',
    'MetricName: ApproximateNumberOfMessagesVisible',
    'AlarmActions:',
    'OKActions:',
    'MainOrchestrationObservabilityDashboard:',
    'Type: AWS::CloudWatch::Dashboard',
    'DashboardName: ${self:custom.naming.orchestrationDashboardName}',
    'ExecutionTime',
    'AlertOrchestrationService/Orchestration',
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
    'DlqAlarmTopicArn:',
    'SalesforceIntegrationDlqVisibleMessagesAlarmName:',
    'SalesforceIntegrationDlqVisibleMessagesAlarmArn:',
    'HubspotIntegrationDlqVisibleMessagesAlarmName:',
    'HubspotIntegrationDlqVisibleMessagesAlarmArn:',
    'MainOrchestrationStateMachineLogGroupName:',
    'MainOrchestrationObservabilityDashboardName:',
    'MainStateMachineName:',
    'MainStateMachineArn:',
    'Name: ${self:custom.naming.prefix}-main-state-machine-name',
    'Name: ${self:custom.naming.prefix}-main-state-machine-arn',
    'stateMachine:${self:custom.naming.orchestrationStateMachineName}',
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
    'deadLetterTargetArn:',
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

  const sourceRegistryProtectedRouteSnippets = [
    `- httpApi:
          method: post
          path: /sources
          authorizer:
            name: sourceRegistryJwtAuthorizer
            scopes:
              - \${self:custom.auth.sourceRegistryWriteScope}`,
    `- httpApi:
          method: patch
          path: /sources/{id}
          authorizer:
            name: sourceRegistryJwtAuthorizer
            scopes:
              - \${self:custom.auth.sourceRegistryWriteScope}`,
    `- httpApi:
          method: delete
          path: /sources/{id}
          authorizer:
            name: sourceRegistryJwtAuthorizer
            scopes:
              - \${self:custom.auth.sourceRegistryWriteScope}`,
    `- httpApi:
          method: get
          path: /sources
          authorizer:
            name: sourceRegistryJwtAuthorizer
            scopes:
              - \${self:custom.auth.sourceRegistryReadScope}`,
  ];

  const missing = checks.filter((check) => !serverless.includes(check));
  if (missing.length > 0) {
    console.error('Falha no fallback estático de stage render:');
    for (const check of missing) {
      console.error(`- Ausente: ${check}`);
    }
    process.exit(1);
  }

  const missingProtectedRoutes = sourceRegistryProtectedRouteSnippets.filter(
    (snippet) => !serverless.includes(snippet),
  );
  if (missingProtectedRoutes.length > 0) {
    console.error('Falha no fallback estático de stage render: rotas /sources sem auth esperada.');
    for (const snippet of missingProtectedRoutes) {
      const firstLine = snippet.split('\n')[0] ?? snippet;
      console.error(`- Snippet ausente: ${firstLine.trim()}`);
    }
    process.exit(1);
  }

  let definition;
  try {
    definition = JSON.parse(readFileSync(stateMachineFile, 'utf8'));
  } catch (error) {
    console.error('Falha no fallback estático: arquivo ASL inválido.');
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  const states = definition?.States ?? {};
  const hasExpectedRetryPolicy = (retryBlock, expectedErrors, intervalSeconds, maxAttempts) =>
    Array.isArray(retryBlock) &&
    retryBlock.some((entry) => {
      const errors = Array.isArray(entry?.ErrorEquals) ? entry.ErrorEquals : [];
      return (
        JSON.stringify(errors) === JSON.stringify(expectedErrors) &&
        entry?.IntervalSeconds === intervalSeconds &&
        entry?.MaxAttempts === maxAttempts &&
        entry?.BackoffRate === 2
      );
    });

  const requiredStates = [
    'NormalizeInput',
    'Scheduler',
    'ProcessEligibleSources',
    'BuildExecutionOutput',
    'PublishExecutionSuccessMetric',
    'PublishExecutionFailureMetric',
    'Done',
  ];
  const missingStates = requiredStates.filter((stateName) => !(stateName in states));
  if (definition?.StartAt !== 'NormalizeInput' || missingStates.length > 0) {
    console.error('Falha no fallback estático: definição ASL principal incompleta.');
    if (definition?.StartAt !== 'NormalizeInput') {
      console.error('- StartAt deve ser NormalizeInput');
    }
    for (const stateName of missingStates) {
      console.error(`- Estado ausente: ${stateName}`);
    }
    process.exit(1);
  }

  const normalizeSchedulerOutput = states.NormalizeSchedulerOutput ?? {};
  const schedulerParams = normalizeSchedulerOutput.Parameters?.scheduler ?? {};
  if (schedulerParams['maxConcurrency.$'] !== '$.schedulerResult.maxConcurrency') {
    console.error('Falha no fallback estático: NormalizeSchedulerOutput sem maxConcurrency.');
    process.exit(1);
  }

  const processEligibleSources = states.ProcessEligibleSources ?? {};
  if (processEligibleSources.MaxConcurrencyPath !== '$.scheduler.maxConcurrency') {
    console.error('Falha no fallback estático: Map sem MaxConcurrencyPath esperado.');
    process.exit(1);
  }

  const buildExecutionOutput = states.BuildExecutionOutput ?? {};
  const summaryParams = buildExecutionOutput.Parameters?.summary ?? {};
  if (summaryParams['maxConcurrency.$'] !== '$.scheduler.maxConcurrency') {
    console.error('Falha no fallback estático: summary sem maxConcurrency.');
    process.exit(1);
  }
  if (buildExecutionOutput.Next !== 'PublishExecutionSuccessMetric') {
    console.error(
      'Falha no fallback estático: BuildExecutionOutput deve encadear PublishExecutionSuccessMetric.',
    );
    process.exit(1);
  }

  const buildSchedulerFailureOutput = states.BuildSchedulerFailureOutput ?? {};
  if (buildSchedulerFailureOutput.Next !== 'PublishExecutionFailureMetric') {
    console.error(
      'Falha no fallback estático: BuildSchedulerFailureOutput deve encadear PublishExecutionFailureMetric.',
    );
    process.exit(1);
  }

  const hasPutMetricDataResource = (state) =>
    state?.Type === 'Task' &&
    state?.Resource === 'arn:aws:states:::aws-sdk:cloudwatch:putMetricData';
  if (
    !hasPutMetricDataResource(states.PublishExecutionSuccessMetric) ||
    !hasPutMetricDataResource(states.PublishExecutionFailureMetric)
  ) {
    console.error('Falha no fallback estático: tasks de métrica de execução ausentes no ASL.');
    process.exit(1);
  }

  const schedulerRetry = states.Scheduler?.Retry;
  const hasSchedulerLambdaRetry = hasExpectedRetryPolicy(
    schedulerRetry,
    [
      'Lambda.ServiceException',
      'Lambda.AWSLambdaException',
      'Lambda.SdkClientException',
      'Lambda.TooManyRequestsException',
    ],
    2,
    3,
  );
  const hasSchedulerTimeoutRetry = hasExpectedRetryPolicy(schedulerRetry, ['States.Timeout'], 5, 2);
  if (!hasSchedulerLambdaRetry || !hasSchedulerTimeoutRetry) {
    console.error('Falha no fallback estático: Scheduler sem política de retry/backoff esperada.');
    process.exit(1);
  }

  const invokeCollectorRetry =
    states.ProcessEligibleSources?.Iterator?.States?.InvokeCollector?.Retry;
  const hasCollectorLambdaRetry = hasExpectedRetryPolicy(
    invokeCollectorRetry,
    [
      'Lambda.ServiceException',
      'Lambda.AWSLambdaException',
      'Lambda.SdkClientException',
      'Lambda.TooManyRequestsException',
    ],
    2,
    3,
  );
  const hasCollectorTimeoutRetry = hasExpectedRetryPolicy(
    invokeCollectorRetry,
    ['States.Timeout'],
    5,
    2,
  );
  if (!hasCollectorLambdaRetry || !hasCollectorTimeoutRetry) {
    console.error(
      'Falha no fallback estático: InvokeCollector sem política de retry/backoff esperada.',
    );
    process.exit(1);
  }

  const invokeCollectorCatch =
    states.ProcessEligibleSources?.Iterator?.States?.InvokeCollector?.Catch;
  const hasCollectorCatch =
    Array.isArray(invokeCollectorCatch) &&
    invokeCollectorCatch.some(
      (entry) =>
        JSON.stringify(entry?.ErrorEquals ?? []) === JSON.stringify(['States.ALL']) &&
        entry?.ResultPath === '$.collectorError' &&
        entry?.Next === 'BuildItemFailureResult',
    );
  if (!hasCollectorCatch) {
    console.error('Falha no fallback estático: InvokeCollector sem Catch por item esperado.');
    process.exit(1);
  }

  const buildItemFailureResult =
    states.ProcessEligibleSources?.Iterator?.States?.BuildItemFailureResult ?? {};
  const publishItemSuccessMetric =
    states.ProcessEligibleSources?.Iterator?.States?.PublishItemSuccessMetric ?? {};
  const publishItemFailureMetric =
    states.ProcessEligibleSources?.Iterator?.States?.PublishItemFailureMetric ?? {};
  if (
    !hasPutMetricDataResource(publishItemSuccessMetric) ||
    !hasPutMetricDataResource(publishItemFailureMetric)
  ) {
    console.error('Falha no fallback estático: tasks de métrica por item ausentes no Map.');
    process.exit(1);
  }

  if (
    buildItemFailureResult?.Type !== 'Pass' ||
    buildItemFailureResult?.Parameters?.result?.status !== 'FAILED' ||
    buildItemFailureResult?.Parameters?.result?.['error.$'] !== '$.collectorError.Error' ||
    buildItemFailureResult?.Parameters?.result?.['cause.$'] !== '$.collectorError.Cause'
  ) {
    console.error(
      'Falha no fallback estático: BuildItemFailureResult sem contrato esperado de erro.',
    );
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
