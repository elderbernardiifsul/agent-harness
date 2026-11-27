# Método, fatia 2: o `AGENTS.md` de princípios e o guia de como começar — plano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** o projeto que recebe o método ganha `docs/agents/metodo.md` (trilhas, um dono por etapa, atritos, paralelismo, nível de modelo, registros, segredos), mantido pelo `tools/ah metodo instalar` com a mesma proteção das skills; o trecho do `AGENTS.md` aponta para ele; um teste e o `doctor` garantem que toda skill citada existe; e o repositório ganha o guia `docs/guia/comecar.md`, para um aprendiz (ou um agente) sair do endereço do repositório e trabalhar com o método.

**Architecture:** tudo na extensão `nucleo/extensoes/metodo/`, sem mexer no núcleo. O texto do método mora em `modelos/metodo.md` e é copiado pelo `sincronizar` para `docs/agents/metodo.md`. A trava ganha um campo opcional `documentos` com o hash do texto instalado, e o `sincronizar` decide pelo hash se pode reescrever o arquivo (igual à trava ou ausente) ou se recusa (mudado à mão, sem `--forcar`). Um módulo pequeno, `citadas.mjs`, extrai as skills citadas num texto por uma convenção de escrita; o teste e o `doctor` usam o mesmo módulo. O guia fica em `docs/guia/`, no repositório, e o README aponta para ele numa linha.

**Tech Stack:** Node 22+, módulos ES, sem dependências; `node:test`; git; o `gh` falso de `teste/apoio/`.

**Spec:** `docs/superpowers/specs/2026-11-26-metodo-design.md` (seções 6 "Conferências do doctor" e "Quais skills entram", 7 inteira, 8, 9, 17 "Fatia 2"). Notas do autor: `docs/superpowers/specs/2026-11-12-notas-para-o-metodo.md`. Objetivo do autor de 26/11: `docs/superpowers/plans/2026-11-26-metodo-orquestracao.md`, seção "Objetivo dado pelo autor".

**Pré-requisito.** A fatia 1 entregue em `p2-metodo` até a Task 7 dela (`metodo atualizar`, `verificacoes` da extensão com `teste/metodo-doctor.test.mjs`, seção do README "Instalar num projeto (instruções para o agente)" e `teste/metodo-textos.test.mjs`). Antes da Task 1, confira com `git log --oneline` que esses commits estão no ramo; se faltar algum, pare e avise o orquestrador. Onde este plano diz "como a fatia 1 fez", siga o código que está no ramo, não este texto.

## Global Constraints

- Node 22 ou mais novo, módulos ES, sem dependências externas.
- Testes primeiro: veja o teste falhar antes de implementar. Nenhum teste usa rede real.
- Antes de cada commit: `npm test` verde e `node ferramentas/varre-termos.mjs` com código 0 (código 2: pare e avise o autor). Antes de relatar a fatia pronta: `node ferramentas/verifica.mjs --node "$(mise where node@22)/bin/node" --node "$(command -v node)"` com código 0.
- Textos em português, para aprendizes: legíveis por um concluinte de Ciência da Computação. Exemplos com nomes inventados (a loja, Ana Souza, Carla). Nenhum nome do projeto de origem.
- Toda recusa diz o motivo e o próximo passo (`new ctx.ErroDeUso('<motivo>\nPróximo passo: <o que fazer>')`).
- O harness sugere e registra; só as travas recusam. O método nunca recusa: trilha pulada, plano sem nível ou registro não guardado não são motivo de recusa. As conferências do `doctor` desta fatia são aviso.
- Uma regra mora num lugar só; os outros apontam. O ciclo do `ah` está em `docs/agents/sessoes-paralelas.md`; a regra dos prefixos e a tabela das skills citadas e não instaladas estão no trecho do `AGENTS.md`; o resto do método está no `metodo.md`.
- O domain-modeling grava `GLOSSARY.md` (não `CONTEXT.md`); o texto do método usa `GLOSSARY.md` e `docs/adr/`.
- Mudança de comportamento atualiza `docs/referencia/comandos.md` (seção `metodo`) no mesmo commit.
- Ensaios com agente real: pasta descartável fora do rascunho de sessão (`/tmp/ah-lab-<nome>`), `HOME` descartável, sem plugins nem skills de usuário da máquina (spec, seção 17; registro da fatia 1, "Achado do isolamento").
- Push, merge em `stage`/`main` e publicação só com ordem do autor.
- Cada tarefa traz o nível de modelo (`Nível: alto|medio|leve`) para quem distribui.

## Convenção de escrita das skills citadas

Vale para `modelos/metodo.md`, `modelos/agents-metodo.md` e `docs/guia/comecar.md`, e é o que torna o teste e o `doctor` determinísticos:

