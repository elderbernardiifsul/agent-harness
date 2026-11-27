# Fatias 3 e 4 do método: registros da execução por subagentes e níveis de modelo

> **Para agentes que executam:** skill obrigatória: superpowers:subagent-driven-development (recomendada) ou superpowers:executing-plans, tarefa por tarefa. Os passos usam caixas (`- [ ]`) para o acompanhamento.

**Objetivo:** levar para o projeto do aluno a extensão `registros` (o diário do subagent-driven-development sobrevive ao worktree, viajando no ticket) e a extensão `modelo` (níveis `alto`, `medio`, `leve` traduzidos por agente), com as duas mudanças do núcleo aprovadas: P2 (`ctx.sessao(id)`) e P5 (a extensão declara os caminhos ignorados que ela guarda).

**Arquitetura:** as duas mudanças do núcleo são acréscimos compatíveis à interface v1 (`nucleo/lib/extensoes.mjs`, `nucleo/comandos/close.mjs`), sem mudar `VERSAO_DA_INTERFACE`. As extensões moram em `nucleo/extensoes/registros/` e `nucleo/extensoes/modelo/`. A leitura e a escrita do diário ficam num módulo puro (`diario.mjs`), testado sem disco de projeto; o `extensao.mjs` só liga esse módulo ao ciclo (comando, reações, resumo).

**Tecnologia:** Node 22 ou mais novo, módulos ES, sem dependências; `node --test`; `gh` falso de `teste/apoio/gh-falso.mjs`; projetos descartáveis de `teste/apoio/repo.mjs`.

**Spec:** `docs/superpowers/specs/2026-11-26-metodo-design.md` (seções 3, 8, 9, 15 e 17). Orquestração: `docs/superpowers/plans/2026-11-26-metodo-orquestracao.md`.

**Registro da execução:** `docs/superpowers/plans/2026-11-26-metodo-fatias-3-e-4-registro.md`.

## Restrições globais

- Node 22 ou mais novo, módulos ES, sem dependências externas; testes primeiro; nenhum teste usa rede real.
- "o harness sugere e registra; só as travas recusam. Etapa do método e escolha de modelo nunca são motivo de recusa." Nenhuma reação de `registros` ou `modelo` recusa; `antesDeFechar` não é usada.
- Toda recusa de comando diz o motivo e o próximo passo (`Recusado: …` / `Faça: …`, via `ctx.ErroDeUso('<motivo>\nPróximo passo: <o que fazer>')`).
- Só os arquivos da linha `p2-registros-modelo` da tabela "Quem toca o quê". `nucleo/comandos/board.mjs` não muda (a coluna sai pela interface). Arquivo novo fora da lista: avisar o orquestrador antes.
- Mudança de comportamento atualiza no mesmo commit `docs/referencia/comandos.md` (só as seções `close`, `registros`, `modelo`) e `docs/extensoes/interface.md`.
- Textos em português, para aprendizes; cada arquivo novo começa por um comentário com a dor que ele resolve. Exemplos com nomes inventados (a loja, Ana Souza, Carla). Nenhum nome do projeto de origem.
- Antes de cada commit: `npm test` verde e `node ferramentas/varre-termos.mjs` com código 0 (código 2: parar e avisar o orquestrador). Ao terminar: `node ferramentas/verifica.mjs --node "$(mise where node@22)/bin/node" --node "$(command -v node)"` com código 0.
- `git add` só com caminhos. Sem push, sem merge. Commits terminam com a linha `Co-Authored-By` do agente.

## O que o subagent-driven-development 7.0.2 faz (conferido no código em 26/11)

