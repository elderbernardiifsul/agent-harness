# Fatias 6 e 7 (wiki e ingestão de reunião): plano de implementação

> **Para agentes que executam:** use a skill `superpowers:subagent-driven-development` (recomendada) ou `superpowers:executing-plans`, tarefa por tarefa. Os passos usam caixas (`- [ ]`) para acompanhar.

**Objetivo:** a extensão `wiki` (`ah wiki conferir`, `ah wiki fontes`, linha no resumo, sugestão no fechamento, aviso do `doctor`) e as skills `wiki-ingerir`, `wiki-consultar`, `wiki-conferir` e `reuniao-ingerir`, ensaiadas com agente real.

**Arquitetura:** a extensão mora em `nucleo/extensoes/wiki/` e tem três módulos pequenos: `evidencia.mjs` (ler um artigo e extrair os literais, sem disco), `fontes.mjs` (o que é fonte, pela configuração) e `extensao.mjs` (comandos, resumo, reação e verificação). O formato do artigo, do índice e do log mora num arquivo só, `nucleo/extensoes/wiki/formato.md`, ao lado do código que o lê; as três skills de wiki apontam para ele na cópia instalada (`.harness/nucleo/extensoes/wiki/formato.md`). As skills ficam em `nucleo/extensoes/metodo/skills/<nome>/`, instaladas pelo `metodo instalar` da fatia 1 quando `wiki` está ligada.

**Pilha:** Node 22 ou mais novo, módulos ES, sem dependências; `node --test`; `teste/apoio/repo.mjs` (`criarProjeto`, `gravar`) para os testes de ponta a ponta.

**Desenho:** `docs/superpowers/specs/2026-11-26-metodo-design.md`, seções 3, 4, 11, 12 e 17 (fatias 6 e 7). Orquestração: `docs/superpowers/plans/2026-11-26-metodo-orquestracao.md`.

## Restrições globais

- Node 22 ou mais novo, módulos ES, sem dependências externas; testes primeiro (ver falhar antes de consertar); nenhum teste usa rede real.
- Este ramo (`p2-wiki`) só edita: `nucleo/extensoes/wiki/**`; as pastas novas `nucleo/extensoes/metodo/skills/wiki-ingerir/`, `wiki-consultar/`, `wiki-conferir/`, `reuniao-ingerir/`; `teste/wiki-*`; a nova seção `wiki` de `docs/referencia/comandos.md`; este plano e o registro dele. O `colecoes.json` é do orquestrador.
- Antes de cada commit: `npm test` verde e `node ferramentas/varre-termos.mjs` com código 0 (código 2: parar e avisar o orquestrador).
- No fim: `node ferramentas/verifica.mjs --node "$(mise where node@22)/bin/node" --node "$(command -v node)"` com código 0.
- "O harness sugere e registra; só as travas recusam": resumo, fechamento e `doctor` só sugerem; a extensão não tem trava.
- Skills dizem o resultado, não a ferramenta (spec, seção 3). O que pede o "sim" do aluno: instalar algo na máquina, criar algo no GitHub, executar código baixado.
- A lista de fontes mora só na seção `wiki` da configuração (spec, seção 11); nenhuma skill a repete.
- Textos em português, para aprendizes, com a dor que cada peça resolve escrita ao lado; exemplos com nomes inventados (a loja, Ana Souza, Carla). Nada do projeto de origem: nem nomes, nem textos, nem exemplos.
- Crédito: a skill de wiki e a conferência são reescrita genérica de `astro-han/karpathy-llm-wiki` (MIT, commit `eafcc77`); a licença MIT de lá vai junto (`LICENSE-karpathy-llm-wiki` na extensão e em cada skill de wiki).
- Cada tarefa traz `Nível: alto|medio|leve` (spec, seção 9).
- Sem push e sem merge. Commits terminam com a linha `Co-Authored-By` do agente.

## Decisões deste plano que o orquestrador confirma

1. **Formato num lugar só, na extensão.** `nucleo/extensoes/wiki/formato.md`, e não dentro de uma das skills: as skills são instaladas cada uma na sua pasta (`.claude/skills/<nome>/`), e um link de uma skill para outra depende da disposição da instalação; a extensão vai sempre inteira para `.harness/nucleo/`, e o código que lê o campo Fontes fica ao lado do texto que o define.
2. **`ah wiki fontes`**, além do `conferir`: lista os arquivos que são fonte segundo a configuração. Assim a skill nunca interpreta os padrões, e a lista continua num lugar só.
3. **Sugestão no fechamento em `antesDeFechar`**, que escreve a sugestão e devolve `null` (nunca recusa). É o último momento em que o ramo da frente existe; em `depoisDeFechar` o ramo já foi apagado. Se o `close` parar depois, a sugestão continua verdadeira.
4. **"Fonte nova desde a última ingestão"** é calculada pelo git, sem estado: fontes mudadas entre o último commit que tocou `<pasta>/log.md` e a ponta (o `HEAD` do checkout principal no resumo; o ramo da frente no fechamento). A frente que ingeriu o que trouxe não recebe sugestão.
5. **Mapa skill → extensão:** `wiki-ingerir`, `wiki-consultar`, `wiki-conferir` e `reuniao-ingerir` → `wiki`. O orquestrador acrescenta ao `colecoes.json` ao integrar. Os ensaios deste ramo copiam as skills à mão para o projeto descartável, porque o `metodo instalar` está sendo construído em paralelo; o registro diz isso.

## Configuração (`extensoes.wiki`)

`true` ou um objeto com qualquer subconjunto de:

| Campo | Padrão | O que é |
|---|---|---|
| `pasta` | `"docs/wiki"` | Pasta da wiki, relativa à raiz; nunca é fonte |
| `fontes` | `["CONTEXT.md", "docs/**"]` | Padrões do que a wiki pode citar |
| `foraDasFontes` | `["docs/agents/**"]` | Padrões que saem das fontes mesmo casando com `fontes` |

