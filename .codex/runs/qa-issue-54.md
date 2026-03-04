**QA — Issue #54 (Implementar conexão Postgres na coletora)**

**Achados por severidade**

1. Crítico: nenhum.
2. Alto: nenhum bloqueante no escopo.
3. Médio: nenhum.
4. Baixo: `validate:stage-package` depende de credenciais AWS; no ambiente local executou fallback de `build`.

**Checklist de aceite da issue**

- [x] Conexão Postgres utiliza credenciais carregadas do Secrets Manager.
- [x] Query incremental é executada com parâmetros bind (sem interpolação do cursor).
- [x] `recordsSent` reflete o total de registros retornados.
- [x] Dataset retornado pela coletora está padronizado e serializável.
- [x] Pool de conexão Postgres está controlado por parâmetros configuráveis.

**Evidências de validação**

- `npm test -- --runInBand` ✅
- `npm run lint` ✅
- `npm run typecheck` ✅
- `npm run build` ✅
- `npm run validate:stage-render` ✅
- `npm run validate:stage-package` ⚠️ fallback local por ausência de credenciais AWS

**Status final**: **APPROVED**
