**Status de execução — Issue #157**

**Escopo implementado**

- Tratamento explícito de autenticação/licença Serverless v4 em `validate-stage-package`:
  - `scripts/validate-stage-package.mjs`
  - erros com mensagem de `serverless login` passam a entrar em fallback conhecido.
- Classificação do motivo do fallback por causa operacional:
  - `credenciais AWS`, `rede`, `autenticação/licença do Serverless v4`.
- Cobertura de regressão adicionada:
  - `tests/unit/scripts/stage-validation-fallbacks.test.ts`
  - novo cenário para erro de autenticação/licença no fluxo de package.
- Documentação atualizada:
  - `README.md` com comportamento de `validate:stage-package` incluindo ausência de login/licença no Serverless v4.

**Validações executadas**

- `npm run lint` ✅
- `npm run typecheck` ✅
- `npm run build` ✅
- `npm test -- tests/unit/scripts/stage-validation-fallbacks.test.ts --runInBand` ✅
- `npm run validate:stage-package` ✅ (fallback local esperado por falta de credenciais AWS)
- Simulação direta de erro `serverless login` via `VALIDATE_STAGE_PACKAGE_COMMAND` ✅ (fallback aplicado)

**Resultado**

Issue #157 concluída com comportamento determinístico no CI para erro de autenticação/licença do Serverless v4 no stage package.
