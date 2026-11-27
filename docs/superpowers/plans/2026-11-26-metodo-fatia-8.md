# Método, fatia 8: opcionais (ambiente, migração, prova) — plano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** três extensões opcionais, desligadas por padrão, para frentes paralelas não disputarem porta, banco e número de migração, e para não repetir o teste ponta a ponta depois de um merge que não mudou a árvore.

**Architecture:** cada opcional é uma extensão própria em `nucleo/extensoes/<nome>/extensao.mjs`, na interface v1, sem tocar no núcleo. O estado de cada uma fica em `frente.extensoes.<nome>`, gravado com `gravarCampos` na forma de função (conferência e gravação sob a trava das frentes, como na `recursos`). Tudo que é de ferramenta (criar e apagar banco, listar bancos, passo próprio da migração, comando do teste) é uma lista argv na configuração, nunca um nome de ferramenta no código.

**Tech Stack:** Node 22+, módulos ES, sem dependências; `node:test`; git; `nucleo/lib/extensoes-teste.mjs` (`carregarParaTeste`, `ctxFalso`, `projetoDeTeste`).

**Spec:** `docs/superpowers/specs/2026-11-26-metodo-design.md`, seções 3, 13 e 17 (fatia 8). Orquestração: `docs/superpowers/plans/2026-11-26-metodo-orquestracao.md`.

## Global Constraints

- Node 22 ou mais novo, módulos ES, sem dependências externas.
- Testes primeiro: veja o teste falhar antes de implementar. Nenhum teste usa rede real. Banco e ferramenta de migração nos testes são scripts falsos em `teste/`.
- Este ramo (`p2-opcionais`) só edita `nucleo/extensoes/{ambiente,migracao,prova}/**`, `teste/ambiente-*`, `teste/migracao-*`, `teste/prova-*` e, em `docs/referencia/comandos.md`, as seções novas `ambiente`, `migracao` e `prova` (depois de `recursos`, nessa ordem).
- Antes de cada commit: `npm test` verde e `node ferramentas/varre-termos.mjs` com código 0 (código 2: pare e avise o orquestrador). No fim: `node ferramentas/verifica.mjs --node "$(mise where node@22)/bin/node" --node "$(command -v node)"` com código 0.
- Textos em português; exemplos com nomes inventados (a loja, Ana Souza, Carla). Nenhum nome do projeto de origem: nem banco, nem ferramenta de migração, nem ferramenta de teste.
- Toda recusa diz o motivo e o próximo passo (`throw new ctx.ErroDeUso('<motivo>\nPróximo passo: <o que fazer>')`). Reações não recusam: falha vira aviso com o próximo passo.
- Dizem o resultado, não a ferramenta (spec, seção 3): os comandos externos vêm da configuração, como listas argv (`["createdb", "{banco}"]`), rodadas sem shell.
- Cada arquivo começa com um comentário que diz a dor que a extensão resolve; código curto, legível por um concluinte de Ciência da Computação.
- Mudança de comportamento atualiza a seção da extensão em `docs/referencia/comandos.md` no mesmo commit.
- Sem push e sem merge: o orquestrador integra. Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Levantamento no projeto de origem (só leitura, 26/11)

O que foi lido e o que vira comportamento genérico. Nada de lá entra no repositório.

