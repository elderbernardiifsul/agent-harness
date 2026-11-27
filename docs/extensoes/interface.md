# Interface de extensão (versão 1)

Referência da interface pela qual uma extensão acrescenta comandos, travas, verificações, reações ao ciclo de vida, linhas no resumo, colunas no quadro e os itens ignorados de que cuida no `close`, sem alterar o núcleo. O passo a passo de criação está em [como-estender.md](como-estender.md); o desenho, na seção 9 de `docs/superpowers/specs/2026-11-12-nucleo-design.md`. A implementação fica em `nucleo/lib/extensoes.mjs`, e a extensão `recursos` (`nucleo/extensoes/recursos/extensao.mjs`) serve de exemplo completo.

## Localização e ligação

Uma extensão é uma pasta `<nome>/` com o arquivo `extensao.mjs`. O nome casa com `^[a-z][a-z0-9-]*$`; pasta com outro nome é ignorada.

| Origem | Pasta | Observação |
|---|---|---|
| Harness | `.harness/nucleo/extensoes/<nome>/` (no clone, `nucleo/extensoes/<nome>/`) | Acompanha o núcleo; o `ah atualizar` a substitui |
| Projeto | `.harness/extensoes/<nome>/` | Do projeto; o `ah init` e o `ah atualizar` não a tocam |

A extensão só carrega quando a chave dela existe em `extensoes`, no `.harness/config.json`:

```json
{
  "extensoes": {
    "recursos": { "tipos": ["porta", "banco"] },
    "revisao": true,
    "antiga": false
  }
}
```

- `true`: ligada, com configuração vazia (`{}`).
- Objeto: ligada, com esse objeto como configuração.
- `false`: desligada (equivale à ausência da chave).

Com o mesmo nome nas duas origens, vale a do projeto, e o `ah doctor` emite o aviso de sombra.

## Forma do `export default`

```js
export default {
  versaoDaInterface: 1,          // obrigatório; outra versão não carrega
  descricao: 'texto curto',      // obrigatório
  validarConfig(config) {},      // opcional: null aceita; texto recusa com o motivo
  comandos: {},                  // opcional: {nome: {descricao, uso, requisitos, executar(args, ctx)}}
  travas: [],                    // opcional: [{id, avaliar(acao, ctx)}]
  verificacoes: [],              // opcional: [{item, conferir(ctx)}]
  reacoes: {},                   // opcional: {depoisDeAbrir, antesDeFechar, depoisDeFechar, aoPassar, noSweep}
  resumo(ctx) {},                // opcional: até duas linhas para o começo de sessão
  colunas: [],                   // opcional: [{titulo, valor(frente, ctx)}]
  ignorados(ctx) {},             // opcional: [{caminho, descartavel: true} | {caminho, guardar: '<comando>'}]
};
```

Campo fora desta lista impede a carga (`campo desconhecido: …`), o que acusa erros de digitação como `reacao` no lugar de `reacoes`. A restrição vale só para o objeto do `export default`: o módulo pode ter outros exports (funções auxiliares exportadas para o teste, por exemplo), que o núcleo ignora, porque a carga lê apenas `modulo.default`.

## Carga

- O núcleo declara `VERSAO_DA_INTERFACE = 1` (`nucleo/lib/extensoes.mjs`).
- A carga é tolerante: arquivo ausente, erro de sintaxe, forma inválida, versão diferente, configuração recusada por `validarConfig` ou comando com nome já usado (por um comando do núcleo ou de outra extensão, em ordem de nome) deixam a extensão de fora. Os comandos do núcleo seguem; o `ah doctor` mostra a falha com o motivo e o conserto; os comandos que usam extensões emitem `Aviso: a extensão <nome> não carregou (<motivo>); rode ah doctor.` uma vez por processo; o gancho segue apenas com as travas do núcleo.
- A carga ocorre uma vez por processo, com cache.

## Contexto (`ctx`)

Toda função da extensão recebe o mesmo formato de contexto:

| Campo | Conteúdo |
|---|---|
| `extensao` | Nome da extensão |
| `config` | A seção da extensão na configuração (`{}` quando a chave vale `true`), só de leitura |
| `configDoProjeto` | A configuração inteira do projeto, com os padrões aplicados, só de leitura |
| `raiz`, `cwd`, `env` | Checkout principal, pasta da chamada e ambiente |
| `dirEstado` | Pasta de estado do projeto nesta máquina |
| `sessaoId` | Id da sessão que chamou (ou `null`) |
| `escrever(texto)`, `avisar(texto)` | Saída padrão e saída de erro do comando; nas travas e no resumo, não mostram nada |
| `frente` | A frente da chamada, cópia só de leitura (ver cada ponto de chamada), ou `null` |
| `frentes()` | Todas as frentes do estado, cópias só de leitura |
| `gravarCampos(nome, campos)` | Grava em `frente.extensoes[<extensão>]` da frente `nome`; ver abaixo |
| `git(args, opcoes)`, `gh(args, opcoes)` | Os auxiliares do núcleo, na raiz do projeto; devolvem `{codigo, saida, erro}` e não lançam |
| `ErroDeUso` | Classe para recusar dentro de um comando |
| `donaViva(frente)` | `true` quando a sessão `frente.dona` está viva, pela mesma regra do `board` e do `takeover` (processo e sinal de vida); registro de sessão ilegível conta como viva; frente sem dona conta como `false` |
| `sessao(id)` | O registro da sessão `id` (`<estado>/sessoes/<id>.json`: `agente`, `modelo`, `papel`, `frente`, `inicio`…), cópia só de leitura, ou `null` sem id, sem estado, sem arquivo ou com o arquivo ilegível; nunca lança. A coluna `MODELO` da extensão `modelo` usa `ctx.sessao(frente.dona)?.modelo`. Acréscimo compatível de 26/11/2026 (P2 do desenho do método); a interface continua na versão 1 |

### Registro da frente

`ctx.frente` e cada item de `ctx.frentes()` trazem o registro gravado em `<estado>/frentes/<nome>.json`, congelado (`Object.freeze` em profundidade): uma atribuição a ele não tem efeito no estado, e a escrita da extensão passa por `gravarCampos`. O registro é criado por `novaFrente` (`nucleo/lib/frente.mjs`) no `ah open` e alterado pelo `open` (reserva, retomada), `nota`, `handoff`, `takeover`, `sweep --reparar` e pela herança na continuação de sessão.

| Campo | Tipo e formato | Versão 1 |
|---|---|---|
| `esquema` | número; `2` nesta versão do harness (o registro do esquema 1 é migrado na leitura) | estável |
| `id` | texto `<sigla>-<n>`, como `as-1`; não muda durante a vida da frente | estável |
| `nome` | texto, `^[a-z0-9][a-z0-9-]{1,48}$`; também é o nome do arquivo do registro | estável |
| `ramo` | texto, `git.prefixo` + `nome` (`feat/carrinho` com o prefixo padrão) | estável |
| `worktree` | caminho absoluto da pasta do worktree nesta máquina | estável |
| `tickets` | lista de números das issues (`[1, 2]`; `[]` sem ticket) | estável |
| `plano` | texto (caminho dado em `--plano`) ou `null` | estável |
| `caminhos` | lista de textos (dados em `--caminhos`); `[]` quando não informados | estável |
| `dona` | id da sessão dona (texto) ou `null` na frente passada | estável |
| `abertaPor` | login do GitHub de quem abriu (o `login` de `<estado>/maquina.json`) | estável |
| `abertaEm` | data e hora local com fuso, `AAAA-MM-DDTHH:MM:SS±HH:MM`, no fuso de `fuso` da configuração (`2026-11-13T12:43:33-03:00`); `Date.parse` a lê. Pode ser `null` na frente vinda de outra máquina por passagem sem esse dado | estável |
| `estado` | `'ativa'`, `'passada'` (sem dona, à espera de `ah open`) ou `'abrindo'` (um `ah open` em curso ou interrompido) | estável |
| `notas` | lista de `{em, sessao, texto}`, com `em` em UTC (`toISOString`) | estável |
| `reserva` | `{logins, tickets}` (logins e tickets reservados no GitHub) ou `null` | estável |
| `extensoes` | objeto `{<extensão>: {…}}`, ausente até a primeira gravação de alguma extensão; a seção de cada extensão tem os campos que ela gravou com `gravarCampos` | estável |

