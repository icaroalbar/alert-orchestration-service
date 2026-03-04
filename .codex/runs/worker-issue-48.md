**Status de execução — Issue #48**

**Escopo implementado**

- Filtro de elegibilidade por tempo UTC no domínio do Scheduler:
  - [src/domain/scheduler/list-eligible-sources.ts](/home/icaro/projetos/cognx/alert-orchestration-service/src/domain/scheduler/list-eligible-sources.ts)
  - validação de `now` em ISO-8601 UTC;
  - regra `nextRunAt <= now` aplicada durante agregação paginada;
  - `now` normalizado propagado para o repositório.
- Determinismo temporal e log de contagem no handler:
  - [src/handlers/scheduler.ts](/home/icaro/projetos/cognx/alert-orchestration-service/src/handlers/scheduler.ts)
  - `generatedAt` calculado uma única vez;
  - fallback para usar `generatedAt` como referência quando `event.now` não existe;
  - log `scheduler.eligible_sources.filtered` com `referenceNow` e `eligibleSources`.
- Otimização de query no DynamoDB:
  - [src/infra/sources/dynamodb-scheduler-source-repository.ts](/home/icaro/projetos/cognx/alert-orchestration-service/src/infra/sources/dynamodb-scheduler-source-repository.ts)
  - `KeyConditionExpression` com `#nextRunAt <= :nextRunAt` quando `now` é informado.

**Testes atualizados**

- [tests/unit/domain/scheduler/list-eligible-sources.test.ts](/home/icaro/projetos/cognx/alert-orchestration-service/tests/unit/domain/scheduler/list-eligible-sources.test.ts)
- [tests/unit/handlers/scheduler.test.ts](/home/icaro/projetos/cognx/alert-orchestration-service/tests/unit/handlers/scheduler.test.ts)
- [tests/unit/infra/sources/dynamodb-scheduler-source-repository.test.ts](/home/icaro/projetos/cognx/alert-orchestration-service/tests/unit/infra/sources/dynamodb-scheduler-source-repository.test.ts)

**Validações executadas**

- `npm run test -- tests/unit/domain/scheduler/list-eligible-sources.test.ts tests/unit/handlers/scheduler.test.ts tests/unit/infra/sources/dynamodb-scheduler-source-repository.test.ts --runInBand` ✅
- `npm run validate:stage-render` ✅
- `npm run lint` ❌ (falha de baseline fora do escopo em `src/domain/sources/next-run-at.ts`)
- `npm run typecheck` ❌ (`cron-parser` ausente no baseline)
- `npm run build` ❌ (`cron-parser` ausente no baseline)
- `npm run validate:stage-package` ❌ (depende de `build`, falha pelo mesmo motivo de baseline)

**Resultado**

Implementação da regra `nextRunAt <= now` concluída no escopo da issue #48, com cobertura unitária e validação de render da stack.
