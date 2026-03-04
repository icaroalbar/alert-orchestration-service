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
- Logging operacional padronizado em JSON via `src/shared/logging/structured-logger.ts`.
- Correlação em handlers HTTP prioriza header `x-correlation-id` com fallback para `requestId`.

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
- `npm run dlq:reprocess -- --integration <salesforce|hubspot|all> [--since ISO] [--until ISO] [--max-messages N] [--dry-run]`
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
- Alarmes de DLQ por integração com métrica `AWS/SQS::ApproximateNumberOfMessagesVisible` e limiar por stage (`salesforceDlqAlarmThreshold` e `hubspotDlqAlarmThreshold`).
- Ações de notificação dos alarmes direcionadas para tópico SNS operacional `${service}-${stage}-dlq-alarms`.
- Logger estruturado aplica redaction recursiva de PII e segredos antes da serialização dos eventos.
  - Máscara padrão: `[REDACTED]`.
  - Política de campos sensíveis: `docs/security/log-redaction-policy-v1.md`.
- Alarmes operacionais de ingestão e integração conectados ao tópico SNS `${service}-${stage}-operational-alarms`:
  - Erros de Lambda (`Errors`): scheduler, coletora, consumidora Salesforce e consumidora HubSpot.
  - Latência p95 de Lambda (`Duration`): scheduler, coletora, consumidora Salesforce e consumidora HubSpot.
  - Falha, timeout e latência p95 da state machine principal (`ExecutionsFailed`, `ExecutionsTimedOut`, `ExecutionTime`).
- Limiares operacionais por stage versionados em `custom.stages.*`:
  - `lambdaErrorAlarmThreshold`
  - `schedulerDurationAlarmThresholdMs`
  - `collectorDurationAlarmThresholdMs`
  - `consumerDurationAlarmThresholdMs`
  - `orchestrationFailureAlarmThreshold`
  - `orchestrationTimeoutAlarmThreshold`
  - `orchestrationDurationP95AlarmThresholdMs`
- Métricas customizadas de runtime publicadas no namespace `AlertOrchestrationService/Runtime` (`METRICS_NAMESPACE`):
  - Coletora por `SourceId`: `CollectorRecordsCollected`, `CollectorRecordsPersisted`, `CollectorRecordsRejected`, `CollectorExecutionSuccess`, `CollectorExecutionFailure`, `CollectorExecutionLatencyMs`.
  - Entrega de integrações por `IntegrationId` + `SourceId`: `IntegrationDeliveryAttempt`, `IntegrationDeliverySuccess`, `IntegrationDeliveryFailure`, `IntegrationDeliveryLatencyMs`.
- Subscription SNS -> SQS explícita para fan-out em ambas as integrações:
  - `SalesforceIntegrationSubscription` conectando `ClientEventsTopic` em `SalesforceIntegrationQueue`.
  - `HubspotIntegrationSubscription` conectando `ClientEventsTopic` em `HubspotIntegrationQueue`.
- Eventos `customer.persisted` publicados pela coletora carregam metadado `integrationTargets` no body e em `MessageAttributes` para rastreio operacional em triagem de DLQ.
- Regra global do EventBridge para disparar a Step Functions principal por stage:
  - Nome da state machine: `${service}-${stage}-orchestration`
  - Nome da regra: `${service}-${stage}-orchestration-schedule`
  - Stage `dev`: `cron(0/30 * * * ? *)`
  - Stage `stg`: `cron(0/15 * * * ? *)`
  - Stage `prod`: `cron(0/5 * * * ? *)`
  - Payload padrão enviado para execução: `trigger`, `source`, `stage`, `service`.
- Controle de paralelismo do `Map State` por stage:
  - Variável de ambiente: `MAP_MAX_CONCURRENCY`.
  - Stage `dev`: `2`
  - Stage `stg`: `5`
  - Stage `prod`: `10`
  - Limites aceitos em runtime: inteiro entre `1` e `40`.
  - Fallback no scheduler quando ausente: `5`.
  - Override sem alteração de código: ajuste `MAP_MAX_CONCURRENCY` no ambiente de execução (pipeline/deploy).
