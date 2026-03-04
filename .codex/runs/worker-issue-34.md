**Status de execução — Issue #34**

**Escopo implementado**

- Atualizada documentação da orquestração com defaults por stage e mecanismo de override sem código para `MAP_MAX_CONCURRENCY`:
  - `docs/step-functions/main-orchestration-v1.md`
  - `README.md`

**Validações executadas**

- `npm test -- tests/unit/handlers/scheduler.test.ts tests/unit/state-machines/main-orchestration-v1.test.ts --runInBand` ✅

**Resultado**

Issue #34 pronta para fechamento com critérios de parametrização, limites e documentação atendidos.
