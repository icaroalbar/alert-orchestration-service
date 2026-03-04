# PATCH /sources/{id} — Atualização Parcial de Fonte (v1)

## Objetivo

Atualizar parcialmente uma fonte já cadastrada no plugin registry, preservando campos imutáveis e aplicando controle de concorrência otimista.

## Requisição

- Método: `PATCH`
- Rota: `/sources/{id}`
- Header obrigatório: `Authorization: Bearer <jwt>`
- Scope obrigatório: `sources:write`
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

## Campos imutáveis

- `sourceId`
- `engine`
- `schemaVersion`
- `createdAt`
- `updatedAt`

Se o payload incluir campos imutáveis ou desconhecidos, a API retorna `400`.

## Regras de agenda (`nextRunAt`)

- `nextRunAt` é controlado pelo backend e não pode ser enviado no PATCH.
- Quando `scheduleType`, `intervalMinutes` ou `cronExpr` mudam, o backend recalcula `nextRunAt` em UTC.
- Quando não há mudança de agenda, `nextRunAt` é preservado.

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
- `400 Bad Request`
  - `message: Source payload validation failed.`
  - `errors[]`
- `401 Unauthorized`
  - JWT ausente, expirado ou inválido.
- `403 Forbidden`
  - JWT válido sem o scope `sources:write`.
