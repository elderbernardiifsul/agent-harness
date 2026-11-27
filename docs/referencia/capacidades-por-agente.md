# Capacidades por agente

Sondagem de 2026-11-12, válida para as versões ensaiadas: Claude Code 2.1.319, Codex CLI 0.166.0 e OpenCode 2.2.2. Em outra versão, o ensaio descrito no fim deste documento deve ser refeito.

Apenas o Claude Code tem adaptador no harness. Para Codex, OpenCode ou outro agente, o adaptador é escrito pelo próprio agente, segundo o roteiro em [`docs/agentes/`](../agentes/README.md) (spec, seção 15). As colunas de Codex e OpenCode servem de ponto de partida para esse trabalho e, onde não há ensaio, devem ser lidas como "da documentação, não ensaiado".

Fontes (consultadas em 2026-11-12):

- **[CC-hooks]** Claude Code, referência de ganchos: https://code.claude.com/docs/en/hooks
- **[CC-tools]** Claude Code, referência de ferramentas: https://code.claude.com/docs/en/tools-reference
- **[CC-env]** Claude Code, variáveis de ambiente: https://code.claude.com/docs/en/env-vars
- **[CX-hooks]** Codex, ganchos: https://developers.openai.com/codex/hooks
- **[CX-exec]** Codex, modo sem interface: https://developers.openai.com/codex/noninteractive
- **[OC-plugins]** OpenCode, plugins (configurar): https://opencode.ai/docs/plugins/
- **[OC-server]** OpenCode, plugin de servidor (ganchos): https://opencode.ai/docs/build/plugins/server/
- **[OC-migra]** OpenCode, migração de plugins da V1: https://opencode.ai/docs/build/plugins/migrate-v1/
- **[OC-perm]** OpenCode, permissões: https://opencode.ai/docs/permissions/
- **[OC-cli]** OpenCode, CLI: https://opencode.ai/docs/cli/
- **[GH-prot]** GitHub, sobre ramos protegidos: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches
- **[GH-api]** GitHub, API de proteção de ramo: https://docs.github.com/en/rest/branches/branch-protection
- **[GH-rules]** GitHub, conjuntos de regras: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets
- **[Ensaio]** ensaio local de 2026-11-12, descrito no fim deste documento.

Quando a documentação e o ensaio divergem, a célula registra os dois e indica qual prevalece.

## Nota de 27/11/2026: skills e instruções do projeto

A tabela abaixo é da sondagem de 12/11. Os ensaios do projeto 2 conferiram, em versões mais novas, o que o método usa. Fontes: [registro da fatia 1](../superpowers/plans/2026-11-26-metodo-fatia-1-registro.md) ("Sondagem" e "Ensaio final") e [registro da fatia 2](../superpowers/plans/2026-11-27-metodo-fatia-2-registro.md) ("Ensaio de leitura").

**Codex 0.172.0.**
- Lê as skills de `.agents/skills/` e o `AGENTS.md`.
- Resolve `superpowers:<nome>` para a skill local `<nome>`, sem instrução.
- Skill que só o humano chama (`disable-model-invocation: true`) não entra na lista das que ele usa sozinho; o humano a chama com a menção `$<skill>` no pedido, pela documentação.
- Com o sandbox `workspace-write`, o Node não consegue iniciar o git (`EPERM`), e o `tools/ah` falha (README, "Instalar num projeto", passo 5).

**Claude Code 2.1.332.**
- Lê as skills de `.claude/skills/`.
- Lê o `AGENTS.md` pelo `CLAUDE.md` com a linha `@AGENTS.md`, ou sozinho, sem `CLAUDE.md`.
- Não carrega `CLAUDE.md` nem `AGENTS.md` de uma pasta dentro do rascunho de uma sessão (`scratchpad`); um ensaio montado ali parece ignorar as instruções.

## Tabela

