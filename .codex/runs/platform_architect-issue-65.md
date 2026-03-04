## Issue #65 — [EPIC 6] Implementar retry controlado nas integrações

### Objetivo
Aplicar política de retry baseada em classificação de erro (transitório x permanente), alinhada ao comportamento de visibilidade/reentrega do SQS.

### Decisão arquitetural desta execução
1. Evoluir o template de consumidoras com `classifyError` para decidir `retry` vs `discard` por mensagem.
2. Mapear erros 4xx para permanentes (sem retry) e 5xx para transitórios (com retry) via tipos do cliente externo.
3. Usar `batchItemFailures` somente para transitórios, delegando reentrega ao mecanismo de visibilidade SQS + redrive para DLQ.

### Evidências técnicas verificadas
- `src/handlers/shared/create-integration-consumer-handler.ts`
- `src/handlers/salesforce-consumer.ts`
- `src/handlers/hubspot-consumer.ts`
- `tests/unit/handlers/shared/create-integration-consumer-handler.test.ts`
- `tests/unit/handlers/salesforce-consumer.test.ts`
- `tests/unit/handlers/hubspot-consumer.test.ts`

### Critérios técnicos de aceite
- [x] Erros transitórios são retentados dentro do fluxo SQS.
- [x] Erros permanentes não retornam para retry.
- [x] Política fica explícita e observável em logs por classificação/ação.
