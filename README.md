# agent-harness

Harness para várias sessões de agentes de código no mesmo repositório. Cada sessão trabalha numa frente própria, com ramo e worktree, e um conjunto de comandos coordena os ramos, as travas no gancho do agente, o estado local e os tickets no GitHub. Requer Node 22 ou mais novo e não tem dependências.

## Para que serve este repositório

1. **Base para iniciar projetos.** O `ah init` instala o harness num repositório novo ou existente. A partir daí, as sessões do agente trabalham no projeto sob as regras do harness. Veja "Iniciar um projeto com o harness".
2. **Laboratório.** Instalado num projeto descartável, o harness permite observar várias sessões em paralelo, as recusas das travas, a passagem de bastão e a fila de trabalho pesado, sem rede e sem tocar em projeto real. Veja "Laboratório".
3. **Objeto de estudo.** O repositório guarda o desenho, os planos de cada etapa, os registros de execução e de revisão e os ensaios com agente real. Dá para estudar que problemas o harness ataca, com que mecanismo e onde ele para. Veja [`docs/estudo/`](docs/estudo/README.md).

As regras do harness valem nos projetos que o instalam. O desenvolvimento deste repositório não passa por elas: aqui não há frentes, travas nem PR obrigatório ([`AGENTS.md`](AGENTS.md)).

## Situação

Versão 0.2.0. O núcleo (projeto 1 do desenho) está fechado: as fatias 0 a 5 estão entregues, as pendências registradas nelas foram tratadas, e os itens do "pronto quando" valem, com os limites abaixo ([registro do fechamento](docs/superpowers/plans/2026-11-26-fechamento-do-nucleo.md)). A `dev` tem o estado mais recente; `stage` e `main` recebem a `dev` quando o autor publica.

Limites conhecidos:

- Só o Claude Code tem adaptador, ensaiado com o agente real ([`docs/referencia/ensaio-claude-code.md`](docs/referencia/ensaio-claude-code.md)). Codex, OpenCode e outros agentes escrevem o próprio adaptador pelo roteiro de [`docs/agentes/`](docs/agentes/README.md). O roteiro foi ensaiado com o Codex, na etapa de diagnóstico ([`ensaio-roteiro-de-adaptacao.md`](docs/referencia/ensaio-roteiro-de-adaptacao.md)); com o OpenCode, não.
- O repositório não tem CI. A verificação é local (`npm run verifica`, seção "Desenvolvimento") e só roda no Linux: Windows e macOS não foram executados.
- As travas leem o texto do comando: são aviso cedo para enganos do agente, não caixa de areia. A barreira de verdade é a proteção de ramo no servidor, que o `init` aplica. Detalhes na seção "Limites" de [`docs/referencia/comandos.md`](docs/referencia/comandos.md).
- O `ah atualizar` não foi ensaiado com agente real.

## Iniciar um projeto com o harness

Requisitos do projeto: repositório git com pelo menos um commit e Node 22 ou mais novo. Para tickets e proteção de ramo, o `gh` autenticado e o repositório no GitHub.

Para um projeto que ainda não existe:

```
mkdir meu-projeto && cd meu-projeto
git init -b main
git commit --allow-empty -m "começo"
gh repo create <dono>/meu-projeto --private --source . --push   # opcional: tickets e proteção de ramo
```

Clone este repositório, abra o agente na pasta do projeto e faça o pedido: "prepare meu projeto com o harness, a partir do clone em `<caminho>`". O agente executa, na pasta do projeto:

```
node <clone>/nucleo/bin/ah.mjs init
```

Sem o `gh`, ou sem autenticação nele, o `init` não consegue propor a sigla. Nesse caso, use `node <clone>/nucleo/bin/ah.mjs init --sigla <sigla>`, com 2 a 4 letras minúsculas (por exemplo, `--sigla as` para `ana-souza`).

O `init` cria os ramos que faltam (`dev` e `stage`, localmente) e não faz commit. Ele termina com os comandos exatos do commit, que deve ser feito **no ramo base** (`dev`), pois as frentes partem dele. Se o projeto estiver em outro ramo (por exemplo, `main`), execute primeiro `git switch dev` e depois o `git add -- …` com os caminhos gravados e o `git commit`. Por fim:

```
tools/ah doctor
```

A proteção de ramo no servidor só é aplicada aos ramos que já estão no remoto. Depois do primeiro push de `dev`, `stage` e `main`, rode o `init` de novo; o `doctor` acusa enquanto faltar.

A partir daí, cada sessão do agente abre a própria frente com `tools/ah open <nome>`, trabalha no worktree, integra na `dev` e fecha com `tools/ah close` (ou interrompe no meio com `tools/ah handoff`). Esses comandos são executados pelo agente, e a identificação da sessão vem do gancho dele. Para executá-los à mão, num terminal, informe a sessão em `AH_SESSAO` (um nome qualquer, o mesmo no `open` e no `close`):