| | Claude Code 2.1.319 | Codex 0.166.0 | OpenCode 2.2.2 |
|---|---|---|---|
| **(a) Evento antes de comando de shell e formato** | **Sim.** `PreToolUse` com seletor `Bash`; JSON na entrada padrão com `tool_name: "Bash"` e `tool_input.command` (também `description`, `timeout`, `run_in_background`). O seletor `Bash` também alcança comandos da ferramenta `Monitor` (apenas para recusa). A ferramenta `PowerShell` tem nome próprio e precisa constar do seletor. [CC-hooks], [Ensaio] | **Sim.** `PreToolUse` com seletor `Bash` (cobre o shell e o `exec_command`); JSON na entrada padrão com `tool_name: "Bash"` e `tool_input.command`, mais `turn_id` e `model`. [CX-hooks]. Não ensaiado (ver "Ensaio"). | **Sim, por plugin.** `ctx.tool.hook("execute.before", fn)` recebe um objeto (não JSON pela entrada padrão) com `tool: "shell"`, `sessionID`, `agent`, `messageID`, `id` e `input.command`. Há também `ctx.shell.hook("create.before")`, que só altera comando, pasta, tempo e ambiente. [OC-server], [Ensaio] |
| **(b) Evento antes de editar arquivo e nomes das ferramentas** | **Sim.** `PreToolUse` com `tool_name` `Edit`, `Write` (`tool_input.file_path`, sempre absoluto) e `NotebookEdit` (`tool_input.notebook_path`). `MultiEdit` não consta da lista de ferramentas da 2.1.319; mantê-lo no seletor não tem efeito. [CC-hooks], [CC-tools], [Ensaio] | **Sim.** `PreToolUse` com `tool_name: "apply_patch"`; o seletor aceita `apply_patch`, `Edit` ou `Write`. O caminho não vem num campo: está dentro do texto do patch em `tool_input.command`. [CX-hooks]. Não ensaiado. | **Sim, por plugin.** O mesmo `execute.before`; ferramentas `edit`, `write` e `patch` [OC-perm]. No ensaio, `write` trouxe `input.path` (não `filePath`) e `input.content`. [Ensaio] |
| **(c) Forma de recusa e entrega da mensagem ao modelo** | **Sim.** Sair com código 2 e o motivo na saída de erro; o modelo recebe `PreToolUse:Bash hook error: [<comando do gancho>]: <motivo>`. Alternativa: código 0 com `hookSpecificOutput.permissionDecision: "deny"` e `permissionDecisionReason`. [CC-hooks]; no ensaio o modelo citou o motivo literal. [Ensaio] | **Sim.** Código 2 com o motivo na saída de erro, ou `hookSpecificOutput.permissionDecision: "deny"` com `permissionDecisionReason`, ou o formato antigo `{"decision":"block","reason":...}`. `ask` não é suportado (o gancho é tratado como falho e a ferramenta é executada). [CX-hooks] | **Sim.** Lançar exceção no `execute.before`; a ferramenta não roda (`session.tool.failed` com `executed: false`) e o modelo recebe a mensagem da exceção. Documentado só no guia de migração [OC-migra]; confirmado no ensaio. Alternativa sem código: regra `{"action":"shell","resource":"git push *","effect":"deny"}` em `permissions` [OC-perm]. |
| **(d) Início de sessão, continuação e injeção de contexto** | **Sim.** `SessionStart` com `source` = `startup`, `resume`, `clear`, `compact` ou `fork`. A saída padrão em texto (código 0) entra no contexto; ou `hookSpecificOutput.additionalContext`. [CC-hooks]; `startup`, `resume`, `compact` e (no reensaio de 2026-11-13) `clear` confirmados no ensaio. `clear` traz `session_id` novo; `compact` e o `--resume` de `-p`, o mesmo; o `/resume <id>` interativo, o id da conversa retomada. | **Sim.** `SessionStart` com `source` = `startup`, `resume`, `clear`, `compact` ou `fork`; texto na saída padrão ou `additionalContext` é incorporado como contexto de desenvolvedor. [CX-hooks] | **Parcial.** Não há evento de início de sessão com origem. O contexto entra pelo gancho `ctx.session.hook("context")`, que roda antes de cada chamada ao modelo e pode editar `event.system`; a compactação tem gancho próprio (`compaction`) e a bifurcação também (`fork`). [OC-server] |
| **(e) Evento por interação e de fim de sessão** | **Sim.** `UserPromptSubmit` (campo `prompt`; código 2 rejeita o pedido), `Stop` (fim de cada resposta; `last_assistant_message`) e `SessionEnd` (`reason`: `clear`, `resume`, `logout`, `prompt_input_exit`, `other`; orçamento padrão de 1,5 s). No reensaio de 2026-11-13 vieram `clear` (`/clear`), `resume` (`/resume <id>` interativo), `prompt_input_exit` (`/exit`) e `other` (fim do `claude -p`); o `/compact` não gera `SessionEnd`. [CC-hooks], [Ensaio] | **Sim.** `UserPromptSubmit`, `Stop` (exige JSON na saída padrão) e `SessionEnd` (`reason` sempre `other`; 1 s padrão, até 3 s). [CX-hooks] | **Parcial.** Por interação: gancho `ctx.session.hook("prompt")` (altera o pedido, não recusa) e os eventos `session.execution.started` / `session.execution.succeeded` em `ctx.event.subscribe()`. Fim de sessão: não há; o mais próximo é o evento `location.shutdown` ao encerrar o servidor. [OC-server], [Ensaio] |
| **(f) Id da sessão no gancho e nos comandos de shell** | **Sim.** Gancho: `session_id` no JSON. Ambiente do gancho e dos comandos da ferramenta Bash: `CLAUDE_CODE_SESSION_ID`, igual ao `session_id` (atualiza no `/clear`). `CLAUDE_ENV_FILE` (só no `SessionStart`, `Setup`, `CwdChanged`, `FileChanged`) permite exportar outras variáveis para os comandos. Processo pai do gancho: é o próprio processo do agente (o `sh -c` do gancho e o `tools/ah` fazem `exec` até o `node`); no ensaio da fatia 2, só em `claude -p`, esse pid ficou vivo a sessão inteira e não foi descartado (sem `pid-instavel`); a sessão interativa longa não foi ensaiada. No `/clear`, o processo é o mesmo, mas o `SessionEnd` da sessão anterior (`reason: "clear"`) chega antes do `SessionStart` da nova (`source: "clear"`), visto no JSON gravado no reensaio de 2026-11-13 (ver `ensaio-claude-code.md`, "Reensaio do `/clear`"); o `/resume <id>` interativo faz o mesmo com `resume`; por isso o adaptador não encerra a sessão num `SessionEnd` de `clear` ou `resume`, só a marca `aguardandoContinuacao`. [CC-env], [CC-hooks], [Ensaio] | **Sim.** Gancho: `session_id` no JSON [CX-hooks]. Comandos de shell: `CODEX_THREAD_ID` e `CODEX_SESSION_ID`, iguais ao id da sessão. A documentação oficial não lista essas variáveis; prevalece o ensaio. [Ensaio] | **Sim.** Plugin: `sessionID` em todo evento. Comandos da ferramenta `shell`: `OPENCODE_SESSION_ID` (e `OPENCODE=1`); a variável não aparece no `env` visível ao gancho `shell.create.before`, porque é acrescentada depois. Não documentado; prevalece o ensaio. [Ensaio] |
| **(g) Informação do modelo em uso** | **Parcial.** Só o `SessionStart` pode trazer `model`, e a documentação diz que pode faltar. No ensaio, faltou no `startup` e no `resume` em `-p` (mesmo com `--model`) e no `clear` (em `-p` e interativo), e veio no `compact` (`"model": "claude-haiku-5-5"`) e, na sessão interativa, no `startup` e no `resume` (reensaio de 2026-11-13). Não há variável de ambiente com o modelo. [CC-hooks], [Ensaio] | **Sim.** `model` é campo comum a todos os eventos. [CX-hooks] | **Sim.** `model: {providerID, id, variant}` nos ganchos `context`, `compaction`, `model.request` e afins; não vem no `execute.before`. [OC-server], [Ensaio] |
| **(h) Arquivo de ganchos do projeto** | **Sim.** `.claude/settings.json` (versionado) e `.claude/settings.local.json`, chave `hooks`. [CC-hooks] | **Sim.** `.codex/hooks.json` ou `[hooks]` em `.codex/config.toml`. Só carrega com a pasta `.codex/` do projeto confiável **e** cada gancho revisado e confiado (por hash) em `/hooks`. [CX-hooks] | **Sim.** Plugin em `.opencode/plugins/<nome>.js` (ou `.ts`, ou pasta), carregado automaticamente; ou lista `plugins` em `opencode.json(c)` / `.opencode/opencode.jsonc`. [OC-plugins], [Ensaio] |
| **(i) Modo sem interface para ensaio** | **Sim.** `claude -p "<pedido>"`. Em `-p` a pasta é tratada como confiável e os ganchos do projeto rodam sem pedido de confirmação. [CC-hooks], [Ensaio] | **Sim.** `codex exec "<pedido>" < /dev/null` (sem o redirecionamento, o comando aguarda a entrada padrão). Os ganchos do projeto só rodam com confiança persistida ou com `--dangerously-bypass-hook-trust`. [CX-exec], [CX-hooks], [Ensaio] | **Sim.** `opencode run --standalone -m <provedor/modelo> "<pedido>" < /dev/null`; o plugin do projeto é carregado sem pedido de confirmação. [OC-cli], [Ensaio] |

