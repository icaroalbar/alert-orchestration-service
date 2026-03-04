## Issue #48 — [EPIC 4] Filtrar fontes por nextRunAt <= now

### Objetivo
Garantir que o Scheduler retorne apenas fontes elegíveis para execução imediata (`nextRunAt <= now`) com comparação UTC e baixo custo em DynamoDB.

### Decisões arquiteturais
1. **Filtro de elegibilidade no domínio com referência UTC explícita**
- Normalizar e validar `now` como ISO-8601 UTC.
- Aplicar regra `nextRunAt <= now` durante a consolidação de páginas para proteção adicional de consistência.

2. **Otimização da query DynamoDB para reduzir leitura de fontes futuras**
- Quando `now` estiver disponível, usar `KeyConditionExpression` com sort key:
  - `#active = :active AND #nextRunAt <= :nextRunAt`
- Manter fallback para `#active = :active` quando `now` não for informado.

3. **Determinismo temporal no handler**
- Definir `generatedAt` uma única vez por execução.
- Reutilizar `generatedAt` como referência de elegibilidade quando `event.now` não for enviado.

4. **Observabilidade mínima do filtro**
- Registrar log estruturado com:
  - `referenceNow`
  - `eligibleSources`

### Critérios técnicos de aceite
- Apenas fontes com `nextRunAt <= now` são retornadas pelo Scheduler.
- Comparação de tempo ocorre em UTC (timestamps ISO-8601 com `Z`).
- Query no DynamoDB aproveita sort key para elegibilidade quando `now` é fornecido.
- Logs do Scheduler indicam quantidade de fontes elegíveis.
