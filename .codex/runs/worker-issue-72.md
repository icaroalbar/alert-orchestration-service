**Status de execução — Issue #72**

**Escopo implementado**

- `serverless.yml` (IAM hardening):
  - `MainStateMachineExecutionRole`:
    - removidos recursos wildcard `:${'*'}` de `InvokeSchedulerLambda` e `InvokeCollectorLambda`.
    - invocação permanece restrita aos ARNs explícitos das funções.
  - `CollectorExecutionRole`:
    - removida ação `dynamodb:Query` em `ReadSourceConfiguration` (não utilizada pela coletora).
- Documentação:
  - novo relatório `docs/security/iam-review-2026-03-04.md` com inventário de wildcard remanescente e justificativas.
  - README atualizado com referência ao relatório de revisão IAM.

**Validações executadas**

- `npm run lint` ✅
- `npm run typecheck` ✅
- `npm run test -- --runInBand` ✅
- `npm run build` ✅
- `npm run validate:stage-render` ✅
- `npm run validate:stage-package` ⚠️ fallback local esperado (sem credenciais AWS)

**Resultado**

Issue #72 concluída com redução de permissões desnecessárias e registro formal das exceções de wildcard necessárias.
