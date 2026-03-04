**Status de execução — Issue #65**

**Escopo executado**

- Implementada política de retry por classificação no template das consumidoras (`transient`/`permanent`).
- Integrada classificação aos handlers Salesforce/HubSpot usando tipos do cliente externo.
- Ajustado retorno de `batchItemFailures` para retentar apenas erros transitórios.

**Verificações executadas**

- `npm run lint` ✅
- `npm run typecheck` ✅
- `npm run test -- tests/unit/handlers/shared/create-integration-consumer-handler.test.ts tests/unit/handlers/salesforce-consumer.test.ts tests/unit/handlers/hubspot-consumer.test.ts tests/unit/infra/integrations/external-api-client.test.ts --runInBand` ✅
- `npm run build` ✅

**Resultado**

Issue #65 implementada com diff funcional e pronta para fechamento via PR com vínculo explícito `Closes #65`.
