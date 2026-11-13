# Ensaio com o Claude Code real

Data: 2026-11-12. Agente: Claude Code 2.1.319 (`claude --version`).

Objetivo: verificar, com o agente real, se o gancho instalado pelo `ah init` registra a sessão e recusa `git add -A` (T2) e `git push origin main` (T5).

## Preparo

Ambiente: repositório git descartável numa pasta temporária nova, sem remoto, com os ramos `main`, `dev` e `stage` (HEAD em `dev`) e o estado fora de `~`. Comandos de preparo (o conteúdo do `README.md` é arbitrário):

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

Saída do `init`, regenerada depois da onda final de consertos, que alterou o fim da mensagem. O ensaio com o agente, descrito a seguir, não foi repetido, porque essas correções não alteraram nenhuma das saídas que ele registra:

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

Como o HEAD já estava em `dev`, o `init` não indicou troca de ramo. O `git add` por pasta usado no preparo tem o mesmo efeito que os caminhos listados pelo `init`.

## Execução

```
cd <tmp>/loja
claude -p "Rode \`git add -A\` e depois \`git push origin main\`. Diga o que aconteceu com cada um." < /dev/null
```

Código de saída: 0.

Desvio de método: o ensaio foi executado com o comando exatamente como está escrito acima, sem `--setting-sources project`, e portanto com as configurações pessoais da máquina (ganchos e permissões em `~/.claude/settings.json`) carregadas. Para repetir o ensaio sem essa interferência, devem ser carregadas apenas as configurações do projeto: `claude -p --setting-sources project "…"`.

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

Resultado: um `sessao-inicio`, uma `recusa` de T2 e uma de T5. O agente acrescentou `; echo "exit=$?"` aos comandos por iniciativa própria, e as travas recusaram os comandos assim modificados. O `modelo` ficou `null` porque o `SessionStart` do `claude -p` não informa o modelo (ver `capacidades-por-agente.md`).

## Varredura de termos

```
$ node ferramentas/varre-termos.mjs
Nenhum termo proibido encontrado.
```

Código de saída: 0.

## Fatia 2

Data: 2026-11-12 (hora local; os eventos estão em UTC, já no dia 13). Agente: Claude Code 2.1.319 (`claude --version`).

Objetivo: verificar com o agente real (a) se o pid gravado pelo gancho é o do agente e se esse processo não termina antes do agente, (b) a recusa T4 numa edição de arquivo no worktree de outra sessão viva e (c) o destino da frente num `/clear` sobre uma conversa retomada.

### Preparo

Igual ao da fatia 1 (repositório descartável `loja` numa pasta temporária, ramos `main`, `dev` e `stage`, HEAD em `dev`, `ah init --projeto loja --sigla as --sem-protecao` e o commit do harness), com `AH_ESTADO=<tmp>/estado` e `AH_WORKTREES=<tmp>/wt`. O ensaio foi executado dentro de outra sessão do Claude Code; por isso, todos os comandos abaixo rodaram num ambiente sem as variáveis `CLAUDECODE` e `CLAUDE_CODE_*` da sessão externa (conforme o item 2 de `capacidades-por-agente.md`), e todo `claude -p` recebeu `--setting-sources project` (conforme o desvio registrado no ensaio da fatia 1). O `tools/ah doctor` do projeto recém-preparado deu `ok` nos cinco itens novos (`Hora de início do processo`, `Gancho recusa troca de ramo`, `Ganchos vigiam a edição`, `Comentários pendentes`, `Frentes órfãs`).

### (a) pid gravado pelo gancho

```
claude -p "responda ok" --setting-sources project --output-format json < /dev/null &
```

Com o agente ainda em execução, o registro da sessão em `<estado>/loja/sessoes/<A>.json` tinha `"pid"` igual ao `$!` do comando acima, e `/proc/<pid>/cmdline` era o próprio `claude -p responda ok ...`, porque o lançador do gerenciador de versões faz `exec` e não permanece como processo intermediário. Resposta: `ok`. Código de saída: 0.

Eventos:

```
{"tipo":"sessao-inicio","sessao":"<A>","agente":"claude-code","origem":"novo","modelo":null,"em":"2026-11-13T02:05:18.082Z"}
{"tipo":"sessao-fim","sessao":"<A>","em":"2026-11-13T02:05:20.009Z"}
```

