**QA — Issue #154 (Tratar autenticação Serverless v4 no validate-stage-render)**

**Achados por severidade**

1. Crítico: nenhum.
2. Alto: nenhum bloqueante.
3. Médio: nenhum.
4. Baixo: `validate:stage-package` executou fallback local esperado por ausência de credenciais AWS.

**Checklist de aceite da issue**

- [x] Falha de login/licença do Serverless v4 não gera `UNCLASSIFIED_STAGE_VALIDATION_ERROR`.
- [x] `validate-stage-render` adota comportamento determinístico com fallback estático para erros mapeados.
- [x] Fallback estático está alinhado ao ASL atual (`schedulerResult.maxConcurrency`).
- [x] Cenário de autenticação/licença coberto por teste automatizado.
- [x] README documenta comportamento esperado no CI.

**Evidências de validação**

- `npm run lint` ✅
- `npm run typecheck` ✅
- `npm run build` ✅
- `npm test -- tests/unit/scripts/stage-validation-fallbacks.test.ts --runInBand` ✅
- `npm run validate:stage-render` ✅
- `npm run validate:stage-package` ⚠️ fallback local (sem credenciais AWS)

**Status final**: **APPROVED**
