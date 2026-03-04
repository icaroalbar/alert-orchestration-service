**Status de execução — Issue #35**

**Escopo implementado**

- Reforço da documentação de retry na orquestração principal:
  - `docs/step-functions/main-orchestration-v1.md`
  - explicita tentativas finitas para evitar loop infinito.
- Novo teste unitário para validar política de retry em `Scheduler` e `InvokeCollector`:
  - `tests/unit/state-machines/main-orchestration-v1.test.ts`
  - valida `IntervalSeconds >= 1`, `BackoffRate > 1` e teto finito de `MaxAttempts`.

**Validações executadas**

- `npm test -- tests/unit/state-machines/main-orchestration-v1.test.ts --runInBand` ✅

**Resultado**

Issue #35 pronta para fechamento com retry exponencial e limite de tentativas formalmente cobertos.
