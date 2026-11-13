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

## Decisões da execução

Tomadas nas tarefas 2 e 3, onde o plano deixava escolha ou não batia com o código.

### Interface de extensão (tarefa 2)

1. **Configuração.** `config.mjs` valida `extensoes`: nome com `^[a-z][a-z0-9-]*$` e valor `true`, `false` (desligada) ou objeto. A seção de cada extensão continua validada pela própria extensão, na carga.
2. **Forma estrita.** Chave fora da lista da decisão 1 no `export default` impede a carga (`campo desconhecido`), para acusar erros de digitação como `reacao`.
3. **Travas síncronas.** `avaliar()` do núcleo é síncrona; a trava de extensão também. A que devolve promessa recusa como trava quebrada. A ação recebida traz `comandos` (os comandos simples lidos: `argv`, `cwd`, `env`).
4. **`AH_GUARD=off` na trava de extensão.** A trava julga a ação inteira e não diz qual comando a ofendeu; por isso libera só quando todo comando simples da linha, fora o `cd`, traz a variável. Na edição de arquivo não há liberação, como na T4.
5. **Evento.** `recusa` e `liberacao` de trava de extensão levam também `extensao`.
6. **`antesDeFechar` que lança recusa** (não vira aviso): fechar sem a conferência da extensão poderia perder o que ela guarda. Roda logo depois da primeira conferência de perda de trabalho, sob a trava das frentes; o que a reação gravou volta ao objeto que o close grava depois.
7. **`depoisDeAbrir` também na retomada**, com `ctx.retomada`. **`depoisDeFechar`** recebe `ctx.soLocal`.
8. **`gravarCampos` aceita uma função** `(seçãoAtual, {frentes}) => campos`, chamada sob a trava das frentes, para conferir e gravar sem corrida (a extensão `recursos` precisa disso).
9. **Contexto.** Além da decisão 10, o `ctx` traz `cwd` e `env`. Nas travas e no resumo, `escrever` e `avisar` não mostram nada (a saída do gancho é do agente).
10. **Aviso de carga.** Comandos que usam extensões (`open`, `close`, `handoff`, `sweep`, `board` e o despacho de comando desconhecido) avisam uma vez por processo da extensão que não carregou; o `doctor` mostra o item e o gancho fica calado.
11. **Erro em comando de extensão** que não é `ErroDeUso` vira recusa com o nome da extensão e a saída "corrija a extensão ou desligue-a".
12. **Resumo.** Se não couber em `LIMITE_RESUMO`, saem primeiro as outras frentes e depois as linhas das extensões, das últimas para as primeiras. Extensão cujo `resumo` lança fica de fora e entra um aviso curto.
13. **`board --json`.** Os valores das colunas vão em `colunas.<extensão>.<título>` de cada frente, e não em `extensoes.<extensão>.<título>`: a frente já traz `extensoes` com o estado gravado pelas extensões, e misturar os dois confundiria campo gravado com coluna.
14. **`sweep --json`** ganha `extensoes: {<nome>: [linhas]}` só quando alguma extensão ligada tem `noSweep` (a saída sem extensões não muda).
15. **Itens do `doctor`.** `Extensão <nome> (projeto|harness)` por extensão ligada (falha com motivo e conserto; aviso na sombra); sem nenhuma, `Extensões (nenhuma ligada)`. As verificações saem como `<item> (<extensão>)`.

### Extensão `recursos` e guia (tarefa 3)

16. **Conflito** conta toda frente do estado (ativa, passada ou abrindo), porque a frente passada continua dona dos recursos. A conferência e a gravação ficam sob a trava (decisão 8 desta seção).
17. **`--frente <nome>`** em `reservar` e `liberar`, para quem fecha a frente de outra sessão (órfã ou passada) conseguir liberar; a saída da recusa do close usa essa forma.
18. **Sem `aoPassar`:** não há o que fazer na passagem. A verificação "Recursos sem conflito" acusa como falha.
19. **`projetoDeTeste` não roda o `init`**, que só roda a partir do clone: copia o núcleo de onde o auxiliar está (clone ou cópia instalada), grava a configuração, um `tools/ah` mínimo e empurra os ramos para um remoto local. Também exporta `carregarParaTeste` e `ctxFalso`.
20. **Exemplo do guia:** a extensão `revisao` (comando `ah revisao`, trava `revisao/gerados` e recusa no `antesDeFechar`). `teste/guia-de-extensao.test.mjs` grava os arquivos completos do guia num projeto descartável e roda os testes deles, para o guia não envelhecer sem aviso.

