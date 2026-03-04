## Issue #54 — [EPIC 5] Implementar conexão Postgres na coletora

### Objetivo
Adicionar adapter de leitura incremental em PostgreSQL para a Lambda coletora, com query parametrizada por cursor e saída padronizada para o contrato interno da orquestração.

### Decisões arquiteturais
1. **Boundary de acesso ao Postgres em `infra`**
- Criar adapter dedicado para PostgreSQL em `src/infra/collector`, desacoplado do handler.
- Reutilizar pool por chave de conexão para reduzir overhead em invocações sucessivas.
- Parametrizar limites do pool por variáveis de ambiente para controle operacional.

2. **Regra de coleta incremental no domínio**
- Criar caso de uso em `src/domain/collector` para:
  - validar e compilar query com placeholder `{{cursor}}`;
  - executar query sempre com parâmetros bind (`$1`, `$2`, ...), sem interpolação;
  - normalizar dataset em formato serializável e estável para payload interno.

3. **Integração no handler da coletora**
- Expandir o fluxo da `collector` para:
  - resolver cursor de execução (`event.cursor` com fallback configurável);
  - executar coleta incremental quando `engine=postgres`;
  - retornar `recordsSent` com contagem real e `records` normalizados.

4. **Escopo explícito por engine**
- Implementar nesta issue apenas `postgres`.
- Para engines ainda não suportadas no adapter atual, retornar erro controlado de engine não suportada.

5. **Testabilidade e observabilidade**
- Injetar dependência do executor Postgres no handler para testes unitários sem banco real.
- Emitir log estruturado com total de registros coletados e referência de cursor utilizada.

### Critérios técnicos de aceite
- A coletora consegue conectar em PostgreSQL com credenciais carregadas do Secrets Manager.
- A query incremental é executada com parâmetros bind e cursor de referência.
- O resultado é retornado em dataset padronizado e serializável.
- `recordsSent` reflete a quantidade de linhas retornadas.
- Há cobertura unitária para caso de sucesso e erros controlados do fluxo Postgres.
