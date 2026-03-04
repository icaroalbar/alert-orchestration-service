**Status de execução — Issue #91**

**Escopo implementado**

- Diagnóstico padronizado para erro não classificado em `validate-stage-render`:
  - `scripts/validate-stage-render.mjs`
  - novo identificador `UNCLASSIFIED_STAGE_VALIDATION_ERROR` com contexto `stage` e `command`.
  - orientação objetiva de próxima ação (modo verbose + revisão de logs).
- Diagnóstico padronizado para erro não classificado em `validate-stage-package`:
  - `scripts/validate-stage-package.mjs`
  - mesmo identificador e contrato de contexto.
- Testabilidade dos scripts por injeção de comando:
  - `VALIDATE_STAGE_RENDER_COMMAND`
  - `VALIDATE_STAGE_PACKAGE_COMMAND`
  - `VALIDATE_STAGE_PACKAGE_FALLBACK_COMMAND`
- Cobertura automatizada de fallback e não-classificado:
  - `tests/unit/scripts/stage-validation-fallbacks.test.ts`

**Resultado**

Issue #91 concluída com fallback diagnóstico explícito para falhas não mapeadas, sem alterar o fluxo de fallback dos erros já classificados.
