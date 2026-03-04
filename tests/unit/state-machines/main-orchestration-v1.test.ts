import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from '@jest/globals';

type JsonObject = Record<string, unknown>;

const asObject = (value: unknown): JsonObject => {
  expect(value).toBeDefined();
  expect(value).toBeTruthy();
  expect(typeof value).toBe('object');
  return value as JsonObject;
};

const loadDefinition = (): JsonObject => {
  const filePath = resolve(process.cwd(), 'state-machines/main-orchestration-v1.asl.json');
  return JSON.parse(readFileSync(filePath, 'utf8')) as JsonObject;
};

const asArray = (value: unknown): unknown[] => {
  expect(Array.isArray(value)).toBe(true);
  return value as unknown[];
};

const readJsonPath = (input: JsonObject, path: string): unknown => {
  expect(path.startsWith('$.')).toBe(true);

  const segments = path.slice(2).split('.');
  let current: unknown = input;

  for (const segment of segments) {
    expect(current).toBeDefined();
    expect(current).not.toBeNull();
    expect(typeof current).toBe('object');
    current = (current as JsonObject)[segment];
  }

  return current;
};

const evaluateExpression = (expression: string, input: JsonObject): unknown => {
  const arrayLengthExpression = /^States\.ArrayLength\((\$\.[^)]+)\)$/.exec(expression);
  if (arrayLengthExpression) {
    const list = asArray(readJsonPath(input, arrayLengthExpression[1]));
    return list.length;
  }

  return readJsonPath(input, expression);
};

const materializeParameters = (template: unknown, input: JsonObject): unknown => {
  if (Array.isArray(template)) {
    return template.map((entry) => materializeParameters(entry, input));
  }

  if (template && typeof template === 'object') {
    const output: JsonObject = {};

    for (const [key, value] of Object.entries(template)) {
      if (key.endsWith('.$')) {
        expect(typeof value).toBe('string');
        output[key.slice(0, -2)] = evaluateExpression(value as string, input);
        continue;
      }

      output[key] = materializeParameters(value, input);
    }

    return output;
  }

  return template;
};

