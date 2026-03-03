# DELETE /sources/{id} — Desativação Lógica de Fonte (v1)

## Objetivo

Desativar uma fonte do plugin registry com **soft delete** (`active=false`), mantendo rastreabilidade e sem remover o registro da tabela.

## Requisição

- Método: `DELETE`
- Rota: `/sources/{id}`
- `pathParameters.id`: identificador da fonte (`sourceId`)

## Comportamento

- Se a fonte estiver ativa, a API marca `active=false`.
- Se a fonte já estiver inativa, a API retorna sucesso sem nova mutação (idempotência).
- O registro permanece em banco para auditoria e troubleshooting.

## Respostas

- `204 No Content`
  - fonte desativada com sucesso;
  - ou chamada repetida para fonte já inativa.
- `400 Bad Request`
  - `pathParameters.id` ausente ou vazio.
- `404 Not Found`
  - `code: SOURCE_NOT_FOUND`
- `409 Conflict`
  - `code: SOURCE_VERSION_CONFLICT` quando ocorre corrida concorrente e a fonte segue ativa após revalidação.
- `500 Internal Server Error`
  - falha inesperada na persistência.
