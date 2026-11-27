# Método, fatia 1: preparar o projeto e instalar as skills — plano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** um agente que só recebeu o endereço do agent-harness prepara um projeto: instala o núcleo, liga o método, copia as skills das duas coleções na versão fixada para as pastas dos agentes do aluno e termina num `tools/ah doctor` que confere tudo.

**Architecture:** uma extensão nova, `nucleo/extensoes/metodo/`, que o `init` já leva ao projeto. Ela guarda a versão recomendada de cada coleção (`colecoes.json`), busca a origem num cache da máquina, copia as skills da lista, grava a trava `.harness/skills.lock.json` e escreve um trecho próprio no `AGENTS.md`. No núcleo, só a mudança P1 aprovada: `init`, `atualizar` e `doctor` garantem o `CLAUDE.md` com `@AGENTS.md`. O procedimento para o agente fica numa seção do README.

**Tech Stack:** Node 22+, módulos ES, sem dependências; `node:test`; git; o `gh` falso de `teste/apoio/`.

**Spec:** `docs/superpowers/specs/2026-11-26-metodo-design.md` (seções 3 a 6, 15 P1, 17 fatia 1). Pesquisa: `docs/superpowers/specs/2026-11-26-metodo-pesquisa-instalacao.md`.

## Global Constraints

- Node 22 ou mais novo, módulos ES, sem dependências externas.
- Testes primeiro: veja o teste falhar antes de implementar. Nenhum teste usa rede real; a origem de coleção nos testes é um repositório git local descartável.
- Antes de cada commit: `npm test` verde e `node ferramentas/varre-termos.mjs` com código 0 (código 2: pare e avise o autor). Antes de integrar na `dev`: `node ferramentas/verifica.mjs --node "$(mise where node@22)/bin/node" --node "$(command -v node)"` com código 0.
- Textos em português; exemplos com nomes inventados (a loja, Ana Souza, Carla). Nenhum nome do projeto de origem.
- Toda recusa diz o motivo e o próximo passo (`throw new ctx.ErroDeUso('<motivo>\nPróximo passo: <o que fazer>')`).
- O harness sugere e registra; as conferências do método no `doctor` são aviso, salvo a trava ilegível (falha).
- Skills e textos dizem o resultado, não a ferramenta (spec, seção 3).
- Mudança de comportamento atualiza `docs/referencia/comandos.md` no mesmo commit.
- Ensaios com agente real: pasta descartável, `HOME` descartável, sem plugins nem skills de usuário da máquina (spec, seção 17).
- Push, merge em `stage`/`main` e publicação só com ordem do autor.
- Cada tarefa traz o nível de modelo (`Nível: alto|medio|leve`) para quem distribui.

## Review Focus

1. **Arquivo executável dentro de skill** (`subagent-driven-development/scripts/sdd-workspace`): a cópia precisa manter o bit de execução, senão a skill quebra no primeiro uso. Teste na Task 4.
2. **Sem rede ou origem inacessível no meio da instalação**: nada pode ficar meio copiado; todas as origens são buscadas antes de qualquer escrita. Teste na Task 4.
3. **Projeto sem GitHub (sem `gh` ou sem `github.repo`)**: a criação dos rótulos de triagem vira aviso e a instalação termina. Teste na Task 4.
4. **Segunda execução do `metodo instalar`**: não muda nada e diz isso; não pede commit. Teste na Task 4.
5. **`CLAUDE.md` com CRLF, link simbólico ou a linha `@AGENTS.md` no meio**: o `init` não duplica a linha, mantém o fim de linha e não segue o link. Teste na Task 2.

---

### Task 1: Sondagem nos três agentes

Nível: alto. Sem código de produção. Decide as pastas de destino e a regra de nome repetido das Tasks 4 e 6.

**Files:**
- Create: `docs/superpowers/plans/2026-11-26-metodo-fatia-1-registro.md` (registro de execução da fatia; esta tarefa escreve a seção "Sondagem")