- Coletora SQL (Postgres/MySQL) com pool controlado e cursor incremental:
  - `COLLECTOR_DEFAULT_CURSOR` (fallback inicial quando não existe cursor no evento nem na tabela `cursors`).
  - Precedência do cursor de execução: `event.cursor` > `cursors.last` > `COLLECTOR_DEFAULT_CURSOR`.
  - Atualização do cursor após sucesso da coleta com controle otimista por `updatedAt` (evita regressão em concorrência).
  - Transformação para payload canônico com `fieldMap` (`canonicalField -> sourceColumn`) antes do retorno da coleta.
  - Colunas de origem sem mapeamento são ignoradas no payload final e podem ser auditadas por log estruturado.
  - Campo canônico `id` é tratado como obrigatório quando mapeado em `fieldMap`; ausência gera erro rastreável.
  - `COLLECTOR_POSTGRES_POOL_MAX_CONNECTIONS` (default `5`).
  - `COLLECTOR_POSTGRES_POOL_IDLE_TIMEOUT_MS` (default `10000`).
  - `COLLECTOR_POSTGRES_POOL_CONNECTION_TIMEOUT_MS` (default `5000`).
  - `COLLECTOR_MYSQL_POOL_MAX_CONNECTIONS` (default `5`).
  - `COLLECTOR_MYSQL_POOL_IDLE_TIMEOUT_MS` (default `10000`).
  - `COLLECTOR_MYSQL_POOL_CONNECTION_TIMEOUT_MS` (default `5000`).
  - `COLLECTOR_MYSQL_QUERY_TIMEOUT_MS` (default `5000`).
- API de fontes protegida por JWT Authorizer no HTTP API:
  - Header obrigatório: `Authorization: Bearer <jwt>`.
  - Configuração por stage:
    - `sourceRegistryJwtIssuerUrl`
    - `sourceRegistryJwtAudience`
  - Overrides por ambiente (opcionais):
    - `SOURCE_REGISTRY_JWT_ISSUER_URL_DEV|STG|PROD`
    - `SOURCE_REGISTRY_JWT_AUDIENCE_DEV|STG|PROD`
  - Escopos mínimos por operação:
    - `GET /sources` requer `sources:read`.
    - `POST /sources`, `PATCH /sources/{id}`, `DELETE /sources/{id}` requerem `sources:write`.
  - Contrato de erro de auth no gateway:
    - `401` para token ausente/inválido.
    - `403` para token sem escopo exigido.
- Definição da state machine principal versionada em `state-machines/main-orchestration-v1.asl.json`.
- Contratos de entrada/saída por estado documentados em `docs/step-functions/main-orchestration-v1.md`.
- Contrato versionado da saída do scheduler documentado em `docs/step-functions/scheduler-output-v1.md`.
- Retry com backoff exponencial configurado na state machine para tasks críticas:
  - `Scheduler` e `InvokeCollector` com tentativa para erros transitórios de Lambda:
    - `IntervalSeconds: 2`, `MaxAttempts: 3`, `BackoffRate: 2`.
  - Retry específico para `States.Timeout`:
    - `IntervalSeconds: 5`, `MaxAttempts: 2`, `BackoffRate: 2`.
  - Guardrail de resiliência: número máximo de tentativas explícito para evitar loop infinito.
- Catch por item no `Map State` para tolerância a falha parcial:
  - `InvokeCollector` trata `States.ALL` no escopo da fonte.
  - Falhas de uma fonte não interrompem o processamento das demais.
  - Resultado final inclui status por item (`SUCCEEDED` ou `FAILED`) com rastreabilidade de erro (`error` e `cause`).
- Policy mínima nas filas de integração (`IntegrationQueuesPolicy`) permitindo apenas:
  - `Principal: sns.amazonaws.com`
  - `Action: sqs:SendMessage`
  - `Condition: ArnEquals aws:SourceArn = ClientEventsTopic`
