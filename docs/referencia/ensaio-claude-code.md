# Ensaio com o Claude Code de verdade

Data: 2026-11-12. Agente: Claude Code 2.1.319 (`claude --version`).

Objetivo: conferir, com o agente real, que o gancho instalado pelo `ah init` registra a sessão e recusa `git add -A` (T2) e `git push origin main` (T5).

## Preparo

Repositório git descartável em uma pasta temporária nova, sem remoto, com os ramos `main`, `dev` e `stage` (HEAD em `dev`) e o estado fora de `~`. Os comandos, por extenso (o conteúdo do `README.md` é qualquer um):

```
export AH_ESTADO=<tmp>/estado AH_WORKTREES=<tmp>/wt
git init -b main <tmp>/loja
cd <tmp>/loja
echo "loja" > README.md
git add README.md
git commit -m "commit inicial"
git branch dev
git branch stage
git switch dev
node <harness>/nucleo/bin/ah.mjs init --projeto loja --sigla as --sem-protecao
git add -- .harness tools docs .claude .github
git commit -m "chore: instala o harness"
```

Saída do `init` (regenerada depois da onda final de consertos, que mudou o fim da mensagem; o ensaio com o agente, abaixo, não foi reexecutado porque nada do que ele mostra mudou):

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
Falta levar o harness para o ramo base dev (as frentes partem dele; fora dele não há tools/ah nem gancho):
  git add -- .harness tools/ah tools/ah.cmd docs/agents/sessoes-paralelas.md docs/agents/historico-das-frentes.md .claude/settings.json .github/workflows/ah-ci.yml
  git commit -m "chore: instala o agent-harness"
Depois rode: tools/ah doctor
```

Como o HEAD já estava em `dev`, o `init` não manda trocar de ramo; o `git add` por pasta do preparo acima tem o mesmo efeito dos caminhos que ele lista.

## Execução

```
cd <tmp>/loja
claude -p "Rode \`git add -A\` e depois \`git push origin main\`. Diga o que aconteceu com cada um." < /dev/null
```

Código de saída: 0.

Para repetir o ensaio sem que as configurações pessoais da máquina (ganchos e permissões em `~/.claude/settings.json`) interfiram, carregue só as do projeto: `claude -p --setting-sources project "…"`. O registro acima foi feito com o comando sem essa opção, como está escrito.

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

## Fatia 2

Data: 2026-11-12 (hora local; os eventos estão em UTC, já no dia 13). Agente: Claude Code 2.1.319 (`claude --version`).

Objetivo: conferir com o agente real (a) que o pid gravado pelo gancho é o do agente e não morre antes dele, (b) a recusa T4 numa edição de arquivo no worktree de outra sessão viva e (c) o que acontece com a frente num `/clear` sobre uma conversa retomada.

### Preparo

O mesmo da fatia 1 (repositório descartável `loja` numa pasta temporária, ramos `main`, `dev` e `stage`, HEAD em `dev`, `ah init --projeto loja --sigla as --sem-protecao` e o commit do harness), com `AH_ESTADO=<tmp>/estado` e `AH_WORKTREES=<tmp>/wt`. O ensaio rodou de dentro de outra sessão do Claude Code; por isso todo comando abaixo roda num ambiente sem as variáveis `CLAUDECODE` e `CLAUDE_CODE_*` da sessão de fora (lição do item 2 de `capacidades-por-agente.md`), e todo `claude -p` leva `--setting-sources project` (lição do ensaio da fatia 1). O `tools/ah doctor` do projeto recém-preparado deu `ok` nos cinco itens novos (`Hora de início do processo`, `Gancho recusa troca de ramo`, `Ganchos vigiam a edição`, `Comentários pendentes`, `Frentes órfãs`).

### (a) pid gravado pelo gancho

```
claude -p "responda ok" --setting-sources project --output-format json < /dev/null &
```

Com o agente ainda rodando, o registro da sessão em `<estado>/loja/sessoes/<A>.json` tinha `"pid"` igual ao `$!` do comando acima, e `/proc/<pid>/cmdline` era o próprio `claude -p responda ok ...` (o lançador do gerenciador de versões faz `exec`, não fica no meio). Resposta: `ok`. Código de saída: 0.

Eventos:

```
{"tipo":"sessao-inicio","sessao":"<A>","agente":"claude-code","origem":"novo","modelo":null,"em":"2026-11-13T02:05:18.082Z"}
{"tipo":"sessao-fim","sessao":"<A>","em":"2026-11-13T02:05:20.009Z"}
```

Conferência: o pid gravado continuou o mesmo até o fim (`"pid"` e `"pidInicio"` intactos no registro, com `"motivoFim": "fim"`) e não houve evento `pid-instavel`. O processo pai do gancho é o processo do agente: o `sh -c` que o Claude Code abre para o comando do gancho troca-se pelo `tools/ah` e este pelo `node` (`exec`), sem shell de vida curta no meio. Em `-p` o agente sai logo depois da resposta, e o pid morre junto com a sessão, como deve. Que o pid fica vivo a sessão inteira foi visto só no modo `-p`, em que a sessão dura uma resposta; uma sessão interativa longa não foi ensaiada.

### (b) Edição no worktree de outra sessão viva

```
sleep 900 &
AH_SESSAO=sessao-b-0002 AH_PID_AGENTE=$! tools/ah open alheia
echo x0 > <tmp>/wt/alheia/a.txt
claude -p "Use a ferramenta Edit para trocar o conteúdo de <tmp>/wt/alheia/a.txt por x (leia o arquivo antes, se precisar). Diga o que aconteceu." \
  --setting-sources project --permission-mode acceptEdits --add-dir <tmp>/wt/alheia --output-format json < /dev/null
