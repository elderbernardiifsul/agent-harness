# Capacidades por agente

Sondagem de 2026-11-12. Vale para as versões ensaiadas: Claude Code 2.1.319, Codex CLI 0.166.0 e OpenCode 2.2.2. Ao trocar de versão, refaça o ensaio do fim deste documento.

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

Onde a documentação e o ensaio discordam, a célula diz os dois e qual vale.

## Tabela

| | Claude Code 2.1.319 | Codex 0.166.0 | OpenCode 2.2.2 |
|---|---|---|---|
| **(a) Evento antes de comando de shell e formato** | **Sim.** `PreToolUse` com seletor `Bash`; JSON na entrada padrão com `tool_name: "Bash"` e `tool_input.command` (também `description`, `timeout`, `run_in_background`). O seletor `Bash` também pega comandos da ferramenta `Monitor` (só para recusar). A ferramenta `PowerShell` tem nome próprio e precisa entrar no seletor. [CC-hooks], [Ensaio] | **Sim.** `PreToolUse` com seletor `Bash` (cobre o shell e o `exec_command`); JSON na entrada padrão com `tool_name: "Bash"` e `tool_input.command`, mais `turn_id` e `model`. [CX-hooks]. Não ensaiado (ver "Ensaio"). | **Sim, por plugin.** `ctx.tool.hook("execute.before", fn)` recebe um objeto (não JSON pela entrada padrão) com `tool: "shell"`, `sessionID`, `agent`, `messageID`, `id` e `input.command`. Há também `ctx.shell.hook("create.before")`, que só altera comando, pasta, tempo e ambiente. [OC-server], [Ensaio] |
| **(b) Evento antes de editar arquivo e nomes das ferramentas** | **Sim.** `PreToolUse` com `tool_name` `Edit`, `Write` (`tool_input.file_path`, sempre absoluto) e `NotebookEdit` (`tool_input.notebook_path`). `MultiEdit` não existe na lista de ferramentas da 2.1.319; deixá-lo no seletor não faz mal. [CC-hooks], [CC-tools], [Ensaio] | **Sim.** `PreToolUse` com `tool_name: "apply_patch"`; o seletor aceita `apply_patch`, `Edit` ou `Write`. O caminho não vem num campo: está dentro do texto do patch em `tool_input.command`. [CX-hooks]. Não ensaiado. | **Sim, por plugin.** O mesmo `execute.before`; ferramentas `edit`, `write` e `patch` [OC-perm]. No ensaio, `write` trouxe `input.path` (não `filePath`) e `input.content`. [Ensaio] |
| **(c) Como recusar e como a mensagem chega ao modelo** | **Sim.** Sair com código 2 e o motivo na saída de erro; o modelo recebe `PreToolUse:Bash hook error: [<comando do gancho>]: <motivo>`. Alternativa: código 0 com `hookSpecificOutput.permissionDecision: "deny"` e `permissionDecisionReason`. [CC-hooks]; no ensaio o modelo citou o motivo literal. [Ensaio] | **Sim.** Código 2 com o motivo na saída de erro, ou `hookSpecificOutput.permissionDecision: "deny"` com `permissionDecisionReason`, ou o formato antigo `{"decision":"block","reason":...}`. `ask` não é suportado (o gancho é dado como falho e a ferramenta segue). [CX-hooks] | **Sim.** Lançar exceção no `execute.before`; a ferramenta não roda (`session.tool.failed` com `executed: false`) e o modelo recebe a mensagem da exceção. Documentado só no guia de migração [OC-migra]; confirmado no ensaio. Alternativa sem código: regra `{"action":"shell","resource":"git push *","effect":"deny"}` em `permissions` [OC-perm]. |
| **(d) Começo de sessão, continuação e injeção de contexto** | **Sim.** `SessionStart` com `source` = `startup`, `resume`, `clear`, `compact` ou `fork`. A saída padrão em texto (código 0) entra no contexto; ou `hookSpecificOutput.additionalContext`. [CC-hooks]; `startup`, `resume` e `compact` confirmados no ensaio. | **Sim.** `SessionStart` com `source` = `startup`, `resume`, `clear`, `compact` ou `fork`; texto na saída padrão ou `additionalContext` vira contexto de desenvolvedor. [CX-hooks] | **Parcial.** Não há evento de começo de sessão com origem. O contexto entra pelo gancho `ctx.session.hook("context")`, que roda antes de cada chamada ao modelo e pode editar `event.system`; a compactação tem gancho próprio (`compaction`) e a bifurcação também (`fork`). [OC-server] |
| **(e) Evento por interação e de fim de sessão** | **Sim.** `UserPromptSubmit` (campo `prompt`; código 2 rejeita o pedido), `Stop` (fim de cada resposta; `last_assistant_message`) e `SessionEnd` (`reason`: `clear`, `resume`, `logout`, `prompt_input_exit`, `other`; orçamento padrão de 1,5 s). [CC-hooks], [Ensaio] | **Sim.** `UserPromptSubmit`, `Stop` (exige JSON na saída padrão) e `SessionEnd` (`reason` sempre `other`; 1 s padrão, até 3 s). [CX-hooks] | **Parcial.** Por interação: gancho `ctx.session.hook("prompt")` (altera o pedido, não recusa) e os eventos `session.execution.started` / `session.execution.succeeded` em `ctx.event.subscribe()`. Fim de sessão: não há; o mais próximo é o evento `location.shutdown` ao encerrar o servidor. [OC-server], [Ensaio] |
| **(f) Id da sessão no gancho e nos comandos de shell** | **Sim.** Gancho: `session_id` no JSON. Ambiente do gancho e dos comandos da ferramenta Bash: `CLAUDE_CODE_SESSION_ID`, igual ao `session_id` (atualiza no `/clear`). `CLAUDE_ENV_FILE` (só no `SessionStart`, `Setup`, `CwdChanged`, `FileChanged`) permite exportar outras variáveis para os comandos. [CC-env], [CC-hooks], [Ensaio] | **Sim.** Gancho: `session_id` no JSON [CX-hooks]. Comandos de shell: `CODEX_THREAD_ID` e `CODEX_SESSION_ID`, iguais ao id da sessão. A documentação oficial não lista essas variáveis; vale o ensaio. [Ensaio] | **Sim.** Plugin: `sessionID` em todo evento. Comandos da ferramenta `shell`: `OPENCODE_SESSION_ID` (e `OPENCODE=1`); a variável não aparece no `env` que o gancho `shell.create.before` enxerga, é acrescentada depois. Não documentado; vale o ensaio. [Ensaio] |
| **(g) Informa o modelo** | **Parcial.** Só o `SessionStart` pode trazer `model`, e a documentação diz que pode faltar. No ensaio, faltou no `startup` e no `resume` em `-p` (mesmo com `--model`) e veio no `compact` (`"model": "claude-haiku-5-5"`). Não há variável de ambiente com o modelo. [CC-hooks], [Ensaio] | **Sim.** `model` é campo comum a todos os eventos. [CX-hooks] | **Sim.** `model: {providerID, id, variant}` nos ganchos `context`, `compaction`, `model.request` e afins; não vem no `execute.before`. [OC-server], [Ensaio] |
| **(h) Arquivo de ganchos do projeto** | **Sim.** `.claude/settings.json` (versionado) e `.claude/settings.local.json`, chave `hooks`. [CC-hooks] | **Sim.** `.codex/hooks.json` ou `[hooks]` em `.codex/config.toml`. Só carrega com a pasta `.codex/` do projeto confiável **e** cada gancho revisado e confiado (por hash) em `/hooks`. [CX-hooks] | **Sim.** Plugin em `.opencode/plugins/<nome>.js` (ou `.ts`, ou pasta), carregado sozinho; ou lista `plugins` em `opencode.json(c)` / `.opencode/opencode.jsonc`. [OC-plugins], [Ensaio] |
| **(i) Modo sem interface para ensaio** | **Sim.** `claude -p "<pedido>"`. Em `-p` a pasta é tratada como confiável e os ganchos do projeto rodam sem perguntar. [CC-hooks], [Ensaio] | **Sim.** `codex exec "<pedido>" < /dev/null` (sem o redirecionamento ele espera a entrada padrão). Os ganchos do projeto só rodam com confiança persistida ou com `--dangerously-bypass-hook-trust`. [CX-exec], [CX-hooks], [Ensaio] | **Sim.** `opencode run --standalone -m <provedor/modelo> "<pedido>" < /dev/null`; o plugin do projeto carrega sem perguntar. [OC-cli], [Ensaio] |

