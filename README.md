# agent-harness

Harness de programação com vários agentes: várias sessões de agentes trabalham ao mesmo tempo no mesmo repositório, cada uma na sua frente, com ramos, travas e estado local coordenados por comandos. Requer Node 22 ou mais novo e não tem dependências.

> Fatias 1 a 4 entregues; da 5, a atualização do harness instalado (`ah atualizar`) está pronta, sem ensaio com agente real. O resto da 5 está em construção, e a interface ainda muda.

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

## Trabalho pesado (fatia 3)

Builds e testes ponta a ponta de várias sessões ao mesmo tempo esgotam a memória da máquina. `tools/ah pesado -- <comando>` põe o comando numa fila da máquina (a mesma para todos os projetos com o harness): espera a vez, roda e devolve a saída e o código. As vagas e a memória livre mínima são da máquina; as classes (quais comandos são pesados e quantas vagas pedem) ficam em `pesado.classes` no `.harness/config.json`. Com classes configuradas, a trava T6 recusa rodar um desses comandos fora da fila e diz como rodar por ela. O `board` mostra quem roda e quem espera. Detalhes e limites: `docs/referencia/comandos.md`, seção "pesado".

## Outros agentes (fatia 4)

Só o Claude Code tem adaptador; os do Codex e do OpenCode não vêm prontos, por decisão do autor (seção 15 de `docs/superpowers/specs/2026-11-12-nucleo-design.md`): o agente que chega ao projeto escreve o dele seguindo o roteiro em `docs/agentes/` (o contrato dos quatro eventos, o adaptador do Claude Code como exemplo, o passo a passo e como provar). Os testes de contrato que todo adaptador precisa passar rodam com `AH_ADAPTADOR=<agente> node --test teste/contrato-adaptadores.test.mjs`. O `AGENTS.md` que o `init` instala aponta para o roteiro (`.harness/nucleo/docs/agentes/README.md`), e o `doctor` diz, no item "Adaptador do agente em uso", quando o agente em uso não tem adaptador e as travas automáticas não valem. O roteiro não foi ensaiado com o Codex nem com o OpenCode.

## Atualizar o harness instalado (fatia 5)

Com o clone do agent-harness atualizado (`git pull` nele), na pasta do projeto:

```
tools/ah atualizar --de <clone> --simular
tools/ah atualizar --de <clone>
```

O primeiro só diz o que mudaria; o segundo troca `.harness/nucleo/` pela cópia do clone (montada ao lado e trocada de uma vez) e reaplica o trecho do harness no `AGENTS.md`. Configuração, extensões e estado (frentes, sessões, fila) ficam como estão. Arquivo do núcleo alterado à mão no projeto faz o `atualizar` recusar e listar o que se perderia (`--forcar` descarta); clone mais velho que a cópia instalada também recusa. Como o `init`, não faz commit: termina com os comandos do commit no ramo base. O `doctor` avisa, no item "Núcleo igual ao clone de origem", quando o clone registrado nesta máquina tem um núcleo diferente do instalado. Detalhes: `docs/referencia/comandos.md`, seção "atualizar".

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

As fatias 3 (trabalho pesado) e 4 (outros agentes, conforme a seção 15 do desenho: roteiro de adaptação em vez de adaptadores prontos) estão entregues.

- Fatia 5, abertura: o `atualizar` está entregue (plano em `docs/superpowers/plans/2026-11-13-nucleo-fatia-5.md`); faltam as extensões do projeto em `.harness/extensoes/` com exemplo e guia, `deps` e números de uso.

A ordem e o escopo ainda podem mudar.
