<!-- agent-harness/metodo: início (o tools/ah metodo instalar reescreve este trecho; escreva fora das marcas) -->
## Método de trabalho

As skills do método ficam na pasta de cada agente: `.claude/skills/` (Claude Code) e `.agents/skills/` (Codex e OpenCode). A trava `.harness/skills.lock.json` registra de que coleção e commit veio cada skill e o hash de cada arquivo. Skill mudada à mão faz o `tools/ah doctor` avisar, e a próxima instalação recusa sobrescrevê-la.

- **Escolha a trilha antes de começar.** O método (trilhas, quem cuida de cada etapa, nível de modelo, quando guardar os registros) está em `docs/agents/metodo.md`.
- **Começo da sessão.** Rode `tools/ah doctor` no começo da sessão e siga o "Faça" de cada aviso.
- **Registros.** Com a extensão registros ligada, rode `tools/ah registros guardar` depois da revisão final da skill de execução, no lugar do passo em que ela apaga a pasta do plano, e antes do `tools/ah close` (detalhe em `docs/agents/metodo.md`).
- **Nomes com prefixo.** Onde uma skill cita `superpowers:<nome>` ou `mattpocock-skills:<nome>`, use a skill `<nome>` do projeto.
- **Worktree e encerramento são do harness (`tools/ah`).** O trabalho acontece no worktree da frente, aberto por `tools/ah open`. Integre e feche como em `docs/agents/sessoes-paralelas.md`, passos 4 e 5; para passar a frente sem fechá-la, `tools/ah handoff`.
- **Tickets, rótulos e domínio.** Como usar o rastreador de tickets: `docs/agents/issue-tracker.md`. Rótulos de triagem: `docs/agents/triage-labels.md`. Vocabulário e decisões do domínio: `docs/agents/domain.md`.
- **Reparar.** A skill `preparar-projeto` refaz ou repara a instalação.

Skills citadas pelas instaladas, mas que não estão no projeto:

| Skill citada | Quem cita | No lugar |
|---|---|---|
| `using-git-worktrees` | writing-plans, subagent-driven-development, executing-plans | o worktree é o da frente, aberto por `tools/ah open` |
| `finishing-a-development-branch` | subagent-driven-development, executing-plans | integrar e fechar como em `docs/agents/sessoes-paralelas.md`, passos 4 e 5, ou `tools/ah handoff` |
| `using-superpowers` | executing-plans | este AGENTS.md faz esse papel |
| `writing-skills` | test-driven-development | não instalada; para escrever skill, siga a documentação do agente |
| `setup-matt-pocock-skills` | to-tickets, wayfinder, triage | já feito pelo `tools/ah metodo instalar` (`docs/agents/issue-tracker.md`, `triage-labels.md`, `domain.md`) |
<!-- agent-harness/metodo: fim -->
