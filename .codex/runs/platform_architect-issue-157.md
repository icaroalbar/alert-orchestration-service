## Issue #157 — [BUG][HIGH] Tratar autenticação Serverless v4 no validate-stage-package

### Objetivo
Eliminar falha não classificada no CI quando `serverless package` exigir login/licença do Serverless Framework v4, mantendo `validate:stage-package` determinístico.

### Decisões arquiteturais
1. **Classificação explícita do erro de autenticação/licença**
- Reconhecer mensagens de login/licença do Serverless v4 como erro conhecido de ambiente.
- Evitar `UNCLASSIFIED_STAGE_VALIDATION_ERROR` nesse cenário.

2. **Fallback controlado para build local**
- Reutilizar fallback oficial de `validate-stage-package` com `npm run build`.
- Preservar semântica de sucesso quando o bloqueio for de ambiente (credenciais/rede/autenticação).

3. **Diagnóstico observável no CI**
- Incluir motivo operacional no aviso (`credenciais AWS`, `rede`, `autenticação/licença do Serverless v4`).
- Manter saída padronizada para triagem rápida.

4. **Cobertura de regressão orientada ao bug**
- Adicionar teste dedicado para mensagem `serverless login` no fluxo de package.

### Critérios técnicos de aceite
- Erro de login/licença do Serverless v4 em `validate-stage-package` não gera `UNCLASSIFIED_STAGE_VALIDATION_ERROR`.
- Fallback local é executado com `exit 0` para casos mapeados.
- Teste automatizado cobre o cenário de autenticação/licença.
- README descreve comportamento esperado no CI.
