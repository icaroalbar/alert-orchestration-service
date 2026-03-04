## Issue #35 — [EPIC 2] Configurar Retry com backoff exponencial

### Objetivo
Consolidar política de retry da orquestração principal com backoff exponencial e teto finito de tentativas para tarefas críticas.

### Decisões arquiteturais
1. Manter política de retry transitória para `Scheduler` e `InvokeCollector`.
2. Reforçar contrato de segurança operacional: `MaxAttempts` finito para evitar loops infinitos.
3. Acrescentar teste objetivo da presença de backoff exponencial e limites de tentativas.

### Critérios técnicos de aceite
- Falhas transitórias têm retry automático com backoff.
- Tarefas críticas possuem teto finito de tentativas.
- Cobertura automatizada valida política de retry.
