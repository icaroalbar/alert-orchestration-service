**Status de execução — Issue #64**

**Escopo executado**

- Implementado cliente HTTP para envio de eventos às APIs externas das integrações.
- Integradas consumidoras Salesforce/HubSpot ao cliente externo via `processRecord`.
- Adicionada classificação explícita de erro permanente/transitório por status HTTP.
- Adicionada medição e log de latência por chamada externa.

**Verificações executadas**

- `npm run lint` ✅
- `npm run typecheck` ✅
- `npm run test -- tests/unit/infra/integrations/external-api-client.test.ts tests/unit/handlers/salesforce-consumer.test.ts tests/unit/handlers/hubspot-consumer.test.ts --runInBand` ✅
- `npm run build` ✅

**Resultado**

Issue #64 implementada com diff funcional e pronta para fechamento via PR com vínculo explícito `Closes #64`.
