**QA — Issue #80 (Deploy por stage com GitHub Actions)**

**Achados por severidade**

1. Crítico: nenhum.
2. Alto: nenhum.
3. Médio: nenhum.
4. Baixo: execução real do deploy não foi disparada no ambiente local (validação limitada a qualidade de código e render de configuração).

**Checklist de aceite da issue**

- [x] Workflow de deploy criado com seleção/derivação de stage.
- [x] Deploy em `dev` e `stg` automático por regra de branch.
- [x] `prod` com aprovação explícita via input + `environment`.
- [x] Secrets por ambiente documentados.
- [x] Rollback básico documentado.

**Evidências de validação**

- `npm run lint` ✅
- `npm run typecheck` ✅
- `npm run test -- --runInBand` ✅
- `npm run validate:stage-render` ✅

**Status final**: **APPROVED**
