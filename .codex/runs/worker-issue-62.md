**Status de execução — Issue #62**

**Escopo executado**

- Criada base reutilizável para consumidoras de integração.
- Implementadas consumidoras dedicadas para Salesforce e HubSpot.
- Atualizado `serverless.yml` com funções, variáveis de destino por stage, logs e vínculo SQS dedicado.
- Documentado template operacional em `docs/integrations/consumer-template.md`.

**Verificações executadas**

- `npm run lint` ✅
- `npm run typecheck` ✅
- `npm run test -- tests/unit/handlers/shared/create-integration-consumer-handler.test.ts tests/unit/handlers/salesforce-consumer.test.ts tests/unit/handlers/hubspot-consumer.test.ts --runInBand` ✅
- `npm run build` ✅

**Resultado**

Issue #62 implementada com diff funcional e pronta para fechamento via PR com vínculo explícito `Closes #62`.
