# Sessões paralelas

Várias sessões de agente trabalham ao mesmo tempo neste repositório. Cada uma tem uma frente (um trabalho com nome, tickets e worktree próprio). O quadro de quem faz o quê fica no estado local, fora do git. Todos os comandos abaixo se chamam por `tools/ah`; `tools/ah <comando> --help` mostra o uso de cada um.

## O ciclo de uma frente

1. `tools/ah open <nome> --tickets 1,2` abre a frente (id como `as-1`, para a sigla `as`), cria o ramo `feat/<nome>` a partir de `dev` e o worktree dele, e reserva os tickets (comentário, responsável e o rótulo `em-andamento`). Ticket reservado por outra frente recusa: combine com quem o tem.
2. Trabalhe e faça os commits dentro do worktree da frente. `tools/ah nota "<texto>"` deixa um recado que as outras sessões leem no quadro e no `open` delas.
3. `tools/ah board` mostra as frentes, de quem são, o estado (`ativa`, `órfã`, `passada`), os arquivos em comum com outras frentes e as sessões vivas.
4. Para integrar, no checkout principal, na `dev`: `git merge --no-ff feat/<nome>` e `git push origin dev`.
5. `tools/ah close` confere que nada se perde, comenta o fechamento nos tickets e tira a reserva, remove o worktree e o ramo e grava a linha do histórico com um commit na `dev`; depois, `git push origin dev` de novo.

Para parar no meio sem fechar: `tools/ah handoff [--nota "<onde parei>"]` (com o worktree commitado; um commit `wip:` serve) empurra o ramo, comenta a passagem nos tickets e deixa a frente `passada`, sem dona, com a reserva. Quem continua, nesta máquina ou em outra, roda `tools/ah open <nome>` e retoma de onde parou.

Se a sessão dona morreu (o quadro mostra a frente `órfã`), outra sessão a assume com `tools/ah takeover <nome>`; o comando pede `--confirmado`, que só se usa com a ordem do executivo. Um `/clear` ou uma conversa retomada no mesmo processo do agente herda a frente sozinha.

`tools/ah papel orquestrador` deixa a sessão ter várias frentes e abrir frente para outra sessão (`tools/ah open <nome> --para <id curto>`); a sessão nasce `executor`, com uma frente só. `tools/ah sweep` lista o que ficou fora do lugar (frente órfã, worktree sumido ou sem frente, sessão morta, comentários pendentes) e `tools/ah sweep --reparar` arruma o estado, sem apagar worktree nem ramo.

## As travas desta versão

O gancho do agente lê cada comando (e cada edição de arquivo) antes de ele rodar e recusa:

- T0: comando que menciona git ou gh e não dá para ler com segurança (aspas sem fechar, nome do comando vindo de variável ou crase).
- T1: trocar o ramo do checkout principal (`git switch`, `git checkout <ramo>`, `-b`, `-`, `gh pr checkout`). Ele fica em `dev`; trabalhe no worktree.
- T2: no checkout principal, `git add` ou `git commit` que pega tudo (`-A`, `.`, `-u`, `*`, a raiz, `commit -a`) ou cujos caminhos não dá para ler (variável, `$( … )`). Adicione por caminho, ou trabalhe no worktree.
- T3: no checkout principal, `git reset --hard`, `git clean -f`, `git checkout .`, `git restore .`, `git stash` e `git rebase`, que descartam ou escondem trabalho de outra sessão.
- T4: escrever no worktree ou no ramo da frente de outra sessão viva (git, `rm`, `mv`, `cp`, `sed -i`, redirecionamento, edição de arquivo). Peça à dona um `handoff`, ou, se ela morreu, `takeover`.
- T5: push para `stage` ou `main` (com destino explícito, sem destino com o ramo protegido em uso, depois de um `git checkout`/`git switch` para ele, `--all`, `--mirror`) e `gh pr merge` cuja base é protegida.
- T6: comando de uma classe de trabalho pesado (`pesado.classes` no `.harness/config.json`) fora da fila. Rode `tools/ah pesado -- <comando>`; sem classes configuradas, nada é recusado.

As travas pegam engano, não má-fé: programa que escreve por conta própria (`find -delete`, um script) passa. Gravar arquivo fora do worktree da própria frente (no checkout principal, por exemplo) não é recusado quando o lugar não é worktree de outra sessão viva. Um script que chama o comando pesado por dentro passa pela T6.

Cada recusa diz o motivo e o próximo passo. `AH_GUARD=off` no começo do comando libera T1 a T6 só para aquele comando, e a liberação fica registrada; a T0 nunca é liberada. Use só com a ordem de quem decide.

## Fluxo de ramos

`dev` recebe o trabalho novo e é livre; `stage` publica em teste; `main` é a produção. As frentes entram na `dev` por merge local no checkout principal (passo 4 acima). Levar `dev` para `stage` e `stage` para `main` é publicar: só com a ordem de quem decide, por PR mesclado com `AH_GUARD=off gh pr merge <número>`.