- **Número de migração.** Lá, a reserva era um campo da frente, gravado sob uma trava própria: número = maior entre a última migração da base e as reservas das frentes vivas, mais um; quem já tinha reserva acima da última da base ficava com ela. O `close` liberava. A lista mostrava a última da base e as reservas, marcando a que a base já ultrapassou ("renumere na reintegração"). A renumeração era presa à ferramenta de migração de lá (regerava o arquivo pela ferramenta, porque só renomear deixava o metadado dela incoerente). Exigia a base já mesclada no ramo da frente e recusava conflito fora da pasta de migrações. No fim, deixava em stage e listava os arquivos que citavam o nome antigo. **Aqui:** a mesma reserva; a renumeração genérica renomeia os arquivos da frente (`git mv`) para os números seguintes à última da base e, quando a ferramenta precisa de mais, roda o comando da configuração para cada arquivo renomeado.
- **Prova por árvore.** Lá: a frente gravava `{arvore: HEAD^{tree}, commit, status, em}` no registro dela e numa lista durável no estado da máquina (sobrevive ao `close`). Recusava o worktree com arquivo rastreado alterado (a árvore testada não seria a do HEAD). O resultado vinha do arquivo de resultado da ferramenta de teste de lá; prova com falha era gravada e nunca contava. `--confere <ref>`: 0 quando acha prova que passou com a mesma árvore, 3 quando não, 1 para ref inválida. O caso que importa: o `merge --no-ff` da frente numa base parada produz a mesma árvore da frente. **Aqui:** o mesmo, com o comando do teste rodado pelo próprio `ah prova` (pendência D2) em vez do arquivo de resultado de uma ferramenta.
- **Bancos e portas por frente, recursos fixos.** Lá, portas e bancos eram registrados à mão por frente; o banco de teste do worktree era derivado do nome da pasta; os fixos (portas e bancos que não são de frente nenhuma) ficavam numa tabela de um documento, lida por expressão regular; o registro recusava recurso fixo e o `close` nunca o apagava; o `close` apagava os bancos da frente e só avisava quando o apagar falhava; um relatório comparava o registrado com o que estava ligado (portas escutando, bancos existentes) e marcava "sem dono", ignorando portas efêmeras. **Aqui:** as portas saem de uma faixa da configuração, na abertura; o banco tem o nome de um molde da configuração; os fixos ficam na configuração (um lugar só); o `sweep` faz o papel do relatório, só dentro da faixa e do molde.

## Decisões pendentes (para o orquestrador)

| # | Pergunta | Recomendo | Evidência |
|---|---|---|---|
| D1 | O arquivo de ambiente escrito no worktree trava o `close`: ignorado pelo git, cai em "itens ignorados no worktree"; não ignorado, cai em "alterações não commitadas". As duas conferências rodam antes do `antesDeFechar` (`nucleo/comandos/close.mjs:113-140`). | **(A)** Na P5 (ramo `p2-registros-modelo`), a extensão poder declarar também caminhos ignorados **descartáveis** (refeitos a partir do estado, sem perda), que o `close` não conta. Até a P5 entrar, a doc da `ambiente` manda `ah ambiente desfazer` antes do `ah close`, e a Task 4 já entrega esse comando. (B) P5 como está: a recusa aponta `ah ambiente desfazer`, um passo a mais em todo fechamento. (C) Arquivo fora do worktree (pasta de estado): contraria a seção 13 ("escreve no worktree"). | Spec, seções 8, 13 e 15 (P5) |
| D2 | Como o `ah prova` sabe que "o teste passou"? | **Ele roda o teste:** `ah prova <rótulo> [-- <comando>]`, com o comando padrão por rótulo em `prova.comandos`; grava só com código 0 e só se a árvore não mudou durante o teste. A prova vira evidência, não alegação. Teste pesado: o comando configurado é `["tools/ah", "pesado", "--", …]`. A alternativa (só registrar o que o agente disser) é mais simples e não prova nada. | Spec, seção 13 ("o comando e a hora, depois que o teste passou"); `AGENTS.md`: "pronto exige comando e saída" |
| D3 | Onde fica a prova depois do `close`? A conferência roda depois do merge, e o fechamento pode vir antes. | Na frente (`frente.extensoes.prova`, para a coluna) **e** numa lista só de acréscimo, `<dirEstado>/extensoes/prova/provas.jsonl`. A extensão `registros` (seção 8) também guarda cópia na pasta de estado. | Spec, seções 8 e 13; interface.md, "Gravação" (a restrição é do `ctx`, não proibição) |
| D4 | `renumerar` genérico: renomear e rodar o passo da ferramenta, ou só o passo da ferramenta? | Renomear os arquivos da frente com `git mv` e, se houver `migracao.renumerar`, rodá-lo por arquivo com `{de}` e `{para}`. Cobre a ferramenta que só lê o nome do arquivo e deixa à configuração a que guarda metadado. | Levantamento acima |