- `scripts/sdd-workspace PLAN_FILE` cria `<raiz do worktree>/.superpowers/sdd/<nome do plano sem .md>/` (com sufixo `-<pasta-mãe>` ou `-<pasta-mãe>-<n>` quando o nome colide), grava ali `plan-path` com o caminho do plano relativo à raiz, e cria `.superpowers/sdd/.gitignore` com `*` (só se não existir).
- O diário é `<pasta do plano>/progress.md`. Primeira linha: `# SDD ledger — plan: <caminho do plano>`. Linhas que a extensão reconhece: `Task <N>: complete (commits <a7>..<b7>, review clean)`, `Task <N>: complete (commits <a7>..<b7>, <K> parked)`, `Task <N>: fix round <R>/5 (…)`, `Task <N>: minor (deferred): …`, `Task <N>: parked — … — Ruling: …` e qualquer linha com `Ruling:`.
- Retomada (`references/resuming.md`): se o diário existe e a primeira linha nomeia o plano, as tarefas com `Task <N>: complete` estão feitas. Devolver `progress.md` e `plan-path` à pasta do plano basta para a skill continuar.
- Fim (`references/final-review.md`): com a revisão final limpa, a skill apaga a pasta do plano.
- O que o git mostra, ensaiado com git 2.56 em 26/11: `git ls-files -o -i --exclude-standard --directory` num worktree com só `.superpowers/sdd/<plano>/` lista `.superpowers/`, `.superpowers/sdd/`, `.superpowers/sdd/.gitignore` e `.superpowers/sdd/<plano>/`. Com outro ignorado em `.superpowers/` (ex.: `.superpowers/x.log`), ele aparece também na lista.

## Decisões de forma (ficam com quem constrói, seção 16 da spec)

- **P5, campo novo `ignorados`** no `export default` (interface fixada pelo orquestrador em 26/11, também usada pela fatia 8): `ignorados(ctx) -> [{caminho, descartavel?: true, guardar?: '<comando>'}]`, com `ctx.frente` definida. `caminho` é relativo ao worktree (um arquivo, ou uma pasta terminada em `/`). Cada item tem `descartavel: true` ou `guardar` (um dos dois). A extensão `registros` devolve `{caminho: '.superpowers/sdd/', guardar: 'tools/ah registros guardar --frente <nome da frente>'}`, montado com `ctx.frente.nome`.
- **No `close`:** o item que casa com um `descartavel` não conta como perda (é refeito a partir do estado; exemplo: o arquivo de ambiente da extensão `ambiente`) e sai com o `git worktree remove`, que já apaga ignorados. O que casa com `guardar` recusa com o próximo passo apontando o comando da extensão. O resto segue como hoje. A função que lança, devolve forma inválida ou promessa que rejeita: o close avisa (`Aviso: a extensão <nome> falhou em ignorados: …`) e trata os itens dela como hoje. O `--descartar-ignorados` continua valendo para todos.
- **Regra de cobertura:** um item casa com um declarado quando é o caminho dele ou fica dentro dele; um item que é pasta-mãe de um declarado (`.superpowers/`) casa quando todos os itens da lista dentro dela casam com declarados. Pasta-mãe que só tem descartáveis conta como descartável; com algum `guardar`, como guardada.
- **P2:** `ctx.sessao(id)` devolve a cópia congelada de `<estado>/sessoes/<id>.json` (pela `lerSessao`), ou `null` quando não há id, não há estado, o arquivo não existe ou não se lê. Nunca lança.
- **Cópia local do diário:** `<dirEstado>/registros/<frente.id>/<pasta do plano>/progress.md` e `meta.json` (`{id, nome, pasta, plano, commit, guardadoEm, tickets: {<n>: 'comentado'|'pendente'}, cortado}`). O id da frente (`as-1`) não se repete na máquina; o nome pode.
- **Marcador do comentário:** `<!-- ah:registro id=<id> nome=<nome> pasta=<pasta> plano=<plano> commit=<sha7> cortado=<0|1> v=1 -->`, com cada valor em `encodeURIComponent`. O resumo do fechamento usa `<!-- ah:registro-resumo id=<id> nome=<nome> v=1 -->`.
- **Corte:** diário reconhecido (primeira linha `# SDD ledger — plan:`) vai inteiro até 60 000 caracteres; acima disso, ou em formato não reconhecido, vai cortado (60 000 e 4 000 caracteres, respectivamente), com `cortado=1` e uma linha que diz o motivo. Diário cortado não é devolvido na retomada.
- **Sem rede no `guardar`:** a cópia local vale como guarda; a pasta sai do worktree mesmo assim, o ticket fica `pendente` em `meta.json` e o `depoisDeFechar` comenta o pendente antes do resumo.

