## Issue #50 — [EPIC 4] Retornar lista de sourceIds para Step Functions

### Objetivo
Definir e publicar um contrato versionado de saída da Lambda Scheduler que possa ser consumido diretamente pela Step Functions, incluindo metadados operacionais e comportamento explícito quando não houver fontes elegíveis.

### Decisões arquiteturais
1. **Contrato versionado no boundary Scheduler -> SFN**
- Introduzir campo `contractVersion` no resultado da Scheduler.
- Manter payload estável com `sourceIds`, `eligibleSources`, `hasEligibleSources`, `referenceNow`, `generatedAt` e `maxConcurrency`.
- Evitar acoplamento da SFN a regras internas do domínio da Scheduler.

2. **Consumo direto no Map State sem etapa de transformação**
- Remover normalização intermediária (`Pass`) entre `Scheduler` e `Map`.
- Configurar `ProcessEligibleSources.ItemsPath` para ler diretamente `$.schedulerResult.sourceIds`.
- Configurar `MaxConcurrencyPath` para `$.schedulerResult.maxConcurrency`.

3. **Comportamento explícito para lote vazio**
- Garantir que `sourceIds` seja sempre array (inclusive vazio).
- Publicar `hasEligibleSources=false` e `eligibleSources=0` quando não houver fontes.
- Preservar execução bem-sucedida da orquestração com `results=[]`.

4. **Documentação de contrato e rastreabilidade**
- Documentar o contrato v1 da Scheduler em arquivo dedicado.
- Atualizar doc da state machine principal para refletir o consumo direto.
- Cobrir cenário vazio e cenário com fontes no teste da Scheduler e no teste de contrato da SFN.

### Critérios técnicos de aceite
- Scheduler retorna contrato versionado e estável para SFN.
- Step Functions consome `schedulerResult` diretamente no Map, sem transformação adicional.
- Caso sem elegíveis é explícito no payload e não gera falha na execução.
- Contrato documentado e validado por testes automatizados.