- URLs e ARNs das filas expostos por outputs/exports e variáveis de ambiente:
  - `INTEGRATION_TARGETS` (default `salesforce|hubspot`, também aceita vírgula) para versionar os destinos lógicos no payload publicado.
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
- Alarmes e canal operacional de DLQ expostos por outputs/exports:
  - `DlqAlarmTopicArn`
  - `SalesforceIntegrationDlqVisibleMessagesAlarmName`
  - `SalesforceIntegrationDlqVisibleMessagesAlarmArn`
  - `HubspotIntegrationDlqVisibleMessagesAlarmName`
  - `HubspotIntegrationDlqVisibleMessagesAlarmArn`
- Canal e alarmes operacionais de ingestão/integração expostos por outputs/exports:
  - `OperationalAlarmTopicArn`
  - `SchedulerErrorsAlarmName`
  - `SchedulerDurationP95HighAlarmName`
  - `CollectorErrorsAlarmName`
  - `CollectorDurationP95HighAlarmName`
  - `SalesforceConsumerErrorsAlarmName`
  - `SalesforceConsumerDurationP95HighAlarmName`
  - `HubspotConsumerErrorsAlarmName`
  - `HubspotConsumerDurationP95HighAlarmName`
  - `MainOrchestrationExecutionsFailedAlarmName`
  - `MainOrchestrationExecutionsTimedOutAlarmName`
  - `MainOrchestrationExecutionTimeP95HighAlarmName`

### IAM mínimo por função

- A Lambda `scheduler` usa role dedicada (`${service}-${stage}-scheduler-role`) com:
  - `dynamodb:Query` apenas na tabela `sources` e no índice `active-nextRunAt-index`.
  - `dynamodb:UpdateItem` apenas na tabela `sources`.
  - `logs:CreateLogStream` e `logs:PutLogEvents` apenas no log group `/aws/lambda/${service}-${stage}-scheduler`.
- A state machine principal usa role dedicada (`${service}-${stage}-state-machine-role`) com permissão apenas de `lambda:InvokeFunction` na Lambda scheduler.
- A role da state machine principal invoca Lambdas explicitamente por ARN de função (sem wildcard de versão/alias) para reduzir escopo.
- Roles reservadas para etapas seguintes já provisionadas com escopo mínimo e recursos explícitos:
  - `collector-role` para leitura de config (`sources`), leitura de segredos (`secretsmanager:GetSecretValue`), atualização de cursor (`cursors`) e `sns:Publish` no tópico de eventos.
  - `salesforce-consumer-role` para consumo da fila `SalesforceIntegrationQueue`.
  - `hubspot-consumer-role` para consumo da fila `HubspotIntegrationQueue`.
- Revisão formal de IAM mínima (inventário de wildcards e justificativas): `docs/security/iam-review-2026-03-04.md`.
- ARNs das roles exportados via outputs para reuso em stacks/funções futuras:
  - `SchedulerExecutionRoleArn`
  - `MainStateMachineExecutionRoleArn`
  - `MainStateMachineName`
  - `MainStateMachineArn`
  - `CollectorExecutionRoleArn`
  - `SalesforceConsumerExecutionRoleArn`
  - `HubspotConsumerExecutionRoleArn`

### Validação por stage

Renderização do template por stage:

```bash
npm run validate:stage-render
```

Esse comando tenta executar `sls:print:all`; quando a API do Serverless está indisponível por rede **ou** quando o ambiente não possui autenticação/licença do Serverless Framework v4 (`serverless login`), ele aplica fallback estático no `serverless.yml` e registra aviso.

Empacotamento para os 3 ambientes:

```bash
npm run validate:stage-package
```

Esse comando tenta executar `sls:package:all`; quando credenciais AWS, conectividade ou autenticação/licença do Serverless Framework v4 (`serverless login`) não estão disponíveis, ele faz fallback para `npm run build` e registra aviso.

Empacotamento estrito (requer credenciais AWS válidas no ambiente):

```bash
npm run sls:package:all
```

Reprocessamento manual de mensagens da DLQ para fila principal:

```bash
npm run dlq:reprocess -- --integration all --dry-run --since 2026-03-04T00:00:00Z
```

Guia operacional completo: `docs/integrations/dlq-reprocessing.md`.

Playbook de resposta para alarmes operacionais (ingestão + integrações + Step Functions): `docs/observability/operational-alarms-playbook.md`.

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