- **Código inline de uma palavra só, em minúsculas (letras, dígitos e hífen, começando por letra), é nome de skill.** Exemplo: `` `writing-plans` ``.
- Todo o resto que vai em código inline tem barra, ponto, espaço, dois-pontos ou sinal: `` `tools/ah open` ``, `` `GLOSSARY.md` ``, `` `Nível: medio` ``, `` `--forcar` ``. Nome de extensão, de ramo, de agente e de nível vai sem código ("a extensão registros", "a base (dev)", "nível alto").
- Bloco de código cercado por ```` ``` ```` não conta.

O teste da Task 1 falha com uma mensagem que explica a convenção quando um texto a quebra.

## Review Focus

1. **`docs/agents/metodo.md` que o aluno já tinha antes do método** (trava sem `documentos`, arquivo com outro conteúdo): a instalação não pode apagá-lo; recusa sem `--forcar`, com o caminho na lista. Teste na Task 3.
2. **Projeto instalado antes desta fatia** (trava sem `documentos`, sem `metodo.md`): o `metodo instalar` cria o documento e regrava a trava; antes disso o `doctor` avisa "rode tools/ah metodo instalar", e não falha. Testes nas Tasks 3 e 4.
3. **Checkout com fim de linha CRLF** (git com `core.autocrlf` no Windows): o `metodo.md` igual ao instalado, só com CRLF, não é "mudado à mão" nem na instalação nem no `doctor`. Teste nas Tasks 3 e 4.
4. **Skill de extensão desligada citada no texto** (por exemplo, quando a orquestração integrar e o `metodo.md` citar a skill dela): o `doctor` não avisa, porque a falta é esperada. Teste na Task 4.
5. **`docs/agents/metodo.md` como link simbólico**: não é seguido nem trocado; vira aviso com o conserto, e a instalação termina. Teste na Task 3.

---

### Task 1: O texto do método, o trecho do `AGENTS.md` e o teste das skills citadas

Nível: alto. O texto é o que o autor revisa; o código é pequeno.

**Files:**
- Create: `nucleo/extensoes/metodo/modelos/metodo.md`
- Create: `nucleo/extensoes/metodo/citadas.mjs`
- Modify: `nucleo/extensoes/metodo/modelos/agents-metodo.md`
- Modify: `nucleo/extensoes/metodo/trecho.mjs` (função `trechoDe`)
- Test: `teste/metodo-principios.test.mjs`

**Interfaces:**
- Produces:
  - `skillsCitadas(texto: string): string[]` em `citadas.mjs`: tira os blocos cercados (```` ^```…^``` ````, multilinha), pega cada código inline (`` /`([^`\n]+)`/g ``) que casa `/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/`; devolve sem repetição, em ordem alfabética.
  - `skillsNoLugar(trecho: string): string[]` em `citadas.mjs`: a primeira coluna das linhas de tabela cuja primeira célula é um código inline de nome de skill (`` /^\|\s*`([a-z][a-z0-9-]*)`\s*\|/gm ``); sem repetição, em ordem.
  - `trechoDe(texto: string|null): string|null` em `trecho.mjs`: o texto entre o primeiro `<!-- agent-harness/metodo: início` e o `MARCA_FIM` seguinte, marcas incluídas; `null` sem o par.
  - `skillsConhecidas(colecoes: object): Set<string>` em `citadas.mjs`: as chaves de `skills` de todas as coleções de `colecoes.json`, inclusive `agent-harness`.

- [ ] **Step 1: Testes que falham** (`teste/metodo-principios.test.mjs`)

```js
test('skillsCitadas pega só código inline de uma palavra minúscula, fora de bloco cercado', () => {
  const texto = 'Use `writing-plans`, `tools/ah open`, `Nível: alto`, `GLOSSARY.md`, `--forcar`.\n```\n`grilling`\n```\nDepois `brainstorming`.';
  assert.deepEqual(skillsCitadas(texto), ['brainstorming', 'writing-plans']);
});
test('skillsNoLugar lê a primeira coluna da tabela das skills citadas', () => {
  const t = '| Skill citada | Quem cita | No lugar |\n|---|---|---|\n| `using-git-worktrees` | writing-plans | o worktree da frente |\n';
  assert.deepEqual(skillsNoLugar(t), ['using-git-worktrees']);
});
test('toda skill citada no metodo.md e no trecho do AGENTS.md existe em colecoes.json ou na tabela "No lugar"', () => {
  // permitidas = skillsConhecidas(lerColecoes(colecoes.json).colecoes) ∪ skillsNoLugar(agents-metodo.md)
  // para cada arquivo: assert.deepEqual(skillsCitadas(texto).filter(s => !permitidas.has(s)), [],
  //   `${arquivo} cita skill que o método não instala. Código inline de uma palavra minúscula é nome de skill; escreva o resto sem código ou com barra, ponto ou espaço.`)
});
test('o metodo.md tem as seções na ordem', () => {
  // as linhas que começam por '#', na ordem, são exatamente TITULOS (lista abaixo, Step 3)
});
test('cada trilha diz as skills que entram nela', () => {
  // em cada subseção, a linha que começa por '**Skills:**' existe, e skillsCitadas(linha) é igual a:
  // 'Antes da trilha: triar' → ['to-tickets', 'triage']
  // 'Um commit' → ['systematic-debugging', 'test-driven-development', 'verification-before-completion']
  // 'Plano de partida' → ['executing-plans', 'requesting-code-review', 'subagent-driven-development', 'systematic-debugging', 'test-driven-development', 'verification-before-completion', 'writing-plans']
  // 'Spec e plano' → ['brainstorming', 'domain-modeling', 'grilling', 'writing-plans']
  // 'Investigação longa' → ['grilling', 'prototype', 'research', 'wayfinder']
});
test('o metodo.md usa GLOSSARY.md, aponta em vez de repetir e é curto', () => {
  // inclui 'GLOSSARY.md' e não inclui 'CONTEXT.md'
  // não inclui 'superpowers:<nome>' (a regra dos prefixos mora no trecho do AGENTS.md)
  // inclui 'docs/agents/sessoes-paralelas.md'
  // texto.split('\n').length <= 160
});
test('o trecho do AGENTS.md aponta para o metodo.md, pede a trilha e continua curto', () => {
  // inclui '`docs/agents/metodo.md`'; casa /escolha a trilha antes de começar/i; split('\n').length <= 30
});
test('trechoDe devolve o trecho entre as marcas do método, ou null', () => { /* com par; sem par; só a marca de início */ });
```

- [ ] **Step 2: Rodar e ver falhar:** `node --test teste/metodo-principios.test.mjs`. Esperado: FAIL (módulo `citadas.mjs` não existe).
- [ ] **Step 3: Escrever `modelos/metodo.md`** pelo esboço abaixo. Os títulos são exatos (são a lista `TITULOS` do teste); o conteúdo de cada seção é o dos tópicos, em prosa curta ou em tópicos, com a convenção de escrita acima. Alvo: cerca de 120 linhas.

  **`# Método de trabalho`**
  - Duas ou três linhas: o que é (como trabalhar dentro de uma frente; o `ah` cuida das frentes, `docs/agents/sessoes-paralelas.md`); quem lê (o agente em toda tarefa, o aluno quando quiser entender).
  - O método sugere; nada nele recusa. Só as travas do harness recusam.
  - Guia com exemplos da loja: `docs/guia/comecar.md` no repositório do agent-harness (o endereço que o README usa).

  **`## Escolha a trilha`**
  - Antes de começar, responda em ordem; a primeira resposta que decide vale:
    1. Já se sabe o que fazer? Não → Investigação longa.
    2. Muda contrato, dado ou fronteira entre partes (API, esquema, formato de arquivo, quem chama quem)? Sim → Spec e plano.
    3. Cabe num commit (um comportamento, sem decisão de desenho)? Sim → Um commit.
    4. Senão → Plano de partida.
  - Na dúvida entre duas, a mais leve. A trilha padrão é a leve.
  - Diga ao humano a trilha escolhida em uma linha antes de começar. Trocar de trilha no meio é normal: diga no ticket por quê.
  - Carregue só as skills da trilha (linha **Skills:** de cada uma).

  **`### Antes da trilha: triar`**
  - Pedido sem ticket, vago ou de fora: `triage` (ticket com rótulo; os rótulos estão em `docs/agents/triage-labels.md`).
  - Spec ou plano grande que precisa virar vários tickets: `to-tickets`.
  - **Skills:** `triage`, `to-tickets`.

  **`## As trilhas`** (uma linha de introdução: cada trilha diz quando, a sequência e as skills)

  **`### Um commit`**
  - Quando: comportamento pequeno, sem decisão de desenho.
  - Sequência: `tools/ah open <nome> --tickets <n>` → teste que falha, conserto (`test-driven-development`) → verificação com comando e saída (`verification-before-completion`) → commit → merge na base e `tools/ah close`. Bug: `systematic-debugging` antes do conserto.
  - **Skills:** `test-driven-development`, `verification-before-completion`, `systematic-debugging`.

  **`### Plano de partida`**
  - Quando: várias tarefas, desenho que não muda.
  - Sequência: plano curto (`writing-plans`), com `Nível:` em cada tarefa (seção "Nível de modelo") e, no topo, a linha de partida para colar numa sessão nova: `tools/ah open <nome> --tickets <n> --plano <arquivo do plano>`, seguida de "execute o plano" → execução por subagentes (`subagent-driven-development`) ou na própria conversa (`executing-plans`), sempre com `test-driven-development` → revisão (`requesting-code-review`) → verificação → registros (seção "Registros da execução por subagentes") → merge na base e `tools/ah close`.
  - **Skills:** `writing-plans`, `subagent-driven-development`, `executing-plans`, `test-driven-development`, `requesting-code-review`, `verification-before-completion`, `systematic-debugging`.

  **`### Spec e plano`**
  - Quando: muda contrato, dado ou fronteira.
  - Sequência: desenho com o humano (`brainstorming`); perguntas de decisão por exceção no ticket (`grilling`; silêncio = padrão); vocabulário e decisões (`domain-modeling`: `GLOSSARY.md` e `docs/adr/`) → spec → a partir do `writing-plans`, siga o Plano de partida (aponta, não repete).
  - **Skills:** `brainstorming`, `grilling`, `domain-modeling`, `writing-plans`.

  **`### Investigação longa`**
  - Quando: ainda não se sabe o que fazer.
  - Sequência: mapa de decisões em tickets (`wayfinder`); leitura de fontes primárias com relatório no repositório (`research`); protótipo descartável para uma pergunta de desenho (`prototype`); decisões com o humano (`grilling`). Sai um mapa e tickets; cada ticket volta a "Escolha a trilha".
  - **Skills:** `wayfinder`, `research`, `prototype`, `grilling`.

  **`## Um dono por etapa`**
  - A tabela da spec, seção 7, com quatro colunas (Etapa, Skill, O que fica escrito, Harness), com estas diferenças: "Vocabulário e decisões" escreve `GLOSSARY.md` e `docs/adr/`; "Execução" é `subagent-driven-development` (ou `executing-plans`, na própria conversa) com `test-driven-development`, e o harness é o worktree da frente, a fila de pesado e `tools/ah registros guardar` (quando a extensão registros está ligada); "Integrar e encerrar" é merge na base e `tools/ah close` ou `tools/ah handoff`.
  - Uma linha depois da tabela: uma etapa, uma skill; as outras coleções têm TDD e revisão próprios, que não estão instalados de propósito.

  **`## Atritos resolvidos`**
  - Worktree e encerramento de ramo são do `ah`: quando uma skill manda criar worktree ou encerrar o ramo, vale a tabela das skills citadas no trecho do método do `AGENTS.md` (aponta, não repete).
  - Um TDD só (`test-driven-development`) e um revisor só (`requesting-code-review`).
  - "Pronto" exige comando e saída: no ticket ou no PR vão o comando executado e a saída (cortada no que for longo). Sem isso, a tarefa não está pronta, mesmo com o código escrito.
  - Nomes com prefixo: ver o trecho do método no `AGENTS.md`.

  **`## Paralelismo em dois níveis`**
  - Dentro de uma frente, subagentes (`subagent-driven-development`): um subagente novo por tarefa e um revisor novo depois de cada uma. Custo: um contexto novo por tarefa e por revisão (mais tokens e mais tempo de modelo). Ganho: revisão independente. Na conversa (`executing-plans`): mais barato, sem revisão independente até o fim.
  - Entre frentes, várias sessões, cada uma na sua frente (`docs/agents/sessoes-paralelas.md`). Custo: o humano acompanha várias sessões, a base muda sob cada frente e o merge pode ter conflito. Use quando os tickets não tocam os mesmos arquivos (`tools/ah board` mostra os arquivos em comum).
  - Comece por um nível só. A distribuição entre frentes, quando a extensão orquestracao está ligada, tem o próprio roteiro (guia).

  **`## Nível de modelo`**
  - Ao escrever o plano, cada tarefa leva a linha `Nível: alto`, `Nível: medio` ou `Nível: leve`, com os critérios:
    - alto: decisão de desenho, algoritmo que os testes não determinam, segurança, ensaio com agente real, texto que o humano revisa;
    - medio: código com interface e testes dados no plano;
    - leve: texto curto, renomeação, mudança mecânica, conferência.
  - `tools/ah modelo <nível>` diz o modelo e o esforço daquele nível para o agente em uso (`--agente <nome>` para outro agente, `--json` para máquina), quando a extensão modelo está ligada; a tradução fica na seção `modelo` de `.harness/config.json`.
  - Tarefa sem nível: use medio. Nada recusa por causa de modelo.

  **`## Registros da execução por subagentes`**
  - O `subagent-driven-development` grava o diário de cada plano em `.superpowers/sdd/<plano>/`, pasta ignorada pelo git, e apaga a pasta quando a revisão final fica limpa.
  - Com a extensão registros ligada, rode `tools/ah registros guardar` em dois momentos: no fim da execução por subagentes, **antes** do passo que apaga a pasta do plano; e antes do `tools/ah close`. Ele comenta o diário no ticket e guarda uma cópia.
  - Esqueceu: o `tools/ah close` recusa o item ignorado e diz o que rodar. O `tools/ah handoff` leva o diário sozinho.

  **`## Segredos`**
  - Nunca segredo no repositório: nem no código, nem no teste, nem no plano, nem no ticket.
  - Sugestão: um cofre ou gerenciador de segredos, ou variáveis de ambiente num arquivo ignorado pelo git; onde guardar é decisão do projeto.
  - Segredo que vazou num commit: troque o segredo; apagar o commit não basta.

  **`## Por que cada etapa existe`**
  - Uma linha por etapa da tabela, com a dor que ela resolve (o princípio durável fica para o manual):
    - Entender e triar: pedido vago vira trabalho errado; o ticket com rótulo diz o que está pronto para começar.
    - Investigação longa: começar a codar sem saber o que fazer gasta sessões; o mapa diz o próximo passo.
    - Decisão com o humano: pergunta solta para o trabalho; o ticket de decisões registra o padrão aplicado.
    - Vocabulário e decisões: o mesmo nome com dois sentidos; o glossário e o ADR fixam um.
    - Desenho: mudança de contrato descoberta no meio do código custa caro; a spec decide antes.
    - Plano: a sessão nova não sabe o que a anterior decidiu; o plano leva as decisões e o nível de cada tarefa.
    - Execução: código sem teste não prova nada; teste primeiro e commits pequenos.
    - Depuração: conserto por tentativa esconde a causa; o teste de regressão a prende.
    - Revisão: quem escreveu não vê o próprio erro; um revisor novo vê.
    - Verificação: "pronto" sem evidência; comando e saída.
    - Integrar e encerrar: ramo e worktree esquecidos; o `ah` fecha e registra no histórico.

- [ ] **Step 4: Atualizar `modelos/agents-metodo.md`.** Logo depois do parágrafo de abertura, como primeiro tópico da lista: "**Escolha a trilha antes de começar.** O método (trilhas, quem cuida de cada etapa, nível de modelo, quando guardar os registros) está em `docs/agents/metodo.md`." O resto do trecho fica como está; nada do `metodo.md` é repetido nele.
- [ ] **Step 5: Implementar `citadas.mjs` e `trechoDe`.** Cabeçalho de `citadas.mjs` com a dor que resolve (texto que cita skill que não existe) e a convenção de escrita em duas linhas.
- [ ] **Step 6: Rodar:** `npm test` e `node ferramentas/varre-termos.mjs`. Esperado: PASS e código 0.
- [ ] **Step 7: Commit**

```bash
git add -- nucleo/extensoes/metodo/modelos/metodo.md nucleo/extensoes/metodo/modelos/agents-metodo.md nucleo/extensoes/metodo/citadas.mjs nucleo/extensoes/metodo/trecho.mjs teste/metodo-principios.test.mjs
git commit -m "feat(metodo): texto do método com as trilhas e teste das skills citadas"
```

### Task 2: Skills citadas pelas skills instaladas

Nível: medio. Cumpre a última frase de "Quais skills entram" (spec, seção 6): toda skill citada por uma skill instalada está instalada ou tem linha na tabela "No lugar".

**Files:**
- Modify: `teste/metodo-principios.test.mjs`
- Modify: `nucleo/extensoes/metodo/modelos/agents-metodo.md` (só se o teste achar citação nova: uma linha na tabela)

**Interfaces:**
- Consumes: `skillsNoLugar` (Task 1); `lerColecoes`, `dirDoCache` (fatia 1).

- [ ] **Step 1: Teste que falha ou é pulado sem cache**

```js
test('toda skill citada por uma skill instalada está instalada ou na tabela "No lugar"', t => {
  // para cada coleção de terceiros em colecoes.json:
  //   dir = path.join(dirDoCache(process.env), nome); sem a pasta, ou com `git -C dir rev-parse HEAD` diferente do commit fixado:
  //   t.skip(`sem a coleção ${nome} no commit fixado em ${dir}; rode tools/ah metodo instalar num projeto descartável`)
  //   nomesDaColecao = nome da pasta de cada SKILL.md da árvore
  //   em cada arquivo de texto das pastas das skills da lista, as citações:
  //     /(superpowers|mattpocock-skills):([a-z0-9-]+)/g (qualquer nome),
  //     /`\/?([a-z0-9-]+)`/g e /(?:^|\s)\/([a-z0-9-]+)\b/gm (só nomes de nomesDaColecao)
  //   permitidas = skills instaladas de todas as coleções ∪ skillsNoLugar(agents-metodo.md)
  //   assert.deepEqual(foraDaLista, [], 'cada item: "<skill citada> em <coleção>/<arquivo>"; acrescente a linha na tabela "No lugar" do agents-metodo.md ou a skill em colecoes.json')
});
```

  O teste só lê o cache; nunca busca. Palavras soltas (sem prefixo, crase ou barra) não contam, porque nomes como "implement" aparecem em prosa.
- [ ] **Step 2: Preparar o cache desta máquina** (rede real, fora do `npm test`): num projeto descartável em `/tmp/ah-lab-cache`, `node <worktree>/nucleo/bin/ah.mjs init --projeto loja --sigla as`, ligar `"metodo": {"agentes": ["claude-code"]}` e rodar `tools/ah metodo instalar`. Apagar o projeto; o cache fica.
- [ ] **Step 3: Rodar:** `node --test teste/metodo-principios.test.mjs`. Esperado: o teste roda (não é pulado) e passa ou lista citações. Para cada citação listada, uma linha nova na tabela "No lugar" do `agents-metodo.md` (o que fazer no lugar, na voz das linhas que já estão lá). Conferir também, no cache, que o domain-modeling da versão fixada grava `GLOSSARY.md`; se gravar outro nome, corrigir o `metodo.md` e o teste da Task 1.
- [ ] **Step 4: Rodar:** `npm test`, e `AH_CACHE=/nao/existe node --test teste/metodo-principios.test.mjs` (o teste aparece como pulado, com a mensagem). Esperado: PASS nos dois.
- [ ] **Step 5: Commit**

```bash
git add -- teste/metodo-principios.test.mjs nucleo/extensoes/metodo/modelos/agents-metodo.md
git commit -m "test(metodo): skills citadas pelas instaladas estão no projeto ou na tabela No lugar"
```

### Task 3: `metodo instalar` instala e protege o `docs/agents/metodo.md`

Nível: alto. Decide quando um arquivo do aluno pode ser reescrito.

**Files:**
- Create: `nucleo/extensoes/metodo/documento.mjs`
- Modify: `nucleo/extensoes/metodo/trava.mjs` (campo `documentos`)
- Modify: `nucleo/extensoes/metodo/sincronizar.mjs`
- Modify: `docs/referencia/comandos.md` (seção `metodo`)
- Test: `teste/metodo-instalar.test.mjs`

**Interfaces:**
- Consumes: `sincronizar`, `planejar`, `novaTrava` (fatia 1).
- Produces:
  - Em `documento.mjs`: `DOCUMENTO_DO_METODO = 'docs/agents/metodo.md'`; `hashDoDocumento(conteudo: Buffer|string): string` (sha256 do texto UTF-8 com `\r\n` trocado por `\n`); `lerDocumento(raiz: string): {tipo: 'ausente'|'link'|'arquivo'|'outro', hash?: string}`, sem seguir link simbólico.
  - Trava: campo opcional `documentos: {<caminho>: <sha256 de hashDoDocumento>}`, entre `destinos` e `colecoes` no `textoDaTrava`; `errosDaTrava` aceita a trava sem ele e confere, quando presente, que é um objeto de `caminhoSeguro` → 64 hexadecimais. `versaoDoFormato` continua 1.
  - Regra do `sincronizar` para o documento, com `novo` = `modelos/metodo.md` da extensão e `h` = `trava.documentos?.[DOCUMENTO_DO_METODO]`:

    | No disco | Ação |
    |---|---|
    | ausente | escreve |
    | arquivo com o hash de `novo` | nada |
    | arquivo com o hash `h` (instalado antes e não mexido) | reescreve com `novo` |
    | arquivo com outro hash (mudado à mão, ou do aluno antes do método) | entra nas perdas como `docs/agents/metodo.md`; sem `--forcar`, recusa antes de qualquer escrita; com `--forcar`, reescreve |
    | link simbólico ou outro tipo | não mexe; aviso `Aviso: docs/agents/metodo.md é um link simbólico; não mexi nele.\nFaça: apague o link e rode tools/ah metodo <comando> de novo` |

    A trava nova grava `documentos[DOCUMENTO_DO_METODO]` com o hash de `novo` quando escreveu ou quando o disco já era `novo`; quando não mexeu (link), mantém o valor anterior, se houver. O documento é tratado em toda execução do `sincronizar`, com ou sem `--colecao`, porque a fonte é a cópia do harness. Com `--simular`, só entra no relatório.
  - Recusa das perdas, texto novo (vale para skills e documento): motivo `a instalação sobrescreveria arquivos do método mudados à mão (<lista>)`; passo `guarde as suas mudanças em outro lugar (numa skill de outro nome; o que for do docs/agents/metodo.md, no AGENTS.md, fora das marcas) e rode tools/ah metodo <comando> de novo; para descartá-las, rode tools/ah metodo <comando> --forcar`.
  - Relatório: `Escrevi docs/agents/metodo.md.` antes da linha do trecho do `AGENTS.md`. O caminho entra na lista do `git add` dos passos do commit, logo depois de `AGENTS.md`, e na conferência `dentroDoProjeto`.

- [ ] **Step 1: Testes que falham** (`teste/metodo-instalar.test.mjs`, no `cenario` que já existe; `METODO` é o conteúdo de `nucleo/extensoes/metodo/modelos/metodo.md`)

```js
test('instalar escreve o docs/agents/metodo.md e grava o hash na trava', t => {
  // ler(p, 'docs/agents/metodo.md') === METODO; travaDe(p).documentos['docs/agents/metodo.md'] === sha(METODO)
  // saída casa /Escrevi docs\/agents\/metodo\.md\./ e /git add -- .*AGENTS\.md docs\/agents\/metodo\.md/
});
test('instalar reescreve o metodo.md que não foi mexido quando o texto do harness muda', t => {
  // instalar; trocar na trava o hash pelo de 'versão antiga\n' e gravar 'versão antiga\n' no disco (simula a versão anterior do harness)
  // instalar: código 0, arquivo === METODO
});
test('instalar recusa sobrescrever o metodo.md mudado à mão, e --forcar descarta', t => {
  // instalar; acrescentar '\nNota da Ana.\n'; instalar → código 1, erro casa /^Recusado: a instalação sobrescreveria arquivos do método mudados à mão \(.*docs\/agents\/metodo\.md/ e /Faça: .*fora das marcas.*--forcar/
  // arquivo continua com a nota; ok(instalar(['--forcar'])); arquivo === METODO
});
test('instalar não apaga o metodo.md que o projeto já tinha antes do método', t => {
  // antes de instalar: gravar 'o método da loja\n' em docs/agents/metodo.md; instalar → código 1, lista docs/agents/metodo.md; nenhuma pasta de skills nem trava gravada
});
test('projeto instalado antes desta versão ganha o metodo.md e a trava passa a ter documentos', t => {
  // instalar; apagar docs/agents/metodo.md e o campo documentos da trava; commitar; instalar → código 0, arquivo === METODO, trava com documentos
});
test('metodo.md com CRLF igual ao instalado não conta como mudança à mão', t => {
  // instalar; regravar o arquivo com METODO.replace(/\n/g, '\r\n'); instalar → código 0, sem 'Recusado'
});
test('metodo.md como link simbólico não é seguido e vira aviso', { skip: process.platform === 'win32' }, t => {
  // docs/agents/metodo.md → link para docs/outro.md (conteúdo 'outro\n'); instalar → código 0; erro casa /docs\/agents\/metodo\.md é um link simbólico/ e /Faça:/; docs/outro.md continua 'outro\n'
});
test('instalar de novo não muda nada e diz isso', t => { /* o teste que já existe continua passando, agora com o metodo.md no commit */ });
// com o `metodo atualizar` da fatia 1:
test('atualizar --simular não grava o metodo.md', t => { /* projeto sem o arquivo; atualizar --simular → arquivo ausente; saída casa /Simulação: nada foi gravado\./ */ });
```

- [ ] **Step 2: Rodar e ver falhar:** `node --test teste/metodo-instalar.test.mjs`. Esperado: FAIL nos testes novos.
- [ ] **Step 3: Implementar `documento.mjs`, o campo `documentos` na trava e a regra no `sincronizar`.** O documento entra no passo 3 (conferir contra o disco, junto das perdas das skills) e no passo 6 (escrever, junto da trava e do trecho). Nada é gravado antes da decisão.
- [ ] **Step 4: Rodar:** `npm test`. Esperado: PASS.
- [ ] **Step 5: Documentar** na seção `metodo` de `docs/referencia/comandos.md`: um passo novo depois do 5 ("Documento do método": a tabela de decisão acima em prosa, com o porquê do CRLF), o campo `documentos` no passo da trava, a recusa com o texto novo na tabela de recusas, `Escrevi docs/agents/metodo.md.` e o caminho no `git add` do exemplo.
- [ ] **Step 6: Commit**

```bash
git add -- nucleo/extensoes/metodo/documento.mjs nucleo/extensoes/metodo/trava.mjs nucleo/extensoes/metodo/sincronizar.mjs docs/referencia/comandos.md teste/metodo-instalar.test.mjs
git commit -m "feat(metodo): metodo instalar mantém o docs/agents/metodo.md com a proteção das skills"
```

### Task 4: Conferências do `doctor` para o documento e as skills citadas

Nível: medio.

**Files:**
- Modify: `nucleo/extensoes/metodo/extensao.mjs` (`verificacoes`)
- Modify: `nucleo/extensoes/metodo/colecoes.mjs` (só se a fatia 1 não deixou estes auxiliares: `arquivoDasColecoes(env): string`, `AH_METODO_COLECOES` ou o `colecoes.json` da extensão; e `extensoesLigadas(configDoProjeto): Set<string>`, com a regra `eLigada` que hoje está no `sincronizar`, que passa a usá-los)
- Modify: `docs/referencia/comandos.md` (seção `metodo`, conferências do `doctor`)
- Test: `teste/metodo-doctor.test.mjs`

**Interfaces:**
- Consumes: `lerTrava` (fatia 1); `DOCUMENTO_DO_METODO`, `lerDocumento`, `hashDoDocumento` (Task 3); `skillsCitadas`, `skillsNoLugar`, `trechoDe` (Task 1); `lerColecoes`.
- Produces, dois itens (aviso, nunca falha; sem trava, ou com trava ilegível, os dois dão `ok`, porque o item `Trava das skills` já avisa):
  - `Documento do método igual à trava`:
    - trava sem `documentos`: `docs/agents/metodo.md ainda não foi instalado` / `rode tools/ah metodo instalar`;
    - arquivo ausente: `docs/agents/metodo.md não existe` / `rode tools/ah metodo instalar`;
    - link ou outro tipo: `docs/agents/metodo.md não é um arquivo comum` / `apague-o e rode tools/ah metodo instalar`;
    - hash diferente: `docs/agents/metodo.md foi mudado à mão; a próxima instalação recusa sobrescrevê-lo` / `leve as suas notas para o AGENTS.md, fora das marcas, e rode tools/ah metodo instalar --forcar`;
    - hash igual (com `hashDoDocumento`, que ignora CRLF): `ok`.
  - `Skills citadas no método instaladas`: citadas = `skillsCitadas` do `docs/agents/metodo.md` (quando é arquivo comum) e do `trechoDe(AGENTS.md)`; permitidas = skills de todas as coleções da trava ∪ `skillsNoLugar(trechoDe(AGENTS.md))` ∪ skills de `agent-harness.extensoes` cuja extensão não está ligada. Faltando alguma: `citadas e fora da trava: <lista>` / `rode tools/ah metodo instalar; se o aviso continuar, o texto cita uma skill que o método não instala`.

- [ ] **Step 1: Testes que falham** (`teste/metodo-doctor.test.mjs`, no mesmo apoio que a fatia 1 usa; leitura por `doctor --json`, item `<nome> (metodo)`)

```js
test('doctor: metodo.md igual à trava passa; mudado à mão avisa', t => { /* instalar; ok; acrescentar texto; aviso com 'mudado à mão' e '--forcar' */ });
test('doctor: metodo.md com CRLF igual ao instalado passa', t => { /* ... */ });
test('doctor: trava sem documentos avisa para rodar o instalar', t => { /* apagar documentos da trava; aviso com 'tools/ah metodo instalar' */ });
test('doctor: skill citada no metodo.md e fora da trava avisa', t => {
  // instalar com o colecoes.json de teste (sem as skills reais): aviso lista, por exemplo, 'writing-plans'
  // com o projeto instalado e um metodo.md que só cita `alfa`: ok
});
test('doctor: skill da tabela No lugar e skill de extensão desligada não avisam', t => {
  // metodo.md cita `using-git-worktrees` e `so-com-recursos` (extensão recursos desligada): ok
  // ligando recursos sem instalar de novo: aviso com 'so-com-recursos'
});
test('doctor sem trava: os dois itens novos ficam ok', t => { /* ... */ });
```

- [ ] **Step 2: Rodar e ver falhar:** `node --test teste/metodo-doctor.test.mjs`. Esperado: FAIL nos testes novos.
- [ ] **Step 3: Implementar** os dois itens em `verificacoes`, depois dos da fatia 1.
- [ ] **Step 4: Rodar:** `npm test`. Esperado: PASS.
- [ ] **Step 5: Documentar** os dois itens na tabela de conferências do `doctor` da seção `metodo` em `docs/referencia/comandos.md`, com a convenção de escrita em uma frase (o que conta como skill citada).
- [ ] **Step 6: Commit**

```bash
git add -- nucleo/extensoes/metodo docs/referencia/comandos.md teste/metodo-doctor.test.mjs
git commit -m "feat(metodo): doctor confere o metodo.md e as skills citadas contra a trava"
```

### Task 5: Guia "Como começar"

Nível: medio. Texto para aprendizes, que um agente também consegue seguir.

**Files:**
- Create: `docs/guia/comecar.md`
- Modify: `README.md` (só uma linha nova, logo depois do primeiro parágrafo e antes da seção "Instalar num projeto (instruções para o agente)": `Para começar a trabalhar com o método depois de instalar, leia o guia [Como começar](docs/guia/comecar.md).` Nada mais do README muda nesta tarefa; a seção de instalação é da fatia 1)
- Modify: `AGENTS.md` da raiz (uma linha na tabela "Mapa": `docs/guia/` | Guia de como começar, para aprendizes e agentes)
- Test: `teste/metodo-principios.test.mjs`

**Interfaces:**
- Consumes: `skillsCitadas`, `skillsNoLugar`, `skillsConhecidas` (Task 1); os comandos das Tasks 3 e 4; as extensões opcionais só pelo nome do comando.

- [ ] **Step 1: Testes que falham**

```js
test('o guia tem as seções na ordem e aponta em vez de repetir', () => {
  // títulos exatos (lista do Step 3), na ordem
  // cita 'Instalar num projeto (instruções para o agente)' e não contém 'metodo instalar' na seção 1 (o procedimento é do README)
  // cita 'docs/agents/metodo.md' e '`tools/ah doctor`'
  // os exemplos Um commit, Plano de partida e Spec e plano citam '`tools/ah open' e '`tools/ah close`' (a investigação abre frente só quando um ticket vira código)
});
test('toda skill citada no guia existe em colecoes.json ou na tabela "No lugar"', () => { /* o teste da Task 1, com o guia na lista de arquivos */ });
test('o README aponta para o guia logo no começo', () => {
  // readme.indexOf('docs/guia/comecar.md') >= 0 e < readme.indexOf('\n## ')
});
```

- [ ] **Step 2: Rodar e ver falhar:** `node --test teste/metodo-principios.test.mjs`. Esperado: FAIL.
- [ ] **Step 3: Escrever `docs/guia/comecar.md`** com estes títulos exatos e este conteúdo. Personagens: a loja de Ana Souza, que mantém o código; Carla, cliente que pede as mudanças. Tickets com números inventados.

  **`# Como começar`**
  - Para quem: o aprendiz que vai usar o harness e o método, e o agente que ele usa. Três linhas: o harness cuida das frentes; o método diz como trabalhar dentro de cada uma; tudo se pede ao agente.

  **`## 1. Instalar`**
  - O que dizer ao agente, na pasta do projeto (nova ou existente): "Instale o agent-harness daqui: `<endereço do repositório>`, para eu usar com <agente>."
  - O agente segue a seção "Instalar num projeto (instruções para o agente)" do README; o guia não repete os passos.
  - O que o agente vai perguntar: a origem e o commit antes de executar; o "sim" para criar o repositório no GitHub; os agentes que você usa.
  - Como saber que deu certo: os commits que ele indicou feitos e o `tools/ah doctor` sem falha, com os avisos explicados.

  **`## 2. A primeira sessão`**
  - Abra uma sessão nova no projeto. O que o agente deve fazer: ler o `AGENTS.md` (o `CLAUDE.md` aponta para ele); rodar `tools/ah doctor`; a cada pedido, escolher a trilha pelo `docs/agents/metodo.md` e dizê-la em uma linha; abrir a frente antes de mudar código.
  - Frase para testar a sessão: "Leia o AGENTS.md e me diga que trilha você usaria para <pedido>, sem executar."

  **`## 3. Um exemplo por trilha`** (uma linha: cada exemplo traz o pedido, o que dizer ao agente, a sequência de skills e comandos e o que fica escrito)

  **`### Um commit: o frete arredondado errado`**
  - Carla avisa que o frete de R$ 12,345 aparece como R$ 12,34 (ticket 12). Sequência: `tools/ah open frete-arredondado --tickets 12` → `systematic-debugging` → `test-driven-development` (o teste que falha, o conserto) → `verification-before-completion` (comando e saída no ticket) → commit → merge na base → `tools/ah close`.

  **`### Plano de partida: cupom de desconto`**
  - Carla quer cupons no carrinho; o desenho não muda (ticket 15). Sequência: `writing-plans` (tarefas com `Nível:`, linha de partida no topo) → numa sessão nova, a linha de partida (`tools/ah open cupom --tickets 15 --plano <arquivo>`) → `subagent-driven-development` com `test-driven-development` (com a extensão modelo ligada, `tools/ah modelo medio` diz o modelo do subagente) → `requesting-code-review` → `verification-before-completion` → `tools/ah registros guardar` → merge → `tools/ah close`.

  **`### Spec e plano: pagamento parcelado`**
  - Carla quer parcelar; muda o contrato com o meio de pagamento e o dado do pedido (ticket 20). Sequência: `brainstorming`, com `grilling` (decisões no ticket) e `domain-modeling` ("parcela" no `GLOSSARY.md`, ADR em `docs/adr/`) → spec → o resto como no exemplo do cupom.

  **`### Investigação longa: vender também num marketplace`**
  - Ana não sabe se vale, nem em qual. Sequência: `wayfinder` (mapa de tickets de decisão) → `research` (relatório no repositório, com as fontes) → `prototype` (protótipo descartável da integração) → os tickets que saem voltam à escolha da trilha. A frente só é aberta quando um ticket vira trabalho de código.

  **`## 4. Ligar as extensões opcionais`**
  - O que dizer ao agente: "ligue a extensão <nome>". O agente a acrescenta em `extensoes` no `.harness/config.json`, roda `tools/ah metodo instalar` (que instala as skills dela, quando ela tem), faz o commit indicado e roda `tools/ah doctor`.
  - Uma linha por extensão, com a dor e o comando, "quando ligada": wiki (base de conhecimento com evidência conferida; `tools/ah wiki conferir`); orquestracao (distribuir tickets entre subagentes e sessões; `tools/ah candidatos`); ambiente (banco e portas por worktree, criados e apagados com a frente); migracao (número de migração sem choque entre frentes; `tools/ah migracao reservar`); prova (não repetir o teste ponta a ponta quando a árvore não mudou; `tools/ah prova <rótulo>`).
  - Se a extensão não existe na sua versão do harness, o `tools/ah doctor` diz que ela não carregou; a referência de cada uma está em `.harness/nucleo/docs/referencia/comandos.md`.

  **`## 5. Quando algo falha`**
  - Primeiro `tools/ah doctor`: cada aviso e cada falha traz o "Faça". Cada recusa do harness diz o motivo e o próximo passo; siga-o.
  - Casos comuns, uma linha cada: skill mudada à mão ou ausente (`tools/ah metodo instalar`, e `--forcar` só sabendo o que descarta); o agente não acha uma skill (a pasta do agente, `.claude/skills/` ou `.agents/skills/`, e a skill `preparar-projeto`, que repara a instalação); o `tools/ah close` recusa item ignorado (`tools/ah registros guardar`); a trava recusou um comando (o motivo está na recusa; `docs/agents/sessoes-paralelas.md`, seção das travas).
  - Onde ler mais: `docs/agents/metodo.md`, `docs/agents/sessoes-paralelas.md`, `.harness/nucleo/docs/referencia/comandos.md`.

