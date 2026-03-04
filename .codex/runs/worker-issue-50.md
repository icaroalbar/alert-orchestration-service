**Status de execução — Issue #50**

**Escopo implementado**

- Contrato versionado da Lambda Scheduler para consumo da SFN:
  - `src/handlers/scheduler.ts`
  - adicionados campos: `contractVersion`, `eligibleSources`, `hasEligibleSources`, `referenceNow`.
  - `sourceIds` permanece como lista principal consumida pela orquestração.
  - caso sem elegíveis agora é explícito (`sourceIds=[]`, `eligibleSources=0`, `hasEligibleSources=false`).
- Consumo direto do payload da Scheduler no `Map State`:
  - `state-machines/main-orchestration-v1.asl.json`
  - removida etapa intermediária `NormalizeSchedulerOutput`.
  - `ProcessEligibleSources.ItemsPath` atualizado para `$.schedulerResult.sourceIds`.
  - `ProcessEligibleSources.MaxConcurrencyPath` atualizado para `$.schedulerResult.maxConcurrency`.
  - `BuildExecutionOutput` atualizado para usar `schedulerResult` diretamente e expor metadados de contrato em `scheduler`.
- Testes ajustados para o novo contrato:
  - `tests/unit/handlers/scheduler.test.ts`
  - `tests/unit/state-machines/main-orchestration-v1.test.ts`
- Documentação do contrato e da orquestração atualizada:
  - `docs/step-functions/scheduler-output-v1.md` (novo)
  - `docs/step-functions/main-orchestration-v1.md`
  - `README.md`

**Validações executadas**

- `npm run lint` ✅
- `npm run typecheck` ✅
- `npm run build` ✅
- `npm run test -- tests/unit/handlers/scheduler.test.ts tests/unit/state-machines/main-orchestration-v1.test.ts --runInBand` ✅
- `npm run validate:stage-render` ✅
- `npm run validate:stage-package` ✅ (fallback esperado por ausência de credenciais AWS)

**Resultado**

Implementação concluída no escopo da issue #50, pronta para PR.
