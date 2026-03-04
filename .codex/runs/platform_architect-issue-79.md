## Issue #79 — [EPIC 8] Pipeline GitHub Actions para qualidade

### Objetivo
Fortalecer o workflow de CI para garantir validação completa de qualidade em PR/push, incluindo validação de render e empacotamento multi-stage do Serverless.

### Decisões arquiteturais
1. **Workflow único de qualidade com gates explícitos**
- Manter o workflow `ci.yml` como ponto único de validação de build/teste em `pull_request` e `push`.
- Executar os passos em ordem determinística: instalação, lint, typecheck, testes e validações de stage.

2. **Cobertura de validação de infraestrutura render/package**
- Incluir `npm run validate:stage-render` para detectar drift de configuração por stage.
- Incluir `npm run validate:stage-package` para falhar CI quando o empacotamento for inválido.

3. **Eficiência operacional do CI**
- Habilitar cache de dependências npm via `actions/setup-node` para reduzir tempo médio de pipeline.

4. **Compatibilidade com ambiente sem credenciais AWS**
- Preservar o comportamento atual dos scripts de validação com fallback para cenários de rede/credenciais indisponíveis, evitando falsos negativos no CI.

### Critérios técnicos de aceite
- CI executa lint + typecheck + testes + validação de stage render/package.
- Falhas de render/package quebram o job de qualidade.
- Pipeline roda em PR e push para branches protegidas sem regressão de governança existente.