- [ ] **Step 4: README e mapa do `AGENTS.md`** (as duas linhas acima).
- [ ] **Step 5: Rodar:** `npm test` e `node ferramentas/varre-termos.mjs`. Esperado: PASS e código 0.
- [ ] **Step 6: Commit**

```bash
git add -- docs/guia/comecar.md README.md AGENTS.md teste/metodo-principios.test.mjs
git commit -m "docs(guia): como começar, com um exemplo da loja por trilha"
```

### Task 6: Ensaio de leitura com agente real

Nível: alto. Sem código de produção, salvo consertos de texto que o ensaio pedir (cada um com `npm test` verde, em commit próprio).

**Files:**
- Create: `docs/superpowers/plans/2026-11-27-metodo-fatia-2-registro.md` (seção "Ensaio")

- [ ] **Step 1: Montar o isolamento** como na sondagem da fatia 1 (registro da fatia 1, "Como o isolamento foi montado"), em `/tmp/ah-lab-fatia2`, e preparar ali um projeto da loja com o harness deste worktree e o método (`init`, `metodo` com `agentes: ["claude-code", "codex"]`, `tools/ah metodo instalar`, commit). O OpenCode fica de fora enquanto as chaves de provedor desta máquina estiverem vencidas; registre se continuar assim.
- [ ] **Step 2: Para o Claude Code e o Codex,** em sessão nova e sem histórico, os quatro pedidos do guia (frete, cupom, parcelado, marketplace), cada um com: "Leia o AGENTS.md e diga a trilha, as skills que você carregaria e o primeiro comando. Não execute nada."
- [ ] **Step 3: Conferir** cada resposta contra o esperado: frete → Um commit; cupom → Plano de partida; parcelado → Spec e plano; marketplace → Investigação longa; skills dentro da linha **Skills:** da trilha; o primeiro comando é `tools/ah open` (ou, na investigação, o `wayfinder` sem frente). Resposta divergente: anote a frase do `metodo.md` que levou ao erro e ajuste o texto; repita só o pedido que falhou.
- [ ] **Step 4: Registrar** as versões dos agentes, o isolamento, os pedidos exatos, as respostas (cortadas), os consertos. Limpar `/tmp/ah-lab-fatia2`, credenciais incluídas.
- [ ] **Step 5: Commit**

```bash
git add -- docs/superpowers/plans/2026-11-27-metodo-fatia-2-registro.md nucleo/extensoes/metodo/modelos/metodo.md
git commit -m "docs(metodo): ensaio de leitura das trilhas com Claude Code e Codex"
```

### Task 7: Fechamento da fatia

Nível: leve.

- [ ] **Step 1: Verificar:** `node ferramentas/verifica.mjs --node "$(mise where node@22)/bin/node" --node "$(command -v node)"`. Esperado: código 0.
- [ ] **Step 2: Registro:** no registro da fatia, os commits, a saída da verificação e as pendências achadas e não tratadas, com o motivo. Já conhecidas: as skills copiadas comparam hash sem normalizar CRLF (só o `metodo.md` normaliza); quando a orquestração e a wiki integrarem, quem integra acrescenta as skills delas a `colecoes.json` antes de citá-las no `metodo.md` ou no guia (o teste da Task 1 cobra).
- [ ] **Step 3: Pedir ao autor** a revisão do texto do `metodo.md` (é item do "pronto" da fatia 2, spec seção 17) e a ordem de integração. Sem push.
