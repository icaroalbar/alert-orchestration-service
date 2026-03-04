## Issue #67 — [EPIC 6] Criar CloudWatch Alarm para DLQ

### Objetivo
Alertar operação quando houver acúmulo de mensagens visíveis nas DLQs de integrações, com limiares parametrizados por stage.

### Decisão arquitetural
1. **Alarmes por integração e por stage**
- Criar alarmes dedicados para `SalesforceIntegrationDlq` e `HubspotIntegrationDlq`.
- Métrica: `AWS/SQS::ApproximateNumberOfMessagesVisible`.
- Comparação: `GreaterThanOrEqualToThreshold`.

2. **Threshold e janela configuráveis no stage**
- Introduzir parâmetros de stage:
  - `salesforceDlqAlarmThreshold`
  - `hubspotDlqAlarmThreshold`
  - `dlqAlarmPeriodSeconds`
  - `dlqAlarmEvaluationPeriods`

3. **Canal de notificação explícito**
- Criar SNS topic operacional por stage (`dlqAlarmTopicName`).
- Configurar `AlarmActions` e `OKActions` para o tópico.

4. **Governança e rastreabilidade de IaC**
- Exportar outputs de ARN/nome dos alarmes e ARN do tópico para integração com operação.
- Expandir validação estática de stage render para evitar regressões no contrato de alarmes.

### Critérios técnicos de aceite
- [x] Alarmes disparam com base em limiar por integração.
- [x] Ação de notificação está ligada a canal SNS de operação.
- [x] Parâmetros por stage permitem ajuste sem alterar código.
