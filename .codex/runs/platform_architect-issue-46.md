## Issue #46 — [EPIC 3] Atualizar nextRunAt no cadastro/edição de fontes

### Objetivo
Garantir que `nextRunAt` seja calculado automaticamente no backend em UTC durante `POST /sources` e em `PATCH /sources/{id}` quando houver alteração de agenda.

### Decisões arquiteturais
1. **Cálculo centralizado em domínio**
- Criar utilitário dedicado (`src/domain/sources/next-run-at.ts`) para calcular `nextRunAt` com base em `scheduleType`.
- Evitar lógica de data espalhada em handlers.

2. **Regra de cálculo por tipo de agenda**
- `interval`: `nextRunAt = now + intervalMinutes`.
- `cron`: calcular próxima ocorrência em UTC via parser de cron (`cron-parser`).
- Normalizar expressão cron para UTC e validar erro de formato.

3. **Comportamento de API**
- `POST /sources`: ignorar `nextRunAt` de entrada e sempre persistir valor calculado.
- `PATCH /sources/{id}`: recalcular `nextRunAt` quando `scheduleType`, `intervalMinutes` ou `cronExpr` forem alterados.
- Atualizações sem mudança de agenda preservam `nextRunAt` existente.

4. **Governança de contrato**
- Remover `nextRunAt` da lista de campos mutáveis do PATCH para impedir sobrescrita manual.
- Atualizar documentação dos endpoints para explicitar cálculo automático em UTC.

### Critérios técnicos de aceite
- `nextRunAt` é preenchido automaticamente no create.
- `nextRunAt` é recalculado no update quando schedule muda.
- Valor persistido permanece em ISO-8601 UTC.
- Testes unitários cobrindo `interval` e `cron` em create/update.
