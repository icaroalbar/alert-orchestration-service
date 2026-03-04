# Playbook de alarmes operacionais

Este playbook cobre a primeira resposta para alarmes operacionais de ingestao e integracoes.

## Escopo de alarmes

- Lambda errors (ingestao e integracoes):
  - `SchedulerErrorsAlarm`
  - `CollectorErrorsAlarm`
  - `SalesforceConsumerErrorsAlarm`
  - `HubspotConsumerErrorsAlarm`
- Lambda latencia alta (p95 de `Duration`):
  - `SchedulerDurationP95HighAlarm`
  - `CollectorDurationP95HighAlarm`
  - `SalesforceConsumerDurationP95HighAlarm`
  - `HubspotConsumerDurationP95HighAlarm`
- Step Functions (orquestracao principal):
  - `MainOrchestrationExecutionsFailedAlarm`
  - `MainOrchestrationExecutionsTimedOutAlarm`
  - `MainOrchestrationExecutionTimeP95HighAlarm`

Todos os alarmes notificam o topico SNS por stage:

- `${service}-${stage}-operational-alarms`

## Resposta inicial (5 a 10 minutos)

1. Identificar o alarme acionado no CloudWatch e o stage afetado.
2. Confirmar se houve regressao recente (PRs/merges nas ultimas 2 horas).
3. Correlacionar com logs estruturados:
   - Lambdas: `/aws/lambda/<function-name>`
   - State machine: `${service}-${stage}-orchestration`
4. Validar impacto:
   - ingestao parada/parcial
   - entrega para integracoes degradada
5. Se houver aculo em filas, verificar DLQ e aplicar triagem com:
   - `docs/integrations/dlq-reprocessing.md`

## Diagnostico por tipo

### Errors (Lambda)

- Verificar erros por `errorType`, `message` e `correlationId`.
- Confirmar se ha falha de dependencia externa, credencial ou validacao de payload.
- Acionar rollback se o erro iniciou apos deploy e tiver alta taxa.

### Duration p95 alta (Lambda)

- Confirmar se a duracao esta proxima de timeout da funcao.
- Verificar gargalo de IO (API externa, banco, Secrets Manager).
- Avaliar necessidade de ajustar timeout/memory em issue dedicada.

### Falha/timeout da state machine

- Inspecionar `ExecutionsFailed`/`ExecutionsTimedOut` e causas por estado no historico da execucao.
- Validar se falha e localizada em fonte unica (falha parcial) ou generalizada.
- Se houver timeout recorrente, abrir issue para ajuste de retries/timeouts e paralelismo.

## Pos-incidente

1. Registrar causa raiz e acao corretiva.
2. Criar issue de follow-up quando houver lacuna estrutural.
3. Atualizar este playbook se a resposta operacional mudar.