Padrões relativos à raiz, com `/`: `**` casa qualquer sequência (inclusive `/`), `*` casa qualquer sequência sem `/`, o resto é literal. Campo desconhecido, ou valor fora da forma (texto não vazio; lista não vazia de textos), recusa a configuração com o motivo. Arquivos conferíveis (texto): `.md`, `.txt`, `.srt`, `.vtt`, `.json`, `.csv`, `.yaml`, `.yml`. A cobertura conta só `.md`.

## Foco da revisão

1. **Artigo com bloco de código** que traz números e datas: nada dentro de ```` ``` ```` ou `~~~` vira candidato, nem o cabeçalho depois de uma cerca. Teste na Task 1.
2. **Link de Fontes com âncora ou com espaço codificado** (`../../adr/0001.md#contexto`, `reuni%C3%A3o.md`): a âncora sai, o caminho é decodificado antes de resolver. Teste na Task 3.
3. **Fonte que não é texto** (`.png`, `.pdf`) ou **link para fora da raiz** (`../../../../fora.md`): erro de evidência, sem ler o arquivo. Teste na Task 3.
4. **Repositório sem commit que tocou o log** (wiki recém-criada, ainda sem commit): o resumo diz que a wiki não tem ingestão registrada, sem lançar. Teste na Task 4.
5. **`ah wiki conferir` chamado dentro do worktree da frente:** confere a wiki e as fontes daquele worktree, não as do checkout principal. Teste na Task 3.

---

### Task 1: ler um artigo e extrair os literais (`evidencia.mjs`)

**Nível:** medio

**Dor:** "respostas plausíveis sem fonte". Para conferir a invariante (todo número, data, horário ou citação existe literalmente numa fonte ligada), primeiro é preciso saber o que, no artigo, é literal de alto sinal; o resto (inteiros pequenos, nomes) fica com a regra "localize antes de escrever".

**Files:**
- Create: `nucleo/extensoes/wiki/evidencia.mjs`
- Test: `teste/wiki-evidencia.test.mjs`

**Interfaces:**
- Produces:
  - `lerArtigo(texto: string) -> {titulo: string|null, cabecalho: string[], corpo: string[]}`: o cabeçalho é só o blockquote contíguo logo depois do primeiro `# ` fora de cerca de código; uma cerca encerra o cabeçalho; linhas dentro de cercas não entram no corpo.
  - `linksDeFontes(texto: string) -> string[]`: os alvos dos links markdown da linha `> Fontes:` do cabeçalho, sem a âncora (`#…`), na ordem; linha igual no corpo não conta.
  - `arquivado(texto: string) -> boolean`: o cabeçalho tem `> Arquivado:`.
  - `candidatos(texto: string) -> {tipo: 'citação'|'data'|'hora'|'número', valor: string}[]`, sem repetição, na ordem em que aparecem.
  - `normalizar(texto: string) -> string`: espaços em sequência viram um; sem espaço nas pontas.
  - `contem(fonte: string, c: {tipo, valor}) -> boolean`: `fonte` já normalizada.

- [ ] **Step 1: Escrever os testes que falham**

```js
test('literais no formato brasileiro e ISO viram candidatos', () => {
  const t = '# Frete\n\n> Fontes: [ADR](../../adr/0001.md)\n> Atualizado: 2026-11-20\n\nFrete grátis acima de R$ 1.234,56 ou 2,5%, desde 01/12/2026, dito aos 0:12:40 e em 2026-11-18.\n';
  assert.deepEqual(candidatos(t).map(c => [c.tipo, c.valor]), [
    ['data', '2026-11-18'], ['data', '01/12/2026'], ['hora', '0:12:40'], ['número', '1.234,56'], ['número', '2,5%'],
  ]);
});
test('inteiros pequenos, metadados do cabeçalho e blocos de status ficam de fora', () => {
  const t = '# A\n\n> Fontes: [x](x.md)\n> Atualizado: 2026-11-20\n\nSão 42 pedidos e 500 itens.\n\n> **Status: Superado** (2026-11-21)\n> Valia 9.999 antes.\n';
  assert.deepEqual(candidatos(t), []);
});
test('citação de 15 ou mais caracteres, entre aspas retas, curvas ou em blockquote do corpo', () => {
  const t = '# A\n\n> Fontes: [x](x.md)\n\nA Carla disse "frete grátis só para o Sul" e “curto”.\n\n> O cliente decide o prazo de entrega.\n';
  assert.deepEqual(candidatos(t).filter(c => c.tipo === 'citação').map(c => c.valor), ['frete grátis só para o Sul', 'O cliente decide o prazo de entrega.']);
});
test('nada dentro de cerca de código vira candidato', () => {
  const t = '# A\n\n> Fontes: [x](x.md)\n\n```\nversão 2026-01-01, 3.500 linhas\n```\n\n~~~\n"uma citação bem comprida aqui"\n~~~\n';
  assert.deepEqual(candidatos(t), []);
});
test('Fontes só vale no cabeçalho; âncora sai do alvo', () => {
  assert.deepEqual(linksDeFontes('# A\n\n> Fontes: [ADR 1](../../adr/0001.md#contexto); [reunião](../../reunioes/r.md)\n'), ['../../adr/0001.md', '../../reunioes/r.md']);
  assert.deepEqual(linksDeFontes('# A\n\nCorpo.\n\n> Fontes: [x](x.md)\n'), []);
});
test('contem: o valor inteiro, sem casar como pedaço de outro', () => {
  const f = normalizar('Fala em 01:58:24. Mês 2026-09-24. Valor 12,5 e 3.140.');
  assert.equal(contem(f, { tipo: 'hora', valor: '58:24' }), false);
  assert.equal(contem(f, { tipo: 'hora', valor: '01:58:24' }), true);
  assert.equal(contem(f, { tipo: 'data', valor: '2026-09' }), false);
  assert.equal(contem(f, { tipo: 'número', valor: '2,5' }), false);
  assert.equal(contem(f, { tipo: 'número', valor: '3.140' }), true);
  assert.equal(contem(normalizar('ele disse  "frete grátis\nsó para o Sul"'), { tipo: 'citação', valor: 'frete grátis só para o Sul' }), true);
});
```

