**Status de execução — Issue #57**

**Escopo implementado**

- Transformação `fieldMap` no domínio da coletora:
  - `src/domain/collector/map-records-with-field-map.ts`
  - mapeamento `canonicalField -> sourceColumn` para payload canônico;
  - suporte a campos obrigatórios e opcionais (`null` quando opcional ausente);
  - erro rastreável `CollectorFieldMapValidationError` com contexto (`sourceId`, `recordIndex`, `canonicalField`, `sourceColumn`).
- Integração no handler da coletora:
  - `src/handlers/collector.ts`
  - aplicação do `fieldMap` após coleta e antes do retorno;
  - manutenção do cálculo de cursor incremental nos registros coletados brutos (sem regressão de janela);
  - log estruturado para colunas ignoradas pelo `fieldMap` (exceto `cursorField`).
- Documentação operacional:
  - `README.md` atualizado com comportamento do `fieldMap` e regra de obrigatoriedade do `id` quando mapeado.

**Testes adicionados/atualizados**

- `tests/unit/domain/collector/map-records-with-field-map.test.ts`
  - mapeamento canônico;
  - tratamento de campo opcional ausente;
  - erro rastreável para campo obrigatório ausente.
- `tests/unit/handlers/collector.test.ts`
  - assert de retorno canônico da coletora (campos mapeados);
  - cenário de falha por ausência de campo obrigatório `id`.

**Validações executadas**

- `npm run lint` ✅
- `npm run typecheck` ✅
- `npm run test -- tests/unit/domain/collector/map-records-with-field-map.test.ts tests/unit/handlers/collector.test.ts --runInBand` ✅
- `npm run test -- --runInBand` ✅
- `npm run build` ✅
- `npm run validate:stage-render` ✅
- `npm run validate:stage-package` ⚠️ fallback local por ausência de credenciais AWS no ambiente

**Resultado**

Issue #57 concluída com transformação de saída para modelo canônico via `fieldMap`, tratamento explícito de não mapeados e rastreabilidade de erros de mapeamento obrigatório.
