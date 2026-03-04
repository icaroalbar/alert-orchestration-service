# POST /sources (v1)

Endpoint para cadastro de novas fontes no plugin registry.

## Request

- Método: `POST`
- Path: `/sources`
- Header obrigatório: `Authorization: Bearer <jwt>`
- Scope obrigatório: `sources:write`
- Body: contrato `SourceSchemaV1` (ver `docs/sources/source-schema-v1.md`).

## Responses

### `201 Created`

```json
{
  "sourceId": "source-acme",
  "metadata": {
    "schemaVersion": "1.0.0",
    "createdAt": "2026-03-03T12:00:00.000Z",
    "updatedAt": "2026-03-03T12:00:00.000Z",
    "requestId": "req-40"
  }
}
```

### `400 Bad Request`

Body ausente, JSON inválido ou payload inválido conforme regras de `SourceSchemaV1` (campos obrigatórios, formatos e condicionais).

### `401 Unauthorized`

Token JWT ausente, expirado ou inválido no `Authorization`.

### `403 Forbidden`

Token válido sem o scope `sources:write`.

### `409 Conflict`

`sourceId` já existente.

### `500 Internal Server Error`

Falha inesperada na persistência.
