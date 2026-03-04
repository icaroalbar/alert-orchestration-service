**QA — Issue #48 (Filtrar fontes por `nextRunAt <= now`)**

**Achados por severidade**

1. Crítico: nenhum.
2. Alto: nenhum bloqueante no escopo da issue.
3. Médio: `lint/typecheck/build` seguem falhando no baseline por problema pré-existente em `src/domain/sources/next-run-at.ts` e ausência de `cron-parser`; não introduzido por esta mudança.
4. Baixo: nenhum.

**Checklist de aceite da issue**

- [x] Somente fontes elegíveis (`nextRunAt <= now`) são retornadas.
- [x] Comparação temporal considera UTC (ISO-8601 com `Z`).
- [x] Logs indicam quantidade filtrada (`eligibleSources`).

**Evidências de validação**

- `npm run test -- tests/unit/domain/scheduler/list-eligible-sources.test.ts tests/unit/handlers/scheduler.test.ts tests/unit/infra/sources/dynamodb-scheduler-source-repository.test.ts --runInBand` ✅
- `npm run validate:stage-render` ✅
- `npm run lint` ❌ (baseline fora de escopo)
- `npm run typecheck` ❌ (baseline fora de escopo)
- `npm run build` ❌ (baseline fora de escopo)
- `npm run validate:stage-package` ❌ (bloqueado por `build`)

**Status final**: **APPROVED WITH KNOWN BASELINE GAPS**