describe('main-orchestration-v1.asl.json', () => {
  it('define fluxo principal com contratos explícitos por estado', () => {
    const definition = loadDefinition();
    expect(definition.Comment).toBe('Orquestrador principal v1 da plataforma de ingestao.');
    expect(definition.StartAt).toBe('NormalizeInput');

    const states = asObject(definition.States);
    const normalizeInput = asObject(states.NormalizeInput);
    const scheduler = asObject(states.Scheduler);
    const processEligibleSources = asObject(states.ProcessEligibleSources);
    const buildExecutionOutput = asObject(states.BuildExecutionOutput);
    const publishExecutionSuccessMetric = asObject(states.PublishExecutionSuccessMetric);
    const buildSchedulerFailureOutput = asObject(states.BuildSchedulerFailureOutput);
    const publishExecutionFailureMetric = asObject(states.PublishExecutionFailureMetric);
    const schedulerFailed = asObject(states.SchedulerFailed);
    const done = asObject(states.Done);

    expect(normalizeInput.Type).toBe('Pass');
    expect(normalizeInput.ResultPath).toBe('$');
    expect(normalizeInput.Next).toBe('Scheduler');
    const normalizeParameters = asObject(normalizeInput.Parameters);
    const meta = asObject(normalizeParameters.meta);
    const schedulerInput = asObject(normalizeParameters.schedulerInput);
    expect(meta['executionId.$']).toBe('$$.Execution.Id');
    expect(meta['stateMachineId.$']).toBe('$$.StateMachine.Id');
    expect(meta['startedAt.$']).toBe('$$.Execution.StartTime');
    expect(meta['trigger.$']).toBe('$.trigger');
    expect(meta['source.$']).toBe('$.source');
    expect(meta['stage.$']).toBe('$.stage');
    expect(meta['service.$']).toBe('$.service');
    expect(schedulerInput['now.$']).toBe('$.now');

    expect(scheduler.Type).toBe('Task');
    expect(scheduler.ResultPath).toBe('$.schedulerResult');
    expect(scheduler.Next).toBe('ProcessEligibleSources');
    const schedulerParameters = asObject(scheduler.Parameters);
    expect(schedulerParameters['now.$']).toBe('$.schedulerInput.now');
    const schedulerRetry = scheduler.Retry as unknown[];
    expect(Array.isArray(schedulerRetry)).toBe(true);
    expect(schedulerRetry).toHaveLength(2);
    const schedulerLambdaRetry = asObject(schedulerRetry[0]);
    expect(schedulerLambdaRetry.ErrorEquals).toEqual([
      'Lambda.ServiceException',
      'Lambda.AWSLambdaException',
      'Lambda.SdkClientException',
      'Lambda.TooManyRequestsException',
    ]);
    expect(schedulerLambdaRetry.IntervalSeconds).toBe(2);
    expect(schedulerLambdaRetry.MaxAttempts).toBe(3);
    expect(schedulerLambdaRetry.BackoffRate).toBe(2);
    const schedulerTimeoutRetry = asObject(schedulerRetry[1]);
    expect(schedulerTimeoutRetry.ErrorEquals).toEqual(['States.Timeout']);
    expect(schedulerTimeoutRetry.IntervalSeconds).toBe(5);
    expect(schedulerTimeoutRetry.MaxAttempts).toBe(2);
    expect(schedulerTimeoutRetry.BackoffRate).toBe(2);
    const schedulerResource = asObject(scheduler.Resource);
    expect(schedulerResource['Fn::GetAtt']).toEqual(['SchedulerLambdaFunction', 'Arn']);
    const schedulerCatch = scheduler.Catch as unknown[];
    expect(Array.isArray(schedulerCatch)).toBe(true);
    expect(schedulerCatch).toHaveLength(1);
    const schedulerCatchEntry = asObject(schedulerCatch[0]);
    expect(schedulerCatchEntry.ErrorEquals).toEqual(['States.ALL']);
    expect(schedulerCatchEntry.ResultPath).toBe('$.schedulerError');
    expect(schedulerCatchEntry.Next).toBe('BuildSchedulerFailureOutput');

    expect(processEligibleSources.Type).toBe('Map');
    expect(processEligibleSources.ItemsPath).toBe('$.schedulerResult.sources');
    expect(processEligibleSources.MaxConcurrencyPath).toBe('$.schedulerResult.maxConcurrency');
    expect(processEligibleSources.ResultPath).toBe('$.collectorResults');
    expect(processEligibleSources.Next).toBe('BuildExecutionOutput');
    const processEligibleSourcesParameters = asObject(processEligibleSources.Parameters);
    expect(processEligibleSourcesParameters['sourceId.$']).toBe('$$.Map.Item.Value.sourceId');
    expect(processEligibleSourcesParameters['tenantId.$']).toBe('$$.Map.Item.Value.tenantId');
    expect(processEligibleSourcesParameters['meta.$']).toBe('$.meta');
    const iterator = asObject(processEligibleSources.Iterator);
    expect(iterator.StartAt).toBe('InvokeCollector');
    const iteratorStates = asObject(iterator.States);
    const invokeCollector = asObject(iteratorStates.InvokeCollector);
    const buildItemSuccessResult = asObject(iteratorStates.BuildItemSuccessResult);
    const publishItemSuccessMetric = asObject(iteratorStates.PublishItemSuccessMetric);
    const returnItemSuccessResult = asObject(iteratorStates.ReturnItemSuccessResult);
    const buildItemFailureResult = asObject(iteratorStates.BuildItemFailureResult);
    const publishItemFailureMetric = asObject(iteratorStates.PublishItemFailureMetric);
    const returnItemFailureResult = asObject(iteratorStates.ReturnItemFailureResult);

    expect(invokeCollector.Type).toBe('Task');
    expect(invokeCollector.ResultPath).toBe('$.collectorResult');
    expect(invokeCollector.Next).toBe('BuildItemSuccessResult');
    const invokeCollectorResource = asObject(invokeCollector.Resource);
    expect(invokeCollectorResource['Fn::GetAtt']).toEqual(['CollectorLambdaFunction', 'Arn']);
    const invokeCollectorParameters = asObject(invokeCollector.Parameters);
    expect(invokeCollectorParameters['sourceId.$']).toBe('$.sourceId');
    expect(invokeCollectorParameters['tenantId.$']).toBe('$.tenantId');
    expect(invokeCollectorParameters['meta.$']).toBe('$.meta');
    const invokeCollectorRetry = invokeCollector.Retry as unknown[];
    expect(Array.isArray(invokeCollectorRetry)).toBe(true);
    expect(invokeCollectorRetry).toHaveLength(2);
    const collectorLambdaRetry = asObject(invokeCollectorRetry[0]);
    expect(collectorLambdaRetry.ErrorEquals).toEqual([
      'Lambda.ServiceException',
      'Lambda.AWSLambdaException',
      'Lambda.SdkClientException',
      'Lambda.TooManyRequestsException',
    ]);
    expect(collectorLambdaRetry.IntervalSeconds).toBe(2);
    expect(collectorLambdaRetry.MaxAttempts).toBe(3);
    expect(collectorLambdaRetry.BackoffRate).toBe(2);
    const collectorTimeoutRetry = asObject(invokeCollectorRetry[1]);
    expect(collectorTimeoutRetry.ErrorEquals).toEqual(['States.Timeout']);
    expect(collectorTimeoutRetry.IntervalSeconds).toBe(5);
    expect(collectorTimeoutRetry.MaxAttempts).toBe(2);
    expect(collectorTimeoutRetry.BackoffRate).toBe(2);
    const invokeCollectorCatch = invokeCollector.Catch as unknown[];
    expect(Array.isArray(invokeCollectorCatch)).toBe(true);
    expect(invokeCollectorCatch).toHaveLength(1);
    const collectorCatchEntry = asObject(invokeCollectorCatch[0]);
    expect(collectorCatchEntry.ErrorEquals).toEqual(['States.ALL']);
    expect(collectorCatchEntry.ResultPath).toBe('$.collectorError');
    expect(collectorCatchEntry.Next).toBe('BuildItemFailureResult');

    expect(buildItemSuccessResult.Type).toBe('Pass');
    expect(buildItemSuccessResult.Next).toBe('PublishItemSuccessMetric');
    const buildItemSuccessParameters = asObject(buildItemSuccessResult.Parameters);
    const buildItemSuccessPayload = asObject(buildItemSuccessParameters.result);
    expect(buildItemSuccessPayload['sourceId.$']).toBe('$.sourceId');
    expect(buildItemSuccessPayload['tenantId.$']).toBe('$.tenantId');
    expect(buildItemSuccessPayload.status).toBe('SUCCEEDED');
    expect(buildItemSuccessPayload['processedAt.$']).toBe('$.collectorResult.processedAt');
    expect(buildItemSuccessPayload['recordsSent.$']).toBe('$.collectorResult.recordsSent');
    const buildItemSuccessMetric = asObject(buildItemSuccessParameters.metric);
    expect(buildItemSuccessMetric['stage.$']).toBe('$.meta.stage');
    expect(buildItemSuccessMetric['executionId.$']).toBe('$.meta.executionId');
    expect(buildItemSuccessMetric['sourceId.$']).toBe('$.sourceId');

    expect(publishItemSuccessMetric.Type).toBe('Task');
    expect(publishItemSuccessMetric.Resource).toBe(
      'arn:aws:states:::aws-sdk:cloudwatch:putMetricData',
    );
    expect(publishItemSuccessMetric.Next).toBe('ReturnItemSuccessResult');
    const publishItemSuccessParams = asObject(publishItemSuccessMetric.Parameters);
    expect(publishItemSuccessParams.Namespace).toBe('AlertOrchestrationService/Orchestration');
    const publishItemSuccessMetricData = asArray(publishItemSuccessParams.MetricData);
    expect(publishItemSuccessMetricData).toHaveLength(2);
    const publishItemSuccessCatch = asArray(publishItemSuccessMetric.Catch);
    expect(publishItemSuccessCatch).toHaveLength(1);
    const publishItemSuccessCatchEntry = asObject(publishItemSuccessCatch[0]);
    expect(publishItemSuccessCatchEntry.ErrorEquals).toEqual(['States.ALL']);
    expect(publishItemSuccessCatchEntry.ResultPath).toBe('$.metricPublishError');
    expect(publishItemSuccessCatchEntry.Next).toBe('ReturnItemSuccessResult');

    expect(returnItemSuccessResult.Type).toBe('Pass');
    expect(returnItemSuccessResult.End).toBe(true);
    const returnItemSuccessParameters = asObject(returnItemSuccessResult.Parameters);
    expect(returnItemSuccessParameters['sourceId.$']).toBe('$.result.sourceId');
    expect(returnItemSuccessParameters['tenantId.$']).toBe('$.result.tenantId');
    expect(returnItemSuccessParameters['status.$']).toBe('$.result.status');
    expect(returnItemSuccessParameters['processedAt.$']).toBe('$.result.processedAt');
    expect(returnItemSuccessParameters['recordsSent.$']).toBe('$.result.recordsSent');

    expect(buildItemFailureResult.Type).toBe('Pass');
    expect(buildItemFailureResult.Next).toBe('PublishItemFailureMetric');
    const buildItemFailureParameters = asObject(buildItemFailureResult.Parameters);
    const buildItemFailurePayload = asObject(buildItemFailureParameters.result);
    expect(buildItemFailurePayload['sourceId.$']).toBe('$.sourceId');
    expect(buildItemFailurePayload['tenantId.$']).toBe('$.tenantId');
    expect(buildItemFailurePayload.status).toBe('FAILED');
    expect(buildItemFailurePayload['error.$']).toBe('$.collectorError.Error');
    expect(buildItemFailurePayload['cause.$']).toBe('$.collectorError.Cause');
    const buildItemFailureMetric = asObject(buildItemFailureParameters.metric);
    expect(buildItemFailureMetric['stage.$']).toBe('$.meta.stage');
    expect(buildItemFailureMetric['executionId.$']).toBe('$.meta.executionId');
    expect(buildItemFailureMetric['sourceId.$']).toBe('$.sourceId');

    expect(publishItemFailureMetric.Type).toBe('Task');
    expect(publishItemFailureMetric.Resource).toBe(
      'arn:aws:states:::aws-sdk:cloudwatch:putMetricData',
    );
    expect(publishItemFailureMetric.Next).toBe('ReturnItemFailureResult');
    const publishItemFailureParams = asObject(publishItemFailureMetric.Parameters);
    expect(publishItemFailureParams.Namespace).toBe('AlertOrchestrationService/Orchestration');
    const publishItemFailureMetricData = asArray(publishItemFailureParams.MetricData);
    expect(publishItemFailureMetricData).toHaveLength(2);
    const publishItemFailureCatch = asArray(publishItemFailureMetric.Catch);
    expect(publishItemFailureCatch).toHaveLength(1);
    const publishItemFailureCatchEntry = asObject(publishItemFailureCatch[0]);
    expect(publishItemFailureCatchEntry.ErrorEquals).toEqual(['States.ALL']);
    expect(publishItemFailureCatchEntry.ResultPath).toBe('$.metricPublishError');
    expect(publishItemFailureCatchEntry.Next).toBe('ReturnItemFailureResult');

    expect(returnItemFailureResult.Type).toBe('Pass');
    expect(returnItemFailureResult.End).toBe(true);
    const returnItemFailureParameters = asObject(returnItemFailureResult.Parameters);
    expect(returnItemFailureParameters['sourceId.$']).toBe('$.result.sourceId');
    expect(returnItemFailureParameters['tenantId.$']).toBe('$.result.tenantId');
    expect(returnItemFailureParameters['status.$']).toBe('$.result.status');
    expect(returnItemFailureParameters['error.$']).toBe('$.result.error');
    expect(returnItemFailureParameters['cause.$']).toBe('$.result.cause');

    expect(buildExecutionOutput.Type).toBe('Pass');
    expect(buildExecutionOutput.ResultPath).toBe('$');
    expect(buildExecutionOutput.Next).toBe('PublishExecutionSuccessMetric');
    const outputParameters = asObject(buildExecutionOutput.Parameters);
    expect(outputParameters['meta.$']).toBe('$.meta');
    expect(outputParameters['sources.$']).toBe('$.schedulerResult.sources');
    expect(outputParameters['results.$']).toBe('$.collectorResults');
    const schedulerOutput = asObject(outputParameters.scheduler);
    expect(schedulerOutput['contractVersion.$']).toBe('$.schedulerResult.contractVersion');
    expect(schedulerOutput['referenceNow.$']).toBe('$.schedulerResult.referenceNow');
    expect(schedulerOutput['hasEligibleSources.$']).toBe('$.schedulerResult.hasEligibleSources');
    const summary = asObject(outputParameters.summary);
    expect(summary['processedSources.$']).toBe('States.ArrayLength($.collectorResults)');
    expect(summary['eligibleSources.$']).toBe('$.schedulerResult.eligibleSources');
    expect(summary['generatedAt.$']).toBe('$.schedulerResult.generatedAt');
    expect(summary['maxConcurrency.$']).toBe('$.schedulerResult.maxConcurrency');
    expect(summary.schedulerStatus).toBe('SUCCEEDED');

    expect(publishExecutionSuccessMetric.Type).toBe('Task');
    expect(publishExecutionSuccessMetric.Resource).toBe(
      'arn:aws:states:::aws-sdk:cloudwatch:putMetricData',
    );
    expect(publishExecutionSuccessMetric.Next).toBe('Done');
    const publishExecutionSuccessParams = asObject(publishExecutionSuccessMetric.Parameters);
    expect(publishExecutionSuccessParams.Namespace).toBe('AlertOrchestrationService/Orchestration');
    const publishExecutionSuccessMetricData = asArray(publishExecutionSuccessParams.MetricData);
    expect(publishExecutionSuccessMetricData).toHaveLength(4);
    const publishExecutionSuccessCatch = asArray(publishExecutionSuccessMetric.Catch);
    expect(publishExecutionSuccessCatch).toHaveLength(1);
    const publishExecutionSuccessCatchEntry = asObject(publishExecutionSuccessCatch[0]);
    expect(publishExecutionSuccessCatchEntry.ErrorEquals).toEqual(['States.ALL']);
    expect(publishExecutionSuccessCatchEntry.ResultPath).toBe('$.metricPublishError');
    expect(publishExecutionSuccessCatchEntry.Next).toBe('Done');

    expect(buildSchedulerFailureOutput.Type).toBe('Pass');
    expect(buildSchedulerFailureOutput.ResultPath).toBe('$');
    expect(buildSchedulerFailureOutput.Next).toBe('PublishExecutionFailureMetric');
    const buildSchedulerFailureParameters = asObject(buildSchedulerFailureOutput.Parameters);
    expect(buildSchedulerFailureParameters['meta.$']).toBe('$.meta');
    expect(buildSchedulerFailureParameters.sources).toEqual([]);
    expect(buildSchedulerFailureParameters.results).toEqual([]);
    const failureSummary = asObject(buildSchedulerFailureParameters.summary);
    expect(failureSummary.processedSources).toBe(0);
    expect(failureSummary.eligibleSources).toBe(0);
    expect(failureSummary.schedulerStatus).toBe('FAILED');
    expect(failureSummary['error.$']).toBe('$.schedulerError.Error');
    expect(failureSummary['cause.$']).toBe('$.schedulerError.Cause');

    expect(publishExecutionFailureMetric.Type).toBe('Task');
    expect(publishExecutionFailureMetric.Resource).toBe(
      'arn:aws:states:::aws-sdk:cloudwatch:putMetricData',
    );
    expect(publishExecutionFailureMetric.Next).toBe('SchedulerFailed');
    const publishExecutionFailureParams = asObject(publishExecutionFailureMetric.Parameters);
    expect(publishExecutionFailureParams.Namespace).toBe('AlertOrchestrationService/Orchestration');
    const publishExecutionFailureMetricData = asArray(publishExecutionFailureParams.MetricData);
    expect(publishExecutionFailureMetricData).toHaveLength(2);
    const publishExecutionFailureCatch = asArray(publishExecutionFailureMetric.Catch);
    expect(publishExecutionFailureCatch).toHaveLength(1);
    const publishExecutionFailureCatchEntry = asObject(publishExecutionFailureCatch[0]);
    expect(publishExecutionFailureCatchEntry.ErrorEquals).toEqual(['States.ALL']);
    expect(publishExecutionFailureCatchEntry.ResultPath).toBe('$.metricPublishError');
    expect(publishExecutionFailureCatchEntry.Next).toBe('SchedulerFailed');

    expect(schedulerFailed.Type).toBe('Fail');
    expect(schedulerFailed.Error).toBe('SchedulerStepFailed');
    expect(schedulerFailed.Cause).toBe('Scheduler task failed before Map state execution.');

    expect(done.Type).toBe('Succeed');
  });

  it('preserva sucesso parcial ao materializar resultado final com falha em subset de fontes', () => {
    const definition = loadDefinition();
    const states = asObject(definition.States);
    const processEligibleSources = asObject(states.ProcessEligibleSources);
    const buildExecutionOutput = asObject(states.BuildExecutionOutput);
    const iteratorStates = asObject(asObject(processEligibleSources.Iterator).States);
    const buildItemSuccessResult = asObject(iteratorStates.BuildItemSuccessResult);
    const returnItemSuccessResult = asObject(iteratorStates.ReturnItemSuccessResult);
    const buildItemFailureResult = asObject(iteratorStates.BuildItemFailureResult);
    const returnItemFailureResult = asObject(iteratorStates.ReturnItemFailureResult);

    const buildItemSuccessParameters = asObject(buildItemSuccessResult.Parameters);
    const returnItemSuccessParameters = asObject(returnItemSuccessResult.Parameters);
    const buildItemFailureParameters = asObject(buildItemFailureResult.Parameters);
    const returnItemFailureParameters = asObject(returnItemFailureResult.Parameters);
    const buildExecutionOutputParameters = asObject(buildExecutionOutput.Parameters);

    const sourceARawResult = asObject(
      materializeParameters(buildItemSuccessParameters, {
        sourceId: 'source-a',
        tenantId: 'tenant-a',
        meta: {
          stage: 'dev',
          executionId: 'exec-123',
        },
        collectorResult: {
          processedAt: '2026-03-03T00:00:00.000Z',
          recordsSent: 12,
        },
      }),
    );
    const sourceAResult = asObject(
      materializeParameters(returnItemSuccessParameters, sourceARawResult),
    );
    const sourceBRawResult = asObject(
      materializeParameters(buildItemFailureParameters, {
        sourceId: 'source-b',
        tenantId: 'tenant-b',
        meta: {
          stage: 'dev',
          executionId: 'exec-123',
        },
        collectorError: {
          Error: 'CollectorTimeout',
          Cause: 'Connection timeout while reading source-b',
        },
      }),
    );
    const sourceBResult = asObject(
      materializeParameters(returnItemFailureParameters, sourceBRawResult),
    );
    const sourceCRawResult = asObject(
      materializeParameters(buildItemSuccessParameters, {
        sourceId: 'source-c',
        tenantId: 'tenant-c',
        meta: {
          stage: 'dev',
          executionId: 'exec-123',
        },
        collectorResult: {
          processedAt: '2026-03-03T00:00:02.000Z',
          recordsSent: 4,
        },
      }),
    );
    const sourceCResult = asObject(
      materializeParameters(returnItemSuccessParameters, sourceCRawResult),
    );

    const executionOutput = asObject(
      materializeParameters(buildExecutionOutputParameters, {
        meta: {
          executionId: 'exec-123',
          stage: 'dev',
        },
        schedulerResult: {
          sources: [
            { sourceId: 'source-a', tenantId: 'tenant-a' },
            { sourceId: 'source-b', tenantId: 'tenant-b' },
            { sourceId: 'source-c', tenantId: 'tenant-c' },
          ],
          contractVersion: 'scheduler-output.v1',
          referenceNow: '2026-03-03T00:00:00.000Z',
          hasEligibleSources: true,
          eligibleSources: 3,
          generatedAt: '2026-03-03T00:00:00.000Z',
          maxConcurrency: 5,
        },
        collectorResults: [sourceAResult, sourceBResult, sourceCResult],
      }),
    );

    const sources = asArray(executionOutput.sources);
    expect(sources).toEqual([
      { sourceId: 'source-a', tenantId: 'tenant-a' },
      { sourceId: 'source-b', tenantId: 'tenant-b' },
      { sourceId: 'source-c', tenantId: 'tenant-c' },
    ]);

    const results = asArray(executionOutput.results).map((entry) => asObject(entry));
    expect(results).toHaveLength(3);
    expect(results.filter((entry) => entry.status === 'SUCCEEDED')).toHaveLength(2);
    expect(results.filter((entry) => entry.status === 'FAILED')).toHaveLength(1);

    const failedResult = results.find((entry) => entry.sourceId === 'source-b');
    expect(failedResult).toBeDefined();
    expect(failedResult?.status).toBe('FAILED');
    expect(failedResult?.error).toBe('CollectorTimeout');
    expect(failedResult?.cause).toContain('source-b');

    const summary = asObject(executionOutput.summary);
    const scheduler = asObject(executionOutput.scheduler);
    expect(scheduler.contractVersion).toBe('scheduler-output.v1');
    expect(scheduler.referenceNow).toBe('2026-03-03T00:00:00.000Z');
    expect(scheduler.hasEligibleSources).toBe(true);
    expect(summary.eligibleSources).toBe(3);
    expect(summary.processedSources).toBe(3);
    expect(summary.schedulerStatus).toBe('SUCCEEDED');
    expect(summary.maxConcurrency).toBe(5);
  });

  it('materializa contrato final quando scheduler nao encontra fontes elegiveis', () => {
    const definition = loadDefinition();
    const states = asObject(definition.States);
    const buildExecutionOutput = asObject(states.BuildExecutionOutput);
    const buildExecutionOutputParameters = asObject(buildExecutionOutput.Parameters);

    const executionOutput = asObject(
      materializeParameters(buildExecutionOutputParameters, {
        meta: {
          executionId: 'exec-empty',
          stage: 'dev',
        },
        schedulerResult: {
          sources: [],
          contractVersion: 'scheduler-output.v1',
          referenceNow: '2026-03-04T09:00:00.000Z',
          hasEligibleSources: false,
          eligibleSources: 0,
          generatedAt: '2026-03-04T09:00:00.000Z',
          maxConcurrency: 5,
        },
        collectorResults: [],
      }),
    );

    const scheduler = asObject(executionOutput.scheduler);
    const sources = asArray(executionOutput.sources);
    const results = asArray(executionOutput.results);
    const summary = asObject(executionOutput.summary);

    expect(scheduler.contractVersion).toBe('scheduler-output.v1');
    expect(scheduler.referenceNow).toBe('2026-03-04T09:00:00.000Z');
    expect(scheduler.hasEligibleSources).toBe(false);
    expect(sources).toEqual([]);
    expect(results).toEqual([]);
    expect(summary.eligibleSources).toBe(0);
    expect(summary.processedSources).toBe(0);
    expect(summary.schedulerStatus).toBe('SUCCEEDED');
    expect(summary.maxConcurrency).toBe(5);
  });

  it('materializa contrato de falha quando scheduler interrompe execução antes do Map', () => {
    const definition = loadDefinition();
    const states = asObject(definition.States);
    const buildSchedulerFailureOutput = asObject(states.BuildSchedulerFailureOutput);
    const buildSchedulerFailureParameters = asObject(buildSchedulerFailureOutput.Parameters);

    const output = asObject(
      materializeParameters(buildSchedulerFailureParameters, {
        meta: {
          executionId: 'exec-failed',
          stage: 'stg',
        },
        schedulerError: {
          Error: 'States.Timeout',
          Cause: 'SchedulerLambda timed out',
        },
      }),
    );

    const summary = asObject(output.summary);
    expect(output.meta).toEqual({
      executionId: 'exec-failed',
      stage: 'stg',
    });
    expect(output.sources).toEqual([]);
    expect(output.results).toEqual([]);
    expect(summary).toEqual({
      processedSources: 0,
      eligibleSources: 0,
      schedulerStatus: 'FAILED',
      error: 'States.Timeout',
      cause: 'SchedulerLambda timed out',
    });
  });

  it('define retries com backoff exponencial e tentativas limitadas nas tasks críticas', () => {
    const definition = loadDefinition();
    const states = asObject(definition.States);
    const scheduler = asObject(states.Scheduler);
    const processEligibleSources = asObject(states.ProcessEligibleSources);
    const iteratorStates = asObject(asObject(processEligibleSources.Iterator).States);
    const invokeCollector = asObject(iteratorStates.InvokeCollector);

    const retryGroups = [
      {
        stateName: 'Scheduler',
        entries: asArray(scheduler.Retry),
      },
      {
        stateName: 'InvokeCollector',
        entries: asArray(invokeCollector.Retry),
      },
    ];

    for (const group of retryGroups) {
      expect(group.entries.length).toBeGreaterThan(0);

      for (const entry of group.entries) {
        const retry = asObject(entry);
        expect(Number(retry.IntervalSeconds)).toBeGreaterThanOrEqual(1);
        expect(Number(retry.MaxAttempts)).toBeGreaterThanOrEqual(1);
        expect(Number(retry.BackoffRate)).toBeGreaterThanOrEqual(1);
      }

      const hasFiniteCeiling = group.entries.some((entry) => Number(asObject(entry).MaxAttempts) < 10);
      expect(hasFiniteCeiling).toBe(true);
      const hasExponentialBackoff = group.entries.some(
        (entry) => Number(asObject(entry).BackoffRate) > 1,
      );
      expect(hasExponentialBackoff).toBe(true);
    }
  });
});