## Detalhes que decidem código

1. **Variável com o id da sessão no Claude Code.** É `CLAUDE_CODE_SESSION_ID`, presente no processo do gancho e nos comandos da ferramenta Bash, com o mesmo valor do `session_id` do JSON [CC-env]. No ensaio, o gancho e o `env` rodado pelo agente mostraram o mesmo id que o JSON.
2. **A variável vaza para agentes filhos.** O ambiente é herdado. Um Codex ou OpenCode aberto de dentro de uma sessão do Claude Code enxerga o `CLAUDE_CODE_SESSION_ID` do Claude, e um Claude Code aberto de dentro de outro também herda a variável até ela ser sobrescrita. Para descobrir a sessão a partir de um comando, consulte primeiro a variável do agente que roda o comando (`OPENCODE_SESSION_ID`, `CODEX_THREAD_ID`) e só depois `CLAUDE_CODE_SESSION_ID`. Melhor ainda: use a indicação explícita de agente (`OPENCODE=1`, `CODEX_CI`/`CODEX_THREAD_ID`, `CLAUDECODE=1`) mais recente.
3. **Ganchos em `claude -p`.** Rodam sem pedir confiança [CC-hooks, "Workspace trust"]. Também rodam os ganchos e plugins do usuário (`~/.claude/settings.json`). Para isolar o ensaio, use `--setting-sources project`. As permissões não interferem: o `PreToolUse` roda antes da checagem de permissão, e o código 2 recusa mesmo se a permissão permitiria.
4. **Formato da recusa.** O Claude Code prefixa a saída de erro (`PreToolUse:Bash hook error: [...]:`). Não conte com a mensagem chegando crua ao modelo; a primeira linha do motivo continua legível.

