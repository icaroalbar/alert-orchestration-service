**Status de execução — Issue #67**

**Escopo implementado**

- CloudWatch Alarm para DLQ por integração:
  - `SalesforceIntegrationDlqVisibleMessagesAlarm`
  - `HubspotIntegrationDlqVisibleMessagesAlarm`
  - métrica `ApproximateNumberOfMessagesVisible`, `Statistic: Maximum`, `TreatMissingData: notBreaching`.
- Canal de notificação SNS para alarmes de DLQ:
  - `DlqAlarmTopic` com criptografia e tags por stage.
  - `AlarmActions` + `OKActions` apontando para o tópico.
- Parametrização por stage no `serverless.yml`:
  - `dlqAlarmTopicName`
  - `salesforceDlqAlarmThreshold`
  - `hubspotDlqAlarmThreshold`
  - `dlqAlarmPeriodSeconds`
  - `dlqAlarmEvaluationPeriods`
- Outputs adicionados para operação e integração:
  - `DlqAlarmTopicArn`
  - `SalesforceIntegrationDlqVisibleMessagesAlarmName`
  - `SalesforceIntegrationDlqVisibleMessagesAlarmArn`
  - `HubspotIntegrationDlqVisibleMessagesAlarmName`
  - `HubspotIntegrationDlqVisibleMessagesAlarmArn`
- Validação estática reforçada em `scripts/validate-stage-render.mjs` para novos contratos de alarmes.
- README atualizado com a seção de alarmes operacionais de DLQ.

**Validações executadas**

- `npm run lint` ✅
- `npm run typecheck` ✅
- `npm run test -- --runInBand` ✅
- `npm run build` ✅
- `npm run validate:stage-render` ✅
- `npm run validate:stage-package` ⚠️ fallback local esperado (sem credenciais AWS)

**Resultado**

Issue #67 implementada com alarmes de DLQ por integração, thresholds por stage e canal SNS operacional para notificações.