- [ ] **Step 2: Rodar e ver falhar.** `node --test teste/wiki-evidencia.test.mjs` → falha por módulo inexistente.

- [ ] **Step 3: Implementar `evidencia.mjs`.** Reescrita em JavaScript das regras abaixo (as do original MIT, que o comentário do topo credita):
  - remover código em linha (`` `…` ``) e trocar `[texto](alvo)` por `texto` antes de extrair;
  - datas: ISO `\d{4}-\d{2}(-\d{2})?` e brasileiras `\d{1,2}/\d{1,2}(/\d{2,4})?` (sem dígito ou `/` ao lado); horas `\d{1,2}:\d{2}(:\d{2})?` (sem dígito ou `:` ao lado); o trecho achado como data ou hora sai da linha antes da busca de números;
  - números: `\d+([.,]\d+)*` com `%` ou `K|M|B` opcionais, sem letra colada; ficam os que têm separador, sufixo ou 4 ou mais dígitos;
  - citações: o parágrafo juntado numa linha, aspas `"…"` e `“…”` com 15 ou mais caracteres; blockquote do corpo juntado, com 15 ou mais;
  - bloco de status (`> **Status:` e as linhas `>` seguintes) não gera candidato;
  - os valores saem sem a pontuação das pontas (`.,;:()[]`);
  - `contem`: citação, por inclusão do texto normalizado; os demais, por expressão com bordas: antes, nem dígito nem `.`/`,` (para hora, nem `:`); depois, nem letra nem dígito, nem separador seguido de dígito, nem `%`; mês ISO não casa como prefixo de data completa.

- [ ] **Step 4: Rodar e ver passar.** `node --test teste/wiki-evidencia.test.mjs` → 6 testes passam.

- [ ] **Step 5: Commit.**

```bash
git add -- nucleo/extensoes/wiki/evidencia.mjs teste/wiki-evidencia.test.mjs
git commit -m "feat(wiki): leitura do artigo e extração dos literais de alto sinal"
```

### Task 2: o que é fonte (`fontes.mjs`)

**Nível:** leve

**Dor:** na origem, a lista de fontes estava escrita na skill e no script, e as duas divergiam. Aqui ela mora só na configuração, e um módulo só a interpreta.

**Files:**
- Create: `nucleo/extensoes/wiki/fontes.mjs`
- Test: `teste/wiki-fontes.test.mjs`

**Interfaces:**
- Produces:
  - `PADRAO = {pasta: 'docs/wiki', fontes: ['CONTEXT.md', 'docs/**'], foraDasFontes: ['docs/agents/**']}` (congelado).
  - `configDaWiki(config: object) -> {pasta, fontes, foraDasFontes}`: `PADRAO` com os campos dados por cima.
  - `validarConfig(config: object) -> string|null`: a mensagem da recusa, ou `null`.
  - `casa(rel: string, padrao: string) -> boolean`.
  - `ehFonte(rel: string, cfg) -> boolean`: casa algum de `fontes`, nenhum de `foraDasFontes`, e não está em `cfg.pasta`.
  - `CONFERIVEIS: Set<string>` (as extensões da tabela "Configuração").
  - `listarFontes(raiz: string, cfg) -> string[]`: caminhos relativos (com `/`), ordenados, dos arquivos que são fonte; não entra em `.git` nem segue link simbólico.

- [ ] **Step 1: Escrever os testes que falham**

```js
test('casa: ** atravessa pastas, * não', () => {
  assert.equal(casa('docs/adr/0001.md', 'docs/**'), true);
  assert.equal(casa('docs/a/b/c.md', 'docs/*/c.md'), false);
  assert.equal(casa('docs/a/c.md', 'docs/*/c.md'), true);
  assert.equal(casa('CONTEXT.md', 'CONTEXT.md'), true);
  assert.equal(casa('docs/research/extrato-1.md', 'docs/research/extrato-*.md'), true);
});
test('ehFonte: inclusão, exclusão e a pasta da wiki', () => {
  const cfg = configDaWiki({ foraDasFontes: ['docs/agents/**', 'docs/**/rascunho-*.md'] });
  assert.equal(ehFonte('docs/adr/0001.md', cfg), true);
  assert.equal(ehFonte('docs/agents/metodo.md', cfg), false);
  assert.equal(ehFonte('docs/wiki/frete/gratis.md', cfg), false);
  assert.equal(ehFonte('docs/specs/rascunho-x.md', cfg), false);
  assert.equal(ehFonte('README.md', cfg), false);
});
test('validarConfig recusa campo desconhecido e forma errada', () => {
  assert.equal(validarConfig({}), null);
  assert.match(validarConfig({ fonte: [] }), /campo desconhecido: fonte/);
  assert.match(validarConfig({ fontes: [] }), /fontes deve ser uma lista não vazia/);
  assert.match(validarConfig({ pasta: '' }), /pasta deve ser/);
});
test('listarFontes percorre a raiz e devolve só as fontes, ordenadas', t => {
  // pasta temporária com CONTEXT.md, docs/adr/0001.md, docs/agents/x.md, docs/wiki/index.md, README.md, .git/x.md
  // → ['CONTEXT.md', 'docs/adr/0001.md']
});
```

- [ ] **Step 2: Rodar e ver falhar.** `node --test teste/wiki-fontes.test.mjs`.
- [ ] **Step 3: Implementar `fontes.mjs`.** `casa` traduz o padrão para expressão regular (escapar o literal; `**` → `.*`; `*` → `[^/]*`; âncoras `^…$`). Mensagens de `validarConfig`: `campo desconhecido: <c> (valem pasta, fontes e foraDasFontes)`, `pasta deve ser um caminho relativo não vazio, como "docs/wiki"`, `<campo> deve ser uma lista não vazia de padrões, como ["docs/**"]`.
- [ ] **Step 4: Rodar e ver passar.**
- [ ] **Step 5: Commit** (`git add -- nucleo/extensoes/wiki/fontes.mjs teste/wiki-fontes.test.mjs`; `feat(wiki): fontes pela configuração, num lugar só`).

### Task 3: `ah wiki conferir`, `ah wiki fontes` e o aviso do `doctor`

**Nível:** alto

