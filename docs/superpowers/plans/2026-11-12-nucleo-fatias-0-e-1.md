# Núcleo do agent-harness, fatias 0 e 1: plano de implementação

> **Para quem executa (agente):** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendada) ou superpowers:executing-plans para implementar este plano tarefa a tarefa. Os passos usam caixas (`- [ ]`) para acompanhamento.

**Objetivo:** entregar a sondagem dos três agentes (fatia 0) e um harness utilizável por uma pessoa com uma sessão do Claude Code (fatia 1): `init`, `doctor`, `whoami`, `open`, `nota`, `close`, `board`, travas T2 e T5, proteção de ramo e CI.

**Arquitetura:** um executável Node (`nucleo/bin/ah.mjs`) despacha para um módulo por comando; a lógica mora em módulos pequenos e puros em `nucleo/lib/`; o adaptador do agente só traduz JSON. O estado fica fora do git; o projeto que recebe o harness ganha uma cópia em `.harness/nucleo/` e um ponto de entrada `tools/ah` que sempre executa a cópia do checkout principal.

**Tecnologia:** Node 22+, módulos ES, sem dependências, `node:test`, `git`, `gh`.

**Desenho:** `docs/superpowers/specs/2026-11-12-nucleo-design.md` (ler inteiro; a seção 12 prevalece sobre as anteriores).

## Restrições globais

- Node 22 ou mais novo; nenhuma dependência em `package.json`; só módulos ES (`.mjs`).
- Textos, mensagens, nomes de arquivo e de função em português; nomes de comando em inglês como no desenho.
- Nenhum nome real do projeto de origem em arquivo, teste, exemplo ou mensagem de commit. Exemplos usam o projeto fictício `loja`, o repositório `exemplo/loja`, a pessoa `ana-souza` (sigla `as`) e tickets `#1` a `#9`. O caminho do original está em `~/.config/agent-harness/origem.md` e nunca é copiado para o repositório.
- Nada de `git push`, criação de repositório remoto ou publicação. Todo o trabalho é local, no ramo `dev` de `~/projetos/agent-harness`.
- Toda recusa (de trava ou de comando) sai no formato de `nucleo/lib/recusa.mjs`: motivo em uma linha e o próximo passo concreto.
- Testes rodam com `node --test teste/` e passam em Linux, macOS e Windows: usar `node:path` e `node:os`, nunca `/tmp` nem `/` fixos; chamar `git` e `gh` com `execFile`, nunca por shell.
- Estado de teste sempre em diretório temporário, por `AH_ESTADO`; nenhum teste toca o estado real da máquina.
- Commits pequenos, um por tarefa no mínimo, com `git add` por caminho.
- Auxiliares de teste citados nos testes e não descritos nas interfaces (`ler`, `gravar`, `escreverConfig`, `lerFrenteDoTeste`, `dirDoTeste`, `amb`, `gravado`, `ganchoPre`) são funções curtas de `teste/apoio/repo.mjs`, criadas pela tarefa que primeiro as usa.

## Foco da revisão

1. Caminho com espaço ou acento (pasta de usuário do Windows): `open` e `close` funcionam com o estado e os worktrees em `…/João Silva/…`. Teste na tarefa 10.
2. `ah` chamado fora de repositório git, ou num projeto sem `.harness/`: recusa com próximo passo, sem pilha de erro. Teste na tarefa 8.
3. Arquivo de estado corrompido (JSON pela metade): os comandos dizem qual arquivo e mandam rodar `ah doctor`; o `doctor` acusa. Testes nas tarefas 4 e 14.
4. Comando disfarçado por envoltório: `git -C <dir> push`, `env X=1 git push`, `command git push`, `sudo git push`. Teste na tarefa 7.
5. Sem remoto, sem `gh` autenticado ou sem rede: `init`, `open` e `close` seguem com aviso; só o que depende do GitHub é pulado. Testes nas tarefas 9, 10 e 11.

## Mapa de arquivos

```
package.json  LICENSE  README.md  .gitattributes  .github/workflows/ci.yml
nucleo/
  versao.mjs                 VERSAO
  bin/ah.mjs                 despacho de comandos
  lib/caminhos.mjs           checkout principal, diretórios de estado e de worktrees
  lib/config.mjs             padrões, leitura e validação
  lib/estado.mjs             JSON atômico, trava por diretório, eventos
  lib/sessao.mjs             id e registro da sessão
  lib/frente.mjs             ID, sigla, nome, linha do histórico
  lib/git.mjs                chamadas ao git
  lib/github.mjs             chamadas ao gh
  lib/shell.mjs              texto de shell -> comandos simples
  lib/recusa.mjs             formato da recusa
  lib/travas.mjs             T2 e T5
  lib/resumo.mjs             resumo do começo da sessão
  comandos/{init,doctor,whoami,open,nota,close,board,gancho}.mjs
  adaptadores/contrato.mjs   os quatro eventos
  adaptadores/claude-code.mjs
modelos/
  ah  ah.cmd  config.json  sessoes-paralelas.md  historico-das-frentes.md
  claude-code/ganchos.json  ci/ah-ci.yml
ferramentas/varre-termos.mjs
teste/apoio/{repo,gh-falso}.mjs   teste/*.test.mjs
docs/referencia/{capacidades-por-agente,comandos,ensaio-claude-code}.md
```

---

### Tarefa 1: Sondagem dos três agentes (fatia 0)

Tarefa de pesquisa, sem código de produto. Fonte: documentação oficial de cada agente (acima de exemplos e de memória) e um ensaio mínimo em repositório descartável.

**Arquivos:**
- Criar: `docs/referencia/capacidades-por-agente.md`

**Interfaces:**
- Produz: a tabela que a tarefa 12 (Claude Code) e as fatias 2 e 4 consultam.

- [ ] **Passo 1:** Para Claude Code, Codex e OpenCode, levantar na documentação oficial, com endereço e data da consulta: (a) evento antes de executar comando de shell e formato de entrada; (b) evento antes de editar arquivo e nomes das ferramentas de edição; (c) como recusar e como a mensagem chega ao modelo; (d) evento de começo de sessão, se informa continuação (limpar, compactar, retomar) e como injetar contexto; (e) evento por interação e de fim de sessão; (f) como o processo do gancho e os comandos de shell recebem o id da sessão; (g) se informa o modelo em uso; (h) onde fica o arquivo de ganchos do projeto; (i) modo sem interface para ensaio.
- [ ] **Passo 2:** Para cada agente instalado na máquina, num repositório descartável em diretório temporário, instalar um gancho que grava o JSON recebido num arquivo e recusa `git push`; rodar o agente sem interface pedindo `git push`; guardar o JSON recebido (sem dados pessoais) e o resultado. Registrar a versão do agente.
- [ ] **Passo 3:** Levantar na documentação oficial do GitHub: em que tipos de conta e de repositório a proteção de ramo está disponível, e a chamada de API que a configura.
- [ ] **Passo 4:** Escrever `capacidades-por-agente.md`: uma tabela (linhas a–i, uma coluna por agente, cada célula "sim / não / parcial" com a fonte), a seção do GitHub e uma lista "o que não fica coberto em cada agente".
- [ ] **Passo 5:** Conferir a tabela contra as premissas da tarefa 12 (bloco "Premissas"). Se alguma for falsa, parar e relatar antes de seguir.
- [ ] **Passo 6:** Commit: `git add docs/referencia/capacidades-por-agente.md && git commit -m "docs: capacidades por agente (sondagem)"`

### Tarefa 2: Esqueleto, CI e varredura de anonimização

**Arquivos:**
- Criar: `package.json`, `LICENSE` (MIT, autor elderbernardi), `README.md` (um parágrafo e o aviso "em construção"), `.gitattributes`, `.github/workflows/ci.yml`, `nucleo/versao.mjs`, `ferramentas/varre-termos.mjs`, `teste/apoio/repo.mjs`, `teste/varre-termos.test.mjs`, `teste/apoio.test.mjs`

**Interfaces:**
- Produz:
  - `VERSAO = '0.1.0'` em `nucleo/versao.mjs`.
  - `criarRepo({ramos = ['main','dev','stage'], remoto = true, sufixo = ''}) -> {raiz, remoto, estado, env, git(args, {cwd}) -> {codigo, saida, erro}, limpar()}`: repositório em diretório temporário (o `sufixo` entra no nome da pasta), com um commit inicial, os ramos pedidos, `dev` em uso, um remoto local "bare" chamado `origin` quando `remoto`, e `env` com `AH_ESTADO` apontando para outra pasta temporária, `AH_SESSAO='sessao-teste-0001'` e identidade do git fictícia.
  - `varrer({raiz, termos}) -> Array<{onde, linha, termo}>` e a linha de comando `node ferramentas/varre-termos.mjs [--lista <arquivo>]` (padrão `~/.config/agent-harness/termos-proibidos.txt`): varre os arquivos versionados e o texto de `git log -p --all`, sem diferenciar maiúsculas; sai com 0 sem achados, 1 com achados, 2 se a lista não existe.

- [ ] **Passo 1:** No repositório, criar o ramo de trabalho: `git switch -c dev` e `git branch stage main`.
- [ ] **Passo 2:** Escrever os testes.

```js
// teste/apoio.test.mjs
test('criarRepo entrega ramos e remoto', () => {
  const r = criarRepo();
  assert.equal(r.git(['branch', '--show-current']).saida.trim(), 'dev');
  assert.match(r.git(['branch', '--list']).saida, /stage/);
  assert.match(r.git(['remote']).saida, /origin/);
  assert.ok(r.env.AH_ESTADO && r.env.AH_ESTADO !== r.raiz);
  r.limpar();
});
// teste/varre-termos.test.mjs
test('acha termo em arquivo e em commit antigo, sem diferenciar maiúsculas', () => {
  const r = criarRepo({ remoto: false });
  // commit 1 cria a.txt com "Fulano"; commit 2 apaga a.txt; b.txt atual contém "SEGREDO"
  const achados = varrer({ raiz: r.raiz, termos: ['fulano', 'segredo'] });
  assert.deepEqual(achados.map(a => a.termo).sort(), ['fulano', 'segredo']);
});
test('sem lista sai com código 2', () => { /* executa o script com --lista inexistente; assert codigo === 2 */ });
```

