**QA — Issue #35 (Retry com backoff exponencial)**

**Achados por severidade**

1. Crítico: nenhum.
2. Alto: nenhum.
3. Médio: nenhum.
4. Baixo: nenhum bloqueante.

**Checklist de aceite da issue**

- [x] Retry por falhas transitórias configurado para scheduler e coletora.
- [x] Backoff exponencial validado por teste.
- [x] Execução sem loop infinito (tentativas finitas) validada por teste/documentação.

**Evidências de validação**

- `tests/unit/state-machines/main-orchestration-v1.test.ts` ✅

**Status final**: **APPROVED**
