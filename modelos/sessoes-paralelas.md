# Sessões paralelas

Várias sessões de agente trabalham ao mesmo tempo neste repositório. Cada uma tem uma frente (um trabalho com nome, tickets e worktree próprio). O quadro de quem faz o quê fica no estado local, fora do git. Todos os comandos abaixo se chamam por `tools/ah`; `tools/ah <comando> --help` mostra o uso de cada um.

## O ciclo de uma frente

1. `tools/ah open <nome>` reserva a frente (id como `as-1`, para a sigla `as`), cria o ramo `feat/<nome>` a partir de `dev` e o worktree dele.
2. Trabalhe e faça os commits dentro do worktree da frente. `tools/ah nota "<texto>"` deixa um recado que as outras sessões leem no quadro.
3. `tools/ah board` mostra as frentes abertas, de quem são e a última nota.
4. Para integrar, no checkout principal, na `dev`: `git merge --no-ff feat/<nome>` e `git push origin dev`.
5. `tools/ah close` confere que nada se perde, remove o worktree e o ramo e grava a linha do histórico com um commit na `dev`; depois, `git push origin dev` de novo.

## As travas desta versão

O gancho do agente lê cada comando antes de ele rodar e recusa três coisas:

- T0: comando que menciona git ou gh e não dá para ler com segurança (aspas sem fechar, nome do comando vindo de variável ou crase).
- T2: no checkout principal, `git add` ou `git commit` que pega tudo (`-A`, `.`, `-u`, `*`, a raiz, `commit -a`) ou cujos caminhos não dá para ler (variável, `$( … )`). Adicione por caminho, ou trabalhe no worktree.
- T5: push para `stage` ou `main` (com destino explícito, sem destino com o ramo protegido em uso, depois de um `git checkout`/`git switch` para ele, `--all`, `--mirror`) e `gh pr merge` cuja base é protegida.

Ainda não há trava para gravar arquivo fora do worktree da frente nem para mexer no ramo ou no worktree de outra sessão: isso fica para a próxima versão. A edição de arquivo sempre passa.

Cada recusa diz o motivo e o próximo passo. `AH_GUARD=off` no começo do comando libera a T2 e a T5 só para aquele comando, e a liberação fica registrada; a T0 nunca é liberada. Use só com a ordem de quem decide.

## Fluxo de ramos

`dev` recebe o trabalho novo e é livre; `stage` publica em teste; `main` é a produção. As frentes entram na `dev` por merge local no checkout principal (passo 4 acima). Levar `dev` para `stage` e `stage` para `main` é publicar: só com a ordem de quem decide, por PR mesclado com `AH_GUARD=off gh pr merge <número>`.