## Foco da revisão

1. Pasta-mãe `.superpowers/` com outro ignorado dentro (`.superpowers/x.log`): o `close` recusa pelo item de fora com a mensagem de hoje e aponta o `registros guardar` só para os itens dele; nenhum item de fora passa por descartável. Teste na Tarefa 2.
2. `gh` sem rede (`GH_FALSO_FORA=1`) no `guardar`: código 0, cópia gravada, pasta removida, aviso com o próximo passo; o `close` seguinte comenta o pendente. Teste na Tarefa 5.
3. Diário maior que o limite de comentário do GitHub (65 536): sai cortado com o aviso, nunca falha. Teste na Tarefa 4.
4. Dois planos no mesmo worktree: um comentário e uma cópia por plano; a retomada devolve os dois. Testes nas Tarefas 5 e 6.
5. `registros guardar --frente <outra>` com a dona viva (pode estar no meio da execução): recusa, porque apagaria a pasta de trabalho de outra sessão. Teste na Tarefa 5.

---

### Tarefa 1: P2, `ctx.sessao(id)` na interface

**Nível: leve**

**Arquivos:**
- Modificar: `nucleo/lib/extensoes.mjs` (`montarCtx`)
- Modificar: `nucleo/lib/extensoes-teste.mjs` (`ctxFalso`)
- Modificar: `docs/extensoes/interface.md` (tabela do contexto e a seção dos auxiliares de teste)
- Teste: `teste/extensoes.test.mjs`, `teste/extensoes-auxiliares.test.mjs`

**Interfaces:**
- Produz: `ctx.sessao(id) -> registro congelado | null`; `ctxFalso({sessoes: {<id>: registro}})`.

- [ ] **Passo 1: testes que falham**
  - Em `teste/extensoes.test.mjs`, `test('ctx.sessao lê o registro da sessão, só de leitura, e devolve null sem ele')`: com `criarProjeto`, uma extensão de teste com um comando que escreve `JSON.stringify([ctx.sessao(ctx.sessaoId)?.agente ?? null, ctx.sessao('nao-existe'), ctx.sessao(null), Object.isFrozen(ctx.sessao(ctx.sessaoId) ?? {})])`. Antes, registrar a sessão pelo gancho de início (como os testes do quadro já fazem) com `agente: 'claude-code'` e `modelo: 'modelo-de-teste'`. Esperado: `["claude-code",null,null,true]`. Um segundo caso com o arquivo da sessão quebrado (`{`): `ctx.sessao(id)` devolve `null` e o comando sai 0.
  - Em `teste/extensoes-auxiliares.test.mjs`, `test('ctxFalso responde ctx.sessao pela opção sessoes')`: `ctxFalso({sessoes: {'sessao-b-0002': {id: 'sessao-b-0002', modelo: 'leve-1'}}})`; `ctx.sessao('sessao-b-0002').modelo === 'leve-1'`, congelado; `ctx.sessao('outra') === null`.
- [ ] **Passo 2:** `node --test teste/extensoes.test.mjs teste/extensoes-auxiliares.test.mjs` falha com `ctx.sessao is not a function`.
- [ ] **Passo 3:** em `montarCtx`, `sessao(id)` com `lerSessao` de `./sessao.mjs` dentro de `try`, devolvendo `copiaSoDeLeitura(registro)`; em `ctxFalso`, parâmetro `sessoes = {}` e `sessao: id => copia(sessoes[id] ?? null)`. Comentário ao lado: para que serve (a coluna de modelo lê o modelo da sessão dona) e por que não lança.
- [ ] **Passo 4:** na tabela do contexto de `interface.md`, linha `sessao(id)`; na seção dos auxiliares, a opção `sessoes`; uma frase dizendo que é acréscimo compatível de 26/11 (P2) e que a versão continua 1.
- [ ] **Passo 5:** os testes passam; `npm test` e `node ferramentas/varre-termos.mjs` com código 0.
- [ ] **Passo 6:** commit `feat(extensoes): ctx.sessao(id) lê o registro da sessão (P2)`.