**Dor:** a invariante de evidência só vale se alguém a confere; sem comando, a conferência fica na boa vontade do agente. Em Node, para o projeto não depender de Python.

**Files:**
- Create: `nucleo/extensoes/wiki/extensao.mjs`, `nucleo/extensoes/wiki/conferir.mjs`, `nucleo/extensoes/wiki/LICENSE-karpathy-llm-wiki` (o texto MIT do original, com o copyright de lá)
- Modify: `docs/referencia/comandos.md` (nova seção `wiki`, depois de `recursos`)
- Test: `teste/wiki-conferir.test.mjs`

**Interfaces:**
- Consumes: Task 1 (`lerArtigo`, `linksDeFontes`, `arquivado`, `candidatos`, `normalizar`, `contem`); Task 2 (`configDaWiki`, `validarConfig`, `ehFonte`, `CONFERIVEIS`, `listarFontes`).
- Produces:
  - `conferir(raiz: string, cfg, artigos?: string[]) -> {suspeitos: {artigo, valores: string[]}[], erros: {artigo, erros: string[]}[], cobertura: {grupo, citados, total}[], pendentes: string[], artigos: number}`. `artigo` é o caminho relativo à raiz; sem `artigos`, todos os `.md` da pasta da wiki menos `index.md` e `log.md`.
  - `raizDoTrabalho(ctx) -> string`: `git rev-parse --show-toplevel` em `ctx.cwd` (o worktree da frente, quando chamado de lá), ou `ctx.raiz`.
  - Comando `wiki` da extensão, com `requisitos: {sessao: false}` e uso `ah wiki conferir [--json] [--pendentes] [<artigo>...] | fontes [--json]`.
  - Verificação `{item: 'Evidência da wiki', conferir(ctx)}`.

Regras de `conferir` (as do original, generalizadas):
- Artigo arquivado: não é conferido. Sem `> Fontes:` no cabeçalho: erro `artigo sem campo Fontes`.
- Cada link: decodificado (`decodeURIComponent`) e resolvido a partir da pasta do artigo. Fora da raiz ou não fonte (`ehFonte`): `link fora das fontes: <link>`. Não existe: `link que não resolve: <link>`. Extensão fora de `CONFERIVEIS`: `fonte que não é texto conferível: <link>`.
- Suspeito: candidato que não está (`contem`) em nenhuma fonte válida do artigo.
- Cobertura: grupo = as duas primeiras partes do caminho quando ele tem três ou mais (`docs/adr`), senão o próprio arquivo; conta as fontes `.md`; citada = alvo de algum Fontes, ou registrada no log como `## [AAAA-MM-DD] ingestão | sem material: <caminho>` (o caminho pode vir entre crases e com pontuação no fim).

Saída de texto (o código é 0 com ou sem suspeitos: o relatório é a interface):

```
# Conferência de evidência

## Suspeitos de fidelidade

docs/wiki/frete/gratis.md
- R$ 250,00

## Erros de evidência
(nenhum)

## Cobertura das fontes

| Fonte | Citados | Total |
|---|---|---|
| docs/adr | 1 | 2 |

## Resumo
1 suspeito(s) de fidelidade, 0 erro(s) de evidência, 1 de 2 arquivo(s)-fonte citados
```

Com `--pendentes`, depois da cobertura: `## Fontes ainda não citadas` e uma linha `- <caminho>` por fonte (ou `(nenhuma)`). `--json` imprime o objeto de `conferir`. `ah wiki fontes` imprime uma fonte por linha; `--json`, `{"fontes": [...]}`.

Recusas (código 1, formato comum):

| Recusado | Faça |
|---|---|
| `Não achei a wiki em <pasta> (<raiz>).` | `faça a primeira ingestão com a skill wiki-ingerir, que cria <pasta>/index.md e log.md` |
| `Subcomando desconhecido: <x>` / `Falta o subcomando.` / `Opção desconhecida: <x>` | `use <uso>` |
| `<arg> não é artigo da wiki (fica fora de <pasta>, ou é index.md ou log.md).` | `passe caminhos de artigos, relativos à raiz, como <pasta>/<tema>/<artigo>.md` |

Verificação do `doctor`: sem a pasta da wiki, `ok`; com suspeitos ou erros, `aviso` com detalhe `<n> suspeito(s) de fidelidade e <m> erro(s) de evidência` e conserto `rode tools/ah wiki conferir e julgue cada um com a skill wiki-conferir`; senão, `ok`.

- [ ] **Step 1: Escrever os testes que falham.** Projeto com `criarProjeto()` e `extensoes.wiki = true` (o padrão do `teste/recursos.test.mjs`); arquivos com `gravar`.

