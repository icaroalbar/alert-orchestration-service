**QA — Issue #34 (Configurar MaxConcurrency)**

**Achados por severidade**

1. Crítico: nenhum.
2. Alto: nenhum.
3. Médio: nenhum.
4. Baixo: nenhum bloqueante.

**Checklist de aceite da issue**

- [x] Map respeita limite de concorrência configurado.
- [x] Valor pode ser alterado por configuração de ambiente sem alteração de código-fonte.
- [x] Configuração está documentada.

**Evidências de validação**

- `tests/unit/handlers/scheduler.test.ts` ✅
- `tests/unit/state-machines/main-orchestration-v1.test.ts` ✅

**Status final**: **APPROVED**
