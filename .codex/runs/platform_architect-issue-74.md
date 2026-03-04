## Issue #74 — [EPIC 7] Validar timeout e retry de lambdas

### Objetivo
Padronizar timeout, memória e políticas de retry por função com configuração explícita por stage, reduzindo risco de timeout nominal e mantendo controle de custo/latência.

### Decisões arquiteturais
1. **Perfis de runtime por stage no `serverless.yml`**
- Introduzir parâmetros por stage para timeout e memória das funções críticas (`scheduler`, `collector`, `source-registry-api`, `consumer`).
- Evitar valores hardcoded nas funções para que ajustes operacionais fiquem versionados em IaC por ambiente.

2. **Retry de integrações e API oficial versionado por stage**
- Parametrizar em `custom.stages` os limites de tentativas e backoff para:
  - `OFFICIAL_CUSTOMERS_UPSERT_*`
  - `INTEGRATION_HTTP_*`
- Preservar defaults atuais em `dev/stg` e endurecer `prod` com timeout maior e retry mais conservador.

3. **Coerência com alarmes existentes**
- Garantir que thresholds de `Duration p95` permaneçam abaixo do timeout das funções.
- Documentar os novos knobs para operação em incidentes sem hotfix de código.

### Critérios técnicos de aceite
- `serverless.yml` com timeout/memory/retry explícitos por stage e sem regressão de render/package.
- Funções principais com margem operacional entre p95 monitorado e timeout configurado.
- Documentação atualizada para orientar ajuste por stage.
