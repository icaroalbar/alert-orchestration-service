## Issue #68 — [EPIC 6] Criar mecanismo de reprocessamento manual

### Objetivo
Fornecer replay operacional de mensagens da DLQ para fila principal sem edição manual de payload, com filtros e trilha de auditoria.

### Decisão arquitetural
1. **Ferramenta operacional via script Node.js**
- Implementar comando `npm run dlq:reprocess` para uso controlado em incidentes.
- Reaproveitar SDK SQS já adotado no ecossistema AWS da plataforma.

2. **Filtros de replay para reduzir risco operacional**
- Filtro por integração (`salesforce|hubspot|all`).
- Janela temporal por `SentTimestamp` (`--since` / `--until`).
- Limite máximo de mensagens por execução (`--max-messages`).
- Modo seguro `--dry-run`.

3. **Auditoria explícita por execução**
- Gerar `batchId` único.
- Persistir resumo JSON com métricas por integração, totais e falhas.
- Adicionar atributos de replay em cada mensagem reenfileirada.

4. **Sem mutação de payload de negócio**
- Reenvio preserva `MessageBody` original.
- Exclusão da mensagem na DLQ ocorre apenas após `SendMessage` bem-sucedido.

### Critérios técnicos de aceite
- [x] Replay DLQ→fila principal funciona sem editar payload manualmente.
- [x] Filtros por integração e período disponíveis.
- [x] Execução gera trilha auditável com falhas e contadores.
