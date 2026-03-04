# DLQ Reprocessing

Manual replay utility for integration DLQs:

- Source queues:
  - `SALESFORCE_INTEGRATION_DLQ_URL`
  - `HUBSPOT_INTEGRATION_DLQ_URL`
- Target queues:
  - `SALESFORCE_INTEGRATION_QUEUE_URL`
  - `HUBSPOT_INTEGRATION_QUEUE_URL`

## Command

```bash
npm run dlq:reprocess -- --integration all --since 2026-03-04T00:00:00Z --until 2026-03-04T23:59:59Z --max-messages 200
```

## Options

- `--integration`: `salesforce`, `hubspot` or `all` (default: `all`)
- `--since`: ISO-8601 lower bound for message `SentTimestamp`
- `--until`: ISO-8601 upper bound for message `SentTimestamp`
- `--max-messages`: upper bound for scanned messages (default: `200`)
- `--dry-run`: evaluate eligibility without enqueue/delete
- `--audit-file`: custom JSON output path (default: `.codex/runs/dlq-reprocess-<batch>.json`)

## Audit trail

Each execution writes a JSON summary with:

- `batchId`
- timestamps (`startedAt`, `finishedAt`)
- filters used
- totals (scanned, eligible, replayed, deleted, failed)
- per-integration counters
- failure reasons by message

Replayed messages receive extra attributes:

- `replayBatchId`
- `replayedFromDlq=true`
- `replayedAt`
- `replayIntegration`

## Operational notes

- Prefer `--dry-run` before effective replay in production.
- Replay deletes from DLQ only after successful send to target queue.
- Use narrow `--since/--until` windows during incidents to reduce blast radius.
- Incident workflow and severities are documented in `docs/observability/operational-alarms-playbook.md`.
- During incident response, attach the generated audit JSON to the incident timeline.
