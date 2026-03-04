## Issue #69 — [EPIC 7] Padronizar logs estruturados

### Objetivo
Padronizar logs JSON com campos de correlação e contexto operacional em API, scheduler, coletora e consumidoras.

### Decisão arquitetural
1. **Logger estruturado único**
- Introduzir utilitário compartilhado `createStructuredLogger` com payload JSON consistente:
  - `level`, `timestamp`, `component`, `event` + contexto.

2. **Resolução de correlação reutilizável**
- Introduzir `resolveCorrelationId` para handlers HTTP:
  - prioriza header `x-correlation-id`;
  - fallback para `requestId`.

3. **Adoção incremental nos pontos críticos**
- Scheduler e coletora migram para logger estruturado.
- API de fontes (`create/update/delete/list`) recebe logs de entrada, rejeição e desfecho.
- Consumidoras e cliente externo passam a registrar correlação explicitamente (`correlationId`).

4. **Segurança e estabilidade**
- Não alterar contratos de negócio.
- Limitar mudança a observabilidade e tipagem de eventos (`headers` opcionais em handlers HTTP).

### Critérios técnicos de aceite
- [x] Logs em JSON consistente nos componentes-alvo.
- [x] Correlação presente via `correlationId` quando disponível.
- [x] Cobertura de testes atualizada para novos campos de log e utilitários compartilhados.
