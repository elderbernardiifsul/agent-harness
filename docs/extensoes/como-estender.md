# Extensão do harness: guia de criação

Passo a passo, executado na raiz de um projeto que já tem o harness instalado (a seção 1 descreve também a montagem de um projeto descartável para ensaio), para criar do zero a extensão `revisao` em `.harness/extensoes/revisao/`. Ela acrescenta três coisas, cada uma com teste:

1. um **comando**, `tools/ah revisao [pedir|feita]`, que guarda na frente se a revisão foi pedida e feita;
2. uma **trava**, `revisao/gerados`, que recusa a edição de arquivo dentro de uma pasta gerada pelo build (`dist`, por padrão);
3. uma **reação ao fechamento**, que recusa o `tools/ah close` de uma frente com revisão pedida e ainda não feita.

A referência completa da interface está em [interface.md](interface.md). A extensão `recursos`, que acompanha o harness (`.harness/nucleo/extensoes/recursos/extensao.mjs`), é outro exemplo completo.

## 1. Pré-requisitos

- Node 22 ou mais novo (`node --version`).
- Harness 0.2.0 ou mais novo instalado no projeto: o arquivo `.harness/nucleo/lib/extensoes-teste.mjs` existe. Sem ele, atualizar com `tools/ah atualizar --de <clone do agent-harness>`.
- `tools/ah doctor` sem falha. A saída tem a linha `ok      Extensões (nenhuma ligada)` enquanto nenhuma extensão estiver ligada.
- Comandos executados no checkout principal do projeto (a pasta que contém `.harness/`).

### Projeto descartável para ensaio

Para ensaiar uma extensão sem tocar num projeto real nem no estado da máquina, monta-se um repositório numa pasta temporária (`<tmp>`), com o estado, os worktrees e a fila de pesado também em `<tmp>`. As variáveis estão descritas em `docs/referencia/comandos.md`, seção "Variáveis de ambiente":

| Variável | Efeito no ensaio |
|---|---|
| `AH_ESTADO` | pasta do estado local (frentes, sessões, eventos, `maquina.json`); sem ela, o estado vai para a pasta padrão da máquina (no Linux, `~/.local/state/agent-harness/`) |
| `AH_WORKTREES` | pasta dos worktrees das frentes, quando `worktrees.dir` da configuração é `null` (o padrão; a configuração tem precedência); sem ela, vale o padrão da máquina (no Linux, `~/.cache/agent-harness/<projeto>/wt`) |
| `AH_FILA` | pasta da fila de trabalho pesado, comum a todos os projetos da máquina; sem ela, fica em `_fila` na base do estado (com `AH_ESTADO`, dentro dessa pasta) |
| `AH_GH` | caminho do `gh`; um arquivo `.mjs` é executado com o Node. Sem ela, vale o `gh` real: o `init` grava em `maquina.json` o login da conta autenticada, e o `open --tickets` comenta nas issues do repositório remoto |

Comandos de preparo, com o clone do agent-harness em `<clone>`:

```sh
export AH_ESTADO=<tmp>/estado AH_WORKTREES=<tmp>/wt AH_FILA=<tmp>/fila
git init -b main <tmp>/loja
cd <tmp>/loja
git config user.name ana-souza
git config user.email ana@exemplo.test
git commit --allow-empty -m "começo"
node <clone>/nucleo/bin/ah.mjs init --sigla as --sem-protecao
git switch dev
git add -- .harness tools/ah tools/ah.cmd AGENTS.md docs/agents .claude/settings.json .github/workflows/ah-ci.yml
git commit -m "chore: instala o agent-harness"
tools/ah doctor
```

- O `init` recusa repositório sem commit; o commit vazio atende.
- `--sigla` é necessária quando o `gh` não propõe sigla (sem `gh`, sem login ou com `AH_GH` apontando para um `gh` que não responde o login). `--sem-protecao` omite a consulta à proteção de ramo no servidor, que não existe num repositório sem remoto.
- O `init` cria os ramos `dev` e `stage` e não faz commit; o commit do harness vai para a `dev`, de onde as frentes partem. A lista exata do `git add` é a que o `init` imprime.
- A identidade do git (`user.name`, `user.email`) é necessária para os commits; no repositório descartável, ela fica na configuração local.
- O `doctor` de um repositório sem remoto termina com avisos (proteção de ramo, CI) e sem falha. O `open` funciona sem remoto quando a frente não tem ticket.

