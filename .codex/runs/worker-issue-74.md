**Status de execução — Issue #74**

**Escopo implementado**

- `serverless.yml` atualizado para perfis de runtime por stage, removendo hardcode de `memorySize/timeout` nas funções:
  - `scheduler`, `collector`, `salesforceConsumer`, `hubspotConsumer`, `createSource`, `updateSource`, `deleteSource`, `listSource`.
- Novas chaves por stage em `custom.stages.*`:
  - `schedulerMemorySize`, `schedulerTimeoutSeconds`
  - `collectorMemorySize`, `collectorTimeoutSeconds`
  - `consumerMemorySize`, `consumerTimeoutSeconds`
  - `sourceRegistryApiMemorySize`, `sourceRegistryApiTimeoutSeconds`
- Retry operacional de integrações ajustado por stage via SQS redrive:
  - `salesforceQueueMaxReceiveCount`/`hubspotQueueMaxReceiveCount` => `dev=3`, `stg=5`, `prod=8`.
- Documentação atualizada:
  - `README.md` com matriz de runtime por stage e política de `maxReceiveCount` por ambiente.
  - `docs/observability/operational-alarms-playbook.md` com parâmetros operacionais oficiais para tuning.
- Guardrail de validação atualizado:
  - `scripts/validate-stage-render.mjs` agora valida presença dos novos parâmetros por stage.

**Validação executada**

- `npm run lint` ✅
- `npm run typecheck` ✅
- `npm run test -- --runInBand` ✅
- `npm run validate:stage-render` ✅
- `npm run validate:stage-package` ✅ (fallback esperado por ausência de credenciais AWS)

**Resultado**

Issue #74 implementada com ajustes de timeout/memória/retry versionados por stage e sem regressão de qualidade.
