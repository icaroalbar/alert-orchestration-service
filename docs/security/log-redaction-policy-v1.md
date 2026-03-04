# Política de redaction de logs v1

## Objetivo

Evitar exposição de PII e segredos em logs estruturados da plataforma.

## Padrão de máscara

- Valor mascarado padrão: `[REDACTED]`
- Aplicação: recursiva em payloads (objetos e listas) antes da serialização do log.

## Campos sensíveis mapeados

A redaction é aplicada por nome de chave (case-insensitive), incluindo variações com `_`, `-` e camelCase.

- Segredos e autenticação:
  - `password`
  - `passwd`
  - `secret`
  - `token`
  - `apiKey` / `api_key`
  - `authorization`
  - `cookie`
- PII:
  - `email`
  - `phone` / `mobile`
  - `cpf`
  - `cnpj`
  - `ssn`
  - `document`
  - `birthDate`

## Regra operacional

- Logs novos devem usar o logger estruturado compartilhado para garantir redaction centralizada.
- Testes unitários devem validar que campos sensíveis não aparecem em texto puro.