```js
test('literal presente passa; literal ausente vira suspeito', t => {
  // docs/adr/0001-frete.md: "Frete grátis acima de R$ 200,00 a partir de 01/12/2026."
  // docs/wiki/frete/gratis.md: Fontes [ADR 0001](../../adr/0001-frete.md); corpo "acima de R$ 200,00 desde 01/12/2026, e R$ 250,00 no Norte."
  // ah wiki conferir --json → suspeitos [{artigo: 'docs/wiki/frete/gratis.md', valores: ['250,00']}], erros []
});
test('fonte que mudou depois do artigo: o literal que sumiu vira suspeito', t => {
  // como acima, sem o "R$ 250,00"; conferir → suspeitos []; commit;
  // a fonte passa a dizer "R$ 150,00"; conferir → valores ['200,00']
});
test('erros de evidência: sem Fontes, fora das fontes, não resolve, não é texto, fora da raiz', t => {
  // links: (outro.md da wiki), (../../agents/x.md), (../../adr/nao-existe.md), (../../adr/fig.png), (../../../../fora.md)
  // → erros na ordem: 'link fora das fontes: outro.md', 'link fora das fontes: ../../agents/x.md',
  //   'link que não resolve: ../../adr/nao-existe.md', 'fonte que não é texto conferível: ../../adr/fig.png',
  //   'link fora das fontes: ../../../../fora.md'; e outro artigo sem Fontes → 'artigo sem campo Fontes'
});
test('âncora e espaço codificado no link de Fontes', t => {
  // fonte docs/reunioes/2026-11-20-frete/ata da reunião.md; link (../../reunioes/2026-11-20-frete/ata%20da%20reuni%C3%A3o.md#decisoes) → sem erro
});
test('cobertura conta sem material do log; --pendentes lista as não citadas', t => {
  // docs/adr/0001.md citado, docs/adr/0002.md em "## [2026-11-20] ingestão | sem material: `docs/adr/0002.md`.", CONTEXT.md não citado
  // texto: linha '| docs/adr | 2 | 2 |', '| CONTEXT.md | 0 | 1 |'; com --pendentes: '- CONTEXT.md'
});
test('no worktree da frente, confere a wiki do worktree', t => {
  // ah open frete; no worktree, um artigo novo com suspeito; ah wiki conferir com cwd no worktree → o suspeito aparece;
  // no checkout principal → (nenhum)
});
test('sem wiki: recusa com o próximo passo; doctor fica ok', t => {
  // ah wiki conferir → código 1, /^Recusado: Não achei a wiki em docs\/wiki/ e /Faça: faça a primeira ingestão com a skill wiki-ingerir/
  // ah doctor → linha /ok\s+Evidência da wiki \(wiki\)/
});
test('doctor avisa quando há suspeitos', t => {
  // com o artigo do primeiro teste → /aviso\s+Evidência da wiki \(wiki\): 1 suspeito\(s\) de fidelidade e 0 erro\(s\) de evidência; rode tools\/ah wiki conferir/
});
test('ah wiki fontes lista pela configuração; configuração errada não carrega', t => {
  // extensoes.wiki = {foraDasFontes: ['docs/agents/**', 'docs/rascunhos/**']} → fontes sem docs/rascunhos/a.md
  // extensoes.wiki = {fonte: []} → ah doctor: /FALHOU\s+Extensão wiki: .*campo desconhecido: fonte/
});
```

- [ ] **Step 2: Rodar e ver falhar.** `node --test teste/wiki-conferir.test.mjs`.
- [ ] **Step 3: Implementar `conferir.mjs` e `extensao.mjs`.** `extensao.mjs` começa por um comentário curto com a dor, o que a extensão faz e o crédito ao original MIT; a ajuda (`descricao`) é `confere a evidência da wiki e lista as fontes`. A leitura das fontes usa `fs.readFileSync(…, 'utf8')` e `normalizar`; cada fonte é lida uma vez por execução.
- [ ] **Step 4: Rodar e ver passar.**
- [ ] **Step 5: Seção `wiki` em `docs/referencia/comandos.md`.** Uso, configuração (a tabela acima), as regras do `conferir` em poucas linhas, a saída de exemplo, a tabela de recusas, o item do `doctor`; e as linhas do resumo e do fechamento quando a Task 4 entrar.
- [ ] **Step 6: `npm test` e `node ferramentas/varre-termos.mjs`**, depois commit:

```bash
git add -- nucleo/extensoes/wiki teste/wiki-conferir.test.mjs docs/referencia/comandos.md
git commit -m "feat(wiki): ah wiki conferir e ah wiki fontes, com o aviso do doctor"
```

### Task 4: a linha do resumo e a sugestão no fechamento

**Nível:** medio

**Dor:** a wiki que ninguém lembra de alimentar envelhece calada. O harness lembra no começo da sessão e no fechamento da frente, sem recusar nada.

**Files:**
- Create: `nucleo/extensoes/wiki/novidades.mjs`
- Modify: `nucleo/extensoes/wiki/extensao.mjs` (`resumo`, `reacoes.antesDeFechar`), `docs/referencia/comandos.md` (seção `wiki`)
- Test: `teste/wiki-ciclo.test.mjs`

**Interfaces:**
- Consumes: `ehFonte`, `CONFERIVEIS`, `configDaWiki` (Task 2); a contagem de artigos de `conferir` não é necessária: contar os `.md` da pasta menos `index.md` e `log.md`.
- Produces:
  - `fontesNovas(git: (args) => {codigo, saida}, ref: string, cfg) -> string[] | null`: `null` quando nenhum commit até `ref` tocou `<pasta>/log.md`; senão, as fontes (por `ehFonte`, extensão conferível) em `git diff --name-only <último commit do log> <ref>`, ordenadas.
  - `resumo(ctx)`: uma linha.
  - `reacoes.antesDeFechar(ctx)`: escreve a sugestão com `ctx.escrever` e devolve `null`; nada faz com `ctx.aberturaDesfeita`.

Textos fixados (até três caminhos; mais que isso, `, …`):

| Situação | Linha |
|---|---|
| Sem a pasta da wiki | `Wiki: ainda vazia; a primeira ingestão (skill wiki-ingerir) cria docs/wiki/.` |
| Pasta sem log commitado | `Wiki: <n> artigo(s); nenhuma ingestão registrada no git ainda (commite docs/wiki/log.md).` |
| Nada novo | `Wiki: <n> artigo(s); nenhuma fonte nova desde a última ingestão.` |
| Fontes novas | `Wiki: <n> artigo(s); <k> fonte(s) nova(s) desde a última ingestão (<caminhos>): skill wiki-ingerir.` |
| Fechamento com fontes novas no ramo | `Wiki: a frente mudou fonte(s) sem ingestão (<caminhos>). Sugestão: ingira com a skill wiki-ingerir antes de começar outra coisa.` |

(Com `pasta` diferente na configuração, os textos usam a pasta configurada.)

- [ ] **Step 1: Escrever os testes que falham.**

