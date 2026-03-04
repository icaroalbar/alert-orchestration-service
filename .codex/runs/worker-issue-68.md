**Status de execução — Issue #68**

**Escopo implementado**

- Script operacional de replay DLQ→fila principal:
  - `scripts/reprocess-dlq.mjs`
  - integrações suportadas: `salesforce`, `hubspot`, `all`.
  - filtros por janela temporal (`--since`, `--until`) usando `SentTimestamp`.
  - limite por execução (`--max-messages`).
  - modo seguro `--dry-run`.
- Auditoria de execução:
  - geração de `batchId`.
  - resumo em JSON (totais, por integração, falhas, filtros aplicados).
  - arquivo padrão em `.codex/runs/dlq-reprocess-<batch>.json` (ou custom via `--audit-file`).
- Garantia de consistência operacional:
  - reenvio preserva `MessageBody`.
  - exclusão da mensagem da DLQ apenas após `SendMessage` bem-sucedido.
  - atributos de replay adicionados (`replayBatchId`, `replayedFromDlq`, `replayedAt`, `replayIntegration`).
- Integração com o projeto:
  - novo script npm: `dlq:reprocess`.
  - dependência adicionada: `@aws-sdk/client-sqs`.
  - documentação operacional: `docs/integrations/dlq-reprocessing.md`.
  - README atualizado com comando e referência de runbook.

**Validações executadas**

- `npm run lint` ✅
- `npm run typecheck` ✅
- `npm run test -- --runInBand` ✅
- `npm run build` ✅
- `npm run validate:stage-render` ✅
- `npm run validate:stage-package` ⚠️ fallback local esperado (sem credenciais AWS)
- `node ./scripts/reprocess-dlq.mjs --integration invalid` ✅ (validação de argumentos)

**Resultado**

Issue #68 implementada com mecanismo manual de replay, filtros operacionais e auditoria rastreável.
