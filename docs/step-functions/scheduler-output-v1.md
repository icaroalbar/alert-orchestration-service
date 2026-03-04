# Scheduler Output Contract v1 (`scheduler-output.v1`)

Contrato versionado da Lambda `scheduler` consumido diretamente pela state machine principal.

## Objetivo

Padronizar a resposta da Scheduler para que o `Map State` consuma `sourceIds` e `maxConcurrency` sem etapa intermediaria de transformacao.

## Estrutura

- `contractVersion` (`string`, obrigatorio): versao do contrato. Valor fixo `scheduler-output.v1`.
- `sourceIds` (`string[]`, obrigatorio): lista de fontes reservadas para processamento.
- `eligibleSources` (`number`, obrigatorio): quantidade de itens em `sourceIds`.
- `hasEligibleSources` (`boolean`, obrigatorio): indica se ha pelo menos uma fonte elegivel.
- `referenceNow` (`string`, obrigatorio, ISO-8601 UTC): relogio usado para elegibilidade/reserva.
- `generatedAt` (`string`, obrigatorio, ISO-8601 UTC): timestamp de geracao da resposta.
- `maxConcurrency` (`number`, obrigatorio): limite de paralelismo para o `Map` (1 a 40).

## Exemplo com fontes elegiveis

```json
{
  "contractVersion": "scheduler-output.v1",
  "sourceIds": ["crm-a", "erp-b"],
  "eligibleSources": 2,
  "hasEligibleSources": true,
  "referenceNow": "2026-03-04T09:01:00.000Z",
  "generatedAt": "2026-03-04T09:01:00.000Z",
  "maxConcurrency": 5
}
```

## Exemplo sem fontes elegiveis

```json
{
  "contractVersion": "scheduler-output.v1",
  "sourceIds": [],
  "eligibleSources": 0,
  "hasEligibleSources": false,
  "referenceNow": "2026-03-04T09:01:00.000Z",
  "generatedAt": "2026-03-04T09:01:00.000Z",
  "maxConcurrency": 5
}
```

## Compatibilidade

- A evolucao incompativel deste contrato deve gerar novo identificador de versao (ex.: `scheduler-output.v2`).
- A state machine que consumir nova versao deve ser versionada em arquivo dedicado (`main-orchestration-v2.asl.json`).
