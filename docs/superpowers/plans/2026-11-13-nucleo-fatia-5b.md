# Núcleo do agent-harness, fatia 5b (extensões, números, dependências): plano

**Objetivo:** fechar a fatia 5 da seção 12.1 do desenho: interface de extensão com a extensão de exemplo `recursos` e o guia de como estender, `ah board --numeros`, `ah deps` e o conserto da tomada não atômica da trava vencida (pendência da fatia 3).

**Desenho:** `docs/superpowers/specs/2026-11-12-nucleo-design.md`, seções 4 (disposição: `nucleo/extensoes/`, `.harness/extensoes/`), 5 (`extensoes` na configuração), 9 (extensões), 11 ("Ordem e dependências", "Regra geral de comportamento"), 12.4 (toda recusa diz a saída), 12.5 (medir se ajuda), 14 (pronto quando).

**Tecnologia:** Node 22+, ESM, sem dependências, `node:test`. Ramo `fatia-5b`, a partir da `dev` em `177d97e`.

## Decisões (onde o desenho deixa escolha)

O autor não foi consultado em cada uma; qualquer delas pode ser revista.

### Extensões

1. **Forma.** Uma extensão é uma pasta `<nome>/` com `extensao.mjs`, cujo `export default` é um objeto com `versaoDaInterface: 1` e `descricao`, e, todos opcionais: `comandos`, `travas`, `verificacoes`, `reacoes`, `resumo`, `colunas`, `validarConfig`. O nome casa com `^[a-z][a-z0-9-]*$`.
2. **Onde e quando vale.** As que acompanham o harness ficam em `nucleo/extensoes/` e as do projeto em `.harness/extensoes/`. Uma extensão só carrega se a chave dela existir em `config.extensoes`, com `true` ou com um objeto (a configuração dela). Com o mesmo nome nos dois lugares, vale a do projeto, e o `doctor` avisa da sombra.
3. **Versão da interface.** O núcleo declara `VERSAO_DA_INTERFACE = 1`. Extensão com outra versão não carrega, e o `doctor` acusa com a versão esperada.
4. **Carga tolerante.** Uma extensão que falha ao carregar (arquivo ausente, erro de sintaxe, formato inválido, configuração recusada por `validarConfig`, comando com nome de comando do núcleo ou de outra extensão) não derruba os comandos do núcleo. O comando em curso segue sem ela, o `doctor` mostra o item como falha com o motivo e o conserto, e o gancho segue com as travas do núcleo. A carga acontece uma vez por processo, com cache.
5. **Comandos.** Cada entrada de `comandos: {nome: {descricao, uso, requisitos, executar(args, ctx)}}` vira `ah <nome>`, com os mesmos requisitos e a mesma ajuda dos comandos do núcleo. A ajuda geral lista esses comandos numa seção própria, com o nome da extensão.
6. **Travas.** Cada entrada de `travas: [{id, avaliar(acao, ctx)}]` é avaliada depois das travas do núcleo, para comando e para edição. `avaliar` devolve `null` (passa) ou `{motivo, saida}`. O id da trava no evento e na recusa é `<extensão>/<id>`. `AH_GUARD=off` libera, como nas do núcleo. Uma trava que lança erro recusa (`<extensão>/<id>`: "a trava falhou: <erro>"), com a saída "corrija a extensão ou desligue-a em .harness/config.json".
7. **Verificações.** `verificacoes: [{item, conferir(ctx)}]` entram no `doctor` depois dos itens do núcleo e devolvem `{estado: 'ok'|'aviso'|'falha', detalhe, conserto}`. Um erro lançado vira falha do item. O `doctor` também ganha o item "Extensões", com uma linha por extensão ligada (carregou ou o motivo da falha).
8. **Reações ao ciclo.** São `reacoes: {depoisDeAbrir, antesDeFechar, depoisDeFechar, aoPassar, noSweep}`, cada uma `async (ctx)`. Só `antesDeFechar` pode recusar: devolve `{recusa: motivo, saida}`, e o `close` para antes de mexer em qualquer coisa, junto das conferências de perda de trabalho. Nas outras, um erro vira aviso (`Aviso: extensão <nome> falhou em <reação>: …`) e não desfaz o que o núcleo já fez. `noSweep` devolve linhas a mostrar e só conserta com `--reparar` (o `ctx` diz qual dos dois modos está valendo).
9. **Resumo e quadro.** `resumo(ctx)` devolve até duas linhas, cortadas em 200 caracteres e somadas antes da cauda do resumo, sem passar do `LIMITE_RESUMO`. `colunas: [{titulo, valor(frente, ctx)}]` acrescenta colunas ao quadro, com o valor cortado em 30 caracteres. No `--json`, os valores vão em `extensoes.<nome>.<titulo>` de cada frente.
10. **Contexto.** Toda chamada recebe um `ctx` com:
    - `extensao` (nome), `config` (a seção da extensão, ou `{}` quando a chave vale `true`), `configDoProjeto`, `raiz`, `dirEstado`, `sessaoId`, `escrever`, `avisar`;
    - `frente`, quando há uma, como cópia só de leitura, e `frentes()`, que lista todas;
    - `gravarCampos(nomeDaFrente, campos)`, que grava sob a trava de frentes, apenas em `frente.extensoes[<nome>]`;
    - `git(args, opcoes)` e `gh(args, opcoes)`, pelos auxiliares do núcleo;
    - `ErroDeUso`, para recusar dentro de comandos.

    A escrita da extensão no estado fica restrita aos campos dela.
