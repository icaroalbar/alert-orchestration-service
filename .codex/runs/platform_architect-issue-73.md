## Issue #73 — [EPIC 7] Remover logs sensíveis e aplicar redaction

### Objetivo
Impedir exposição de PII e segredos em logs de API, workers e integrações por meio de redaction centralizado.

### Decisão arquitetural
1. **Redaction no ponto único de logging**
- Aplicar saneamento recursivo no `createStructuredLogger` antes de serializar JSON.

2. **Mapa de campos sensíveis por chave**
- Redação por nome de chave (case-insensitive), incluindo variações com `_`, `-` e camelCase.
- Cobertura de segredos (`password`, `secret`, `token`, `authorization`, `apiKey`, `cookie`) e PII (`email`, `phone`, `cpf`, `cnpj`, `document`, etc.).

3. **Máscara padrão única**
- Valor padrão de máscara: `[REDACTED]`.

4. **Governança**
- Política versionada em documentação.
- Teste de regressão garantindo que valores sensíveis não vazem em logs.

### Critérios técnicos de aceite
- [x] Campos sensíveis não aparecem em texto puro nos logs estruturados.
- [x] Máscara segue padrão único definido.
- [x] Teste automatizado falha se dado sensível não for redigido.
