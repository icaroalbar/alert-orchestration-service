## Issue #59 — [EPIC 5] Persistir clientes via API oficial (upsert-batch)

### Objetivo
Implementar persistência em lote na API oficial com timeout, retry para erros transitórios (5xx/429) e mapeamento de sucesso parcial.

### Decisão arquitetural desta execução
1. Criar cliente de domínio isolado (`upsert-customers-batch`) para encapsular protocolo HTTP, política de retry e mapeamento de resposta parcial.
2. Integrar o cliente ao `collector` após validação canônica, de forma que apenas registros efetivamente persistidos avancem no retorno.
3. Expor rejeições de persistência de forma estruturada para suportar auditoria e próximos passos de publicação de eventos.

### Evidências técnicas verificadas
- `src/domain/collector/upsert-customers-batch.ts`
- `src/handlers/collector.ts`
- `serverless.yml`
- `tests/unit/domain/collector/upsert-customers-batch.test.ts`
- `tests/unit/handlers/collector.test.ts`

### Critérios técnicos de aceite
- [x] Cliente de upsert-batch com timeout.
- [x] Retry para 429/5xx com backoff exponencial.
- [x] Mapeamento de sucesso parcial entre persistidos e rejeitados.
