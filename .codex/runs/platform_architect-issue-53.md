## Issue #53 — [EPIC 5] Buscar credenciais no Secrets Manager

### Objetivo
Fazer a Lambda coletora carregar credenciais de banco a partir do `secretArn` da fonte, com tratamento explícito para segredo inexistente, retry para falhas transitórias de infraestrutura e normalização para contrato único consumível pelos próximos adapters (`postgres`/`mysql`).

### Decisões arquiteturais
1. **Use-case de credenciais separado do lookup de fonte**
- Criar `loadCollectorSourceCredentials` em `src/domain/collector` para isolar parsing/validação/retry de credenciais.
- Manter `loadCollectorSourceConfiguration` focado apenas na tabela `sources`.

2. **Boundary de infraestrutura para Secrets Manager**
- Introduzir repositório `CollectorSecretRepository` no domínio e implementação AWS em `src/infra/secrets`.
- Evitar acoplamento direto do handler ao SDK e permitir testes unitários sem AWS real.

3. **Retry controlado para erros transitórios**
- Retry com backoff exponencial parametrizável (max attempts, delay base, backoff rate).
- Aplicar somente para erros transitórios (throttling, indisponibilidade, timeout); não repetir para segredo ausente ou payload inválido.

4. **Contrato canônico de credenciais para adapters**
- Normalizar secret payload para estrutura única:
  - `engine`, `host`, `port`, `database`, `username`, `password`.
- Aceitar aliases comuns (`user`/`username`, `db`/`database`) e aplicar porta padrão por engine quando ausente.

5. **Observabilidade sem vazamento de segredo**
- Expor métricas de tempo/tentativas de leitura (`durationMs`, `attempts`) no fluxo do handler.
- Proibir log de `SecretString` e mensagens com conteúdo sensível.

### Critérios técnicos de aceite
- Coletora resolve `secretArn` da source e carrega credenciais do Secrets Manager.
- Erro de segredo inexistente é tratado por erro controlado e rastreável.
- Falhas transitórias executam retry com backoff e limite de tentativas.
- Saída normalizada de credenciais está pronta para uso dos adapters de banco.
- Tempo de leitura é observável sem exposição de segredo em logs.
