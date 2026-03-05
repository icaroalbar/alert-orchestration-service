# Source Schema v1 (`1.0.0`)

Contrato versionado para registro de fontes (`sources`) usado em:

- persistência DynamoDB (`sources` table);
- validação de entrada da API (`/sources`).

## Campos obrigatórios

- `sourceId` (`string`, não vazio)
- `active` (`boolean`)
- `engine` (`postgres` ou `mysql`)
- `secretArn` (`string`, ARN válido do Secrets Manager; pode ficar ausente se `connectionDetails` for fornecido e o backend criar o segredo)
- `query` (`string`, deve conter `{{cursor}}`)
- `cursorField` (`string`, não vazio)
- `fieldMap` (`Record<string, string>`, ao menos um mapeamento)
- `scheduleType` (`interval` ou `cron`)
- `nextRunAt` (`string`, ISO-8601 UTC)

> Para os endpoints de cadastro/edição, `nextRunAt` é calculado automaticamente no backend com base no schedule.

## Campos condicionais

- `scheduleType=interval`:
  - obrigatório `intervalMinutes` (`int`, intervalo `1..10080`)
  - proibido `cronExpr`
- `scheduleType=cron`:
  - obrigatório `cronExpr` (`string`, não vazia)
  - proibido `intervalMinutes`

## Bloco opcional `connectionDetails`

- `connectionDetails` (`object`) é aceito em vez de `secretArn`. Quando fornecido, o backend cria o segredo no AWS Secrets Manager e utiliza o ARN gerado. O objeto deve conter os campos:
  - `host` (`string`, não vazio)
  - `username` (`string`, não vazio)
  - `password` (`string`, não vazio)
  - `database` (`string`, não vazio)
  - `port` (`int`, opcional, entre `1` e `65535`)

## Invalidações explícitas

A validação retorna erros estruturados por campo com:

- `field`
- `code` (`REQUIRED`, `INVALID_TYPE`, `INVALID_ENUM`, `INVALID_FORMAT`, `INVALID_VALUE`, `CONFLICT`)
- `message`

Implementação em `src/domain/sources/source-schema.ts`.
