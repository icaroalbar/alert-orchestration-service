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

- Entrada: `schedulerInput.now` + `meta` (execution/stage/service).
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
  - Política limitada: número de tentativas é finito (`MaxAttempts`) para evitar loop infinito.
- Saída esperada em `schedulerResult`:
  - `contractVersion` (`scheduler-output.v1`)
  - `sources` (`Array<{sourceId, tenantId}>`)
  - `sourceIds` (array de string)
  - `eligibleSources` (number)
  - `hasEligibleSources` (boolean)
  - `referenceNow` (string ISO)
  - `generatedAt` (string ISO)
  - `maxConcurrency` (number, inteiro entre 1 e 40)
  - `traceContext` (traceparent/traceId/spanId/traceFlags)
  - Contrato detalhado em `docs/step-functions/scheduler-output-v1.md`.

### ProcessEligibleSources (Map)

- Entrada: `schedulerResult.sources` e `schedulerResult.maxConcurrency`.
- Ação: itera cada item `{sourceId, tenantId}` e invoca `CollectorLambdaFunction`.
- Retry com backoff exponencial na task `InvokeCollector` com os mesmos limites do `Scheduler`.
- Política limitada também no coletor (`MaxAttempts` finito), com `Catch` por item para manter tolerância a falha parcial.
- Catch por item no `InvokeCollector` (`States.ALL`) para registrar falha da fonte sem interromper o `Map`.
- Publica métricas customizadas por item usando `cloudwatch:PutMetricData` (não bloqueante):
  - `SourceProcessed` / `SourceFailed` (dimensão `Stage`);
  - `SourceProcessedBySource` / `SourceFailedBySource` (dimensões `Stage`, `ExecutionId`, `SourceId`).
- Contrato por item em `collectorResults`:
  - sucesso: `sourceId`, `tenantId`, `status=SUCCEEDED`, `processedAt`, `recordsSent`;
  - falha: `sourceId`, `tenantId`, `status=FAILED`, `error`, `cause`.
- Propagacao de trace:
  - `schedulerResult.traceContext` e injetado em `meta.traceContext` de cada item do `Map`.
  - `Collector` usa esse contexto como parent span para continuidade de rastreio distribuido.
- Controle de paralelismo:
  - `MaxConcurrencyPath = $.schedulerResult.maxConcurrency`.
  - Valor configurado por stage via `custom.stages.<stage>.mapMaxConcurrency`:
    - `dev=2`
    - `stg=5`
    - `prod=10`
  - O valor é injetado em runtime no Scheduler por `MAP_MAX_CONCURRENCY` e pode ser ajustado sem alteração de código-fonte (ex.: variável de ambiente no deploy/pipeline).

### BuildExecutionOutput (Pass)

- Entrada: `meta` + `schedulerResult`.
- Saída final:
  - `meta`
  - `sources` (`schedulerResult.sources`)
  - `results` (lista de itens com sucesso/falha por `sourceId`)
  - `scheduler.contractVersion`
  - `scheduler.referenceNow`
  - `scheduler.hasEligibleSources`
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