Campos opcionais, gravados pelo núcleo conforme o ciclo e sem garantia de forma na versão 1 (podem mudar sem nova versão da interface): `retomadaEm`, `passadaEm`, `passadaPor`, `passadaDe`, `sessoesAnteriores`, `tomadaEm`, `tomadaDe`, `atribuidaPor`, `reconstruida` e `processo` (só no estado `abrindo`).

`abertaEm` não muda na retomada nem na tomada: `retomarSobTrava` (`nucleo/comandos/open.mjs`) copia o registro e acrescenta `retomadaEm`, em UTC (`toISOString`), e o `ah takeover` acrescenta `tomadaEm`. A idade de uma frente medida por `abertaEm` conta, portanto, desde a primeira abertura, inclusive o tempo em que ela ficou passada.

### Gravação

`gravarCampos(nome, campos)`:

- grava sob a trava das frentes e devolve a seção como ficou;
- `campos` é um objeto; um campo com `undefined` é apagado; os demais são mesclados à seção existente e precisam ser serializáveis em JSON;
- `campos` também pode ser uma função `(secaoAtual, {frentes}) => campos`, chamada sob a trava: o que ela confere não muda até a gravação, e, se ela lança, nada é gravado (a extensão `recursos` usa essa forma para recusar um valor de outra frente);
- frente inexistente lança `ErroDeUso` com o próximo passo.

A extensão não escreve fora de `frente.extensoes[<extensão>]` pelo `ctx`. Essa restrição organiza responsabilidades e não isola: a extensão é código do projeto e roda com os mesmos poderes do `ah` (acesso ao disco, à rede e aos processos).

## Comandos

```js
comandos: {
  revisao: {
    descricao: 'mostra, pede ou dá por feita a revisão da frente',   // obrigatório; aparece na ajuda
    uso: 'ah revisao [pedir|feita]',                                 // opcional; padrão: ah <nome>
    requisitos: { sessao: false },                                   // opcional; padrão: {config: true, sessao: true, repositorio: true}
    async executar(args, ctx) { return 0; },                         // obrigatório; devolve o código (padrão 0)
  },
},
```

- Cada entrada vira `ah <nome>`, com os mesmos requisitos e a mesma ajuda (`ah <nome> --help`) dos comandos do núcleo. A ajuda geral (`ah --help`) lista os comandos de extensões na seção "Comandos de extensões", com o nome da extensão.
- `ctx.frente` é a frente em foco da sessão que chamou (o campo `frente` do registro da sessão), ou `null` quando a sessão não tem frente.
- Os argumentos chegam em `executar(args, ctx)`, sem o nome do comando (`ah idade --x` entrega `['--x']`). O despacho trata `--help` e `-h` antes de chamar `executar`.

### Sessão e as duas recusas sem frente

A sessão vem de `AH_SESSAO` ou, na falta dela, de `CLAUDE_CODE_SESSION_ID` (`idDaSessao`, `nucleo/lib/sessao.mjs`). Dentro de um agente Claude Code, a segunda variável já está definida, de modo que um `tools/ah <comando>` executado pelo agente usa a sessão real dele; num terminal comum, a sessão é informada à mão: `AH_SESSAO=ana-terminal tools/ah idade`.

Há duas recusas distintas para "sem frente":

| Situação | Quem recusa | Saída |
|---|---|---|
| Sem sessão (nenhuma das duas variáveis) e `requisitos.sessao` verdadeiro, o padrão | o núcleo, antes de chamar `executar` | `Recusado: não sei qual é a sessão` / `Faça: defina AH_SESSAO ou ligue o adaptador do agente` |
| Com sessão, mas sem frente em foco | o código da extensão, que confere `ctx.frente` | a recusa que a extensão escrever, por exemplo `Recusado: Esta sessão não tem frente.` / `Faça: abra uma com ah open <nome>` |