### Tarefa 2: P5, a extensão declara os ignorados de que cuida (descartáveis ou guardados pelo comando dela)

**Nível: alto** (o `close` é a peça que protege trabalho; a regra de cobertura não pode esconder um ignorado de fora)

**Arquivos:**
- Modificar: `nucleo/lib/extensoes.mjs` (`CAMPOS`, `errosDaForma`, nova `ignoradosDasExtensoes`)
- Modificar: `nucleo/comandos/close.mjs` (a conferência perto da linha 133 e a carga antes da fase 1)
- Modificar: `docs/extensoes/interface.md` (campo `ignorados` na forma e seção própria), `docs/referencia/comandos.md` (seção `close`)
- Teste: `teste/extensoes.test.mjs`, `teste/close.test.mjs`

**Interfaces:**
- Produz: campo `ignorados(ctx)` no `export default`; em `extensoes.mjs`, `ignoradosDasExtensoes(amb, frente) -> {declarados: [{extensao, caminho, descartavel, guardar}], falhas: [{extensao, motivo}]}` (nunca lança; valida cada item devolvido) e `separarIgnorados(itens, declarados) -> {descartaveis: [itens], guardados: [{extensao, guardar, itens}], outros: [itens]}` (pura, exportada para o teste).

- [ ] **Passo 1: testes que falham**
  - `teste/extensoes.test.mjs`: `errosDaForma` recusa `ignorados` que não é função (`ignorados deve ser uma função (ctx) -> [{caminho, descartavel, guardar}]`) e aceita a função. `ignoradosDasExtensoes` com extensões falsas: item sem `caminho` texto, `caminho` absoluto ou com `..`, item sem `descartavel: true` nem `guardar` texto, ou com os dois, vira falha com o motivo; função que lança ou devolve promessa rejeitada vira falha; a válida volta em `declarados`. Só o item inválido sai; os válidos da mesma extensão continuam valendo (decisão da revisão de 27/11).
  - `separarIgnorados` com a lista do ensaio: `['.superpowers/', '.superpowers/sdd/', '.superpowers/sdd/.gitignore', '.superpowers/sdd/plano-a/']` e `{caminho: '.superpowers/sdd/', guardar: 'g'}` fica toda num grupo guardado; somando `'.superpowers/x.log'`, `outros` é `['.superpowers/', '.superpowers/x.log']`; com `{caminho: '.env.frente', descartavel: true}`, o item `.env.frente` vai a `descartaveis`; `'.env'` sempre em `outros`.
  - `teste/close.test.mjs`, ponta a ponta, com uma extensão de teste em `.harness/extensoes/cache-local/` cujo `ignorados(ctx)` devolve `{caminho: '.cache-local/', guardar: \`tools/ah cache-local salvar --frente ${ctx.frente.nome}\`}` e `{caminho: '.env.frente', descartavel: true}`, e um `.gitignore` no worktree que ignora os dois e `.env`:
    - com `.cache-local/`: código 1, saída com `itens ignorados que a extensão cache-local guarda (1)` e `tools/ah cache-local salvar --frente carrinho`, sem `--descartar-ignorados` nessa linha;
    - só com `.env.frente`: fecha, e o worktree some;
    - com `.env` também: a linha do `.env` igual à de hoje;
    - extensão cujo `ignorados` lança: o aviso `falhou em ignorados` e a recusa de hoje para `.cache-local/`;
    - sem a extensão ligada: só a mensagem de hoje; com `--descartar-ignorados`: fecha.
