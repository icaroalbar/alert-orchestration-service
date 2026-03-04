# GET /sources (v1)

Endpoint para listagem paginada das fontes cadastradas no plugin registry.

## Autenticação

- Header obrigatório: `Authorization: Bearer <jwt>`.
- Scope obrigatório: `sources:read`.

## Query Params

- `limit` (opcional): inteiro entre `1` e `100`. Padrão: `25`.
- `nextToken` (opcional): token opaco retornado na página anterior.
- `active` (opcional): `true` ou `false`.
- `engine` (opcional): `postgres` ou `mysql`.

## Response `200 OK`

```json
{
  "items": [
    {
      "sourceId": "source-acme",
      "active": true,
      "engine": "postgres",
      "secretArn": "arn:aws:secretsmanager:us-east-1:123456789012:secret:acme/source-db",
      "query": "select * from customers where updated_at > {{cursor}}",
      "cursorField": "updated_at",
      "fieldMap": {
        "id": "customer_id",
        "email": "email"
      },
      "scheduleType": "interval",
      "intervalMinutes": 30,
      "nextRunAt": "2026-03-03T10:00:00.000Z",
      "schemaVersion": "1.0.0",
      "createdAt": "2026-03-03T09:00:00.000Z",
      "updatedAt": "2026-03-03T09:30:00.000Z"
    }
  ],
  "filters": {
    "active": true,
    "engine": "postgres"
  },
  "pagination": {
    "limit": 25,
    "nextToken": "eyJvZmZzZXQiOjI1LCJhY3RpdmUiOnRydWUsImVuZ2luZSI6InBvc3RncmVzIn0"
  },
  "requestId": "req-42"
}
```

## Responses de erro

### `400 Bad Request`

- `limit`, `active`, `engine` ou `nextToken` inválidos.
- `nextToken` incompatível com os filtros informados.

### `500 Internal Server Error`

- Falha inesperada ao consultar o repositório.

### `401 Unauthorized`

- JWT ausente, expirado ou inválido.

### `403 Forbidden`

- JWT válido sem o scope `sources:read`.
