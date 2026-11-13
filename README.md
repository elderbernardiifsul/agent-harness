# agent-harness

Harness de programação com vários agentes. Várias sessões de agentes de código trabalham ao mesmo tempo no mesmo repositório, cada uma na própria frente, e um conjunto de comandos coordena os ramos, as travas e o estado local. Requer Node 22 ou mais novo e não tem dependências.

> Situação: as fatias 1 a 4 estão entregues. Da fatia 5, a atualização do harness instalado (`ah atualizar`) está pronta, sem ensaio com agente real; o restante está em construção, e a interface ainda pode mudar.

## Entregas da fatia 1

- `ah init`: instala o harness em um projeto (núcleo, configuração, ganchos do agente, CI e proteção dos ramos no servidor).
- `ah open`, `ah nota`, `ah board`, `ah whoami`, `ah close`: ciclo de uma frente de trabalho, com ramo e worktree próprios, registro no estado local e comentário nos tickets.
- `ah doctor`: verificação da preparação do projeto.
- Travas no gancho do agente: T0 (recusa o comando que não consegue ler), T2 (`git add -A` e `git commit -a` no checkout principal) e T5 (push e `gh pr merge` em ramo protegido).
- Adaptador do Claude Code, ensaiado com o agente real (`docs/referencia/ensaio-claude-code.md`).

## Entregas da fatia 2

Suporte a várias sessões e várias pessoas no mesmo repositório:

- Sessão viva: processo do agente em execução e sinal de vida dentro do prazo (`sessoes.prazoDoSinalMin`, 120 minutos por padrão). Um `/clear` ou uma conversa retomada no mesmo processo herda a frente.
- Reserva de ticket no `ah open --tickets` (comentário, responsável e rótulo), liberada no `ah close`, com fila para as operações que falham por falta de rede.
- `ah handoff`: passa a frente adiante sem fechá-la; `ah open <nome>` a retoma, na mesma máquina ou em outra.
- `ah takeover`: assume a frente de uma sessão morta, com `--confirmado` (ordem do executivo).
- `ah papel`: executor (uma frente) ou orquestrador (várias frentes, e `ah open --para` para abrir frente para outra sessão).
- `ah sweep`: lista o que está fora do lugar e, com `--reparar`, corrige o estado.
- Detecção de arquivos em comum entre frentes no `open`, no `board` e no começo da sessão.
- Travas novas: T1 (troca de ramo no checkout principal), T3 (descarte de trabalho no checkout principal) e T4 (escrita no worktree ou no ramo de outra sessão viva).

## Trabalho pesado (fatia 3)

Builds e testes ponta a ponta de várias sessões simultâneas esgotam a memória da máquina. `tools/ah pesado -- <comando>` coloca o comando numa fila da máquina, comum a todos os projetos com o harness; o comando aguarda a vez, executa e devolve a saída e o código de saída. O número de vagas e a memória livre mínima são configurações da máquina; as classes (quais comandos são pesados e quantas vagas cada um ocupa) ficam em `pesado.classes` no `.harness/config.json`. Com classes configuradas, a trava T6 recusa a execução de um desses comandos fora da fila e indica como executá-lo pela fila. O `board` mostra os comandos em execução e os que aguardam. Detalhes e limites: `docs/referencia/comandos.md`, seção "pesado".

## Outros agentes (fatia 4)

Somente o Claude Code tem adaptador. Os adaptadores do Codex e do OpenCode não acompanham o harness, por decisão do autor (seção 15 de `docs/superpowers/specs/2026-11-12-nucleo-design.md`): o agente que chega ao projeto escreve o próprio adaptador conforme o roteiro em `docs/agentes/`, que contém o contrato dos quatro eventos, o adaptador do Claude Code como exemplo, o passo a passo e o procedimento de prova. Os testes de contrato que todo adaptador deve passar rodam com `AH_ADAPTADOR=<agente> node --test teste/contrato-adaptadores.test.mjs`. O `AGENTS.md` instalado pelo `init` aponta para o roteiro (`.harness/nucleo/docs/agentes/README.md`), e o `doctor` informa, no item "Adaptador do agente em uso", quando o agente em uso não tem adaptador e as travas automáticas não se aplicam. O roteiro não foi ensaiado com o Codex nem com o OpenCode.