11. **Segurança.** Uma extensão é código do projeto e roda com os mesmos poderes do `ah`. A interface separa responsabilidades e não serve de isolamento. Isso fica escrito no guia.

### Extensão `recursos`

12. Ela acompanha o harness em `nucleo/extensoes/recursos/`. Guarda recursos por frente (tipo e valor, como `porta 3001`) em `frente.extensoes.recursos.itens`.
    - **Comandos:** `ah recursos reservar <tipo> <valor>` recusa um valor já reservado por outra frente ativa e diz qual é. `ah recursos liberar <tipo> <valor>|--todos` e `ah recursos listar [--json]` completam o conjunto.
    - **Ciclo:** `antesDeFechar` recusa o fechamento com recursos ainda reservados e manda liberar. `aoPassar` mantém a reserva (a frente segue dona).
    - **Quadro e doctor:** a coluna "RECURSOS" mostra os recursos da frente. A verificação "Recursos sem conflito" acusa o mesmo valor em duas frentes, caso que só aparece se o estado for editado à mão.
    - **Configuração:** opcional, `{tipos: ['porta', …]}`. Sem ela, qualquer tipo vale.
13. **Guia.** O guia fica em `docs/extensoes/como-estender.md`, com passo a passo do zero numa pasta `.harness/extensoes/<nome>/`: um comando, uma trava e uma reação ao fechamento, cada um com um teste que usa os auxiliares exportados para extensões (`nucleo/lib/extensoes-teste.mjs`: projeto descartável já preparado, `ctx` falso e chamada ao despacho). A referência da interface fica em `docs/extensoes/interface.md`.

### `ah board --numeros`

14. `ah board --numeros [--desde AAAA-MM-DD] [--ate AAAA-MM-DD] [--json]` lê `eventos.jsonl`. Sem período, vale tudo.
    - **Frentes e sessões:** frentes abertas (`abertura`) e fechadas (`fechamento` e `fechamento-local`), tempo médio e mediano por frente (de `aberta` a `fechada`), passagens de bastão (`passagem`), tomadas (`tomada`), retomadas (`retomada`), sessões iniciadas (`sessao-inicio`) e sessões por modelo (`modelo`, ou "não informado").
    - **Recusas:** por trava (`recusa.trava`, incluindo as de extensão), liberações por trava (`liberacao`) e recusas de comando (`recusa-de-comando`, por comando).
    - **Pesado:** total de execuções, espera média e máxima e duração média (`pesado.esperaMs`, `duracaoMs`).

    Uma linha ilegível conta à parte e não derruba o comando. Os testes usam um registro de exemplo commitado em `teste/eventos-de-exemplo/eventos.jsonl`.
15. **Período.** As datas seguem o fuso da configuração. `--desde` e `--ate` fecham o intervalo nos dois lados. Uma frente entra no tempo médio quando foi fechada dentro do período.

### `ah deps`

16. **Fonte.** O comando lê a relação de bloqueio das issues pela API REST do GitHub, via `gh api`: `GET /repos/{dono}/{repo}/issues/{n}/dependencies/blocked_by` e `.../blocking`. Antes de codificar, quem constrói confere esse contrato na documentação oficial, e a URL e a data vão para `docs/referencia/comandos.md`. Se a API não responder (404 ou erro), a fonte passa a ser a linha `Bloqueado por: #N[, #M]` no corpo da issue, que de todo modo também é aceita.
17. **Forma.** Sem argumento, `ah deps` lê as issues abertas (`gh issue list --state open --json number,title,body`, até 200) e mostra a árvore de bloqueios e a lista "Livres para começar": issues abertas, sem bloqueio aberto e sem frente ativa com o ticket. `ah deps <n>` mostra só a issue `n`: o que a bloqueia, em cascata, e o que ela bloqueia. `--json` dá a mesma informação em JSON.
18. **Cache.** Toda leitura bem-sucedida grava `deps.json` no estado, com a data. Sem rede, o comando usa o cache e diz de quando ele é. Sem cache e sem rede, recusa e diz o que fazer.
19. **`open`.** Quando um ticket da frente está bloqueado por outro aberto, o `open` avisa e não recusa (regra geral do §11). A informação vem do cache, sem rede nova; sem cache, não avisa. Fica fora: a coluna de bloqueios no quadro, que pediria rede ou cache a cada `board` e entra como pendência.

### Trava vencida