- [ ] **Passo 2:** os testes falham (campo desconhecido; mensagem de hoje).
- [ ] **Passo 3:** `ignorados` em `CAMPOS` e em `errosDaForma`; `ignoradosDasExtensoes` e `separarIgnorados` em `extensoes.mjs`. No `close`, a lista de declarados é lida para a frente na fase 1 (sob a trava, depois de ler a frente) e passada à `conferir`, que a reusa na conferência final; as falhas viram aviso. Os `descartaveis` saem da lista de problemas; cada grupo guardado vira o problema `itens ignorados que a extensão <ext> guarda (<n>); saída: <guardar> e repita ah close (o --descartar-ignorados apagaria junto)`, com a lista cortada; os `outros` seguem com o texto de hoje. A regra da pasta-mãe vai escrita ao lado do código, com o resultado do ensaio do git.
- [ ] **Passo 4:** `interface.md`: `ignorados(ctx)` no bloco da forma e uma seção "Ignorados que a extensão cuida" (formato, `descartavel` e `guardar`, regra de cobertura, função que falha, que o close só aponta e nunca roda o comando, acréscimo compatível de 26/11, P5). `comandos.md`, seção `close`: as duas mudanças da conferência de ignorados.
- [ ] **Passo 5:** testes, `npm test`, varredura.
- [ ] **Passo 6:** commit `feat(close): a recusa por item ignorado aponta o comando da extensão que o guarda (P5)`.

### Tarefa 3: extensão `modelo`

**Nível: medio**

**Arquivos:**
- Criar: `nucleo/extensoes/modelo/extensao.mjs`, `nucleo/extensoes/modelo/padroes.json`
- Modificar: `docs/referencia/comandos.md` (seção nova `modelo`, depois de `recursos`)
- Teste: `teste/modelo.test.mjs`
- Registro: `docs/superpowers/plans/2026-11-26-metodo-fatias-3-e-4-registro.md` (fontes e data)

**Interfaces:**
- Consome: `ctx.sessao(id)` (Tarefa 1).
- Produz: `padroes.json` = `{data: 'AAAA-MM-DD', fontes: {<agente>: [url]}, agentes: {<agente>: {alto|medio|leve: {modelo, esforco}}}}`; configuração `extensoes.modelo = {agentes: {<agente>: {<nível>: {modelo?, esforco?}}}}`, mesclada campo a campo sobre o padrão (agente novo vale); `traduzir(nivel, agente, ctx) -> {agente, nivel, modelo, esforco, origem: 'padrao'|'projeto'}`; coluna `MODELO`.

- [ ] **Passo 1: pesquisa dos padrões.** Na documentação oficial de cada agente (Claude Code, Codex, OpenCode), na data de hoje: os nomes de modelo aceitos (alias quando houver) e os valores de esforço aceitos, e onde cada um se passa (opção de linha de comando, configuração, subagente). Escolher um par por nível (`alto`: o mais capaz com esforço alto; `medio`: o padrão de trabalho; `leve`: o mais barato). Registrar no registro a tabela, cada URL, a data e a versão do agente instalada nesta máquina (`claude --version`, `codex --version`, `opencode --version`). Nada de memória: só o que a página diz. No OpenCode, o modelo é `provedor/modelo` e depende do provedor do aluno: o padrão usa um provedor documentado e o texto diz que o projeto troca.
- [ ] **Passo 2: testes que falham** (`teste/modelo.test.mjs`, com `criarProjeto` e `extensoes.modelo: true`):
  - `ah modelo alto --agente claude-code` sai 0 com uma linha `alto (claude-code): modelo <m>, esforço <e>` igual ao `padroes.json`; o mesmo para `codex` e `opencode` e para os três níveis (laço sobre o arquivo).
  - `ah modelo leve --json` devolve `{nivel: 'leve', padroesDe: <data>, traducoes: [3 itens, um por agente, com origem 'padrao']}`.
  - `ah modelo` sem nível: tabela com os três níveis por agente, a data dos padrões e a linha `Critérios: docs/agents/metodo.md (nível de modelo).`; `--json` devolve `{padroesDe, traducoes: [9 itens]}`.
  - Configuração `{agentes: {codex: {leve: {modelo: 'modelo-da-loja'}}}}`: o `leve` do codex sai com `modelo-da-loja`, o esforço do padrão e `origem: 'projeto'`; os outros, do padrão.
  - `ah modelo altissimo`: código 1, `Recusado: Nível desconhecido: altissimo.` e `Faça: use alto, medio ou leve (tools/ah modelo mostra a tabela)`. `--agente cursor`: recusa com os agentes conhecidos e `acrescente o agente em extensoes.modelo.agentes`.
  - `validarConfig` recusa nível fora dos três e campo que não é texto (`carregarParaTeste`).
  - Coluna: com a sessão dona registrada com `modelo: 'modelo-de-teste'`, `ah board --json` dá `colunas.modelo.MODELO === 'modelo-de-teste'`; frente sem dona ou sessão sem modelo, `—`.
  - O comando roda sem sessão (`requisitos: {sessao: false}`): sem `AH_SESSAO`, `ah modelo` sai 0.
