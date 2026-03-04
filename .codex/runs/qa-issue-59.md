**QA — Issue #59 (Persistência upsert-batch)**

**Achados por severidade**

1. Crítico: nenhum.
2. Alto: nenhum.
3. Médio: nenhum.
4. Baixo: nenhum.

**Checklist de aceite da issue**

- [x] Lotes válidos enviados via cliente dedicado.
- [x] Erros transitórios com retry e backoff exponencial.
- [x] Retorno diferencia sucesso total/parcial com rejeições explícitas.

**Evidências de validação**

- `npm run lint` ✅
- `npm run typecheck` ✅
- `npm run test -- tests/unit/domain/collector/upsert-customers-batch.test.ts tests/unit/handlers/collector.test.ts --runInBand` ✅
- `npm run build` ✅

**Status final**: **APPROVED**
