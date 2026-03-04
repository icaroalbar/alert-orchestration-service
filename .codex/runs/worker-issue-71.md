**Status de execução — Issue #71**

**Escopo implementado**

- Infra de alarmes operacionais no `serverless.yml`:
  - Novo topico SNS: `OperationalAlarmTopic`.
  - Alarmes de erro e duracao p95 para:
    - scheduler
    - coletora
    - consumidora Salesforce
    - consumidora HubSpot
  - Alarmes de orquestracao Step Functions:
    - `ExecutionsFailed`
    - `ExecutionsTimedOut`
    - `ExecutionTime` p95.
- Parametros por stage adicionados em `custom.stages.dev|stg|prod`:
  - `operationalAlarmTopicName`
  - `operationalAlarmPeriodSeconds`
  - `operationalAlarmEvaluationPeriods`
  - `lambdaErrorAlarmThreshold`
  - `schedulerDurationAlarmThresholdMs`
  - `collectorDurationAlarmThresholdMs`
  - `consumerDurationAlarmThresholdMs`
  - `orchestrationFailureAlarmThreshold`
  - `orchestrationTimeoutAlarmThreshold`
  - `orchestrationDurationP95AlarmThresholdMs`
- Outputs/export adicionados para topico e nomes de alarmes operacionais.
- Validador estatico atualizado:
  - `scripts/validate-stage-render.mjs` com checks de novas chaves, recursos e outputs.
- Documentacao:
  - README atualizado com inventario de alarmes operacionais.
  - Novo playbook: `docs/observability/operational-alarms-playbook.md`.

**Validações executadas**

- `npm run lint` ✅
- `npm run typecheck` ✅
- `npm run test -- --runInBand` ✅
- `npm run build` ✅
- `npm run validate:stage-render` ✅
- `npm run validate:stage-package` ⚠️ fallback local esperado (sem credenciais AWS)

**Resultado**

Issue #71 implementada com alarmes operacionais para ingestao e integracoes, com canal de notificacao dedicado e playbook de resposta inicial.
