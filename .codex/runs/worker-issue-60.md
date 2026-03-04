**Status de execução — Issue #60**

**Escopo executado**

- Criado publisher SNS para eventos de clientes persistidos.
- Integrada publicação no handler da coletora após retorno de persistência parcial/total.
- Atualizado contrato de saída da coletora com `eventsPublished`.

**Verificações executadas**

- `npm run lint` ✅
- `npm run typecheck` ✅
- `npm run test -- tests/unit/infra/events/sns-customer-events-publisher.test.ts tests/unit/handlers/collector.test.ts --runInBand` ✅
- `npm run build` ✅

**Resultado**

Issue #60 implementada com diff funcional e pronta para fechamento via PR com vínculo explícito `Closes #60`.
