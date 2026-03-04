## Issue #57 — [EPIC 5] Implementar fieldMap para modelo canônico

### Objetivo
Aplicar `fieldMap` da fonte para transformar registros brutos coletados (colunas de origem) em registros canônicos de cliente, mantendo rastreabilidade de erro e sem afetar o fluxo incremental de cursor.

### Decisões arquiteturais
1. **Transformação explícita no domínio da coletora**
- Introduzir módulo dedicado `map-records-with-field-map` no domínio.
- Contrato: receber `sourceId`, `records` e `fieldMap` (`canonicalField -> sourceColumn`) e retornar registros canônicos.

2. **Separação entre cursor incremental e payload canônico**
- Manter cálculo de cursor sobre registros coletados (normalizados por driver), usando `cursorField` original da fonte.
- Aplicar `fieldMap` apenas para composição do payload de saída (`result.records`), evitando regressão no controle de cursor.

3. **Campos obrigatórios e opcionais**
- Suportar configuração de campos obrigatórios no transformador (lista explícita).
- No handler inicial, usar regra conservadora: `id` é obrigatório quando presente no `fieldMap`; demais campos mapeados são opcionais.
- Campo opcional ausente no registro de origem vira `null` no payload canônico.

4. **Tratamento de campos não mapeados**
- Colunas retornadas pela query sem mapeamento em `fieldMap` são ignoradas no payload canônico.
- Publicar log estruturado com contagem de colunas ignoradas por execução para rastreabilidade operacional.

5. **Erros de mapeamento rastreáveis**
- Criar erro de domínio específico com contexto (`sourceId`, `recordIndex`, `canonicalField`, `sourceColumn`, motivo`).
- Quando campo obrigatório estiver ausente/nulo, falhar com erro determinístico para facilitar diagnóstico e retry.

### Critérios técnicos de aceite
- Coletora retorna registros no formato canônico baseado em `fieldMap`.
- Campos não mapeados não vazam no payload final.
- Falha de mapeamento obrigatório expõe contexto suficiente para troubleshooting.
- Fluxo de cursor incremental permanece funcional e coberto por testes.
