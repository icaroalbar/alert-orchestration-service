**Status de execução — Issue #154**

**Escopo implementado**

- Tratamento explícito de autenticação/licença Serverless v4 no `validate-stage-render`:
  - `scripts/validate-stage-render.mjs`
  - erros com mensagem de `serverless login` agora entram em fallback conhecido (não classificado como `UNCLASSIFIED_STAGE_VALIDATION_ERROR`).
- Correção do fallback estático para refletir a ASL atual:
  - remoção do check obsoleto de `NormalizeSchedulerOutput`;
  - ajuste de caminhos para `$.schedulerResult.maxConcurrency` em `MaxConcurrencyPath` e `summary.maxConcurrency`.
- Mensagem de fallback padronizada por causa operacional:
  - `rede` ou `autenticação/licença do Serverless v4`.
- Cobertura de regressão adicionada:
  - `tests/unit/scripts/stage-validation-fallbacks.test.ts`
  - novo cenário para erro de login/licença do Serverless v4.
- Documentação atualizada:
  - `README.md` com comportamento esperado de `validate:stage-render` em ambiente sem login/licença.

**Validações executadas**

- `npm run lint` ✅
- `npm run typecheck` ✅
- `npm run build` ✅
- `npm test -- tests/unit/scripts/stage-validation-fallbacks.test.ts --runInBand` ✅
- `npm run validate:stage-render` ✅
- `npm run validate:stage-package` ⚠️ fallback local esperado por ausência de credenciais AWS

**Resultado**

Issue #154 concluída com fallback determinístico para erro de login/licença do Serverless v4 e sem `UNCLASSIFIED_STAGE_VALIDATION_ERROR` nesse cenário.