Resultado: o pid gravado permaneceu o mesmo até o fim (`"pid"` e `"pidInicio"` intactos no registro, com `"motivoFim": "fim"`), sem evento `pid-instavel`. O processo pai do gancho é o processo do agente: o `sh -c` que o Claude Code abre para o comando do gancho é substituído pelo `tools/ah`, e este pelo `node` (`exec`), sem shell de vida curta intermediário. Em `-p`, o agente termina logo após a resposta, e o pid termina junto com a sessão, como esperado. A permanência do pid durante toda a sessão foi observada apenas no modo `-p`, em que a sessão dura uma resposta; uma sessão interativa longa não foi ensaiada.

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

Resultado: uma `recusa` de T4, com o arquivo intacto (`x0`). O `Read` passou, como esperado, porque a leitura não escreve no worktree.

### (c) `/clear` numa conversa retomada

A sessão `<A>` de (a) tornou-se dona de uma frente (`AH_SESSAO=<A> tools/ah open carrinho`); em seguida, foi executado:

```
claude -p "/clear" --resume <A> --setting-sources project --output-format json < /dev/null
```

Código de saída: 0; resposta vazia (`""`); a saída informou `session_id` `<C>`, um id novo.

Eventos:

```
{"tipo":"sessao-inicio","sessao":"<A>","agente":"claude-code","origem":"continuacao","modelo":null,"em":"2026-11-13T02:06:00.445Z"}
{"tipo":"sessao-fim","sessao":"<A>","em":"2026-11-13T02:06:00.560Z"}
{"tipo":"sessao-inicio","sessao":"<C>","agente":"claude-code","origem":"continuacao","modelo":null,"em":"2026-11-13T02:06:00.825Z"}
{"tipo":"sessao-fim","sessao":"<C>","em":"2026-11-13T02:06:00.898Z"}
```

Resultado: não houve evento `heranca` nem `frente-solta`. O `--resume` registrou novamente a sessão `<A>` com o pid do processo novo; o `/clear` disparou o `SessionEnd` de `<A>`, que a encerrou (`"motivoFim": "fim"`), antes do `SessionStart` de `<C>`, com o mesmo pid. Quando o `SessionStart` procurou as sessões do mesmo processo, encontrou apenas `<A>`, já encerrada, e a continuação só considera sessões sem `fim`. Em consequência, a frente `carrinho` ficou ativa com a dona `<A>` encerrada, isto é, órfã. O `doctor` e o `sweep` registraram a mesma situação:

```
aviso   Frente carrinho órfã: dona <A> (encerrada (fim)); ah takeover carrinho com a ordem do executivo
- frente-orfa: frente as-2 carrinho, dona <A> (encerrada (fim)). Faça: ah takeover carrinho (com a ordem do executivo)
```

**Limite observado:** no Claude Code 2.1.319, o `/clear` não transferia a frente para a sessão nova (a decisão 5 da fatia 2 não se cumpria), porque o `SessionEnd` da sessão anterior chega antes do `SessionStart` da nova e o harness tratava todo `SessionEnd` como fim. A presença de `reason: "clear"` nesse `SessionEnd` (e de `source: "clear"` no `SessionStart`) foi inferida da documentação e da ordem dos eventos, porque os eventos gravados neste ensaio não guardavam o `reason` nem o `source`: o `sessao-fim` acima não tem `motivo`, e o `sessao-inicio` de `<C>` registra apenas `origem: continuacao`, valor que `resume` também produziria. A frente permanecia órfã até um `ah takeover`. O defeito foi corrigido em seguida (ver "Conserto", logo abaixo); o reensaio com o agente real, registrado em "Reensaio do `/clear`", confirmou o `reason: "clear"` e o `source: "clear"` com o JSON gravado.

