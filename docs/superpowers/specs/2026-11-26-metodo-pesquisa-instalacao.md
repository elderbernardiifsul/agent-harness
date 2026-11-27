# Instalação, fixação de versão e verificação de Superpowers e mattpocock/skills em Claude Code, Codex e OpenCode

Pesquisa feita só com leitura, em 2026-11-26. Todas as fontes foram acessadas nessa data.

Convenção usada no texto:
- **[doc]**: está escrito na documentação oficial da coleção ou do agente.
- **[código]**: lido no código-fonte público do agente. Não aparece na documentação.
- **[obs]**: observado em arquivo local (`~/.claude/plugins/`) ou na API do GitHub (tags, conteúdo de repositório).
- **[inferência]**: conclusão minha a partir das peças acima. Nenhuma fonte diz isso explicitamente.

## Versões de referência [obs]

| Coleção | Última tag | SHA da tag | Instalado aqui |
|---|---|---|---|
| obra/superpowers | `v7.0.2` (2026-11-03) | `22f0b463e7a5e579904dd6211a520321035526f7` | 7.0.2, `gitCommitSha` 22f0b46… (igual à tag) |
| mattpocock/skills | `v1.3.2` (2026-10-29) | `d1478fcb140db0b93c0c8df17bcfd311844749d0` | 1.3.1, `gitCommitSha` 49dd158… (**não** é o SHA da tag v1.3.1, que é `24fe0ef…`) |

O `claude-plugins-official` local, atualizado em 2026-11-27T01:38Z, ainda fixa `mattpocock-skills` em `sha: 49dd158…`, cujo `plugin.json` diz 1.3.1. O marketplace oficial está atrasado em relação ao upstream, que já está em 1.3.2. [obs]

Correção à observação local: o README do mattpocock/skills **não** manda usar `npx skills` para o Codex. O Codex tem rota própria por marketplace: `codex plugin marketplace add mattpocock/skills` e depois `codex plugin add mattpocock-skills@mattpocock`. O `npx skills` fica para "any other agent", OpenCode incluído. O resto da observação está correto: "Pick one per agent, because installing both gives you every skill twice" e "A plugin updates itself". [doc]

## Tabela-resumo

