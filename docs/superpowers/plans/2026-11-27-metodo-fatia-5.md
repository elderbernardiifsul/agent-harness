# Método, fatia 5: orquestração — plano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** uma sessão orquestradora escolhe trabalho pronto, distribui a subagentes ou a sessões ociosas, acompanha com evidência, integra, fecha e relata, seguindo uma skill que diz o resultado de cada passo; a parte determinística da escolha é um comando com teste.

**Architecture:** extensão `nucleo/extensoes/orquestracao/` com o comando `ah candidatos` (livres do `ah deps --json` ∩ rótulo de pronto ∩ sem a marca de pendência) e a configuração da orquestração; skill `orquestrar` em `nucleo/extensoes/metodo/skills/orquestrar/` (instalada pelo `metodo instalar` com a `orquestracao` ligada, pelo mapa do orquestrador), com o texto fixo de quem executa num arquivo ao lado. O comando lê o `ah deps --json` pelo contrato público (processo filho), sem importar o núcleo.

**Tech Stack:** Node 22+, módulos ES, sem dependências; `node:test`; `teste/apoio/gh-falso.mjs` (com `GH_FALSO_TICKETS`); Claude Code no ensaio.

**Spec:** `docs/superpowers/specs/2026-11-26-metodo-design.md`, seções 3, 10 e 17 (fatia 5). Orquestração: `docs/superpowers/plans/2026-11-26-metodo-orquestracao.md`.

## Global Constraints

- Node 22 ou mais novo, módulos ES, sem dependências externas. Testes primeiro; nenhum teste usa rede real.
- Este ramo (`p2-orquestracao`) só edita `nucleo/extensoes/orquestracao/**`, `nucleo/extensoes/metodo/skills/orquestrar/**`, `teste/orquestracao-*` e a seção nova `orquestracao` de `docs/referencia/comandos.md` (depois de `prova`). O `colecoes.json` é do orquestrador.
- Antes de cada commit: `npm test` verde e `node ferramentas/varre-termos.mjs` com código 0. No fim: `node ferramentas/verifica.mjs --node "$(mise where node@22)/bin/node" --node "$(command -v node)"` com código 0.
- Textos em português; exemplos inventados (a loja, Ana Souza, Carla). Nada do projeto de origem: nem nomes, nem textos, nem a estrutura de lá copiada; a skill é escrita do zero a partir da seção 10 da spec.
- A skill diz o resultado, não a ferramenta (seção 3). O que é de um agente só vai na tabela "como fazer em cada agente", preenchida para o Claude Code.
- Toda recusa diz o motivo e o próximo passo. O harness sugere e registra; só as travas recusam.
- Ensaio: laboratório fora da pasta de rascunho da sessão (`/tmp/ah-lab-orquestrar`), `HOME` e `CLAUDE_CONFIG_DIR` descartáveis, `CLAUDE_CODE_OAUTH_TOKEN` lido de `~/.claude/.credentials.json` (`claudeAiOauth.accessToken`) na hora de cada rodada, sem copiar o token de renovação nem gravar o token em arquivo.
- Sem push e sem merge fora do ramo. Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Levantamento no projeto de origem (só leitura, 27/11)

Lidos a skill de orquestração e um relatório de orquestração. O que vira comportamento genérico (o resto é de lá e fica lá):

- **Começar:** papel de orquestrador, quadro, varredura, sessões visíveis, estado do git; um ticket de decisões só por orquestração, onde cada pergunta ao humano entra com a decisão padrão já aplicada ("silêncio = padrão").
- **Escolher:** entra o que tem o rótulo de pronto e não tem a marca de pendência no corpo nem nos comentários, não tem frente e não depende de ação do humano; o que não passa vira linha no ticket de decisões; nada passa, fim.
- **Distribuir:** subagente no worktree da frente (o orquestrador abre a frente; o subagente recebe o caminho), modelo pelo tamanho da tarefa; sessão ociosa com a frente aberta em nome dela e uma mensagem de atribuição; sessão viva e ociosa só do mesmo projeto.
- **Texto de quem executa:** o que ler, só o próprio worktree, `git add` com caminhos, pesado pela fila, merge fica com o orquestrador, decisão do humano vai ao ticket de decisões com o padrão aplicado, avisar ao terminar com commits e saída dos testes, passar a frente ao travar.
- **Acompanhar:** acordar de tempos em tempos; cada mensagem conferida com evidência antes de decidir; recusa de trava é sinal para decidir, não para contornar.
- **Fechar cada frente:** revisão por revisor novo quando o diff toca caminhos marcados; reintegração da base no worktree antes do teste demorado; prova por árvore e conferência depois do merge; merge local `--no-ff`; fechar a frente; fechar o ticket com o commit.
- **Integrar PRs de fora** como frente própria; **publicar** só com ordem do humano; **encerrar** com relatório: o que entrou (commit e verificação), o que ficou, tickets novos, o que espera o humano.
- **Relatório:** uma tabela por frente (tickets, commit do merge, o que ficou), as provas com comando e resultado, e "espera o humano" com o ticket de decisões.

