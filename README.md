# alert-orchestration-service

Plataforma serverless de ingestão multi-fonte e orquestração de eventos na AWS.

## Requisitos

- Node.js 20.x (LTS)
- npm 10+

## Diretriz arquitetural

A base do serviço é **TypeScript obrigatório**.

- Código de aplicação deve ser criado em `.ts`.
- `src/` não deve conter `.js` de runtime.
- Validação mínima local: `npm run lint && npm run format:check && npm run typecheck && npm run test && npm run build`.

## Scripts

- `npm run lint`
- `npm run lint:fix`
- `npm run format`
- `npm run format:check`
- `npm run typecheck`
- `npm run test`
- `npm run test:coverage`
- `npm run build`
- `npm run package` (atalho para `sls:package:dev`)
- `npm run sls:print:dev`
- `npm run sls:print:stg`
- `npm run sls:print:prod`
- `npm run sls:package:dev`
- `npm run sls:package:stg`
- `npm run sls:package:prod`

## Setup inicial

```bash
npm ci
npm run lint
npm run format:check
npm run typecheck
npm run test
npm run build
npm run sls:print:dev
npm run sls:package:dev
```

## Estrutura de pastas

```text
src/
  handlers/    # Entradas Lambda
  domain/      # Casos de uso e regras de negócio
  infra/       # Adaptadores de infraestrutura
  shared/      # Utilitários compartilhados
tests/         # Testes automatizados
```

Detalhes e convenções estão em `src/README.md`.
