**Status de execução — Issue #55**

**Escopo implementado**

- Suporte a coleta incremental para `engine=mysql` no domínio:
  - `src/domain/collector/collect-mysql-records.ts`
  - compilação do template com placeholder `{{cursor}}` para bind `?`;
  - normalização de linhas para formato serializável e compatível com contrato da coletora;
  - erros controlados para template inválido e falha de execução.
- Adapter MySQL em infraestrutura com pool e timeout configuráveis:
  - `src/infra/collector/mysql-query-executor.ts`
  - pool cacheado por chave de conexão;
  - configuração de `maxConnections`, `idleTimeoutMs`, `connectionTimeoutMs` e `queryTimeoutMs`.
- Integração no handler da coletora:
  - `src/handlers/collector.ts`
  - adição de `mySqlQueryExecutorFactory` nas dependências;
  - suporte ao branch `mysql` no fluxo de execução;
  - manutenção do contrato de saída (`records`, `recordsSent`) e logs estruturados.
- Configuração e documentação operacional:
  - `serverless.yml` com variáveis:
    - `COLLECTOR_MYSQL_POOL_MAX_CONNECTIONS`
    - `COLLECTOR_MYSQL_POOL_IDLE_TIMEOUT_MS`
    - `COLLECTOR_MYSQL_POOL_CONNECTION_TIMEOUT_MS`
    - `COLLECTOR_MYSQL_QUERY_TIMEOUT_MS`
  - `README.md` atualizado com parâmetros de coletora SQL (Postgres/MySQL).
- Dependência adicionada:
  - `mysql2` (`package.json` e `package-lock.json`).

**Testes atualizados/adicionados**

- `tests/unit/domain/collector/collect-mysql-records.test.ts`
- `tests/unit/handlers/collector.test.ts`

**Validações executadas**

- `npm run test -- tests/unit/domain/collector/collect-mysql-records.test.ts tests/unit/handlers/collector.test.ts --runInBand` ✅
- `npm run lint` ✅
- `npm run typecheck` ✅
- `npm run test -- --runInBand` ✅
- `npm run build` ✅
- `npm run validate:stage-render` ✅
- `npm run validate:stage-package` ⚠️ fallback local por ausência de credenciais AWS no ambiente

**Resultado**

Issue #55 concluída com suporte MySQL no fluxo da coletora, mantendo o contrato canônico de saída e cobertura unitária para domínio e handler.
