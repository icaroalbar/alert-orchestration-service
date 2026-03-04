# Revisão IAM mínima — 2026-03-04

Issue: `#72`

Objetivo desta revisão: validar princípio de menor privilégio e remover permissões excedentes identificadas no stack principal.

## Alterações aplicadas

1. `MainStateMachineExecutionRole`
- Removido wildcard de invocação Lambda:
  - `Fn::Sub: ${SchedulerLambdaFunction.Arn}:*`
  - `Fn::Sub: ${CollectorLambdaFunction.Arn}:*`
- Permissão passou a apontar somente para ARNs explícitos das funções.

2. `CollectorExecutionRole`
- Removida ação não utilizada em `ReadSourceConfiguration`:
  - `dynamodb:Query`
- A coletora usa somente `dynamodb:GetItem` para leitura de `sources`.

## Inventário de permissões wildcard remanescentes (com justificativa)

1. `DeliverStepFunctionsExecutionLogs` (`MainStateMachineExecutionRole`)
- `Resource: "*"` mantido.
- Justificativa: ações de `logs:CreateLogDelivery/Get/Update/Delete/List` e políticas de resource do CloudWatch Logs não suportam escopo fino por ARN para esse fluxo.

2. `cloudwatch:PutMetricData` (roles de state machine/coletora/consumidoras)
- `Resource: "*"` mantido com condição `cloudwatch:namespace`.
- Justificativa: `PutMetricData` não possui resource-level permission; restrição por namespace está aplicada.

3. `secretsmanager:GetSecretValue` (`CollectorExecutionRole`)
- `Resource: arn:...:secret:*` mantido.
- Justificativa: modelo plugin permite cadastro dinâmico de `secretArn` por fonte; sem catálogo estático por stage, não é possível restringir ARNs sem quebrar onboarding dinâmico.

## Evidências técnicas

- Arquivo de infraestrutura auditado: `serverless.yml`.
- Comandos locais executados:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test -- --runInBand`
  - `npm run build`
  - `npm run validate:stage-render`
  - `npm run validate:stage-package` (fallback local esperado sem credenciais AWS)

## Resultado

Revisão concluída com redução de permissões desnecessárias e rastreabilidade das exceções de wildcard ainda necessárias por limitação da AWS ou requisito de arquitetura dinâmica.