| Coleção × agente | Comando documentado pela coleção | Tipo e escopo | Dá para fixar? | Atualiza sozinho? | Onde o `doctor` lê a versão |
|---|---|---|---|---|---|
| **Superpowers × Claude Code** | `/plugin install superpowers@claude-plugins-official` (forma de shell: `claude plugin install superpowers@claude-plugins-official`). Alternativa: `/plugin marketplace add obra/superpowers-marketplace` e depois `/plugin install superpowers@superpowers-marketplace` | Plugin de marketplace. Escopo `user` por padrão; `--scope project` ou `--scope local`. Arquivos em `~/.claude/plugins/cache/claude-plugins-official/superpowers/7.0.2/` | **Não pelo marketplace oficial**: o usuário não pode fixar SHA num marketplace de nome reservado [doc]. Caminho fixável [inferência]: `claude plugin marketplace add obra/superpowers#v7.0.2` e depois `claude plugin install superpowers@superpowers-dev` | Sim. O auto-update vem ligado por padrão no `claude-plugins-official` [doc]. Em marketplaces de terceiros vem desligado [doc] | `~/.claude/plugins/installed_plugins.json`, campo `plugins["superpowers@<mkt>"][].version` [doc]; `gitCommitSha` [obs]; `claude plugin list --json` [doc] |
| **Superpowers × Codex** | Dentro do Codex CLI: `/plugins`, buscar `superpowers`, depois "Install Plugin". Usa o marketplace oficial `openai/plugins` | Plugin. Cache em `~/.codex/plugins/cache/$MARKETPLACE/$PLUGIN/$VERSION/` [doc]; o marketplace se chama `openai-curated` [obs]. Escopo de usuário [inferência] | **Não pela rota oficial**: o `openai-curated` traz uma cópia própria da **6.3.0** [obs]. Caminho fixável [inferência]: `codex plugin marketplace add obra/superpowers --ref v7.0.2` e depois `codex plugin add superpowers@superpowers-dev` | Página de docs não documenta. O código atualiza os marketplaces Git configurados na inicialização [código]. O Superpowers diz "often automatic" [doc] | Segmento de versão do caminho de cache [doc]; `codex plugin list --json` traz `version` [código]; `config.toml` `[marketplaces.<nome>]` tem `ref` e `last_revision` [código: schema] |
| **Superpowers × OpenCode** | Pedir ao OpenCode: "Fetch and follow instructions from …/.opencode/INSTALL.md". Na prática, em `opencode.json`: V1 `"plugin": ["superpowers@git+https://github.com/obra/superpowers.git"]`; V2 (≥ 2.0.4) `"plugins": [...]` | Plugin npm/git instalado pelo gerenciador do OpenCode (Bun). O escopo é o do arquivo de config: global `~/.config/opencode/opencode.json` ou do projeto, `opencode.json` / `.opencode/opencode.json` [doc] | **Sim**: `…superpowers.git#v7.0.2` [doc Superpowers]. O OpenCode V2 garante fixação para "exact versions and commit hashes"; tag não é citada [doc]. Commit é a escolha mais segura [inferência] | V2: segue o que a spec mandar seguir (branch, range, `@latest`), checando na inicialização e a cada 24 h [doc]. O Superpowers avisa que o cache ou lockfile pode prender a versão [doc] | A spec em `opencode.json` [doc]. O cache de npm do V1 fica em `~/.cache/opencode/node_modules/` [doc V1]. Não documentado onde fica o pacote vindo de git, nem em que arquivo o OpenCode registra a versão |
| **mattpocock × Claude Code** | `claude plugin install mattpocock-skills@claude-plugins-official` ("Updates itself by default") | Plugin. Escopo `user` por padrão. Arquivos em `~/.claude/plugins/cache/claude-plugins-official/mattpocock-skills/1.3.1/` [obs] | **Não pelo oficial** (mesmo motivo do Superpowers). O oficial está hoje na 1.3.1, com o upstream na 1.3.2 [obs]. Caminho fixável [inferência]: `claude plugin marketplace add mattpocock/skills#v1.3.2` e depois `claude plugin install mattpocock-skills@mattpocock` | Sim, pelo oficial [doc] | Igual ao Superpowers: `installed_plugins.json` → `version` |
| **mattpocock × Codex** | `codex plugin marketplace add mattpocock/skills` e depois `codex plugin add mattpocock-skills@mattpocock` ("Updates itself at startup") | Plugin. O Codex lê `.claude-plugin/marketplace.json` como formato compatível [doc]. Cache em `~/.codex/plugins/cache/mattpocock/mattpocock-skills/<versão>/` [inferência a partir do padrão documentado] | **Sim**: `--ref v1.3.2` em `marketplace add` [doc Codex]. A coleção não documenta isso | A coleção diz "at startup" [doc]. O código confirma a atualização na inicialização [código]. Com `--ref` numa tag, a atualização tende a não mudar nada [inferência] | O mesmo que Superpowers × Codex |
| **mattpocock × OpenCode** | `npx skills@latest add mattpocock/skills -a opencode` (incluir `setup-matt-pocock-skills`). Atualizar: `npx skills@latest update` | **Cópia ou symlink de arquivos.** Projeto (padrão): `.agents/skills/` [doc skills CLI]. Global (`-g`): `~/.config/opencode/skills/` [doc skills CLI] | **Sim**: `npx skills add owner/repo@v1.2.3` é a forma documentada pelo CLI [doc]. Também é preciso fixar o próprio CLI, porque `npx skills@latest` muda de versão [inferência]. A coleção não documenta pin | Não. A atualização é manual [doc] | `skills-lock.json` na raiz do projeto: `source`, `ref`, `commit`, `computedHash` [doc + código]. Não há campo de versão semântica da coleção. Global: `~/.agents/.skill-lock.json` ou `$XDG_STATE_HOME/skills/.skill-lock.json` [código]. `npx skills check` sai com código 1 se houver divergência [doc] |

### Onde cada agente procura skills e instruções (itens 5 e 6)

| Agente | Skills no projeto | Skills do usuário | Lê pastas de outros agentes? | AGENTS.md / CLAUDE.md |
|---|---|---|---|---|
| Claude Code | `.claude/skills/`, do diretório de partida até a raiz do repo; subpastas carregadas sob demanda | `~/.claude/skills/` | Não documenta `.agents/skills` | Lê `AGENTS.md` **só se não houver** `CLAUDE.md`, `.claude/CLAUDE.md` ou `CLAUDE.local.md` no diretório atual ou acima (≥ v2.1.277). Ler os dois exige configuração **de usuário** |
| Codex | `.agents/skills/`, de cada diretório desde o cwd até a raiz do repo | `$HOME/.agents/skills`; admin em `/etc/codex/skills` | Não documenta `.claude/skills` | `AGENTS.override.md` ou `AGENTS.md`, global em `~/.codex` e da raiz do projeto até o cwd, um arquivo por diretório, limite de 32 KiB. `CLAUDE.md` **não** é lido por padrão |
| OpenCode | `.opencode/skills/`, mais `.claude/skills/` e `.agents/skills/` (sobe até a raiz) | `~/.config/opencode/skills/`, mais `~/.claude/skills/` e `~/.agents/skills/` | **Sim**: lê as pastas do Claude e de `.agents` | `AGENTS.md` por diretório, com `CLAUDE.md` como fallback no mesmo diretório. Global em `~/.config/opencode/AGENTS.md`, com fallback `~/.claude/CLAUDE.md`. Os arquivos são concatenados |

---

## 1. Superpowers (obra/superpowers)

### 1.1 Claude Code