Decidi sem perguntar, porque não mudam o desenho: comandos externos como listas argv sem shell; o `sweep` só lista (sem `--reparar` destrutivo); uma coluna no quadro por extensão (`AMBIENTE`, `MIGRACAO`, `PROVA`); a `ambiente` evita também as portas reservadas pela `recursos` quando as duas estão ligadas.

## Review Focus

1. **Duas aberturas ao mesmo tempo** ficam com portas diferentes: a escolha das portas e a gravação ficam sob a trava (`gravarCampos` com função). Teste na Task 4.
2. **Porta da faixa ocupada por processo fora do harness** (outro programa do aluno) não é dada à frente. Teste na Task 4.
3. **Comando de banco ausente ou que falha** (ferramenta não instalada, banco desligado) não derruba o `open` nem o `close`: vira aviso com o próximo passo, e `ah ambiente preparar` tenta de novo. Teste na Task 4.
4. **Teste que altera arquivo rastreado** (gera snapshot, formata código): a árvore depois do teste não é a do HEAD, e a prova não é gravada. Teste na Task 1.
5. **Base sem a pasta de migrações, ou com arquivos fora do padrão** (README na pasta): a última da base vale 0, e o que não casa com o padrão é ignorado. Teste na Task 2.

---

### Task 1: Extensão `prova`

Nível: medio.

**Files:**
- Create: `nucleo/extensoes/prova/extensao.mjs`
- Test: `teste/prova-comando.test.mjs`
- Modify: `docs/referencia/comandos.md` (nova seção `prova`, depois de `recursos`)

**Interfaces:**
- Produces: `ah prova <rótulo> [-- <comando>…]`, `ah prova --confere <ramo> [<rótulo>]`; `frente.extensoes.prova.provas: [{rotulo, arvore, commit, comando, em}]` (uma por rótulo, a última); linhas de `<dirEstado>/extensoes/prova/provas.jsonl`: `{id, frente, rotulo, arvore, commit, comando, em}`; coluna `PROVA` (`e2e 1a2b3c4`, a mais recente). Configuração: `{"comandos": {"<rótulo>": ["argv", …]}}`, opcional.

Regras: rótulo `^[a-z][a-z0-9:-]{0,39}$`. Gravar exige sessão e frente; a árvore vem do worktree da frente (`git rev-parse HEAD^{tree}`). Worktree com arquivo rastreado alterado (`git status --porcelain --untracked-files=no`) recusa antes de rodar. Comando: o que vem depois de `--` (um argumento só vai ao shell, vários rodam direto, como no `ah pesado`), senão `config.comandos[rótulo]`, senão recusa. Roda no worktree, com a saída herdada. Código ≠ 0: imprime `O teste <rótulo> falhou (código N): nada gravado.` e devolve o código do teste. Código 0 com árvore diferente da de antes: aviso e nada gravado (código 1). `--confere` não exige sessão: ref inválida recusa (código 1); acha prova com a mesma árvore (e o rótulo, se dado) na lista durável ou nas frentes vivas: código 0; não acha: código 3.

- [ ] **Step 1: Escrever os testes que falham** em `teste/prova-comando.test.mjs`, com `projetoDeTeste({extensoes: {prova: {comandos: {unit: ['node', '-e', 'process.exit(0)']}}}})`:
  - `grava a árvore do worktree depois do teste que passa`: commit no worktree; `ah prova unit` sai 0, a saída casa com `/^Prova gravada: unit na frente as-1 carrinho, árvore [0-9a-f]{7}/m`; `frente.extensoes.prova.provas[0].arvore` é o `HEAD^{tree}` do worktree; a lista durável tem uma linha.
  - `teste que falha não grava`: `ah prova unit -- node -e "process.exit(4)"` sai 4, sem prova na frente.
  - `worktree sujo recusa antes de rodar`: arquivo rastreado alterado; código 1, `erro` casa com `/arquivo rastreado alterado/` e o comando não rodou (um `-- node -e` que cria um arquivo marca: o arquivo não existe).
  - `teste que muda arquivo rastreado não grava`: o comando reescreve um arquivo rastreado; código 1, aviso `/a árvore mudou durante o teste/`.
  - `confere: 0 no ramo da frente e no merge --no-ff na base parada, 3 com a base andada, 1 com ref inválida`: depois da prova, `ah prova --confere feat/carrinho` → 0; `git merge --no-ff feat/carrinho` na `dev` do principal, `--confere dev` → 0; commit novo na `dev`, `--confere dev` → 3 com `/nenhuma prova/`; `--confere nada-disso` → 1.
  - `a prova sobrevive ao close`: guardar o sha do merge (`git rev-parse dev`), `ah close` (que pode acrescentar commit de histórico à `dev`), e `--confere <sha do merge>` → 0, achado na lista durável.
  - `sem comando para o rótulo recusa`: `ah prova e2e` sem `--` nem configuração → 1, `/Próximo passo|Faça: .*prova\.comandos/`.
  - `coluna PROVA no quadro`: `ah board` casa com `/unit [0-9a-f]{7}/`.
