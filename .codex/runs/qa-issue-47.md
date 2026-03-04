**QA — Issue #47 (Ler fontes ativas na Lambda Scheduler)**

**Achados por severidade**

1. Crítico: nenhum.
2. Alto: nenhum bloqueante.
3. Médio: nenhum bloqueante.
4. Baixo: nenhum.

**Checklist de aceite da issue**

- [x] Scheduler consulta fontes ativas (`active=true`) no DynamoDB.
- [x] Leitura é paginada com `LastEvaluatedKey` (sem scan completo em memória).
- [x] Saída interna é normalizada com campos mínimos (`sourceId`, `nextRunAt`).

**Evidências de validação**

- `npm run lint` ✅
- `npm run typecheck` ✅
- `npm run test -- --passWithNoTests` ✅
- `npm run build` ✅
- `npm run validate:stage-render` ✅
- `npm run validate:stage-package` ✅ (fallback esperado por ausência de credenciais AWS)

**Status final**: **APPROVED**