1. **Comando [doc]**. Pelo marketplace oficial, dentro da sessão: `/plugin install superpowers@claude-plugins-official`. A forma de shell, documentada pelo Claude Code, é `claude plugin install superpowers@claude-plugins-official`. A alternativa é o marketplace do autor: `/plugin marketplace add obra/superpowers-marketplace` e depois `/plugin install superpowers@superpowers-marketplace`.
2. **Tipo e escopo [doc Claude Code]**. É plugin de marketplace. O `claude plugin install` instala em escopo `user` por padrão. `--scope project` grava `enabledPlugins` em `.claude/settings.json`, mas não baixa nada para os colaboradores: cada um roda `claude plugin install <nome>@<mkt> --scope project` uma vez por clone. `--scope local` grava em `.claude/settings.local.json`. Os arquivos ficam em `~/.claude/plugins/cache/<marketplace>/<plugin>/<versão>/`.
3. **Fixação**:
   - Marketplace oficial [doc Claude Code]: o `ref` de um marketplace aceita SHA (≥ v2.1.324), mas "is refused for a marketplace with a reserved name, such as `claude-plugins-official`". A versão é a que a Anthropic fixa no catálogo, hoje `sha: 22f0b46…`, que corresponde a v7.0.2 [obs]. O que o usuário controla é desligar o auto-update: pela aba Marketplaces do `/plugin`, por `autoUpdate` em `extraKnownMarketplaces` ou por `DISABLE_AUTOUPDATER=1` / `DISABLE_UPDATES=1`, que desligam a passada inteira [doc].
   - `superpowers-marketplace` [obs]: a entrada `superpowers` tem `source: url` sem `ref` nem `sha` e `version: 7.0.2`. Fixar o marketplace num ref não fixa o plugin: "A plugin entry with its own remote source can still update" [doc Claude Code].
   - Caminho fixável [inferência]: o próprio repositório tem `.claude-plugin/marketplace.json`, de nome `superpowers-dev`, com `source: "./"` [obs]. O Claude Code documenta `owner/repo#ref` para fixar um marketplace num branch ou tag [doc]. Para plugin de caminho relativo, a versão vem do `version` do `plugin.json` [doc]. Então `claude plugin marketplace add obra/superpowers#v7.0.2` seguido de `claude plugin install superpowers@superpowers-dev` deveria fixar a 7.0.2. Nem o README do Superpowers nem o do Claude Code descrevem essa combinação; não testei.
   - Auto-update [doc Claude Code]: vem ligado por padrão no `claude-plugins-official` e desligado nos demais marketplaces. Roda depois da primeira mensagem, com atraso aleatório de até 10 minutos.
4. **Registro em disco [doc Claude Code]**. `~/.claude/plugins/installed_plugins.json` "records each install with its `scope`, `installPath`, and `version`". Aqui [obs]: `plugins["superpowers@claude-plugins-official"][0].version = "7.0.2"` e `gitCommitSha = "22f0b46…"`. O campo `gitCommitSha` não aparece na documentação. `~/.claude/plugins/known_marketplaces.json` guarda `source`, `installLocation`, `lastUpdated` e `autoUpdate`. Também servem `claude plugin list --json` e o campo `version` de `<installPath>/.claude-plugin/plugin.json`.

### 1.2 Codex

1. **Comando [doc Superpowers]**. No Codex CLI: `/plugins`, buscar `superpowers`, depois "Install Plugin". No Codex App: Plugins, seção Coding, botão `+`. A fonte é o "official Codex plugin marketplace" (github.com/openai/plugins).
2. **Tipo e escopo**. É plugin. Cache em `~/.codex/plugins/cache/$MARKETPLACE_NAME/$PLUGIN_NAME/$VERSION/` [doc Codex]. O marketplace de `openai/plugins` se chama `openai-curated` e a entrada `superpowers` é `source: local, path: ./plugins/superpowers`, ou seja, uma cópia guardada dentro do repositório da OpenAI [obs]. Não achei documentação de escopo de projeto para plugins de marketplace remoto. Para marketplaces de repositório, o Codex documenta `$REPO_ROOT/.agents/plugins/marketplace.json` e a ativação por `.codex/config.toml` do projeto, só em projetos confiáveis [doc Codex].
3. **Fixação**:
   - Rota oficial: **não dá para fixar**, e ela está defasada. `openai/plugins/plugins/superpowers/.codex-plugin/plugin.json` diz `"version": "6.3.0"`, com último commit em 2026-08-26, enquanto o upstream está na 7.0.2 [obs].
   - Caminho fixável [inferência]: o repositório traz `.agents/plugins/marketplace.json`, de nome `superpowers-dev`, com `source: url "./"` [obs]. As notas da v6.1.0 dizem: "A repo-local Codex marketplace manifest now points at the same repository root, so the plugin is installable from Codex" [doc Superpowers RELEASE-NOTES]. O Codex documenta `codex plugin marketplace add owner/repo --ref <ref>` [doc Codex]. Então: `codex plugin marketplace add obra/superpowers --ref v7.0.2` seguido de `codex plugin add superpowers@superpowers-dev`. O README não traz esse comando.
   - Auto-update: a página de plugins do Codex não documenta agenda de atualização. No código, `maybe_start_plugin_startup_tasks_for_config` dispara `upgrade_configured_marketplaces_…` na inicialização [código: `codex-rs/core-plugins/src/manager.rs`]. O schema de config tem `auto_update` (padrão `false`), descrito como "Check for updates to installed Git plugins from this marketplace when plugins are listed" [código: `config.schema.json`]. A relação entre os dois mecanismos não está documentada.
