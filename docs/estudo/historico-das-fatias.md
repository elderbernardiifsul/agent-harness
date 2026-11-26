# Histórico das fatias

O núcleo foi construído em fatias (seção 12.1 do [desenho](../superpowers/specs/2026-11-12-nucleo-design.md)). Cada fatia terminava utilizável e com teste, e a seguinte só começava depois. Este documento guarda a descrição de cada entrega como ficou no README ao fim da fatia 5 (versão 0.2.0, 13/11/2026). Os planos de cada fatia estão em [`docs/superpowers/plans/`](../superpowers/plans/).

## Depois da fatia 5

Duas coisas mudaram depois que este texto foi escrito:

- As pendências registradas nas fatias 0 a 5 foram tratadas em quatro linhas de trabalho ([plano](../superpowers/plans/2026-11-13-pendencias.md); registros das linhas [A](../superpowers/plans/2026-11-13-pendencias-execucao-a.md), [B](../superpowers/plans/2026-11-13-pendencias-execucao-b.md) e [C](../superpowers/plans/2026-11-13-pendencias-execucao-c.md)). Entre elas, entrou a coluna de bloqueios no `board`, que a fatia 5b tinha deixado de fora.
- As travas de extensão, o `ah pesado` com a T6 e o `ah recursos` foram ensaiados com o Claude Code real (linha D, em [`ensaio-claude-code.md`](../referencia/ensaio-claude-code.md)). O `ah atualizar` continua sem ensaio com agente real.

## Entregas, fatia por fatia

### Entregas da fatia 1

- `ah init`: instala o harness em um projeto (núcleo, configuração, ganchos do agente, CI e proteção dos ramos no servidor).
- `ah open`, `ah nota`, `ah board`, `ah whoami`, `ah close`: ciclo de uma frente de trabalho, com ramo e worktree próprios, registro no estado local e comentário nos tickets.
- `ah doctor`: verificação da preparação do projeto.
- Travas no gancho do agente: T0 (recusa o comando que não consegue ler), T2 (`git add -A` e `git commit -a` no checkout principal) e T5 (push e `gh pr merge` em ramo protegido).
- Adaptador do Claude Code, ensaiado com o agente real (`docs/referencia/ensaio-claude-code.md`).

### Entregas da fatia 2

Suporte a várias sessões e várias pessoas no mesmo repositório:

- Sessão viva: processo do agente em execução e sinal de vida dentro do prazo (`sessoes.prazoDoSinalMin`, 120 minutos por padrão). Um `/clear` ou uma conversa retomada no mesmo processo herda a frente.
- Reserva de ticket no `ah open --tickets` (comentário, responsável e rótulo), liberada no `ah close`, com fila para as operações que falham por falta de rede.
- `ah handoff`: passa a frente adiante sem fechá-la; `ah open <nome>` a retoma, na mesma máquina ou em outra.
- `ah takeover`: assume a frente de uma sessão morta, com `--confirmado` (ordem do executivo).
- `ah papel`: executor (uma frente) ou orquestrador (várias frentes, e `ah open --para` para abrir frente para outra sessão).
- `ah sweep`: lista o que está fora do lugar e, com `--reparar`, corrige o estado.
- Detecção de arquivos em comum entre frentes no `open`, no `board` e no começo da sessão.
- Travas novas: T1 (troca de ramo no checkout principal), T3 (descarte de trabalho no checkout principal) e T4 (escrita no worktree ou no ramo de outra sessão viva).

### Trabalho pesado (fatia 3)

Builds e testes ponta a ponta de várias sessões simultâneas esgotam a memória da máquina. `tools/ah pesado -- <comando>` coloca o comando numa fila da máquina, comum a todos os projetos com o harness; o comando aguarda a vez, executa e devolve a saída e o código de saída. O número de vagas e a memória livre mínima são configurações da máquina; as classes (quais comandos são pesados e quantas vagas cada um ocupa) ficam em `pesado.classes` no `.harness/config.json`. Com classes configuradas, a trava T6 recusa a execução de um desses comandos fora da fila e indica como executá-lo pela fila. O `board` mostra os comandos em execução e os que aguardam. Detalhes e limites: `docs/referencia/comandos.md`, seção "pesado".

