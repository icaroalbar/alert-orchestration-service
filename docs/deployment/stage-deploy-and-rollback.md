# Deploy por stage e rollback basico

Este documento define como promover deploys entre `dev`, `stg` e `prod` via GitHub Actions.

## Regras de deploy

- `develop` -> deploy automatico em `dev`.
- `main` -> deploy automatico em `stg`.
- `prod` -> deploy apenas manual via `workflow_dispatch` no workflow `Deploy`.
  - Obrigatorio informar `confirm_production=APPROVED`.
  - Job usa `environment: prod` para suportar approval manual no GitHub Environment.

## Secrets e vars por environment

Cada environment (`dev`, `stg`, `prod`) deve conter:

- `AWS_DEPLOY_ROLE_ARN` (secret): role assumida por OIDC para deploy.
- `SERVERLESS_ACCESS_KEY` (secret): autenticacao do Serverless Framework v4.
- `AWS_REGION` (variable opcional): default `us-east-1`.
- `SECRETS_ALLOWED_ACCOUNT_ID_<STAGE>` (variable): conta AWS permitida para `secretArn` de fontes.
  - `SECRETS_ALLOWED_ACCOUNT_ID_DEV`
  - `SECRETS_ALLOWED_ACCOUNT_ID_STG`
  - `SECRETS_ALLOWED_ACCOUNT_ID_PROD`

No runtime, a politica efetiva e exposta via:

- `SECRETS_ALLOWED_REGION`
- `SECRETS_ALLOWED_ACCOUNT_ID`

Com isso, `POST/PATCH /sources` e `collector` rejeitam `secretArn` incompativel com stage.

## Fluxo de promocao recomendado

1. Merge em `develop` dispara deploy em `dev`.
2. Validar smoke tests e observabilidade em `dev`.
3. Promover para `main` (release flow do time) para deploy automatico em `stg`.
4. Validar `stg` e aprovar mudanca para `prod`.
5. Executar `workflow_dispatch` do workflow `Deploy` com:
   - `stage=prod`
   - `ref=<sha/tag aprovado>`
   - `confirm_production=APPROVED`

## Rollback basico

Quando houver regressao apos deploy:

1. Identificar ultimo commit/tag estavel no stage afetado.
2. Executar novo deploy para o mesmo stage usando `workflow_dispatch` e `ref` do artefato estavel.
3. Confirmar recuperacao com:
   - alarmes operacionais (`docs/observability/operational-alarms-playbook.md`);
   - throughput das filas SQS e DLQ;
   - execucoes da state machine principal.
4. Registrar incidente e abrir issue de follow-up se causa raiz nao estiver coberta.