## Detalhes que decidem código

1. **Variável com o id da sessão no Claude Code.** É `CLAUDE_CODE_SESSION_ID`, presente no processo do gancho e nos comandos da ferramenta Bash, com o mesmo valor do `session_id` do JSON [CC-env]. No ensaio, o gancho e o `env` rodado pelo agente mostraram o mesmo id que o JSON.
2. **Herança da variável por agentes filhos.** O ambiente é herdado. Um Codex ou OpenCode aberto dentro de uma sessão do Claude Code recebe o `CLAUDE_CODE_SESSION_ID` do Claude, e um Claude Code aberto dentro de outro também herda a variável até que ela seja sobrescrita. Para identificar a sessão a partir de um comando, deve-se consultar primeiro a variável do agente que executa o comando (`OPENCODE_SESSION_ID`, `CODEX_THREAD_ID`) e só depois `CLAUDE_CODE_SESSION_ID`. A forma mais confiável é usar a indicação explícita de agente (`OPENCODE=1`, `CODEX_CI`/`CODEX_THREAD_ID`, `CLAUDECODE=1`) mais recente.
3. **Ganchos em `claude -p`.** São executados sem pedido de confiança [CC-hooks, "Workspace trust"]. Também são executados os ganchos e plugins do usuário (`~/.claude/settings.json`); para isolar o ensaio, usa-se `--setting-sources project`. As permissões não interferem: o `PreToolUse` roda antes da checagem de permissão, e o código 2 recusa mesmo quando a permissão autorizaria a ferramenta.
4. **Formato da recusa.** O Claude Code acrescenta um prefixo à saída de erro (`PreToolUse:Bash hook error: [...]:`). A mensagem, portanto, não chega inalterada ao modelo, mas a primeira linha do motivo permanece legível.

