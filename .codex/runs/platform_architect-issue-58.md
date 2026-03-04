## Issue #58 — [EPIC 5] Validar modelo canônico Cliente

### Objetivo
Aplicar validação versionada do modelo canônico de cliente na coletora para separar registros válidos e rejeitados com motivo explícito.

### Decisão arquitetural desta execução
1. Introduzir componente de domínio dedicado (`validateCanonicalCustomerBatch`) com `schemaVersion` fixo e contrato estável de validação.
2. Manter transformação por `fieldMap` como etapa anterior e adicionar validação canônica sem interromper execução total por lote parcialmente inválido.
3. Expor no resultado da coletora apenas registros válidos para próxima etapa de persistência, mantendo rejeições auditáveis no payload/log.

### Evidências técnicas verificadas
- `src/domain/collector/validate-canonical-customer-batch.ts`
- `src/handlers/collector.ts`
- `tests/unit/domain/collector/validate-canonical-customer-batch.test.ts`
- `tests/unit/handlers/collector.test.ts`

### Critérios técnicos de aceite
- [x] Schema canônico versionado (`1.0.0`).
- [x] Registros válidos e inválidos separados com motivo claro.
- [x] Apenas válidos seguem no resultado processável da coletora.
