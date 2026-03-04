**Status de execução — Issue #46**

**Escopo implementado**

- Cálculo automático de `nextRunAt` em UTC implementado no domínio:
  - novo módulo `src/domain/sources/next-run-at.ts`.
  - suporte para `scheduleType=interval` e `scheduleType=cron`.
  - erro de validação estruturado para `cronExpr` inválido.
- Handler `POST /sources` ajustado para:
  - validar payload sem depender de `nextRunAt` fornecido pelo cliente;
  - calcular e persistir `nextRunAt` automaticamente no create.
- Handler `PATCH /sources/{id}` ajustado para:
  - recalcular `nextRunAt` apenas quando `scheduleType`, `intervalMinutes` ou `cronExpr` mudam;
  - preservar `nextRunAt` quando não há mudança de agenda.
- Validação de patch atualizada:
  - `nextRunAt` removido da lista de campos mutáveis de atualização.
- Documentação atualizada:
  - `docs/sources/create-source-endpoint-v1.md`
  - `docs/sources/update-source-endpoint-v1.md`
  - `docs/sources/source-schema-v1.md`
- Testes adicionados/atualizados:
  - `tests/unit/domain/sources/next-run-at.test.ts`
  - `tests/unit/handlers/create-source.test.ts`
  - `tests/unit/handlers/update-source.test.ts`

**Validações executadas**

- `npm run lint` ✅
- `npm run typecheck` ✅
- `npm run test -- --passWithNoTests` ✅
- `npm run build` ✅
- `npm run validate:stage-render` ✅
- `npm run validate:stage-package` ✅ (fallback esperado por ausência de credenciais AWS)

**Resultado**

Implementação concluída no escopo da issue #46, pronta para PR.
