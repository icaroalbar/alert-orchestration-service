**QA — Issue #69 (Padronizar logs estruturados)**

**Achados por severidade**

1. Crítico: nenhum.
2. Alto: nenhum.
3. Médio: nenhum.
4. Baixo: execução de `validate:stage-package` em fallback local por ausência de credenciais AWS (já previsto em script).

**Checklist de aceite da issue**

- [x] Logs seguem formato JSON consistente em API/scheduler/coletora/consumidoras.
- [x] Correlação (`correlationId`) foi propagada quando disponível.
- [x] Cobertura de testes contempla utilitários de logging e ajustes de contrato.

**Evidências de validação**

- `npm run lint` ✅
- `npm run typecheck` ✅
- `npm run test -- --runInBand` ✅
- `npm run build` ✅
- `npm run validate:stage-render` ✅
- `npm run validate:stage-package` ⚠️ fallback local esperado

**Status final**: **APPROVED**
