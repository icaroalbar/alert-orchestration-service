**QA — Issue #62 (Consumidoras por integração)**

**Achados por severidade**

1. Crítico: nenhum.
2. Alto: nenhum.
3. Médio: nenhum.
4. Baixo: nenhum.

**Checklist de aceite da issue**

- [x] Função dedicada para Salesforce.
- [x] Função dedicada para HubSpot.
- [x] Configuração de destino separada por integração/stage.
- [x] Template compartilhado documentado.

**Evidências de validação**

- `npm run lint` ✅
- `npm run typecheck` ✅
- `npm run test -- tests/unit/handlers/shared/create-integration-consumer-handler.test.ts tests/unit/handlers/salesforce-consumer.test.ts tests/unit/handlers/hubspot-consumer.test.ts --runInBand` ✅
- `npm run build` ✅

**Status final**: **APPROVED**