```js
test('resumo: wiki vazia, sem log commitado, nada novo e fontes novas', async t => {
  // pelo tratar({tipo: 'inicio', …}) como em teste/extensoes.test.mjs ('resumo do começo de sessão…'):
  // sem docs/wiki → /^Wiki: ainda vazia; a primeira ingestão \(skill wiki-ingerir\) cria docs\/wiki\/\.$/m
  // docs/wiki/frete/gratis.md e log.md sem commit → /nenhuma ingestão registrada no git ainda/
  // commit do log → /^Wiki: 1 artigo\(s\); nenhuma fonte nova desde a última ingestão\.$/m
  // commit de docs/adr/0002-cupom.md e docs/agents/x.md → /1 fonte\(s\) nova\(s\) desde a última ingestão \(docs\/adr\/0002-cupom\.md\): skill wiki-ingerir\./
});
test('close sugere a ingestão quando a frente trouxe fonte e não ingeriu', t => {
  // ah open cupom; no worktree, commit de docs/adr/0002-cupom.md; merge na dev; ah close
  // → código 0, saída /^Wiki: a frente mudou fonte\(s\) sem ingestão \(docs\/adr\/0002-cupom\.md\)\. Sugestão: ingira/m
});
test('close não sugere quando a frente ingeriu o que trouxe', t => {
  // como acima, mas o worktree também commita docs/wiki/cupom/regras.md e uma entrada no log depois da ADR
  // → saída sem /^Wiki:/m
});
test('a reação nunca recusa, nem com o git falhando', async () => {
  // carregarParaTeste + ctxFalso({frente: {nome: 'cupom', ramo: 'feat/cupom'}, git: () => ({codigo: 128, saida: '', erro: 'x'})})
  // → antesDeFechar devolve null e ctx.saida fica []
});
```

- [ ] **Step 2: Rodar e ver falhar.** `node --test teste/wiki-ciclo.test.mjs`.
- [ ] **Step 3: Implementar `novidades.mjs` e ligar `resumo` e `antesDeFechar`.** No resumo, `ref` é `HEAD` e o git roda em `ctx.raiz`; no fechamento, `ref` é `ctx.frente.ramo`. Qualquer falha do git vira silêncio (sem linha no fechamento; no resumo, a linha sem a parte das fontes).
- [ ] **Step 4: Rodar e ver passar; acrescentar as linhas à seção `wiki` do `comandos.md`.**
- [ ] **Step 5: `npm test`, varredura e commit** (`feat(wiki): lembrete no começo da sessão e sugestão no fechamento`).

### Task 5: as skills de wiki e o formato

**Nível:** alto

**Dor:** conhecimento do projeto espalhado e respostas plausíveis sem fonte. As skills são o roteiro do agente; o formato, o contrato entre as skills e o `ah wiki conferir`.

**Files:**
- Create: `nucleo/extensoes/wiki/formato.md`
- Create: `nucleo/extensoes/metodo/skills/wiki-ingerir/SKILL.md`, `…/wiki-consultar/SKILL.md`, `…/wiki-conferir/SKILL.md`, e `LICENSE-karpathy-llm-wiki` em cada uma das três pastas
- Test: `teste/wiki-skills.test.mjs`

**Interfaces:**
- Consumes: os comandos da Task 3 e as linhas da Task 4 (as skills citam `tools/ah wiki conferir`, `tools/ah wiki fontes` e o lembrete).
- Produces: as quatro pastas de skill que o orquestrador mapeia para `wiki` no `colecoes.json` (a quarta vem na Task 6).

Conteúdo de `formato.md` (o único lugar): estrutura (`<pasta>/<tema>/<artigo>.md`, um nível de tema, `index.md`, `log.md` só acrescenta); modelo de artigo (título; cabeçalho `> Fontes:` com links relativos separados por `;`, o texto do link dizendo o quê e de quando; `> Atualizado: AAAA-MM-DD`, data da última mudança de conhecimento; Visão geral; seções próprias; blocos `> **Status: Superado** (AAAA-MM-DD)` e `> **Status: Contestado**`; Veja também); modelo de página arquivada (`> Arquivado:`, nunca atualizada em cascata); modelo do índice (tabela por tema com Artigo, Resumo, Atualizado; `[Arquivado]` e `[AUSENTE]`); as entradas do log (`ingestão`, `ingestão | sem material: <caminho>`, que o `conferir` lê, `mover`, `consulta | Arquivado:`, `lint | <N> problemas, <M> corrigidos`); o que conta como literal de alto sinal (a lista da Task 1) e a regra "escreva como está na fonte; valor derivado mostra os componentes"; o exemplo é da loja (frete e cupom), com Ana Souza e Carla.

Cada `SKILL.md` tem frontmatter `name` (igual ao nome da pasta) e `description` com os gatilhos; a primeira seção diz a dor e aponta para o formato e para a configuração; o crédito ("reescrita genérica de astro-han/karpathy-llm-wiki, MIT, commit eafcc77; licença em LICENSE-karpathy-llm-wiki") fica no fim.

- **`wiki-ingerir`** (gatilhos: ingerir, adicionar à wiki, mover artigo): fontes lidas no lugar e nunca editadas (o que é fonte: `tools/ah wiki fontes`); fonte externa entra no repositório antes, com o "sim" do aluno; inicialização só na primeira ingestão; triagem (Novo, Atualização, Contestado, Sem material); compilação com localizar antes de escrever; decisão prevalece (ADR, decisão em ticket e verbete do glossário valem sobre documentos anteriores; a wiki marca a divergência e aponta quem decide); cascata; índice e log; lote só a pedido, uma fonte por vez, do que decide para o que é histórico; mover artigo (`git mv`, links, índice, Atualizado não muda, log); termina com `tools/ah wiki conferir <artigos tocados>` e nenhum suspeito sem explicação.
- **`wiki-consultar`** (gatilhos: o que a wiki diz, o que sabemos sobre): índice e busca com sinônimos antes de dizer que não há; a wiki antes do conhecimento prévio; citação com links a partir da raiz; quando só uma fonte cobre, dizer qual e oferecer a ingestão; não escreve nada, salvo arquivamento a pedido (página nova, nunca incorporada).
- **`wiki-conferir`** (gatilhos: lint da wiki, conferir a wiki, o doctor avisou): `tools/ah wiki conferir --pendentes`; correções seguras (índice, links internos, links de Fontes que mudaram de lugar, Veja também); relatórios mecânicos sem correção automática de fato (suspeitos são candidatos, julgados contra a fonte); relatórios de julgamento; entrada `lint` no log.

- [ ] **Step 1: Escrever os testes que falham.**