As variáveis valem para todo comando do ensaio: um `tools/ah` executado em outro terminal, sem elas, lê e grava o estado padrão da máquina.

## 2. Pasta, arquivo mínimo e ligação

Criar a pasta:

```sh
mkdir -p .harness/extensoes/revisao
```

Criar `.harness/extensoes/revisao/extensao.mjs` com o mínimo que o núcleo aceita:

```js
export default {
  versaoDaInterface: 1,
  descricao: 'revisão por frente e proteção dos arquivos gerados',
};
```

Ligar a extensão em `.harness/config.json`, acrescentando a chave ao objeto `extensoes` (que já existe, vazio, num projeto recém-preparado):

```json
"extensoes": { "revisao": true }
```

Conferir:

```sh
tools/ah doctor
```

Saída esperada, entre as demais linhas: `ok      Extensão revisao (projeto)`. Se aparecer `FALHOU  Extensão revisao: …`, o texto depois dos dois-pontos diz o motivo e o conserto.

## 3. Comando

Acrescentar ao objeto do `export default` a chave `comandos`:

```js
  comandos: {
    revisao: {
      descricao: 'mostra, pede ou dá por feita a revisão da frente',
      uso: 'ah revisao [pedir|feita]',
      async executar([acao], ctx) {
        if (!ctx.frente) throw new ctx.ErroDeUso('Esta sessão não tem frente.\nPróximo passo: abra uma com ah open <nome>');
        if (acao === undefined) {
          ctx.escrever(`Revisão de ${ctx.frente.nome}: ${ctx.frente.extensoes?.revisao?.estado ?? 'não pedida'}\n`);
          return 0;
        }
        if (acao !== 'pedir' && acao !== 'feita') {
          throw new ctx.ErroDeUso(`Ação desconhecida: ${acao}\nPróximo passo: use ah revisao [pedir|feita]`);
        }
        const estado = acao === 'pedir' ? 'pedida' : 'feita';
        await ctx.gravarCampos(ctx.frente.nome, { estado });
        ctx.escrever(`Revisão de ${ctx.frente.nome}: ${estado}\n`);
        return 0;
      },
    },
  },
```

Pontos da interface usados:

- `ctx.frente` é a frente em foco da sessão que chamou o comando, só de leitura.
- `ctx.gravarCampos(nome, campos)` grava em `frente.extensoes.revisao`, sob a trava das frentes; a extensão não escreve fora desse campo.
- Toda recusa é `new ctx.ErroDeUso('<motivo>\nPróximo passo: <o que fazer>')`: o harness mostra `Recusado: <motivo>` e `Faça: <o que fazer>`.

Conferir:

```sh
tools/ah --help
```

A saída traz a seção `Comandos de extensões:`, com a linha `revisao  mostra, pede ou dá por feita a revisão da frente (extensão revisao)` (o espaçamento acompanha o comando mais longo).

Chamada com uma sessão. O comando exige sessão (`requisitos.sessao` vale `true` por padrão), e a sessão precisa ter frente:

```sh
AH_SESSAO=ana-terminal tools/ah open carrinho
AH_SESSAO=ana-terminal tools/ah revisao pedir
```

- Num terminal comum, a sessão é informada em `AH_SESSAO`, com um nome qualquer, o mesmo do `open`.
- Dentro de um agente Claude Code, o `ah` lê `CLAUDE_CODE_SESSION_ID` quando `AH_SESSAO` não está definida (`nucleo/lib/sessao.mjs`). Um `tools/ah revisao` executado pelo agente usa, portanto, a sessão real dele, que fica registrada no estado (o de `AH_ESTADO`, no ensaio).
- Sem nenhuma das duas variáveis, o núcleo recusa antes de chamar a extensão: `Recusado: não sei qual é a sessão`. Com sessão e sem frente, quem recusa é o código da extensão: `Recusado: Esta sessão não tem frente.` (o `if (!ctx.frente)` acima). As duas recusas são distintas; a tabela está em [interface.md](interface.md), "Sessão e as duas recusas sem frente".
- Os campos do registro da frente que `ctx.frente` traz (`id`, `nome`, `abertaEm`, `tickets`, …), com tipo e formato, estão em [interface.md](interface.md), "Registro da frente".

Teste do comando, em `.harness/extensoes/revisao/extensao.test.mjs` (o arquivo completo, com os três testes, está na seção 6):