## Proteção de ramo no GitHub

- **Ramos protegidos** [GH-prot], [GH-api]: disponíveis em repositórios públicos com GitHub Free e GitHub Free para organizações, e em repositórios públicos e privados com GitHub Pro, GitHub Team, GitHub Enterprise Cloud e GitHub Enterprise Server. Repositório privado de conta Free não tem.
- **Chamada de API:** `PUT /repos/{owner}/{repo}/branches/{branch}/protection`, corpo com os quatro campos obrigatórios (podem ser `null`): `required_status_checks`, `enforce_admins`, `required_pull_request_reviews` e `restrictions`. Opcionais: `required_linear_history`, `allow_force_pushes`, `allow_deletions`, `required_conversation_resolution`. Pelo `gh`: `gh api -X PUT repos/exemplo/loja/branches/main/protection --input corpo.json`. Leitura: `GET` no mesmo caminho (404 quando não há proteção).
- **Restrição de quem pode enviar** (`restrictions`): só em repositório de organização (público em Free; todos em Team ou Enterprise Cloud) [GH-prot].
- **Conjuntos de regras** (alternativa): `POST /repos/{owner}/{repo}/rulesets`; regras efetivas de um ramo em `GET /repos/{owner}/{repo}/rules/branches/{branch}` [GH-rules].

## O que não fica coberto em cada agente

**Claude Code**
- A ferramenta `PowerShell` (Windows, e onde estiver ligada) executa comandos com outro nome; um seletor `Bash|Edit|Write|MultiEdit|NotebookEdit` não a pega.
- A ferramenta `Monitor` entra no seletor `Bash` só para recusa; `allow` e `updatedInput` não valem para ela.
- O `model` no `SessionStart` falta no começo normal em `-p` (ensaio) e após `/clear` (documentação).
- `SessionEnd` tem 1,5 s de orçamento padrão; trabalho pesado ali é cortado.
- Comando do usuário fora do agente (terminal comum) não passa por gancho nenhum, em nenhum dos três.

