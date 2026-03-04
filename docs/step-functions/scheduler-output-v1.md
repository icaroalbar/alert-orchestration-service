# Scheduler Output Contract v1 (`scheduler-output.v1`)

Contrato versionado da Lambda `scheduler` consumido diretamente pela state machine principal.

## Objetivo

Padronizar a resposta da Scheduler para que o `Map State` consuma itens `{sourceId, tenantId}` com `maxConcurrency` e contexto de trace sem etapa intermediaria de transformacao.

## Estrutura

- `contractVersion` (`string`, obrigatorio): versao do contrato. Valor fixo `scheduler-output.v1`.
- `sources` (`Array<{sourceId, tenantId}>`, obrigatorio): lista de fontes reservadas para processamento.
- `sourceIds` (`string[]`, obrigatorio): espelho de compatibilidade para consumidores legados.
- `eligibleSources` (`number`, obrigatorio): quantidade de itens em `sources`.
- `hasEligibleSources` (`boolean`, obrigatorio): indica se ha pelo menos uma fonte elegivel.
- `referenceNow` (`string`, obrigatorio, ISO-8601 UTC): relogio usado para elegibilidade/reserva.
- `generatedAt` (`string`, obrigatorio, ISO-8601 UTC): timestamp de geracao da resposta.
- `maxConcurrency` (`number`, obrigatorio): limite de paralelismo para o `Map` (1 a 40).
- `traceContext` (`object`, obrigatorio): contexto W3C para propagacao Scheduler -> Collector.
  - `traceparent` (`string`)
  - `traceId` (`string`, 32 hex)
  - `spanId` (`string`, 16 hex)
  - `traceFlags` (`string`, 2 hex)

## Exemplo com fontes elegiveis

```json
{
  "contractVersion": "scheduler-output.v1",
  "sources": [
    { "sourceId": "crm-a", "tenantId": "tenant-a" },
    { "sourceId": "erp-b", "tenantId": "tenant-b" }
  ],
  "sourceIds": ["crm-a", "erp-b"],
  "eligibleSources": 2,
  "hasEligibleSources": true,
  "referenceNow": "2026-03-04T09:01:00.000Z",
  "generatedAt": "2026-03-04T09:01:00.000Z",
  "maxConcurrency": 5,
  "traceContext": {
    "traceparent": "00-0123456789abcdef0123456789abcdef-0123456789abcdef-01",
    "traceId": "0123456789abcdef0123456789abcdef",
    "spanId": "0123456789abcdef",
    "traceFlags": "01"
  }
}
```

## Exemplo sem fontes elegiveis

```json
{
  "contractVersion": "scheduler-output.v1",
  "sources": [],
  "sourceIds": [],
  "eligibleSources": 0,
  "hasEligibleSources": false,
  "referenceNow": "2026-03-04T09:01:00.000Z",
  "generatedAt": "2026-03-04T09:01:00.000Z",
  "maxConcurrency": 5,
  "traceContext": {
    "traceparent": "00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01",
    "traceId": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "spanId": "bbbbbbbbbbbbbbbb",
    "traceFlags": "01"
  }
}
```

## Compatibilidade

- A evolucao incompativel deste contrato deve gerar novo identificador de versao (ex.: `scheduler-output.v2`).
- A state machine que consumir nova versao deve ser versionada em arquivo dedicado (`main-orchestration-v2.asl.json`).