## Decisões da execução (linha B)

Tarefas 1, 4 e 5, executadas no ramo `fatia-5b-numeros`, em paralelo às tarefas 2 e 3.

- **Tarefa 1.** Além da marca, a pasta tomada só é apagada se continuar vencida pela leitura nova (a conferência anterior permanece). Marca ausente nos dois lados (trava sem `dono.json`) conta como a mesma marca; nesse caso, vale a data da pasta, como antes. O ponto de troca para o teste é `ganchosDeTeste.antesDeTomar`, exportado por `estado.mjs` e `null` fora dos testes.
- **Tarefa 4.** Linhas ilegíveis de `eventos.jsonl` não têm data: contam com qualquer período. Com período, evento sem `em` legível fica fora; sem período, entra. As liberações ocupam linha própria ("Liberações por trava"). Nas listas por chave, a ordem é decrescente pela contagem e alfabética no empate. `--desde`/`--ate` sem `--numeros` são recusados com o próximo passo. A lógica fica em `nucleo/lib/numeros.mjs`; o `board` apenas delega quando recebe `--numeros`.
- **Tarefa 5, contrato.** Conferido em 13/11/2026 em https://docs.github.com/en/rest/issues/issue-dependencies: `GET /repos/{owner}/{repo}/issues/{issue_number}/dependencies/blocked_by` e `.../blocking` existem como o plano diz, devolvem lista de issues (`number`, `title`, `state`, `repository_url`, `html_url`, `issue_dependencies_summary`), paginam com `per_page` (máximo 100) e `page`, e respondem 301, 404 e 410 nos demais casos. Nenhuma divergência de caminho.
- **Tarefa 5, lista das abertas.** Em vez de `gh issue list --json number,title,body`, a lista vem de `gh api repos/{dono}/{repo}/issues?state=open` (até 200, páginas de 100; https://docs.github.com/en/rest/issues/issues#list-repository-issues). Motivo: cada item traz `issue_dependencies_summary`, e o comando só chama `blocked_by` das issues com `total_blocked_by > 0`, em vez de uma chamada por issue aberta (até 200 processos `gh`). Os PRs, que essa lista também devolve, são descartados pela chave `pull_request`. O `gh-falso` responde também a `issue list` com `title` e `body`, para uso futuro.
- **Tarefa 5, demais.** A API é considerada indisponível no primeiro 404/410 de um endpoint de dependência; a partir daí vale só o corpo. Outro erro num `blocked_by` vira aviso e vale o corpo daquela issue. "Sem frente" exclui qualquer frente no estado (ativa, passada ou abrindo), não só as ativas. Bloqueio por issue de outro repositório aparece como `dono/repo#n` e não entra na cascata. `ah deps <n>` soma ao cache; a lista inteira o substitui. Issue inexistente (404 na leitura dela) é recusa, não falta de rede. Sem cabeçalho `X-GitHub-Api-Version`: vale a versão padrão do `gh`.

## Consertos da revisão

Achados da revisão independente da tarefa 8, cada um com teste que falhava antes do conserto.

1. **Tomada da trava vencida** (`estado.mjs`). A conferência da marca depois do rename (decisão 20) não fechava a corrida de três processos: B renomeava para `.vencida.*` a trava viva de A, tomada no meio, e C entrava junto com A; a devolução podia cair sobre a pasta de C ou ficar órfã, e o `soltar` de A, entre ler e apagar, podia apagar a trava de outro. Desenho novo: a pasta da trava nunca sai do lugar com dono dentro. Para tomar, tira-se o `dono.json` por rename (só um consegue) para um nome único ao lado da pasta e confere-se o arquivo tirado: se é o visto (mesma marca) e continua vencido pela data dele, a pasta, agora vazia, sai com `rmdir` (que só remove pasta vazia); se não, o dono volta com `link` (que não sobrescreve). O `soltar` segue o mesmo caminho e só tira a pasta quando o dono tirado é o seu. O dono é gravado com `wx`, um por pasta. Enquanto o dono está fora, ninguém entra (a pasta existe) e ninguém a julga vencida (o rename renovou a data da pasta). Pasta sem `dono.json` vencida pela data sai com `rmdir`, que falha se alguém gravou o dono no meio. Dispensou-se a trava auxiliar `.tomando` sugerida pela revisão, que precisaria vencer também e repetiria o problema um nível acima.
   - **Risco que resta (só de espera, não de exclusão):** se o `soltar` cair na janela de microssegundos em que outro tirou o dono para conferir, tenta de novo cinco vezes em 2 ms; esgotadas, a trava fica no lugar com o dono devolvido e vence sozinha (na hora, quando o processo termina; senão, no prazo do dono). Se a devolução não achar lugar (outro gravou dono na pasta vazia, só possível depois de uma parada maior que o prazo), o dono tirado é descartado e a pasta vence pela data. A exclusão continua valendo só enquanto o dono não passa do próprio prazo, como antes.
   - **Prazo do dono (achado 9).** O `dono.json` grava `venceMs`, e o vencimento é julgado por ele; sem ele (trava gravada antes), vale o de quem julga, como antes. Antes, um `gravarCampos` de extensão (30 s) podia tomar a trava `frentes` segurada pelo `close` (120 s).
   - Testes: três participantes com o ponto de troca e um `rename` interceptado (C entrava com A dentro), liberação com outro processo de verdade entrando no meio (a trava dele sumia) e prazo do dono. Um ensaio fora da suíte, com 60 processos (8 de cada vez, 40 voltas, 3% morrendo com SIGKILL dentro), não viu dois dentro.
2. **`recursos --frente` em frente de sessão viva.** `reservar` e `liberar --frente <x>` recusam a frente ativa de outra sessão viva ("peça à sessão dona …"); a passada, a órfã (dona morta), a sem dona e a da própria sessão continuam valendo. A conferência roda dentro do `gravarCampos`, sob a trava das frentes, com a frente lida ali. O `ctx` ganha `donaViva(frente)`: a sessão `frente.dona` está viva pela regra de `vida.mjs` (a do takeover e do board), com registro ilegível contando como viva e frente sem dona como não; o `ctxFalso` ganha a opção `vivas` (padrão: só a sessão do ctx). Falta pôr `donaViva` em `docs/extensoes/interface.md`.
3. **Testes que não pegavam a mutação** (`extensoes.test.mjs`). A recusa do `antesDeFechar` agora é testada numa frente com ticket: depois dela, o gh falso não registrou comentário nem edição, o ticket ficou como estava e a frente não ganhou `fechamentoComentado`. O evento da liberação é procurado entre os gravados depois do comando liberado, com `tipo`, `trava` e `extensao`. Mover a recusa para depois dos comentários e tirar `...daExtensao(r.liberada)` do `contrato.mjs` passavam nos testes antigos e derrubam os novos.
4. **Cache parcial do `deps`.** O `deps.json` ganha `parcial`: verdadeiro quando o retrato veio só de `ah deps <n>`, sem lista das abertas guardada antes (cache antigo sem o campo: parcial quando `completa` é null). `ah deps <n>` somado a uma lista inteira continua completo. Sem rede, `ah deps` sobre cache parcial mostra a lista de livres com o aviso de que ela pode ser outra e manda rodar `ah deps` com rede; o JSON traz `parcial`.
5. **Árvore com memória** (`arvore` em `deps.mjs`). A subárvore de cada issue é montada uma vez na saída inteira (todas as raízes do `ah deps`, ou a árvore do `ah deps <n>`); a repetição sai como `(…, ver acima)` no texto e com `verAcima: true` e `bloqueadaPor: []` no JSON. A issue cortada pela profundidade não conta como montada, para poder aparecer inteira depois. Num grafo de 30 issues, cada uma bloqueada por todas as anteriores, o comando não terminava em 20 s; agora leva menos de 1 s. O teste antigo da árvore mudou: sob a raiz #13, a #12 sai como "ver acima", porque a subárvore dela já saiu sob #14.
6. **Sessões distintas no `--numeros`.** `sessao-inicio` é registrado em todo começo, inclusive nas continuações (`origem: 'continuacao'`: clear, resume, compact e fork no Claude Code). "Sessões iniciadas" passa a contar ids distintos com `origem: 'novo'` (ou sem `origem`, de registro antigo); o início repetido do mesmo id conta uma vez, e "por modelo" conta essas sessões, pelo modelo do primeiro início que o traz. As continuações vão à parte (`sessoes.continuacoes`; no texto, `; continuações: N`). Escolheu-se a origem, e não só o id distinto, porque o /clear do Claude Code dá id novo a uma continuação do mesmo processo. O registro de exemplo ganhou um compact, um início repetido e um clear com id novo.

### Pendências da revisão (não corrigidas)

- O caminho `abrindo` do close (abertura desfeita) não chama `antesDeFechar` nem `depoisDeFechar`.
- `fuso` inválido na configuração derruba `ah deps` e `ah board --numeros` com "Erro inesperado" (padrão anterior em `frente.mjs`).

Na integração (13/11): `interface.md` passou a descrever `ctx.donaViva` e a opção `vivas`; `comandos.md`, o cache parcial, o "ver acima", as continuações e a recusa de `--frente` em frente de sessão viva; a trava fictícia `recursos/porta` do registro de exemplo virou `revisao/gerados`, a da extensão do guia.

## Segunda revisão da trava

Achados de uma segunda revisão do desenho da trava por pasta (`estado.mjs`, commit `2ddc142`), cada um com teste em `teste/estado.test.mjs` (o 4, também em `teste/pendentes.test.mjs`) que falhava antes do conserto. Os casos que antes giravam sem fim rodam num processo à parte, com prazo de 5 s, para uma regressão falhar o teste em vez de parar a suíte.

1. **Lixo na pasta e dono ilegível.** Um arquivo além do `dono.json` (`.dono.json.swp`, `.DS_Store`), ou um `dono.json` que não é arquivo, fazia o `rmdir` falhar com ENOTEMPTY, engolido, e a tomada girava sem fim, síncrona, ignorando o `esperaMs`. Agora o `rmdir` que não passa devolve false (vale a espera) e o laço da tomada tem voltas contadas. Decidiu-se não apagar o lixo: a pasta vencida com lixo fica presa, e a recusa por espera lista o que há nela e manda apagar a pasta (com o caminho) se nenhum `ah` estiver rodando. Apagar sozinho exigiria provar que o lixo não é de ninguém, e só um humano sabe o que é um arquivo que não foi o núcleo que pôs ali. O `dono.json` sem permissão de leitura conta como ilegível (antes, como ausente): só ENOENT é ausência.
2. **Sem hard link.** Em FAT, exFAT e alguns FUSE e SMB o `link` da devolução falhava, o dono de outro era descartado, e a pasta vazia era julgada pelo prazo de quem julgava (30 s) com o dono real (120 s) no prazo: dois dentro. A devolução regrava o texto do dono com `wx` (O_EXCL, não sobrescreve). Pasta vazia e dono ilegível vencem pelo teto `PRAZO_MAXIMO_MS` (120 s, o maior em uso: `open`, `close`, `handoff`, `takeover`, `sweep`), não pelo prazo de quem julga. `venceMs` acima do teto é recusado, e o `venceMs` gravado num dono é cortado nele.
3. **Escritor atrasado.** Quem parava entre o `mkdir` e a gravação do dono por mais que o prazo podia gravar com `wx` na pasta de outro, na janela em que o dono dele estava fora (conferido), e entrar junto. O `mkdir` guarda o inode e o dispositivo da pasta (`statSync` com `bigint`); depois do `wx`, se a pasta mudou, o dono desta chamada é recolhido (rename para fora, conferido e apagado) sem tirar a pasta, e a chamada volta a esperar. A devolução de um dono com o lugar ocupado (EEXIST) espera até 100 ms antes de descartar: cada pasta tem um único `mkdir` vencedor, e o ocupante é o escritor atrasado, que se recolhe logo. Sem inode (0; no Windows pode faltar), vale o comportamento anterior, sem essa conferência.
4. **Renovação do reenvio.** `renovarTravaDoReenvio` (`pendentes.mjs`) regravava o `dono.json` com `w` sem conferir a marca: podia renovar o dono de quem tomou a trava ou criar um dono fantasma. A renovação passou para `estado.mjs` (`renovarTrava(dir, nome, marca)` e `trava.renovar()`, que `comTrava` e `comTravaSinc` entregam a `fn` junto com a `marca`): abre com `r+` (não cria), confere a marca e regrava pelo mesmo descritor. Nada fora de `estado.mjs` grava em `travas/`.
5. **Erros inesperados.** EPERM, EACCES e EBUSY (antivírus e indexador no Windows) em `mkdir`, `rename`, `rmdir` e no `wx` são passageiros: a tomada tenta de novo dentro do `esperaMs`, e a recusa por espera mostra o último erro. O `rmdir` repete por até 50 ms, porque a pasta vazia que ficasse só venceria pelo teto. O `soltar` nunca lança (o erro do `finally` trocava o resultado de `fn`); o que não sair vence sozinho. Se o `wx` do dono falha com outro erro (ENOSPC, EMFILE), o que ele deixou (vazio ou começo do texto desta chamada) e a pasta são recolhidos antes de relançar.
6. **Espera do `soltar`.** Com o dono fora (outro conferindo), o `soltar` desistia depois de 5 tentativas de 2 ms; agora espera com recuo (1, 2, 4… até 50 ms entre tentativas) por até 1 s.
7. **Restos.** Os donos tirados por quem morreu no meio (`travas/<nome>.dono.<pid>.<ms>.<marca>`) e as pastas `travas/<nome>.vencida.*` do desenho anterior nunca eram limpos. A tomada de trava vencida apaga os que têm mais de 10 min pela hora gravada no nome; os mais novos ficam. Escolheu-se a tomada de vencida, e não o `doctor` ou o `sweep`, porque ela é rara e já é o caminho lento (a entrada e a liberação normais não pagam nada), e porque os restos nascem de processos que morreram no meio, que também deixam travas vencidas. Nomes de trava com `.dono.` ou `.vencida.` são recusados, para a limpeza nunca pegar uma trava.

Os quatro ensaios da revisão, rodados antes e depois: o do lixo girava até ser morto e agora recusa em 309 ms; o de `dono.json` como pasta, idem (207 ms); o sem link perdia o dono de X e deixava Z entrar com X dentro, e agora devolve o dono de X e Z só entra depois; o EPERM no `soltar` trocava o resultado de `fn` e agora não troca; o ENOSPC deixava um `dono.json` vazio que fechava a trava, e agora relança o ENOSPC sem deixar pasta. O ensaio do escritor atrasado simula P à mão (sem a conferência da pasta) e intercepta o `link`, que a devolução não usa mais; com o teto, a pasta vazia de P, parada há 60 s, já não é tomada. O caminho real de P está no teste do achado 3.

### Premissas do desenho

- `rename`, `mkdir`, `rmdir` e a criação exclusiva (`O_EXCL`, `wx`) são atômicos, e todos os participantes estão no mesmo sistema de arquivos.
- A data da pasta muda quando o dono sai ou entra, e é comparável com `Date.now()` de quem julga. Não vale com cache de atributos do NFS, com a data de pasta do FAT no Windows, nem com relógios diferentes entre máquinas que dividem a pasta.
- Nenhum processo para mais que o prazo nas janelas críticas: entre o `mkdir` e o `wx` (P só é pego pela conferência da pasta se voltar depois do `wx`; se parar entre o `mkdir` e o `stat` que guarda o inode, guarda o da pasta nova), entre tirar o dono e decidir, e com o dono fora.
- O relógio não salta (um salto para a frente vence travas vivas; para trás, prende travas mortas até o teto).
- Todos os participantes rodam a mesma versão (um núcleo anterior não grava `venceMs`, não confere a pasta e ainda usa `link`).
- A identidade da máquina (hostname, boot, namespace de pid) distingue contêineres que dividem a pasta; dois contêineres com o mesmo hostname e o mesmo namespace visto de dentro julgariam o pid um do outro.
- `venceMs` cobre o pior caso de `fn` (ou o intervalo entre duas renovações), e nenhum é maior que o teto.

### Risco que resta

- A exclusão vale enquanto o dono não passa do próprio prazo, como antes: passado o prazo, outra chamada toma a trava, e as duas ficam dentro até a primeira soltar (o ensaio sem link mostra W+X por isso, com e sem link).
- Uma parada maior que o teto numa janela crítica ainda pode pôr dois dentro: P parado entre o `mkdir` e o `stat`; quem devolve um dono parado mais que o teto (a devolução cai numa pasta nova, que o dono não criou); o escritor atrasado que se recolhe parado mais que 1 s depois do `wx`.
- O dono descartado (devolução que não achou lugar em 100 ms, ou que falhou) deixa a pasta vazia, que segura todos até o teto (120 s) mesmo quando o dono tinha prazo menor.
- Uma trava com lixo fica presa até um humano apagar a pasta; a recusa diz o caminho.
- Com o `ino` 0 (Windows, em alguns volumes), o escritor atrasado não é pego.
- A renovação pelo descritor pode cair num dono que outro acabou de tirar para conferir; se o dono já tinha passado do prazo antes da renovação, quem confere decide pela leitura que fez.
- Um resto com menos de 10 min só é limpo numa tomada de vencida seguinte; sem nenhuma, fica.
