## Issue #34 — [EPIC 2] Configurar MaxConcurrency

### Objetivo
Consolidar contrato operacional do `MaxConcurrency` do Map da SFN por stage, com limites e override sem alteração de código-fonte.

### Decisões arquiteturais
1. Manter `MaxConcurrencyPath` dinâmico (`$.schedulerResult.maxConcurrency`) na ASL.
2. Formalizar defaults por stage (`dev=2`, `stg=5`, `prod=10`) e limites de runtime (`1..40`).
3. Documentar override operacional via variável `MAP_MAX_CONCURRENCY` no ambiente de execução.

### Critérios técnicos de aceite
- Map respeita limite configurável por stage.
- Valor pode ser ajustado por configuração de ambiente.
- Documentação explicita defaults, limites e override.
