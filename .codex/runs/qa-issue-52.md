**QA — Issue #52 (Buscar configuração da fonte na tabela sources)**

**Achados por severidade**

1. Crítico: nenhum.
2. Alto: nenhum bloqueante no escopo.
3. Médio: nenhum.
4. Baixo: `validate:stage-package` depende de credenciais AWS; no ambiente local executou fallback com `build`.

**Checklist de aceite da issue**

- [x] Coletora carrega config por `sourceId` na tabela `sources`.
- [x] Fontes inválidas geram erro controlado e rastreável.
- [x] Campos obrigatórios do schema são validados antes da coleta.

**Evidências de validação**

- `npm test -- tests/unit/domain/collector/load-source-configuration.test.ts tests/unit/handlers/collector.test.ts --runInBand` ✅
- `npm run lint` ✅
- `npm run typecheck` ✅
- `npm run build` ✅
- `npm run validate:stage-render` ✅
- `npm run validate:stage-package` ⚠️ fallback local por ausência de credenciais AWS

**Status final**: **APPROVED**
