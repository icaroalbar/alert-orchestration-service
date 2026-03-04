# Playbook de alarmes operacionais

Este playbook cobre a primeira resposta para alarmes operacionais de ingestao e integracoes.

## Responsaveis e tempo de resposta

Matriz operacional minima por severidade:

- `SEV-1` (ingestao parada em `prod` ou falha generalizada em integracoes criticas):
  - reconhecimento do incidente: ate 5 minutos
  - dono da resposta inicial: On-call da plataforma
  - escalonamento: Tech Lead + Product/Operacoes em ate 10 minutos
- `SEV-2` (degradacao parcial com backlog crescente ou falha recorrente em uma integracao):
  - reconhecimento do incidente: ate 10 minutos
  - dono da resposta inicial: On-call da plataforma
  - escalonamento: Tech Lead em ate 20 minutos
- `SEV-3` (impacto baixo, sem perda de dados e com contorno operacional):
  - reconhecimento do incidente: ate 30 minutos
  - dono da resposta inicial: Engenharia de plataforma (janela comercial)
  - escalonamento: sob demanda

Responsabilidades durante o incidente:

- Incident Commander (On-call): coordena triagem, decisao de rollback e comunicacao de status.
- Responsavel tecnico (engenheiro da feature afetada): executa mitigacao tecnica.
- Comunicacao operacional (Product/Operacoes): atualiza stakeholders sobre impacto e ETA.

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

## Triagem DLQ e replay (checklist rapido)

1. Confirmar integracao impactada (`salesforce`, `hubspot` ou ambas) e janela do incidente.
2. Rodar simulacao sem mutacao:
   - `npm run dlq:reprocess -- --integration <salesforce|hubspot|all> --since <ISO> --until <ISO> --dry-run`
3. Validar no resultado:
   - quantidade elegivel para replay
   - principais `failure reasons`
   - risco de replay fora da janela do incidente
4. Executar replay efetivo com escopo reduzido:
   - `npm run dlq:reprocess -- --integration <...> --since <ISO> --until <ISO> --max-messages <N>`
5. Confirmar sucesso:
   - reducao de mensagens visiveis na DLQ
   - aumento de consumo na fila principal
   - estabilizacao dos alarmes de erro/latencia
6. Anexar o arquivo de auditoria gerado (`.codex/runs/dlq-reprocess-<batch>.json`) no registro do incidente.

## Diagnostico por tipo

### Errors (Lambda)

- Verificar erros por `errorType`, `message` e `correlationId`.
- Confirmar se ha falha de dependencia externa, credencial ou validacao de payload.
- Acionar rollback se o erro iniciou apos deploy e tiver alta taxa.

### Duration p95 alta (Lambda)

- Confirmar se a duracao esta proxima de timeout da funcao.
- Verificar gargalo de IO (API externa, banco, Secrets Manager).
- Avaliar necessidade de ajustar timeout/memory em issue dedicada.
- Parametros versionados em IaC para ajuste por stage:
  - `schedulerMemorySize`, `schedulerTimeoutSeconds`
  - `collectorMemorySize`, `collectorTimeoutSeconds`
  - `consumerMemorySize`, `consumerTimeoutSeconds`
  - `sourceRegistryApiMemorySize`, `sourceRegistryApiTimeoutSeconds`
  - `salesforceQueueMaxReceiveCount`, `hubspotQueueMaxReceiveCount`

### Falha/timeout da state machine

- Inspecionar `ExecutionsFailed`/`ExecutionsTimedOut` e causas por estado no historico da execucao.
- Validar se falha e localizada em fonte unica (falha parcial) ou generalizada.
- Se houver timeout recorrente, abrir issue para ajuste de retries/timeouts e paralelismo.

## Pos-incidente

1. Registrar causa raiz, timeline e acao corretiva.
2. Definir owner e prazo do follow-up tecnico (issue obrigatoria quando houver lacuna estrutural).
3. Revisar se alarme, limiar ou playbook precisam ajuste.
4. Publicar status final com impacto, mitigacao aplicada e pendencias.
