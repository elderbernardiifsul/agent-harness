# agent-harness

Harness de programação com vários agentes: várias sessões de agentes trabalham ao mesmo tempo no mesmo repositório, cada uma na sua frente, com ramos, travas e estado local coordenados por comandos. Requer Node 22 ou mais novo e não tem dependências.

> Em construção: a interface ainda muda.

## O que a fatia 1 entrega

- `ah init`: instala o harness em um projeto (núcleo, configuração, ganchos do agente, CI e proteção dos ramos no servidor).
- `ah open`, `ah nota`, `ah board`, `ah whoami`, `ah close`: o ciclo de uma frente de trabalho, com ramo e worktree próprios, registro no estado local e comentário nos tickets.
- `ah doctor`: confere se o projeto está bem preparado.
- Travas no gancho do agente: T0 (recusa o que não consegue ler), T2 (`git add -A` e `git commit -a` no checkout principal) e T5 (push e `gh pr merge` em ramo protegido).
- Adaptador do Claude Code, ensaiado com o agente real (`docs/referencia/ensaio-claude-code.md`).

## Como preparar um projeto pelo agente

Clone este repositório, abra o agente na pasta do seu projeto e peça: "prepare meu projeto com o harness, a partir do clone em `<caminho>`". O agente roda, na pasta do projeto:

```
node <clone>/nucleo/bin/ah.mjs init
tools/ah doctor
```

e faz o commit do resultado. Depois disso, cada sessão abre sua frente com `tools/ah open <nome>`, trabalha no worktree e fecha com `tools/ah close`.

## Referência

- `docs/referencia/comandos.md`: cada comando, as recusas e exemplos; limites das travas e como publicar.
- `docs/referencia/capacidades-por-agente.md`: o que cada agente de código permite ao harness.
- `docs/referencia/ensaio-claude-code.md`: o ensaio com o Claude Code 2.1.319.

Testes: `node --test teste/`.

## Próximas fatias

Adaptadores para outros agentes (Codex, OpenCode), extensões do projeto em `.harness/extensoes/`, mais travas e a tomada de frente de outra sessão. A ordem e o escopo ainda podem mudar.
