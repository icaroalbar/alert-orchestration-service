## Issue #47 — [EPIC 4] Ler fontes ativas na Lambda Scheduler

### Objetivo
Implementar leitura paginada de fontes ativas no Scheduler usando DynamoDB com baixo custo e sem carregar a tabela inteira em memória.

### Decisões arquiteturais
1. **Separar contrato do Scheduler para leitura paginada**
- Evoluir o contrato de `SourceRepository` do domínio de scheduler para expor `listActiveSources` paginado.
- Manter o handler retornando `sourceIds` para não quebrar o contrato externo atual da Step Functions.

2. **Consulta eficiente em DynamoDB com índice dedicado**
- Usar `Query` no GSI `active-nextRunAt-index` com partição `active = "true"`.
- Evitar `Scan` completo para reduzir latência e consumo de RCUs.
- Paginar com `LastEvaluatedKey`/`ExclusiveStartKey` até esgotar resultados.

3. **Normalização mínima para próxima etapa de elegibilidade**
- Normalizar itens ativos para estrutura mínima interna:
  - `sourceId`
  - `nextRunAt`
- Validar shape mínimo e falhar rápido em item inválido para evitar propagação de dados corrompidos.

4. **Evolução incremental sem misturar escopo da #48**
- Nesta issue, carregar apenas fontes ativas com paginação.
- Não aplicar filtro `nextRunAt <= now` ainda (escopo da #48).

5. **Testabilidade por injeção de dependências**
- Expor `createHandler` no scheduler para testes unitários com repositório fake.
- Cobrir cenários de múltiplas páginas e validação de configuração de paginação.

### Critérios técnicos de aceite
- Scheduler consulta fontes ativas via DynamoDB com paginação.
- Não há `Scan` completo no fluxo do scheduler.
- Saída interna é normalizada e utilizada para produzir `sourceIds`.
- Testes unitários cobrem paginação e contrato do handler.
