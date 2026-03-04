**Status de execução — Issue #76**

**Escopo implementado**

- Ajuste na suíte `tests/unit/handlers/collector.test.ts`:
  - novo cenário que valida interrupção da execução quando `cursorRepository.save` falha com erro não concorrencial.
- Mantida cobertura existente para:
  - cursor existente/inexistente;
  - primeira execução sem cursor persistido;
  - atualização de cursor no caminho de sucesso.

**Validações executadas**

- `npm test -- tests/unit/handlers/collector.test.ts --runInBand` ✅

**Resultado**

Issue #76 pronta para fechamento com cobertura explícita de falha de persistência do cursor.