4. **Registro em disco**. O segmento `$VERSION` do caminho de cache [doc]. `codex plugin list --json` mostra colunas `STATUS` e `VERSION` [código: `plugin_cmd.rs`]. Em `~/.codex/config.toml`, `[marketplaces.<nome>]` tem `source_type`, `source`, `ref`, `last_updated` e `last_revision` ("Git revision Codex last successfully activated") [código: schema]. `[plugins."<plugin>@<mkt>"] enabled = true` registra só se o plugin está ativo [doc]. Dentro do cache, o `version` de `.codex-plugin/plugin.json`. A documentação recomenda não editar `config.toml` à mão: "Use `codex plugin marketplace add` … instead of editing `config.toml` by hand" [doc].

### 1.3 OpenCode

1. **Comando [doc Superpowers]**. A orientação é dizer ao OpenCode: `Fetch and follow instructions from https://raw.githubusercontent.com/obra/superpowers/refs/heads/main/.opencode/INSTALL.md`. O INSTALL.md manda editar `opencode.json`:
   - V1: `{"plugin": ["superpowers@git+https://github.com/obra/superpowers.git"]}`
   - V2 (≥ 2.0.4): `{"plugins": ["superpowers@git+https://github.com/obra/superpowers.git"]}`
   - Hoje convivem duas linhas do OpenCode: v1.19.6 e v2.4.2 [obs: releases anomalyco/opencode]. `opencode.ai/docs/` documenta a V2 e `opencode.ai/v1/docs/` documenta a V1 [obs].
2. **Tipo e escopo**. É plugin, e o plugin registra o diretório de skills. V1 faz isso via `config.skills.paths`; V2 via `ctx.skill.transform()` [doc Superpowers]. O escopo é o do arquivo de configuração: global `~/.config/opencode/opencode.json(c)` ou do projeto, `opencode.json(c)` / `.opencode/opencode.json(c)`; o config de sistema em `/etc/opencode` tem precedência sobre todos [doc OpenCode config]. Arquivos: os docs V1 dizem "Packages and their dependencies are cached in `~/.cache/opencode/node_modules/`" para plugins npm [doc V1]. Os docs V2 não dizem onde guardam pacotes. Não documentado para spec git.
3. **Fixação [doc Superpowers]**: "To pin a specific version, add a tag or commit to the spec": `superpowers@git+https://github.com/obra/superpowers.git#v7.0.2`. Na V2, só funciona a partir da `v6.4.1`. O OpenCode V2 diz "Exact versions and commit hashes are pinned"; os pacotes atualizam "only when the spec names what to follow, such as `name@latest`, a semver range, or a Git branch", com checagem "on startup and every 24 hours" [doc OpenCode V2 plugins]. Tag git não é citada explicitamente. Fixar pelo SHA `22f0b46…` é o mais seguro [inferência]. O Superpowers também avisa: "Some OpenCode and Bun versions pin that resolved git dependency in a lockfile or cache, so a restart may not pick up the newest Superpowers commit" [doc]. Sem `#ref`, o comportamento é incerto.
4. **Registro em disco**: não documentado. O `doctor` pode conferir a spec declarada em `opencode.json`, que é a fonte de verdade documentada. Para conferir a versão efetivamente carregada, uma possibilidade é o `version` do `package.json` (7.0.2) no pacote em cache [inferência]. O caminho desse cache só está documentado para npm na V1. Para diagnóstico: `opencode run --print-logs` na V1, `--standalone` ou `opencode api get /api/plugin` na V2 [doc Superpowers].

## 2. Skills do Matt Pocock (mattpocock/skills)

### 2.1 Claude Code

