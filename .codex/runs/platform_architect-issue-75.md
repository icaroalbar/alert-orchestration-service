## Issue #75 — [EPIC 8] Testes unitários do fieldMap

### Objetivo
Cobrir cenários críticos de transformação por `fieldMap` para reduzir regressões em payload canônico.

### Decisões arquiteturais
1. Expandir suíte de testes para mapping composto (múltiplos campos canônicos no mesmo registro).
2. Validar estabilidade de tipos escalares canônicos (number/boolean/null).
3. Preservar cobertura de campos ausentes e erro rastreável de campo obrigatório.

### Critérios técnicos de aceite
- Casos simples e compostos cobertos.
- Campos ausentes tratados de forma previsível.
- Conversão/estabilidade de tipos escalares validada na transformação.