- [ ] **Step 2: Rodar e ver falhar.** `node --test teste/prova-comando.test.mjs` → FAIL (`comando desconhecido: prova`).
- [ ] **Step 3: Implementar** `nucleo/extensoes/prova/extensao.mjs`: `validarConfig` (só `comandos`, objeto de rótulo → lista argv não vazia de textos), comando `prova` com `requisitos: {sessao: false}` (gravar recusa sem sessão, como a `recursos`), `colunas`. A lista durável em `path.join(ctx.dirEstado, 'extensoes', 'prova', 'provas.jsonl')`, com `fs.appendFileSync` (criar a pasta); a leitura ignora linha ilegível. A execução do teste com `spawnSync(…, {cwd: worktree, stdio: 'inherit', shell: umSo})`.
- [ ] **Step 4: Rodar e ver passar.** `node --test teste/prova-comando.test.mjs` → PASS.
- [ ] **Step 5: Documentar** a seção `prova` em `docs/referencia/comandos.md`: uso, configuração, o fluxo (reintegrar a base, `ah prova`, merge `--no-ff`, `--confere` antes de repetir o teste), os códigos 0/1/3 e a tabela de recusas com o "Faça".
- [ ] **Step 6: Verificar e commitar.** `npm test` verde, `node ferramentas/varre-termos.mjs` código 0.

```bash
git add -- nucleo/extensoes/prova teste/prova-comando.test.mjs docs/referencia/comandos.md
git commit -m "feat(prova): prova por árvore gravada pelo próprio teste e conferida com 0 ou 3"
```

### Task 2: Extensão `migracao`: reservar, liberar, listar

Nível: medio.

**Files:**
- Create: `nucleo/extensoes/migracao/extensao.mjs`, `nucleo/extensoes/migracao/numeros.mjs` (leitura dos números da base e escolha da reserva, sem `ctx`, testável à parte)
- Test: `teste/migracao-reserva.test.mjs`
- Modify: `docs/referencia/comandos.md` (nova seção `migracao`)

**Interfaces:**
- Produces (em `numeros.mjs`): `numeroDoArquivo(nome: string, padrao: RegExp) → number|null` (primeiro grupo do padrão); `ultimaDaBase(git, base: string, pasta: string, padrao: RegExp) → number` (maior número entre os arquivos de `git ls-tree --name-only <base> -- <pasta>/`; 0 sem pasta ou sem arquivo que case); `proximoNumero(ultima: number, reservas: number[]) → number` (`Math.max(ultima, ...reservas) + 1`); `formatar(n: number, digitos: number) → string`.
- Produces (extensão): `ah migracao listar [--json]` (sem sessão), `ah migracao reservar [--frente <nome>]`, `ah migracao liberar [--frente <nome>]`; `frente.extensoes.migracao = {numero, em}`; coluna `MIGRACAO` (`0003`). Configuração: `{"pasta": "db/migracoes", "padrao": "^(\\d+)_", "digitos": 4, "renumerar": [argv…]}`; `pasta` obrigatória; `padrao` padrão `^(\d+)_`; `digitos` padrão 4; `renumerar` é da Task 3. A base é `ctx.configDoProjeto.git.base`.