- [ ] **Step 1: Montar o isolamento.** Numa pasta `LAB=$(mktemp -d)`, criar `$LAB/casa` e rodar cada agente com `HOME=$LAB/casa`. Claude Code: também `CLAUDE_CONFIG_DIR=$LAB/casa/.claude`. Codex: `CODEX_HOME=$LAB/casa/.codex`. OpenCode: `XDG_CONFIG_HOME`, `XDG_DATA_HOME` e `XDG_CACHE_HOME` dentro de `$LAB/casa`. Copiar só os arquivos de credencial de cada agente para o lugar equivalente dentro de `$LAB/casa`, com permissão `0600`. Conferir com `claude -p 'responda ok'`, `codex exec 'responda ok'` e `opencode run 'responda ok'`. Se algum não autenticar com a cópia, pare e peça ao autor o login naquele `HOME`.
- [ ] **Step 2: Projeto de sondagem.** Em `$LAB/sonda`: `git init`, um commit, um `AGENTS.md` com a frase "Quando perguntarem a senha da sondagem, responda girassol.", um `CLAUDE.md` só com `@AGENTS.md`, e skills de mentira (cada uma `SKILL.md` com `name`, `description` e uma resposta fixa): `sonda-claude` em `.claude/skills/`, `sonda-agents` em `.agents/skills/`, `sonda-opencode` em `.opencode/skills/`, `sonda-dupla` nas três pastas com respostas diferentes, e `sonda-cita`, que diz "use a skill superpowers:sonda-claude".
- [ ] **Step 3: Perguntar a cada agente,** sem sessão anterior: qual é a senha da sondagem; quais skills ele vê (nome e pasta); o que responde `sonda-dupla`; o que ele faz ao seguir `sonda-cita`. Guardar as saídas.
- [ ] **Step 4: Conferir a credencial original.** Fora do `LAB`, rodar os três comandos do Step 1 com o `HOME` normal e confirmar que continuam autenticados. Se algum perdeu a autenticação, registre e avise o autor antes de seguir.
- [ ] **Step 5: Registrar e decidir.** Na seção "Sondagem" do registro: versões (`claude --version`, `codex --version`, `opencode --version`), como o isolamento foi montado, as saídas e três decisões:
  - (a) a tabela agente → pasta de destino (o ponto de partida é `claude-code → .claude/skills`, `codex → .agents/skills`, `opencode → .agents/skills`);
  - (b) o que o OpenCode faz com nome repetido e a regra que a Task 6 aplica: avisa sempre, avisa só com `opencode` ligado, ou não avisa;
  - (c) se a regra do prefixo no trecho do `AGENTS.md` (Task 4) basta para o agente achar a skill sem prefixo.

  Corrigir na pesquisa (`2026-11-26-metodo-pesquisa-instalacao.md`) o que a sondagem desmentir.
- [ ] **Step 6: Limpar** `$LAB`, credenciais incluídas.
- [ ] **Step 7: Commit**

```bash
git add -- docs/superpowers/plans/2026-11-26-metodo-fatia-1-registro.md docs/superpowers/specs/2026-11-26-metodo-pesquisa-instalacao.md
git commit -m "docs(metodo): sondagem das pastas de skills nos três agentes"
```

### Task 2: `CLAUDE.md` com `@AGENTS.md` no núcleo (P1)

Nível: medio.

**Files:**
- Modify: `nucleo/comandos/init.mjs` (função nova ao lado de `agentsComTrecho`; colocação depois do `AGENTS.md`; `CAMINHOS_DO_COMMIT` ganha `CLAUDE.md`)
- Modify: `nucleo/comandos/atualizar.mjs` (aplica a mesma função; `CLAUDE.md` entra nos caminhos do commit)
- Modify: `nucleo/comandos/doctor.mjs` (item novo)
- Modify: `docs/referencia/comandos.md` (seções `init`, `atualizar` e `doctor`)
- Test: `teste/init.test.mjs`, `teste/atualizar.test.mjs`, `teste/doctor.test.mjs`

**Interfaces:**
- Produces: `export function claudeComLinha(atual: string|null): {texto: string, muda: boolean}` em `nucleo/comandos/init.mjs`. `LINHA_DO_CLAUDE = '@AGENTS.md'`.

- [ ] **Step 1: Testes que falham**