```js
test('comando: ah revisao pede e dá por feita a revisão da frente', t => {
  const p = novoProjeto(t);
  assert.equal(p.ah(['open', 'carrinho']).codigo, 0);
  const r = p.ah(['revisao', 'pedir']);
  assert.equal(r.codigo, 0, r.erro);
  assert.equal(r.saida, 'Revisão de carrinho: pedida\n');
  assert.deepEqual(p.frente('carrinho').extensoes.revisao, { estado: 'pedida' });
  const errado = p.ah(['revisao', 'talvez']);
  assert.equal(errado.codigo, 1);
  assert.match(errado.erro, /^Recusado: Ação desconhecida: talvez\nFaça: use ah revisao \[pedir\|feita\]/);
});
```

`novoProjeto(t)` cria, com `projetoDeTeste` de `.harness/nucleo/lib/extensoes-teste.mjs`, um projeto git descartável com uma cópia do núcleo, esta extensão copiada e ligada, estado e gh próprios; `p.ah(args)` roda o `ah` desse projeto e `p.frente(nome)` lê o registro da frente. Nada toca o estado real da máquina.

- `p.ah` usa a sessão `sessao-teste-0001` (`AH_SESSAO`), e `projetoDeTeste` remove `CLAUDE_CODE_SESSION_ID` do ambiente, de modo que o teste não depende do agente que o executa. Outra sessão: `p.ah(['revisao'], {env: {AH_SESSAO: 'sessao-b-0002'}})`, útil para testar a recusa "sem frente".
- A sigla da máquina no projeto de teste é `as`: a primeira frente aberta é `as-1`.

O comando também pode ser testado sem projeto, chamando `executar` com `ctxFalso` e uma frente montada à mão (só os campos que o comando lê):

```js
const def = await carregarParaTeste(path.join(PASTA, 'extensao.mjs'));
const ctx = ctxFalso({ extensao: 'revisao', frente: { id: 'as-1', nome: 'carrinho' } });
assert.equal(await def.comandos.revisao.executar([], ctx), 0);
assert.deepEqual(ctx.saida, ['Revisão de carrinho: não pedida\n']);
await assert.rejects(() => def.comandos.revisao.executar(['talvez'], ctx), ctx.ErroDeUso);
```

`ctx.saida` é a lista dos textos passados a `ctx.escrever`, na ordem; `ctx.gravados`, a lista dos `gravarCampos` (`{frente, secao}`); `ctx.ErroDeUso`, a mesma classe do núcleo. O teste com `ctxFalso` não lança processo e roda em milissegundos; o teste com `projetoDeTeste` confere o despacho, a ajuda e a gravação no estado.

## 4. Trava

Acrescentar ao objeto do `export default` a chave `travas`:

```js
  travas: [{
    id: 'gerados',
    avaliar(acao, ctx) {
      if (acao.tipo !== 'edicao') return null;
      const pastas = ctx.config.gerados ?? ['dist'];
      const partes = acao.arquivo.split(/[\\/]/);
      const pasta = pastas.find(p => partes.includes(p));
      if (!pasta) return null;
      return { motivo: `${acao.arquivo} fica na pasta ${pasta}, gerada pelo build`, saida: 'edite a fonte e rode o build de novo' };
    },
  }],
```

E a validação da configuração opcional (`"revisao": {"gerados": ["dist", "build"]}`):

```js
  validarConfig(config) {
    if ('gerados' in config && !(Array.isArray(config.gerados) && config.gerados.every(p => typeof p === 'string' && p !== ''))) {
      return 'gerados deve ser uma lista de nomes de pasta, como ["dist"]';
    }
    return null;
  },
```

Pontos da interface usados:

- A trava roda antes de cada ferramenta do agente, depois das travas do núcleo. `acao` é `{tipo: 'comando', comando, cwd, comandos}` ou `{tipo: 'edicao', arquivo, cwd}`.
- `avaliar` é síncrona e devolve `null` (passa) ou `{motivo, saida}`. O agente recebe `Recusado (revisao/gerados): <motivo>` e `Faça: <saida>`.
- `ctx.config` é a seção da extensão em `.harness/config.json` (`{}` quando a chave vale `true`). `validarConfig` devolve `null` para aceitar ou o motivo da recusa; com a configuração recusada, a extensão não carrega e o `tools/ah doctor` mostra o motivo.

Teste da trava, nos dois níveis: a função isolada, com `ctxFalso`, e o gancho do projeto descartável, com `p.gancho({arquivo})`, que passa a edição pelas travas como o Claude Code faria:

