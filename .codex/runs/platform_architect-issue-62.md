## Issue #62 — [EPIC 6] Criar Lambda consumidora por integração

### Objetivo
Criar estrutura de consumidoras dedicadas por integração, com template reutilizável e configuração isolada por destino.

### Decisão arquitetural desta execução
1. Introduzir factory compartilhada (`createIntegrationConsumerHandler`) para centralizar comportamento comum de consumidoras.
2. Criar handlers dedicados (`salesforce-consumer`, `hubspot-consumer`) com validação de variáveis de ambiente específicas.
3. Integrar funções no `serverless.yml` com bindings SQS por integração, `ReportBatchItemFailures` e roles dedicadas.

### Evidências técnicas verificadas
- `src/handlers/shared/create-integration-consumer-handler.ts`
- `src/handlers/salesforce-consumer.ts`
- `src/handlers/hubspot-consumer.ts`
- `serverless.yml`
- `docs/integrations/consumer-template.md`
- `tests/unit/handlers/shared/create-integration-consumer-handler.test.ts`
- `tests/unit/handlers/salesforce-consumer.test.ts`
- `tests/unit/handlers/hubspot-consumer.test.ts`

### Critérios técnicos de aceite
- [x] Cada integração possui consumidora dedicada.
- [x] Deploy separa configuração por integração.
- [x] Template reutilizável documentado.
