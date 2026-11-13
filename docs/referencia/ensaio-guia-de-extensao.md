# Ensaio do guia de extensão

Data: 2026-11-13. Agente: subagente com o modelo Claude Opus 5.5, sem contexto do repositório.

Objetivo: verificar se `docs/extensoes/como-estender.md` basta para que um agente sem contexto crie uma extensão nova, com teste, sem ler o código do harness (tarefa 6 do plano `docs/superpowers/plans/2026-11-13-nucleo-fatia-5b.md`).

## Pedido

O subagente recebeu apenas o caminho do clone e o pedido de criar o comando `ah idade`, que mostra há quanto tempo a frente da sessão está aberta, seguindo `docs/extensoes/como-estender.md`. O pedido não indicava arquivos do núcleo nem a forma do registro da frente.

## Preparo

O subagente montou um projeto descartável em `<tmp>/loja`, com o estado em `<tmp>/estado` e os worktrees em `<tmp>/worktrees`, instalou o harness com `node <clone>/nucleo/bin/ah.mjs init --sigla as`, fez o commit do harness na `dev` e ligou a extensão em `.harness/config.json` (`"extensoes": {"idade": true}`). O guia da época não descrevia esse preparo (lacuna 2, abaixo).

## Resultado

A extensão ficou pronta sem leitura do código do harness. Arquivos criados em `<tmp>/loja/.harness/extensoes/idade/`:

- `extensao.mjs`: o comando `idade`, que recusa argumento a mais e sessão sem frente, lê `ctx.frente.abertaEm` com `Date.parse` e escreve `Frente <id> <nome>: aberta há <duração>`. A conta da duração fica numa função exportada à parte, `formatarDuracao(ms)`, ao lado do `export default`.
- `extensao.test.mjs`: três testes. O primeiro chama `executar` com `ctxFalso` e uma frente montada à mão (`abertaEm` a 2 h 13 min 20 s de `Date.now()`) e compara a saída exata, `Frente as-1 carrinho: aberta há 2 h 13 min`. O segundo, com `projetoDeTeste`, abre a frente e confere a saída com a expressão `/^Frente [a-z]+-1 carrinho: aberta há [01] min\n$/`. O terceiro confere a recusa sem frente.

Trecho do comando:

```js
if (args.length > 0) throw new ctx.ErroDeUso(`Argumento a mais: ${args[0]}\nPróximo passo: use ah idade`);
if (!ctx.frente) throw new ctx.ErroDeUso('Esta sessão não tem frente.\nPróximo passo: abra uma com ah open <nome>');
const inicio = Date.parse(ctx.frente.abertaEm ?? '');
```

### Testes

```
$ node --test .harness/extensoes/
✔ comando isolado: ah idade conta horas e minutos desde abertaEm (…ms)
✔ comando: ah idade mostra a idade da frente da sessão (…ms)
✔ comando: ah idade recusa sem frente, com motivo e próximo passo (…ms)
ℹ tests 3
…
ℹ pass 3
ℹ fail 0
…
```

### Chamadas reais

```
$ tools/ah doctor | grep -i extens
ok      Extensão idade (projeto)
```

```
$ AH_SESSAO=ana-terminal tools/ah idade
Frente as-1 carrinho: aberta há 0 min
```

Código de saída: 0.

```
$ AH_SESSAO=carla-terminal tools/ah idade
Recusado: Esta sessão não tem frente.
Faça: abra uma com ah open <nome>
```

Código de saída: 1.

```
$ tools/ah idade --help
ah idade: mostra há quanto tempo a frente da sessão está aberta
Uso: ah idade
```

O `eventos.jsonl` do estado de ensaio registra, além das recusas com `carla-terminal` e com outras sessões de nome escolhido pelo subagente, uma recusa com o id da sessão do próprio subagente: uma chamada sem `AH_SESSAO` usou `CLAUDE_CODE_SESSION_ID`, definida no ambiente do agente (lacuna 3). O `maquina.json` do ensaio traz o login da conta do `gh` real da máquina, porque o preparo não definiu `AH_GH`.

## Lacunas encontradas e correções no guia

O subagente concluiu a tarefa e registrou o que o guia não dizia. Cada lacuna foi corrigida no commit `c207ef0` (`docs: guia e interface de extensão com as lacunas da prova`).

| Lacuna | Correção |
|---|---|
| 1. `interface.md` dizia apenas que `ctx.frente` é "cópia só de leitura", sem os campos do registro; o subagente deduziu `abertaEm` pelo nome | `interface.md`, seção "Registro da frente": cada campo com tipo e formato (`abertaEm` como `AAAA-MM-DDTHH:MM:SS±HH:MM`, no fuso da configuração), quais são estáveis na versão 1, os campos opcionais sem garantia e a permanência de `abertaEm` na retomada (que acrescenta `retomadaEm`) |
| 2. O guia pressupunha projeto com o harness instalado e não descrevia um projeto descartável | `como-estender.md`, seção 1, "Projeto descartável para ensaio": commit inicial, `init --sigla`, commit na `dev`, identidade do git, e o isolamento com `AH_ESTADO`, `AH_WORKTREES`, `AH_FILA` e `AH_GH` |
| 3. O guia não dizia como chamar o comando com uma sessão, nem que dentro de um agente o `ah` usa `CLAUDE_CODE_SESSION_ID`; as duas recusas "sem frente" (sem sessão e com sessão sem frente) apareciam como uma só | `como-estender.md`, seção 3, "Chamada com uma sessão"; `interface.md`, "Sessão e as duas recusas sem frente", com a tabela de quem recusa e a saída de cada caso |
| 4. `ctxFalso` aparecia só no teste da trava; o formato de `ctx.saida` e a presença de `ErroDeUso` não estavam escritos | `como-estender.md`, seção 3: teste de comando com `ctxFalso`; `interface.md`, "Auxiliares de teste": `saida`, `avisos`, `gravados`, `chamadas`, `ErroDeUso`, sessão padrão |
| 5. Sem padrão para teste de comando que depende da hora, e sem dizer qual sessão o `p.ah` usa | `como-estender.md`, seção 7, "Comando que depende da hora" (formato com `ctxFalso`, ponta a ponta com regex tolerante); seção 3: `p.ah` usa `sessao-teste-0001` e outra sessão entra por `env` |
| 6. Não estava escrito se o módulo pode ter outros exports além do `default`; a "saída esperada" do `node --test` omitia linhas sem avisar | `interface.md`, "Forma do `export default`": a carga lê só `modulo.default`; `como-estender.md`, seção 6: só as linhas que importam, com a indicação das omitidas |

## Limites

- Um só subagente, uma só extensão (comando, sem trava nem reação). A trava e a reação ao fechamento do guia são cobertas por `teste/guia-de-extensao.test.mjs`, que grava os arquivos completos do guia num projeto descartável e roda os testes deles.
- A prova não foi repetida depois das correções: o subagente concluiu a tarefa com o guia anterior, e as correções acrescentam o que ele precisou deduzir.
