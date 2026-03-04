**Status de execução — Issue #47**

**Escopo implementado**

- Scheduler deixou de usar repositório em memória no fluxo padrão e passou a consumir DynamoDB:
  - novo repositório `src/infra/sources/dynamodb-scheduler-source-repository.ts`;
  - consulta por `Query` no índice `active-nextRunAt-index` com `active = "true"`;
  - paginação via `ExclusiveStartKey`/`LastEvaluatedKey`.
- Domínio do scheduler evoluído para leitura paginada e normalização:
  - `src/domain/scheduler/list-eligible-sources.ts` agora agrega páginas, valida formato mínimo (`sourceId`, `nextRunAt`) e deduplica por `sourceId`.
- Handler do scheduler refatorado para DI e contrato estável de saída:
  - `src/handlers/scheduler.ts` expõe `createHandler` para testes;
  - fluxo padrão exige `SOURCES_TABLE_NAME` e mantém retorno `{ sourceIds, generatedAt, maxConcurrency }`.
- Repositório em memória atualizado para o novo contrato paginado:
  - `src/infra/sources/in-memory-source-repository.ts`.
- Documentação técnica atualizada:
  - `docs/step-functions/main-orchestration-v1.md` com nota de leitura paginada no scheduler.
- Testes adicionados/atualizados:
  - `tests/unit/domain/scheduler/list-eligible-sources.test.ts`
  - `tests/unit/infra/sources/dynamodb-scheduler-source-repository.test.ts`
  - `tests/unit/handlers/scheduler.test.ts`

**Validações executadas**

- `npm run lint` ✅
- `npm run typecheck` ✅
- `npm run test -- --passWithNoTests` ✅
- `npm run build` ✅
- `npm run validate:stage-render` ✅
- `npm run validate:stage-package` ✅ (fallback esperado por ausência de credenciais AWS)

**Resultado**

Implementação concluída no escopo da issue #47, pronta para PR.
