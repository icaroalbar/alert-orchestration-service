## Issue #71 — [EPIC 7] Configurar alarmes operacionais

### Objetivo
Configurar alarmes operacionais para ingestao e integracoes cobrindo erro, timeout/latencia e notificacao centralizada.

### Decisão arquitetural
1. **Canal dedicado de notificacao operacional**
- Criado topico SNS por stage: `${service}-${stage}-operational-alarms`.
- Alarmes operacionais direcionam `AlarmActions` e `OKActions` para esse topico.

2. **Cobertura de ingestao e integracoes**
- Ingestao:
  - `SchedulerErrorsAlarm`
  - `SchedulerDurationP95HighAlarm`
  - `CollectorErrorsAlarm`
  - `CollectorDurationP95HighAlarm`
  - `MainOrchestrationExecutionsFailedAlarm`
  - `MainOrchestrationExecutionsTimedOutAlarm`
  - `MainOrchestrationExecutionTimeP95HighAlarm`
- Integracoes:
  - `SalesforceConsumerErrorsAlarm`
  - `SalesforceConsumerDurationP95HighAlarm`
  - `HubspotConsumerErrorsAlarm`
  - `HubspotConsumerDurationP95HighAlarm`

3. **Thresholds por stage**
- Novas chaves em `custom.stages.*` para limiares de erro, latencia e timeout da orquestracao.

4. **Operacao**
- Outputs/exports para topico e alarmes.
- Playbook de resposta inicial adicionado para triagem e acao.

### Critérios técnicos de aceite
- [x] Alarmes para erro de Lambda e Step Functions criados.
- [x] Alarmes para duracao/timeout configurados por stage.
- [x] Canal de notificacao operacional conectado.
- [x] Cobertura inclui ingestao e integracoes.
- [x] Playbook operacional referenciado no README.
