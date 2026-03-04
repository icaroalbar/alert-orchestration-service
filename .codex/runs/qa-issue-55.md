**QA — Issue #55 (Implementar conexão MySQL na coletora)**

**Achados por severidade**

1. Crítico: nenhum.
2. Alto: nenhum bloqueante no escopo.
3. Médio: nenhum.
4. Baixo: `validate:stage-package` depende de credenciais AWS e executou fallback local esperado.

**Checklist de aceite da issue**

- [x] Conexão MySQL funciona no cenário feliz.
- [x] Timeout de query/conexão é configurável e aplicado.
- [x] Interface de retorno permanece compatível com o pipeline da coletora.

**Evidências de validação**

- `npm run test -- tests/unit/domain/collector/collect-mysql-records.test.ts tests/unit/handlers/collector.test.ts --runInBand` ✅
- `npm run lint` ✅
- `npm run typecheck` ✅
- `npm run test -- --runInBand` ✅
- `npm run build` ✅
- `npm run validate:stage-render` ✅
- `npm run validate:stage-package` ⚠️ fallback local (sem credenciais AWS)

**Status final**: **APPROVED**
