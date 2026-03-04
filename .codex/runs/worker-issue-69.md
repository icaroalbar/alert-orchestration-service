**Status de execução — Issue #69**

**Escopo implementado**

- Logger estruturado compartilhado:
  - `src/shared/logging/structured-logger.ts`
  - padrão JSON com `level`, `timestamp`, `component`, `event` e contexto sem campos `undefined`.
- Resolução de correlação compartilhada:
  - `src/shared/logging/correlation-id.ts`
  - header `x-correlation-id` (case-insensitive) com fallback para `requestId`.
- Adoção em runtime:
  - `src/handlers/scheduler.ts` (logger estruturado + `correlationId` quando disponível).
  - `src/handlers/collector.ts` (logger default migrado para estruturado).
  - `src/handlers/create-source.ts`
  - `src/handlers/update-source.ts`
  - `src/handlers/delete-source.ts`
  - `src/handlers/list-sources.ts`
  - `src/handlers/shared/create-integration-consumer-handler.ts` (inclui correlação em falhas por registro).
  - `src/infra/integrations/external-api-client.ts` (inclui `correlationId` no log de chamada externa).
- Testes atualizados:
  - `tests/unit/handlers/scheduler.test.ts`
  - `tests/unit/infra/integrations/external-api-client.test.ts`
  - `tests/unit/shared/logging/structured-logger.test.ts`
  - `tests/unit/shared/logging/correlation-id.test.ts`
- README atualizado com nota de logging estruturado e correlação.

**Validações executadas**

- `npm run lint` ✅
- `npm run typecheck` ✅
- `npm run test -- --runInBand` ✅
- `npm run build` ✅
- `npm run validate:stage-render` ✅
- `npm run validate:stage-package` ⚠️ fallback local esperado (sem credenciais AWS)

**Resultado**

Issue #69 implementada com padronização de logs estruturados e correlação aplicada nos componentes principais da plataforma.
