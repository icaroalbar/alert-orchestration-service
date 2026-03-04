**Status de execução — Issue #78**

**Escopo implementado**

- Novo teste em `tests/unit/state-machines/main-orchestration-v1.test.ts`:
  - materializa o contrato do estado `BuildSchedulerFailureOutput`;
  - valida saída final de falha com `schedulerStatus=FAILED`, `error` e `cause` derivados de `schedulerError`.

**Validações executadas**

- `npm test -- tests/unit/state-machines/main-orchestration-v1.test.ts --runInBand` ✅

**Resultado**

Issue #78 pronta para fechamento com cobertura explícita do caminho de falha do scheduler.
