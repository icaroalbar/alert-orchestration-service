## Issue #63 — [EPIC 6] Implementar consumo SQS nas consumidoras

### Objetivo
Implementar parser de eventos SQS em lote com validação mínima de schema e retorno granular de `batchItemFailures`.

### Decisão arquitetural desta execução
1. Evoluir o template compartilhado das consumidoras para parsear payload JSON e validar contrato mínimo do evento (`eventType`, `sourceId`, `correlationId`, `publishedAt`, `customer`).
2. Processar lote com isolamento por mensagem, marcando apenas itens inválidos em `batchItemFailures`.
3. Preservar compatibilidade com as consumidoras dedicadas criadas na issue #62.

### Evidências técnicas verificadas
- `src/handlers/shared/create-integration-consumer-handler.ts`
- `tests/unit/handlers/shared/create-integration-consumer-handler.test.ts`
- `tests/unit/handlers/salesforce-consumer.test.ts`
- `tests/unit/handlers/hubspot-consumer.test.ts`

### Critérios técnicos de aceite
- [x] Parser de evento SQS em lote implementado.
- [x] `batchItemFailures` retornado por item inválido.
- [x] Validação de schema mínimo aplicada sem abortar lote completo.