Com `requisitos: {sessao: false}`, o comando roda sem sessão (`ctx.sessaoId` e `ctx.frente` valem `null`); a extensão `recursos` usa essa forma para `listar` e recusa ela mesma as ações que gravam.
- Recusa: `throw new ctx.ErroDeUso('<motivo>\nPróximo passo: <o que fazer>')`. A saída é `Recusado: <motivo>` e `Faça: <o que fazer>`, código 1, e o evento `recusa-de-comando` é registrado.
- Outro erro lançado vira `Recusado: a extensão <nome> falhou no comando <comando>: <erro>`, com a saída "corrija a extensão ou desligue-a em .harness/config.json".

## Travas

```js
travas: [{
  id: 'gerados',                 // minúsculas, números e hífen
  avaliar(acao, ctx) { return null; },
}],
```

- Avaliadas antes de cada ferramenta do agente, depois das travas do núcleo (T0 a T6), para comando de shell e para edição de arquivo. Se uma trava do núcleo recusa, as de extensão não são avaliadas.
- `acao`: `{tipo: 'comando', comando, cwd, shell?, comandos}` ou `{tipo: 'edicao', arquivo, ferramenta?, cwd}`. Uma edição de vários arquivos (patch) chega à trava como várias edições, uma por arquivo, sempre com `arquivo`. Em `comandos`, os comandos simples lidos pelo núcleo (`[{argv, cwd, env}]`), ausente quando o texto não pôde ser lido.
- `avaliar` é **síncrona** e devolve `null` (passa) ou `{motivo, saida}` (recusa). A recusa sai como `Recusado (<extensão>/<id>): <motivo>` e `Faça: <saida>`, e o evento `recusa` leva `trava: '<extensão>/<id>'` e `extensao: '<extensão>'`.
- `AH_GUARD=off` libera a trava de extensão num comando de shell quando todo comando simples da linha, fora o `cd`, traz a variável (`AH_GUARD=off <comando>`); registra o evento `liberacao`. Na edição de arquivo não há liberação.
- Trava que lança erro ou devolve uma promessa recusa: `a trava falhou: <erro>`, com a saída "corrija a extensão ou desligue-a em .harness/config.json".
- `ctx.frente` é a frente em foco da sessão do evento.

## Verificações do `doctor`

```js
verificacoes: [{ item: 'Recursos sem conflito', conferir(ctx) { return { estado: 'ok' }; } }],
```

- `conferir` devolve `{estado: 'ok'|'aviso'|'falha', detalhe?, conserto?}` e pode ser assíncrona. A linha do `doctor` é `<item> (<extensão>)`, seguida de `: <detalhe>; <conserto>` no aviso e na falha.
- Erro lançado ou formato inválido vira falha do item.
- As verificações entram depois dos itens do núcleo. Antes delas, o item "Extensões" lista cada extensão ligada: `ok Extensão <nome> (projeto|harness)`, aviso de sombra, ou `FALHOU Extensão <nome>: <motivo>; <conserto>`. Sem extensão ligada: `ok Extensões (nenhuma ligada)`.

## Reações ao ciclo de vida

Cada reação é `async (ctx)`. Em todas, `ctx.frente` é a frente do comando.

| Reação | Quando | Particularidades |
|---|---|---|
| `depoisDeAbrir` | Fim do `ah open` (frente nova ou retomada) | `ctx.retomada` diz se foi retomada |
| `antesDeFechar` | No `ah close`, depois das conferências de perda de trabalho e antes de qualquer mudança (tickets, worktree, ramo, histórico, estado) | Única que recusa: devolve `{recusa: motivo, saida}`. Erro lançado também recusa (`a extensão <nome> falhou em antesDeFechar: …`) |
| `depoisDeFechar` | Fim do `ah close`, com a frente já fora do estado | `ctx.soLocal` diz se foi fechamento só local; `ctx.aberturaDesfeita`, se o close desfez uma abertura parada (registro `abrindo`), caminho em que `antesDeFechar` também roda e pode recusar; `gravarCampos` não se aplica |
| `aoPassar` | Fim do `ah handoff`, com a frente já passada | |
| `noSweep` | `ah sweep` | Devolve as linhas a mostrar (texto ou lista); `ctx.reparar` diz se o comando roda com `--reparar` e só então a extensão conserta |