- [ ] **Passo 3:** Rodar `node --test teste/` e ver falhar por módulo inexistente.
- [ ] **Passo 4:** Implementar. `package.json`: `"type":"module"`, `"engines":{"node":">=22"}`, `"scripts":{"test":"node --test teste/"}`, sem dependências. `.gitattributes`: `* text=auto eol=lf` e `*.cmd text eol=crlf`. `ci.yml`: matriz `ubuntu-latest`, `windows-latest`, `macos-latest`, Node 22, passo `npm test`, em `push` e `pull_request`.
- [ ] **Passo 5:** Rodar `node --test teste/`. Esperado: todos passam.
- [ ] **Passo 6:** Montar a primeira versão de `~/.config/agent-harness/termos-proibidos.txt` (fora do repositório) a partir de `~/.config/agent-harness/origem.md`: nomes de cliente, produto, sistemas de terceiros, pessoas, bases, domínios e caminhos locais do projeto de origem, um por linha. Rodar `node ferramentas/varre-termos.mjs`. Esperado: código 0. O autor revisa a lista depois.
- [ ] **Passo 7:** Commit com os caminhos criados: `chore: esqueleto, CI e varredura de anonimização`.

### Tarefa 3: Caminhos e configuração

**Arquivos:**
- Criar: `nucleo/lib/caminhos.mjs`, `nucleo/lib/config.mjs`, `modelos/config.json`, `teste/caminhos.test.mjs`, `teste/config.test.mjs`

**Interfaces:**
- Produz:
  - `raizPrincipal(cwd) -> string`: primeira entrada de `git worktree list --porcelain`; lança `ErroDeUso` (com `.saida`) fora de repositório.
  - `baseDeEstado(env, plataforma, casa) -> string`: `env.AH_ESTADO` se houver; Linux `XDG_STATE_HOME` ou `~/.local/state`, mais `agent-harness`; macOS `~/Library/Application Support/agent-harness`; Windows `%LOCALAPPDATA%\agent-harness\estado`.
  - `dirEstado(projeto, env, plataforma, casa) -> string`: `baseDeEstado/<projeto>`. `arquivoDaMaquina(...)`: `baseDeEstado/maquina.json`.
  - `dirWorktrees(config, env, plataforma, casa) -> string`: `config.worktrees.dir` se houver; `env.AH_WORKTREES` se houver; senão a pasta de cache do sistema (`XDG_CACHE_HOME` ou `~/.cache`; `~/Library/Caches`; `%LOCALAPPDATA%`), mais `agent-harness/<projeto>/wt`.
  - `PADROES`, `validarConfig(obj) -> {ok, erros: Array<{campo, motivo}>}`, `carregarConfig(raiz) -> Config` (lê `<raiz>/.harness/config.json`, aplica padrões; lança `ErroDeConfig` com `.erros`).
  - Forma da `Config` e padrões:

```json
{ "versaoDoEsquema": 1, "harnessMinimo": "0.1.0", "projeto": "<obrigatório, /^[a-z0-9][a-z0-9-]*$/>",
  "git": { "base": "dev", "prefixo": "feat/", "protegidos": ["stage", "main"], "remoto": "origin" },
  "github": { "repo": null, "rotuloDeReserva": "em-andamento" },
  "worktrees": { "dir": null }, "ci": { "comandoDeTeste": null },
  "agentes": ["claude-code"], "extensoes": {}, "fuso": "America/Sao_Paulo" }
```

- [ ] **Passo 1:** Escrever os testes.

```js
test('raizPrincipal devolve o checkout principal a partir de um worktree', () => {
  const r = criarRepo(); const wt = path.join(r.estado, 'wt-x');
  r.git(['worktree', 'add', '-b', 'feat/x', wt, 'dev']);
  assert.equal(fs.realpathSync(raizPrincipal(wt)), fs.realpathSync(r.raiz));
});
test('raizPrincipal fora de repositório recusa com saída', () => {
  assert.throws(() => raizPrincipal(os.tmpdir()), e => e.name === 'ErroDeUso' && e.saida.length > 0);
});
test('dirEstado por sistema', () => {
  assert.equal(dirEstado('loja', {}, 'linux', '/h/ana'), path.join('/h/ana', '.local', 'state', 'agent-harness', 'loja'));
  assert.equal(dirEstado('loja', { AH_ESTADO: '/e' }, 'linux', '/h/ana'), path.join('/e', 'loja'));
  assert.equal(dirEstado('loja', { LOCALAPPDATA: 'C:\\L' }, 'win32', 'C:\\U'), path.join('C:\\L', 'agent-harness', 'estado', 'loja'));
});
test('config só com o nome recebe os padrões', () => {
  const c = aplicarPadroes({ projeto: 'loja' });
  assert.equal(c.git.base, 'dev'); assert.deepEqual(c.git.protegidos, ['stage', 'main']);
});
test('config inválida diz campo e motivo', () => {
  const v = validarConfig({ projeto: 'Loja!', git: { base: 3 }, sobrando: 1 });
  assert.deepEqual(v.erros.map(e => e.campo).sort(), ['git.base', 'projeto', 'sobrando']);
});
test('base não pode estar entre os protegidos', () => {
  assert.equal(validarConfig({ projeto: 'loja', git: { base: 'main' } }).ok, false);
});
```

- [ ] **Passo 2:** Rodar e ver falhar.
- [ ] **Passo 3:** Implementar. Chave desconhecida em qualquer nível é erro (pega erro de digitação). `ErroDeUso` e `ErroDeConfig` são exportados de `caminhos.mjs` e `config.mjs`; `aplicarPadroes(obj) -> Config` também é exportada.
- [ ] **Passo 4:** Rodar `node --test teste/`. Esperado: passam.
- [ ] **Passo 5:** Commit: `feat: caminhos e configuração`.

### Tarefa 4: Estado e sessão

**Arquivos:**
- Criar: `nucleo/lib/estado.mjs`, `nucleo/lib/sessao.mjs`, `teste/estado.test.mjs`, `teste/sessao.test.mjs`

**Interfaces:**
- Produz, em `estado.mjs`:
  - `lerJson(arquivo, padrao = null)`: devolve `padrao` se não existe; lança `ErroDeEstado` (com `.arquivo` e `.saida = 'rode ah doctor'`) se o conteúdo não é JSON.
  - `gravarJson(arquivo, obj)`: cria a pasta, grava em arquivo temporário na mesma pasta e renomeia.
  - `comTrava(dir, nome, fn, {esperaMs = 5000, venceMs = 30000} = {})`: exclusão por `mkdir` de `<dir>/travas/<nome>`; grava `{pid, em}` dentro; trava mais velha que `venceMs` é tomada; solta no fim mesmo com erro; lança `ErroDeEstado` se esperou `esperaMs`.
  - `registrarEvento(dirEstado, evento)`: acrescenta uma linha JSON a `eventos.jsonl`, com `em` (ISO) preenchido.
  - `lerEventos(dirEstado) -> Array<object>`.
- Produz, em `sessao.mjs`:
  - `idDaSessao(env) -> string|null`: `AH_SESSAO`, depois `CLAUDE_CODE_SESSION_ID` (confirmar o nome na tarefa 1, linha f).
  - `idCurto(id) -> string`: os 8 primeiros caracteres.
  - `registrarSessao(dirEstado, {id, agente, pid, modelo = null}) -> Sessao`: cria ou atualiza `sessoes/<id>.json` sem perder `frente` nem `papel`.
  - `lerSessao(dirEstado, id) -> Sessao|null`, `gravarSessao(dirEstado, sessao)`, `tocarSinal(dirEstado, id)`, `encerrarSessao(dirEstado, id)`.
  - Forma: `{esquema: 1, id, agente, papel: 'executor', frente: null, modelo, pid, inicio, sinal, fim: null}`.

- [ ] **Passo 1:** Escrever os testes.

```js
test('gravarJson e lerJson ida e volta; arquivo ausente devolve o padrão', () => { /* ... */ });
test('JSON pela metade lança ErroDeEstado com o arquivo e a saída', () => {
  fs.writeFileSync(arq, '{"id": ');
  assert.throws(() => lerJson(arq), e => e.name === 'ErroDeEstado' && e.arquivo === arq && /ah doctor/.test(e.saida));
});
test('comTrava exclui: a segunda entrada espera a primeira soltar', async () => { /* ordem ['a-entra','a-sai','b-entra'] */ });
test('trava vencida é tomada', async () => { /* cria a pasta da trava com data antiga; comTrava com venceMs: 10 entra */ });
test('comTrava solta mesmo quando fn lança', async () => { /* ... */ });
test('registrarEvento acrescenta linha com data', () => {
  registrarEvento(dir, { tipo: 'abertura', frente: 'as-1' });
  const [e] = lerEventos(dir); assert.equal(e.tipo, 'abertura'); assert.ok(Date.parse(e.em));
});
test('idDaSessao prefere AH_SESSAO', () => {
  assert.equal(idDaSessao({ AH_SESSAO: 'a', CLAUDE_CODE_SESSION_ID: 'b' }), 'a');
  assert.equal(idDaSessao({}), null);
});
test('registrarSessao de novo preserva a frente', () => {
  registrarSessao(dir, { id: 's1', agente: 'claude-code', pid: 1 });
  gravarSessao(dir, { ...lerSessao(dir, 's1'), frente: 'carrinho' });
  registrarSessao(dir, { id: 's1', agente: 'claude-code', pid: 2 });
  assert.equal(lerSessao(dir, 's1').frente, 'carrinho'); assert.equal(lerSessao(dir, 's1').pid, 2);
});
```