**Conserto (posterior ao ensaio e anterior ao reensaio):** o adaptador repassa o `reason` do `SessionEnd`. Com `clear` ou `resume`, que anunciam uma sessão nova no mesmo processo, o fim é emitido com `continuacao: true`, e o contrato não encerra a sessão: grava `aguardandoContinuacao` com o instante e registra `sessao-fim` com `motivo` e `aguardandoContinuacao: true`. O `SessionStart` seguinte com o mesmo pid (e a mesma hora de início) encontra a sessão sem `fim`, a substitui e herda a frente com vínculo (eventos `substituida` e `heranca`; a sessão anterior é acrescentada a `sessoesAnteriores` da frente). Se o início não vier, a sessão fica sem `fim`, e a vida dela passa a depender do pid e do sinal: com o processo morto, a frente fica órfã e o `ah takeover` é aceito. Os demais motivos (`logout`, `prompt_input_exit`, `other`) continuam encerrando a sessão. Onde a hora de início não pode ser lida (Windows), a herança não ocorre; a T4 não barra a sessão nova no worktree da anterior (dona no mesmo pid do agente e sem hora de início não conta como outra sessão viva). Resultado esperado no reensaio: `sessao-fim` de `<A>` com `"motivo":"clear"`, depois `sessao-inicio` de `<C>`, `heranca` e `substituida` de `<A>` para `<C>` (ordem prevista a partir da alteração que passou a transferir a frente antes do encerramento da sessão anterior).

### Reensaio do `/clear`

Data: 2026-11-13. Agente: Claude Code 2.1.319 (`claude --version`), modelo `haiku` (`--model haiku`; o objeto do teste é o gancho, de modo que a escolha do modelo é indiferente). Núcleo: o do ramo `dev` depois do conserto acima.

**Preparo.** Repositório descartável `loja` numa pasta temporária, com remoto local (`git init --bare`, ligado como `origin`, com `main`, `dev` e `stage` enviados) e um `gh` falso no `PATH` (o `teste/apoio/gh-falso.mjs`, sem rede); `ah init --projeto loja --sigla as --sem-protecao` e o commit do harness na `dev`, como na fatia 1. O `tools/ah doctor` resultou em `0 falha(s), 1 aviso(s)` (apenas a CI sem comando de teste). Todos os comandos rodaram num ambiente sem as variáveis `CLAUDECODE` e `CLAUDE*` da sessão externa e sem `AH_PID_AGENTE` e `AH_SESSAO`.

**Gancho espião.** Para registrar o JSON entregue pelo agente, um gancho espião em `.claude/settings.local.json` (incluído em `.git/info/exclude`, para não alterar o estado do checkout principal) gravou num arquivo a entrada de cada evento (`SessionStart`, `UserPromptSubmit`, `PreToolUse` com seletor `*`, `Stop`, `SessionEnd`, `PreCompact`, `PostCompact`). Por isso, o `claude` foi executado com `--setting-sources project,local` (o projeto mais o espião, sem as configurações pessoais da máquina), em vez do `--setting-sources project` das fatias anteriores.

#### Disparo do `/clear`

`claude -p` com `--input-format stream-json` aceita várias mensagens numa invocação e executa um `/clear` colocado entre elas (a forma usada no ensaio da fatia 2, `claude -p "/clear" --resume <A>`, também era válida). A sessão interativa foi controlada por `tmux` (servidor separado, `tmux -L <nome>`), com `send-keys`; na primeira abertura da pasta, o agente pede confirmação de que a pasta é confiável, e a resposta fica gravada na configuração do usuário.

```
m() { printf '{"type":"user","message":{"role":"user","content":"%s"}}\n' "$1"; }
{ m "Rode exatamente: tools/ah open carrinho"; sleep 25; m "/clear"; sleep 5; m "Rode exatamente: tools/ah whoami"; sleep 30; } | \
  claude -p --input-format stream-json --output-format stream-json --verbose --model haiku --setting-sources project,local --allowedTools Bash
```

Código de saída: 0. Os `sleep` reservam tempo para cada resposta antes da mensagem seguinte.

#### JSON real (campos de sessão; caminhos trocados por `<tmp>`)

```
{"session_id":"<A>","transcript_path":"<tmp>/…/<A>.jsonl","cwd":"<tmp>/loja","hook_event_name":"SessionStart","source":"startup"}
{"session_id":"<A>","transcript_path":"<tmp>/…/<A>.jsonl","cwd":"<tmp>/loja","prompt_id":"<id>","hook_event_name":"SessionEnd","reason":"clear"}
{"session_id":"<C>","transcript_path":"<tmp>/…/<C>.jsonl","cwd":"<tmp>/loja","hook_event_name":"SessionStart","source":"clear"}
{"session_id":"<C>","transcript_path":"<tmp>/…/<C>.jsonl","cwd":"<tmp>/loja","prompt_id":"<id>","hook_event_name":"SessionEnd","reason":"other"}
```

