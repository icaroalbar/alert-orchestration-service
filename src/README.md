# Estrutura de pastas do código-fonte

## Princípios

- `handlers` expõem entrypoints Lambda e coordenam fluxo.
- `domain` centraliza regras de negócio sem dependência de AWS.
- `infra` implementa acesso a serviços externos e persistência.
- `shared` concentra utilitários reutilizáveis entre módulos.

## Padrão de linguagem

- O código de aplicação em `src/` deve ser TypeScript (`.ts`).
- Tipagem estrita é mandatória (`tsconfig` com `strict: true`).

## Fluxo recomendado

`handler -> domain -> infra` e `shared` pode ser usado por qualquer camada.

## Árvore atual

```text
src/
  handlers/
    create-source.ts
  domain/
    scheduler/
    sources/
  infra/
    sources/
  shared/
```
