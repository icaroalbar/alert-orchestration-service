## Issue #55 — [EPIC 5] Implementar conexão MySQL na coletora

### Objetivo
Adicionar adapter de leitura incremental para fontes `mysql` na Lambda coletora, preservando o mesmo contrato de entrada/saída já usado no fluxo `postgres`.

### Decisões arquiteturais
1. **Boundary dedicado em `infra` para MySQL com cache de pool por conexão**
- Criar `mysql-query-executor.ts` em `src/infra/collector`.
- Reutilizar pool por chave de conexão para reduzir cold-path de conexão em invocações subsequentes.
- Controlar parâmetros de pool/timeout por variáveis de ambiente com validação de faixa.

2. **Use case de coleta incremental isolado no domínio**
- Criar `collect-mysql-records.ts` em `src/domain/collector`.
- Compilar template incremental com placeholder `{{cursor}}` para bind seguro com `?`.
- Reaproveitar normalização de dataset para manter contrato serializável e compatível com pipeline.

3. **Integração no handler sem regressão do fluxo Postgres**
- Injetar `mysqlQueryExecutorFactory` nas dependências do handler.
- Adicionar branch `engine=mysql` no `switch` mantendo `postgres` intacto.
- Preservar `recordsSent` e logs estruturados com contagem de registros.

4. **Timeout explícito e observável**
- Configurar timeout de query (`COLLECTOR_MYSQL_QUERY_TIMEOUT_MS`) e timeout de conexão/pool.
- Propagar erro controlado no domínio para facilitar troubleshooting sem vazar detalhes sensíveis.

5. **Testabilidade e compatibilidade de contrato**
- Cobrir unit tests de:
  - compilação de query com cursor;
  - sucesso/falha no fluxo MySQL;
  - integração do handler com engine `mysql`.
- Garantir que formato de retorno (`records`, `recordsSent`) permanece compatível com o pipeline existente.

### Critérios técnicos de aceite
- Conexão MySQL funcional no caminho feliz.
- Timeout de conexão/query respeitado e validado por configuração.
- Retorno padronizado compatível com contrato atual da coletora.
- Cobertura unitária para sucesso e erro controlado no fluxo MySQL.
