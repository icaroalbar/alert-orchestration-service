**QA — Issue #50 (Retornar lista de sourceIds para Step Functions)**

**Achados por severidade**

1. Crítico: nenhum.
2. Alto: nenhum bloqueante.
3. Médio: nenhum bloqueante no escopo.
4. Baixo: `validate:stage-package` executou fallback local por ausência de credenciais AWS no ambiente, sem impacto no contrato da issue.

**Checklist de aceite da issue**

- [x] Payload do Scheduler expõe `sourceIds` + metadados operacionais (`referenceNow`, `generatedAt`, `maxConcurrency`).
- [x] Contrato versionado explicitamente (`contractVersion`).
- [x] Caso sem elegíveis é explícito (`sourceIds=[]`, `eligibleSources=0`, `hasEligibleSources=false`).
- [x] Step Functions consome `schedulerResult` diretamente no `Map` sem etapa de transformação adicional.
- [x] Contrato documentado.

**Evidências de validação**

- `npm run lint` ✅
- `npm run typecheck` ✅
- `npm run build` ✅
- `npm run test -- tests/unit/handlers/scheduler.test.ts tests/unit/state-machines/main-orchestration-v1.test.ts --runInBand` ✅
- `npm run validate:stage-render` ✅
- `npm run validate:stage-package` ✅ (fallback esperado)

**Status final**: **APPROVED**
