# Fatias 0 e 1 do núcleo: decisões da execução e pendências

Plano: [2026-11-12-nucleo-fatias-0-e-1.md](2026-11-12-nucleo-fatias-0-e-1.md). Execução em 12/11/2026, por subagentes, com revisão por tarefa e revisão final do ramo. Estado no fim: 386 testes passam; a varredura de termos sai com código 0.

## Decisões tomadas durante a execução

O autor não foi consultado em cada uma; qualquer delas pode ser revista.

1. Cada comando declara o que exige (`requisitos`: configuração, sessão, repositório); `init`, `doctor`, `board` e `gancho` rodam sem sessão.
2. O `init` rodado pela cópia instalada no projeto recusa; atualizar pela cópia é da fatia 5.
3. No `open`, o ponto de partida é `<remoto>/<base>`, salvo quando a base local contém o remoto e está à frente. O próximo ID lê o histórico da base local e do remoto e não repete o de uma frente aberta.
4. O gancho do Claude Code vigia `Bash|PowerShell|Edit|Write|NotebookEdit`. Sessão iniciada por `startup` ou `clear` é nova; `resume`, `compact` e `fork` são continuação.
5. Comando que o leitor de shell não consegue ler é recusado por T0 só quando o texto menciona `git` ou `gh`; os demais passam.
6. `AH_GUARD=off` vale só no comando que traz o prefixo e nunca libera a T0. `GIT_DIR`, `GIT_WORK_TREE`, `--git-dir` e `--work-tree` tornam o repositório desconhecido, e T2 e T5 recusam.
7. O gancho consulta o servidor (`gh pr view`) só para `gh pr merge`, com prazo de 5 s; sem resposta, recusa.
8. Entrada que não é JSON, fora do evento de antes da ferramenta, sai com código 0 e um aviso.
9. O `init` não altera ramo que já está protegido no servidor e reescreve a CI só enquanto ela traz a marca de arquivo gerado.
10. O `close` de outra sessão é aceito quando a sessão dona já encerrou; as conferências de perda de trabalho continuam valendo.
11. Com o checkout principal num ramo que não tem o harness, o gancho não existe e nada é recusado. Ficou como limite documentado, com o item "Harness no ramo base" no `doctor`. Recusar tudo quando `tools/ah` falta prenderia o agente.
12. Um login fictício usado num teste coincidia com a lista de termos proibidos; cinco commits locais foram reescritos para tirá-lo do histórico.

## Não ensaiado

- **Codex e OpenCode:** a coluna deles em `docs/referencia/capacidades-por-agente.md` vem da documentação; só o Claude Code foi ensaiado de verdade.
- **Windows:** `tools/ah.cmd` e o ramo Windows do `doctor` nunca foram executados; os testes que usam um `git` ou `gh` falso no `PATH` são pulados lá.
- **macOS:** não executado.
- O ensaio com o Claude Code real (`docs/referencia/ensaio-claude-code.md`) foi feito antes da onda final; a resposta do agente citada traz o texto antigo da recusa T2, e o ensaio rodou sem `--setting-sources project`.

## Pendências menores

Travas e leitor de shell:
- `git switch main && git pull && git switch dev && git push` é recusado por T5, embora o push rode na `dev` (o ramo de antes da troca nunca sai da lista).
- No checkout principal, caminho com `$` ou crase em `git add` ou `git commit` cai na T2, mesmo literal entre aspas simples.
- Passam sem recusa: `xargs git add`, apelidos do git, `gh api …/merge`, `push.default`, `$G push`, `cd x && a; b` com `cd` que falha.
- Posicionais do `sh -c`; a função `resolver` e o `shell.mjs` estão longos.

Comandos:
- `tools/ah nota corrigir o -h do parser`, sem aspas, mostra a ajuda e não grava a nota.
- `--teste` no `init` é ignorado quando a configuração já existe.
- Pasta `.harness` que é link simbólico passa pela conferência do gancho.
- Um arquivo de frente corrompido derruba `board`, `open` e `close` de todas as sessões até ser apagado (o `doctor` aponta qual).
- Leitura e gravação de sessão sem trava; arquivos temporários órfãos; comentário do `gh` feito dentro da trava no `open`.
- `close`: submódulos não tratados; `lerOpcoes` duplicado entre comandos.
- Repetir o `init` em projeto já instalado não sobrescreve os modelos que mudaram sem `--sobrescrever`.

Para a próxima fatia (por desenho): nada protege ramo nem worktree alheio. Passam `git reset --hard`, `git clean -fd`, `git worktree remove --force`, `git branch -D` e `rm -rf` sobre o trabalho de outra frente.