- Recusa de `antesDeFechar`: `Recusado: a extensão <nome> não deixa fechar a frente <id> <nome da frente>: <motivo>` e `Faça: <saida>`; o close para sem mudar nada.
- Nas outras reações, um erro vira `Aviso: extensão <nome> falhou em <reação>: <erro>` e não desfaz o que o núcleo já fez.
- No `ah sweep`, as linhas saem como `- <extensão>: <linha>`; no `--json`, em `extensoes: {<extensão>: [linhas]}`.

## Ignorados de que a extensão cuida

O `ah close` recusa worktree com item ignorado pelo git, porque o git não guarda esses arquivos e remover o worktree os apagaria. Alguns desses itens são de uma extensão, e ela sabe o que fazer com eles: o arquivo de ambiente da frente pode ser refeito a partir do estado; o diário da execução por subagentes precisa ir para o ticket antes. Para isso, a extensão declara os dela:

```js
ignorados(ctx) {
  return [
    { caminho: '.env.frente', descartavel: true },
    { caminho: '.superpowers/sdd/', guardar: `tools/ah registros guardar --frente ${ctx.frente.nome}` },
  ];
},
```

- `ignorados(ctx)` é chamada pelo `close`, na primeira fase, com `ctx.frente` definida; pode ser assíncrona. Ela roda sob a trava das frentes, que segura as outras sessões: deve ser rápida e sem rede (ler o estado ou o disco, não o GitHub). Não roda com `--descartar-ignorados`.
- `caminho` é relativo à raiz do worktree, com `/` como separador em qualquer sistema: um arquivo, ou uma pasta terminada em `/` (que cobre tudo dentro dela). Caminho absoluto, com `..`, com `\` ou vazio é inválido.
- Uma pasta declarada descartável é apagada inteira com o worktree, sem perguntar, inclusive o que outra pessoa ou ferramenta pôs nela. Declare como descartável só a pasta que a extensão possui inteira; na dúvida, declare os arquivos um a um. O mesmo cuidado vale para quem roda o comando de `guardar`: ele não deve apagar o que não guardou.
- Cada item tem um dos dois campos: `descartavel: true` (não conta como perda; sai com o `git worktree remove`) ou `guardar: '<comando>'` (recusa numa linha própria, com esse comando como próximo passo). O `close` só aponta o comando; nunca o roda.
- Um item ignorado casa com um declarado quando é o caminho dele ou fica dentro dele. Coberto por um descartável e por um `guardar`, vale o `guardar`. Pasta-mãe de um declarado (o git lista `.superpowers/` junto com `.superpowers/sdd/`) casa só quando os itens listados dentro dela casam todos; com outro ignorado dentro (`.superpowers/x.log`), ela fica na linha de sempre. Quando o projeto ignora a pasta-mãe inteira (`.superpowers/` no `.gitignore`), o git a lista sozinha, sem nada dentro; o `close` então a lista de novo item a item (`git ls-files -o -i --exclude-standard -- <pasta>`) e separa esses itens pela mesma regra.
- A função que lança, a promessa que rejeita, a lista inválida e o item inválido viram o aviso `Aviso: a extensão <nome> falhou em ignorados: <motivo>; …`, e os itens afetados seguem a conferência de sempre (a recusa que sugere `--descartar-ignorados`).
- Acréscimo compatível de 26/11/2026 (P5 do desenho do método): a interface continua na versão 1, e a extensão sem o campo não muda nada.

## Resumo e quadro

- `resumo(ctx)` devolve texto ou lista; valem as duas primeiras linhas, cada uma cortada em 200 caracteres, somadas antes da cauda do resumo do começo de sessão. Se o resumo passaria de 1200 caracteres, saem primeiro as outras frentes e depois as linhas das extensões, das últimas para as primeiras. `ctx.frente` é a frente da sessão. Erro: a extensão fica de fora e o resumo leva o aviso `Extensão <nome> falhou no resumo (ah doctor).`
- `colunas: [{titulo, valor(frente, ctx)}]` acrescenta colunas ao `ah board`, à direita, com o valor cortado em 30 caracteres (`—` quando vazio, `!` quando a função lança). No `ah board --json`, cada frente ganha `colunas: {<extensão>: {<titulo>: valor}}`.

## Auxiliares de teste

`nucleo/lib/extensoes-teste.mjs` (na cópia instalada, `.harness/nucleo/lib/extensoes-teste.mjs`):

| Função | Uso |
|---|---|
| `carregarParaTeste(arquivo, config)` | Carrega o `extensao.mjs` e confere forma e configuração como o núcleo; lança com o motivo da recusa |
| `ctxFalso({extensao, config, frente, frentes, ...})` | Contexto sem disco, para chamar diretamente uma função da extensão (`executar` de um comando, `avaliar` de uma trava, uma reação, `conferir`, `resumo`, `valor` de coluna, `ignorados`) |
| `projetoDeTeste({extensoes, pastas, config})` | Projeto git descartável com o núcleo, as pastas de extensão copiadas e ligadas, estado e gh próprios; `ah(args)`, `gancho(acao)`, `frente(nome)`, `git(args)`, `limpar()` |

`ctxFalso` tem a forma do `ctx` do núcleo, com estes detalhes:

- `frente` (o registro de partida, montado à mão; basta trazer os campos que a função lê) e `frentes` formam o estado em memória; `ctx.frente` sai congelado, como no núcleo.
- `saida` e `avisos` são listas com cada texto passado a `escrever` e `avisar`, na ordem (`['Frente as-1 carrinho: aberta há 2 h 13 min\n']`); `gravados` lista cada `gravarCampos` como `{frente, secao}`; `chamadas` lista cada `git`/`gh` como `{programa, args, opcoes}`, que respondem `{codigo: 0, saida: '', erro: ''}` salvo funções `git`/`gh` dadas.
- `ErroDeUso` é a mesma classe do núcleo: `assert.rejects(() => cmd.executar([], ctx), ctx.ErroDeUso)` confere uma recusa.
- `sessao(id)` responde pela opção `sessoes`, um objeto `{<id>: registro}`; id fora dele dá `null`: `ctxFalso({sessoes: {'sessao-b-0002': {id: 'sessao-b-0002', modelo: 'modelo-leve'}}})`.
- `donaViva(frente)` responde pela opção `vivas`, lista dos ids de sessão dados como vivos; o padrão é `[sessaoId]`: `ctxFalso({frente, vivas: ['sessao-b-0002']})`.
- `sessaoId` vale `sessao-teste-0001` por padrão; `env` é `{}`; `dirEstado` é `null`; outros campos (`retomada`, `reparar`, `soLocal`) entram pelo resto do objeto: `ctxFalso({frente, retomada: true})`.

`projetoDeTeste` não usa o estado da máquina: `AH_ESTADO`, `AH_WORKTREES` e `AH_GH` (um `gh` falso que responde o login `ana-souza`) apontam para uma pasta temporária, e `CLAUDE_CODE_SESSION_ID` é removida do ambiente. `p.ah(args)` roda com `AH_SESSAO=sessao-teste-0001`; outra sessão entra por `p.ah(args, {env: {AH_SESSAO: 'sessao-b-0002'}})`. A sigla da máquina é `as`, de modo que a primeira frente aberta é `as-1`. `p.ah` devolve `{codigo, saida, erro}`.

## Eventos

| Evento | Campos acrescentados |
|---|---|
| `recusa` | `extensao` quando a trava é de extensão |
| `liberacao` | `extensao` quando a trava liberada é de extensão |
| `recusa-de-comando` | `comando` é o nome do comando de extensão |
