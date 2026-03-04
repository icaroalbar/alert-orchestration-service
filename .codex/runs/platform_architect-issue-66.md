## Issue #66 — [EPIC 6] Configurar DLQ das consumidoras

### Objetivo
Garantir rastreabilidade operacional fim a fim nas filas de integração com DLQ, sem alterar o fan-out SNS→SQS já existente e funcional.

### Decisão arquitetural
1. **Preservar topologia atual SNS fan-out + SQS por integração**
- Manter associação explícita das consumidoras Salesforce/HubSpot às filas dedicadas com `functionResponseType: ReportBatchItemFailures`.
- Manter redrive policy por fila principal apontando para DLQ dedicada.

2. **Adicionar identificação de integração no evento publicado**
- Incluir `integrationTargets` no body de `customer.persisted`.
- Incluir também `integrationTargets` em `MessageAttributes` para facilitar triagem operacional.
- Normalizar targets com deduplicação para evitar divergência semântica.

3. **Endurecer validação de infraestrutura renderizada**
- Expandir `validate-stage-render` para verificar presença de:
  - variáveis de ambiente de roteamento (`INTEGRATION_TARGETS`),
  - handlers das consumidoras,
  - vínculo SQS com `ReportBatchItemFailures`,
  - `deadLetterTargetArn` + `maxReceiveCount`.

### Critérios técnicos de aceite
- [x] Consumidoras seguem vinculadas às filas com DLQ por stage.
- [x] Evento publicado carrega identificação das integrações para rastreio.
- [x] Render/validação de stage garante configuração reprodutível de DLQ.
