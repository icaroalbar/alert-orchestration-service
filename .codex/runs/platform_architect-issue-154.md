## Issue #154 — [BUG][HIGH] Tratar autenticação Serverless v4 no validate-stage-render

### Objetivo
Eliminar a falha não classificada do CI quando `serverless print` exigir login/licença do Serverless Framework v4, mantendo o check `validate:stage-render` determinístico.

### Decisões arquiteturais
1. **Classificação explícita de erro de autenticação/licença**
- Reconhecer mensagens de login/licença do Serverless v4 como erro conhecido de ambiente.
- Evitar `UNCLASSIFIED_STAGE_VALIDATION_ERROR` para esse caso.

2. **Fallback estático como caminho oficial para ambiente restrito**
- Reaproveitar a estratégia de fallback estático já adotada para indisponibilidade de rede.
- Mensagem de aviso deve indicar a causa (`rede` ou `autenticação/licença`) para facilitar diagnóstico em CI.

3. **Alinhar validação estática com ASL atual**
- Ajustar checks do fallback para refletir a estrutura atual do `main-orchestration-v1.asl.json` (`schedulerResult.maxConcurrency`).
- Remover validação obsoleta de estado inexistente (`NormalizeSchedulerOutput`).

4. **Cobertura de teste de regressão para login Serverless v4**
- Adicionar cenário unitário que simula erro `serverless login` e valida fallback sem `UNCLASSIFIED`.

### Critérios técnicos de aceite
- Erro de login/licença do Serverless v4 é tratado como cenário conhecido no `validate-stage-render`.
- Fallback estático conclui com saída determinística para rede e autenticação/licença.
- Testes unitários cobrem os dois cenários mapeados.
- README explicita o comportamento esperado no CI.
