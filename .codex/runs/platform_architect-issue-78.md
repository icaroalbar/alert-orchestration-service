## Issue #78 — [EPIC 8] Testes da state machine

### Objetivo
Aumentar cobertura da ASL principal para validar fluxo nominal e materialização correta no caminho de falha parcial.

### Decisões arquiteturais
1. Preservar testes estruturais existentes da definição ASL.
2. Adicionar simulação de materialização do estado `BuildSchedulerFailureOutput`.
3. Validar payload final de falha com `schedulerStatus=FAILED`, `error` e `cause` consistentes.

### Critérios técnicos de aceite
- Fluxo principal continua coberto.
- Caminho de falha parcial/scheduler failure coberto.
- Transições e payload final críticos protegidos por teste.
