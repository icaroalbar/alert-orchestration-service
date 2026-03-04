## Issue #189 — [EPIC 6] Ajustar consumidoras SQS para usar apenas correlationId

### Objetivo
Eliminar a deduplicação persistida por repositório de idempotência nas consumidoras SQS e adotar deduplicação orientada exclusivamente por `correlationId` no fluxo de consumo.

### Decisões arquiteturais
1. **Remoção do acoplamento com `CollectorIdempotencyRepository` nas consumidoras**
- `createIntegrationConsumerHandler` deixa de receber `idempotencyRepository`/TTL.
- `salesforce-consumer` e `hubspot-consumer` deixam de instanciar repositório DynamoDB para dedup.

2. **Deduplicação no escopo do lote usando apenas `correlationId`**
- No processamento de cada batch SQS, manter conjunto de `correlationId` já entregues com sucesso.
- Mensagem com `correlationId` repetido no mesmo batch é descartada como deduplicada.
- `tenantId` e `sourceId` deixam de participar de qualquer chave de dedup do consumer.

3. **IAM mínimo alinhado ao novo comportamento**
- Remover permissões `dynamodb:PutItem`/`dynamodb:UpdateItem` das roles das consumidoras, já que não haverá mais gravação de claims de idempotência por elas.

4. **Cobertura de testes orientada ao novo contrato**
- Atualizar testes unitários do handler compartilhado para dedup por `correlationId`.
- Atualizar testes das consumidoras para não mockar `dynamodb-collector-idempotency-repository`.
- Garantir cenário em que mesmo `tenantId` com `correlationId` diferente continua processando.

### Critérios técnicos de aceite
- Consumidoras processam mensagens sem depender de `idempotencyRepository`.
- Deduplicação do consumer usa somente `correlationId`.
- Testes refletem ausência de mocks do repositório de idempotência no fluxo das consumidoras.
- Documentação operacional explicita o comportamento de dedup por `correlationId`.
