**Status de execução — Issue #75**

**Escopo implementado**

- Ampliação de cobertura em `tests/unit/domain/collector/map-records-with-field-map.test.ts`:
  - cenário de mapping composto com múltiplos campos canônicos;
  - cenário de estabilidade de tipos escalares (`number`, `boolean`, `null`) e fallback `null` para campo ausente.

**Validações executadas**

- `npm test -- tests/unit/domain/collector/map-records-with-field-map.test.ts --runInBand` ✅

**Resultado**

Issue #75 pronta para fechamento com cobertura crítica de fieldMap reforçada.