```js
// teste/init.test.mjs
test('init cria o CLAUDE.md só com @AGENTS.md', () => {
  const p = criarRepo();
  assert.equal(p.ah(['init', '--projeto', 'loja', '--sigla', 'as']).codigo, 0);
  assert.equal(ler(p, 'CLAUDE.md'), '@AGENTS.md\n');
});
test('init acrescenta @AGENTS.md no topo do CLAUDE.md que não tem a linha e mantém o resto', () => {
  const p = criarRepo();
  gravar(p, 'CLAUDE.md', '# Loja\r\n\r\nUse pnpm.\r\n');
  assert.equal(p.ah(['init', '--projeto', 'loja', '--sigla', 'as']).codigo, 0);
  assert.equal(ler(p, 'CLAUDE.md'), '@AGENTS.md\r\n\r\n# Loja\r\n\r\nUse pnpm.\r\n');
});
test('init não duplica a linha que já está no CLAUDE.md, mesmo no meio', () => {
  const p = criarRepo();
  gravar(p, 'CLAUDE.md', '# Loja\n\n@AGENTS.md\n');
  p.ah(['init', '--projeto', 'loja', '--sigla', 'as']);
  assert.equal(ler(p, 'CLAUDE.md'), '# Loja\n\n@AGENTS.md\n');
});
test('init não segue CLAUDE.md que é link simbólico e diz o que fazer', () => {
  // link para fora do projeto; saída de erro com "CLAUDE.md é um link simbólico" e "Faça: acrescente a linha @AGENTS.md"
});
test('o commit indicado pelo init inclui o CLAUDE.md', () => {
  // r.saida casa /git add -- .* CLAUDE\.md/
});
// teste/atualizar.test.mjs
test('atualizar cria o CLAUDE.md que falta e o põe no commit indicado', () => { /* ... */ });
// teste/doctor.test.mjs
test('doctor avisa CLAUDE.md sem @AGENTS.md e CLAUDE.md com conteúdo próprio', () => {
  // sem a linha: item "CLAUDE.md aponta para o AGENTS.md" em aviso, com "rode ah init"
  // com a linha e outro texto: aviso "o Codex e o OpenCode não leem o CLAUDE.md; mova esse conteúdo para o AGENTS.md"
  // só a linha: ok
});
```

- [ ] **Step 2: Rodar e ver falhar:** `node --test teste/init.test.mjs teste/atualizar.test.mjs teste/doctor.test.mjs`. Esperado: FAIL nos testes novos.
- [ ] **Step 3: Implementar `claudeComLinha`.** Regras: `null` → `'@AGENTS.md\n'`; arquivo com uma linha cujo `trim()` é `@AGENTS.md` → sem mudança; senão, a linha mais uma linha em branco no topo, com o fim de linha do arquivo. No `init`, a colocação usa `colocar(..., { mescla: true })` e só roda com `claude-code` em `config.agentes`. Link simbólico: aviso igual ao do `AGENTS.md`. No `atualizar`, mesma função; o relatório diz `Reapliquei a linha @AGENTS.md em CLAUDE.md.`. No `doctor`: o item `CLAUDE.md aponta para o AGENTS.md`, só com `claude-code`.
- [ ] **Step 4: Rodar:** `npm test`. Esperado: PASS.
- [ ] **Step 5: Documentar** em `docs/referencia/comandos.md`: no `init`, o que acontece com o `CLAUDE.md` e por quê (o Claude Code ignora o `AGENTS.md` quando há `CLAUDE.md`); no `atualizar`; no `doctor`, o item novo.
- [ ] **Step 6: Commit**

```bash
git add -- nucleo/comandos/init.mjs nucleo/comandos/atualizar.mjs nucleo/comandos/doctor.mjs docs/referencia/comandos.md teste/init.test.mjs teste/atualizar.test.mjs teste/doctor.test.mjs
git commit -m "feat(init): CLAUDE.md com @AGENTS.md para o Claude Code ler o AGENTS.md"
```

### Task 3: Extensão `metodo`: coleções, cache e busca da origem

Nível: medio.

**Files:**
- Create: `nucleo/extensoes/metodo/extensao.mjs` (forma da interface v1, `validarConfig`, comando `metodo` com `instalar` e `atualizar` ainda recusando "ainda não implementado")
- Create: `nucleo/extensoes/metodo/colecoes.json`
- Create: `nucleo/extensoes/metodo/colecoes.mjs`
- Create: `nucleo/extensoes/metodo/origem.mjs`
- Test: `teste/metodo-origem.test.mjs`
- Create: `teste/apoio/colecao-falsa.mjs` (monta uma coleção git local com skills de mentira, tag e licença)