```
AH_SESSAO=ana-terminal tools/ah open carrinho
AH_SESSAO=ana-terminal tools/ah close
```

`tools/ah --help` lista os comandos, e `tools/ah <comando> --help` mostra o uso de cada um. O projeto recebe a referência de uso em `docs/agents/sessoes-paralelas.md`, e o `AGENTS.md` dele ganha um trecho que aponta para ela.

Para levar ao projeto uma versão mais nova do harness, atualize o clone (`git pull`) e, na pasta do projeto, rode `tools/ah atualizar --de <clone> --simular` para ver o que mudaria e `tools/ah atualizar --de <clone>` para trocar. Configuração, extensões e estado não são tocados.

## Laboratório

O laboratório é um projeto descartável com estado, worktrees, fila de pesado e `gh` isolados numa pasta temporária. Nada do que acontece nele chega à máquina real nem ao GitHub.

O jeito mais rápido é rodar o ciclo completo da demonstração:

```
LAB=$(mktemp -d)
bash docs/video/apresentacao/demo/capturar.sh $LAB/demo $LAB/saidas
```

O script cria a loja de exemplo, instala o harness, abre frentes de duas sessões, provoca as travas T4, T5 e T2, passa uma frente de uma sessão para a outra, integra e fecha. Cada passo fica gravado com a saída real em `$LAB/saidas/`, e a loja em `$LAB/demo/loja` fica para continuar experimentando (com `AH_ESTADO=$LAB/demo/estado`, `AH_WORKTREES=$LAB/demo/wt` e `AH_GH=$LAB/demo/gh-ausente.mjs` exportadas). Sem o segundo argumento, o script regrava as saídas que o vídeo usa, em `docs/video/apresentacao/demo/saidas/`.

Para montar à mão:

```
LAB=$(mktemp -d)
export AH_ESTADO=$LAB/estado AH_WORKTREES=$LAB/wt AH_FILA=$LAB/fila AH_GH=<clone>/teste/apoio/gh-falso.mjs
mkdir $LAB/loja && cd $LAB/loja
git init -b main && git commit --allow-empty -m "começo"
node <clone>/nucleo/bin/ah.mjs init --projeto loja --sigla as --sem-protecao
```

Em seguida, faça o commit que o `init` indica, na `dev`, e rode `tools/ah doctor`. As variáveis precisam estar exportadas em todo terminal que usar o laboratório. Para ver o gancho recusar sem abrir um agente, mande a ele o evento que o Claude Code mandaria (exemplos nas saídas da demonstração, passos 09 a 11). Para ver com o agente real, abra o Claude Code na pasta da loja.

O guia de estudo traz uma lista de experimentos para o laboratório.

## Estudo

[`docs/estudo/`](docs/estudo/README.md) é a porta de entrada: a ordem de leitura, a tabela de problemas e respostas (mecanismo, código, teste e limite de cada um), as decisões de desenho, o caminho pelo código, os experimentos e como o harness foi construído, com o [histórico das fatias](docs/estudo/historico-das-fatias.md).

## Referência

- [`docs/referencia/comandos.md`](docs/referencia/comandos.md): cada comando, as recusas e exemplos; a vida da sessão, os eventos, os limites das travas e o procedimento de publicação nos projetos.
- [`docs/referencia/capacidades-por-agente.md`](docs/referencia/capacidades-por-agente.md): recursos que cada agente de código oferece ao harness.
- [`docs/referencia/ensaio-claude-code.md`](docs/referencia/ensaio-claude-code.md): ensaios com o Claude Code.
- [`docs/referencia/ensaio-guia-de-extensao.md`](docs/referencia/ensaio-guia-de-extensao.md): prova do guia de extensão com um agente sem contexto.
- [`docs/referencia/ensaio-roteiro-de-adaptacao.md`](docs/referencia/ensaio-roteiro-de-adaptacao.md): prova do roteiro de adaptação com o Codex sem contexto.
- [`docs/agentes/`](docs/agentes/README.md): roteiro para escrever o adaptador de outro agente.
- [`docs/extensoes/`](docs/extensoes/como-estender.md): guia de criação e referência da interface de extensão.
- [`docs/aula/`](docs/aula/): levantamento, material de apoio e apresentação da aula.

## Desenvolvimento

Testes: `npm test` (ou `node --test "teste/*.test.mjs"`). Regras de trabalho neste repositório: [`AGENTS.md`](AGENTS.md). Licença MIT.

O repositório não tem CI; o que ela faria roda na máquina de quem desenvolve. `npm run verifica` roda a suíte e a varredura de termos. Para conferir também o Node mínimo do `package.json` (22), passe os dois executáveis:

```
node ferramentas/verifica.mjs --node "$(mise where node@22)/bin/node" --node "$(command -v node)"
```
