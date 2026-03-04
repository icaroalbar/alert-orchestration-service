**Status de execução — Issue #189**

**Escopo implementado**

- Remoção da dependência de `CollectorIdempotencyRepository` no consumer compartilhado:
  - `src/handlers/shared/create-integration-consumer-handler.ts`
  - deduplicação agora ocorre no lote SQS apenas por `correlationId`;
  - removidos parâmetros `idempotencyRepository` e `idempotencyTtlSeconds`.
- Simplificação dos handlers de integração:
  - `src/handlers/salesforce-consumer.ts`
  - `src/handlers/hubspot-consumer.ts`
  - removidos imports/validação/env bootstrap de idempotência persistida.
- Ajuste de IAM mínimo para consumidoras:
  - `serverless.yml`
  - removidos statements de `dynamodb:PutItem`/`dynamodb:UpdateItem` das roles `SalesforceConsumerExecutionRole` e `HubspotConsumerExecutionRole`;
  - removida env global `CONSUMER_IDEMPOTENCY_TTL_SECONDS` (não utilizada após mudança).
- Documentação atualizada:
  - `README.md`
  - fluxo de ingestão passa a explicitar dedup das consumidoras por `correlationId`.

**Testes atualizados**

- `tests/unit/handlers/shared/create-integration-consumer-handler.test.ts`
  - removida dependência de spy/mocks de idempotency repository;
  - adicionado cenário de dedup por `correlationId` independente de `tenantId/sourceId`;
  - adicionado cenário de `tenantId` duplicado com `correlationId` distinto (processa ambos).
- `tests/unit/handlers/salesforce-consumer.test.ts`
- `tests/unit/handlers/hubspot-consumer.test.ts`
  - removidos mocks de `dynamodb-collector-idempotency-repository`;
  - setup deixa de depender de `IDEMPOTENCY_TABLE_NAME`.

**Validações executadas**

- `npm ci` ✅
- `npm run lint` ✅
- `npm run test` ✅ (35 suites, 173 testes)

**Resultado**

Issue #189 implementada com consumidoras SQS usando deduplicação apenas por `correlationId`, sem repositório de idempotência persistido no fluxo de consumo.