- [ ] **Passo 2:** Rodar e ver falhar.
- [ ] **Passo 3:** Implementar.
- [ ] **Passo 4:** Rodar `node --test teste/`. Esperado: passam.
- [ ] **Passo 5:** Commit: `feat: estado e sessão`.

### Tarefa 5: Frente (ID, sigla, nome, histórico)

Funções puras, sem disco.

**Arquivos:**
- Criar: `nucleo/lib/frente.mjs`, `teste/frente.test.mjs`

**Interfaces:**
- Produz:
  - `siglaValida(s) -> boolean`: `/^[a-z]{2,4}$/`.
  - `siglaDeLogin(login) -> string`: iniciais das partes separadas por caractere que não é letra (até 4); com uma parte só, as duas primeiras letras. É só a proposta; quem confirma é a pessoa, no `init`.
  - `nomeValido(nome) -> boolean`: `/^[a-z0-9][a-z0-9-]{1,48}$/`.
  - `idsNoHistorico(texto, sigla) -> number[]`.
  - `proximoId({sigla, historico, frentes}) -> string`: `<sigla>-<n>`, com `n` = maior número daquela sigla no texto do histórico e nas frentes locais, mais um; começa em 1.
  - `novaFrente({id, nome, config, dirWorktrees, tickets, plano, caminhos, dona, login, agora}) -> Frente`.
  - `linhaDoHistorico(frente, resumo, agora) -> string`: `- AAAA-MM-DD · <id> · <nome> · @<login> · #1, #2 · <resumo>` (sem tickets: `—`).
  - Forma: `{esquema: 1, id, nome, ramo, worktree, tickets: number[], plano: string|null, caminhos: string[], dona: string|null, abertaPor: string, abertaEm: string, estado: 'ativa', notas: Array<{em, sessao, texto}>}`. `ramo` = `config.git.prefixo + nome`; `worktree` = `dirWorktrees/<nome>`; `abertaEm` em ISO com o deslocamento do fuso da configuração.

- [ ] **Passo 1:** Escrever os testes.

```js
test('siglaDeLogin', () => {
  assert.equal(siglaDeLogin('ana-souza'), 'as');
  assert.equal(siglaDeLogin('ana_maria.souza-lima-x'), 'amsl');
  assert.equal(siglaDeLogin('anasouza'), 'an');
});
test('siglaValida e nomeValido', () => {
  assert.ok(siglaValida('as')); assert.ok(!siglaValida('a')); assert.ok(!siglaValida('a1'));
  assert.ok(nomeValido('carrinho-2')); assert.ok(!nomeValido('Carrinho')); assert.ok(!nomeValido('a b')); assert.ok(!nomeValido('-x'));
});
test('proximoId considera histórico e frentes locais, só da própria sigla', () => {
  const historico = '- 2026-01-02 · as-3 · a · @ana-souza · — · x\n- 2026-01-03 · bc-9 · b · @bia-costa · — · y\n';
  assert.equal(proximoId({ sigla: 'as', historico, frentes: [{ id: 'as-5' }] }), 'as-6');
  assert.equal(proximoId({ sigla: 'zz', historico, frentes: [] }), 'zz-1');
});
test('linhaDoHistorico', () => {
  const f = { id: 'as-6', nome: 'carrinho', abertaPor: 'ana-souza', tickets: [1, 2] };
  assert.equal(linhaDoHistorico(f, 'soma do carrinho', new Date('2026-03-04T12:00:00Z')),
    '- 2026-03-04 · as-6 · carrinho · @ana-souza · #1, #2 · soma do carrinho');
});
test('novaFrente monta ramo e worktree', () => { /* ramo 'feat/carrinho'; worktree path.join(dir,'carrinho'); estado 'ativa'; notas [] */ });
```

- [ ] **Passo 2:** Rodar e ver falhar.
- [ ] **Passo 3:** Implementar. A data da linha do histórico usa o fuso da frente (o dia de `abertaEm` não entra; entra o dia do fechamento, recebido em `agora`, em UTC neste teste).
- [ ] **Passo 4:** Rodar `node --test teste/`. Esperado: passam.
- [ ] **Passo 5:** Commit: `feat: frente, ID e linha do histórico`.

### Tarefa 6: Interpretador de shell

Um interpretador só, usado por todas as travas. Não executa nada: só lê o texto.

**Arquivos:**
- Criar: `nucleo/lib/shell.mjs`, `teste/shell.test.mjs`

**Interfaces:**
- Produz:
  - `comandosSimples(texto, cwd) -> Array<{argv: string[], cwd: string, env: Record<string, string>}>`.
  - `ErroDeShell` (texto que não deu para ler: aspas ou parênteses sem fechar).
- Regras:
  - Separa em `;`, `&&`, `||`, `|`, `&` e quebra de linha.
  - Entra em `( … )`, `$( … )`, crases e `{ …; }`; o `cd` de dentro de `( … )` e `$( … )` não vaza para fora.
  - `cd <dir>` muda o `cwd` dos comandos seguintes (resolvido contra o `cwd` atual; `cd` sem argumento ou com variável deixa o `cwd` como `null`, que quer dizer "desconhecido").
  - Atribuições antes do comando (`A=1 B=2 git …`) vão para `env`.
  - Envoltórios são retirados e o comando de dentro é o que conta: `env [A=1…]`, `command`, `exec`, `sudo`, `nohup`, `time`, `xargs`.
  - `bash -c '<texto>'`, `sh -c`, `zsh -c` e `eval '<texto>'`: o texto é lido como shell, recursivamente.
  - Heredoc: o corpo é ignorado, salvo quando alimenta `bash`, `sh` ou `zsh`, caso em que é lido como shell.
  - Aspas simples e duplas e a barra invertida são respeitadas; variáveis não são expandidas (ficam como texto).
  - `git -C <dir> …`: o `cwd` do comando passa a ser `<dir>` e o `-C <dir>` sai do `argv`.

- [ ] **Passo 1:** Escrever os testes.

```js
const so = (t, cwd = '/r') => comandosSimples(t, cwd).map(c => c.argv.join(' '));
test('encadeamento', () => assert.deepEqual(so('a 1 && b 2; c | d'), ['a 1', 'b 2', 'c', 'd']));
test('cd muda o cwd dos seguintes', () => {
  const [, g] = comandosSimples('cd sub && git status', '/r');
  assert.equal(g.cwd, path.resolve('/r', 'sub'));
});
test('cd dentro de subshell não vaza', () => {
  const cs = comandosSimples('(cd sub && git a); git b', '/r');
  assert.equal(cs.at(-1).cwd, '/r');
});
test('bash -c e eval são lidos por dentro', () => {
  assert.deepEqual(so(`bash -c 'git push origin main'`), ['git push origin main']);
  assert.deepEqual(so(`eval "git add -A"`), ['git add -A']);
});
test('substituição de comando e crases', () => assert.ok(so('echo $(git push) `git add .`').includes('git push')));
test('env e envoltórios', () => {
  const [c] = comandosSimples('AH_GUARD=off git push origin main', '/r');
  assert.equal(c.env.AH_GUARD, 'off'); assert.deepEqual(c.argv, ['git', 'push', 'origin', 'main']);
  assert.deepEqual(so('env X=1 git push'), ['git push']);
  assert.deepEqual(so('sudo command git push'), ['git push']);
});
test('git -C troca o cwd', () => {
  const [c] = comandosSimples('git -C ../outro push', '/r/a');
  assert.equal(c.cwd, path.resolve('/r/a', '../outro')); assert.deepEqual(c.argv, ['git', 'push']);
});
test('aspas preservam o argumento', () => assert.deepEqual(comandosSimples(`git commit -m "a && b; c"`, '/r')[0].argv, ['git', 'commit', '-m', 'a && b; c']));
test('heredoc comum é ignorado; heredoc para bash é lido', () => {
  assert.deepEqual(so('cat <<EOF\ngit push\nEOF'), ['cat']);
  assert.ok(so('bash <<EOF\ngit push\nEOF').includes('git push'));
});
test('aspas sem fechar lançam ErroDeShell', () => assert.throws(() => comandosSimples(`echo "a`, '/r'), e => e.name === 'ErroDeShell'));
```

- [ ] **Passo 2:** Rodar e ver falhar.
- [ ] **Passo 3:** Implementar em duas funções internas: uma que quebra o texto em palavras e operadores respeitando aspas, e uma que percorre as palavras montando os comandos. Sem expressão regular para o texto inteiro.
- [ ] **Passo 4:** Rodar `node --test teste/`. Esperado: passam.
- [ ] **Passo 5:** Commit: `feat: interpretador de shell para as travas`.

### Tarefa 7: Recusa e travas T2 e T5

**Arquivos:**
- Criar: `nucleo/lib/recusa.mjs`, `nucleo/lib/travas.mjs`, `teste/travas.test.mjs`

**Interfaces:**
- Consome: `comandosSimples`, `ErroDeShell` (tarefa 6).
- Produz:
  - `recusa(trava, motivo, saida) -> {permite: false, trava, motivo, saida}`; lança se `saida` for vazia.
  - `textoDaRecusa(r) -> string`: `Recusado (<trava>): <motivo>\nFaça: <saida>`.
  - `avaliar(acao, ctx) -> {permite: true, liberada?: string} | Recusa`.
    - `acao`: `{tipo: 'comando', comando, cwd}` ou `{tipo: 'edicao', arquivo, cwd}`.
    - `ctx`: `{config, raiz, topoDe(cwd) -> string|null, ramoAtual(cwd) -> string|null, baseDoPr(numeroOuNull, cwd) -> string|null}`. As três funções são injetadas, para a trava continuar pura.
- Regras desta fatia:
  - **T2** (só quando `topoDe(cwd)` é a `raiz`): `git add` com `-A`, `--all`, `.`, `-u` ou `:/`; `git commit` com `-a`, `--all` ou opção curta combinada que contenha `a` (`-am`). Saída: `git add <caminhos>`.
  - **T5:** `git push` com `--all` ou `--mirror`; com destino explícito protegido (`main`, `x:main`, `HEAD:refs/heads/main`, `+main`); sem destino explícito quando `ramoAtual(cwd)` é protegido ou `null`. `gh pr merge [n]` quando `baseDoPr` devolve ramo protegido ou `null`. Saída: abrir PR para o ramo protegido e pedir a ordem do executivo.
  - `cwd` desconhecido (`null`): T5 avalia como se o ramo atual fosse desconhecido (recusa); T2 recusa.
  - Comando com `AH_GUARD=off` no `env` daquele comando simples: permite e devolve `liberada: '<trava>'`. Só vale para o comando que traz o prefixo.
  - `ErroDeShell`: recusa (trava `T0`) se o texto contém a palavra `git` ou `gh`; senão permite. **[decisão do plano]**
  - Edição de arquivo: nesta fatia sempre permite (T4 é da fatia 2).

- [ ] **Passo 1:** Escrever os testes. `ctx` de teste: `raiz '/r'`, `topoDe = c => c && c.startsWith('/w') ? '/w' : '/r'`, `ramoAtual = c => c?.startsWith('/w') ? 'feat/x' : 'dev'`, `baseDoPr = n => ({ 7: 'dev', 8: 'main' })[n] ?? null`, `config` com os padrões.

```js
const av = (comando, cwd = '/r') => avaliar({ tipo: 'comando', comando, cwd }, ctx);
for (const c of ['git add -A', 'git add .', 'git add --all', 'git commit -am "x"', 'git commit -a', `bash -c 'git add .'`, 'cd . && git add -u'])
  test(`T2 recusa: ${c}`, () => { const r = av(c); assert.equal(r.trava, 'T2'); assert.ok(r.saida); });
