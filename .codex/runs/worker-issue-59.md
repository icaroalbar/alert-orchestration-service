**Status de execução — Issue #59**

**Escopo executado**

- Implementado cliente HTTP de `upsert-batch` com política de retry configurável e timeout.
- Integrado fluxo de persistência no handler da coletora usando `sourceId` e `correlationId`.
- Ajustado contrato de saída da coletora para distinguir persistidos e rejeitados na persistência.

**Verificações executadas**

- `npm run lint` ✅
- `npm run typecheck` ✅
- `npm run test -- tests/unit/domain/collector/upsert-customers-batch.test.ts tests/unit/handlers/collector.test.ts --runInBand` ✅
- `npm run build` ✅

**Resultado**

Issue #59 implementada com diff funcional e pronta para fechamento via PR com vínculo explícito `Closes #59`.
