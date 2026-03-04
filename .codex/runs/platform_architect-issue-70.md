## Issue #70 — [EPIC 7] Criar métricas customizadas

### Objetivo
Instrumentar métricas de runtime para coletora e consumidoras, com namespace por estágio e IAM mínimo para publicação no CloudWatch.

### Decisão arquitetural
1. **Publisher compartilhado de métricas CloudWatch**
- Criar `createCloudWatchMetricsPublisher` com default dimensions (`Stage`, `Service`) e suporte a dimensões específicas por métrica.

2. **Métricas de entrega de integrações**
- Criar `createIntegrationDeliveryMetricsPublisher` para publicar:
  - `IntegrationDeliveryAttempt`
  - `IntegrationDeliverySuccess`/`IntegrationDeliveryFailure`
  - `IntegrationDeliveryLatencyMs`

3. **Integração no fluxo existente**
- `external-api-client` passa a aceitar callback opcional de métricas.
- Consumidoras (`salesforce`/`hubspot`) instanciam publisher real em runtime e enviam métricas por mensagem processada.
- Coletora publica métricas de execução e volume (sucesso/falha/latência, coletados/persistidos/rejeitados).

4. **Infra e segurança**
- Adicionar `METRICS_NAMESPACE` no `serverless.yml`.
- Conceder `cloudwatch:PutMetricData` apenas no namespace configurado para roles da coletora e consumidoras.

### Critérios técnicos de aceite
- [x] Namespace de métricas configurável por ambiente.
- [x] Métricas de entrega e latência publicadas nas consumidoras.
- [x] Métricas da coletora publicadas sem alterar contrato funcional.
- [x] IAM restrito por namespace para `PutMetricData`.
- [x] Testes unitários para publisher CloudWatch e publisher de integração.