```js
test('trava: a edição de arquivo em pasta gerada é recusada', async t => {
  const def = await carregarParaTeste(path.join(PASTA, 'extensao.mjs'));
  const [trava] = def.travas;
  const ctx = ctxFalso({ extensao: 'revisao' });
  assert.equal(trava.avaliar({ tipo: 'edicao', arquivo: 'src/app.js' }, ctx), null);
  assert.match(trava.avaliar({ tipo: 'edicao', arquivo: 'dist/app.js' }, ctx).motivo, /gerada pelo build/);
  const p = novoProjeto(t);
  const g = p.gancho({ arquivo: path.join(p.raiz, 'dist', 'app.js') });
  assert.equal(g.recusada, true);
  assert.match(g.mensagem, /^Recusado \(revisao\/gerados\)/);
  assert.equal(p.gancho({ arquivo: path.join(p.raiz, 'src', 'app.js') }).recusada, false);
});
```

## 5. Reação ao fechamento

Acrescentar ao objeto do `export default` a chave `reacoes`:

```js
  reacoes: {
    antesDeFechar(ctx) {
      if (ctx.frente.extensoes?.revisao?.estado !== 'pedida') return null;
      return {
        recusa: 'a revisão pedida ainda não foi feita',
        saida: 'faça a revisão, rode ah revisao feita na sessão da frente e repita ah close',
      };
    },
  },
```

Pontos da interface usados:

- `antesDeFechar` roda no `tools/ah close` depois das conferências de perda de trabalho e antes de qualquer mudança. Devolver `{recusa, saida}` para o fechamento; devolver `null` deixa seguir.
- A recusa sai como `Recusado: a extensão revisao não deixa fechar a frente <id> <nome>: <recusa>` e `Faça: <saida>`.
- As outras reações (`depoisDeAbrir`, `depoisDeFechar`, `aoPassar`, `noSweep`) não recusam: um erro nelas vira aviso.

Teste da reação:

```js
test('reação ao fechamento: o close recusa a frente com revisão pedida e não feita', t => {
  const p = novoProjeto(t);
  assert.equal(p.ah(['open', 'carrinho']).codigo, 0);
  assert.equal(p.ah(['revisao', 'pedir']).codigo, 0);
  const r = p.ah(['close']);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /a revisão pedida ainda não foi feita/);
  assert.equal(p.ah(['revisao', 'feita']).codigo, 0);
  const c = p.ah(['close']);
  assert.equal(c.codigo, 0, c.erro);
});
```

## 6. Arquivos completos e execução dos testes

Arquivo completo: `.harness/extensoes/revisao/extensao.mjs`

```js
// Extensão revisao: guarda se a revisão da frente foi pedida e feita, recusa a edição de arquivos gerados pelo
// build e não deixa fechar a frente com revisão pedida e ainda não feita.
export default {
  versaoDaInterface: 1,
  descricao: 'revisão por frente e proteção dos arquivos gerados',

  validarConfig(config) {
    if ('gerados' in config && !(Array.isArray(config.gerados) && config.gerados.every(p => typeof p === 'string' && p !== ''))) {
      return 'gerados deve ser uma lista de nomes de pasta, como ["dist"]';
    }
    return null;
  },

  comandos: {
    revisao: {
      descricao: 'mostra, pede ou dá por feita a revisão da frente',
      uso: 'ah revisao [pedir|feita]',
      async executar([acao], ctx) {
        if (!ctx.frente) throw new ctx.ErroDeUso('Esta sessão não tem frente.\nPróximo passo: abra uma com ah open <nome>');
        if (acao === undefined) {
          ctx.escrever(`Revisão de ${ctx.frente.nome}: ${ctx.frente.extensoes?.revisao?.estado ?? 'não pedida'}\n`);
          return 0;
        }
        if (acao !== 'pedir' && acao !== 'feita') {
          throw new ctx.ErroDeUso(`Ação desconhecida: ${acao}\nPróximo passo: use ah revisao [pedir|feita]`);
        }
        const estado = acao === 'pedir' ? 'pedida' : 'feita';
        await ctx.gravarCampos(ctx.frente.nome, { estado });
        ctx.escrever(`Revisão de ${ctx.frente.nome}: ${estado}\n`);
        return 0;
      },
    },
  },

  travas: [{
    id: 'gerados',
    avaliar(acao, ctx) {
      if (acao.tipo !== 'edicao') return null;
      const pastas = ctx.config.gerados ?? ['dist'];
      const partes = acao.arquivo.split(/[\\/]/);
      const pasta = pastas.find(p => partes.includes(p));
      if (!pasta) return null;
      return { motivo: `${acao.arquivo} fica na pasta ${pasta}, gerada pelo build`, saida: 'edite a fonte e rode o build de novo' };
    },
  }],

  reacoes: {
    antesDeFechar(ctx) {
      if (ctx.frente.extensoes?.revisao?.estado !== 'pedida') return null;
      return {
        recusa: 'a revisão pedida ainda não foi feita',
        saida: 'faça a revisão, rode ah revisao feita na sessão da frente e repita ah close',
      };
    },
  },
};
```

