# Main Orchestration v1

Definição versionada em `state-machines/main-orchestration-v1.asl.json`.

## Contrato de entrada do fluxo

Payload esperado na execução:

- `trigger` (string): origem do disparo (`scheduled` no EventBridge).
- `source` (string): origem técnica do evento (`eventbridge`).
- `stage` (string): ambiente (`dev`, `stg`, `prod`).
- `service` (string): nome do serviço.
- `now` (string, opcional): timestamp ISO para forçar relógio na execução.

## Estados e contratos

### NormalizeInput (Pass)

- Entrada: payload bruto da execução + contexto `$$`.
- Saída:
  - `meta.executionId`
  - `meta.stateMachineId`
  - `meta.startedAt`
  - `meta.trigger`
  - `meta.source`
  - `meta.stage`
  - `meta.service`
  - `schedulerInput.now`

### Scheduler (Task)

- Entrada: `schedulerInput.now`.
- Ação: invoca `SchedulerLambdaFunction`.
- Saída esperada em `schedulerResult`:
  - `sourceIds` (array de string)
  - `generatedAt` (string ISO)

### BuildExecutionOutput (Pass)

- Entrada: `meta` + `schedulerResult`.
- Saída final:
  - `meta`
  - `sources` (`schedulerResult.sourceIds`)
  - `summary.eligibleSources` (tamanho de `sources`)
  - `summary.generatedAt`

### Done (Succeed)

- Finaliza execução com saída padronizada da versão v1.

## Versionamento

- Versão atual: `v1`.
- Evoluções incompatíveis devem criar novo arquivo (ex.: `main-orchestration-v2.asl.json`) e manter histórico.
