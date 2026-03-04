## Issue #80 — [EPIC 8] Deploy por stage com GitHub Actions

### Objetivo
Automatizar deploy multi-stage com promoção controlada (`dev`/`stg` automáticos por regra de branch e `prod` com aprovação manual) e documentação operacional de rollback.

### Decisões arquiteturais
1. **Regra de promoção por branch + dispatch manual**
- Push em `develop` dispara deploy automático para `dev`.
- Push em `main` dispara deploy automático para `stg`.
- `prod` só pode ser implantado via `workflow_dispatch` com confirmação explícita.

2. **Gate de produção em dois níveis**
- `environment: prod` no job de deploy para integração com approvals do GitHub Environment.
- Validação obrigatória de input manual (`confirm_production`) para reduzir risco de promoção acidental.

3. **Deploy idempotente com Serverless v4**
- Adicionar scripts `sls:deploy:<stage>` no `package.json`.
- Reutilizar build e autenticação por secrets de ambiente (`SERVERLESS_ACCESS_KEY`, `AWS_DEPLOY_ROLE_ARN`).

4. **Operação e rollback**
- Criar runbook dedicado com pré-requisitos, fluxo de promoção e rollback básico por stage.

### Critérios técnicos de aceite
- Workflow cobre `dev`, `stg` e `prod` com regras claras de disparo.
- `prod` exige ação manual explícita antes do deploy.
- Segredos por ambiente documentados.
- Procedimento de rollback básico disponível para operação.
