## Issue #61 — [EPIC 5] Garantir idempotência da coletora

### Objetivo
Evitar duplicidade em upsert e publicação SNS durante retries/reexecuções da mesma janela, com rastreabilidade de deduplicação.

### Decisão arquitetural desta execução
1. Introduzir repositório de idempotência em DynamoDB com claim condicional por chave (`attribute_not_exists`).
2. Aplicar deduplicação em dois escopos independentes: `upsert` e `event`, usando chave composta por escopo/fonte/cursor/recordId.
3. Emitir métrica de deduplicação em formato EMF via logs para monitoramento operacional.

### Evidências técnicas verificadas
- `src/domain/collector/collector-idempotency-repository.ts`
- `src/infra/idempotency/dynamodb-collector-idempotency-repository.ts`
- `src/handlers/collector.ts`
- `serverless.yml`
- `tests/unit/infra/idempotency/dynamodb-collector-idempotency-repository.test.ts`
- `tests/unit/handlers/collector.test.ts`

### Critérios técnicos de aceite
- [x] Reprocessamento da mesma janela não duplica upsert/publicação.
- [x] Estratégia cobre upsert e evento.
- [x] Métrica de deduplicação é emitida.
