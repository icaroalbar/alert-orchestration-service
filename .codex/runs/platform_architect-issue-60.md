## Issue #60 — [EPIC 5] Publicar evento no SNS após persistência

### Objetivo
Publicar eventos de clientes persistidos no tópico SNS, com metadados de `sourceId` e `correlationId`, garantindo que somente persistidos sejam emitidos.

### Decisão arquitetural desta execução
1. Introduzir publisher de infraestrutura dedicado para SNS (`sns-customer-events-publisher`) isolando formato de mensagem e atributos.
2. Integrar publicação no fluxo da coletora após `upsert-batch`, usando exclusivamente `persistedRecords`.
3. Manter contrato explícito no resultado da coletora (`eventsPublished`) para rastreabilidade operacional.

### Evidências técnicas verificadas
- `src/infra/events/sns-customer-events-publisher.ts`
- `src/handlers/collector.ts`
- `tests/unit/infra/events/sns-customer-events-publisher.test.ts`
- `tests/unit/handlers/collector.test.ts`

### Critérios técnicos de aceite
- [x] Evento publicado no tópico SNS configurado.
- [x] Payload carrega `sourceId` e `correlationId`.
- [x] Não há publicação para registros não persistidos.
