**QA — Issue #74 (Validar timeout e retry de lambdas)**

**Achados por severidade**

1. Crítico: nenhum.
2. Alto: nenhum.
3. Médio: nenhum.
4. Baixo: `validate:stage-package` executou fallback de build local por ausência de credenciais AWS no ambiente de execução (comportamento esperado do script).

**Checklist de aceite da issue**

- [x] Perfil de execução por função revisado por stage (`dev/stg/prod`).
- [x] Timeouts e memória ajustados no `serverless.yml` sem hardcode por função.
- [x] Retry operacional de consumidoras alinhado via `maxReceiveCount` por stage.
- [x] Mudanças documentadas para operação/incident response.

**Evidências de validação**

- `npm run lint` ✅
- `npm run typecheck` ✅
- `npm run test -- --runInBand` ✅
- `npm run validate:stage-render` ✅
- `npm run validate:stage-package` ✅ (fallback controlado)

**Status final**: **APPROVED**
