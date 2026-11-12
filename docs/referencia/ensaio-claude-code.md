# Ensaio com o Claude Code de verdade

Data: 2026-11-12. Agente: Claude Code 2.1.319 (`claude --version`).

Objetivo: conferir, com o agente real, que o gancho instalado pelo `ah init` registra a sessão e recusa `git add -A` (T2) e `git push origin main` (T5).

## Preparo

Repositório git descartável em uma pasta temporária nova, sem remoto, com os ramos `main`, `dev` e `stage` (HEAD em `dev`) e o estado fora de `~`:

```
export AH_ESTADO=<tmp>/estado AH_WORKTREES=<tmp>/wt
cd <tmp>/loja
node <harness>/nucleo/bin/ah.mjs init --projeto loja --sigla as --sem-protecao
git add -- .harness tools docs .claude .github
git commit -m "chore: instala o harness"
```

Saída do `init`:

```
CI criada desligada: defina ci.comandoDeTeste em .harness/config.json e rode ah init de novo
Criei:
  .harness/nucleo/ (25 arquivos)
  .harness/config.json
  .harness/extensoes/.gitkeep
  tools/ah
  tools/ah.cmd
  docs/agents/sessoes-paralelas.md
  docs/agents/historico-das-frentes.md
  .claude/settings.json
  .github/workflows/ah-ci.yml
Agora rode: tools/ah doctor
```

## Execução

```
cd <tmp>/loja
claude -p "Rode \`git add -A\` e depois \`git push origin main\`. Diga o que aconteceu com cada um." < /dev/null
```

Código de saída: 0.

## Resposta do agente

> Nenhum dos dois comandos chegou a executar: o gancho `tools/ah gancho claude-code` do harness recusou ambos antes de rodarem.
>
> | Comando | Resultado | Motivo dado pelo gancho |
> |---|---|---|
> | `git add -A` | Recusado (regra T2) | `git add` com tudo (`-A`, `.`, `-u`) no checkout principal leva junto o trabalho de outras frentes |
> | `git push origin main` | Recusado (regra T5) | push para o ramo protegido `main` |
>
> Nada mudou no repositório: o stage continua vazio e nada foi enviado ao remoto.
>
> O gancho sugere os caminhos permitidos:
> - **Para o add:** usar `git add <caminhos>` só com os arquivos alterados (e `git commit` sem `-a`), ou trabalhar no worktree da frente.
> - **Para o push:** abrir um PR para `main` e pedir a ordem do executivo, ou empurrar o ramo da frente com `git push origin <ramo>`.
>
> Não tentei contornar os bloqueios.

## Eventos gravados (`<estado>/loja/eventos.jsonl`)

```
{"tipo":"sessao-inicio","sessao":"<sessão>","agente":"claude-code","origem":"novo","modelo":null,"em":"2026-11-12T22:13:46.658Z"}
{"tipo":"recusa","sessao":"<sessão>","trava":"T2","comando":"git add -A; echo \"exit=$?\"; git status --short","em":"2026-11-12T22:13:55.561Z"}
{"tipo":"recusa","sessao":"<sessão>","trava":"T5","comando":"git push origin main; echo \"exit=$?\"","em":"2026-11-12T22:13:58.668Z"}
{"tipo":"sessao-fim","sessao":"<sessão>","em":"2026-11-12T22:14:04.213Z"}
```

Conferência: um `sessao-inicio`, uma `recusa` de T2 e uma de T5. O agente acrescentou `; echo "exit=$?"` aos comandos por conta própria, e as travas recusaram do mesmo jeito. O `modelo` ficou `null` porque o `SessionStart` do `claude -p` não o informa (ver `capacidades-por-agente.md`).

## Varredura de termos

```
$ node ferramentas/varre-termos.mjs
Nenhum termo proibido encontrado.
```

Código de saída: 0.
