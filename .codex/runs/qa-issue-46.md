**QA — Issue #46 (Atualizar nextRunAt no cadastro/edição de fontes)**

**Achados por severidade**

1. Crítico: nenhum.
2. Alto: nenhum bloqueante.
3. Médio: nenhum bloqueante.
4. Baixo: nenhum.

**Checklist de aceite da issue**

- [x] `nextRunAt` é calculado e salvo automaticamente na criação de fonte.
- [x] `PATCH` recalcula `nextRunAt` quando o schedule muda (`scheduleType`, `intervalMinutes`, `cronExpr`).
- [x] Cálculo/persistência usam formato ISO-8601 UTC.

**Evidências de validação**

- `npm run lint` ✅
- `npm run typecheck` ✅
- `npm run test -- --passWithNoTests` ✅
- `npm run build` ✅
- `npm run validate:stage-render` ✅
- `npm run validate:stage-package` ✅ (fallback esperado por ausência de credenciais AWS)

**Status final**: **APPROVED**