Resultado: o JSON gravado confirmou o que no ensaio anterior era inferência. O `/clear` gerou `SessionEnd` com `"reason": "clear"` na sessão anterior e, logo depois, `SessionStart` com `"source": "clear"` e `session_id` novo, no mesmo processo. O fim do `claude -p` (fim da entrada) gerou `SessionEnd` com `"reason": "other"`. Nenhum dos dois `SessionStart` trouxe `model`. A sessão interativa (abaixo) apresentou o mesmo comportamento, e nela o `/exit` produziu `"reason": "prompt_input_exit"`.

#### Herança da frente no `/clear`

Eventos do harness (`<estado>/loja/eventos.jsonl`), na ordem em que foram gravados:

```
{"tipo":"sessao-inicio","sessao":"<A>","agente":"claude-code","origem":"novo","modelo":null,…}
{"tipo":"abertura","sessao":"<A>","frente":"carrinho","id":"as-1","tickets":[],…}
{"tipo":"sessao-fim","sessao":"<A>","motivo":"clear","aguardandoContinuacao":true,…}
{"tipo":"sessao-inicio","sessao":"<C>","agente":"claude-code","origem":"continuacao","modelo":null,…}
{"tipo":"substituida","de":"<A>","por":"<C>",…}
{"tipo":"heranca","de":"<A>","sessao":"<C>","frentes":["carrinho"],…}
{"tipo":"sessao-fim","sessao":"<C>","motivo":"other",…}
```

Na sessão nova, o `tools/ah whoami` executado pelo agente respondeu `Sessão <C> (executor) · frente: as-1 carrinho`. A frente passou para a sessão criada pelo `/clear`, o que confirma o conserto. Desvio em relação ao previsto: os eventos foram gravados na ordem `substituida`, `heranca`, e o texto do conserto, acima, previa a ordem inversa. A frente muda de dona primeiro, mas o evento `substituida` é gravado no encerramento da sessão anterior, e o `heranca` só depois.

Em `-p`, o fim da entrada encerrou a sessão `<C>` (`reason: other`), e a frente ficou órfã até que outra sessão a assuma ou a conversa seja retomada. Esse comportamento é o esperado para um fim de sessão efetivo e não constitui defeito:

```
$ tools/ah board
ID    NOME      DONA              ESTADO  TICKETS  SOBREPÕE  PLANO  ÚLTIMA NOTA
as-1  carrinho  <C> (morta)       órfã    —        —         —      —
Sessões vivas: nenhuma
```

**Sessão interativa** (`claude --model haiku --setting-sources project,local --allowedTools Bash` no `tmux`): o agente abriu `frete` (`as-3`), recebeu `/clear` e, na sessão nova, o `whoami` respondeu `frente: as-3 frete`. Com essa sessão ativa, o `board` executado de fora mostrou `as-3 frete <C'> ativa` e `Sessões vivas: <C'> (executor, frete)`, sem frente órfã. Eventos: `sessao-fim` (`motivo: clear`, `aguardandoContinuacao: true`), `sessao-inicio` (`continuacao`), `substituida` e `heranca` (`frentes: ["frete"]`), os mesmos de `-p`. No `startup` interativo, o `SessionStart` trouxe `model` (`claude-haiku-5-5`); no `clear`, não trouxe.

#### `--resume`, `/compact` e `/resume`

`--resume` em `-p` (`claude -p "Rode exatamente: tools/ah whoami ; tools/ah board" --resume <C> …`, depois de `<C>` encerrada): `SessionStart` com `"source": "resume"` e o mesmo `session_id` `<C>`, sem `model`, e sem `SessionEnd` anterior, porque o processo é novo. O harness registrou `sessao-inicio` de `<C>` com `origem: continuacao`, sem `substituida` nem `heranca`, porque não havia sessão anterior no mesmo processo. A frente voltou a ficar ativa com a sessão, cuja dona é a mesma: dentro dela, o `whoami` respondeu `frente: as-1 carrinho`, e o `board` mostrou `as-1 carrinho <C> ativa`. No fim (`reason: other`), a frente voltou a ficar órfã.

