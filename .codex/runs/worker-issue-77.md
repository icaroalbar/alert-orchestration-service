**Status de execução — Issue #77**

**Escopo implementado**

- Novo teste em `tests/unit/handlers/scheduler.test.ts` para:
  - validar payload completo retornado ao Step Functions (`contractVersion`, `sourceIds`, `eligibleSources`, `hasEligibleSources`, `referenceNow`, `generatedAt`, `maxConcurrency`);
  - validar propagação de `meta.executionId` em `correlationId` no log `scheduler.eligible_sources.filtered`.

**Validações executadas**

- `npm test -- tests/unit/handlers/scheduler.test.ts --runInBand` ✅

**Resultado**

Issue #77 pronta para fechamento com contrato de saída e rastreabilidade do Scheduler cobertos.