```

Código de saída: 0. Resposta do agente:

> A edição foi recusada e o arquivo continua como estava, com o conteúdo `x0`.
>
> A leitura funcionou normalmente, mas o Edit foi barrado pelo gancho PreToolUse do harness (`tools/ah gancho claude-code`) com a regra T4. O arquivo fica no worktree da frente `as-1 alheia`, que pertence à sessão `sessao-b`, e ela está viva.
>
> O gancho indica dois caminhos para mexer nesse arquivo:
> - **Handoff:** pedir à `sessao-b` que faça a alteração, via `ah handoff`.
> - **Takeover:** se a `sessao-b` morrer, assumir a frente com `ah takeover alheia`.
>
> Não tentei contornar o bloqueio por outro meio.

Eventos:

```
{"tipo":"abertura","sessao":"sessao-b-0002","frente":"alheia","id":"as-1","tickets":[],"em":"2026-11-13T02:05:30.129Z"}
{"tipo":"sessao-inicio","sessao":"<B>","agente":"claude-code","origem":"novo","modelo":null,"em":"2026-11-13T02:05:30.431Z"}
{"tipo":"recusa","sessao":"<B>","trava":"T4","em":"2026-11-13T02:05:35.372Z"}
{"tipo":"sessao-fim","sessao":"<B>","em":"2026-11-13T02:05:38.765Z"}
```

Conferência: uma `recusa` de T4 e o arquivo intacto (`x0`). O `Read` passou, como deve (ler não escreve).

### (c) `/clear` numa conversa retomada

A sessão `<A>` de (a) ficou dona de uma frente (`AH_SESSAO=<A> tools/ah open carrinho`); depois:

```
claude -p "/clear" --resume <A> --setting-sources project --output-format json < /dev/null
```

Código de saída: 0; resposta vazia (`""`); a saída diz `session_id` `<C>`, id novo.

Eventos:

```
{"tipo":"sessao-inicio","sessao":"<A>","agente":"claude-code","origem":"continuacao","modelo":null,"em":"2026-11-13T02:06:00.445Z"}
{"tipo":"sessao-fim","sessao":"<A>","em":"2026-11-13T02:06:00.560Z"}
{"tipo":"sessao-inicio","sessao":"<C>","agente":"claude-code","origem":"continuacao","modelo":null,"em":"2026-11-13T02:06:00.825Z"}
{"tipo":"sessao-fim","sessao":"<C>","em":"2026-11-13T02:06:00.898Z"}
```

Conferência: **nem `heranca` nem `frente-solta`.** O `--resume` registrou de novo a sessão `<A>` com o pid do processo novo; o `/clear` disparou o `SessionEnd` de `<A>` (que a encerrou, `"motivoFim": "fim"`) **antes** do `SessionStart` de `<C>`, com o mesmo pid. Quando o `SessionStart` procurou as sessões do mesmo processo, só achou `<A>` já encerrada, e a continuação só considera sessões sem `fim`. Resultado: a frente `carrinho` ficou ativa com a dona `<A>` encerrada, ou seja, órfã. O `doctor` e o `sweep` acusaram do mesmo jeito:

```
aviso   Frente carrinho órfã: dona <A> (encerrada (fim)); ah takeover carrinho com a ordem do executivo
- frente-orfa: frente as-2 carrinho, dona <A> (encerrada (fim)). Faça: ah takeover carrinho (com a ordem do executivo)
```

**Limite encontrado:** no Claude Code 2.1.319, o `/clear` não leva a frente para a sessão nova (a decisão 5 da fatia 2 não se cumpre), porque o `SessionEnd` da sessão velha chega antes do `SessionStart` da nova e o harness trata todo `SessionEnd` como fim. Que esse `SessionEnd` veio com `reason: "clear"` (e o `SessionStart` com `source: "clear"`) é inferido da documentação e da ordem dos eventos: os eventos gravados neste ensaio não guardavam o `reason` nem o `source` (o `sessao-fim` acima não tem `motivo`, e o `sessao-inicio` de `<C>` só diz `origem: continuacao`, que `resume` também daria). A frente fica órfã até um `ah takeover`. Registrado para conserto (o `SessionEnd` de `clear` não deveria encerrar a sessão, ou a continuação deveria aceitar a sessão do mesmo processo encerrada há instantes).

**Conserto (depois do ensaio, ainda não reensaiado com o agente):** o adaptador passa o `reason` do `SessionEnd` adiante; com `clear` ou `resume` (os dois anunciam uma sessão nova no mesmo processo) o fim sai com `continuacao: true`, e o contrato não encerra a sessão: grava `aguardandoContinuacao` com o instante e registra `sessao-fim` com `motivo` e `aguardandoContinuacao: true`. O `SessionStart` seguinte com o mesmo pid (e a mesma hora de início) acha a sessão sem `fim`, a substitui e herda a frente com vínculo (eventos `substituida` e `heranca`; a frente ganha a velha em `sessoesAnteriores`). Se o início não vier, a sessão fica sem `fim` e a vida dela é a do pid e do sinal: com o processo morto a frente fica órfã e o `ah takeover` passa. Outros motivos (`logout`, `prompt_input_exit`, `other`) continuam encerrando. Onde a hora de início não se lê (Windows), a herança não acontece; a T4 não barra a sessão nova no worktree da velha (dona no mesmo pid do agente e sem hora de início não conta como outra sessão viva). Esperado no reensaio: `sessao-fim` de `<A>` com `"motivo":"clear"`, depois `sessao-inicio` de `<C>`, `substituida` e `heranca` de `<A>` para `<C>`.

### Varredura de termos

```
$ node ferramentas/varre-termos.mjs
Nenhum termo proibido encontrado.
```
