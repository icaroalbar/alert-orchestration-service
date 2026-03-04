**Status de execução — Issue #61**

**Escopo executado**

- Implementada camada de idempotência com DynamoDB para claims de deduplicação.
- Integrada deduplicação antes do `upsert-batch` e antes da publicação SNS.
- Adicionada emissão de métrica de deduplicação por escopo (`upsert`/`event`) via EMF.
- Provisionada tabela de idempotência e permissões IAM mínimas no `serverless.yml`.

**Verificações executadas**

- `npm run lint` ✅
- `npm run typecheck` ✅
- `npm run test -- tests/unit/infra/idempotency/dynamodb-collector-idempotency-repository.test.ts tests/unit/handlers/collector.test.ts --runInBand` ✅
- `npm run build` ✅

**Resultado**

Issue #61 implementada com diff funcional e pronta para fechamento via PR com vínculo explícito `Closes #61`.
