**Status de execução — Issue #58**

**Escopo executado**

- Implementada validação canônica versionada para lote de clientes.
- Integrada validação no handler da coletora com retorno separado entre `records` válidos e `rejectedRecords`.
- Mantido cursor incremental independente da validade canônica para não travar avanço de janela.

**Verificações executadas**

- `npm ci` ✅
- `npm run lint` ✅
- `npm run typecheck` ✅
- `npm run test -- tests/unit/domain/collector/validate-canonical-customer-batch.test.ts tests/unit/handlers/collector.test.ts --runInBand` ✅
- `npm run build` ✅

**Resultado**

Issue #58 implementada com diff funcional e pronta para fechamento via PR com vínculo explícito `Closes #58`.
