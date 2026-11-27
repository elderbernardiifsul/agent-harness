# agent-harness

Harness para várias sessões de agentes de código no mesmo repositório. Cada sessão trabalha numa frente própria, com ramo e worktree, e um conjunto de comandos coordena os ramos, as travas no gancho do agente, o estado local e os tickets no GitHub. Requer Node 22 ou mais novo e não tem dependências.

## Instalar num projeto (instruções para o agente)

Esta seção é para o agente de código que recebeu o endereço deste repositório (https://github.com/elderbernardiifsul/agent-harness), ou um clone dele, com um pedido como "instale o harness daqui" ou "prepare meu projeto". Ela é o único lugar do procedimento; a skill `preparar-projeto`, instalada no projeto, aponta para cá. O aluno não digita comando: você executa cada passo, mostra o resultado e pede licença antes de instalar algo na máquina dele, criar algo no GitHub ou executar código baixado.

1. **Confirmar o alvo.** Confirme com o aluno a pasta do projeto e se ele já existe. Projeto existente: precisa ser um repositório git com pelo menos um commit; com alteração solta, peça a ele que a commite ou guarde antes. Projeto novo: `git init -b main` na pasta e um primeiro commit (`git commit --allow-empty -m "começo"`); com o "sim" do aluno, `gh repo create <dono>/<nome> --private --source . --push` (privado, salvo pedido dele).
2. **Conferir os requisitos.** `node --version` (22 ou mais novo) e `git --version`. O `gh` autenticado (`gh auth status`) é opcional: sem ele, o `init` pede `--sigla`, e o projeto fica sem proteção de ramo e sem os rótulos de triagem. Faltando Node ou git, diga ao aluno o que falta e como instalar no sistema dele, e espere o "sim" antes de instalar.
3. **Trazer o harness.** Com um clone dado pelo aluno, ele é a `<origem>`: siga para o passo 4. Sem clone:
   - Ache a versão. `git ls-remote --tags https://github.com/elderbernardiifsul/agent-harness 'v*'` lista as tags publicadas: use a maior `vX.Y.Z`, e o commit dela é o da linha `refs/tags/vX.Y.Z^{}` (ou da linha sem `^{}`, quando não houver essa). Sem tag publicada, use a `main`: `git ls-remote https://github.com/elderbernardiifsul/agent-harness refs/heads/main` mostra o commit dela.
   - Baixe numa pasta de cache da máquina, fora do projeto. A `<cache>` é `$HOME/.cache/agent-harness/<versão>` no Linux, com a tag (`v0.3.0`) ou `main-<7 primeiros caracteres do commit>`; em outro sistema, o equivalente que você escolher. `git clone --depth 1 --branch <tag ou main> https://github.com/elderbernardiifsul/agent-harness <cache>`. Uma `<cache>` que já existe com esse commit é reaproveitada.
   - Confira o commit: `git -C <cache> rev-parse HEAD` tem de dar o commit que o `ls-remote` mostrou. Diferente (a `main` andou entre as duas leituras), leia de novo e baixe numa pasta nova.
   - Mostre ao aluno a origem (o endereço), a versão e o commit, e peça a confirmação antes de executar qualquer coisa da `<cache>`. Sem o "sim", pare.

   Daqui em diante, a `<origem>` é a `<cache>` (ou o clone dado).
4. **Instalar o núcleo.** Na pasta do projeto: `node <origem>/nucleo/bin/ah.mjs init`. Sem o `gh`, acrescente `--sigla` com 2 a 4 letras minúsculas (`--sigla as` para Ana Souza). O `init` termina com os comandos do commit: faça-o no ramo base, `dev` (`git switch dev`, depois o `git add -- …` e o `git commit` que ele imprimiu).
5. **Ligar o método.** Em `.harness/config.json`, no objeto `extensoes` (que o `init` deixa vazio), acrescente as três extensões do método, mantendo as que já estiverem lá:

   ```json
   "extensoes": { "metodo": { "agentes": ["claude-code"] }, "registros": true, "modelo": true }
   ```

   `agentes` lista os agentes que o aluno vai usar (`claude-code`, `codex`, `opencode`); o agente que você é entra sempre. Rode `tools/ah metodo instalar` e faça, na `dev`, o commit que ele indica.
6. **Conferir.** `tools/ah doctor`. Relate ao aluno o que ficou instalado, cada aviso e o que fazer com ele.
7. **Quando algo falha.** Toda recusa do harness traz o motivo e uma linha `Faça:` com o próximo passo: siga-a e repita o passo. Sem `Faça:`, ou quando a mesma recusa volta, pare e relate ao aluno o comando, a saída e o que você tentou.

Para reparar uma instalação que já existe, rode `tools/ah doctor` na pasta do projeto e siga o "Faça" de cada item que não estiver ok. Criar a tag de versão faz parte da publicação deste repositório e espera a ordem do autor.

## Para que serve este repositório

1. **Base para iniciar projetos.** O `ah init` instala o harness num repositório novo ou existente, e o método (as skills e o `AGENTS.md` de princípios) vem em seguida. A partir daí, as sessões do agente trabalham no projeto sob as regras do harness. Veja "Instalar num projeto (instruções para o agente)" e "Iniciar um projeto com o harness".
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

O procedimento de instalação, num projeto novo ou existente (requisitos, `init`, método e `doctor`), está em "Instalar num projeto (instruções para o agente)", acima. Abra o agente na pasta do projeto e peça: "prepare meu projeto com o harness daqui: https://github.com/elderbernardiifsul/agent-harness" (ou "a partir do clone em `<clone>`"). O que segue vale depois da instalação.

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
