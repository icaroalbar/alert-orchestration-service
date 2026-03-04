## Issue #64 — [EPIC 6] Implementar chamada à API externa

### Objetivo
Integrar consumidoras com APIs externas por integração, com mapeamento de payload, classificação de erro HTTP e medição de latência.

### Decisão arquitetural desta execução
1. Criar cliente externo compartilhado (`external-api-client`) com contrato unificado para envio de eventos de cliente.
2. Classificar falhas HTTP em tipos distintos (`4xx` permanente, `5xx` transitório) para suportar estratégias de retry posteriores.
3. Medir e registrar tempo de resposta por chamada em log estruturado.

### Evidências técnicas verificadas
- `src/infra/integrations/external-api-client.ts`
- `src/infra/integrations/fetch-integration-http-client.ts`
- `src/handlers/salesforce-consumer.ts`
- `src/handlers/hubspot-consumer.ts`
- `serverless.yml`
- `tests/unit/infra/integrations/external-api-client.test.ts`
- `tests/unit/handlers/salesforce-consumer.test.ts`
- `tests/unit/handlers/hubspot-consumer.test.ts`

### Critérios técnicos de aceite
- [x] Chamadas externas seguem contrato esperado.
- [x] Erros 4xx e 5xx recebem tratamento distinto.
- [x] Tempo de resposta é registrado.