1. **Comando [doc README]**: `claude plugin install mattpocock-skills@claude-plugins-official`, com a nota "Updates itself by default". Depois, rodar `/setup-matt-pocock-skills` uma vez por repositório.
2. **Tipo e escopo**: o mesmo do Superpowers. É plugin, escopo `user` por padrão, cache em `~/.claude/plugins/cache/claude-plugins-official/mattpocock-skills/1.3.1/` [obs].
3. **Fixação**: no oficial, não dá (nome reservado). O catálogo oficial fixa `sha: 49dd158…`, versão 1.3.1, enquanto a tag v1.3.2 já existe [obs]. O arquivo `.agents/install-block.md` da coleção diz que as rotas não oficiais "reinstall only when the `version` in `plugin.json` changes" [doc interno do repo]. Caminho fixável [inferência]: o repositório tem `.claude-plugin/marketplace.json`, de nome `mattpocock`, com `source: "./"` [obs]. Então `claude plugin marketplace add mattpocock/skills#v1.3.2` seguido de `claude plugin install mattpocock-skills@mattpocock`. Há indício local de que esse marketplace já foi usado aqui: `~/.claude/plugins/cache/mattpocock/mattpocock-skills/1.2.3/` está marcado `.orphaned_at` [obs]. O README não documenta essa rota para o Claude Code.
4. **Registro em disco**: `installed_plugins.json`, chave `mattpocock-skills@claude-plugins-official`, campo `version = "1.3.1"` [obs]. A versão também está em `<installPath>/.claude-plugin/plugin.json` e `package.json`, que o script `sync-plugin-version.mjs` mantém iguais [obs].

### 2.2 Codex

1. **Comando [doc README]**: `codex plugin marketplace add mattpocock/skills` e depois `codex plugin add mattpocock-skills@mattpocock`, com a nota "Updates itself at startup".
2. **Tipo e escopo**. É plugin. O Codex aceita "a legacy-compatible marketplace at `$REPO_ROOT/.claude-plugin/marketplace.json`" e "Claude-compatible manifests" [doc Codex]. O repositório não tem `.codex-plugin/`; o Codex usa o `.claude-plugin/plugin.json` [obs + inferência]. Cache em `~/.codex/plugins/cache/mattpocock/mattpocock-skills/<versão>/` [inferência a partir do padrão documentado]. Escopo de usuário: o `marketplace add` grava no `config.toml` do usuário [código: `record_user_marketplace`].
3. **Fixação [doc Codex]**: "Use `--ref` to pin a Git ref", ou seja, `codex plugin marketplace add mattpocock/skills --ref v1.3.2`. O código também aceita `owner/repo@ref` [código: help do argumento `SOURCE`]. A coleção não documenta pin. Auto-update: "Updates itself at startup" [doc README]. A fonte citada no `install-block.md` é `core-plugins/src/manager.rs`, e o código confirma a atualização dos marketplaces na inicialização [código]. A documentação não diz se `upgrade` respeita o `--ref`; o schema registra `ref` no `config.toml` [código].
4. **Registro em disco**: o mesmo do Superpowers × Codex: segmento de versão no cache, `codex plugin list --json`, `[marketplaces.mattpocock].ref` e `last_revision`.

### 2.3 OpenCode

1. **Comando [doc README]**: `npx skills@latest add mattpocock/skills -a <agent>  # cursor, opencode, devin, windsurf, amp, pi; omit -a to choose`. Para OpenCode, `-a opencode`. "When the installer asks which skills to take, include `setup-matt-pocock-skills`. To update, run `npx skills@latest update`, and re-run `add` to pick up new skills."
2. **Tipo e escopo [doc skills CLI, vercel-labs/skills v1.9.0]**. É cópia de arquivos, não plugin. Por padrão há uma cópia canônica em `.agents/skills/<nome>` e symlinks para os diretórios de cada agente; `--copy` faz cópias independentes. O escopo padrão é o projeto; `-g` instala no diretório do usuário. Para `opencode`, o caminho de projeto é `.agents/skills/` e o global é `~/.config/opencode/skills/` [doc `docs/agents.md`].
3. **Fixação [doc skills CLI]**: "Pin a release tag or full commit. Skill names still use the same @ form", com o exemplo `npx skills add owner/repo@v1.2.3 --skill my-skill`. Para esta coleção: `npx skills add mattpocock/skills@v1.3.2 -a opencode`. A coleção não documenta isso. No `skills-lock.json`, `skills experimental_install` (restore) "fetches that commit, not the latest commit on `ref`". Já `skills update` "moves `commit` forward". A documentação não diz se `update` respeita um `ref` de tag [doc]. Atualização manual [doc README]. O próprio CLI vem como `npx skills@latest`, que flutua; o harness deve fixar a versão do CLI (hoje v1.9.0) [inferência].
4. **Registro em disco**: `skills-lock.json` na raiz do projeto, versão 2 do formato, feito para ser versionado. Cada entrada tem `source`, `sourceType`, `ref`, `commit`, `skillPath` e `computedHash` (SHA-256 dos arquivos em `.agents/skills/<nome>`) [doc README do CLI + código `src/local-lock.ts`]. **Não há campo com a versão semântica da coleção**: o campo `version` vale só para fontes `node_modules`. O lock global fica em `$XDG_STATE_HOME/skills/.skill-lock.json` ou `~/.agents/.skill-lock.json` [código `src/skill-lock.ts`]. Verificação pronta: `npx skills check` "exits with code 1 when any skill has an update or local changes"; `npx skills ls` marca `modified`, `untracked` e `Missing` [doc].

## 3. Os agentes

### 3.1 Claude Code (code.claude.com/docs)

