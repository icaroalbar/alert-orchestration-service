**Status de execução — Issue #51**

**Escopo implementado**

- Reforço de elegibilidade temporal no domínio do Scheduler:
  - `tests/unit/domain/scheduler/list-eligible-sources.test.ts`
  - novo cenário de fronteira (`nextRunAt == now`) com fonte `cron` e validação de reserva para próximo ciclo.
- Reforço de concorrência no contrato do handler:
  - `tests/unit/handlers/scheduler.test.ts`
  - novo cenário onde todas as reservas conflitam (`conditional update`), validando saída estável com `sourceIds=[]` e `hasEligibleSources=false`.
- Reforço do contrato final para Step Functions:
  - `tests/unit/state-machines/main-orchestration-v1.test.ts`
  - novo cenário de materialização com zero fontes elegíveis, validando `scheduler.contractVersion`, `referenceNow`, `hasEligibleSources`, `summary.eligibleSources` e `summary.processedSources`.

**Validações executadas**

- `npm test -- tests/unit/domain/scheduler/list-eligible-sources.test.ts tests/unit/handlers/scheduler.test.ts tests/unit/infra/sources/dynamodb-scheduler-source-repository.test.ts tests/unit/state-machines/main-orchestration-v1.test.ts --runInBand` ✅
- `npm run lint` ✅
- `npm run typecheck` ✅
- `npm run build` ✅
- `npm run validate:stage-render` ✅
- `npm run validate:stage-package` ⚠️ fallback local por ausência de credenciais AWS no ambiente

**Resultado**

Escopo da issue #51 concluído com foco exclusivo em testes de elegibilidade, concorrência e contrato final da orquestração.
