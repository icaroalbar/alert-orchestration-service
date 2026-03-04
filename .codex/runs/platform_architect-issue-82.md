## Issue #82 — [EPIC 8] Runbook operacional (incidentes, DLQ e reprocessamento)

### Objetivo
Fechar lacunas operacionais do runbook com definicao clara de severidade, donos e fluxo reproduzivel de triagem/replay de DLQ.

### Decisões arquiteturais
1. Introduzir matriz de severidade com SLA de resposta e escalonamento.
2. Definir papeis operacionais durante incidentes (Incident Commander, responsavel tecnico, comunicacao).
3. Adicionar checklist rapido de triagem/replay com evidencias obrigatorias (audit JSON).

### Critérios técnicos de aceite
- Runbook cobre cenarios principais de falha.
- Operacao consegue executar replay com passos objetivos.
- Tempo de resposta e responsaveis ficam explicitamente definidos.
