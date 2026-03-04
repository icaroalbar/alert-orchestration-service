**QA — Issue #189 (Ajustar consumidoras SQS para usar apenas correlationId)**

**Achados por severidade**

1. Crítico: nenhum.
2. Alto: nenhum bloqueante.
3. Médio: nenhum.
4. Baixo: logs de testes exibem `runtime.metrics.publish_failed` em ambiente de teste por ausência de callback de import dinâmico de VM; não afeta status funcional do escopo.

**Checklist de aceite da issue**

- [x] Consumidoras deduplicam mensagens equivalentes por `correlationId`.
- [x] `tenantId`/`sourceId` não participam da chave de dedup das consumidoras.
- [x] Mensagens com `correlationId` distinto continuam sendo processadas, mesmo com `tenantId` igual.
- [x] Testes das consumidoras e handler compartilhado não dependem de mocks de `idempotencyRepository`.
- [x] Documentação atualizada com comportamento de dedup por `correlationId`.

**Evidências de validação**

- `npm run lint` ✅
- `npm run test` ✅

**Status final**: **APPROVED**