Regras: reservar sob `gravarCampos` com função: quem já tem número acima da última da base fica com ele ("já reservada"); senão, `proximoNumero` com as reservas de todas as outras frentes do estado (ativas, passadas e abrindo: a passada continua dona). `--frente` em frente ativa de outra sessão viva recusa, como na `recursos` (`conferirDona`). `liberar` apaga o campo. `listar`: `Última da dev: 0002 (0002_cupom.sql)` e uma linha por reserva, com `(a dev já passou dela: rode ah migracao renumerar depois de reintegrar)` quando o número ≤ última. `depoisDeFechar`: escreve `Reserva de migração 0003 liberada.` (o registro já saiu do estado).

- [ ] **Step 1: Escrever os testes que falham** em `teste/migracao-reserva.test.mjs`:
  - `numeros: arquivo fora do padrão é ignorado; base sem pasta vale 0` (direto em `numeros.mjs`, com um `git` falso que devolve `README.md\n0001_base.sql\n0002_cupom.sql` e outro que devolve código 128).
  - `reservar conta a base e as reservas vivas`: base com `0001_base.sql` e `0002_cupom.sql`; frente `um` reserva 3, `dois` reserva 4, `um` de novo responde `já reservada: 0003`; `listar` mostra as duas; `--json` traz `{ultima: 2, reservas: [{id, frente, numero}]}`.
  - `a frente passada continua dona do número`: `ah handoff` em `um`; `tres` reserva 5.
  - `liberar e close liberam`: `dois` libera e `tres` (nova) reserva 4; o `close` de `um` escreve `Reserva de migração 0003 liberada.`.
  - `reserva que a base ultrapassou aparece marcada`: commit `0003_outra.sql` na `dev`; `listar` marca a `0003` de `um` com `renumerar`.
  - `--frente de sessão viva recusa`: outra sessão, `reservar --frente um` → 1.
  - `sem pasta na configuração não carrega`: `carregarParaTeste` com `{}` lança `/pasta/`.
- [ ] **Step 2: Rodar e ver falhar.** `node --test teste/migracao-reserva.test.mjs` → FAIL.
- [ ] **Step 3: Implementar** `numeros.mjs` e `extensao.mjs` (`validarConfig`, comando `migracao` com subcomandos, `reacoes.depoisDeFechar`, `colunas`). O padrão é compilado uma vez por chamada (`new RegExp(config.padrao ?? '^(\\d+)_')`); `validarConfig` recusa padrão inválido ou sem grupo.
- [ ] **Step 4: Rodar e ver passar.**
- [ ] **Step 5: Documentar** a seção `migracao` (reservar, liberar, listar; a regra do número; o que fazer quando a base passou da reserva).
- [ ] **Step 6: Verificar e commitar.**

```bash
git add -- nucleo/extensoes/migracao teste/migracao-reserva.test.mjs docs/referencia/comandos.md
git commit -m "feat(migracao): reserva do número de migração por frente"
```

### Task 3: `ah migracao renumerar`

Nível: alto. Mexe em arquivos do worktree da frente e no índice do git.

**Files:**
- Modify: `nucleo/extensoes/migracao/extensao.mjs`, `nucleo/extensoes/migracao/numeros.mjs`
- Create: `teste/migracao-ferramenta-falsa.mjs` (passo falso da ferramenta: acrescenta `{de} -> {para}` a um arquivo de registro dado na linha de comando)
- Test: `teste/migracao-renumerar.test.mjs`
- Modify: `docs/referencia/comandos.md` (seção `migracao`)

**Interfaces:**
- Consumes: `ultimaDaBase`, `numeroDoArquivo`, `formatar` (Task 2).
- Produces: `planoDeRenumeracao(daFrente: string[], ultima: number, padrao: RegExp, digitos: number) → [{de, para}]` (em `numeros.mjs`; `daFrente` ordenado; lista vazia quando a primeira já é `ultima + 1` e as outras seguem em sequência); `ah migracao renumerar [--frente <nome>]`.

