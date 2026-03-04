**Status de execução — Issue #54**

**Escopo implementado**

- Coleta incremental Postgres com query parametrizada e dataset padronizado:
  - `src/domain/collector/collect-postgres-records.ts`
  - compilação de template com `{{cursor}}` para bind params (`$1`, `$2`, ...);
  - execução via boundary `PostgresQueryExecutor`;
  - normalização de linhas para payload serializável (`string | number | boolean | null`).
- Adapter de infraestrutura Postgres com pool controlado:
  - `src/infra/collector/postgres-query-executor.ts`
  - pool cacheado por chave de conexão;
  - parâmetros de pool configuráveis (`maxConnections`, `idleTimeoutMs`, `connectionTimeoutMs`).
- Integração da Lambda coletora com fluxo Postgres:
  - `src/handlers/collector.ts`
  - suporte a `event.cursor` com fallback configurável (`COLLECTOR_DEFAULT_CURSOR`);
  - execução da coleta para `engine=postgres`;
  - retorno com `recordsSent` real e `records` normalizados;
  - log estruturado `collector.source_records.collected`.
- Configuração de ambiente/documentação:
  - `serverless.yml` com variáveis:
    - `COLLECTOR_DEFAULT_CURSOR`
    - `COLLECTOR_POSTGRES_POOL_MAX_CONNECTIONS`
    - `COLLECTOR_POSTGRES_POOL_IDLE_TIMEOUT_MS`
    - `COLLECTOR_POSTGRES_POOL_CONNECTION_TIMEOUT_MS`
  - `README.md` atualizado com parâmetros operacionais da coletora Postgres.
- Cobertura de testes:
  - `tests/unit/domain/collector/collect-postgres-records.test.ts`
  - `tests/unit/handlers/collector.test.ts`
- Dependências adicionadas:
  - `pg`
  - `@types/pg`
  - arquivos atualizados: `package.json`, `package-lock.json`.

**Validações executadas**

- `npm test -- --runInBand` ✅
- `npm run lint` ✅
- `npm run typecheck` ✅
- `npm run build` ✅
- `npm run validate:stage-render` ✅
- `npm run validate:stage-package` ⚠️ fallback local por ausência de credenciais AWS no ambiente

**Resultado**

Issue #54 concluída com conexão Postgres funcional via pool controlado, query incremental com cursor parametrizado e retorno de dataset padronizado no contrato da coletora.