## Decisões pendentes (para o orquestrador)

| # | Pergunta | Recomendo | Evidência |
|---|---|---|---|
| E1 | Como a skill sabe se o diff "toca os caminhos marcados"? | Um segundo comando determinístico, `ah pede-revisao <ramo> [--json]`: lista os arquivos de `git diff --name-only <base>...<ramo>` que casam com `orquestracao.revisao` e diz "pede revisão" ou "não pede". Com teste, como o `candidatos`. A alternativa é a skill ler a configuração e comparar à mão, o que é julgamento onde cabia conta | Spec, seção 10, passo 6 e "Extensão orquestracao" (a configuração tem os caminhos) |
| E2 | O `gh` falso de `teste/apoio/` não cria nem fecha issue, e a skill abre o ticket de decisões e fecha os tickets. | Um invólucro só do ensaio, `teste/orquestracao-ensaio-gh.mjs`, que trata `issue create` e `issue close` no mesmo arquivo de tickets e passa o resto ao `gh-falso.mjs`. Não mexe no apoio comum | `teste/apoio/gh-falso.mjs` (só `view`, `comment`, `edit`, `list`, `label create`, `api`) |
| E3 | Permissões do Claude Code no ensaio | `claude -p` com `--permission-mode acceptEdits` e `--allowedTools` restrito a `Bash(tools/ah:*)`, `Bash(git:*)`, `Bash(node:*)`, `Bash(npm test:*)`, `Bash(gh:*)`, `Agent`, `Read`, `Edit`, `Write`, `Glob`, `Grep`, no laboratório. Sem `bypassPermissions` | Spec, seção 17 (ensaio isolado) |

Decido sem perguntar (texto da skill, seção 16 da spec): o relatório final vai como comentário no ticket de decisões e, quando passa de uma tela, também num arquivo do projeto que a skill propõe (`docs/orquestracao/<data>-<assunto>.md`) e o humano confirma; a skill cita `tools/ah registros guardar` e `tools/ah prova --confere` só "quando a extensão estiver ligada".

## Review Focus

1. **Ticket com a marca de pendência só num comentário** (não no corpo), ou com a marca em outra caixa ("a decidir"): fica de fora. Teste na Task 1.
2. **Sem acesso ao GitHub:** o `deps` cai na leitura guardada e o `gh issue list` falha; o `candidatos` recusa com o próximo passo, sem inventar candidato. Teste na Task 1.
3. **Ticket livre que já tem frente** (outra sessão começou) não volta como candidato, e o "fora" diz qual frente. Teste na Task 1.
4. **Skill que cita comando que não existe** (renomeado, de extensão desligada sem aviso): o teste estrutural da Task 3 confere cada `tools/ah <comando>` citado.
5. **Subagente que sai do worktree da frente** no ensaio: o texto de quem executa diz "só o seu worktree", e o registro do ensaio confere com `git status` do principal e do worktree. Task 4.

---

### Task 1: Extensão `orquestracao`: `ah candidatos`

Nível: medio.

**Files:**
- Create: `nucleo/extensoes/orquestracao/extensao.mjs`
- Test: `teste/orquestracao-candidatos.test.mjs`
- Modify: `docs/referencia/comandos.md` (nova seção `orquestracao`, depois de `prova`)