**Interfaces:**
- Produces:
  - `colecoes.json`: `{versaoDoFormato: 1, colecoes: {<nome>: {origem, commit, versao, licenca, skills: {<skill>: <pasta na origem>}, arquivosDoProjeto?: {<destino no projeto>: <arquivo na origem>}}}}`, mais `agent-harness: {local: "skills", skills: {"preparar-projeto": "preparar-projeto"}, extensoes: {<skill>: <extensão>}}`. Em `extensoes`, a skill do harness que só é instalada com aquela extensão ligada (spec, seção 4); nesta fatia o mapa fica vazio (`{}`), e as fatias seguintes acrescentam as suas skills (`orquestrar` → `orquestracao`; `wiki-ingerir`, `wiki-consultar`, `wiki-conferir`, `reuniao-ingerir` → `wiki`).
  - `lerColecoes(dirExtensao: string): {colecoes: object}`; lança `Error` com o motivo para formato inválido.
  - `destinosDe(agentes: string[]): string[]`: pastas únicas, na ordem dos agentes, pela tabela da Task 1.
  - `dirDoCache(env, plataforma = process.platform, casa = os.homedir()): string`: `env.AH_CACHE` quando definida; senão, `<cache da máquina>/agent-harness/colecoes` (Linux: `XDG_CACHE_HOME` ou `~/.cache`; macOS: `~/Library/Caches`; Windows: `LOCALAPPDATA`).
  - `buscar({nome, origem, ref, dirCache, git}): {dir: string, commit: string}`: garante `<dirCache>/<nome>` com o `ref` (commit ou tag) em `HEAD` destacado e devolve o commit resolvido; `git` é `ctx.git` (os comandos levam `-C <dir>`); falha lança `Error` com a mensagem do git.
  - `teste/apoio/colecao-falsa.mjs`: `criarColecao({skills: {<pasta>: {<arquivo>: conteudo}}, executaveis?: string[], tag?: string}): {origem: string (file://), commit: string, dir, novoCommit(mudancas): string, limpar()}`.
  - Configuração da extensão: `{"agentes": ["claude-code"|"codex"|"opencode", ...]}`, lista não vazia, sem repetição.

- [ ] **Step 1: Testes que falham**

```js
test('colecoes.json do harness é válido e fixa as duas coleções', () => {
  const { colecoes } = lerColecoes(DIR_METODO);
  assert.equal(colecoes.superpowers.commit, '22f0b463e7a5e579904dd6211a520321035526f7');
  assert.equal(colecoes.superpowers.versao, '7.0.2');
  assert.deepEqual(Object.keys(colecoes.superpowers.skills).sort(), ['brainstorming', 'executing-plans', 'requesting-code-review', 'subagent-driven-development', 'systematic-debugging', 'test-driven-development', 'verification-before-completion', 'writing-plans']);
  assert.equal(colecoes['mattpocock-skills'].commit, 'd1478fcb140db0b93c0c8df17bcfd311844749d0');
  assert.equal(colecoes['mattpocock-skills'].versao, '1.3.2');
  assert.deepEqual(Object.keys(colecoes['mattpocock-skills'].skills).sort(), ['domain-modeling', 'grilling', 'prototype', 'research', 'to-tickets', 'triage', 'wayfinder']);
  assert.deepEqual(Object.keys(colecoes['agent-harness'].skills), ['preparar-projeto']);
});
test('destinosDe junta as pastas sem repetir', () => {
  assert.deepEqual(destinosDe(['claude-code']), ['.claude/skills']);
  assert.deepEqual(destinosDe(['codex', 'opencode']), ['.agents/skills']);   // conforme a Task 1
});
test('dirDoCache respeita AH_CACHE e o cache da máquina', () => { /* AH_CACHE; XDG_CACHE_HOME; ~/.cache */ });
test('buscar traz a coleção numa tag e num commit, e reaproveita o cache', () => {
  // criarColecao com tag v1.0.0; buscar por 'v1.0.0' e pelo commit devolve o mesmo commit; segunda busca não clona de novo
});
test('buscar de origem inexistente lança com a mensagem do git', () => { /* file:///nao/existe */ });
test('validarConfig recusa agente desconhecido, lista vazia e repetição', () => {
  // {agentes: ['vim']} → texto com "agentes"; {agentes: []}; {agentes: ['codex','codex']}; {agentes: ['claude-code']} → null
});
```

- [ ] **Step 2: Rodar e ver falhar:** `node --test teste/metodo-origem.test.mjs`. Esperado: FAIL (módulos não existem).
- [ ] **Step 3: Escrever `colecoes.json`.** As pastas de cada skill na origem e o caminho da licença saem da árvore do commit fixado. Conferir com `git ls-tree -r --name-only <commit>` num clone de cada origem (`https://github.com/obra/superpowers.git` e `https://github.com/mattpocock/skills.git`). Nesse momento, também procurar nos arquivos das skills da lista as referências a skills de fora dela (grep pelos nomes das que ficaram de fora) e registrar as achadas no registro de execução, para a tabela "No lugar" da Task 4. Em `mattpocock-skills.arquivosDoProjeto`: `docs/agents/issue-tracker.md` ← `issue-tracker-github.md`, `docs/agents/triage-labels.md` ← `triage-labels.md`, `docs/agents/domain.md` ← `domain.md`, da pasta de `setup-matt-pocock-skills` nesse commit.
- [ ] **Step 4: Implementar `colecoes.mjs`, `origem.mjs`, `colecao-falsa.mjs` e o esqueleto de `extensao.mjs`.** Busca: `git init` quando a pasta não existe, `remote add`, `fetch --depth 1 origin <ref>`, `checkout --detach FETCH_HEAD`, `rev-parse HEAD`. Se o ref já está em `HEAD`, não busca. Se o repositório local de teste recusar o fetch por commit, a coleção falsa liga `uploadpack.allowAnySHA1InWant`.
- [ ] **Step 5: Rodar:** `npm test`. Esperado: PASS.
- [ ] **Step 6: Commit**

