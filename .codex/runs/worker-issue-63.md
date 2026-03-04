**Status de execução — Issue #63**

**Escopo executado**

- Implementado parser do payload de mensagens SQS em lote no template compartilhado das consumidoras.
- Adicionada validação de schema mínimo e tratamento parcial de falhas por mensagem.
- Ajustadas suítes de testes para cobrir cenários válidos e inválidos com `batchItemFailures`.

**Verificações executadas**

- `npm run lint` ✅
- `npm run typecheck` ✅
- `npm run test -- tests/unit/handlers/shared/create-integration-consumer-handler.test.ts tests/unit/handlers/salesforce-consumer.test.ts tests/unit/handlers/hubspot-consumer.test.ts --runInBand` ✅
- `npm run build` ✅

**Resultado**

Issue #63 implementada com diff funcional e pronta para fechamento via PR com vínculo explícito `Closes #63`.
