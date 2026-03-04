**Status de execução — Issue #66**

**Escopo implementado**

- Rastreabilidade de integração nos eventos publicados pela coletora:
  - `src/infra/events/sns-customer-events-publisher.ts`
  - adição de `integrationTargets` no body do evento e em `MessageAttributes`.
  - validação de configuração não vazia e normalização dos destinos.
- Configuração da coletora para resolver destinos de integração:
  - `src/handlers/collector.ts`
  - novo resolver `INTEGRATION_TARGETS` com suporte a separadores `|` e `,`.
- Configuração de ambiente por stage:
  - `serverless.yml`
  - inclusão de `INTEGRATION_TARGETS` com default seguro.
- Validação estática de stage endurecida para fluxo de consumidoras com DLQ:
  - `scripts/validate-stage-render.mjs`
  - novos checks para handlers das consumidoras, `ReportBatchItemFailures`, `deadLetterTargetArn` e env de roteamento.
- Ajuste de payload para rastreio downstream:
  - `src/infra/integrations/external-api-client.ts`
  - inclusão de `integrationId` no payload enviado para API externa.
- Documentação:
  - `README.md`
  - registro do metadado `integrationTargets` e variável `INTEGRATION_TARGETS`.

**Testes adicionados/atualizados**

- `tests/unit/infra/events/sns-customer-events-publisher.test.ts`
  - valida `MessageAttributes.integrationTargets`.
  - valida `integrationTargets` no body publicado.
  - valida erro em configuração vazia.
- `tests/unit/infra/integrations/external-api-client.test.ts`
  - valida `integrationId` no payload enviado à API externa.

**Validações executadas**

- `npm install` ✅
- `npm run lint` ✅
- `npm run typecheck` ✅
- `npm run test -- tests/unit/infra/events/sns-customer-events-publisher.test.ts tests/unit/infra/integrations/external-api-client.test.ts tests/unit/handlers/shared/create-integration-consumer-handler.test.ts --runInBand` ✅
- `npm run test -- --runInBand` ✅
- `npm run validate:stage-render` ✅
- `npm run validate:stage-package` ⚠️ fallback local esperado (sem credenciais AWS)

**Resultado**

Issue #66 implementada com diff funcional em rastreabilidade de integração e validação de configuração DLQ/consumidoras.
