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
    const normalizeSchedulerOutput = asObject(states.NormalizeSchedulerOutput);
    const processEligibleSources = asObject(states.ProcessEligibleSources);
    const buildExecutionOutput = asObject(states.BuildExecutionOutput);
    const buildSchedulerFailureOutput = asObject(states.BuildSchedulerFailureOutput);
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
    expect(scheduler.Next).toBe('NormalizeSchedulerOutput');
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

    expect(normalizeSchedulerOutput.Type).toBe('Pass');
    expect(normalizeSchedulerOutput.ResultPath).toBe('$');
    expect(normalizeSchedulerOutput.Next).toBe('ProcessEligibleSources');
    const normalizeSchedulerParameters = asObject(normalizeSchedulerOutput.Parameters);
    expect(normalizeSchedulerParameters['meta.$']).toBe('$.meta');
    const schedulerPayload = asObject(normalizeSchedulerParameters.scheduler);
    expect(schedulerPayload['sourceIds.$']).toBe('$.schedulerResult.sourceIds');
    expect(schedulerPayload['generatedAt.$']).toBe('$.schedulerResult.generatedAt');
    expect(schedulerPayload['maxConcurrency.$']).toBe('$.schedulerResult.maxConcurrency');
    expect(schedulerPayload['eligibleSources.$']).toBe(
      'States.ArrayLength($.schedulerResult.sourceIds)',
    );

    expect(processEligibleSources.Type).toBe('Map');
    expect(processEligibleSources.ItemsPath).toBe('$.scheduler.sourceIds');
    expect(processEligibleSources.MaxConcurrencyPath).toBe('$.scheduler.maxConcurrency');
    expect(processEligibleSources.ResultPath).toBe('$.collectorResults');
    expect(processEligibleSources.Next).toBe('BuildExecutionOutput');
    const processEligibleSourcesParameters = asObject(processEligibleSources.Parameters);
    expect(processEligibleSourcesParameters['sourceId.$']).toBe('$$.Map.Item.Value');
    expect(processEligibleSourcesParameters['meta.$']).toBe('$.meta');
    const iterator = asObject(processEligibleSources.Iterator);
    expect(iterator.StartAt).toBe('InvokeCollector');
    const iteratorStates = asObject(iterator.States);
    const invokeCollector = asObject(iteratorStates.InvokeCollector);
    const buildItemSuccessResult = asObject(iteratorStates.BuildItemSuccessResult);
    const buildItemFailureResult = asObject(iteratorStates.BuildItemFailureResult);

    expect(invokeCollector.Type).toBe('Task');
    expect(invokeCollector.ResultPath).toBe('$.collectorResult');
    expect(invokeCollector.Next).toBe('BuildItemSuccessResult');
    const invokeCollectorResource = asObject(invokeCollector.Resource);
    expect(invokeCollectorResource['Fn::GetAtt']).toEqual(['CollectorLambdaFunction', 'Arn']);
    const invokeCollectorParameters = asObject(invokeCollector.Parameters);
    expect(invokeCollectorParameters['sourceId.$']).toBe('$.sourceId');
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
    expect(buildItemSuccessResult.End).toBe(true);
    const buildItemSuccessParameters = asObject(buildItemSuccessResult.Parameters);
    expect(buildItemSuccessParameters['sourceId.$']).toBe('$.sourceId');
    expect(buildItemSuccessParameters.status).toBe('SUCCEEDED');
    expect(buildItemSuccessParameters['processedAt.$']).toBe('$.collectorResult.processedAt');
    expect(buildItemSuccessParameters['recordsSent.$']).toBe('$.collectorResult.recordsSent');

    expect(buildItemFailureResult.Type).toBe('Pass');
    expect(buildItemFailureResult.End).toBe(true);
    const buildItemFailureParameters = asObject(buildItemFailureResult.Parameters);
    expect(buildItemFailureParameters['sourceId.$']).toBe('$.sourceId');
    expect(buildItemFailureParameters.status).toBe('FAILED');
    expect(buildItemFailureParameters['error.$']).toBe('$.collectorError.Error');
    expect(buildItemFailureParameters['cause.$']).toBe('$.collectorError.Cause');

    expect(buildExecutionOutput.Type).toBe('Pass');
    expect(buildExecutionOutput.ResultPath).toBe('$');
    expect(buildExecutionOutput.Next).toBe('Done');
    const outputParameters = asObject(buildExecutionOutput.Parameters);
    expect(outputParameters['meta.$']).toBe('$.meta');
    expect(outputParameters['sources.$']).toBe('$.scheduler.sourceIds');
    expect(outputParameters['results.$']).toBe('$.collectorResults');
    const summary = asObject(outputParameters.summary);
    expect(summary['processedSources.$']).toBe('States.ArrayLength($.collectorResults)');
    expect(summary['eligibleSources.$']).toBe('$.scheduler.eligibleSources');
    expect(summary['generatedAt.$']).toBe('$.scheduler.generatedAt');
    expect(summary['maxConcurrency.$']).toBe('$.scheduler.maxConcurrency');
    expect(summary.schedulerStatus).toBe('SUCCEEDED');

    expect(buildSchedulerFailureOutput.Type).toBe('Pass');
    expect(buildSchedulerFailureOutput.ResultPath).toBe('$');
    expect(buildSchedulerFailureOutput.Next).toBe('SchedulerFailed');
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
    const buildItemFailureResult = asObject(iteratorStates.BuildItemFailureResult);

    const buildItemSuccessParameters = asObject(buildItemSuccessResult.Parameters);
    const buildItemFailureParameters = asObject(buildItemFailureResult.Parameters);
    const buildExecutionOutputParameters = asObject(buildExecutionOutput.Parameters);

    const sourceAResult = asObject(
      materializeParameters(buildItemSuccessParameters, {
        sourceId: 'source-a',
        collectorResult: {
          processedAt: '2026-03-03T00:00:00.000Z',
          recordsSent: 12,
        },
      }),
    );
    const sourceBResult = asObject(
      materializeParameters(buildItemFailureParameters, {
        sourceId: 'source-b',
        collectorError: {
          Error: 'CollectorTimeout',
          Cause: 'Connection timeout while reading source-b',
        },
      }),
    );
    const sourceCResult = asObject(
      materializeParameters(buildItemSuccessParameters, {
        sourceId: 'source-c',
        collectorResult: {
          processedAt: '2026-03-03T00:00:02.000Z',
          recordsSent: 4,
        },
      }),
    );

    const executionOutput = asObject(
      materializeParameters(buildExecutionOutputParameters, {
        meta: {
          executionId: 'exec-123',
          stage: 'dev',
        },
        scheduler: {
          sourceIds: ['source-a', 'source-b', 'source-c'],
          eligibleSources: 3,
          generatedAt: '2026-03-03T00:00:00.000Z',
          maxConcurrency: 5,
        },
        collectorResults: [sourceAResult, sourceBResult, sourceCResult],
      }),
    );

    const sources = asArray(executionOutput.sources);
    expect(sources).toEqual(['source-a', 'source-b', 'source-c']);

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
    expect(summary.eligibleSources).toBe(3);
    expect(summary.processedSources).toBe(3);
    expect(summary.schedulerStatus).toBe('SUCCEEDED');
    expect(summary.maxConcurrency).toBe(5);
  });
});