Arquivo completo: `.harness/extensoes/revisao/extensao.test.mjs`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { carregarParaTeste, ctxFalso, projetoDeTeste } from '../../nucleo/lib/extensoes-teste.mjs';

const PASTA = path.dirname(fileURLToPath(import.meta.url));

// Projeto descartável com esta extensão copiada e ligada; apagado no fim do teste.
function novoProjeto(t) {
  const p = projetoDeTeste({ extensoes: { revisao: true }, pastas: { revisao: PASTA } });
  t.after(() => p.limpar());
  return p;
}

test('comando: ah revisao pede e dá por feita a revisão da frente', t => {
  const p = novoProjeto(t);
  assert.equal(p.ah(['open', 'carrinho']).codigo, 0);
  const r = p.ah(['revisao', 'pedir']);
  assert.equal(r.codigo, 0, r.erro);
  assert.equal(r.saida, 'Revisão de carrinho: pedida\n');
  assert.deepEqual(p.frente('carrinho').extensoes.revisao, { estado: 'pedida' });
  const errado = p.ah(['revisao', 'talvez']);
  assert.equal(errado.codigo, 1);
  assert.match(errado.erro, /^Recusado: Ação desconhecida: talvez\nFaça: use ah revisao \[pedir\|feita\]/);
});

test('trava: a edição de arquivo em pasta gerada é recusada', async t => {
  const def = await carregarParaTeste(path.join(PASTA, 'extensao.mjs'));
  const [trava] = def.travas;
  const ctx = ctxFalso({ extensao: 'revisao' });
  assert.equal(trava.avaliar({ tipo: 'edicao', arquivo: 'src/app.js' }, ctx), null);
  assert.match(trava.avaliar({ tipo: 'edicao', arquivo: 'dist/app.js' }, ctx).motivo, /gerada pelo build/);
  const p = novoProjeto(t);
  const g = p.gancho({ arquivo: path.join(p.raiz, 'dist', 'app.js') });
  assert.equal(g.recusada, true);
  assert.match(g.mensagem, /^Recusado \(revisao\/gerados\)/);
  assert.equal(p.gancho({ arquivo: path.join(p.raiz, 'src', 'app.js') }).recusada, false);
});

test('reação ao fechamento: o close recusa a frente com revisão pedida e não feita', t => {
  const p = novoProjeto(t);
  assert.equal(p.ah(['open', 'carrinho']).codigo, 0);
  assert.equal(p.ah(['revisao', 'pedir']).codigo, 0);
  const r = p.ah(['close']);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /a revisão pedida ainda não foi feita/);
  assert.equal(p.ah(['revisao', 'feita']).codigo, 0);
  const c = p.ah(['close']);
  assert.equal(c.codigo, 0, c.erro);
});
```

Execução, na raiz do projeto:

```sh
node --test ".harness/extensoes/*/*.test.mjs"
```

O padrão entre aspas é expandido pelo próprio Node (no Node 22, `node --test` não aceita uma pasta como argumento).

Linhas da saída que importam (as durações variam; o `node --test` imprime também `ℹ suites`, `ℹ cancelled`, `ℹ skipped`, `ℹ todo` e `ℹ duration_ms`, omitidas aqui):

```
✔ comando: ah revisao pede e dá por feita a revisão da frente (…ms)
✔ trava: a edição de arquivo em pasta gerada é recusada (…ms)
✔ reação ao fechamento: o close recusa a frente com revisão pedida e não feita (…ms)
ℹ tests 3
…
ℹ pass 3
ℹ fail 0
…
```

Com a extensão ligada, `tools/ah doctor` mostra `ok      Extensão revisao (projeto)`. Os arquivos entram no repositório por caminho:

```sh
git add -- .harness/extensoes/revisao .harness/config.json
git commit -m "feat: extensão revisao"
```

## 7. Comando que depende da hora

Um comando cuja saída depende do relógio, como um `ah idade` que mostra há quanto tempo a frente está aberta (a partir de `ctx.frente.abertaEm`), não tem saída fixa no teste ponta a ponta. O padrão adotado tem dois níveis:

1. **Formato, com `ctxFalso`.** Uma frente montada à mão, com `abertaEm` calculado a partir de `Date.now()`, fixa a duração esperada; o teste compara a saída exata. A conta fica numa função exportada à parte (o módulo pode ter outros exports além do `default`; a carga lê só o `default`), testável também com valores fixos.
2. **Ponta a ponta, com regex tolerante.** Com `projetoDeTeste`, a frente acabou de ser aberta: a saída é conferida por uma expressão que aceita a variação de um minuto.

```js
// extensao.mjs
export function formatarDuracao(ms) { /* "2 h 13 min", "13 min" */ }