- [ ] **Passo 3:** os testes falham (extensão não carrega).
- [ ] **Passo 4:** `padroes.json` com a pesquisa; `extensao.mjs` com `comandos.modelo`, `validarConfig` e `colunas`. Cabeçalho: a dor (modelo grande em trabalho pequeno; nomes de modelo presos no texto) e o princípio (nunca recusa por modelo; só erro de uso).
- [ ] **Passo 5:** seção `modelo` em `comandos.md` (uso, saída, configuração, a data dos padrões e de onde vieram).
- [ ] **Passo 6:** testes, `npm test`, varredura; commit `feat(modelo): níveis alto, medio e leve traduzidos por agente`.

### Tarefa 4: leitura e formato do diário (`registros/diario.mjs`)

**Nível: medio**

**Arquivos:**
- Criar: `nucleo/extensoes/registros/diario.mjs`
- Teste: `teste/registros-diario.test.mjs`

**Interfaces:**
- Produz (todas puras, sem rede; as que leem disco recebem caminhos):
  - `acharDiarios(worktree) -> [{pasta, plano, arquivo, texto}]`: cada `.superpowers/sdd/<pasta>/progress.md`; `plano` vem de `plan-path`, senão da primeira linha, senão `null`.
  - `lerDiario(texto) -> {reconhecido, plano, concluidas: [{tarefa, de, ate, revisao}], paradas: [{tarefa, ultima}], decisoes: [texto]}`; `paradas` são as tarefas citadas sem linha `complete`, com a última linha delas.
  - `corpoDoDiario({frente, diario, commit}) -> {corpo, cortado}`, com o marcador e o corte da seção "Decisões de forma".
  - `lerMarcador(corpo) -> {id, nome, pasta, plano, commit, cortado} | null` e `diarioDoComentario(corpo) -> texto | null`.
  - `resumoDoFechamento({frente, copias: [{pasta, plano, texto}]}) -> corpo` com o marcador `ah:registro-resumo`.
  - `devolverDiario(worktree, {pasta, plano, texto})`: grava `progress.md` e `plan-path` e cria `.superpowers/sdd/.gitignore` com `*` só se faltar.

- [ ] **Passo 1: testes que falham**, com um diário de exemplo escrito no teste (plano `docs/superpowers/plans/2026-11-20-carrinho.md`, Task 1 e 2 `complete`, Task 3 com `fix round 2/5`, uma linha `Ruling:`):
  - `lerDiario`: `concluidas` com as tarefas 1 e 2, os commits e `review clean`/`1 parked`; `paradas` = `[{tarefa: 3, ultima: 'Task 3: fix round 2/5 (…)'}]`; uma decisão.
  - `corpoDoDiario` → `lerMarcador` e `diarioDoComentario` devolvem os mesmos campos e o mesmo texto (ida e volta), inclusive com um plano com espaço no caminho e um diário com uma cerca de três crases dentro.
  - Diário sem a primeira linha conhecida: `cortado: true` em 4 000 caracteres e a linha `Formato não reconhecido`; diário reconhecido de 70 000 caracteres: cortado em 60 000 com a linha do corte, e o corpo inteiro abaixo de 65 536.
  - `resumoDoFechamento`: uma linha por plano com `2 tarefas concluídas`, `1 parada (Task 3: fix round 2/5)`, `1 decisão`, e o caminho do plano.
  - `acharDiarios` e `devolverDiario` numa pasta temporária, com dois planos: ida e volta igual, e `.gitignore` existente não é reescrito.
