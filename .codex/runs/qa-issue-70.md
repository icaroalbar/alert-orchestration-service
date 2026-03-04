**QA — Issue #70 (Criar métricas customizadas)**

**Achados por severidade**

1. Crítico: nenhum.
2. Alto: nenhum.
3. Médio: nenhum.
4. Baixo: `validate:stage-package` executado em fallback local por ausência de credenciais AWS no ambiente.

**Checklist de aceite da issue**

- [x] Métricas customizadas publicadas para coletora e consumidoras.
- [x] Namespace configurável por stage (`METRICS_NAMESPACE`).
- [x] IAM mínimo para `cloudwatch:PutMetricData` com restrição por namespace.
- [x] Testes unitários adicionados/ajustados para publishers de métricas.

**Evidências de validação**

- `npm run lint` ✅
- `npm run typecheck` ✅
- `npm run test -- --runInBand` ✅
- `npm run build` ✅
- `npm run validate:stage-render` ✅
- `npm run validate:stage-package` ⚠️ fallback local esperado

**Status final**: **APPROVED**
