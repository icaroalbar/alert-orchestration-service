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

### Recursos base de dados e eventos (DynamoDB + SNS)

- Tabela `sources` provisionada por IaC com nome `${service}-${stage}-sources`.
- Chave primária: `sourceId` (HASH).
- GSI operacional: `active-nextRunAt-index` (`active` + `nextRunAt`) para consultas do scheduler.
- TTL habilitado em `expiresAt`.
- Billing mode: `PAY_PER_REQUEST`.
- Tabela `cursors` provisionada por IaC com nome `${service}-${stage}-cursors`.
- Chave primária: `source` (HASH), voltada para leitura e update incremental por fonte.
- Criptografia padrão DynamoDB habilitada (`SSEEnabled: true`).
- Tópico SNS `client-events` por stage: `${service}-${stage}-client-events`.
- Criptografia em repouso do tópico SNS via `KmsMasterKeyId: alias/aws/sns`.
- ARN do tópico exposto por output/export e variável de ambiente `CLIENT_EVENTS_TOPIC_ARN`.
- Policy gerenciada dedicada (`collector-sns-publish`) para publicação da coletora com escopo mínimo em `sns:Publish` no tópico.
- Filas SQS dedicadas por integração e por stage:
  - Salesforce: `${service}-${stage}-salesforce-events`
  - HubSpot: `${service}-${stage}-hubspot-events`
- Retenção de mensagens configurada explicitamente (`MessageRetentionPeriod: 1209600`), com `VisibilityTimeout: 60` e long polling (`ReceiveMessageWaitTimeSeconds: 20`).
- DLQ dedicada por integração e por stage:
  - Salesforce DLQ: `${service}-${stage}-salesforce-events-dlq`
  - HubSpot DLQ: `${service}-${stage}-hubspot-events-dlq`
- Redrive policy habilitada nas filas principais com `maxReceiveCount` versionado por integração.
- Subscription SNS -> SQS explícita para fan-out em ambas as integrações:
  - `SalesforceIntegrationSubscription` conectando `ClientEventsTopic` em `SalesforceIntegrationQueue`.
  - `HubspotIntegrationSubscription` conectando `ClientEventsTopic` em `HubspotIntegrationQueue`.
- Policy mínima nas filas de integração (`IntegrationQueuesPolicy`) permitindo apenas:
  - `Principal: sns.amazonaws.com`
  - `Action: sqs:SendMessage`
  - `Condition: ArnEquals aws:SourceArn = ClientEventsTopic`
- URLs e ARNs das filas expostos por outputs/exports e variáveis de ambiente:
  - `SALESFORCE_INTEGRATION_QUEUE_URL`
  - `SALESFORCE_INTEGRATION_QUEUE_ARN`
  - `HUBSPOT_INTEGRATION_QUEUE_URL`
  - `HUBSPOT_INTEGRATION_QUEUE_ARN`
  - `SALESFORCE_INTEGRATION_DLQ_URL`
  - `SALESFORCE_INTEGRATION_DLQ_ARN`
  - `HUBSPOT_INTEGRATION_DLQ_URL`
  - `HUBSPOT_INTEGRATION_DLQ_ARN`
- ARNs das subscriptions SNS -> SQS expostos por outputs/exports:
  - `SalesforceIntegrationSubscriptionArn`
  - `HubspotIntegrationSubscriptionArn`

### IAM mínimo por função

- A Lambda `scheduler` usa role dedicada (`${service}-${stage}-scheduler-role`) com:
  - `dynamodb:Query` apenas na tabela `sources` e no índice `active-nextRunAt-index`.
  - `dynamodb:UpdateItem` apenas na tabela `sources`.
  - `logs:CreateLogStream` e `logs:PutLogEvents` apenas no log group `/aws/lambda/${service}-${stage}-scheduler`.
- A state machine principal usa role dedicada (`${service}-${stage}-state-machine-role`) com permissão apenas de `lambda:InvokeFunction` na Lambda scheduler.
- Roles reservadas para etapas seguintes já provisionadas com escopo mínimo e recursos explícitos:
  - `collector-role` para leitura de config (`sources`), atualização de cursor (`cursors`) e `sns:Publish` no tópico de eventos.
  - `salesforce-consumer-role` para consumo da fila `SalesforceIntegrationQueue`.
  - `hubspot-consumer-role` para consumo da fila `HubspotIntegrationQueue`.
- ARNs das roles exportados via outputs para reuso em stacks/funções futuras:
  - `SchedulerExecutionRoleArn`
  - `MainStateMachineExecutionRoleArn`
  - `CollectorExecutionRoleArn`
  - `SalesforceConsumerExecutionRoleArn`
  - `HubspotConsumerExecutionRoleArn`

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
