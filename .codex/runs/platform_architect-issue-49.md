## Issue #49 — [EPIC 4] Atualizar nextRunAt com conditional update

### Objetivo
Reservar a próxima execução de cada fonte elegível no Scheduler usando update condicional no DynamoDB para eliminar corrida entre execuções paralelas da orquestração.

### Decisões arquiteturais
1. **Reserva atômica por fonte no repositório de Scheduler**
- Evoluir o contrato de `SourceRepository` para incluir `reserveNextRun`.
- Implementar `UpdateItem` condicional no DynamoDB com condição em `active` e `nextRunAt` esperado.
- Em conflito (`ConditionalCheckFailedException`), retornar status de não-reservado sem lançar erro bloqueante.

2. **Recalcular `nextRunAt` no domínio com regra de schedule da própria fonte**
- Expandir payload de leitura do Scheduler para incluir `scheduleType`, `intervalMinutes`/`cronExpr`.
- Calcular próximo `nextRunAt` com `calculateNextRunAt`, usando `referenceNow` UTC da execução.

3. **Resiliência a concorrência sem interromper lote**
- Se a reserva falhar por conflito, a fonte é descartada da saída (`sourceIds`) e o lote continua.
- Erros não-concorrentes (ex.: shape inválido) permanecem falhas reais.

4. **Testabilidade da reserva atômica**
- Cobrir domínio com cenário de conflito concorrente.
- Cobrir infraestrutura DynamoDB com `UpdateItem` condicional e retorno `false` em conflito.

### Critérios técnicos de aceite
- `nextRunAt` é atualizado com `ConditionExpression` por fonte elegível.
- Conflitos de concorrência não quebram a execução total do Scheduler.
- Somente fontes efetivamente reservadas entram em `sourceIds`.
- Regras `interval`/`cron` são respeitadas no cálculo do novo `nextRunAt`.
