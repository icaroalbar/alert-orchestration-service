## Issue #51 — [EPIC 4] Testes de concorrência e elegibilidade do Scheduler

### Objetivo
Consolidar cobertura de testes do Scheduler nos pontos críticos introduzidos nas issues #49 e #50: regra de elegibilidade temporal, disputa concorrente de reserva e contrato final consumido pela Step Functions.

### Decisões arquiteturais
1. **Cobertura orientada a comportamento, sem alterar código de produção**
- Reforçar cenários de fronteira em `listEligibleSources` (incluindo `nextRunAt == now`) para evitar regressão silenciosa na elegibilidade.

2. **Concorrência validada no contrato externo do handler**
- Garantir que conflitos de `conditional update` resultem em `sourceIds=[]` e `hasEligibleSources=false`, sem falha da Lambda.

3. **Contrato SFN validado por materialização do ASL**
- Estender teste da state machine para cenário sem fontes elegíveis, validando preservação de `scheduler.contractVersion`, `referenceNow`, `hasEligibleSources`, `summary.eligibleSources` e `summary.processedSources`.

### Critérios técnicos de aceite
- Testes unitários reproduzem cenários de elegibilidade (incluindo fronteira) e corrida concorrente.
- Contrato final esperado pela SFN é validado com cenário de zero fontes elegíveis.
- Execução local dos testes do escopo passa de forma determinística.
