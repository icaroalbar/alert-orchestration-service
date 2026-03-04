**QA — Issue #61 (Idempotência da coletora)**

**Achados por severidade**

1. Crítico: nenhum.
2. Alto: nenhum.
3. Médio: nenhum.
4. Baixo: nenhum.

**Checklist de aceite da issue**

- [x] Reexecução da mesma janela deduplica upsert.
- [x] Reexecução da mesma janela deduplica publicação SNS.
- [x] Métrica de deduplicação emitida para observabilidade.

**Evidências de validação**

- `npm run lint` ✅
- `npm run typecheck` ✅
- `npm run test -- tests/unit/infra/idempotency/dynamodb-collector-idempotency-repository.test.ts tests/unit/handlers/collector.test.ts --runInBand` ✅
- `npm run build` ✅

**Status final**: **APPROVED**
