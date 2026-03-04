## Issue #52 — [EPIC 5] Buscar configuração da fonte na tabela sources

### Objetivo
Garantir que a Lambda coletora carregue a configuração da fonte diretamente da tabela `sources`, valide elegibilidade mínima (`active=true` + schema obrigatório) e gere erro controlado quando a fonte for inválida.

### Decisões arquiteturais
1. **Validação de configuração no domínio da coletora**
- Criar um caso de uso dedicado (`loadCollectorSourceConfiguration`) em `src/domain/collector` para centralizar lookup e validação.
- Manter handler enxuto, apenas orquestrando entrada/saída e delegando regra de negócio ao domínio.

2. **Reuso do repositório já padronizado da tabela `sources`**
- Reutilizar `createDynamoDbSourceRegistryRepository` para leitura por `sourceId` com `ConsistentRead`.
- Evitar nova implementação de acesso Dynamo para manter consistência de serialização/validação.

3. **Taxonomia de erros rastreáveis para falhas de fonte**
- Introduzir erros tipados por cenário:
  - `CollectorSourceNotFoundError`
  - `CollectorSourceInactiveError`
  - `CollectorSourceConfigInvalidError`
- Mensagens devem incluir `sourceId` para facilitar troubleshooting no Step Functions (`Error`/`Cause`).

4. **Preservação de contrato externo da coletora**
- Manter payload de saída atual (`sourceId`, `processedAt`, `recordsSent`) para não quebrar estados já integrados na SFN.

### Critérios técnicos de aceite
- Coletora consulta configuração por `sourceId` na tabela `sources`.
- Fonte inexistente, inativa ou inválida resulta em erro controlado e rastreável.
- Campos obrigatórios do schema da fonte são validados antes do processamento.
- Contrato de retorno da coletora permanece estável para a orquestração.