**Codex**
- Os ganchos do projeto não rodam até a pasta `.codex/` ser confiável e cada gancho ser revisado e confiado em `/hooks`; mudar o script do gancho exige nova revisão. Em `codex exec`, sem isso, eles são ignorados em silêncio (ensaio).
- O caminho do arquivo editado não vem num campo: é preciso ler o patch em `tool_input.command`.
- Ferramentas hospedadas (por exemplo `WebSearch`) não passam pelo `PreToolUse`; algumas ferramentas especializadas podem sair do caminho dos ganchos, e a documentação avisa que o gancho é "guarda útil, não fronteira completa".
- Ganchos de subagente usam o id da sessão-mãe; `SessionEnd` não roda para subagentes.
- `CODEX_THREAD_ID` e `CODEX_SESSION_ID` não estão na documentação oficial; podem mudar sem aviso.

**OpenCode**
- Não há gancho por comando externo: o harness precisa de um plugin em JavaScript/TypeScript que chame o `ah` (o plugin roda dentro do servidor do OpenCode).
- Não há evento de começo nem de fim de sessão com origem (novo, retomado, compactado). O contexto tem de entrar pelo gancho `context`, a cada chamada ao modelo.
- O gancho `prompt` só altera o pedido; não recusa.
- O bloqueio por exceção no `execute.before` só está documentado no guia de migração; o modelo novo não descreve a recusa. Uma questão aberta no repositório do OpenCode relata que o gancho não pega chamadas de subagentes (não conferido nesta versão).
- `OPENCODE_SESSION_ID` não está documentada.

## Ensaio

Repositórios descartáveis criados com `mktemp -d` (fora da pasta de projetos), com `git init`, um commit e sem remoto. Em cada um, um gancho grava o JSON recebido e o ambiente num arquivo e recusa qualquer comando com `git push`.

**Claude Code 2.1.319.** `.claude/settings.json` com `SessionStart`, `UserPromptSubmit`, `PreToolUse` (seletor `Bash|Edit|Write|MultiEdit|NotebookEdit`), `Stop` e `SessionEnd`, todos chamando `"$CLAUDE_PROJECT_DIR"/.claude/gancho.sh`. O gancho escreve um texto na saída padrão no `SessionStart` e sai com código 2 para `git push`.

```sh
claude -p "1) rode env | grep -i -E 'claude|session'  2) crie nota.txt com Write  3) rode git push origin main" \
  --setting-sources project --permission-mode acceptEdits --allowedTools "Bash(env:*)" --output-format json
claude -p "responda só: ok" --resume <id> --setting-sources project      # source: resume
claude -p "/compact" --resume <id> --setting-sources project             # source: compact, com model
claude -p "use Edit em nota.txt e NotebookEdit em nb.ipynb" --setting-sources project --permission-mode acceptEdits
```

Resultado: os cinco eventos dispararam; o `git push` não rodou, e o modelo respondeu com o motivo literal da recusa; o contexto do `SessionStart` chegou ao modelo. Os JSON colhidos, anonimizados, estão em `.superpowers/sdd/2026-11-12-nucleo-fatias-0-e-1/eventos-claude-code/`.

**Codex 0.166.0.** `.codex/hooks.json` com os mesmos eventos. `codex exec -s workspace-write "<pedido>" < /dev/null` rodou, mas os ganchos do projeto não dispararam: a pasta não é confiável e os ganchos não foram confiados. A confiança não pode ser dada por `-c projects."<pasta>".trust_level=...` (a opção é ignorada na linha de comando), e ganchos passados por `-c hooks...` também ficaram de fora. A opção `--dangerously-bypass-hook-trust` não foi usada nesta sondagem. Do ensaio só valem o modo sem interface e as variáveis de ambiente do shell (`CODEX_THREAD_ID`, `CODEX_SESSION_ID`); o resto da coluna vem da documentação.

**OpenCode 2.2.2.** Plugin em `.opencode/plugins/sonda.js` (objeto `{id, setup(ctx)}` exportado por padrão, sem dependências) com `ctx.tool.hook("execute.before")`, `ctx.shell.hook("create.before")`, `ctx.session.hook("prompt")`, `ctx.session.hook("context")` e `ctx.event.subscribe()`.

```sh
opencode run --standalone -m opencode/big-pickle "1) rode env | grep ...  2) crie nota.txt  3) rode git push origin main" < /dev/null
```

Resultado: o plugin carregou sem pedir confiança; a exceção bloqueou o `git push` e o modelo citou a mensagem; `write` e `shell` passaram pelo `execute.before`.