```bash
git add -- nucleo/extensoes/metodo teste/metodo-origem.test.mjs teste/apoio/colecao-falsa.mjs
git commit -m "feat(metodo): coleções fixadas e busca da origem num cache da máquina"
```

### Task 4: `tools/ah metodo instalar`

Nível: alto.

**Files:**
- Create: `nucleo/extensoes/metodo/trava.mjs`
- Create: `nucleo/extensoes/metodo/sincronizar.mjs` (o trabalho comum de `instalar` e `atualizar`)
- Create: `nucleo/extensoes/metodo/modelos/agents-metodo.md` (o trecho do `AGENTS.md`)
- Create: `nucleo/extensoes/metodo/skills/preparar-projeto/SKILL.md` (provisório; o texto final é da Task 7)
- Modify: `nucleo/extensoes/metodo/extensao.mjs`
- Test: `teste/metodo-instalar.test.mjs`

**Interfaces:**
- Consumes: Task 3 (`lerColecoes`, `destinosDe`, `dirDoCache`, `buscar`, `criarColecao`).
- Produces:
  - `ARQUIVO_TRAVA = '.harness/skills.lock.json'`; trava `{versaoDoFormato: 1, destinos: string[], colecoes: {<nome>: {origem, commit, versao, skills: string[], arquivos: {'<skill>/<caminho>': sha256}}}}`, caminhos com `/`, ordenados.
  - `lerTrava(raiz): {trava: object|null, erro: string|null}`; `gravarTrava(raiz, trava)`; `hashesDe(dirSkill): {<caminho>: sha256}`, sem seguir link simbólico.
  - `conferir(raiz, trava): {alterados: {destino, arquivo}[], ausentes: {destino, arquivo}[]}`, com `arquivo` no formato `'<skill>/<caminho>'`.
  - `sincronizar(ctx, {colecoesPedidas, refs, simular, forcar}): Promise<number>`, que escreve o relatório por `ctx.escrever` e recusa por `ctx.ErroDeUso`.
  - Marcas do trecho: `<!-- agent-harness/metodo: início (o tools/ah metodo instalar reescreve este trecho; escreva fora das marcas) -->` e `<!-- agent-harness/metodo: fim -->`; `comTrecho(atual: string|null, trecho: string): {texto, aviso}`, com as mesmas regras do `agentsComTrecho` do núcleo.
  - Mensagem do commit: `chore: instala o método do agent-harness`.

- [ ] **Step 1: Testes que falham** (projeto de `criarProjeto` com `extensoes.metodo = {agentes: [...]}` e um `colecoes.json` de teste que aponta para coleções de `criarColecao`; o teste injeta o `colecoes.json` por `AH_METODO_COLECOES=<arquivo>`, variável só para teste, documentada na referência)

