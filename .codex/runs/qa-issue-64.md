**QA — Issue #64 (Chamada à API externa)**

**Achados por severidade**

1. Crítico: nenhum.
2. Alto: nenhum.
3. Médio: nenhum.
4. Baixo: nenhum.

**Checklist de aceite da issue**

- [x] Request externo mapeado para contrato da integração.
- [x] Erros 4xx e 5xx diferenciados por tipo.
- [x] Tempo de resposta registrado por chamada.

**Evidências de validação**

- `npm run lint` ✅
- `npm run typecheck` ✅
- `npm run test -- tests/unit/infra/integrations/external-api-client.test.ts tests/unit/handlers/salesforce-consumer.test.ts tests/unit/handlers/hubspot-consumer.test.ts --runInBand` ✅
- `npm run build` ✅

**Status final**: **APPROVED**