```js
const SKILLS = ['wiki-ingerir', 'wiki-consultar', 'wiki-conferir'];
test('cada skill tem frontmatter com o nome da pasta e descrição', () => { /* name === pasta; description com 40+ caracteres */ });
test('as três apontam para o formato, que existe, e nenhuma repete o formato', () => {
  // cada SKILL.md contém '.harness/nucleo/extensoes/wiki/formato.md'; formato.md existe;
  // nenhuma SKILL.md contém '| Artigo | Resumo | Atualizado |' (o modelo do índice só no formato)
});
test('nenhuma skill repete a lista de fontes', () => {
  // nenhuma contém um padrão de PADRAO.fontes nem de PADRAO.foraDasFontes ('docs/**', 'docs/agents/**');
  // todas citam 'tools/ah wiki fontes' ou 'extensoes.wiki'
});
test('crédito e licença do original MIT em cada skill de wiki e na extensão', () => {
  // SKILL.md contém 'astro-han/karpathy-llm-wiki'; LICENSE-karpathy-llm-wiki começa por 'MIT License' (nas três e em nucleo/extensoes/wiki/)
});
test('a entrada sem material do formato é a que o conferir lê', () => {
  // o exemplo de entrada "sem material" de formato.md, gravado num log de teste, conta como citado na cobertura de conferir()
});
```

- [ ] **Step 2: Rodar e ver falhar.** `node --test teste/wiki-skills.test.mjs`.
- [ ] **Step 3: Escrever `formato.md` e as três `SKILL.md`; copiar a licença.** Texto curto, imperativo, em português; sem nada do projeto de origem.
- [ ] **Step 4: Rodar e ver passar; `npm test` e varredura.**
- [ ] **Step 5: Commit** (`feat(wiki): skills de ingestão, consulta e conferência, com o formato num lugar só`).

### Task 6: a skill `reuniao-ingerir`

**Nível:** alto

**Dor:** reunião com o cliente que vira só lembrança; e, quando vira texto, fato misturado com hipótese, falante trocado e número completado de cabeça.

**Files:**
- Create: `nucleo/extensoes/metodo/skills/reuniao-ingerir/SKILL.md`
- Test: `teste/wiki-skills.test.mjs` (acrescentar)

**Interfaces:**
- Consumes: a skill `wiki-ingerir` e `tools/ah wiki conferir` (Tasks 3 e 5).

O que a skill diz (resultado, não ferramenta):
- **Entradas:** gravação com vídeo e áudio, ou só áudio; uma transcrição exportada da plataforma, quando houver, é leitura a mais.
- **Antes de tudo:** perguntar se a gravação entra no repositório (o padrão é não entrar; o README diz onde ela está); lembrar o consentimento dos participantes; propor a pasta `docs/reunioes/<AAAA-MM-DD>-<assunto>/` e esperar a confirmação.
- **Ferramentas:** o agente confere o que a máquina tem para extrair áudio, transcrever com o instante de cada fala e, com vídeo, ler a faixa de legenda e tirar capturas; instala o que faltar conforme o ambiente só depois do "sim" do aluno, dizendo o que vai instalar e onde; pode trocar por equivalente. Sem como lidar com vídeo, segue só com o áudio e diz no README o que deixou de fazer.
- **Leituras do áudio:** quando há mais de uma (transcrição da plataforma, legenda embutida, reconhecimento local), todas no mesmo eixo de tempo `[H:MM:SS]`, conferido numa fala que aparece em duas delas; a divergência entre leituras se resolve ouvindo o trecho, e o que não se resolve vai com `(?)`.
- **O que sai:** `README.md` (fontes, leituras usadas, eixo de tempo, participantes, o que é incerto, cuidados); `transcricao.md` com o instante de cada fala, falante quando a fonte traz e `(inferido)` quando o agente atribui pelo contexto; `blocos/bloco-NN.md`, de cerca de 10 minutos cortados por assunto, cada fato com `[H:MM:SS]`, separando o que foi dito, o que a tela mostrou e o que é hipótese; com vídeo, `capturas/` no instante dos fatos que dependem da tela, com o nome começando pelo instante; `sobras.md` com o que o agente não decidiu, para o humano; depois, a ingestão dos fatos pela `wiki-ingerir`, com a pasta da reunião como fonte, e `tools/ah wiki conferir` nos artigos tocados.
- **Invariantes:** nada completado de cabeça; resumo automático da plataforma não é fonte; dado sensível dito em voz alta (senha, documento pessoal) sai das transcrições com a marca do corte; conversa pessoal fica de fora; o arquivo de áudio ou vídeo nunca é fonte da wiki (a wiki cita os `.md` da pasta).

- [ ] **Step 1: Escrever os testes que falham.**

```js
test('reuniao-ingerir: frontmatter, saídas e a passagem para a wiki', () => {
  // name 'reuniao-ingerir'; contém 'sobras.md', '[H:MM:SS]', 'wiki-ingerir', '(inferido)', 'docs/reunioes/'
});
test('reuniao-ingerir diz o resultado, não a ferramenta', () => {
  // não contém /ffmpeg|whisper|piper|vosk|yt-dlp|apt |brew |pip install/i; contém 'sim' do aluno antes de instalar
});
```

- [ ] **Step 2: Rodar e ver falhar.** 
- [ ] **Step 3: Escrever a `SKILL.md`.**
- [ ] **Step 4: Rodar e ver passar; `npm test` e varredura.**
- [ ] **Step 5: Commit** (`feat(wiki): skill de ingestão de reunião, do áudio aos fatos na wiki`).

### Task 7: ensaio da wiki com agente real

**Nível:** alto

**Pronto (spec, seção 17):** um agente ingere um documento de exemplo, consulta e confere.

**Files:**
- Create: `docs/superpowers/plans/2026-11-26-metodo-fatias-6-e-7-registro.md` (registro de execução das duas fatias; este ensaio é a primeira seção de ensaio)

