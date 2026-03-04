**Status de execução — Issue #70**

**Escopo implementado**

- Dependência AWS CloudWatch adicionada:
  - `@aws-sdk/client-cloudwatch`
- Publisher de métricas de runtime:
  - `src/infra/observability/cloudwatch-metrics-publisher.ts`
- Publisher de métricas de entrega por integração:
  - `src/infra/observability/integration-delivery-metrics-publisher.ts`
- Integração no cliente externo:
  - `src/infra/integrations/external-api-client.ts`
  - callback opcional `metricsPublisher` com `statusCode` e `durationMs`.
- Consumidoras publicando métricas:
  - `src/handlers/salesforce-consumer.ts`
  - `src/handlers/hubspot-consumer.ts`
- Coletora com métricas de execução e processamento:
  - `src/handlers/collector.ts`
- Infra/Config:
  - `serverless.yml` com `METRICS_NAMESPACE`.
  - IAM atualizado (collector/salesforce/hubspot) para `cloudwatch:PutMetricData` com condição por namespace.
  - `scripts/validate-stage-render.mjs` atualizado para validar env + IAM.
- Testes:
  - `tests/unit/infra/observability/cloudwatch-metrics-publisher.test.ts`
  - `tests/unit/infra/observability/integration-delivery-metrics-publisher.test.ts`
  - atualização de `tests/unit/infra/integrations/external-api-client.test.ts`
  - ajuste de estabilidade em `tests/unit/handlers/collector.test.ts`.

**Validações executadas**

- `npm run lint` ✅
- `npm run typecheck` ✅
- `npm run test -- --runInBand` ✅
- `npm run build` ✅
- `npm run validate:stage-render` ✅
- `npm run validate:stage-package` ⚠️ fallback local esperado (sem credenciais AWS)

**Resultado**

Issue #70 implementada com métricas customizadas instrumentadas em runtime e proteção IAM por namespace.