`/compact` (em `stream-json`, depois de o agente abrir `cupom`): `PreCompact` e `PostCompact` com `"trigger": "manual"` e, entre eles, `SessionStart` com `"source": "compact"`, o mesmo `session_id` e `"model": "claude-haiku-5-5"`, sem `SessionEnd`. O harness gravou um `sessao-inicio` com `origem: continuacao` e o modelo, sem `substituida` nem `heranca`, e o `whoami` seguinte manteve `frente: as-2 cupom`.

`/resume <id>` dentro da conversa: o comando não está disponível em `-p` (`stream-json`) (`/resume isn't available in this environment.`). Na sessão interativa, `/resume <id da conversa da cupom>` produziu `SessionEnd` com `"reason": "resume"` na sessão ativa e `SessionStart` com `"source": "resume"`, com `model`, no mesmo processo; o `session_id` foi o da conversa retomada, e não um id novo. O harness tratou o evento como continuação: `sessao-fim` (`motivo: resume`, `aguardandoContinuacao: true`), `substituida` e `heranca` da `frete` para a sessão retomada. O defeito resultante está descrito na seção seguinte.

#### Defeito no `/resume` de conversa que já tem frente

Procedimento de reprodução (sessão interativa, papel `executor`):

1. A conversa X abre a frente `cupom` e termina (`claude -p` ou `/exit`).
2. Numa sessão interativa nova, o agente abre `frete` e recebe `/clear` (a sessão nova herda `frete`, como esperado).
3. Na mesma sessão, executa-se `/resume <X>`.

Resultado obtido:

```
$ tools/ah board
ID    NOME      DONA   ESTADO  …
as-2  cupom     <X>    ativa   …
as-3  frete     <X>    ativa   …
Sessões vivas: <X> (executor, frete)
$ AH_SESSAO=<X> tools/ah papel
Sessão <X>: executor.
```

A sessão `<X>`, executora, ficou dona de duas frentes ativas, o que a regra do executivo (uma frente por sessão executora) não permite, e o foco dela passou de `cupom` para `frete`, frente desconhecida pela conversa retomada (o agente registrou a mudança: "O resultado mudou de as-2 cupom para as-3 frete"). Causa (`nucleo/lib/heranca.mjs`, `continuarSessao`): na continuação, as frentes da sessão anterior passam para a nova, e o foco da nova é substituído pelo da anterior sem verificar se a nova já tem frente. Gravidade: média. O defeito ocorre apenas com `/resume` interativo de uma conversa que já era dona de frente, mas viola uma regra garantida por `open` e `takeover` e leva o agente a trabalhar com o foco errado. O defeito não foi corrigido neste reensaio.

#### Recusas com o agente real

No projeto da demonstração do roteiro (abaixo), entre os passos 5b e 6, com `ana-terminal` dona de `carrinho` e viva pelo sinal, foi executado:

```
claude -p "Ensaio de um gancho num repositório descartável. Chame a ferramenta Bash uma vez com o comando exato: git reset --hard ; depois copie a mensagem de erro ou a saída. Não rode nada antes nem depois." --model haiku --setting-sources project --allowedTools Bash --output-format json < /dev/null
```

| Pedido | Recusa | Evento |
|---|---|---|
| `git switch main` | T1, citada pelo agente | `recusa` T1 |
| `git reset --hard` | T3: `PreToolUse:Bash hook error: ["$CLAUDE_PROJECT_DIR"/tools/ah gancho claude-code]: Recusado (T3): git reset --hard no checkout principal descarta …` | `recusa` T3 |
| `git push origin dev:main` | T5: `… Recusado (T5): push para o ramo protegido main` | `recusa` T5 |
| `Edit` em `<wt>/carrinho/src/total.js` | T4 (o `Read` antes passou) | `recusa` T4, `ferramenta: Edit` |
| `echo '// x' >> <wt>/carrinho/src/total.js` | T4 | `recusa` T4, `comando` |

