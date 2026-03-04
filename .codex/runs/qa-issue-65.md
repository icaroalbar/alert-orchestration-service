**QA — Issue #65 (Retry controlado nas integrações)**

**Achados por severidade**

1. Crítico: nenhum.
2. Alto: nenhum.
3. Médio: nenhum.
4. Baixo: nenhum.

**Checklist de aceite da issue**

- [x] Erros transitórios retornam `batchItemFailures` para retry.
- [x] Erros permanentes são descartados sem retry.
- [x] Classificação e ação (`retry`/`discard`) registradas em log.

**Evidências de validação**

- `npm run lint` ✅
- `npm run typecheck` ✅
- `npm run test -- tests/unit/handlers/shared/create-integration-consumer-handler.test.ts tests/unit/handlers/salesforce-consumer.test.ts tests/unit/handlers/hubspot-consumer.test.ts tests/unit/infra/integrations/external-api-client.test.ts --runInBand` ✅
- `npm run build` ✅

**Status final**: **APPROVED**