**Interfaces:**
- Produces: `ah candidatos [--json]` (sem sessão). Configuração: `{"pronto": "ready-for-agent", "pendencia": "A decidir", "revisao": ["<glob>", …]}`, tudo opcional (os padrões são esses dois textos e `[]`). JSON: `{"pronto", "pendencia", "deCache", "candidatos": [{numero, titulo}], "fora": [{numero, titulo, motivo}]}`; `motivo` é um de `bloqueada`, `com frente <id>`, `sem o rótulo <pronto>`, `"<pendencia>" no corpo`, `"<pendencia>" num comentário de <autor>`.
- Exported helper (para o teste): `motivoDeFora(issue, {livre, frente, pendente}, config) → string|null`.

Regras: lê o `ah deps --json` por processo filho (`process.execPath` com `.harness/nucleo/bin/ah.mjs`, achado a partir de `import.meta.url`), na raiz, com `ctx.env`; código ≠ 0 recusa com a saída dele e `rode ah deps para ver o motivo`. Lê os tickets abertos com o rótulo por `ctx.gh(['issue', 'list', '--state', 'open', '--label', pronto, '--limit', '200', '--json', 'number,title,body,labels,comments'])`; falha recusa com `confira o acesso ao GitHub (gh auth status) e rode de novo`. A marca casa sem diferenciar maiúsculas, no corpo e em cada comentário. Ordem: a do `deps` (mais nova primeiro). `deCache: true` acrescenta, no texto, a linha da leitura guardada.

- [ ] **Step 1: Escrever os testes que falham** com `projetoDeTeste({extensoes: {orquestracao: true}, config: {github: {repo: 'exemplo/loja'}}})` e o `gh` falso de `teste/apoio/` com tickets (ver `teste/deps.test.mjs` para montar `AH_GH` e `GH_FALSO_TICKETS`): #12 e #13 prontos e livres; #14 pronto com "a decidir" num comentário de `carla`; #15 pronto e bloqueado por #12; #16 pronto, com frente aberta (`ah open layout --tickets 16`); #17 livre sem o rótulo.
  - `candidatos: os prontos e livres, sem a marca`: texto com `#13` e `#12` em `Candidatos`, e cada um dos outros em `Fora` com o motivo; `--json` com `candidatos` `[13, 12]` e os cinco `fora`.
  - `a marca no corpo também tira, e a marca configurada vale`: configuração `{"pendencia": "Pendente"}`, corpo com `PENDENTE: o frete`.
  - `rótulo de pronto configurado`: `{"pronto": "pronto-para-agente"}`.
  - `nenhum candidato`: `Nenhum candidato.` e código 0.
  - `sem GitHub recusa com o próximo passo`: `GH_FALSO_FORA=1` → código 1, `Faça:`.
  - `configuração inválida não carrega`: `pronto` vazio, `revisao` que não é lista de textos, campo desconhecido.
- [ ] **Step 2: Rodar e ver falhar.** `node --test teste/orquestracao-candidatos.test.mjs` → FAIL (`comando desconhecido: candidatos`).
- [ ] **Step 3: Implementar** `extensao.mjs` (cabeçalho com a dor: escolher trabalho a olho deixa passar ticket bloqueado, já em andamento ou com decisão pendente).
- [ ] **Step 4: Rodar e ver passar.**
- [ ] **Step 5: Documentar** a seção `orquestracao` (configuração, `candidatos`, texto e JSON, recusas, "não ensaiado no Windows").
- [ ] **Step 6: Verificar e commitar.**

```bash
git add -- nucleo/extensoes/orquestracao teste/orquestracao-candidatos.test.mjs docs/referencia/comandos.md
git commit -m "feat(orquestracao): ah candidatos, a parte determinística da escolha"
```

### Task 2: `ah pede-revisao <ramo>` (se E1 for aceita)

Nível: leve.

**Files:**
- Modify: `nucleo/extensoes/orquestracao/extensao.mjs`
- Test: `teste/orquestracao-revisao.test.mjs`
- Modify: `docs/referencia/comandos.md` (seção `orquestracao`)

