## Issue #33 — [EPIC 2] Implementar Map State dinâmico

### Objetivo
Confirmar e formalizar a entrega do fan-out dinâmico por `sourceId` na orquestração principal, com contrato estável de saída por item e consolidação final da execução.

### Decisão arquitetural desta execução
1. Revalidar o ASL em `develop` contra os critérios de aceite da issue antes de propor alteração funcional.
2. Manter a arquitetura atual, pois o fluxo já atende os requisitos:
- `ProcessEligibleSources` como `Map` com `ItemsPath: $.schedulerResult.sourceIds`.
- `sourceId` propagado via `$$.Map.Item.Value` para a Lambda coletora.
- resultado por item padronizado (`SUCCEEDED`/`FAILED`) e saída consolidada com `results[]` + `summary`.
3. Registrar evidência técnica e QA para fechamento rastreável da issue via PR com `Closes #33`.

### Evidências técnicas verificadas
- `state-machines/main-orchestration-v1.asl.json`
- `tests/unit/state-machines/main-orchestration-v1.test.ts`
- `tests/unit/handlers/collector.test.ts`

### Critérios técnicos de aceite
- [x] Cada fonte elegível gera uma iteração independente.
- [x] `sourceId` chega corretamente à coletora.
- [x] Resultado consolidado é retornado ao final da execução.
