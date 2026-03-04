**Status de execução — Issue #53**

**Escopo implementado**

- Leitura e normalização de credenciais da coletora via Secrets Manager:
  - `src/domain/collector/load-source-credentials.ts`
  - caso de uso `loadCollectorSourceCredentials` com:
    - parsing e validação de payload JSON;
    - normalização para contrato canônico (`engine`, `host`, `port`, `database`, `username`, `password`);
    - aliases compatíveis (`database|dbname|db`, `username|user`, `password|pass`);
    - porta padrão por engine (`postgres=5432`, `mysql=3306`);
    - retry com backoff exponencial para falhas transitórias.
- Adapter de infraestrutura para AWS Secrets Manager:
  - `src/infra/secrets/secrets-manager-secret-repository.ts`
  - leitura com `GetSecretValue` e tratamento de `ResourceNotFoundException`.
- Integração no handler da coletora:
  - `src/handlers/collector.ts`
  - inclusão de dependências de secret repository/retry policy;
  - leitura do segredo após validação da source;
  - log estruturado `collector.source_credentials.loaded` com `attempts` e `durationMs`;
  - contrato de saída da coletora preservado.
- Ajustes de infraestrutura e documentação:
  - `serverless.yml`: permissão `secretsmanager:GetSecretValue` para `collector-role`;
  - `README.md`: atualização de escopo da role da coletora.
- Cobertura de testes do novo escopo:
  - `tests/unit/domain/collector/load-source-credentials.test.ts`
  - `tests/unit/handlers/collector.test.ts`
- Dependência adicionada:
  - `@aws-sdk/client-secrets-manager` em `package.json` / `package-lock.json`.

**Validações executadas**

- `npm test -- --runInBand` ✅
- `npm test -- tests/unit/domain/collector/load-source-credentials.test.ts tests/unit/domain/collector/load-source-configuration.test.ts tests/unit/handlers/collector.test.ts --runInBand` ✅
- `npm run lint` ✅
- `npm run typecheck` ✅
- `npm run build` ✅
- `npm run validate:stage-render` ✅
- `npm run validate:stage-package` ⚠️ fallback local por ausência de credenciais AWS no ambiente

**Resultado**

Escopo da issue #53 concluído com leitura de segredos, retry transitório, normalização de credenciais para adapters e observabilidade de tempo/tentativas sem exposição de segredo em logs.
