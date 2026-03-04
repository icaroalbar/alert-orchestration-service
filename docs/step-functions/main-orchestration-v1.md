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
- Implementação do scheduler:
  - Consulta fontes ativas no DynamoDB usando o índice `active-nextRunAt-index`.
  - Consome páginas de forma incremental (paginação por `LastEvaluatedKey`) para evitar carga total em memória.
- Retry com backoff exponencial para falhas transitórias:
  - Erros Lambda transitórios (`ServiceException`, `AWSLambdaException`, `SdkClientException`, `TooManyRequestsException`):
    - `IntervalSeconds: 2`
    - `MaxAttempts: 3`
    - `BackoffRate: 2`
  - `States.Timeout`:
    - `IntervalSeconds: 5`
    - `MaxAttempts: 2`
    - `BackoffRate: 2`
- Saída esperada em `schedulerResult`:
  - `sourceIds` (array de string)
  - `generatedAt` (string ISO)
  - `maxConcurrency` (number, inteiro entre 1 e 40)

### ProcessEligibleSources (Map)

- Entrada: `scheduler.sourceIds` e `scheduler.maxConcurrency`.
- Ação: itera cada `sourceId` e invoca `CollectorLambdaFunction`.
- Retry com backoff exponencial na task `InvokeCollector` com os mesmos limites do `Scheduler`.
- Catch por item no `InvokeCollector` (`States.ALL`) para registrar falha da fonte sem interromper o `Map`.
- Publica métricas customizadas por item usando `cloudwatch:PutMetricData` (não bloqueante):
  - `SourceProcessed` / `SourceFailed` (dimensão `Stage`);
  - `SourceProcessedBySource` / `SourceFailedBySource` (dimensões `Stage`, `ExecutionId`, `SourceId`).
- Contrato por item em `collectorResults`:
  - sucesso: `sourceId`, `status=SUCCEEDED`, `processedAt`, `recordsSent`;
  - falha: `sourceId`, `status=FAILED`, `error`, `cause`.
- Controle de paralelismo:
  - `MaxConcurrencyPath = $.scheduler.maxConcurrency`.
  - Valor configurado por stage via `MAP_MAX_CONCURRENCY`.

### BuildExecutionOutput (Pass)

- Entrada: `meta` + `schedulerResult`.
- Saída final:
  - `meta`
  - `sources` (`schedulerResult.sourceIds`)
  - `results` (lista de itens com sucesso/falha por `sourceId`)
  - `summary.eligibleSources` (tamanho de `sources`)
  - `summary.processedSources` (tamanho de `results`)
  - `summary.generatedAt`
  - `summary.maxConcurrency` (limite aplicado no Map)

### Done (Succeed)

- Finaliza execução com saída padronizada da versão v1.

## Observabilidade da orquestração

- **Logging da SFN**:
  - `loggingConfig.level = ALL`
  - `includeExecutionData = true`
  - Log group dedicado: `${service}-${stage}-orchestration` em `/aws/vendedlogs/states/...`
- **Tracing da SFN**:
  - `tracingConfig.enabled` por stage (reuso da flag `tracing` já definida em `custom.stages`).
- **Métricas de execução (custom namespace)**:
  - Namespace: `AlertOrchestrationService/Orchestration`
  - `ExecutionSucceeded`, `ExecutionFailed` (dimensão `Stage`)
  - `ExecutionSucceededByExecution`, `ExecutionFailedByExecution` (dimensões `Stage`, `ExecutionId`)
  - `ProcessedSources`, `EligibleSources` (dimensão `Stage`)
- **Métrica de duração**:
  - Métrica nativa `AWS/States::ExecutionTime` exposta no dashboard de observabilidade da orquestração.
- **Rastreabilidade por correlação**:
  - `meta.executionId` é propagado entre estados e utilizado nas dimensões customizadas.
  - `sourceId` é mantido por item no `Map` e nas métricas por fonte.

## Cobertura de teste de falha parcial

- O teste unitário `tests/unit/state-machines/main-orchestration-v1.test.ts` inclui cenário com múltiplas fontes e falha em subset.
- A validação automatiza o contrato de saída final (`results` e `summary`) para garantir:
  - preservação de itens `SUCCEEDED` e `FAILED` na mesma execução;
  - consistência entre `summary.eligibleSources` e `summary.processedSources`;
  - rastreabilidade por `sourceId`, `error` e `cause` para itens falhos.

## Versionamento

- Versão atual: `v1`.
- Evoluções incompatíveis devem criar novo arquivo (ex.: `main-orchestration-v2.asl.json`) e manter histórico.