**Interfaces:**
- Produces: `ah pede-revisao <ramo> [--json]` (sem sessão); `casaGlob(caminho: string, glob: string) → boolean` exportada (`**` casa qualquer coisa, inclusive `/`; `*` casa tudo menos `/`; `?` um caractere que não é `/`). JSON: `{"ramo", "base", "pede": bool, "arquivos": [...]}`.

Regras: `git diff --name-only <base>...<ramo>` na raiz (base de `git.base`); ramo inexistente recusa (`confira o nome com git branch`). Sem `revisao` na configuração: `não pede revisão (extensoes.orquestracao.revisao está vazia)`. Sai sempre 0.

- [ ] **Step 1: Testes que falham:** `casaGlob` (`src/pagamento/**` casa `src/pagamento/a/b.js` e não `src/pagamentos.js`; `*.sql` não casa `db/x.sql`; `db/*.sql` casa); ramo que toca `src/pagamento/cartao.js` pede, com o arquivo; ramo só de `docs/` não pede; ramo inexistente recusa.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar e ver passar.**
- [ ] **Step 5: Documentar.**
- [ ] **Step 6: Verificar e commitar** (`feat(orquestracao): ah pede-revisao, caminhos que pedem revisor novo`).

### Task 3: Skill `orquestrar`

Nível: alto. Texto que guia um agente sem contexto; o teste só confere a estrutura.

**Files:**
- Create: `nucleo/extensoes/metodo/skills/orquestrar/SKILL.md`, `nucleo/extensoes/metodo/skills/orquestrar/executor.md`
- Test: `teste/orquestracao-skill.test.mjs`

**Interfaces:**
- Consumes: `ah candidatos`, `ah pede-revisao` (Tasks 1 e 2); do núcleo, `papel`, `board`, `sweep`, `open --para`, `handoff`, `close`, `deps`; das extensões, `modelo <nível>`, `prova --confere` e `registros guardar` (quando ligadas).

Conteúdo de `SKILL.md`: frontmatter `name: orquestrar` e `description` com os gatilhos ("orquestrar", "tocar a fila", "distribuir tickets", "retomar a orquestração"); um parágrafo do que a sessão orquestradora faz e não faz (não executa tarefa; publica só com ordem); os sete passos da seção 10 da spec, cada um com o **resultado** que precisa existir ao fim dele (ex.: "ao fim do passo 1, existe um ticket de decisões desta orquestração, e cada pergunta ao humano está nele com o padrão aplicado") e o comando `tools/ah` que dá o dado; no passo 3, o modelo vem de `tools/ah modelo <nível>` com o `Nível:` da tarefa no plano (sem nível: `medio`); no passo 6, a ordem: revisão (quando `tools/ah pede-revisao <ramo>` pede), reintegração da base no worktree, `tools/ah registros guardar` (com `registros` ligada), teste e `tools/ah prova <rótulo>` (com `prova` ligada), merge `--no-ff` na base, `tools/ah prova --confere <base>` antes de repetir o teste, `tools/ah close`, ticket fechado com o commit; o passo 7 com o formato do relatório (o que entrou, com commit e verificação; o que ficou; tickets novos; o que espera o humano). No fim, a tabela "como fazer em cada agente" com as linhas subagente, mensagem a outra sessão, lista de sessões e espera entre mensagens: preenchida para o Claude Code (ferramenta `Agent` com o caminho do worktree no prompt e sem isolamento próprio, `SendMessage`, `ListAgents`, `/loop` ou `ScheduleWakeup`), e para os outros agentes "ache o equivalente; sem mensagem entre sessões, distribua só a subagentes".

Conteúdo de `executor.md`: o texto fixo que o orquestrador cola (com os campos `<frente>`, `<worktree>`, `<tickets ou plano>`), na ordem da seção 10, passo 4.

- [ ] **Step 1: Teste que falha** `teste/orquestracao-skill.test.mjs`: o `SKILL.md` tem frontmatter com `name: orquestrar` e `description`; cita `executor.md`, que existe; os sete passos aparecem como títulos `## 1.` a `## 7.`; todo `tools/ah <comando>` citado nos dois arquivos é um comando do núcleo (`nucleo/comandos/<comando>.mjs`) ou de uma extensão de `nucleo/extensoes/*/extensao.mjs` (lida pelo `carregarParaTeste` com a configuração mínima de cada uma), salvo `registros`, que vem da outra frente e fica numa lista explícita no teste até a integração; nenhum termo da lista de proibidos (já coberto pela varredura).
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Escrever** `SKILL.md` e `executor.md`.
- [ ] **Step 4: Rodar e ver passar.**
- [ ] **Step 5: Verificar e commitar** (`feat(orquestracao): skill orquestrar e o texto de quem executa`).