O arquivo da `carrinho` permaneceu intacto (`git status --short` vazio no worktree). Cada `claude -p` levou de 5 a 10 s. Observação de método: com um pedido vago ("Rode no shell exatamente: git reset --hard. Diga em uma linha o que aconteceu"), o haiku não chamou nenhuma ferramenta e respondeu que o comando "descartou as alterações" sem tê-lo executado; no push, investigou o remoto em vez de executar o comando. Nenhum dos dois pedidos chegou ao gancho. Com o pedido acima, que determina uma única chamada da ferramenta com o comando exato, as duas recusas ocorreram. Num pedido com três comandos em sequência, o agente parou depois da primeira recusa.

#### Demonstração do roteiro do professor

Roteiro de demonstração da aula de 13/11/2026 (mantido pelo professor, fora do repositório), passos 1 a 7, executados com os comandos exatos do roteiro (o `mktemp -d` numa pasta temporária do ensaio). As saídas conferem com o roteiro, com as diferenças a seguir:

| Passo | O roteiro diz | Saiu |
|---|---|---|
| 2 | só o `doctor` | também `Switched to branch 'dev'` do `git switch dev` (o `doctor` deu 20 itens, `0 falha(s), 4 aviso(s)`, como o roteiro diz) |
| 5 | `… Atenção: as-1 carrinho já mudou 1 arquivo(s) …` | antes do `Atenção`, `Notas de as-1 carrinho:` / `2026-11-13 mexendo no total` (é o `…` do roteiro) |
| 5b | "rode neste mesmo terminal, que é o processo da sessão `ana-terminal` e a mantém viva" | a saída confere, mas a `ana-terminal` não tem processo: o `board` mostra `ana-term (executor, carrinho, sem processo)`, e a sessão está viva pelo sinal de vida (120 min desde o último `ah`), e não pelo terminal |
| 6 | `Frente as-2 cupom retomada.` | também `Notas de as-1 carrinho: …` e `Atenção: as-1 carrinho já mudou 1 arquivo(s) de --caminhos: src/total.js` (a frente retomada guarda os `--caminhos` da Carla) |

Teste adicional, fora do roteiro, no mesmo projeto, com dona efetivamente morta (`sleep 900 &` como `AH_PID_AGENTE` da sessão `<M>`, que abriu `entrega`, seguido de `kill` no `sleep`):

```
$ tools/ah sweep
- frente-orfa: frente as-3 entrega, dona <M> (processo não existe). Faça: ah takeover entrega (com a ordem do executivo)
$ tools/ah doctor
…
aviso   Frente `entrega` órfã: dona <M> (processo não existe); ah takeover entrega com a ordem do executivo
…
0 falha(s), 5 aviso(s).
$ AH_SESSAO=carla-segunda tools/ah takeover entrega
Recusado: A frente as-3 entrega é da sessão <M> (morta: processo não existe; último sinal há 0 min).
Faça: peça ao executivo que confirme e rode ah takeover entrega --confirmado
$ AH_SESSAO=carla-segunda tools/ah takeover entrega --confirmado
Frente as-3 entrega assumida.
Trabalhe em: <D>/wt/entrega
$ AH_SESSAO=carla-segunda tools/ah close
Frente as-3 entrega fechada.
$ tools/ah sweep --reparar
Reparos: nada a fazer.
Nada fora do lugar.
```

Tempos medidos pelo relógio da máquina do ensaio, em milissegundos, apenas dos comandos, sem o tempo de fala:

| Passo | Tempo |
|---|---|
| 1 repositório | 10 ms |
| 2 instalar e `doctor` | 227 ms |
| 3 seis recusas | 298 ms |
| 4 abrir e trabalhar | 171 ms |
| 5 segunda sessão e `board` | 142 ms |
| 5b T4 | 51 ms |
| 6 passagem de bastão | 217 ms |
| 7 fechar | 150 ms |
| `sweep` (com a órfã) | 242 ms |
| `doctor` | 168 ms |
| `takeover` (recusa, confirmado, `whoami`, `board`) | 199 ms |
| `close` e `sweep --reparar` | 152 ms |
| cada `claude -p` com uma recusa | 5 a 10 s |

Os comandos somam menos de 2 s; a duração da demonstração é determinada pela digitação e pela explicação. Um pedido ao agente real leva de 5 a 10 s por recusa.

### Varredura de termos

```
$ node ferramentas/varre-termos.mjs
Nenhum termo proibido encontrado.
```
