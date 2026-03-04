# OpenTelemetry baseline (Lambda)

## Escopo

Baseline de instrumentacao aplicada nos handlers criticos:

- `scheduler`
- `collector`
- `POST /sources`
- `PATCH /sources/{id}`
- `GET /sources`
- `DELETE /sources/{id}`

## O que foi instrumentado

- Span raiz por execucao de handler.
- Child spans para etapas criticas de IO (repositorio, leitura de credenciais, coleta, upsert, publicacao de eventos, persistencia de cursor e publicacao de metricas).
- Atributos padrao em spans:
  - `service`
  - `stage`
  - `sourceId`
  - `tenantId`
  - `executionId`
- Logs estruturados com evento de contexto de trace:
  - `*.trace_context` para APIs
  - `scheduler.telemetry.trace_context`
  - `collector.telemetry.trace_context`

## Propagacao de contexto (Scheduler -> Step Functions -> Collector)

1. `scheduler` gera `traceContext` no output (`traceparent`, `traceId`, `spanId`, `traceFlags`).
2. A state machine injeta `schedulerResult.traceContext` em `meta.traceContext` de cada item do `Map`.
3. `collector` inicia span raiz usando `meta.traceContext` como parent remoto.

## Variaveis de ambiente

- `SERVICE_NAME`: nome do servico usado em atributos (fallback default: `alert-orchestration-service`).
- `STAGE`: stage ativo (`dev`, `stg`, `prod`).
- `OTEL_SERVICE_NAME` (opcional): override de nome de servico para tracer.

Obs.: o baseline usa provider local (`BasicTracerProvider`) e nao inclui exporter remoto neste escopo.

## Operacao

- Verificar continuidade de trace por `trace_id` e `traceparent` nos logs de `scheduler` e `collector`.
- Em incidentes, correlacionar:
  - `meta.executionId` da orquestracao
  - `trace_id` dos eventos `*.trace_context`
  - `sourceId` e `tenantId` dos eventos de negocio

