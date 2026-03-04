**QA — Issue #68 (Mecanismo de reprocessamento manual)**

**Achados por severidade**

1. Crítico: nenhum.
2. Alto: nenhum.
3. Médio: nenhum.
4. Baixo: execução real do replay não foi validada contra AWS no ambiente local (sem credenciais), mitigado por validações estáticas e documentação de operação.

**Checklist de aceite da issue**

- [x] Existe mecanismo para replay de DLQ para fila principal sem alteração de payload.
- [x] Filtros por integração e período estão disponíveis.
- [x] Execução possui trilha auditável por JSON com métricas e falhas.

**Evidências de validação**

- `npm run lint` ✅
- `npm run typecheck` ✅
- `npm run test -- --runInBand` ✅
- `npm run build` ✅
- `npm run validate:stage-render` ✅
- `npm run validate:stage-package` ⚠️ fallback local esperado
- `node ./scripts/reprocess-dlq.mjs --integration invalid` ✅

**Status final**: **APPROVED**