**Skills [doc `/docs/en/skills`]**:
- Pessoal: `~/.claude/skills/<nome>/SKILL.md`.
- Projeto: `.claude/skills/<nome>/SKILL.md`, carregadas "in the directory where you start it and in every parent directory up to the repository root".
- Aninhadas: `<subdir>/.claude/skills/` só carregam quando o Claude lê ou edita um arquivo daquela subpasta.
- `--add-dir`: carrega o `.claude/skills/` do diretório adicionado.
- Plugin: `<plugin>/skills/<nome>/SKILL.md`, invocado como `/plugin:skill`.
- Enterprise, via managed settings.
- Conflito de nomes: enterprise vence pessoal, e pessoal vence projeto.
- A página **não menciona** `.agents/skills` nem pastas de outros agentes. Diz apenas que segue o padrão Agent Skills (agentskills.io). Sobre outros agentes, o que está documentado é o `/import`, que faz uma cópia única de instruções, MCP, comandos, subagentes e skills de outro agente.

**AGENTS.md / CLAUDE.md [doc `/docs/en/memory`]**:
- Ordem de carga: managed (`/etc/claude-code/CLAUDE.md`), usuário (`~/.claude/CLAUDE.md`), projeto (`./CLAUDE.md` ou `./.claude/CLAUDE.md`), local (`./CLAUDE.local.md`). Os arquivos da raiz do sistema até o cwd são concatenados, e o mais próximo do cwd é lido por último.
- `AGENTS.md` (≥ v2.1.277): no modo padrão `claude-md-or-agents-md`, o Claude Code lê `AGENTS.md` **apenas** quando não há `CLAUDE.md`, `.claude/CLAUDE.md` ou `CLAUDE.local.md` no diretório atual ou acima. `~/.claude/CLAUDE.md`, o CLAUDE.md managed e `.claude/rules/` não contam para essa regra.
- O modo `claude-md-and-agents-md` lê os dois. Ele se configura por `pluginConfigs["cc-plugin-agents-md@builtin"].options.instructionFiles`, que o Claude Code lê de `~/.claude/settings.json`, `--settings` ou managed settings, "and ignores it in project and local settings files".
- Saída documentada para compartilhar um só arquivo: um `CLAUDE.md` contendo `@AGENTS.md`, ou o symlink `ln -s AGENTS.md CLAUDE.md`. Para Windows a documentação recomenda o import.

### 3.2 Codex (learn.chatgpt.com, para onde developers.openai.com/codex redireciona com 308)

**Skills [doc `learn.chatgpt.com/docs/build-skills`]**:
- Repo: "Codex scans `.agents/skills` in every directory from your current working directory" até a raiz do repositório.
- Usuário: `$HOME/.agents/skills`.
- Admin: `/etc/codex/skills`.
- System: embutidas no Codex (`skill-creator`, `skill-installer`).
- A página não menciona `.claude/skills` nem `~/.codex/skills`. Não documentado.
- Duplicatas: "If two skills share the same `name`, Codex doesn't merge them; both can appear in skill selectors."
- Atualização: "Codex detects skill changes automatically."

**AGENTS.md [doc `learn.chatgpt.com/docs/agent-configuration/agents-md`]**:
- Global (diretório do Codex, `~/.codex`): `AGENTS.override.md` se existir, senão `AGENTS.md`; usa só o primeiro arquivo não vazio.
- Projeto: "Starting at the project root (typically the Git root), Codex walks down to your current working directory", com no máximo um arquivo por diretório.
- Os arquivos são concatenados. Os mais próximos do cwd "override earlier guidance because they appear later".
- Limite `project_doc_max_bytes`, padrão 32 KiB.
- `CLAUDE.md` **não** é lido por padrão; só se for listado em `project_doc_fallback_filenames`.

**Plugins [doc `developers.openai.com/plugins/build/plugins`]**:
- Marketplaces: `$REPO_ROOT/.agents/plugins/marketplace.json`, `$REPO_ROOT/.claude-plugin/marketplace.json` (compatível) e `~/.agents/plugins/marketplace.json`.
- Comandos: `codex plugin marketplace add|list|upgrade|remove` e `--ref`.
- Cache em `~/.codex/plugins/cache/...`.
- `codex plugin add` e `codex plugin list` estão no help do CLI [código]. A página não os mostra.

### 3.3 OpenCode (opencode.ai/docs = V2; opencode.ai/v1/docs = V1)

**Skills**:
- V2 [doc `/docs/skills/`]: global `~/.config/opencode/skills`; compatibilidade global `~/.claude/skills` e `~/.agents/skills`; projeto `.opencode/skills`; compatibilidade de projeto `.claude/skills` e `.agents/skills`. A busca vai do diretório atual até a raiz do projeto.
- Precedência V2, de menor para maior: built-in, `.claude/skills`, `.agents/skills`, global `~/.config/opencode/skills`, projeto `.opencode/skills`, entradas `skills` do config. "the source registered later supplies the skill".
- V1 [doc `/v1/docs/skills/`]: as mesmas seis pastas. A V1 "walks up … until it reaches the git worktree" e diz só que os nomes devem ser únicos.
- `OPENCODE_DISABLE_CLAUDE_CODE=1` "also skip[s] `.claude` skills" [doc `/docs/rules/`].
- Sobre precedência, o Superpowers relata algo diferente na V1 1.18.31: as skills do plugin vencem as pessoais e as de projeto de mesmo nome [doc Superpowers].