## Decisões do adaptador do Claude Code

Decisões implementadas em `nucleo/adaptadores/claude-code.mjs` e `modelos/claude-code/ganchos.json`, com base no ensaio descrito neste documento:

- **Seletor do `PreToolUse`:** `Bash|PowerShell|Edit|Write|NotebookEdit`. `MultiEdit` não existe na versão ensaiada; `PowerShell` é incluído e tratado como comando (`tool_input.command`), assim como `Monitor`, que chega pelo seletor `Bash`. Ferramenta fora dessa lista é entrada inválida e segue a regra de falha do gancho.
- **`source` do `SessionStart`:** `startup` vira `novo`; `clear`, `resume`, `compact` e `fork` viram `continuacao` (decisão 5 da fatia 2: o `/clear` é continuação); valor desconhecido ou ausente vira `novo`. O `model` pode faltar e então fica nulo. A continuação só herda a frente da sessão anterior do **mesmo processo**: mesmo pid e mesma hora de início, conhecida nos dois lados. Onde a hora de início não se lê (Windows, `ps` que falhou), não há herança, e a frente fica com a sessão anterior até o sinal dela vencer (ver "Vida da sessão" em `comandos.md`).
- **`reason` do `SessionEnd`:** vai no evento `fim` como `motivo` (e no evento `sessao-fim` gravado). `clear` e `resume` anunciam uma sessão nova no mesmo processo (`continuacao: true`): a sessão não é encerrada, fica `aguardandoContinuacao` até o `SessionStart` seguinte do mesmo processo a substituir e herdar dela; se ele não vier, a sessão segue sem fim, com a vida do pid e do sinal. Os outros (`logout`, `prompt_input_exit`, `other`) encerram. Os `reason` de `clear` e `resume` vêm da documentação [CC-hooks] e foram vistos no JSON real no reensaio de 2026-11-13, com a herança da frente no `/clear` (ver `ensaio-claude-code.md`, "Reensaio do `/clear`"). No `/resume <id>` interativo de uma conversa que já é dona de frente, a herança deixa a sessão retomada com duas frentes, mesmo executora (defeito registrado no mesmo lugar). O `/compact` não gera `SessionEnd` (a sessão é a mesma).
- **`Stop`:** a saída com código 2 impediria o agente de encerrar a resposta. `UserPromptSubmit`, `Stop` e `SessionEnd` (sinal e fim) sempre saem com código 0; avisos são escritos na saída de erro.
- **Campos não utilizados:** `permission_mode` e `effort`, que variam por modo e por versão.
- **Recusa:** código 2 com o texto na saída de erro. O modelo recebe o texto depois do prefixo `PreToolUse:<ferramenta> hook error: [<comando>]: `; por isso, nenhum tratamento depende de a mensagem estar no início da linha.
- **Falha do gancho** (entrada que não é JSON, evento ou ferramenta desconhecidos, campo de tipo errado, `session_id` com `/` ou `..`, configuração inválida ou ausente, estado corrompido, erro interno): no `PreToolUse`, o gancho recusa com `Recusado (T0): o harness não conseguiu avaliar (<motivo>).` e `Faça: rode tools/ah doctor`, código 2; nos demais eventos, escreve uma linha de aviso e sai com código 0. Ainda assim, passam um comando que consiste numa única chamada a `tools/ah`, `./tools/ah`, `ah` ou `<raiz>/tools/ah` (depois de interpretado pelo shell do harness) e a edição de `.harness/config.json` (pelo caminho resolvido). Evento originado fora de um projeto do harness passa sem nenhuma ação.