## Atualização do harness instalado (fatia 5)

Com o clone do agent-harness atualizado (`git pull` no clone), na pasta do projeto:

```
tools/ah atualizar --de <clone> --simular
tools/ah atualizar --de <clone>
```

O primeiro comando apenas lista o que mudaria. O segundo substitui `.harness/nucleo/` pela cópia do clone (montada ao lado e trocada de uma só vez) e reaplica o trecho do harness no `AGENTS.md`; configuração, extensões e estado (frentes, sessões, fila) permanecem inalterados. O `atualizar` recusa a operação quando algum arquivo do núcleo foi alterado à mão no projeto e lista o que se perderia (`--forcar` descarta essas alterações). Também recusa quando não há como fazer essa conferência (manifesto antigo e clone sem o commit instalado) e quando o clone é mais antigo que a cópia instalada, critério avaliado pela versão ou, com git, pela anterioridade do commit do clone em relação ao instalado. Assim como o `init`, o `atualizar` não faz commit e termina com os comandos do commit no ramo base. O `doctor` avisa, no item "Núcleo igual ao clone de origem", quando o clone registrado na máquina tem um núcleo diferente do instalado. Detalhes: `docs/referencia/comandos.md`, seção "atualizar".

## Preparação de um projeto pelo agente

Requisitos do projeto: repositório git com pelo menos um commit (sem commit o `init` recusa; num repositório recém-criado, execute antes `git commit --allow-empty -m "começo"`), Node 22 ou mais novo e, para tickets e proteção de ramo, o `gh` autenticado.

Clone este repositório, abra o agente na pasta do projeto e faça o pedido: "prepare meu projeto com o harness, a partir do clone em `<caminho>`". O agente executa, na pasta do projeto:

```
node <clone>/nucleo/bin/ah.mjs init
```

Sem o `gh`, ou sem autenticação nele, o `init` não consegue propor a sigla. Nesse caso, use `node <clone>/nucleo/bin/ah.mjs init --sigla <sigla>`, com 2 a 4 letras minúsculas (por exemplo, `--sigla as` para `ana-souza`).

O `init` não faz commit. Ele termina com os comandos exatos do commit, que deve ser feito **no ramo base** (`dev`), pois as frentes partem dele. Se o projeto estiver em outro ramo (por exemplo, `main`), execute primeiro `git switch dev` e depois o `git add -- …` com os caminhos gravados e o `git commit`. Por fim:

```
tools/ah doctor
```

A partir daí, cada sessão do agente abre a própria frente com `tools/ah open <nome>`, trabalha no worktree, integra na `dev` e fecha com `tools/ah close` (ou interrompe no meio com `tools/ah handoff`). Esses comandos são executados pelo agente, e a identificação da sessão vem do gancho dele. Para executá-los à mão, num terminal, informe a sessão em `AH_SESSAO` (um nome qualquer, o mesmo no `open` e no `close`):

```
AH_SESSAO=ana-terminal tools/ah open carrinho
AH_SESSAO=ana-terminal tools/ah close
```

`tools/ah --help` lista os comandos, e `tools/ah <comando> --help` mostra o uso de cada um.

## Referência

- `docs/referencia/comandos.md`: cada comando, as recusas e exemplos; a vida da sessão, os eventos, os limites das travas e o procedimento de publicação.
- `docs/referencia/capacidades-por-agente.md`: recursos que cada agente de código oferece ao harness.
- `docs/referencia/ensaio-claude-code.md`: ensaios com o Claude Code 2.1.319.

Testes: `node --test teste/`.

## Próximas fatias

As fatias 3 (trabalho pesado) e 4 (outros agentes, conforme a seção 15 do desenho: roteiro de adaptação em vez de adaptadores prontos) estão entregues.

- Fatia 5, em andamento: o `atualizar` está entregue (plano em `docs/superpowers/plans/2026-11-13-nucleo-fatia-5.md`); faltam as extensões do projeto em `.harness/extensoes/` com exemplo e guia, `deps` e números de uso.

A ordem e o escopo ainda podem mudar.