- [ ] **Passo 2:** falham (módulo ausente).
- [ ] **Passo 3:** implementar. A cerca do bloco de código tem sempre uma crase a mais que a maior sequência de crases do diário. Comentário de cabeçalho com o formato da 7.0.2 e o aviso de que a leitura é tolerante.
- [ ] **Passo 4:** testes, `npm test`, varredura; commit `feat(registros): leitura e formato do diário da execução por subagentes`.

### Tarefa 5: `ah registros guardar`, `ignorados` e `aoPassar`

**Nível: alto** (apaga uma pasta do worktree e escreve no ticket)

**Arquivos:**
- Criar: `nucleo/extensoes/registros/extensao.mjs`
- Modificar: `docs/referencia/comandos.md` (seção nova `registros`, depois de `modelo`)
- Teste: `teste/registros.test.mjs`

**Interfaces:**
- Consome: `diario.mjs` (Tarefa 4); campo `ignorados(ctx)` (Tarefa 2): a `registros` devolve `[{caminho: '.superpowers/sdd/', guardar: \`tools/ah registros guardar --frente ${ctx.frente.nome}\`}]`.
- Produz: `guardar(frente, ctx, {remover}) -> {planos: n, comentados: [n], pendentes: [n]}`, usada pelo comando e pelo `aoPassar`; a cópia local da seção "Decisões de forma".

- [ ] **Passo 1: testes que falham** (`criarProjeto`, `extensoes.registros: true`, ticket semeado no `gh` falso, diário escrito à mão em `<worktree>/.superpowers/sdd/<plano>/` como o `sdd-workspace` faria):
  - `ah open carrinho --tickets 7`, diário, `ah registros guardar`: código 0; o ticket 7 tem um comentário com `<!-- ah:registro id=as-1` e o diário; a cópia existe em `<estado>/registros/as-1/<pasta>/`; `.superpowers/` sumiu do worktree; `ah close` em seguida, sem `--descartar-ignorados`, sai 0.
  - Sem `guardar`: `ah close` recusa e a saída tem `tools/ah registros guardar --frente carrinho`.
  - Dois planos: dois comentários e duas cópias.
  - Frente sem ticket: só a cópia, e o aviso `sem ticket: o diário ficou só nesta máquina (<caminho>)`.
  - `GH_FALSO_FORA=1`: código 0, cópia com o ticket `pendente`, pasta removida, aviso com o próximo passo.
  - Sem diário: `Nenhum diário em <worktree>/.superpowers/sdd/.` e código 0.
  - `--frente frete` com a dona viva (sessão B registrada e viva): código 1, recusa com a dona; com a frente passada: guarda.
  - Esta sessão sem frente e sem `--frente`: a recusa `Esta sessão não tem frente.` / `abra uma com ah open <nome>, ou diga qual com --frente <nome>`.
  - `ah handoff` com diário: comentário no ticket, cópia gravada e a pasta continua no worktree.
  - Arquivo do aluno em `.superpowers/sdd/` (`.superpowers/sdd/minhas-notas.txt`): o `guardar` remove só as pastas de plano que guardou (as que têm `plan-path` ou `progress.md`) e o `.gitignore` que o `sdd-workspace` cria; o resto fica, com o aviso do que sobrou, e o `close` seguinte recusa como sempre (revisão de 27/11).
- [ ] **Passo 2:** falham.
- [ ] **Passo 3:** `extensao.mjs` com `comandos.registros` (`guardar [--frente <nome>]`, subcomando desconhecido recusa com o uso), `ignorados(ctx)` e `reacoes.aoPassar` (chama `guardar` com `remover: false`; erro vira aviso pelo núcleo). Comentário pelo `ctx.gh(['issue', 'comment', n, '--body-file', '-'], {entrada})`. Cabeçalho com a dor (o diário some com o worktree, e o próprio subagent-driven-development o apaga no fim limpo) e os dois momentos em que o `metodo.md` manda rodar o comando.
- [ ] **Passo 4:** seção `registros` em `comandos.md`.
- [ ] **Passo 5:** testes, `npm test`, varredura; commit `feat(registros): ah registros guardar leva o diário ao ticket e libera o close`.

