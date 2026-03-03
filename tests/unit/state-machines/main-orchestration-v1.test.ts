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

describe('main-orchestration-v1.asl.json', () => {
  it('define fluxo principal com contratos explícitos por estado', () => {
    const definition = loadDefinition();
    expect(definition.Comment).toBe('Orquestrador principal v1 da plataforma de ingestao.');
    expect(definition.StartAt).toBe('NormalizeInput');

    const states = asObject(definition.States);
    const normalizeInput = asObject(states.NormalizeInput);
    const scheduler = asObject(states.Scheduler);
    const buildExecutionOutput = asObject(states.BuildExecutionOutput);
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
    expect(scheduler.Next).toBe('BuildExecutionOutput');
    const schedulerParameters = asObject(scheduler.Parameters);
    expect(schedulerParameters['now.$']).toBe('$.schedulerInput.now');
    const schedulerResource = asObject(scheduler.Resource);
    expect(schedulerResource['Fn::GetAtt']).toEqual(['SchedulerLambdaFunction', 'Arn']);

    expect(buildExecutionOutput.Type).toBe('Pass');
    expect(buildExecutionOutput.ResultPath).toBe('$');
    expect(buildExecutionOutput.Next).toBe('Done');
    const outputParameters = asObject(buildExecutionOutput.Parameters);
    expect(outputParameters['meta.$']).toBe('$.meta');
    expect(outputParameters['sources.$']).toBe('$.schedulerResult.sourceIds');
    const summary = asObject(outputParameters.summary);
    expect(summary['eligibleSources.$']).toBe('States.ArrayLength($.schedulerResult.sourceIds)');
    expect(summary['generatedAt.$']).toBe('$.schedulerResult.generatedAt');

    expect(done.Type).toBe('Succeed');
  });
});