test('T2 não vale no worktree da frente', () => assert.ok(av('git add -A', '/w').permite));
test('T2 permite adicionar por caminho', () => assert.ok(av('git add src/a.js docs/').permite));
for (const c of ['git push origin main', 'git push origin dev:stage', 'git push origin HEAD:refs/heads/main', 'git push --all', 'git push --mirror origin',
  'git push origin +main', 'env X=1 git push origin main', 'sudo git push origin stage', 'command git push origin main', 'git -C /r push origin main', 'gh pr merge 8', 'gh pr merge'])
  test(`T5 recusa: ${c}`, () => { const r = av(c); assert.equal(r.trava, 'T5'); assert.ok(r.saida); });
test('T5 permite a base e o ramo da frente', () => {
  assert.ok(av('git push origin dev').permite); assert.ok(av('git push', '/r').permite);
  assert.ok(av('git push -u origin feat/x', '/w').permite); assert.ok(av('gh pr merge 7').permite);
});
test('push sem destino num checkout em ramo protegido é recusado', () => {
  assert.equal(avaliar({ tipo: 'comando', comando: 'git push', cwd: '/r' }, { ...ctx, ramoAtual: () => 'main' }).trava, 'T5');
});
test('AH_GUARD=off libera só o comando que traz o prefixo', () => {
  assert.equal(av('AH_GUARD=off git push origin main').liberada, 'T5');
  assert.equal(av('AH_GUARD=off true && git push origin main').trava, 'T5');
});
test('texto ilegível com git recusa; sem git permite', () => {
  assert.equal(av(`git push "origin`).trava, 'T0'); assert.ok(av(`echo "a`).permite);
});
test('recusa sem saída é erro de programação', () => assert.throws(() => recusa('T9', 'motivo', '')));
test('textoDaRecusa traz o Faça', () => assert.match(textoDaRecusa(av('git add -A')), /^Recusado \(T2\): .+\nFaça: .+/));
```

- [ ] **Passo 2:** Rodar e ver falhar.
- [ ] **Passo 3:** Implementar. Uma função por trava, cada uma recebendo um comando simples; `avaliar` percorre os comandos e devolve a primeira recusa.
- [ ] **Passo 4:** Rodar `node --test teste/`. Esperado: passam.
- [ ] **Passo 5:** Commit: `feat: travas T2 e T5 com recusa que diz a saída`.

### Tarefa 8: git, GitHub, despacho e `whoami`

**Arquivos:**
- Criar: `nucleo/lib/git.mjs`, `nucleo/lib/github.mjs`, `nucleo/bin/ah.mjs`, `nucleo/comandos/whoami.mjs`, `teste/apoio/gh-falso.mjs`, `teste/whoami.test.mjs`, `teste/github.test.mjs`
- Modificar: `teste/apoio/repo.mjs`

**Interfaces:**
- Consome: tarefas 3 e 4.
- Produz:
  - `git(args, {cwd}) -> {codigo, saida, erro}` (nunca lança) e os auxiliares `ramoAtual(cwd)`, `topoDe(cwd)`, `limpo(cwd) -> boolean`, `existeRamo(cwd, ramo, {remoto})`.
  - `gh(args, {cwd, env}) -> {codigo, saida, erro}`: executa `gh`; se `env.AH_GH` termina em `.mjs`, executa esse arquivo com o Node (é como os testes trocam o `gh`). Nunca lança; `gh` ausente devolve `codigo: 127`.
  - `loginAtual(o) -> string|null`, `repoAtual(o) -> string|null` (`dono/nome`), `comentar(ticket, corpo, o) -> boolean`.
  - `teste/apoio/gh-falso.mjs`: grava cada chamada (`argv` e a entrada padrão) em `GH_FALSO_LOG` (uma linha JSON por chamada) e responde conforme `GH_FALSO_RESPOSTAS` (arquivo JSON: lista de `{prefixo: string[], codigo, saida}`, a primeira cujo prefixo casa com o começo do `argv`). Sem resposta que case: `api user` devolve `{"login":"ana-souza"}`, `repo view` devolve `exemplo/loja`, o resto devolve código 0 e saída vazia. `GH_FALSO_FORA=1` faz tudo devolver código 1 ("sem rede").
  - Em `repo.mjs`: `env` passa a ter `AH_GH`, `GH_FALSO_LOG`; novos `ghChamadas() -> Array<{argv, entrada}>`, `ghResponder(lista)`, e `ah(args, {cwd = raiz, env = {}}) -> {codigo, saida, erro}`, que roda `node nucleo/bin/ah.mjs` do repositório do harness.
  - `ah.mjs`: `ah <comando> [args]`; `ah` ou `ah --help` lista os comandos com uma linha cada; comando desconhecido recusa dizendo `ah --help`. Cada comando é `nucleo/comandos/<nome>.mjs` exportando `descricao` e `async executar(args, amb) -> number` (código de saída), com `amb = {cwd, env, raiz, config, dirEstado, sessaoId, escrever(texto), avisar(texto)}`. Erros `ErroDeUso`, `ErroDeConfig` e `ErroDeEstado` viram `Recusado: <motivo>\nFaça: <saida>` na saída de erro, código 1, sem pilha. Fora de repositório: saída "entre na pasta do projeto". Projeto sem `.harness/config.json` (para todo comando menos `init`): saída "peça ao agente: prepare meu projeto (`ah init`)". Sem id de sessão (para todo comando menos `init`, `doctor`, `board`): saída "defina AH_SESSAO ou ligue o adaptador do agente".
  - `ah whoami [--json]`: registra a sessão se ainda não existe; texto `Sessão <id curto> (<papel>) · frente: <id> <nome> | nenhuma`; em JSON `{sessao, papel, frente}`.

- [ ] **Passo 1:** Escrever os testes.

```js
test('whoami sem frente', () => {
  const p = criarRepo(); escreverConfig(p, { projeto: 'loja' });   // auxiliar de teste: grava .harness/config.json
  const r = p.ah(['whoami']);
  assert.equal(r.codigo, 0); assert.match(r.saida, /Sessão sessao-t \(executor\) · frente: nenhuma/);
  assert.deepEqual(JSON.parse(p.ah(['whoami', '--json']).saida), { sessao: 'sessao-teste-0001', papel: 'executor', frente: null });
});
test('fora de repositório recusa com saída e sem pilha', () => {
  const r = p.ah(['whoami'], { cwd: os.tmpdir() });
  assert.equal(r.codigo, 1); assert.match(r.erro, /^Recusado: .+\nFaça: /); assert.doesNotMatch(r.erro, /\bat .+\.mjs:\d+/);
});
test('projeto sem .harness recusa apontando o init', () => assert.match(criarRepo().ah(['whoami']).erro, /ah init/));
test('sem id de sessão recusa', () => assert.match(p.ah(['whoami'], { env: { AH_SESSAO: '' } }).erro, /AH_SESSAO/));
test('comando desconhecido aponta a ajuda', () => assert.match(p.ah(['xyz']).erro, /ah --help/));
test('comentar chama o gh com o ticket e o corpo', () => {
  assert.equal(comentar(3, 'oi', { cwd: p.raiz, env: p.env }), true);
  assert.deepEqual(p.ghChamadas().at(-1).argv.slice(0, 3), ['issue', 'comment', '3']);
});
test('sem rede: loginAtual devolve null e comentar devolve false', () => {
  const env = { ...p.env, GH_FALSO_FORA: '1' };
  assert.equal(loginAtual({ cwd: p.raiz, env }), null); assert.equal(comentar(3, 'oi', { cwd: p.raiz, env }), false);
});
```

- [ ] **Passo 2:** Rodar e ver falhar.
- [ ] **Passo 3:** Implementar. O corpo do comentário vai pela entrada padrão (`--body-file -`), nunca por argumento.
- [ ] **Passo 4:** Rodar `node --test teste/`. Esperado: passam.
- [ ] **Passo 5:** Commit: `feat: despacho de comandos, git, gh e whoami`.

### Tarefa 9: `init`

**Arquivos:**
- Criar: `nucleo/comandos/init.mjs`, `modelos/ah`, `modelos/ah.cmd`, `modelos/sessoes-paralelas.md`, `modelos/historico-das-frentes.md`, `teste/init.test.mjs`
- Modificar: `teste/apoio/repo.mjs` (novo `criarProjeto(opcoes)`: `criarRepo` seguido de `ah init --projeto loja --sigla as`)

**Interfaces:**
- Consome: tarefas 3, 4, 5 e 8.
- Produz: `ah init [--projeto <nome>] [--sigla <sigla>] [--agentes claude-code] [--teste "<comando>"] [--sobrescrever]`, rodado na raiz do projeto de destino a partir de um clone do harness.
- Comportamento:
  1. Copia `nucleo/` do harness para `.harness/nucleo/` e grava `.harness/nucleo/MANIFEST.json`: `{versao, commit, copiadoEm}` (`commit` = `git rev-parse HEAD` do clone do harness, ou `null`).
  2. Grava `.harness/config.json` com `projeto` (padrão: nome da pasta, em minúsculas) e, se `--teste`, `ci.comandoDeTeste`. Cria `.harness/extensoes/.gitkeep`.
  3. Copia `modelos/ah` para `tools/ah` (executável) e `modelos/ah.cmd` para `tools/ah.cmd`; copia os dois documentos para `docs/agents/`.
  4. Sigla: `--sigla`, ou a que já está no arquivo da máquina, ou a proposta de `siglaDeLogin(loginAtual())`. Grava `{sigla, login}` no arquivo da máquina. Sem `--sigla` e sem sigla gravada, grava a proposta e escreve na saída `Sigla proposta: <x>. Para trocar: ah init --sigla <outra>`. Sem login (sem `gh`): exige `--sigla` e usa `login: 'local'`.
  5. Ramos: cria localmente cada ramo de `git.base` e `git.protegidos` que não exista, a partir do primeiro ramo protegido que existir (ou do ramo atual). Não troca o ramo em uso e não empurra nada.
  6. Arquivo de destino que já existe com conteúdo diferente: não toca, lista em "Não sobrescrevi:" e sai com código 1, salvo com `--sobrescrever`. `.harness/config.json` e `.harness/extensoes/` nunca são sobrescritos, nem com a opção.
  7. Termina com a lista do que criou e a linha `Agora rode: tools/ah doctor`. Não faz commit.
- `modelos/ah` (sh POSIX): descobre o checkout principal (primeira linha de `git worktree list --porcelain`), e executa `node <principal>/.harness/nucleo/bin/ah.mjs "$@"`. Se o `node` não existe: escreve na saída de erro `Recusado: o Node não foi encontrado.` e `Faça: instale o Node 22 ou mais novo e rode tools/ah doctor`, e sai com código 2. `modelos/ah.cmd` faz o mesmo no Windows.

- [ ] **Passo 1:** Escrever os testes.

```js
test('init cria a estrutura e não faz commit', () => {
  const p = criarRepo(); const r = p.ah(['init', '--projeto', 'loja', '--sigla', 'as']);
  assert.equal(r.codigo, 0);
  for (const f of ['.harness/nucleo/bin/ah.mjs', '.harness/nucleo/MANIFEST.json', '.harness/config.json', '.harness/extensoes/.gitkeep',
    'tools/ah', 'tools/ah.cmd', 'docs/agents/sessoes-paralelas.md', 'docs/agents/historico-das-frentes.md'])
    assert.ok(fs.existsSync(path.join(p.raiz, f)), f);
  assert.equal(JSON.parse(ler(p, '.harness/config.json')).projeto, 'loja');
  assert.equal(JSON.parse(ler(p, '.harness/nucleo/MANIFEST.json')).versao, VERSAO);
  assert.match(r.saida, /Agora rode: tools\/ah doctor/);
  assert.equal(p.git(['log', '--oneline']).saida.trim().split('\n').length, 1);
});
test('init propõe a sigla pelo login quando não recebe', () => {
  const r = criarRepo().ah(['init', '--projeto', 'loja']); assert.match(r.saida, /Sigla proposta: as\./);
});
test('init sem gh exige --sigla', () => {
  const r = criarRepo().ah(['init', '--projeto', 'loja'], { env: { GH_FALSO_FORA: '1' } });
  assert.equal(r.codigo, 1); assert.match(r.erro, /--sigla/);
});
test('init cria dev e stage quando só existe main, sem trocar de ramo', () => {
  const p = criarRepo({ ramos: ['main'] }); p.ah(['init', '--projeto', 'loja', '--sigla', 'as']);
  assert.match(p.git(['branch', '--list']).saida, /dev[\s\S]*stage|stage[\s\S]*dev/);
  assert.equal(p.git(['branch', '--show-current']).saida.trim(), 'main');
});
test('init de novo não sobrescreve arquivo alterado nem a configuração', () => {
  const p = criarProjeto(); fs.appendFileSync(path.join(p.raiz, 'docs/agents/sessoes-paralelas.md'), '\nminha nota');
  const cfg = ler(p, '.harness/config.json').replace('"loja"', '"loja2"'); gravar(p, '.harness/config.json', cfg);
  const r = p.ah(['init']);
  assert.equal(r.codigo, 1); assert.match(r.erro, /Não sobrescrevi:[\s\S]*sessoes-paralelas\.md/);
  p.ah(['init', '--sobrescrever']);
  assert.doesNotMatch(ler(p, 'docs/agents/sessoes-paralelas.md'), /minha nota/);
  assert.match(ler(p, '.harness/config.json'), /loja2/);
});
test('tools/ah roda a cópia do checkout principal a partir de um worktree', { skip: process.platform === 'win32' }, () => {
  const p = criarProjeto(); /* cria worktree; apaga .harness/nucleo dentro do worktree; executa <worktree>/tools/ah whoami; codigo 0 */
});
```

- [ ] **Passo 2:** Rodar e ver falhar.
- [ ] **Passo 3:** Implementar. Escrever os dois documentos-modelo: `sessoes-paralelas.md` com o ciclo desta fatia (`open`, `nota`, `close`, `board`, as duas travas, `AH_GUARD=off`, o fluxo `dev`/`stage`/`main` por PR) em até uma página; `historico-das-frentes.md` só com o título e uma linha explicando o formato.
- [ ] **Passo 4:** Rodar `node --test teste/`. Esperado: passam.
- [ ] **Passo 5:** Commit: `feat: init`.

### Tarefa 10: `open` e `nota`

**Arquivos:**
- Criar: `nucleo/comandos/open.mjs`, `nucleo/comandos/nota.mjs`, `teste/open.test.mjs`
- Modificar: `nucleo/lib/frente.mjs`, `nucleo/comandos/whoami.mjs` (o texto passa a mostrar `frente: <id> <nome>` quando há frente)

**Interfaces:**
- Consome: tarefas 4, 5, 8 e 9.
- Produz:
  - `ah open <nome> [--tickets 1,2] [--plano <arquivo>] [--caminhos <globs>]`.
  - `ah nota "<texto>"`.
  - Funções de frente em disco, em `nucleo/lib/frente.mjs`: `lerFrente(dirEstado, nome) -> Frente|null`, `gravarFrente(dirEstado, frente)`, `listarFrentes(dirEstado) -> Frente[]` (ordenadas por `abertaEm`), `removerFrente(dirEstado, nome)`. Arquivo: `frentes/<nome>.json`.
- Comportamento do `open`, nesta ordem, dentro de `comTrava(dirEstado, 'frentes', …)`:
  1. Recusa: nome inválido (saída: dizer o formato); sessão já tem frente ativa (saída: `ah close` ou continuar nela); já existe frente, ramo local ou ramo remoto com esse nome (saída: escolher outro nome); máquina sem sigla (saída: `ah init --sigla`); `--plano` que não existe.
  2. Se há remoto, `git fetch <remoto> <base>`; falha vira aviso. A frente nasce de `<remoto>/<base>` quando existe, senão da base local.
  3. Calcula o ID com `proximoId` (histórico lido de `git show <ponto de partida>:docs/agents/historico-das-frentes.md`, vazio se não existir).
  4. `git worktree add -b <ramo> <worktree> <ponto de partida>`.
  5. Grava a frente e põe `frente: <nome>` na sessão; registra o evento `abertura` com `frente`, `id`, `tickets`.
  6. Para cada ticket, comenta: `Frente <id> (<nome>) aberta por @<login>.` seguido de uma linha `<!-- ah:frente id=<id> nome=<nome> ramo=<ramo> -->`. Comentário que falha vira aviso e evento `comentario-falhou`. Nesta fatia não há reserva (responsável e rótulo são da fatia 2).
  7. Se o checkout principal tem arquivos modificados, lista-os como aviso; não faz commit deles.
  8. Saída: `Frente <id> <nome> aberta.` e `Trabalhe em: <worktree>`.
- Comportamento do `nota`: recusa se a sessão não tem frente (saída: `ah open <nome>`); acrescenta `{em, sessao, texto}` às notas da frente; registra o evento `nota`.

- [ ] **Passo 1:** Escrever os testes.

```js
test('open cria ramo, worktree, estado e comenta nos tickets', () => {
  const p = criarProjeto(); const r = p.ah(['open', 'carrinho', '--tickets', '1,2', '--plano', 'README.md']);
  assert.equal(r.codigo, 0); assert.match(r.saida, /Frente as-1 carrinho aberta\./);
  const f = JSON.parse(fs.readFileSync(path.join(p.estado, 'loja', 'frentes', 'carrinho.json'), 'utf8'));
  assert.deepEqual([f.id, f.ramo, f.tickets, f.plano, f.dona], ['as-1', 'feat/carrinho', [1, 2], 'README.md', 'sessao-teste-0001']);
  assert.ok(fs.existsSync(path.join(f.worktree, '.git')));
  const com = p.ghChamadas().filter(c => c.argv[0] === 'issue' && c.argv[1] === 'comment');
  assert.equal(com.length, 2); assert.match(com[0].entrada, /<!-- ah:frente id=as-1 nome=carrinho ramo=feat\/carrinho -->/);
  assert.equal(JSON.parse(p.ah(['whoami', '--json']).saida).frente, 'carrinho');
});
test('a segunda frente da mesma pessoa é as-2', () => { /* open a; close simulado limpando sessao.frente; open b -> /as-2/ */ });
test('executor com frente ativa não abre outra', () => {
  const p = criarProjeto(); p.ah(['open', 'a1']); const r = p.ah(['open', 'b1']);
  assert.equal(r.codigo, 1); assert.match(r.erro, /Faça: .*ah close/);
});
test('nome repetido como ramo é recusado', () => { /* git branch feat/x antes; open x -> erro com Faça */ });
test('nome inválido é recusado com o formato', () => assert.match(criarProjeto().ah(['open', 'Minha Frente']).erro, /Faça: /));
test('sem rede o open segue com aviso', () => {
  const r = criarProjeto().ah(['open', 'carrinho', '--tickets', '1'], { env: { GH_FALSO_FORA: '1' } });
  assert.equal(r.codigo, 0); assert.match(r.erro, /aviso/i);
});
test('arquivos sujos no checkout principal são só listados', () => {
  const p = criarProjeto(); fs.writeFileSync(path.join(p.raiz, 'solto.txt'), 'x');
  const r = p.ah(['open', 'carrinho']); assert.match(r.erro, /solto\.txt/);
  assert.match(p.git(['status', '--short']).saida, /solto\.txt/);
});
test('caminho com espaço e acento', () => {
  const p = criarProjeto({ sufixo: ' João Silva' }); assert.equal(p.ah(['open', 'carrinho']).codigo, 0);
});
test('nota entra na frente; sem frente é recusada', () => {
  const p = criarProjeto(); assert.match(p.ah(['nota', 'oi']).erro, /ah open/);
  p.ah(['open', 'carrinho']); p.ah(['nota', 'mexendo no total']);
  assert.equal(lerFrenteDoTeste(p, 'carrinho').notas[0].texto, 'mexendo no total');
});
```

- [ ] **Passo 2:** Rodar e ver falhar.
- [ ] **Passo 3:** Implementar. Com `sufixo`, o diretório de estado e o de worktrees do teste também ficam sob a pasta com espaço e acento.
- [ ] **Passo 4:** Rodar `node --test teste/`. Esperado: passam.
- [ ] **Passo 5:** Commit: `feat: open e nota`.

### Tarefa 11: `board` e `close`

**Arquivos:**
- Criar: `nucleo/comandos/board.mjs`, `nucleo/comandos/close.mjs`, `teste/board.test.mjs`, `teste/close.test.mjs`

**Interfaces:**
- Consome: tarefas 5, 8 e 10.
- Produz:
  - `ah board [--json]`: uma linha por frente, ordenadas por `abertaEm`: `ID`, `nome`, `dona` (id curto ou `—`), `estado`, tickets, plano, última nota. Sem frentes: `Nenhuma frente aberta.` Em JSON: `{frentes: Frente[]}`. Funciona sem id de sessão.
  - `ah close [<nome>] [--resumo "<texto>"] [--descartar-ignorados]`: fecha a frente da sessão (ou a nomeada, se for dela).
- Comportamento do `close`, nesta ordem:
  1. Recusa se: chamado de dentro de um worktree de frente (saída: rodar no checkout principal, com o caminho); a sessão não tem frente; o checkout principal não está no ramo base (saída: voltar o checkout principal para a base com `git switch <base>`); o checkout principal tem alterações em `docs/agents/historico-das-frentes.md`.
  2. Confere que nada se perde, e recusa com a lista e a saída de cada caso: worktree com alterações não commitadas (saída: commit no worktree); commits do ramo que não estão na base nem no ramo remoto de mesmo nome (saída: `git merge --no-ff <ramo>` na base, ou `git push -u <remoto> <ramo>`); arquivos ignorados dentro do worktree (saída: copiar o que importa ou repetir com `--descartar-ignorados`).
  3. Comenta em cada ticket: `Frente <id> (<nome>) fechada.` e o resumo; falha vira aviso. Não fecha o ticket.
  4. `git worktree remove <worktree>`; apaga o ramo local (`-d` se está na base, `-D` se está só no remoto).
  5. Acrescenta `linhaDoHistorico` ao fim de `docs/agents/historico-das-frentes.md` e faz o commit só desse arquivo: `git commit docs/agents/historico-das-frentes.md -m "docs(frentes): fecha <id> <nome>"`.
  6. Remove o arquivo da frente, limpa `frente` da sessão, registra o evento `fechamento` com `id`, `nome`, `aberta` e `fechada`.
  7. Saída: `Frente <id> <nome> fechada.` e, se há remoto, `Falta: git push <remoto> <base>`.
  - Sem `--resumo`, o resumo é o título do último commit do ramo.

- [ ] **Passo 1:** Escrever os testes.

```js
function comFrente() {            // projeto com a frente "carrinho" aberta, um commit nela, mesclado na dev
  const p = criarProjeto(); p.ah(['open', 'carrinho', '--tickets', '1']);
  const wt = lerFrenteDoTeste(p, 'carrinho').worktree;
  fs.writeFileSync(path.join(wt, 'a.txt'), 'a'); p.git(['add', 'a.txt'], { cwd: wt }); p.git(['commit', '-m', 'feat: a'], { cwd: wt });
  return { p, wt };
}
test('board lista a frente; vazio diz que não há', () => {
  assert.match(criarProjeto().ah(['board']).saida, /Nenhuma frente aberta\./);
  const { p } = comFrente(); assert.match(p.ah(['board']).saida, /as-1\s+carrinho\s+sessao-t\s+ativa\s+#1/);
  assert.equal(JSON.parse(p.ah(['board', '--json']).saida).frentes[0].id, 'as-1');
});
test('close depois do merge remove tudo e grava o histórico', () => {
  const { p, wt } = comFrente(); p.git(['merge', '--no-ff', 'feat/carrinho', '-m', 'merge']);
  const r = p.ah(['close', '--resumo', 'soma do carrinho']);
  assert.equal(r.codigo, 0); assert.ok(!fs.existsSync(wt));
  assert.doesNotMatch(p.git(['branch', '--list']).saida, /feat\/carrinho/);
  assert.match(ler(p, 'docs/agents/historico-das-frentes.md'), /· as-1 · carrinho · @ana-souza · #1 · soma do carrinho/);
  assert.match(p.git(['log', '-1', '--format=%s']).saida, /docs\(frentes\): fecha as-1 carrinho/);
  assert.equal(p.git(['status', '--short']).saida.trim(), '');
  assert.equal(JSON.parse(p.ah(['whoami', '--json']).saida).frente, null);
  assert.match(r.saida, /Falta: git push origin dev/);
});
test('close recusa commits que não estão na base nem no remoto', () => {
  const { p, wt } = comFrente(); const r = p.ah(['close']);
  assert.equal(r.codigo, 1); assert.match(r.erro, /Faça: .*(merge|push)/); assert.ok(fs.existsSync(wt));
});
test('close aceita ramo só empurrado para o remoto', () => {
  const { p, wt } = comFrente(); p.git(['push', '-u', 'origin', 'feat/carrinho'], { cwd: wt });
  assert.equal(p.ah(['close']).codigo, 0);
});
test('close recusa worktree sujo', () => { const { p, wt } = comFrente(); fs.writeFileSync(path.join(wt, 'b.txt'), 'b'); assert.equal(p.ah(['close']).codigo, 1); });
test('close recusa arquivo ignorado e aceita com --descartar-ignorados', () => {
  /* .gitignore com "*.log" commitado na frente e mesclado; cria x.log no worktree; close -> 1 citando x.log; com a opção -> 0 */
});
test('close de dentro do worktree recusa com o caminho do principal', () => {
  const { p, wt } = comFrente(); const r = p.ah(['close'], { cwd: wt }); assert.equal(r.codigo, 1); assert.ok(r.erro.includes(p.raiz) || r.erro.includes(fs.realpathSync(p.raiz)));
});
test('close sem rede segue com aviso', () => { /* merge; close com GH_FALSO_FORA=1 -> codigo 0 e aviso */ });
test('o ciclo registra abertura e fechamento nos eventos', () => { /* tipos ['abertura', ..., 'fechamento'] em eventos.jsonl */ });
```

- [ ] **Passo 2:** Rodar e ver falhar.
- [ ] **Passo 3:** Implementar.
- [ ] **Passo 4:** Rodar `node --test teste/`. Esperado: passam.
- [ ] **Passo 5:** Commit: `feat: board e close`.

### Tarefa 12: Contrato, resumo e adaptador do Claude Code

**Premissas (conferir na tabela da tarefa 1 antes de começar; se alguma for falsa, parar e relatar):**
- O Claude Code lê ganchos de `.claude/settings.json` do projeto, nos eventos `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `Stop` e `SessionEnd`.
- O gancho recebe JSON pela entrada padrão com `session_id`, `cwd`, `hook_event_name` e, no `PreToolUse`, `tool_name` e `tool_input` (`command` para `Bash`; `file_path` para `Edit`, `Write`, `MultiEdit`; `notebook_path` para `NotebookEdit`).
- No `PreToolUse`, sair com código 2 recusa a ação e o texto da saída de erro chega ao modelo.
- No `SessionStart`, o texto da saída padrão entra no contexto, e o campo `source` diz `startup`, `resume`, `clear` ou `compact`.

**Arquivos:**
- Criar: `nucleo/adaptadores/contrato.mjs`, `nucleo/adaptadores/claude-code.mjs`, `nucleo/lib/resumo.mjs`, `nucleo/comandos/gancho.mjs`, `modelos/claude-code/ganchos.json`, `teste/contrato.test.mjs`, `teste/claude-code.test.mjs`, `teste/eventos-gravados/claude-code/*.json`
- Modificar: `nucleo/comandos/init.mjs`, `teste/init.test.mjs`

**Interfaces:**
- Consome: `avaliar`, `textoDaRecusa` (tarefa 7); sessão e frentes (tarefas 4 e 10); `git.mjs`, `github.mjs` (tarefa 8).
- Produz:
  - `tratar(evento, amb) -> Resposta` em `contrato.mjs`, com `amb` como na tarefa 8.
    - `{tipo: 'inicio', sessao, agente, cwd, origem: 'novo'|'continuacao', modelo?}` → `{contexto: string}`. Registra a sessão e o evento `sessao-inicio`.
    - `{tipo: 'sinal', sessao}` → `{}`.
    - `{tipo: 'antes', sessao, cwd, acao: {tipo: 'comando', comando} | {tipo: 'edicao', arquivo} | {tipo: 'outra'}}` → `{decisao: 'permite'}` ou `{decisao: 'recusa', mensagem}`. Recusa e liberação por `AH_GUARD=off` vão para os eventos (`recusa` e `liberacao`, com a trava e o comando).
    - `{tipo: 'fim', sessao}` → `{}`.
  - `montarResumo({sessao, frentes, config, baseLimpa}) -> string`, com no máximo 1200 caracteres: quem é a sessão e o papel; a frente dela (ID, nome, worktree, plano) ou "nenhuma: `ah open <nome>`"; as outras frentes (ID, nome, dona); o estado do ramo base; as regras em uma linha; `Mais: docs/agents/sessoes-paralelas.md · tools/ah board`. Se passar do limite, corta a lista das outras frentes e diz quantas ficaram de fora.
  - `traduzirEntrada(json) -> evento|null` e `traduzirSaida(evento, resposta) -> {saida, erro, codigo}` em `claude-code.mjs`.
  - `ah gancho <agente>`: lê o JSON da entrada padrão, traduz, chama `tratar`, escreve e sai com o código.
- **Quando o gancho quebra** (qualquer exceção, configuração inválida, estado corrompido), no evento `antes`: recusa com `Recusado (T0): o harness não conseguiu avaliar (<motivo>).\nFaça: rode tools/ah doctor`, código 2. Duas exceções passam mesmo assim: comando de shell que é uma única chamada a `tools/ah` ou `ah`, e edição de `.harness/config.json`. Nos outros eventos, a quebra vira uma linha de aviso e código 0.
- No `init`: se `claude-code` está em `agentes`, mescla `modelos/claude-code/ganchos.json` na chave `hooks` de `.claude/settings.json` (cria o arquivo se não existe; preserva as outras chaves e os ganchos de terceiros; não duplica os do harness). O comando dos ganchos é `"$CLAUDE_PROJECT_DIR"/tools/ah gancho claude-code`; o `PreToolUse` usa o seletor `Bash|Edit|Write|MultiEdit|NotebookEdit`.

- [ ] **Passo 1:** Gravar em `teste/eventos-gravados/claude-code/` os JSON reais colhidos na tarefa 1 (um por evento), trocando caminhos e ids por valores fictícios.
- [ ] **Passo 2:** Escrever os testes.

```js
test('inicio registra a sessão e devolve o resumo', () => {
  const p = criarProjeto(); const r = tratar({ tipo: 'inicio', sessao: 's1', agente: 'claude-code', cwd: p.raiz, origem: 'novo', modelo: 'm-x' }, amb(p));
  assert.match(r.contexto, /Sessão s1 \(executor\)/); assert.match(r.contexto, /nenhuma: `?ah open/); assert.ok(r.contexto.length <= 1200);
  assert.equal(lerSessao(dirDoTeste(p), 's1').modelo, 'm-x');
});
test('o resumo mostra a frente da sessão e corta a lista longa', () => {
  const t = montarResumo({ sessao: { id: 's1', papel: 'executor', frente: 'f0' }, frentes: quarentaFrentes, config, baseLimpa: true });
  assert.ok(t.length <= 1200); assert.match(t, /e mais \d+ frentes/);
});
test('antes: push em ramo protegido é recusado e registrado', () => {
  const r = tratar({ tipo: 'antes', sessao: 's1', cwd: p.raiz, acao: { tipo: 'comando', comando: 'git push origin main' } }, amb(p));
  assert.equal(r.decisao, 'recusa'); assert.match(r.mensagem, /^Recusado \(T5\)/);
  assert.equal(lerEventos(dirDoTeste(p)).at(-1).tipo, 'recusa');
});
test('antes: AH_GUARD=off permite e registra a liberação', () => { /* decisao 'permite'; último evento 'liberacao' com trava 'T5' */ });
test('antes: outra ferramenta e edição permitem', () => { /* ... */ });
test('claude-code: PreToolUse de Bash vira acao de comando', () => {
  const e = traduzirEntrada(gravado('pre-bash.json')); assert.deepEqual(e.acao, { tipo: 'comando', comando: 'git push origin main' });
});
test('claude-code: recusa sai com código 2 e a mensagem na saída de erro', () => {
  assert.deepEqual(traduzirSaida({ tipo: 'antes' }, { decisao: 'recusa', mensagem: 'm' }), { saida: '', erro: 'm', codigo: 2 });
});
test('claude-code: SessionStart com source compact é continuação', () => assert.equal(traduzirEntrada(gravado('inicio-compact.json')).origem, 'continuacao'));
test('ah gancho de ponta a ponta recusa o push', () => {
  const r = p.ah(['gancho', 'claude-code'], { entrada: JSON.stringify(gravado('pre-bash.json', { cwd: p.raiz })) });
  assert.equal(r.codigo, 2); assert.match(r.erro, /Faça: /);
});
test('gancho com configuração inválida recusa, mas deixa passar o ah e a edição da configuração', () => {
  gravar(p, '.harness/config.json', '{ quebrado');
  assert.equal(ganchoPre(p, { command: 'git status' }).codigo, 2);
  assert.equal(ganchoPre(p, { command: 'tools/ah doctor' }).codigo, 0);
  assert.equal(ganchoPre(p, { file_path: path.join(p.raiz, '.harness/config.json') }, 'Edit').codigo, 0);
});
test('init mescla os ganchos sem apagar os de terceiros nem duplicar', () => {
  /* .claude/settings.json prévio com {"permissions":{...},"hooks":{"PreToolUse":[terceiro]}}; init duas vezes;
     permissions intacto; terceiro presente; exatamente uma entrada do harness por evento */
});
```

- [ ] **Passo 3:** Rodar e ver falhar. (`p.ah` passa a aceitar `{entrada}`; acrescentar em `teste/apoio/repo.mjs`.)
- [ ] **Passo 4:** Implementar. O `amb` do gancho injeta em `avaliar`: `topoDe` e `ramoAtual` de `git.mjs`, e `baseDoPr` por `gh pr view [n] --json baseRefName` (falha devolve `null`).
- [ ] **Passo 5:** Rodar `node --test teste/`. Esperado: passam.
- [ ] **Passo 6:** Commit: `feat: contrato de eventos, resumo e adaptador do Claude Code`.

### Tarefa 13: Proteção de ramo e CI no `init`

**Arquivos:**
- Criar: `modelos/ci/ah-ci.yml`, `teste/protecao.test.mjs`
- Modificar: `nucleo/lib/github.mjs`, `nucleo/comandos/init.mjs`

**Interfaces:**
- Consome: a seção do GitHub da tarefa 1 (chamada de API e tipos de conta) e `gh` (tarefa 8).
- Produz:
  - `protegerRamo(ramo, o) -> {ok: true} | {ok: false, motivo}`: `gh api -X PUT repos/<repo>/branches/<ramo>/protection --input -`, com o corpo `{"required_pull_request_reviews": {"required_approving_review_count": 0}, "enforce_admins": true, "required_status_checks": null, "restrictions": null}`. Ajustar o corpo se a tarefa 1 mostrar outro formato.
  - `protecaoDoRamo(ramo, o) -> 'protegido' | 'sem-protecao' | 'desconhecido'`.
  - No `init`, depois dos ramos: `--sem-protecao` pula; senão, para cada ramo protegido que exista no remoto, chama `protegerRamo`. Falha não derruba o `init`: sai o aviso `Sem proteção no servidor para <ramo>: <motivo>. Só a trava local protege.` Ramo que ainda não está no remoto: aviso `<ramo> ainda não está no remoto; rode ah init de novo depois do primeiro push`.
  - No `init`: grava `.github/workflows/ah-ci.yml` a partir do modelo. Com `ci.comandoDeTeste`, o passo roda esse comando em `pull_request` e em `push` na base. Sem comando, o trabalho leva `if: false` e o `init` avisa `CI criada desligada: defina ci.comandoDeTeste em .harness/config.json e rode ah init de novo`.

- [ ] **Passo 1:** Escrever os testes.

```js
test('init protege os ramos que estão no remoto, com enforce_admins', () => {
  const p = criarRepo(); p.git(['push', 'origin', 'main', 'stage']); p.ah(['init', '--projeto', 'loja', '--sigla', 'as']);
  const puts = p.ghChamadas().filter(c => c.argv.includes('PUT'));
  assert.deepEqual(puts.map(c => c.argv.find(a => a.includes('/branches/'))).sort(),
    ['repos/exemplo/loja/branches/main/protection', 'repos/exemplo/loja/branches/stage/protection']);
  assert.equal(JSON.parse(puts[0].entrada).enforce_admins, true);
});
test('conta sem direito a proteção: init segue e avisa', () => {
  p.ghResponder([{ prefixo: ['api', '-X', 'PUT'], codigo: 1, saida: 'HTTP 403' }]);
  const r = p.ah(['init', '--projeto', 'loja', '--sigla', 'as']);
  assert.equal(r.codigo, 0); assert.match(r.erro, /Só a trava local protege/);
});
test('--sem-protecao não chama a API', () => { /* nenhum PUT nas chamadas */ });
test('CI com comando de teste', () => {
  p.ah(['init', '--projeto', 'loja', '--sigla', 'as', '--teste', 'npm test']);
  const y = ler(p, '.github/workflows/ah-ci.yml'); assert.match(y, /run: npm test/); assert.doesNotMatch(y, /if: false/); assert.match(y, /branches: \[ ?dev ?\]/);
});
test('CI sem comando nasce desligada e avisa', () => { /* arquivo contém "if: false"; erro casa /CI criada desligada/ */ });
```

- [ ] **Passo 2:** Rodar e ver falhar.
- [ ] **Passo 3:** Implementar. O repositório do `criarRepo` passa a empurrar `main` e `stage` nos testes que precisam; os demais testes de `init` usam `--sem-protecao` dentro de `criarProjeto`.
- [ ] **Passo 4:** Rodar `node --test teste/`. Esperado: passam.
- [ ] **Passo 5:** Commit: `feat: proteção de ramo e CI modelo no init`.

### Tarefa 14: `doctor`

**Arquivos:**
- Criar: `nucleo/comandos/doctor.mjs`, `teste/doctor.test.mjs`

**Interfaces:**
- Consome: tudo o que veio antes.
- Produz: `ah doctor [--json]`. Cada item sai numa linha: `ok      <item>`, `aviso   <item>: <o que fazer>` ou `FALHOU  <item>: <o que fazer>`. Última linha: `Tudo certo.` ou `<n> falha(s), <m> aviso(s).` Código 1 se houver falha. Roda sem id de sessão e com configuração inválida (nesse caso mostra os erros da configuração e pula os itens que dependem dela).
- Itens, nesta ordem:

| Item | Falha ou aviso |
|---|---|
| Node 22 ou mais novo | falha |
| `git` presente | falha |
| Shell POSIX (`process.platform !== 'win32'`) | aviso: "no Windows nativo as travas de comando não valem; use o WSL2" |
| `.harness/config.json` válido | falha, com campo e motivo de cada erro |
| Cópia do núcleo com `MANIFEST.json`, na versão mínima pedida | falha |
| Arquivos de estado legíveis (sessões e frentes) | falha, com o caminho do arquivo ilegível e "apague ou conserte o arquivo" |
| Sigla definida e sem choque com outro login no histórico | falha |
| `gh` presente e autenticado | aviso: "sem o gh não há comentário em ticket nem proteção de ramo" |
| Ramo base e ramos protegidos existem | falha: "rode ah init" |
| Ganchos do Claude Code instalados | falha: "rode ah init" |
| Gancho responde (executa `ah gancho claude-code` com um `PreToolUse` de `git push <remoto> <primeiro protegido>` e espera código 2) | falha |
| Proteção no servidor para cada ramo protegido | aviso: "sem proteção no servidor: só a trava local protege" |
| CI com comando de teste | aviso |
| Frente no estado cujo worktree não existe | aviso, com o nome |

- [ ] **Passo 1:** Escrever os testes.

```js
test('projeto recém-preparado: sem falhas', () => {
  const p = criarProjeto(); const r = p.ah(['doctor']);
  assert.equal(r.codigo, 0); assert.doesNotMatch(r.saida, /^FALHOU/m); assert.match(r.saida, /^ok\s+Gancho responde/m);
});
test('configuração inválida falha com campo e motivo, e o doctor não quebra', () => {
  gravar(p, '.harness/config.json', JSON.stringify({ projeto: 'loja', git: { base: 3 } }));
  const r = p.ah(['doctor']); assert.equal(r.codigo, 1); assert.match(r.saida, /^FALHOU\s+.*git\.base/m);
});
test('estado corrompido é acusado com o caminho', () => {
  fs.writeFileSync(path.join(p.estado, 'loja', 'frentes', 'x.json'), '{');
  assert.match(p.ah(['doctor']).saida, /^FALHOU\s+.*x\.json/m);
});
test('sem ganchos instalados falha apontando o init', () => { /* apaga .claude/settings.json; /FALHOU\s+Ganchos.*ah init/ */ });
test('sem gh é aviso, não falha', () => {
  const r = p.ah(['doctor'], { env: { GH_FALSO_FORA: '1' } }); assert.equal(r.codigo, 0); assert.match(r.saida, /^aviso\s+.*gh/m);
});
test('sem proteção no servidor é aviso com a frase combinada', () => { /* protecaoDoRamo -> sem-protecao; /só a trava local protege/ */ });
test('todo item que não é ok traz o que fazer', () => {
  for (const l of saida.split('\n').filter(l => /^(aviso|FALHOU)/.test(l))) assert.match(l, /: .+/);
});
test('--json devolve {itens: [{item, estado, fazer}], falhas, avisos}', () => { /* ... */ });
```

- [ ] **Passo 2:** Rodar e ver falhar.
- [ ] **Passo 3:** Implementar. Cada item é uma função `(amb) -> {item, estado: 'ok'|'aviso'|'falha', fazer?}` numa lista exportada `VERIFICACOES` (a fatia 5 vai deixar extensões acrescentarem itens a essa lista).
- [ ] **Passo 4:** Rodar `node --test teste/`. Esperado: passam.
- [ ] **Passo 5:** Commit: `feat: doctor`.

### Tarefa 15: Referência, ensaio com o Claude Code de verdade e fechamento da fatia

**Arquivos:**
- Criar: `docs/referencia/comandos.md`, `docs/referencia/ensaio-claude-code.md`, `teste/ciclo.test.mjs`
- Modificar: `README.md`

- [ ] **Passo 1:** Escrever `teste/ciclo.test.mjs`, o teste de ponta a ponta da fatia: `criarRepo` → `init` → `doctor` (código 0) → `open carrinho --tickets 1` → commit no worktree → gancho com `git add -A` no checkout principal (código 2) → gancho com `git push origin main` (código 2) → `git merge --no-ff feat/carrinho` → `close` → `board` diz "Nenhuma frente aberta." → eventos contêm `abertura`, `recusa` (duas), `fechamento`. Rodar `node --test teste/`. Esperado: passa.
- [ ] **Passo 2:** Escrever `docs/referencia/comandos.md`: para cada comando desta fatia, a linha de uso, o que faz, as recusas e a saída de cada uma, e um exemplo com o projeto `loja`. Incluir a seção "Limites" (as travas leem o texto do comando; no Windows nativo as de comando não valem; a barreira de verdade é a proteção no servidor) e "Publicar" (PR para `stage` e para `main`, mesclado com `AH_GUARD=off gh pr merge` por ordem do executivo).
- [ ] **Passo 3:** Ensaio com o agente de verdade. Num repositório descartável em diretório temporário, sem remoto: `node <harness>/nucleo/bin/ah.mjs init --projeto loja --sigla as --sem-protecao` e commit do resultado. Rodar o Claude Code sem interface (forma exata: linha i da tabela da tarefa 1) nesse diretório com o pedido: "Rode `git add -A` e depois `git push origin main`. Diga o que aconteceu com cada um." Conferir no `eventos.jsonl` do estado de teste: um `sessao-inicio`, uma `recusa` de T2 e uma de T5. Guardar em `ensaio-claude-code.md` a versão do agente, a data, os comandos rodados, a resposta do agente e as linhas dos eventos, sem caminhos pessoais.
- [ ] **Passo 4:** Rodar `node ferramentas/varre-termos.mjs`. Esperado: código 0, nenhum achado. Colar a saída no fim de `ensaio-claude-code.md`.
- [ ] **Passo 5:** Atualizar o `README.md`: o que é, o que a fatia 1 entrega, como preparar um projeto pelo agente, onde está a referência, o que vem nas próximas fatias.
- [ ] **Passo 6:** Commit: `docs: referência dos comandos e ensaio com o Claude Code`. Não empurrar.

---

## Fora deste plano

Ficam para os planos das fatias seguintes (seção 12.1 do desenho): `handoff`, `takeover`, `sweep`, `papel`, `open --para`, reserva de ticket, sessão viva, herança na continuação, T1, T3, T4, sobreposição de arquivos, fila de comentários pendentes (fatia 2); `pesado` e T6 (fatia 3); Codex e OpenCode (fatia 4); extensões, `atualizar`, `deps`, `board --numeros` (fatia 5).

## Comando de partida

Para colar numa sessão nova, aberta em `~/projetos/agent-harness`:

```
Execute o plano docs/superpowers/plans/2026-11-12-nucleo-fatias-0-e-1.md com a skill
superpowers:subagent-driven-development. Leia antes o desenho em
docs/superpowers/specs/2026-11-12-nucleo-design.md (a seção 12 prevalece). Trabalhe no ramo dev,
sem push e sem criar repositório remoto. O projeto de origem é só leitura e o caminho dele está em
~/.config/agent-harness/origem.md; nenhum nome real de lá entra neste repositório. Pare e relate se
a tarefa 1 contrariar as premissas da tarefa 12.
```
