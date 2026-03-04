## Issue #77 — [EPIC 8] Testes do Scheduler

### Objetivo
Fortalecer cobertura do Scheduler para elegibilidade, concorrência e contrato de saída para a Step Functions.

### Decisões arquiteturais
1. Preservar testes existentes de filtro por `nextRunAt` e conflito concorrente.
2. Adicionar validação explícita do payload contratual final (`scheduler-output.v1`).
3. Validar propagação de `executionId` para `correlationId` em logging estruturado.

### Critérios técnicos de aceite
- Regras de elegibilidade e conflito concorrente cobertas.
- Saída contratual para SFN validada por teste.
- `correlationId` propagado no log do scheduler.
