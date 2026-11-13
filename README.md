# agent-harness

Harness de programação com vários agentes: várias sessões de agentes trabalham ao mesmo tempo no mesmo repositório, cada uma na sua frente, com ramos, travas e estado local coordenados por comandos. Requer Node 22 ou mais novo e não tem dependências.

> Em construção: a interface ainda muda.

## O que a fatia 1 entrega

- `ah init`: instala o harness em um projeto (núcleo, configuração, ganchos do agente, CI e proteção dos ramos no servidor).
- `ah open`, `ah nota`, `ah board`, `ah whoami`, `ah close`: o ciclo de uma frente de trabalho, com ramo e worktree próprios, registro no estado local e comentário nos tickets.
- `ah doctor`: confere se o projeto está bem preparado.
- Travas no gancho do agente: T0 (recusa o que não consegue ler), T2 (`git add -A` e `git commit -a` no checkout principal) e T5 (push e `gh pr merge` em ramo protegido).
- Adaptador do Claude Code, ensaiado com o agente real (`docs/referencia/ensaio-claude-code.md`).

## O que a fatia 2 entrega

Várias sessões e várias pessoas no mesmo repositório:

- Sessão viva: processo do agente de pé e sinal de vida dentro do prazo (`sessoes.prazoDoSinalMin`, 120 minutos por padrão). Um `/clear` ou uma conversa retomada no mesmo processo herda a frente.
- Reserva de ticket no `ah open --tickets` (comentário, responsável e rótulo), liberada no `ah close`, com fila para o que falha por falta de rede.
- `ah handoff`: passa a frente adiante sem fechá-la; `ah open <nome>` a retoma, nesta máquina ou em outra.
- `ah takeover`: assume a frente de uma sessão que morreu, com `--confirmado` (ordem do executivo).
- `ah papel`: executor (uma frente) ou orquestrador (várias, e `ah open --para` para abrir frente para outra sessão).
- `ah sweep`: lista o que ficou fora do lugar e, com `--reparar`, arruma o estado.
- Sobreposição de arquivos entre frentes no `open`, no `board` e no começo da sessão.
- Travas novas: T1 (troca de ramo no checkout principal), T3 (descartar trabalho no checkout principal) e T4 (escrever no worktree ou no ramo de outra sessão viva).

## Como preparar um projeto pelo agente

Pré-requisitos do projeto: um repositório git com pelo menos um commit (num repositório recém-criado, faça antes `git commit --allow-empty -m "começo"`; sem commit o `init` recusa), Node 22 ou mais novo e, para tickets e proteção de ramo, o `gh` com login.

Clone este repositório, abra o agente na pasta do seu projeto e peça: "prepare meu projeto com o harness, a partir do clone em `<caminho>`". O agente roda, na pasta do projeto:

```
node <clone>/nucleo/bin/ah.mjs init
```

Sem o `gh` (ou sem login nele), o `init` não sabe propor a sigla: use `node <clone>/nucleo/bin/ah.mjs init --sigla <sigla>`, com 2 a 4 letras minúsculas (por exemplo, `--sigla as` para `ana-souza`).

O `init` não faz commit. Ele termina com os comandos exatos do commit, que vai **no ramo base** (`dev`), porque as frentes partem dele: se o projeto está em outro ramo (por exemplo, `main`), primeiro `git switch dev`, depois o `git add -- …` com os caminhos que ele gravou e o `git commit`. Por fim:

```
tools/ah doctor
```

Depois disso, cada sessão do agente abre sua frente com `tools/ah open <nome>`, trabalha no worktree, integra na `dev` e fecha com `tools/ah close` (ou para no meio com `tools/ah handoff`). Quem roda esses comandos é o agente: a sessão vem do gancho dele. Para rodar à mão, num terminal, diga qual é a sessão com `AH_SESSAO` (um nome qualquer, o mesmo no `open` e no `close`):

```
AH_SESSAO=ana-terminal tools/ah open carrinho
AH_SESSAO=ana-terminal tools/ah close
```

`tools/ah --help` lista os comandos, e `tools/ah <comando> --help` mostra o uso de cada um.

## Referência

- `docs/referencia/comandos.md`: cada comando, as recusas e exemplos; a vida da sessão, os eventos, os limites das travas e como publicar.
- `docs/referencia/capacidades-por-agente.md`: o que cada agente de código permite ao harness.
- `docs/referencia/ensaio-claude-code.md`: os ensaios com o Claude Code 2.1.319.

Testes: `node --test teste/`.

## Próximas fatias

- Fatia 3, máquina: `ah pesado` (fila de trabalho pesado, como builds e testes ponta a ponta) e a trava T6, que recusa rodá-lo fora da fila.
- Fatia 4, outros agentes: adaptadores do Codex e do OpenCode, com ensaio nos três.
- Fatia 5, abertura: extensões do projeto em `.harness/extensoes/` com exemplo e guia, `atualizar`, `deps` e números de uso.

A ordem e o escopo ainda podem mudar.