- [ ] **Step 1: Laboratório isolado.** `LAB=$(mktemp -d)`; `HOME=$LAB/home`, `CLAUDE_CONFIG_DIR=$LAB/home/.claude`, `AH_ESTADO`, `AH_WORKTREES`, `AH_FILA` dentro de `$LAB`. Projeto `$LAB/loja` com o harness deste worktree (`node <worktree>/nucleo/bin/ah.mjs init --sigla as --sem-protecao`), `"wiki": true` em `extensoes`, e as três skills de wiki copiadas à mão para `.claude/skills/` (o `metodo instalar` é de outro ramo; registrar). Sem plugins, sem skills de usuário, sem `CLAUDE.md` global: conferir com `ls $CLAUDE_CONFIG_DIR` antes e depois.
- [ ] **Step 2: Credencial.** Ler o prazo do token em `~/.claude/.credentials.json` (campo de expiração, sem imprimir o token) e registrar; copiar para `$CLAUDE_CONFIG_DIR/.credentials.json` com `0600`. Depois do ensaio, conferir que o Claude Code da máquina continua autenticado (`claude -p "responda ok"` no ambiente normal); se não continuar, parar e avisar o orquestrador.
- [ ] **Step 3: Documentos de exemplo inventados.** Na `dev` do projeto: `docs/adr/0001-frete-gratis.md` (a loja; Ana Souza decide frete grátis acima de R$ 200,00 a partir de 01/12/2026, só Sul e Sudeste) e `docs/reunioes/2026-11-20-cupom/ata.md` (Carla propõe cupom de 10% e um frete de R$ 15,90 para o Norte, que a ADR contraria). Commit.
- [ ] **Step 4: Três sessões de `claude -p`**, cada uma nova, com `--permission-mode acceptEdits` e ferramentas `Bash Read Write Edit Glob Grep`: (a) "ingira docs/adr/0001-frete-gratis.md e docs/reunioes/2026-11-20-cupom/ata.md na wiki"; (b) "o que a wiki diz sobre frete para o Norte?"; (c) "confira a wiki". Guardar as saídas em `$LAB/saidas/`.
- [ ] **Step 5: Conferir e registrar.** A ingestão criou `docs/wiki/index.md`, `log.md` e artigos no formato; a divergência Norte aparece marcada (decisão prevalece); a consulta cita artigos da wiki com links; `tools/ah wiki conferir` no fim sem suspeitos não explicados. No registro: versão do agente (`claude --version`), como o isolamento foi montado, os comandos, trechos das saídas, o que passou e o que falhou. Falha de texto de skill vira conserto na Task 5 (com teste, se couber) e novo ensaio.
- [ ] **Step 6: Commit do registro** (`docs(wiki): registro do ensaio da wiki`). O laboratório fica fora do repositório; a credencial copiada é apagada (`rm $CLAUDE_CONFIG_DIR/.credentials.json`) e o registro diz que foi.

### Task 8: ensaio da reunião com gravação inventada

**Nível:** alto

**Pronto (spec, seção 17):** com uma gravação de exemplo inventada (só áudio e com vídeo), a pasta da reunião sai como a seção 12 pede, com os fatos ingeridos na wiki; o caminho "falta ferramenta" passa pela oferta de instalação.

- [ ] **Step 1: Roteiro inventado.** Uma reunião da loja de cerca de 12 minutos (para haver dois blocos), com Ana Souza e Carla: cupom de 10% acima de R$ 150,00, prazo de troca de 30 dias, uma data (05/12/2026) e uma dúvida deixada em aberto. Guardado em `$LAB/roteiro/`, fora do repositório.
- [ ] **Step 2: Gravação.** Voz sintetizada com uma ferramenta instalada dentro de `$LAB` (a máquina não tem síntese de voz; o que for instalado fica no registro); só áudio (`reuniao.m4a`) e com vídeo (`reuniao.mp4`: telas com texto nos instantes dos fatos de tela e uma faixa de legenda com o falante). As ferramentas de áudio e vídeo da máquina podem ser usadas.
- [ ] **Step 3: Caminho "falta ferramenta" primeiro.** Projeto descartável como na Task 7, com as quatro skills, sem ferramenta de reconhecimento de fala no `PATH` da sessão. `claude -p` com "ingira a reunião em $LAB/grav/reuniao.m4a", sem autorização para instalar. Passa quando a resposta diz o que falta, propõe o que instalar e onde, e para à espera do "sim" sem instalar nada (conferir que nada foi instalado).
- [ ] **Step 4: Só áudio, com o "sim".** Nova sessão, com o "sim" no pedido ("pode instalar o que precisar dentro de $LAB/ferramentas"; a gravação não entra no repositório). Conferir: `docs/reunioes/<data>-<assunto>/` com README (fontes, leituras, eixo, participantes, incertezas), transcrição com instantes e falante `(inferido)`, blocos com `[H:MM:SS]`, `sobras.md`, artigos na wiki com a pasta como fonte, `tools/ah wiki conferir` sem suspeitos não explicados; a dúvida em aberto está em `sobras.md`.
- [ ] **Step 5: Com vídeo.** Nova sessão sobre `reuniao.mp4`. Conferir, além do passo anterior: capturas nos instantes dos fatos de tela e o uso da faixa de legenda para o falante (falante deixa de ser inferido onde a legenda o traz).
- [ ] **Step 6: Registrar e commitar** (seção de ensaio da reunião no registro, com versões, isolamento, o que foi instalado e onde, saídas e falhas). Falha de texto vira conserto na Task 6 e novo ensaio. Credencial apagada no fim.

### Task 9: fechamento

**Nível:** leve

- [ ] **Step 1:** `node ferramentas/verifica.mjs --node "$(mise where node@22)/bin/node" --node "$(command -v node)"` com código 0; saída no registro.
- [ ] **Step 2:** revisão do diff do ramo contra `p2-metodo` (`git diff p2-metodo...p2-wiki --stat` e leitura): só os caminhos permitidos; nenhum nome do projeto de origem.
- [ ] **Step 3:** pendências encontradas e não tratadas, com o motivo, no registro; commit.
- [ ] **Step 4:** mensagem ao orquestrador com o ramo, os commits, a saída do `verifica.mjs`, o mapa skill → extensão para o `colecoes.json` e as pendências.