**AGENTS.md / CLAUDE.md [doc `/docs/rules/` e `/v1/docs/rules/`]**:
- "In any directory without an `AGENTS.md`, OpenCode reads `CLAUDE.md` instead."
- Global: `~/.config/opencode/AGENTS.md`, com fallback `~/.claude/CLAUDE.md`.
- Os arquivos são combinados ("does not resolve conflicts"), do cwd em direção ao home. Fora do home, a busca para na raiz do projeto.
- `instructions` no config carrega depois dos `AGENTS.md`.
- `OPENCODE_DISABLE_CLAUDE_CODE_PROMPT=1` ignora todos os `CLAUDE.md`.

## 4. Descobertas que mais afetam o desenho do harness

1. **No Claude Code, o marketplace oficial não pode ser fixado pelo usuário.** SHA em marketplace de nome reservado é recusado, e o auto-update vem ligado por padrão. A versão é a que a Anthropic fixa no catálogo, e hoje ela está atrasada no mattpocock (1.3.1 contra 1.3.2 no upstream). Para ter pin real, o caminho [inferência, a testar] é registrar o próprio repositório da coleção como marketplace com `#<tag>` (`obra/superpowers#v7.0.2` como `superpowers-dev`; `mattpocock/skills#v1.3.2` como `mattpocock`). Esses marketplaces de terceiros têm auto-update desligado por padrão. Em `--scope project`, cada aluno ainda precisa rodar `claude plugin install … --scope project` em cada clone.
2. **No Codex, a rota oficial do Superpowers entrega uma cópia própria 6.3.0, sem possibilidade de fixar.** Para ter a 7.0.2 fixada, é preciso usar o marketplace do próprio repositório (`codex plugin marketplace add obra/superpowers --ref v7.0.2`, plugin `superpowers@superpowers-dev`). Nem o README nem os docs do Codex documentam essa combinação. Para o mattpocock, `--ref` resolve, e está documentado pelo Codex.
3. **As pastas de skills se cruzam.** O OpenCode lê `.claude/skills`, `.agents/skills`, `~/.claude/skills` e `~/.agents/skills`. O Codex lê `.agents/skills` e `~/.agents/skills`. O Claude Code não documenta ler `.agents`. Consequências:
   - Uma instalação do mattpocock por `npx skills` (que grava em `.agents/skills`) junto com o plugin do Codex duplica as skills no Codex, que lista as duas cópias.
   - Uma instalação por cópia para o Claude em `.claude/skills` também aparece no OpenCode.
   - Os plugins do Claude Code ficam em `~/.claude/plugins/cache/` e não entram nessa colisão.
   - O `doctor` deve detectar duplicatas por nome entre essas pastas, além de conferir versão.
4. **Cada rota guarda a versão num lugar diferente, e há rotas sem versão legível.**
   - Claude Code: `installed_plugins.json` → `version`, documentado.
   - Codex: segmento de versão no cache e `config.toml` `[marketplaces.*].ref` / `last_revision`, que está no schema mas não na página de docs.
   - OpenCode com plugin git: só a spec em `opencode.json`; o cache de git não está documentado.
   - `npx skills`: `skills-lock.json` → `commit` e `computedHash`, sem semver.
   - Por isso o `doctor` precisa de uma tabela tag → SHA (v7.0.2 = `22f0b46…`, v1.3.2 = `d1478fc…`) e deve comparar commits, não só strings de versão. Além disso, `npx skills@latest` faz a própria ferramenta de instalação flutuar.
5. **Instruções: o Claude Code ignora `AGENTS.md` quando existe qualquer `CLAUDE.md`.** O modo que lê os dois só vale em configuração de usuário ou managed, e é ignorado em settings de projeto. O Codex não lê `CLAUDE.md` por padrão. O OpenCode prefere `AGENTS.md` e cai em `CLAUDE.md`. Para um repositório de aluno, o desenho documentado que funciona nos três é: `AGENTS.md` como fonte única, mais um `CLAUDE.md` contendo `@AGENTS.md`. Esse `CLAUDE.md` não deve ter conteúdo próprio, porque o OpenCode leria só o `AGENTS.md` do mesmo diretório.

## Fontes (todas acessadas em 2026-11-26)

