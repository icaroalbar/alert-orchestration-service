**QA — Issue #91 (Fallback de diagnóstico para falhas não mapeadas)**

**Achados por severidade**

1. Crítico: nenhum.
2. Alto: nenhum.
3. Médio: nenhum.
4. Baixo: nenhum.

**Checklist de aceite da issue**

- [x] `validate-stage-render` emite mensagem de falha não classificada com contexto mínimo.
- [x] `validate-stage-package` emite mensagem de falha não classificada com contexto mínimo.
- [x] Saída inclui orientação objetiva de próxima ação.
- [x] Comportamento de fallback para erros já mapeados foi preservado.
- [x] Cobertura de testes adicionada para cenários não mapeados e mapeados.

**Evidências de validação**

- `npm run lint` ✅
- `npm run typecheck` ✅
- `npm run test -- tests/unit/scripts/stage-validation-fallbacks.test.ts --runInBand` ✅

**Status final**: **APPROVED**
