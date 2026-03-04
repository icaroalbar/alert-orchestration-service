## Issue #91 — [TECH-DEBT][LOW] Fallback de diagnóstico para falhas não mapeadas

### Objetivo
Garantir rastreabilidade mínima quando `validate-stage-render` e `validate-stage-package` falharem por erro não classificado, eliminando cenários de `exit 1` sem diagnóstico objetivo.

### Decisões arquiteturais
1. **Identificador padronizado para falha não classificada**
- Introduzir saída explícita `UNCLASSIFIED_STAGE_VALIDATION_ERROR` em ambos os scripts.
- Incluir contexto mínimo obrigatório: `stage` e `command` executado.

2. **Preservação de comportamento para erros já mapeados**
- `validate-stage-render`: manter fallback estático quando detectar erro de rede/API.
- `validate-stage-package`: manter fallback de build local quando detectar erro de credencial/rede.

3. **Testabilidade por injeção de comando via ambiente**
- Permitir override do comando principal dos scripts por variável de ambiente para testar cenários de erro controlados.
- Permitir override do comando de fallback no `validate-stage-package` para evitar build pesado em teste.

4. **Cobertura automatizada focada em diagnóstico**
- Adicionar testes de integração de script para validar:
  - mensagem padronizada em erro não classificado;
  - ausência de regressão em fallback de erros mapeados.

### Critérios técnicos de aceite
- Erro não mapeado em ambos os scripts emite `UNCLASSIFIED_STAGE_VALIDATION_ERROR` com `stage` e `command`.
- Saída contém orientação objetiva de próxima ação.
- Casos mapeados continuam com fallback existente.
- Testes automatizados cobrem os cenários acima.