20. Em `tentarPegar` (`nucleo/lib/estado.mjs`), antes de renomear, lê a `marca` do `dono.json` da trava vista vencida. Depois do rename, confere a marca da pasta tomada: se for outra, era uma trava nova de outro processo, e ela volta ao lugar. O teste simula a troca entre a leitura e o rename.

### Versão e documentação

21. `package.json` e `nucleo/versao.mjs` passam a 0.2.0. Atualizar `docs/referencia/comandos.md` (os comandos `recursos`, `deps`, `board --numeros`, os itens novos do `doctor` e os eventos novos), `README.md` e `docs/aula/`, este só nas menções à fatia 5. Tom técnico-acadêmico: títulos nominais e sem "você".

## Mapa de arquivos

```
nucleo/lib/extensoes.mjs          (novo) descobrir, carregar, validar, cache, ctx, chamar reações
nucleo/lib/extensoes-teste.mjs    (novo) auxiliares de teste para extensões
nucleo/bin/ah.mjs                 despacho e ajuda com comandos de extensão
nucleo/lib/config.mjs             validação da seção de cada extensão (delegada)
nucleo/lib/travas.mjs             + travas de extensão em avaliar()
nucleo/adaptadores/contrato.mjs   recusa de trava de extensão no evento
nucleo/comandos/{open,close,handoff,sweep,doctor,board}.mjs   reações, itens, colunas
nucleo/lib/resumo.mjs             + linhas de extensão
nucleo/extensoes/recursos/        (novo) extensao.mjs
nucleo/comandos/deps.mjs          (novo)
nucleo/lib/numeros.mjs            (novo) agregação dos eventos
nucleo/lib/estado.mjs             tentarPegar com conferência da marca
teste/extensoes.test.mjs, teste/recursos.test.mjs, teste/numeros.test.mjs, teste/deps.test.mjs (novos)
teste/eventos-de-exemplo/eventos.jsonl (novo); teste/apoio/gh-falso.mjs (API de dependências)
docs/extensoes/interface.md, docs/extensoes/como-estender.md (novos)
docs/referencia/comandos.md, README.md, docs/aula/*
```

## Tarefas

Cada tarefa: testes primeiro, suíte inteira verde, `node ferramentas/varre-termos.mjs` com código 0 e commit próprio.

1. **Trava vencida** (decisão 20). Commit `fix: tomada da trava vencida confere a marca`.
2. **Interface de extensão** (decisões 1–11): carga, comandos, travas, verificações, reações, resumo, colunas, ctx, com testes que usam uma extensão de teste em `teste/`. Commits `feat: interface de extensão` e o que mais couber.
3. **Extensão `recursos`, guia e referência da interface** (12–13). Commit `feat: extensão recursos` e `docs: guia de como estender`.
4. **`ah board --numeros`** (14–15). Commit `feat: board --numeros`.
5. **`ah deps` e aviso no `open`** (16–19). Commit `feat: ah deps`.
6. **Prova do guia:** um subagente sem contexto, que recebe só o repositório e o pedido "crie um comando novo seguindo docs/extensoes/como-estender.md", cria uma extensão num projeto descartável e roda o teste dela. O resultado, com o comando e a saída, vai para `docs/referencia/ensaio-guia-de-extensao.md`. Se o subagente travar, o guia é corrigido e a prova repetida.
7. **Documentação e versão** (21). Commit `docs: fatia 5b` e `chore: versão 0.2.0`.
8. **Revisão independente** do ramo e consertos. Depois, merge `--no-ff` na `dev`, sem push.

## Fica fora

- Coluna de bloqueios no quadro (decisão 19).
- Extensões instaladas por pacote ou por URL: só pasta local.
- Isolamento da extensão (decisão 11).
- Ensaio com agente real das travas de extensão; Windows e macOS.
- As demais pendências das fatias anteriores (`*-pendencias.md` e seções "Pendências").

## Decisões da execução (linha B)

Tarefas 1, 4 e 5, executadas no ramo `fatia-5b-numeros`, em paralelo às tarefas 2 e 3.

- **Tarefa 1.** Além da marca, a pasta tomada só é apagada se continuar vencida pela leitura nova (a conferência anterior permanece). Marca ausente nos dois lados (trava sem `dono.json`) conta como a mesma marca; nesse caso, vale a data da pasta, como antes. O ponto de troca para o teste é `ganchosDeTeste.antesDeTomar`, exportado por `estado.mjs` e `null` fora dos testes.
- **Tarefa 4.** Linhas ilegíveis de `eventos.jsonl` não têm data: contam com qualquer período. Com período, evento sem `em` legível fica fora; sem período, entra. As liberações ocupam linha própria ("Liberações por trava"). Nas listas por chave, a ordem é decrescente pela contagem e alfabética no empate. `--desde`/`--ate` sem `--numeros` são recusados com o próximo passo. A lógica fica em `nucleo/lib/numeros.mjs`; o `board` apenas delega quando recebe `--numeros`.
