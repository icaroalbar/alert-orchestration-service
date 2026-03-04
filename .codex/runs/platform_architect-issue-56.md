## Issue #56 — [EPIC 5] Implementar cursor incremental

### Objetivo
Evoluir a Lambda coletora para usar cursor persistido por fonte na tabela `cursors`, com atualização condicional para evitar regressão de janela em execuções concorrentes.

### Decisões arquiteturais
1. **Repositório de cursor dedicado no domínio/infra**
- Introduzir contrato `CollectorCursorRepository` no domínio da coletora.
- Implementar adapter DynamoDB para leitura (`GetItem`) e escrita condicional (`UpdateItem`) na tabela `cursors`.
- Modelar erro explícito de conflito otimista (`CollectorCursorConflictError`).

2. **Resolução de cursor com precedência previsível**
- Prioridade: `event.cursor` (quando informado) > cursor persistido em `cursors.last` > `COLLECTOR_DEFAULT_CURSOR`.
- Cobrir primeira execução sem cursor persistido com fallback seguro.

3. **Atualização incremental após sucesso da execução da coletora**
- Derivar cursor candidato a partir do maior valor encontrado em `records[cursorField]`.
- Atualizar cursor apenas quando houver avanço real (nunca retroceder).
- Persistir `updatedAt` para suportar controle de concorrência otimista.

4. **Concorrência e atomicidade**
- Escrita condicional com `expectedUpdatedAt` para detectar corrida entre execuções.
- Em conflito, reler snapshot mais recente e reaplicar apenas se ainda houver avanço necessário.

5. **Observabilidade e testabilidade**
- Adicionar logs estruturados para carga e avanço de cursor.
- Expandir testes unitários da coletora e do repositório DynamoDB para cenários de primeira execução, avanço e conflito.

### Critérios técnicos de aceite
- Coletora lê cursor persistido por fonte antes da query incremental.
- Primeira execução sem cursor persistido funciona com fallback configurável.
- Cursor é atualizado apenas em avanço, com atualização condicional para evitar overwrite concorrente.
- Cobertura unitária contempla caminho feliz e conflito otimista.