Regras, no worktree da frente: recusa se há merge em curso ou caminho em conflito ("termine o merge e commite; depois renumere"); recusa se a base não está mesclada (`git merge-base --is-ancestor <base> HEAD`, saída: `git merge <base> --no-edit` no worktree). Migrações da frente = arquivos da pasta que casam com o padrão e não existem na base. Nenhuma: `nada a renumerar`. Plano vazio: `já em dia`, e a reserva passa a ser o primeiro número da frente. Senão: `git mv` de cada `de` para `para` (o `para` troca só o número, com `digitos`), na ordem que não sobrescreve; para cada par, o comando `renumerar` da configuração, se houver, com `{de}`, `{para}` e `{pasta}` substituídos, no worktree (falha: para, diz o que já foi renomeado e devolve 1); grava a reserva; escreve o que mudou, os arquivos fora da pasta que citam o nome antigo (`git grep -l -F`) e `Falta: git commit no worktree.`.

- [ ] **Step 1: Escrever os testes que falham** em `teste/migracao-renumerar.test.mjs`:
  - `planoDeRenumeracao` direto: `['0003_frete.sql']` com última 2 → `[]`; com última 4 → `[{de: '0003_frete.sql', para: '0005_frete.sql'}]`; duas da frente (`0003_a`, `0004_b`) com última 3 → `0004_a`, `0005_b`.
  - `renumera depois da reintegração`: frentes `um` e `dois` reservam 3 e 4 e criam `0003_um.sql` e `0004_dois.sql`; `dois` entra na `dev` primeiro (merge e close); no worktree de `um`, `git merge dev --no-edit` e `ah migracao renumerar`: a última da `dev` é 4 (`0004_dois.sql`), e `0003_um.sql` vira `0005_um.sql`, em stage; a reserva de `um` é 5; a saída termina com `Falta: git commit`.
  - `já em dia não mexe`: frente com `0003_x.sql` sobre base com última 2 → `já em dia`, `git status --porcelain` vazio.
  - `sem a base mesclada recusa com o merge como próximo passo`.
  - `o passo da ferramenta roda por arquivo`: configuração `renumerar: ['node', <ferramenta falsa>, <registro>, '{de}', '{para}']`; o registro tem `0003_um.sql -> 0005_um.sql`.
  - `quem cita o nome antigo é listado`: `docs/notas.md` cita `0003_um.sql`; a saída lista `docs/notas.md`.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** `planoDeRenumeracao` e o subcomando. O git do worktree pelo `ctx.git(args, {cwd: worktree})`.
- [ ] **Step 4: Rodar e ver passar.**
- [ ] **Step 5: Documentar** `renumerar` na seção `migracao`, com o fluxo da reintegração e o exemplo do passo da ferramenta na configuração.
- [ ] **Step 6: Verificar e commitar.**

```bash
git add -- nucleo/extensoes/migracao teste/migracao-renumerar.test.mjs teste/migracao-ferramenta-falsa.mjs docs/referencia/comandos.md
git commit -m "feat(migracao): renumerar a migração da frente depois da reintegração"
```

### Task 4: Extensão `ambiente`: portas, banco e arquivo por frente

Nível: alto. Concorrência entre aberturas e comandos externos que falham.

**Files:**
- Create: `nucleo/extensoes/ambiente/extensao.mjs`, `nucleo/extensoes/ambiente/portas.mjs` (escolha da porta e sondagem, sem `ctx`)
- Create: `teste/ambiente-banco-falso.mjs` (`criar|apagar|listar <pasta> [<banco>]`: cria, apaga ou lista arquivos vazios na pasta; `apagar` de banco inexistente sai 0; com a variável `BANCO_FALSO_FALHA=1`, sai 1)
- Test: `teste/ambiente-frente.test.mjs`
- Modify: `docs/referencia/comandos.md` (nova seção `ambiente`)

**Interfaces:**
- Produces (em `portas.mjs`): `escolherPortas(faixa: [de, ate], quantas: number, ocupadas: Set<number>) → number[]|null` (as menores livres, em ordem; `null` sem vagas); `portaEmUso(porta: number) → Promise<boolean>` (tenta `net.createServer().listen(porta, '127.0.0.1')`; `EADDRINUSE` → `true`).
- Produces (extensão): `ah ambiente [mostrar] [--json]`, `ah ambiente preparar`, `ah ambiente desfazer`; `frente.extensoes.ambiente = {portas: {<CHAVE>: n}, banco: {nome, criado}|null, arquivo}`; coluna `AMBIENTE` (`4100 4101 loja_carrinho`). Configuração:

