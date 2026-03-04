**Status de execução — Issue #79**

**Escopo implementado**

- Workflow de CI atualizado em `.github/workflows/ci.yml` com gates explícitos:
  - `npm ci`
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test:coverage`
  - `npm run validate:stage-render`
  - `npm run validate:stage-package`
- Cache de dependências npm habilitado no `actions/setup-node@v4`.
- Removida etapa redundante `validate:drift` do pipeline de PR/push em favor de validações diretas de qualidade e empacotamento.

**Resultado**

Issue #79 concluída com pipeline de qualidade cobrindo lint, tipagem, testes e validações de render/package por stage.