// extensao.test.mjs
test('formato: horas e minutos desde abertaEm', async () => {
  const def = await carregarParaTeste(path.join(PASTA, 'extensao.mjs'));
  const abertaEm = new Date(Date.now() - ((2 * 60 + 13) * 60 + 20) * 1000).toISOString();
  const ctx = ctxFalso({ extensao: 'idade', frente: { id: 'as-1', nome: 'carrinho', abertaEm } });
  assert.equal(await def.comandos.idade.executar([], ctx), 0);
  assert.deepEqual(ctx.saida, ['Frente as-1 carrinho: aberta há 2 h 13 min\n']);
});

test('ponta a ponta: a frente recém-aberta tem 0 ou 1 min', t => {
  const p = novoProjeto(t);
  assert.equal(p.ah(['open', 'carrinho']).codigo, 0);
  const r = p.ah(['idade']);
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.saida, /^Frente as-1 carrinho: aberta há [01] min\n$/);
});
```

No registro real, `abertaEm` vem com o fuso da configuração (`2026-11-13T12:43:33-03:00`), e no teste acima vem em UTC (`toISOString`); `Date.parse` lê os dois. `abertaEm` não muda na retomada: a idade conta desde a primeira abertura. O ensaio desse exemplo está em `docs/referencia/ensaio-guia-de-extensao.md`.

## 8. Segurança

Uma extensão é código do projeto e roda com os mesmos poderes do `ah`: lê e escreve qualquer arquivo, acessa a rede e executa processos. A interface separa responsabilidades (a escrita pelo `ctx` fica restrita a `frente.extensoes.<nome>`), mas não isola. Extensão de terceiros exige a mesma revisão que qualquer outro código do projeto.

## 9. Problemas frequentes

| Sintoma | Causa | Conserto |
|---|---|---|
| `tools/ah revisao` responde `comando desconhecido` | Extensão não ligada, ou não carregou | Conferir `extensoes.revisao` em `.harness/config.json` e a linha `Extensão revisao` em `tools/ah doctor` |
| `FALHOU  Extensão revisao: campo desconhecido: …` | Chave fora da interface no `export default` (por exemplo, `reacao` no lugar de `reacoes`) | Corrigir o nome da chave; a lista está em [interface.md](interface.md) |
| `FALHOU  Extensão revisao: versão … da interface` | `versaoDaInterface` diferente de 1 | Usar `versaoDaInterface: 1` |
| `FALHOU  Extensão revisao: o comando … já é do núcleo` | Comando com o nome de um comando do núcleo ou de outra extensão | Renomear o comando |
| `Recusado (revisao/gerados): a trava falhou: …` | A função `avaliar` lançou erro (ou devolveu uma promessa) | Corrigir a trava; enquanto isso, desligar a extensão com `"revisao": false` |
| `Cannot find module '../../nucleo/lib/extensoes-teste.mjs'` | Harness anterior à 0.2.0 | `tools/ah atualizar --de <clone do agent-harness>` |
| `Recusado: não sei qual é a sessão` | Comando com `requisitos.sessao` (padrão) chamado sem `AH_SESSAO`, fora de um agente | `AH_SESSAO=<nome> tools/ah <comando>` |
| `Recusado: Esta sessão não tem frente.` | Sessão sem frente em foco (a recusa é do código da extensão) | `AH_SESSAO=<nome> tools/ah open <frente>` com a mesma sessão |
| Frente ou sessão desconhecida no estado, ou estado de ensaio misturado ao da máquina | Comando executado sem `AH_ESTADO` (ou dentro de um agente, com a sessão real dele) | Exportar `AH_ESTADO`, `AH_WORKTREES` e `AH_FILA` no terminal do ensaio (seção 1) |