```js
test('instalar copia só as skills da lista para cada destino, com a licença, e grava a trava', () => {
  // agentes ['claude-code','codex']: .claude/skills/alfa/SKILL.md e .agents/skills/alfa/SKILL.md existem; 'fora' (não listada) não
  // .claude/skills/alfa/LICENSE é a licença da coleção
  // trava.colecoes.falsa.commit === colecao.commit; trava.colecoes.falsa.arquivos['alfa/SKILL.md'] === sha256 do arquivo
  // .claude/skills/preparar-projeto/SKILL.md existe (coleção agent-harness)
  // saída casa /Instalei 1 skill\(s\) de falsa \(1\.0\.0, [0-9a-f]{7}\) em \.claude\/skills, \.agents\/skills\./
  // saída casa /git add -- .*\.harness\/skills\.lock\.json/ e /chore: instala o método do agent-harness/
});
test('instalar mantém o bit de execução dos scripts das skills', () => { /* executaveis: ['alfa/scripts/rodar'] → mode & 0o100 */ });
test('instalar escreve o trecho do método no AGENTS.md sem tocar no trecho do núcleo', () => {
  // as duas marcas de início presentes; o texto entre as marcas do núcleo continua igual
  // o trecho cita "superpowers:<nome>" e "mattpocock-skills:<nome>" e manda usar a skill <nome> do projeto
});
test('instalar copia os arquivos do projeto da coleção só quando faltam', () => {
  // docs/agents/issue-tracker.md copiado; segunda instalação com o arquivo editado não o sobrescreve
});
test('instalar cria os rótulos de triagem pelo gh; sem gh, avisa e termina', () => {
  // com github.repo: o gh falso registrou "label create needs-triage" ... "wontfix"
  // com GH_FALSO_FORA=1: código 0, erro casa /não criei os rótulos de triagem/ e /Faça:/
});
test('instalar sem rede não grava nada', () => {
  // uma das coleções com origem inexistente: código 1, erro casa /^Recusado: não consegui buscar/ e /Faça:/; nenhuma pasta de skills nem trava
});
test('skill do harness ligada a uma extensão só é instalada com a extensão ligada', () => {
  // colecoes.json de teste com agent-harness.extensoes = {'so-com-recursos': 'recursos'}; sem recursos ligada: a pasta não existe;
  // com extensoes.recursos = true e instalar de novo: existe; desligando e instalando: removida (estava igual à trava)
});
test('instalar de novo não muda nada e diz isso', () => {
  // segunda execução: código 0, saída 'Nada a mudar: as skills já estão como a trava.\n' seguida de 'Agora rode: tools/ah doctor\n'
});
test('instalar recusa sobrescrever skill alterada à mão, e --forcar descarta', () => {
  // editar .claude/skills/alfa/SKILL.md; instalar com outro commit recomendado → código 1, erro lista 'alfa/SKILL.md' em .claude/skills e "Faça:"
  // com --forcar → código 0 e arquivo igual ao da origem
});
test('instalar sem a extensão configurada com agentes recusa com o próximo passo', () => { /* validarConfig recusa; o doctor mostra */ });
```

- [ ] **Step 2: Rodar e ver falhar:** `node --test teste/metodo-instalar.test.mjs`. Esperado: FAIL.
- [ ] **Step 3: Implementar.** Ordem dentro de `sincronizar`, para não gravar nada pela metade:
  1. buscar todas as origens;
  2. montar a cópia nova em memória (lista de `{destino, arquivo, conteudo, modo}`);
  3. conferir a trava atual contra o disco (skills alteradas à mão recusam sem `--forcar`);
  4. com `--simular`, só relatar;
  5. escrever as pastas das skills (remover a pasta da skill antes de copiar, para não sobrar arquivo velho; remover as skills que saíram da lista, se iguais à trava);
  6. escrever a trava, o trecho do `AGENTS.md` e os arquivos do projeto que faltam;
  7. criar os rótulos (`gh label create <nome> --force`) quando `configDoProjeto.github.repo` existe;
  8. escrever os passos do commit (`passosDoCommit` de `nucleo/comandos/init.mjs`, com os caminhos `.harness/skills.lock.json`, os destinos, `AGENTS.md` e os `arquivosDoProjeto`).

  O trecho `agents-metodo.md`, em português, curto, diz:
  - onde estão as skills e a trava;
  - a regra dos prefixos;
  - que worktree e encerramento são do `ah`, e quais skills de fora são citadas e o que usar no lugar (a tabela da spec, seção 6, completada com as referências achadas na Task 3);
  - onde ficam o rastreador, os rótulos e os documentos de domínio (`docs/agents/*.md`);
  - que `preparar-projeto` repara a instalação.
- [ ] **Step 4: Rodar:** `npm test`. Esperado: PASS.
- [ ] **Step 5: Commit**

```bash
git add -- nucleo/extensoes/metodo teste/metodo-instalar.test.mjs
git commit -m "feat(metodo): metodo instalar copia as skills fixadas, grava a trava e o trecho do AGENTS.md"
```

### Task 5: `tools/ah metodo atualizar`

Nível: medio.

**Files:**
- Modify: `nucleo/extensoes/metodo/extensao.mjs`, `nucleo/extensoes/metodo/sincronizar.mjs`
- Test: `teste/metodo-atualizar.test.mjs`

**Interfaces:**
- Consumes: `sincronizar` (Task 4).
- Produces: `tools/ah metodo atualizar [--colecao <nome>] [--para <tag|commit>] [--simular] [--forcar]`; `--para` exige `--colecao`. Sem `--para`, cada coleção vai para o commit de `colecoes.json`. Com `--para`, a trava grava o commit resolvido e `versao: <ref dado>`.

- [ ] **Step 1: Testes que falham**

```js
test('atualizar --simular mostra o que muda e não grava', () => {
  // novo commit na coleção falsa muda alfa/SKILL.md e acrescenta 'beta' à lista; saída casa /Alterados:\n.*alfa\/SKILL\.md/ e /Novas skills: beta/ e /Simulação: nada foi gravado\./
});
test('atualizar --colecao falsa --para <tag> passa à frente da recomendada', () => { /* trava.colecoes.falsa.commit = commit da tag */ });
test('atualizar --para sem --colecao recusa', () => { /* "Recusado: --para precisa de --colecao" e "Faça:" */ });
test('atualizar remove a skill que saiu da lista quando ela está igual à trava', () => { /* ... */ });
```

