**QA — Issue #72 (Revisar IAM mínimo da plataforma)**

**Achados por severidade**

1. Crítico: nenhum.
2. Alto: nenhum.
3. Médio: nenhum.
4. Baixo: `validate:stage-package` executado em fallback local por ausência de credenciais AWS.

**Checklist de aceite da issue**

- [x] Permissões coringa desnecessárias removidas dos pontos auditados.
- [x] Roles seguem menor privilégio no escopo funcional atual.
- [x] Relatório de revisão IAM disponível e versionado.

**Evidências de validação**

- `npm run lint` ✅
- `npm run typecheck` ✅
- `npm run test -- --runInBand` ✅
- `npm run build` ✅
- `npm run validate:stage-render` ✅
- `npm run validate:stage-package` ⚠️ fallback local esperado

**Status final**: **APPROVED**
