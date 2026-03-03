# PATCH /sources/{id} — Atualização Parcial de Fonte (v1)

## Objetivo

Atualizar parcialmente uma fonte já cadastrada no plugin registry, preservando campos imutáveis e aplicando controle de concorrência otimista.

## Requisição

- Método: `PATCH`
- Rota: `/sources/{id}`
- `pathParameters.id`: identificador da fonte (`sourceId`)
- Body: JSON com ao menos um campo mutável

## Campos mutáveis

- `active`
- `secretArn`
- `query`
- `cursorField`
- `fieldMap`
- `scheduleType`
- `intervalMinutes`
- `cronExpr`
- `nextRunAt`

## Campos imutáveis

- `sourceId`
- `engine`
- `schemaVersion`
- `createdAt`
- `updatedAt`

Se o payload incluir campos imutáveis ou desconhecidos, a API retorna `422`.

## Controle de versão

A atualização usa optimistic locking em `updatedAt`:

- A API lê o estado atual.
- A gravação só é aceita quando o `updatedAt` em banco ainda é o mesmo lido.
- Em caso de corrida concorrente, retorna `409 SOURCE_VERSION_CONFLICT`.

## Respostas

- `200 OK`
  - `sourceId`
  - `metadata.schemaVersion`
  - `metadata.createdAt`
  - `metadata.updatedAt`
  - `metadata.requestId`
- `404 Not Found`
  - `code: SOURCE_NOT_FOUND`
- `409 Conflict`
  - `code: SOURCE_VERSION_CONFLICT`
- `422 Unprocessable Entity`
  - `message: Source patch validation failed.`
  - `errors[]`