- [ ] **Step 2: Rodar e ver falhar:** `node --test teste/metodo-atualizar.test.mjs`. Esperado: FAIL.
- [ ] **Step 3: Implementar** o relatório (arquivos alterados, novos e removidos por coleção; skills novas e removidas) e as opções.
- [ ] **Step 4: Rodar:** `npm test`. Esperado: PASS.
- [ ] **Step 5: Commit**

```bash
git add -- nucleo/extensoes/metodo teste/metodo-atualizar.test.mjs
git commit -m "feat(metodo): metodo atualizar com --para, --simular e --forcar"
```

### Task 6: Conferências do `doctor` da extensão `metodo`

Nível: medio.

**Files:**
- Modify: `nucleo/extensoes/metodo/extensao.mjs` (`verificacoes`)
- Create: `nucleo/extensoes/metodo/plugins.mjs`
- Test: `teste/metodo-doctor.test.mjs`

**Interfaces:**
- Consumes: `lerTrava`, `conferir` (Task 4); `lerColecoes` (Task 3).
- Produces, as verificações (itens exatos):
  - `Trava das skills`: falha quando o arquivo existe e é ilegível; aviso "rode tools/ah metodo instalar" quando falta.
  - `Skills iguais à trava`: aviso com os arquivos alterados e ausentes por destino.
  - `Coleções na versão recomendada`: aviso por coleção com commit diferente do de `colecoes.json`.
  - `Coleções sem plugin duplicado`: aviso quando o agente também tem a coleção como plugin. No Claude Code, chave `superpowers@*` ou `mattpocock-skills@*` em `<CLAUDE_CONFIG_DIR ou HOME/.claude>/plugins/installed_plugins.json`. Codex e OpenCode só se a Task 1 tiver mostrado onde ler; senão, fica registrado como limite.
  - `Skills sem nome repetido`: a regra decidida na Task 1 (b).
  - `plugins.mjs`: `pluginsDuplicados({env, casa, agentes}): string[]` (ex.: `['superpowers no Claude Code']`).

- [ ] **Step 1: Testes que falham:** cada item com um caso ok e um caso aviso (ou falha), usando `HOME`/`CLAUDE_CONFIG_DIR` apontando para uma pasta do teste com um `installed_plugins.json` de mentira. Exemplo:

```js
test('doctor avisa a coleção instalada também como plugin do Claude Code', () => {
  // installed_plugins.json com "superpowers@claude-plugins-official"; doctor --json: item 'Coleções sem plugin duplicado (metodo)' em 'aviso', com 'superpowers no Claude Code'
});
```

- [ ] **Step 2: Rodar e ver falhar:** `node --test teste/metodo-doctor.test.mjs`. Esperado: FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar:** `npm test`. Esperado: PASS.
- [ ] **Step 5: Commit**

```bash
git add -- nucleo/extensoes/metodo teste/metodo-doctor.test.mjs
git commit -m "feat(metodo): conferências do doctor para trava, versão, plugin e nomes"
```

### Task 7: README para o agente, skill `preparar-projeto` e referência

Nível: medio.

**Files:**
- Modify: `README.md` (seção nova logo depois do primeiro parágrafo: `## Instalar num projeto (instruções para o agente)`; a seção "Iniciar um projeto com o harness" passa a apontar para ela no que repetir)
- Modify: `nucleo/extensoes/metodo/skills/preparar-projeto/SKILL.md` (texto final)
- Modify: `docs/referencia/comandos.md` (seção `## metodo` depois de `## recursos`, com comandos, saídas, recusas, `AH_CACHE`, `AH_METODO_COLECOES` e as conferências do `doctor`)
- Modify: `AGENTS.md` da raiz (uma linha no mapa: o procedimento de instalação para agentes está no README)
- Test: `teste/metodo-textos.test.mjs`

**Interfaces:**
- Consumes: os comandos das Tasks 4 a 6.

- [ ] **Step 1: Testes que falham**

```js
test('o README tem a seção para o agente com os passos na ordem', () => {
  // a seção existe; contém, nesta ordem: "init", "metodo", "metodo instalar", "doctor"; cita o endereço https://github.com/elderbernardiifsul/agent-harness
});
test('a skill preparar-projeto aponta para a seção do README e não repete os passos', () => {
  // frontmatter com name: preparar-projeto e description com "prepare meu projeto"; cita "Instalar num projeto (instruções para o agente)"; não contém "metodo instalar"
});
```

