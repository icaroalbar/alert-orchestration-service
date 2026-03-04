**Status de execução — Issue #52**

**Escopo implementado**

- Lookup e validação de configuração da fonte para a coletora:
  - `src/domain/collector/load-source-configuration.ts`
  - inclusão de caso de uso `loadCollectorSourceConfiguration` com validação do schema obrigatório;
  - validação explícita de `active=true`;
  - erros tipados e rastreáveis por cenário (`not found`, `inactive`, `invalid config`).
- Refactor do handler da coletora para usar dependências injetáveis e leitura da tabela `sources`:
  - `src/handlers/collector.ts`
  - adição de `createHandler` para testes;
  - resolução de dependências default com `SOURCES_TABLE_NAME`;
  - reuso de `createDynamoDbSourceRegistryRepository` para `getById`;
  - preservação do contrato de saída (`sourceId`, `processedAt`, `recordsSent`).
- Testes unitários de domínio e handler cobrindo critérios da issue:
  - `tests/unit/domain/collector/load-source-configuration.test.ts`
  - `tests/unit/handlers/collector.test.ts`
  - cenários: sucesso, `sourceId` vazio, fonte ausente, fonte inativa e configuração inválida.

**Validações executadas**

- `npm test -- tests/unit/domain/collector/load-source-configuration.test.ts tests/unit/handlers/collector.test.ts --runInBand` ✅
- `npm run lint` ✅
- `npm run typecheck` ✅
- `npm run build` ✅
- `npm run validate:stage-render` ✅
- `npm run validate:stage-package` ⚠️ fallback local por ausência de credenciais AWS no ambiente

**Resultado**

Escopo da issue #52 concluído com implementação da leitura/validação de configuração da fonte na coletora e cobertura unitária dos cenários de erro controlado.
