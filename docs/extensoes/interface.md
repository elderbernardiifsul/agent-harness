# Interface de extensão (versão 1)

Referência da interface pela qual uma extensão acrescenta comandos, travas, verificações, reações ao ciclo de vida, linhas no resumo e colunas no quadro, sem alterar o núcleo. O passo a passo de criação está em [como-estender.md](como-estender.md); o desenho, na seção 9 de `docs/superpowers/specs/2026-11-12-nucleo-design.md`. A implementação fica em `nucleo/lib/extensoes.mjs`, e a extensão `recursos` (`nucleo/extensoes/recursos/extensao.mjs`) serve de exemplo completo.

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
};
```

Campo fora desta lista impede a carga (`campo desconhecido: …`), o que acusa erros de digitação como `reacao` no lugar de `reacoes`.

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
- `ctx.frente` é a frente em foco da sessão.
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
- `acao`: `{tipo: 'comando', comando, cwd, shell?, comandos}` ou `{tipo: 'edicao', arquivo, ferramenta?, cwd}`. Em `comandos`, os comandos simples lidos pelo núcleo (`[{argv, cwd, env}]`), ausente quando o texto não pôde ser lido.
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
| `depoisDeFechar` | Fim do `ah close`, com a frente já fora do estado | `ctx.soLocal` diz se foi fechamento só local; `gravarCampos` não se aplica |
| `aoPassar` | Fim do `ah handoff`, com a frente já passada | |
| `noSweep` | `ah sweep` | Devolve as linhas a mostrar (texto ou lista); `ctx.reparar` diz se o comando roda com `--reparar` e só então a extensão conserta |

- Recusa de `antesDeFechar`: `Recusado: a extensão <nome> não deixa fechar a frente <id> <nome da frente>: <motivo>` e `Faça: <saida>`; o close para sem mudar nada.
- Nas outras reações, um erro vira `Aviso: extensão <nome> falhou em <reação>: <erro>` e não desfaz o que o núcleo já fez.
- No `ah sweep`, as linhas saem como `- <extensão>: <linha>`; no `--json`, em `extensoes: {<extensão>: [linhas]}`.

## Resumo e quadro

- `resumo(ctx)` devolve texto ou lista; valem as duas primeiras linhas, cada uma cortada em 200 caracteres, somadas antes da cauda do resumo do começo de sessão. Se o resumo passaria de 1200 caracteres, saem primeiro as outras frentes e depois as linhas das extensões, das últimas para as primeiras. `ctx.frente` é a frente da sessão. Erro: a extensão fica de fora e o resumo leva o aviso `Extensão <nome> falhou no resumo (ah doctor).`
- `colunas: [{titulo, valor(frente, ctx)}]` acrescenta colunas ao `ah board`, à direita, com o valor cortado em 30 caracteres (`—` quando vazio, `!` quando a função lança). No `ah board --json`, cada frente ganha `colunas: {<extensão>: {<titulo>: valor}}`.

## Auxiliares de teste

`nucleo/lib/extensoes-teste.mjs` (na cópia instalada, `.harness/nucleo/lib/extensoes-teste.mjs`):

| Função | Uso |
|---|---|
| `carregarParaTeste(arquivo, config)` | Carrega o `extensao.mjs` e confere forma e configuração como o núcleo; lança com o motivo da recusa |
| `ctxFalso({extensao, config, frente, frentes, ...})` | Contexto sem disco; guarda em `saida`, `avisos`, `gravados` e `chamadas` o que a extensão fez |
| `projetoDeTeste({extensoes, pastas, config})` | Projeto git descartável com o núcleo, as pastas de extensão copiadas e ligadas, estado e gh próprios; `ah(args)`, `gancho(acao)`, `frente(nome)`, `git(args)`, `limpar()` |

## Eventos

| Evento | Campos acrescentados |
|---|---|
| `recusa` | `extensao` quando a trava é de extensão |
| `liberacao` | `extensao` quando a trava liberada é de extensão |
| `recusa-de-comando` | `comando` é o nome do comando de extensão |
