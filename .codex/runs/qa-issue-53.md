**QA — Issue #53 (Buscar credenciais no Secrets Manager)**

**Achados por severidade**

1. Crítico: nenhum.
2. Alto: nenhum bloqueante no escopo.
3. Médio: nenhum.
4. Baixo: `validate:stage-package` depende de credenciais AWS; no ambiente local executou fallback de `build`.

**Checklist de aceite da issue**

- [x] `secretArn` da source é lido e usado para consulta no Secrets Manager.
- [x] Segredo inexistente gera erro controlado e rastreável.
- [x] Retry com backoff é aplicado para falhas transitórias.
- [x] Credenciais são normalizadas para contrato único consumível por adapters.
- [x] Tempo de acesso é monitorável (`durationMs` + `attempts`) sem exposição de segredo em log.

**Evidências de validação**

- `npm test -- --runInBand` ✅
- `npm test -- tests/unit/domain/collector/load-source-credentials.test.ts tests/unit/domain/collector/load-source-configuration.test.ts tests/unit/handlers/collector.test.ts --runInBand` ✅
- `npm run lint` ✅
- `npm run typecheck` ✅
- `npm run build` ✅
- `npm run validate:stage-render` ✅
- `npm run validate:stage-package` ⚠️ fallback local por ausência de credenciais AWS

**Status final**: **APPROVED**