### Task 4: Ensaio com o Claude Code

Nível: alto. Sem código de produção; roda agente real.

**Files:**
- Create: `teste/orquestracao-ensaio-gh.mjs` (E2), `teste/orquestracao-ensaio-montar.mjs` (monta o laboratório; imprime o comando da rodada)
- Create: `docs/superpowers/plans/2026-11-27-metodo-fatia-5-registro.md` (seção "Ensaio")

- [ ] **Step 1: Montar o laboratório** com `node teste/orquestracao-ensaio-montar.mjs /tmp/ah-lab-orquestrar`: projeto git `loja` com remoto local, um módulo pequeno (`src/carrinho.mjs`) e testes `node --test`; `node <clone>/nucleo/bin/ah.mjs init --sigla as --sem-protecao`; extensões `orquestracao`, `modelo` e `prova` ligadas (`prova.comandos.unit = ["npm", "test"]`); a skill `orquestrar` copiada à mão para `.claude/skills/orquestrar/`; tickets no arquivo do `gh` falso: dois prontos e pequenos (#12 "Total do carrinho com desconto", #13 "Carrinho vazio mostra mensagem"), um pronto com "A decidir" num comentário (#14), um bloqueado (#15), um sem rótulo (#16); `PATH` com um `gh` que chama `orquestracao-ensaio-gh.mjs`; `AH_GH`, `AH_ESTADO`, `AH_WORKTREES` e `AH_FILA` dentro do laboratório; `HOME` e `CLAUDE_CONFIG_DIR` descartáveis.
- [ ] **Step 2: Rodar** `claude -p "Orquestre os tickets prontos deste projeto com a skill orquestrar, distribuindo a subagentes; não publique nada."` com as permissões de E3 e `CLAUDE_CODE_OAUTH_TOKEN` lido na hora; guardar a saída em `/tmp/ah-lab-orquestrar/saida.jsonl` (`--output-format stream-json --verbose`).
- [ ] **Step 3: Conferir com evidência:** `tools/ah candidatos` antes da rodada mostra #12 e #13; o `git log --first-parent dev` tem dois merges `--no-ff`; `tools/ah board` sem frente aberta; os tickets #12 e #13 fechados e #14, #15 e #16 abertos no arquivo do `gh` falso; o ticket de decisões criado, com #14 como linha; `npm test` verde na `dev`; nada fora do laboratório alterado; o relatório final da skill.
- [ ] **Step 4: Registrar** no registro: versão (`claude --version`), como o isolamento foi montado, o pedido, o que a skill fez em cada passo (resumo da saída), as conferências do Step 3 com a saída, o relatório da skill, o custo informado pela saída, e o que o ensaio mostrou que a skill precisa mudar. Mudanças de texto na skill entram num commit à parte e numa segunda rodada, se a primeira falhar num passo.
- [ ] **Step 5: Limpar** `/tmp/ah-lab-orquestrar` (sem token em arquivo nenhum).
- [ ] **Step 6: Commit** (`docs(orquestracao): ensaio da skill orquestrar com o Claude Code`, com os dois arquivos do ensaio e o registro).

### Task 5: Fechamento da fatia

Nível: leve.

- [ ] **Step 1:** `node ferramentas/varre-termos.mjs` código 0; `git diff p2-opcionais --stat` só com arquivos da linha deste ramo.
- [ ] **Step 2:** `node ferramentas/verifica.mjs --node "$(mise where node@22)/bin/node" --node "$(command -v node)"` código 0, saída no registro.
- [ ] **Step 3:** registro completo (decisões E1 a E3, commits, desvios, limitações), commit, e relato ao orquestrador com ramo, commits, saída do `verifica.mjs` e pendências. Para o orquestrador: a linha do mapa `orquestrar → orquestracao` em `colecoes.json`.