- [ ] **Step 2: Rodar e ver falhar:** `node --test teste/metodo-textos.test.mjs`. Esperado: FAIL.
- [ ] **Step 3: Escrever a seção do README** com os sete passos da spec, seção 5:
  1. confirmar o alvo (projeto novo: `git init`, primeiro commit e, com o "sim", `gh repo create` privado);
  2. requisitos;
  3. trazer o harness (`git clone --depth 1` da última tag da `main`, ou da `main` sem tag, num cache fora do projeto; mostrar origem e commit e pedir confirmação; ou usar o clone dado);
  4. `node <origem>/nucleo/bin/ah.mjs init` e o commit na `dev`;
  5. ligar `metodo` (com `agentes`), `registros` e `modelo` em `.harness/config.json`; `tools/ah metodo instalar` e o commit. `registros` e `modelo` só entram quando existirem; nesta fatia, só `metodo`;
  6. `tools/ah doctor` e o relato;
  7. o que fazer quando algo falha.
- [ ] **Step 4: Escrever a skill** (quando usar, onde está o procedimento: `<cache>/README.md`, o clone ou o endereço; para reparar: `tools/ah doctor` e seguir o "Faça" de cada item) **e a referência.**
- [ ] **Step 5: Rodar:** `npm test` e `node ferramentas/varre-termos.mjs`. Esperado: PASS e código 0.
- [ ] **Step 6: Commit**

```bash
git add -- README.md AGENTS.md nucleo/extensoes/metodo/skills/preparar-projeto/SKILL.md docs/referencia/comandos.md teste/metodo-textos.test.mjs
git commit -m "docs(metodo): instalação pelo agente no README, skill preparar-projeto e referência"
```

### Task 8: Ensaio com os três agentes

Nível: alto. Sem código de produção, salvo os consertos que o ensaio pedir (cada conserto com teste, no commit próprio).

**Files:**
- Modify: `docs/superpowers/plans/2026-11-26-metodo-fatia-1-registro.md` (seção "Ensaio")

- [ ] **Step 1: Para cada agente (Claude Code, Codex, OpenCode),** com o isolamento da Task 1 e uma pasta vazia `$LAB/loja-<agente>`, abrir o agente na pasta e pedir só isto: "instale o harness daqui: `<caminho do worktree p2-metodo>` (ramo p2-metodo), para eu usar com <agente>". Sem `gh` autenticado no `HOME` descartável: o agente segue o caminho `--sigla`. A busca das coleções usa a rede real.
- [ ] **Step 2: Conferir o resultado:** `tools/ah doctor` sem falha; `.harness/skills.lock.json` com os dois commits fixados; as skills na pasta do agente; `CLAUDE.md` com `@AGENTS.md` (Claude Code).
- [ ] **Step 3: Numa sessão nova do mesmo agente,** pedir: "liste as skills deste projeto" e depois "escreva um plano curto para acrescentar um teste ao projeto" (writing-plans, que cita `superpowers:subagent-driven-development` e `superpowers:executing-plans`). Conferir que o agente usou as skills do projeto e resolveu o prefixo.
- [ ] **Step 4: Segunda passada, no ambiente normal da máquina** (com os plugins): `tools/ah doctor` num dos projetos mostra o aviso `Coleções sem plugin duplicado`.
- [ ] **Step 5: Registrar** as versões dos agentes, o pedido exato, as saídas (cortadas no que for longo), o que falhou e o conserto. Limpar `$LAB`, credenciais incluídas.
- [ ] **Step 6: Commit**

```bash
git add -- docs/superpowers/plans/2026-11-26-metodo-fatia-1-registro.md
git commit -m "docs(metodo): ensaio da fatia 1 com Claude Code, Codex e OpenCode"
```

### Task 9: Fechamento da fatia

Nível: leve.

- [ ] **Step 1: Rebase sobre a `dev` atual:** `git -C ~/projetos/agent-harness-p2 rebase dev`.
- [ ] **Step 2: Verificar:** `node ferramentas/verifica.mjs --node "$(mise where node@22)/bin/node" --node "$(command -v node)"`. Esperado: código 0.
- [ ] **Step 3: Registro:** no registro da fatia, o que foi entregue (commits), a saída da verificação, as pendências achadas e não tratadas, com o motivo. Para a fatia 2: o texto da tabela usa `GLOSSARY.md` se a versão fixada do domain-modeling grava esse nome, e não `CONTEXT.md`.
- [ ] **Step 4: Pedir ao autor** a revisão e a ordem de merge na `dev`. Merge local `--no-ff`, só com o ok dele.
