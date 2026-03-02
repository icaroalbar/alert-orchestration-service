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
- `npm run test:watch`
- `npm run test:coverage`
- `npm run build`
- `npm run package` (atalho para `sls:package:dev`)
- `npm run sls:print:dev`
- `npm run sls:print:stg`
- `npm run sls:print:prod`
- `npm run sls:print:all`
- `npm run sls:package:dev`
- `npm run sls:package:stg`
- `npm run sls:package:prod`
- `npm run sls:package:all`
- `npm run validate:stage-render`
- `npm run validate:stage-package`

## Setup inicial

```bash
npm ci
npm run lint
npm run format:check
npm run typecheck
npm run test
npm run test:coverage
npm run build
npm run validate:stage-render
npm run validate:stage-package
```

## Stages (dev/stg/prod)

O `serverless.yml` usa configuração explícita por stage e naming strategy para evitar colisão entre ambientes.

- Stage default: `dev` (override via `--stage`).
- Prefixo de recursos: `${service}-${stage}`.
- Configurações por ambiente ficam em `custom.stages.dev|stg|prod`.

### Recursos base de dados (DynamoDB)

- Tabela `sources` provisionada por IaC com nome `${service}-${stage}-sources`.
- Chave primária: `sourceId` (HASH).
- GSI operacional: `active-nextRunAt-index` (`active` + `nextRunAt`) para consultas do scheduler.
- TTL habilitado em `expiresAt`.
- Billing mode: `PAY_PER_REQUEST`.

### Validação por stage

Renderização do template por stage:

```bash
npm run validate:stage-render
```

Esse comando tenta executar `sls:print:all`; quando a API do Serverless está indisponível por rede, ele aplica fallback estático no `serverless.yml` e registra aviso.

Empacotamento para os 3 ambientes:

```bash
npm run validate:stage-package
```

Esse comando tenta executar `sls:package:all`; quando credenciais AWS ou conectividade não estão disponíveis, ele faz fallback para `npm run build` e registra aviso.

Empacotamento estrito (requer credenciais AWS válidas no ambiente):

```bash
npm run sls:package:all
```

## Ambiente de testes (isolado)

- Runner: `Jest` com `ts-jest` e `testEnvironment: node`.
- Testes unitários não dependem de AWS nem de credenciais externas.
- Cobertura: `npm run test:coverage` gera relatório em `coverage/`.

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