## Proteção de ramo no GitHub

- **Ramos protegidos** [GH-prot], [GH-api]: disponíveis em repositórios públicos com GitHub Free e GitHub Free para organizações, e em repositórios públicos e privados com GitHub Pro, GitHub Team, GitHub Enterprise Cloud e GitHub Enterprise Server. Repositórios privados de contas Free não dispõem do recurso.
- **Chamada de API:** `PUT /repos/{owner}/{repo}/branches/{branch}/protection`, corpo com os quatro campos obrigatórios (podem ser `null`): `required_status_checks`, `enforce_admins`, `required_pull_request_reviews` e `restrictions`. Opcionais: `required_linear_history`, `allow_force_pushes`, `allow_deletions`, `required_conversation_resolution`. Pelo `gh`: `gh api -X PUT repos/exemplo/loja/branches/main/protection --input corpo.json`. Leitura: `GET` no mesmo caminho (404 quando não há proteção).
- **Restrição de quem pode enviar** (`restrictions`): só em repositório de organização (público em Free; todos em Team ou Enterprise Cloud) [GH-prot].
- **Conjuntos de regras** (alternativa): `POST /repos/{owner}/{repo}/rulesets`; regras efetivas de um ramo em `GET /repos/{owner}/{repo}/rules/branches/{branch}` [GH-rules].

## O que não fica coberto em cada agente

**Claude Code**
- A ferramenta `PowerShell` (Windows, e onde estiver habilitada) executa comandos com outro nome; um seletor `Bash|Edit|Write|MultiEdit|NotebookEdit` não a alcança.
- A ferramenta `Monitor` passa pelo seletor `Bash` apenas para recusa; `allow` e `updatedInput` não se aplicam a ela.
- O `model` no `SessionStart` falta no início normal em `-p` e após `/clear` (ensaio).
- `SessionEnd` tem orçamento padrão de 1,5 s; trabalho demorado nesse evento é interrompido.
- Comandos digitados pelo usuário fora do agente (terminal comum) não passam por nenhum gancho, nos três agentes.
- A T6 (trabalho pesado fora da fila) é trava de comando e tem, em cada agente, o mesmo alcance das demais. A fila (`ah pesado`) não depende de agente; subagentes e o terminal comum a usam da mesma forma.

