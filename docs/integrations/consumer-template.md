# Integration Consumer Template

Base pattern adopted for dedicated integration consumers (`salesforce` and `hubspot`):

1. Create integration-specific handler file in `src/handlers/<integration>-consumer.ts`.
2. Reuse `createIntegrationConsumerHandler` from `src/handlers/shared/create-integration-consumer-handler.ts`.
3. Configure integration-specific destination URL via env var:
- `SALESFORCE_INTEGRATION_TARGET_BASE_URL`
- `HUBSPOT_INTEGRATION_TARGET_BASE_URL`
4. Bind each function to its own SQS queue and execution role in `serverless.yml`.

This template keeps rollout/configuration isolated per integration while preserving shared behavior.