```json
"ambiente": {
  "arquivo": ".env.frente",
  "portas": { "faixa": [4100, 4199], "chaves": ["PORTA_WEB", "PORTA_API"] },
  "banco": { "nome": "loja_{frente}", "chave": "BANCO",
             "criar": ["createdb", "{banco}"], "apagar": ["dropdb", "--if-exists", "{banco}"],
             "listar": ["psql", "-Atc", "select datname from pg_database"] },
  "fixos": { "portas": [3000, 5432], "bancos": ["loja", "loja_test"] }
}
```

`arquivo` padrão `.env.frente`; `portas` e `banco` opcionais (pelo menos um); `{frente}` no molde do banco é o nome da frente com `-` trocado por `_`; o nome final casa com `^[a-z_][a-z0-9_]{0,62}$`, e um nome que cai em `fixos.bancos` recusa na configuração quando o molde não tem `{frente}`. `listar` é da Task 5.

Regras de `preparar` (também o `depoisDeAbrir`, nova ou retomada; idempotente): (1) portas: se a frente ainda não tem, sonda a faixa fora do lock (`portaEmUso`), depois escolhe e grava sob `gravarCampos` com função, excluindo as das outras frentes (as desta extensão e, se ligada, as `porta` da `recursos`), as fixas e as em uso; sem vagas: aviso `a faixa 4100-4199 não tem N portas livres; Faça: aumente extensoes.ambiente.portas.faixa e rode ah ambiente preparar`; (2) banco: se `criado` não é `true`, roda `criar`; sucesso grava `criado: true`; falha (ou programa ausente) grava `criado: false` e avisa com o erro e `rode ah ambiente preparar de novo`; (3) escreve o arquivo no worktree: comentário de cabeçalho `# gerado por ah ambiente; refaça com tools/ah ambiente preparar` e `CHAVE=valor` por linha. `depoisDeFechar`: roda `apagar` se `criado` e o banco não é fixo; falha vira aviso com o comando para apagar à mão. `desfazer`: apaga o banco, remove o arquivo e as portas da frente (até a D1 estar resolvida, é o passo antes do `close`). `aoPassar`: nada (a frente passada continua dona). As reações nunca lançam.

- [ ] **Step 1: Escrever os testes que falham** em `teste/ambiente-frente.test.mjs` (faixa a partir de uma porta livre obtida com `listen(0)`; banco falso numa pasta temporária):
  - `escolherPortas` direto: pula as ocupadas, devolve `null` quando não cabem.
  - `abrir reserva portas, cria o banco e escreve o arquivo`: `ah open carrinho`; o arquivo do worktree tem `PORTA_WEB=<de>`, `PORTA_API=<de+1>`, `BANCO=loja_carrinho`; o banco falso tem `loja_carrinho`; `ah board` mostra a coluna.
  - `duas frentes não dividem porta, e as fixas e as em uso ficam de fora`: `fixos.portas` com `<de>`; um servidor escutando em `<de+1>`; `carrinho` fica com `<de+2>`, `<de+3>`; `cupom`, com `<de+4>`, `<de+5>`.
  - `faixa esgotada avisa e o open segue`: faixa de uma porta e duas chaves; `open` sai 0, `erro` casa com `/aumente extensoes\.ambiente\.portas\.faixa/`.
  - `banco que falha avisa e preparar tenta de novo`: `BANCO_FALSO_FALHA=1` no `open` → aviso, `criado: false`; `ah ambiente preparar` sem a variável → `criado: true`.
  - `close apaga o banco e libera as portas`: `ah ambiente desfazer`, depois `ah close`; o banco falso não tem `loja_carrinho`; outra frente aberta em seguida pode receber `<de>`.
  - `fechar com o banco ainda criado apaga no depoisDeFechar`: com o arquivo do worktree removido à mão (para o `close` passar enquanto a D1 não se resolve), `ah close` apaga o banco.
  - `banco fixo nunca é apagado`: `ctxFalso` com uma frente cujo `banco.nome` está em `fixos.bancos`; `depoisDeFechar` não chama o `apagar`.
  - `configuração inválida não carrega`: sem `portas` nem `banco`; faixa invertida; `criar` que não é lista.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** `portas.mjs` e `extensao.mjs`. Comandos externos por `spawnSync(argv[0], argv.slice(1), {cwd: raiz, encoding: 'utf8'})`, com os marcadores trocados em cada argumento.