Coleções:
- Superpowers, README e repositório: https://github.com/obra/superpowers (cópia local cruzada: `~/.claude/plugins/cache/claude-plugins-official/superpowers/7.0.2/README.md`)
- Superpowers, instalação no OpenCode: https://raw.githubusercontent.com/obra/superpowers/refs/heads/main/.opencode/INSTALL.md e https://github.com/obra/superpowers/blob/main/docs/README.opencode.md (cópias locais idênticas na 7.0.2)
- Superpowers, notas de versão (Codex, v6.1.0): `RELEASE-NOTES.md` no repositório e na cópia local 7.0.2
- Superpowers, manifests: https://github.com/obra/superpowers/blob/main/.claude-plugin/marketplace.json e https://github.com/obra/superpowers/blob/main/.agents/plugins/marketplace.json
- superpowers-marketplace: https://github.com/obra/superpowers-marketplace/blob/main/.claude-plugin/marketplace.json
- Tags: https://api.github.com/repos/obra/superpowers/tags e https://api.github.com/repos/mattpocock/skills/tags
- mattpocock/skills, README: https://github.com/mattpocock/skills (cópia local 1.3.1 cruzada) e `.agents/install-block.md` na cópia local
- Marketplace oficial da OpenAI: https://github.com/openai/plugins (`.agents/plugins/marketplace.json`, `plugins/superpowers/.codex-plugin/plugin.json`)
- skills CLI (skills.sh): https://github.com/vercel-labs/skills (README, `docs/agents.md`, `docs/commands.md`, `src/local-lock.ts`, `src/skill-lock.ts`), release v1.9.0

Claude Code:
- Skills: https://code.claude.com/docs/en/skills
- Memória, CLAUDE.md e AGENTS.md: https://code.claude.com/docs/en/memory
- Instalar plugins: https://code.claude.com/docs/en/discover-plugins
- Criar marketplace: https://code.claude.com/docs/en/plugin-marketplaces
- Referência de marketplace (ref, sha, nomes reservados): https://code.claude.com/docs/en/plugins/marketplace-reference.md
- Carga de plugins (disco, versões, auto-update): https://code.claude.com/docs/en/plugins/loading.md
- Arquivos locais: `~/.claude/plugins/installed_plugins.json`, `known_marketplaces.json`, `marketplaces/claude-plugins-official/.claude-plugin/marketplace.json`

Codex:
- Skills: https://developers.openai.com/codex/skills → https://learn.chatgpt.com/docs/build-skills
- AGENTS.md: https://developers.openai.com/codex/guides/agents-md → https://learn.chatgpt.com/docs/agent-configuration/agents-md
- Plugins (uso): https://developers.openai.com/codex/plugins → https://learn.chatgpt.com/docs/plugins
- Plugins (marketplaces, cache, `--ref`): https://developers.openai.com/plugins/build/plugins
- Código (release rust-v0.172.0, 2026-11-24): https://github.com/openai/codex, arquivos `codex-rs/cli/src/plugin_cmd.rs`, `codex-rs/cli/src/marketplace_cmd.rs`, `codex-rs/core-plugins/src/manager.rs`, `codex-rs/core-plugins/src/installed_marketplaces.rs`, `codex-rs/config/src/marketplace_edit.rs`, `codex-rs/core/config.schema.json`

OpenCode:
- Skills V2: https://opencode.ai/docs/skills/ · V1: https://opencode.ai/v1/docs/skills/
- Rules V2: https://opencode.ai/docs/rules/ · V1: https://opencode.ai/v1/docs/rules/
- Plugins V2: https://opencode.ai/docs/plugins/ · V1: https://opencode.ai/v1/docs/plugins/
- Config: https://opencode.ai/docs/config/
- Releases: https://github.com/anomalyco/opencode/releases (v2.4.2 em 2026-11-26; v1.19.6 em 2026-11-17)

## Limitações

- Nenhum comando de instalação foi executado. Os caminhos marcados como [inferência] (marketplace do próprio repositório com `#tag` ou `--ref`) precisam de teste num ambiente descartável.
- Os docs do Codex redirecionam para `learn.chatgpt.com`. Algumas respostas vieram de resumo da página, não de texto integral.
- Não verifiquei o comportamento real do `npx skills update` com um `ref` de tag, nem onde o OpenCode V2 guarda pacotes vindos de git.

## Conferência pelo ensaio (27/11/2026)

Sondagem num `HOME` descartável (registro em `docs/superpowers/plans/2026-11-26-metodo-fatia-1-registro.md`):

- Claude Code 2.1.332: lê skills só de `.claude/skills/`; lê `AGENTS.md` sem `CLAUDE.md` e pelo `@AGENTS.md` dentro do `CLAUDE.md`. Confirma a seção 3.1. A documentação não diz, mas o ensaio mostrou: o Claude Code não carrega `CLAUDE.md` nem `AGENTS.md` de pasta dentro do rascunho de uma sessão.
- Codex 0.172.0: lê skills só de `.agents/skills/`; lê `AGENTS.md`. Confirma a seção 3.2.
- Os dois resolvem `superpowers:<nome>` para a skill local `<nome>` sem instrução.
- OpenCode 2.4.2: não ensaiado com modelo (chaves de provedor vencidas nesta máquina); a seção 3.3 segue só pela documentação.