### Outros agentes (fatia 4)

Somente o Claude Code tem adaptador. Os adaptadores do Codex e do OpenCode não acompanham o harness, por decisão do autor (seção 15 de `docs/superpowers/specs/2026-11-12-nucleo-design.md`): o agente que chega ao projeto escreve o próprio adaptador conforme o roteiro em `docs/agentes/`, que contém o contrato dos quatro eventos, o adaptador do Claude Code como exemplo, o passo a passo e o procedimento de prova. Os testes de contrato que todo adaptador deve passar rodam com `AH_ADAPTADOR=<agente> node --test teste/contrato-adaptadores.test.mjs`. O `AGENTS.md` instalado pelo `init` aponta para o roteiro (`.harness/nucleo/docs/agentes/README.md`), e o `doctor` informa, no item "Adaptador do agente em uso", quando o agente em uso não tem adaptador e as travas automáticas não se aplicam. O roteiro não foi ensaiado com o Codex nem com o OpenCode.

### Atualização do harness instalado (fatia 5)

Com o clone do agent-harness atualizado (`git pull` no clone), na pasta do projeto:

```
tools/ah atualizar --de <clone> --simular
tools/ah atualizar --de <clone>
```

O primeiro comando apenas lista o que mudaria. O segundo substitui `.harness/nucleo/` pela cópia do clone (montada ao lado e trocada de uma só vez) e reaplica o trecho do harness no `AGENTS.md`; configuração, extensões e estado (frentes, sessões, fila) permanecem inalterados. O `atualizar` recusa a operação quando algum arquivo do núcleo foi alterado à mão no projeto e lista o que se perderia (`--forcar` descarta essas alterações). Também recusa quando não há como fazer essa conferência (manifesto antigo e clone sem o commit instalado) e quando o clone é mais antigo que a cópia instalada, critério avaliado pela versão ou, com git, pela anterioridade do commit do clone em relação ao instalado. Assim como o `init`, o `atualizar` não faz commit e termina com os comandos do commit no ramo base. O `doctor` avisa, no item "Núcleo igual ao clone de origem", quando o clone registrado na máquina tem um núcleo diferente do instalado. Detalhes: `docs/referencia/comandos.md`, seção "atualizar".

### Extensões, dependências e números (fatia 5)

- **Extensões do projeto.** Uma pasta `.harness/extensoes/<nome>/` com `extensao.mjs`, ligada em `extensoes` no `.harness/config.json`, acrescenta comandos (`tools/ah <nome>`), travas avaliadas depois das do núcleo, verificações do `doctor`, reações ao ciclo da frente (inclusive recusar o `close`), linhas no resumo e colunas no quadro, sem alterar o núcleo. Uma extensão que não carrega não derruba os comandos do núcleo, e o `doctor` mostra o motivo. Guia: [`docs/extensoes/como-estender.md`](../extensoes/como-estender.md); interface (versão 1): [`docs/extensoes/interface.md`](../extensoes/interface.md).
- **Extensão `recursos`.** Acompanha o harness: `tools/ah recursos reservar porta 3001` registra um recurso (porta, banco) na frente, recusa o valor já reservado por outra frente, aparece no `board` e faz o `close` recusar a frente com recursos ainda reservados.
- **`tools/ah deps`.** Lê a relação de bloqueio entre as issues no GitHub (API de dependências, ou a linha `Bloqueado por: #N` no corpo) e mostra a árvore de bloqueios e as issues livres para começar; `tools/ah deps <n>` mostra uma issue. Guarda a última leitura para uso sem rede; o `open` avisa quando um ticket da frente está bloqueado.
- **`tools/ah board --numeros`.** Agrega o registro de eventos da máquina: frentes abertas e fechadas, tempo médio e mediano por frente, passagens, tomadas, sessões por modelo, recusas por trava e trabalho pesado, com período opcional (`--desde`, `--ate`).

Detalhes: `docs/referencia/comandos.md`, seções "Extensões", "recursos", "deps" e "board".
