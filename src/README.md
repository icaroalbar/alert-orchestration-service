# Estrutura de pastas do código-fonte

## Princípios

- `handlers` expõem entrypoints Lambda e coordenam fluxo.
- `domain` centraliza regras de negócio sem dependência de AWS.
- `infra` implementa acesso a serviços externos e persistência.
- `shared` concentra utilitários reutilizáveis entre módulos.

## Fluxo recomendado

`handler -> domain -> infra` e `shared` pode ser usado por qualquer camada.

## Árvore atual

```text
src/
  handlers/
  domain/
  infra/
  shared/
```
