<!-- agent-harness: início (o ah init reescreve este trecho; escreva fora das marcas) -->
## Harness de agentes

Este projeto usa o agent-harness. O `tools/ah` gerencia as frentes, os worktrees e o quadro, e os ganchos do agente recusam ações perigosas antes da execução (as travas). Uso cotidiano: `docs/agents/sessoes-paralelas.md`.

Se o agente em uso não é o Claude Code, as travas automáticas não valem até existir adaptador para ele. O roteiro em `.harness/nucleo/docs/agentes/README.md` reúne o contrato, o exemplo do Claude Code e o passo a passo para escrever e provar o adaptador de outro agente. `tools/ah doctor` informa se o agente em uso tem adaptador.
<!-- agent-harness: fim -->
