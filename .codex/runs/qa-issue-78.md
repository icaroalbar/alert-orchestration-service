**QA — Issue #78 (Testes da state machine)**

**Achados por severidade**

1. Crítico: nenhum.
2. Alto: nenhum.
3. Médio: nenhum.
4. Baixo: nenhum bloqueante.

**Checklist de aceite da issue**

- [x] Fluxo principal da SFN coberto.
- [x] Caminho de falha parcial/scheduler failure coberto por teste.
- [x] Payload final crítico de falha validado (`schedulerStatus`, `error`, `cause`).

**Evidências de validação**

- `tests/unit/state-machines/main-orchestration-v1.test.ts` ✅

**Status final**: **APPROVED**
