**Status de execução — Issue #49**

**Escopo implementado**

- Reserva atômica de execução no domínio do Scheduler:
  - `src/domain/scheduler/list-eligible-sources.ts`
  - contrato de `SourceRepository` evoluído com `reserveNextRun`;
  - validação de schedule por fonte (`interval`/`cron`);
  - recálculo do próximo `nextRunAt` via `calculateNextRunAt` usando `referenceNow` UTC;
  - conflito de concorrência não interrompe o lote (fonte conflitada é descartada da saída).
- Implementação de conditional update no DynamoDB:
  - `src/infra/sources/dynamodb-scheduler-source-repository.ts`
  - leitura de fontes passou a projetar `scheduleType`, `intervalMinutes`, `cronExpr`;
  - `reserveNextRun` usa `UpdateItem` com `ConditionExpression` (`active = true` e `nextRunAt` esperado);
  - conflito (`ConditionalCheckFailedException`) retorna `false` sem erro fatal.
- Repositório in-memory atualizado para novo contrato:
  - `src/infra/sources/in-memory-source-repository.ts`
  - suporte a schedule discriminado e reserva condicional em memória.
- Testes atualizados/adicionados:
  - `tests/unit/domain/scheduler/list-eligible-sources.test.ts`
  - `tests/unit/handlers/scheduler.test.ts`
  - `tests/unit/infra/sources/dynamodb-scheduler-source-repository.test.ts`

**Validações executadas**

- `npm run lint` ✅
- `npm run typecheck` ✅
- `npm run build` ✅
- `npm run test -- tests/unit/domain/scheduler/list-eligible-sources.test.ts tests/unit/handlers/scheduler.test.ts tests/unit/infra/sources/dynamodb-scheduler-source-repository.test.ts --runInBand` ✅
- `npm run validate:stage-render` ✅
- `npm run validate:stage-package` ✅ (fallback esperado por ausência de credenciais AWS)

**Resultado**

Implementação concluída no escopo da issue #49, pronta para PR.
