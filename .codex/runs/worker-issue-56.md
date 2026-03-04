**Status de execução — Issue #56**

**Escopo implementado**

- Cursor incremental persistido por fonte na coletora:
  - `src/domain/collector/collector-cursor-repository.ts`
  - contrato de leitura/escrita de cursor e erro de conflito otimista (`CollectorCursorConflictError`).
- Adapter DynamoDB para tabela `cursors`:
  - `src/infra/cursors/dynamodb-collector-cursor-repository.ts`
  - leitura consistente por `source`;
  - escrita condicional com `attribute_not_exists` (primeira execução) ou `updatedAt` esperado (concorrência otimista);
  - mapeamento de `ConditionalCheckFailedException` para erro de domínio.
- Integração no handler da coletora:
  - `src/handlers/collector.ts`
  - leitura do cursor persistido no início da execução;
  - precedência de cursor: `event.cursor` > `cursors.last` > `COLLECTOR_DEFAULT_CURSOR`;
  - extração do cursor mais avançado a partir do `cursorField` dos registros coletados;
  - atualização de cursor somente quando há avanço, com retry em conflito concorrente.
- Documentação operacional:
  - `README.md` atualizado com precedência do cursor e estratégia de atualização otimista.

**Testes adicionados/atualizados**

- `tests/unit/infra/cursors/dynamodb-collector-cursor-repository.test.ts`
  - leitura de snapshot;
  - create inicial com `attribute_not_exists`;
  - update com `expectedUpdatedAt`;
  - conflito condicional mapeado para erro de domínio.
- `tests/unit/handlers/collector.test.ts`
  - uso de cursor persistido na query incremental;
  - atualização do cursor com maior valor coletado;
  - override por `event.cursor`;
  - primeira execução sem cursor persistido (fallback).

**Validações executadas**

- `npm run lint` ✅
- `npm run typecheck` ✅
- `npm run test -- tests/unit/handlers/collector.test.ts tests/unit/infra/cursors/dynamodb-collector-cursor-repository.test.ts --runInBand` ✅
- `npm run test -- --runInBand` ✅
- `npm run build` ✅
- `npm run validate:stage-render` ✅
- `npm run validate:stage-package` ⚠️ fallback local por ausência de credenciais AWS no ambiente

**Resultado**

Issue #56 concluída com leitura e persistência incremental de cursor por fonte, incluindo controle de concorrência otimista para evitar regressão de janela.
