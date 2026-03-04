**QA — Issue #157 (Tratar autenticação Serverless v4 no validate-stage-package)**

**Achados por severidade**

1. Crítico: nenhum.
2. Alto: nenhum bloqueante.
3. Médio: nenhum.
4. Baixo: `validate:stage-package` em ambiente local segue com fallback por ausência de credenciais AWS (comportamento esperado).

**Checklist de aceite da issue**

- [x] Falha de login/licença do Serverless v4 não gera `UNCLASSIFIED_STAGE_VALIDATION_ERROR` em `validate-stage-package`.
- [x] `validate-stage-package` adota fallback determinístico para erros mapeados.
- [x] Cenário de autenticação/licença coberto por teste automatizado.
- [x] README documenta o comportamento esperado no CI.

**Evidências de validação**

- `npm run lint` ✅
- `npm run typecheck` ✅
- `npm run build` ✅
- `npm test -- tests/unit/scripts/stage-validation-fallbacks.test.ts --runInBand` ✅
- `npm run validate:stage-package` ✅ (fallback local por credenciais)
- Execução simulada com mensagem `Please use "serverless login".` ✅

**Status final**: **APPROVED**