### Tarefa 6: retomada, resumo no fechamento e linha do começo de sessão

**Nível: alto** (corre dentro da trava do `close` e decide o que devolver ao worktree)

**Arquivos:**
- Modificar: `nucleo/extensoes/registros/extensao.mjs`, `docs/referencia/comandos.md` (seção `registros`)
- Teste: `teste/registros.test.mjs`

**Interfaces:**
- Consome: `guardar`, `diario.mjs`.
- Produz: `reacoes.depoisDeAbrir`, `reacoes.depoisDeFechar`, `resumo`.

- [ ] **Passo 1: testes que falham**
  - Retomada em outra máquina (`outraMaquina`): A abre com o ticket 7, escreve o diário de dois planos, `ah handoff`; B roda `ah open carrinho`: o worktree de B tem os dois `progress.md` e `plan-path` iguais aos de A e o `.gitignore` da pasta; a saída diz `Registros: devolvi o diário de 2 plano(s)`.
  - Retomada com o diário já no worktree (mesma máquina): nada muda.
  - Comentário com `cortado=1`: não devolve e avisa `o diário no ticket está cortado; não devolvi`.
  - Fechamento: depois do `guardar`, `ah close` comenta no ticket o `ah:registro-resumo` com as contagens e apaga a cópia local.
  - Fechamento com ticket `pendente`: o close comenta primeiro o diário e depois o resumo.
  - Fechamento sem ticket: o resumo sai na saída do close e a cópia fica.
  - Fechamento sem cópia: a linha `Registros: nenhum diário guardado para a frente as-1.` e nada no ticket.
  - Resumo do começo de sessão: com diário no worktree diferente da cópia (ou sem cópia), a linha `Registros: o worktree da frente tem diário não guardado (1 plano); rode tools/ah registros guardar antes do ah close.`; depois do `guardar`, sem linha.
  - Nenhuma dessas reações recusa: com o `gh` fora do ar, o close termina.
- [ ] **Passo 2:** falham.
- [ ] **Passo 3:** implementar. Origem da retomada: a cópia local de `<estado>/registros/<id>/`, senão o comentário mais novo de cada pasta nos tickets (`ctx.gh(['issue', 'view', n, '--json', 'comments'])`), com o `id` da frente no marcador. O `depoisDeFechar` roda sob a trava `frentes` do close: cada `gh` tem o prazo de 15 s do núcleo; escrever isso ao lado do código.
- [ ] **Passo 4:** completar a seção `registros` em `comandos.md` (retomada, fechamento, resumo).
- [ ] **Passo 5:** testes, `npm test`, varredura; commit `feat(registros): devolve o diário na retomada e resume a execução no fechamento`.

### Tarefa 7: verificação final e registro

**Nível: leve**

**Arquivos:**
- Criar ou completar: `docs/superpowers/plans/2026-11-26-metodo-fatias-3-e-4-registro.md`

- [ ] **Passo 1:** `node ferramentas/verifica.mjs --node "$(mise where node@22)/bin/node" --node "$(command -v node)"` com código 0; a saída vai no registro.
- [ ] **Passo 2:** no registro: commits, a pesquisa de modelos (Tarefa 3), o ensaio do git, as decisões de forma e as pendências para o orquestrador. Entre elas, o texto que o `metodo.md` (fatia 2, ramo `p2-metodo`) precisa ter: quando rodar `tools/ah registros guardar` (no fim do subagent-driven-development, antes de a skill apagar a pasta do plano, e antes do `ah close`) e a marca `Nível: alto|medio|leve` em cada tarefa do plano com `tools/ah modelo <nível>`; e a linha do mapa de extensões que a preparação liga (`registros`, `modelo`).
- [ ] **Passo 3:** commit `docs(metodo): registro das fatias 3 e 4`.
