**QA — Issue #49 (Atualizar nextRunAt com conditional update)**

**Achados por severidade**

1. Crítico: nenhum.
2. Alto: nenhum bloqueante.
3. Médio: nenhum bloqueante no escopo.
4. Baixo: `validate:stage-package` executou fallback local por ausência de credenciais AWS no ambiente, sem impacto no escopo funcional da issue.

**Checklist de aceite da issue**

- [x] `nextRunAt` é atualizado com `ConditionExpression` no DynamoDB.
- [x] Conflito concorrente não causa falha total da execução.
- [x] Somente fontes reservadas entram no resultado (`sourceIds`).
- [x] Recalculo de próximo `nextRunAt` respeita regra de schedule (`interval`/`cron`).

**Evidências de validação**

- `npm run lint` ✅
- `npm run typecheck` ✅
- `npm run build` ✅
- `npm run test -- tests/unit/domain/scheduler/list-eligible-sources.test.ts tests/unit/handlers/scheduler.test.ts tests/unit/infra/sources/dynamodb-scheduler-source-repository.test.ts --runInBand` ✅
- `npm run validate:stage-render` ✅
- `npm run validate:stage-package` ✅ (fallback esperado)

**Status final**: **APPROVED**
