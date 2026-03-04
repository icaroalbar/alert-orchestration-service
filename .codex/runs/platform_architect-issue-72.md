## Issue #72 — [EPIC 7] Revisar IAM mínimo da plataforma

### Objetivo
Auditar e reduzir permissões IAM excedentes, mantendo funcionamento do fluxo serverless e rastreabilidade da decisão.

### Decisão arquitetural
1. **Hardening direto em políticas críticas**
- Remover wildcard de invocação Lambda na role da state machine principal.
- Remover ação DynamoDB não utilizada da role da coletora.

2. **Exceções de wildcard documentadas**
- Manter somente wildcards estritamente necessários por limitação da AWS (`logs delivery` / `PutMetricData`) ou requisito de plugin dinâmico (`secretArn` variável).

3. **Governança de segurança**
- Registrar revisão em relatório versionado com evidências técnicas e justificativas explícitas.

### Critérios técnicos de aceite
- [x] Permissões excedentes removidas.
- [x] Princípio de menor privilégio reforçado nas roles revisadas.
- [x] Relatório de revisão publicado em documentação.