**Codex**
- Os ganchos do projeto só são executados depois que a pasta `.codex/` é marcada como confiável e cada gancho é revisado e confiado em `/hooks`; alterar o script do gancho exige nova revisão. Em `codex exec`, sem essas condições, os ganchos são ignorados sem aviso (ensaio).
- O caminho do arquivo editado não vem num campo próprio e precisa ser extraído do patch em `tool_input.command`.
- Ferramentas hospedadas (por exemplo, `WebSearch`) não passam pelo `PreToolUse`; algumas ferramentas especializadas podem não passar pelos ganchos, e a documentação adverte que o gancho é "guarda útil, não fronteira completa".
- Ganchos de subagente usam o id da sessão-mãe; `SessionEnd` não é executado para subagentes.
- `CODEX_THREAD_ID` e `CODEX_SESSION_ID` não constam da documentação oficial e podem mudar sem aviso.

**OpenCode**
- Não há gancho por comando externo: o harness precisa de um plugin em JavaScript/TypeScript que chame o `ah` (o plugin roda dentro do servidor do OpenCode).
- Não há evento de início nem de fim de sessão com origem (novo, retomado, compactado). O contexto precisa entrar pelo gancho `context`, a cada chamada ao modelo.
- O gancho `prompt` apenas altera o pedido e não permite recusa.
- O bloqueio por exceção no `execute.before` está documentado apenas no guia de migração; a documentação do modelo de plugins atual não descreve a recusa. Uma questão aberta no repositório do OpenCode relata que o gancho não alcança chamadas de subagentes (não conferido nesta versão).
- `OPENCODE_SESSION_ID` não está documentada.

## Ensaio

Ambiente: repositórios descartáveis criados com `mktemp -d` (fora da pasta de projetos), com `git init`, um commit e sem remoto. Em cada repositório, um gancho gravava o JSON recebido e o ambiente num arquivo e recusava qualquer comando com `git push`.

**Claude Code 2.1.319.** `.claude/settings.json` com `SessionStart`, `UserPromptSubmit`, `PreToolUse` (seletor `Bash|Edit|Write|MultiEdit|NotebookEdit`), `Stop` e `SessionEnd`, todos chamando `"$CLAUDE_PROJECT_DIR"/.claude/gancho.sh`. O gancho escrevia um texto na saída padrão no `SessionStart` e saía com código 2 para `git push`.

```sh
claude -p "1) rode env | grep -i -E 'claude|session'  2) crie nota.txt com Write  3) rode git push origin main" \
  --setting-sources project --permission-mode acceptEdits --allowedTools "Bash(env:*)" --output-format json
claude -p "responda só: ok" --resume <id> --setting-sources project      # source: resume
claude -p "/compact" --resume <id> --setting-sources project             # source: compact, com model
claude -p "use Edit em nota.txt e NotebookEdit em nb.ipynb" --setting-sources project --permission-mode acceptEdits
```

Resultado: os cinco eventos dispararam; o `git push` não foi executado, e o modelo respondeu com o motivo literal da recusa; o contexto do `SessionStart` chegou ao modelo. Os JSON coletados, anonimizados, estão em `.superpowers/sdd/2026-11-12-nucleo-fatias-0-e-1/eventos-claude-code/`.

**Codex 0.166.0.** `.codex/hooks.json` com os mesmos eventos. `codex exec -s workspace-write "<pedido>" < /dev/null` foi executado, mas os ganchos do projeto não dispararam, porque a pasta não era confiável e os ganchos não haviam sido confiados. A confiança não pode ser concedida por `-c projects."<pasta>".trust_level=...` (a opção é ignorada na linha de comando), e ganchos passados por `-c hooks...` também foram ignorados. A opção `--dangerously-bypass-hook-trust` não foi usada nesta sondagem. O ensaio confirmou apenas o modo sem interface e as variáveis de ambiente do shell (`CODEX_THREAD_ID`, `CODEX_SESSION_ID`); o restante da coluna vem da documentação.

**OpenCode 2.2.2.** Plugin em `.opencode/plugins/sonda.js` (objeto `{id, setup(ctx)}` exportado por padrão, sem dependências) com `ctx.tool.hook("execute.before")`, `ctx.shell.hook("create.before")`, `ctx.session.hook("prompt")`, `ctx.session.hook("context")` e `ctx.event.subscribe()`.

```sh
opencode run --standalone -m opencode/big-pickle "1) rode env | grep ...  2) crie nota.txt  3) rode git push origin main" < /dev/null
```

Resultado: o plugin foi carregado sem pedido de confiança; a exceção bloqueou o `git push`, e o modelo citou a mensagem; `write` e `shell` passaram pelo `execute.before`.
