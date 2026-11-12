# Sessões paralelas

Várias sessões de agente trabalham ao mesmo tempo neste repositório. Cada uma tem uma frente (um trabalho com nome, ticket e worktree próprio). O quadro de quem faz o quê fica no estado local, fora do git. Todos os comandos abaixo se chamam por `tools/ah`.

## O ciclo de uma frente

1. `tools/ah open <nome>` reserva a frente (id como `as-1`, para a sigla `as`), cria o worktree e o ramo `feat/<nome>` a partir de `dev`.
2. Trabalhe só dentro do worktree da frente. Use `tools/ah nota "<texto>"` para deixar um recado que outra sessão leia no quadro.
3. `tools/ah board` mostra as frentes abertas, de quem são e as notas.
4. `tools/ah close` encerra a frente e libera a reserva. Se precisar parar no meio, deixe uma nota antes de sair.

## As duas travas

- Trava de escrita: o agente não grava arquivos fora do worktree da própria frente.
- Trava de ramo: o agente não faz commit nem push direto em `stage` ou `main`.

Cada recusa diz o motivo e o próximo passo. Só a pessoa responsável desliga as travas, com `AH_GUARD=off` no ambiente do comando, e só por uma vez.

## Fluxo de ramos

`dev` recebe o trabalho novo; `stage` publica em teste; `main` é a produção. O código sobe sempre por pull request: `feat/<nome>` para `dev`, depois `dev` para `stage`, depois `stage` para `main`. Push de `stage` e `main` só com ordem de quem decide.
