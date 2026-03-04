**QA — Issue #57 (Implementar fieldMap para modelo canônico)**

**Achados por severidade**

1. Crítico: nenhum.
2. Alto: nenhum bloqueante.
3. Médio: nenhum.
4. Baixo: `validate:stage-package` executou fallback local esperado por ausência de credenciais AWS no ambiente.

**Checklist de aceite da issue**

- [x] `fieldMap` é aplicado para retorno canônico da coletora.
- [x] Campos não mapeados são tratados (ignorados no payload final).
- [x] Erros de mapeamento obrigatório são rastreáveis por contexto.

**Evidências de validação**

- `npm run lint` ✅
- `npm run typecheck` ✅
- `npm run test -- tests/unit/domain/collector/map-records-with-field-map.test.ts tests/unit/handlers/collector.test.ts --runInBand` ✅
- `npm run test -- --runInBand` ✅
- `npm run build` ✅
- `npm run validate:stage-render` ✅
- `npm run validate:stage-package` ⚠️ fallback local (sem credenciais AWS)

**Status final**: **APPROVED**