- [ ] **Step 4: Rodar e ver passar.**
- [ ] **Step 5: Documentar** a seção `ambiente`: configuração, o que acontece na abertura e no fechamento, recursos fixos, o passo antes do `close` (D1) e a tabela de recusas e avisos.
- [ ] **Step 6: Verificar e commitar.**

```bash
git add -- nucleo/extensoes/ambiente teste/ambiente-frente.test.mjs teste/ambiente-banco-falso.mjs docs/referencia/comandos.md
git commit -m "feat(ambiente): portas, banco e arquivo de ambiente por frente"
```

### Task 5: `ambiente` no `sweep`

Nível: medio.

**Files:**
- Modify: `nucleo/extensoes/ambiente/extensao.mjs`
- Test: `teste/ambiente-sweep.test.mjs`
- Modify: `docs/referencia/comandos.md` (seção `ambiente`)

**Interfaces:**
- Consumes: `portaEmUso` (Task 4); `banco.listar` da configuração.
- Produces: `reacoes.noSweep(ctx) → string[]`.

Regras: porta da faixa em uso, sem frente e não fixa → `porta 4102 em uso sem frente; Faça: encerre o processo ou declare a porta em extensoes.ambiente.fixos.portas`. Com `listar`: cada linha da saída que casa com o molde (`{frente}` vira `[a-z0-9_]+`), sem frente e não fixa → `banco loja_velho sem frente; Faça: apague com o comando apagar da configuração ou declare em fixos.bancos`. `listar` que falha → uma linha dizendo que não deu para listar e por quê. Sem `listar`, os bancos não são conferidos. `--reparar` não apaga nada (a linha diz isso).

- [ ] **Step 1: Escrever os testes que falham:** porta em uso sem frente aparece; porta de frente e porta fixa não aparecem; banco do falso sem frente aparece, o da frente aberta e o fixo não; `listar` que falha vira uma linha; `ah sweep --json` traz `extensoes.ambiente`.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** `noSweep`.
- [ ] **Step 4: Rodar e ver passar.**
- [ ] **Step 5: Documentar** o que o `sweep` mostra.
- [ ] **Step 6: Verificar e commitar.**

```bash
git add -- nucleo/extensoes/ambiente teste/ambiente-sweep.test.mjs docs/referencia/comandos.md
git commit -m "feat(ambiente): portas e bancos sem frente no sweep"
```

### Task 6: Fechamento da fatia

Nível: leve.

**Files:**
- Create: `docs/superpowers/plans/2026-11-26-metodo-fatia-8-registro.md`

- [ ] **Step 1: Varredura final dos nomes.** `node ferramentas/varre-termos.mjs` com código 0, e `git diff p2-metodo --stat` só com arquivos da linha deste ramo.
- [ ] **Step 2: Verificação completa.** `node ferramentas/verifica.mjs --node "$(mise where node@22)/bin/node" --node "$(command -v node)"` → código 0; guardar a saída.
- [ ] **Step 3: Registro de execução:** commits por tarefa, decisões tomadas (D1 a D4 com a resposta do orquestrador), desvios do plano, limitações (por exemplo: na retomada em outra máquina, `preparar` não recria um banco já marcado `criado`) e a saída do `verifica.mjs`.
- [ ] **Step 4: Commit e relato.**

```bash
git add -- docs/superpowers/plans/2026-11-26-metodo-fatia-8-registro.md
git commit -m "docs(metodo): registro da fatia 8 (opcionais)"
```

Relato ao orquestrador: ramo, commits, saída do `verifica.mjs`, pendências. Fora deste ramo, para o orquestrador: a frase "nesta versão, só a `recursos`" da seção "Extensões" de `comandos.md` e o mapa de extensões em `docs/extensoes/interface.md` passam a citar as três novas.
