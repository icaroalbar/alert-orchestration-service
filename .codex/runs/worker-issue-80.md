**Status de execução — Issue #80**

**Escopo implementado**

- Novo workflow `.github/workflows/deploy.yml` criado com estratégia de promoção por stage:
  - `push` em `develop` -> deploy automático em `dev`.
  - `push` em `main` -> deploy automático em `stg`.
  - `workflow_dispatch` -> deploy manual para `dev|stg|prod`.
- Gate de produção implementado:
  - Deploy em `prod` exige `confirm_production=APPROVED`.
  - Job roda com `environment: prod` para suportar aprovação manual de ambiente.
- Segurança e configuração de deploy no workflow:
  - `permissions` mínimas (`contents:read`, `id-token:write`).
  - OIDC com `aws-actions/configure-aws-credentials@v4`.
  - Validação obrigatória de segredos de environment (`AWS_DEPLOY_ROLE_ARN`, `SERVERLESS_ACCESS_KEY`).
- Scripts de deploy adicionados no `package.json`:
  - `sls:deploy:dev`, `sls:deploy:stg`, `sls:deploy:prod`.
- Documentação atualizada:
  - `README.md` com seção de deploy por stage e referência ao workflow.
  - `docs/deployment/stage-deploy-and-rollback.md` com pré-requisitos, promoção e rollback básico.

**Validação executada**

- `npm run lint` ✅
- `npm run typecheck` ✅
- `npm run test -- --runInBand` ✅
- `npm run validate:stage-render` ✅

**Resultado**

Issue #80 concluída com pipeline de deploy por stage, gate manual para produção e runbook de rollback.
