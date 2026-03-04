**QA — Issue #67 (CloudWatch Alarm para DLQ)**

**Achados por severidade**

1. Crítico: nenhum.
2. Alto: nenhum.
3. Médio: nenhum.
4. Baixo: `validate:stage-package` executou fallback local por ausência de credenciais AWS no ambiente (comportamento esperado).

**Checklist de aceite da issue**

- [x] Alarmes de DLQ criados para Salesforce e HubSpot.
- [x] Thresholds configuráveis por stage.
- [x] Canal SNS de notificação associado em `AlarmActions`.

**Evidências de validação**

- `npm run lint` ✅
- `npm run typecheck` ✅
- `npm run test -- --runInBand` ✅
- `npm run validate:stage-render` ✅
- `npm run validate:stage-package` ⚠️ fallback local esperado

**Status final**: **APPROVED**
