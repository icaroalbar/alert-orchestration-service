**QA — Issue #60 (Publicação SNS pós-persistência)**

**Achados por severidade**

1. Crítico: nenhum.
2. Alto: nenhum.
3. Médio: nenhum.
4. Baixo: nenhum.

**Checklist de aceite da issue**

- [x] Publicação no tópico SNS ocorre com sucesso.
- [x] Metadados `sourceId` e `correlationId` presentes no evento.
- [x] Registros rejeitados na persistência não são publicados.

**Evidências de validação**

- `npm run lint` ✅
- `npm run typecheck` ✅
- `npm run test -- tests/unit/infra/events/sns-customer-events-publisher.test.ts tests/unit/handlers/collector.test.ts --runInBand` ✅
- `npm run build` ✅

**Status final**: **APPROVED**
