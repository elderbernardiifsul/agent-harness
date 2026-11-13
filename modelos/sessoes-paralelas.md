# Sessões paralelas

Várias sessões de agente trabalham ao mesmo tempo neste repositório. Cada sessão tem uma frente, isto é, um trabalho com nome, tickets e worktree próprios. O quadro que registra quem faz o quê fica no estado local, fora do git. Todos os comandos abaixo são chamados por `tools/ah`, e `tools/ah <comando> --help` mostra o uso de cada um.

## O ciclo de uma frente

1. `tools/ah open <nome> --tickets 1,2` abre a frente (id como `as-1`, para a sigla `as`), cria o ramo `feat/<nome>` a partir de `dev` e o worktree correspondente, e reserva os tickets (comentário, responsável e rótulo `em-andamento`). O comando recusa ticket reservado por outra frente; nesse caso, é preciso combinar com a frente que o detém.
2. O trabalho e os commits são feitos dentro do worktree da frente. `tools/ah nota "<texto>"` deixa um recado que as outras sessões leem no quadro e no `open` delas.
3. `tools/ah board` mostra as frentes, as donas, o estado de cada uma (`ativa`, `órfã`, `passada`), os arquivos em comum com outras frentes e as sessões vivas.
4. A integração é feita no checkout principal, na `dev`: `git merge --no-ff feat/<nome>` e `git push origin dev`.
5. `tools/ah close` confere que nenhum trabalho se perde, comenta o fechamento nos tickets e retira a reserva, remove o worktree e o ramo e grava a linha do histórico com um commit na `dev`. Em seguida, executa-se `git push origin dev` outra vez.

Para interromper o trabalho sem fechar a frente, usa-se `tools/ah handoff [--nota "<onde parei>"]`, com o worktree já commitado (um commit `wip:` é suficiente). O comando envia o ramo ao remoto, comenta a passagem nos tickets e deixa a frente no estado `passada`, sem dona e com a reserva mantida. A sessão que continua o trabalho, na mesma máquina ou em outra, executa `tools/ah open <nome>` e retoma do ponto de parada.

Se a sessão dona morreu (o quadro mostra a frente como `órfã`), outra sessão pode assumi-la com `tools/ah takeover <nome>`. O comando exige `--confirmado`, que só se usa com ordem do executivo. Um `/clear` ou uma conversa retomada no mesmo processo do agente herda a frente automaticamente.

`tools/ah papel orquestrador` permite que a sessão tenha várias frentes e abra frente para outra sessão (`tools/ah open <nome> --para <id curto>`); toda sessão começa no papel `executor`, com uma frente só. `tools/ah sweep` lista o que está fora do lugar (frente órfã, worktree ausente ou sem frente, sessão morta, comentários pendentes), e `tools/ah sweep --reparar` corrige o estado sem apagar worktree nem ramo.

## As travas desta versão

O gancho do agente lê cada comando, e cada edição de arquivo, antes da execução e recusa:

- T0: comando que menciona git ou gh e não pode ser lido com segurança (aspas sem fechamento, nome do comando vindo de variável ou de crase).
- T1: troca do ramo do checkout principal (`git switch`, `git checkout <ramo>`, `-b`, `-`, `gh pr checkout`). O checkout principal permanece em `dev`; o trabalho é feito no worktree.
- T2: no checkout principal, `git add` ou `git commit` que abrange tudo (`-A`, `.`, `-u`, `*`, a raiz, `commit -a`) ou cujos caminhos não podem ser lidos (variável, `$( … )`). A alternativa é adicionar por caminho ou trabalhar no worktree.
- T3: no checkout principal, `git reset --hard`, `git clean -f`, `git checkout .`, `git restore .`, `git stash` e `git rebase`, que descartam ou ocultam trabalho de outra sessão.
- T4: escrita no worktree ou no ramo da frente de outra sessão viva (git, `rm`, `mv`, `cp`, `sed -i`, redirecionamento, edição de arquivo). A alternativa é pedir à dona um `handoff` ou, se ela morreu, usar `takeover`.
- T5: push para `stage` ou `main` (com destino explícito; sem destino, quando o ramo protegido está em uso; depois de um `git checkout`/`git switch` para ele; `--all`; `--mirror`) e `gh pr merge` cuja base é protegida.
- T6: comando de uma classe de trabalho pesado (`pesado.classes` no `.harness/config.json`) fora da fila. A forma aceita é `tools/ah pesado -- <comando>`; sem classes configuradas, nada é recusado.

As travas detectam enganos e não protegem contra má-fé: programas que escrevem por conta própria (`find -delete`, um script) passam por elas. A gravação de arquivo fora do worktree da própria frente (no checkout principal, por exemplo) não é recusada quando o destino não é worktree de outra sessão viva. Um script que chama o comando pesado internamente também passa pela T6.

Cada recusa informa o motivo e o próximo passo. O prefixo `AH_GUARD=off` no começo do comando libera as travas T1 a T6 apenas para aquele comando, e a liberação fica registrada; a T0 nunca é liberada. O prefixo só se usa com ordem de quem decide.

## Fluxo de ramos

`dev` recebe o trabalho novo e é livre; `stage` publica no ambiente de teste; `main` é a produção. As frentes entram na `dev` por merge local no checkout principal (passo 4 acima). Levar `dev` para `stage` e `stage` para `main` equivale a publicar e só ocorre com ordem de quem decide, por PR mesclado com `AH_GUARD=off gh pr merge <número>`.
