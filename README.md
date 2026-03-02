# alert-orchestration-service

Plataforma serverless de ingestão multi-fonte e orquestração de eventos na AWS.

## Requisitos

- Node.js 20.x (LTS)
- npm 10+

## Scripts

- `npm run lint`
- `npm run test`
- `npm run test:coverage`
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
npm run test
npm run sls:print:dev
npm run sls:package:dev
```
