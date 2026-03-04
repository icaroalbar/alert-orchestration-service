**QA — Issue #58 (Validação modelo canônico Cliente)**

**Achados por severidade**

1. Crítico: nenhum.
2. Alto: nenhum.
3. Médio: nenhum.
4. Baixo: nenhum.

**Checklist de aceite da issue**

- [x] Definido schema canônico versionado.
- [x] Lote validado com separação de válidos e inválidos.
- [x] Rejeições retornam motivo explícito por campo/código.

**Evidências de validação**

- `npm run lint` ✅
- `npm run typecheck` ✅
- `npm run test -- tests/unit/domain/collector/validate-canonical-customer-batch.test.ts tests/unit/handlers/collector.test.ts --runInBand` ✅
- `npm run build` ✅

**Status final**: **APPROVED**
