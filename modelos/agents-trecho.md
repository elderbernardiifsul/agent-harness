<!-- agent-harness: início (o ah init reescreve este trecho; escreva fora das marcas) -->
## Harness de agentes

Este projeto usa o agent-harness: `tools/ah` cuida das frentes, dos worktrees e do quadro, e ganchos do agente recusam ações perigosas antes de rodar (as travas). Uso no dia a dia: `docs/agents/sessoes-paralelas.md`.

Se o seu agente não é o Claude Code, as travas automáticas não valem até existir adaptador para ele. Leia `.harness/nucleo/docs/agentes/README.md`: lá estão o contrato, o exemplo do Claude Code e o passo a passo para escrever o adaptador do seu agente e provar que funciona. `tools/ah doctor` diz se o agente em uso tem adaptador.
<!-- agent-harness: fim -->
