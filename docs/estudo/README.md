# Guia de estudo do agent-harness

Este guia é para quem quer entender o harness por dentro: que problemas ele ataca, com que mecanismo, onde cada mecanismo está no código, que teste o prova e onde ele deixa de valer. O guia também descreve como o harness foi construído.

O guia não substitui o material da aula. Ele organiza a leitura e aponta para os documentos que já existem:

- [desenho do núcleo](../superpowers/specs/2026-11-12-nucleo-design.md): decisões, objetivos e o que seria fracasso;
- [levantamento](../aula/2026-11-13-levantamento.md) e [material de apoio](../aula/2026-11-13-material-de-apoio.md) da aula: as questões em sequência (situação, alternativas, custos, solução, limites), com exercícios e gabarito;
- [referência dos comandos](../referencia/comandos.md): comportamento exato, recusas e a seção "Limites".

## Ordem de leitura

1. **O problema.** Seção 1 do desenho ("As dores de origem") e seção 2 do material de apoio ("três sessões no mesmo repositório").
2. **As questões.** As 13 questões do material de apoio, uma por vez. Cada uma termina com a solução do harness e os limites dela.
3. **O mecanismo.** Seções 6 (conceitos e ciclo de vida) e 7 (travas e fila) do desenho. Depois, a referência dos comandos.
4. **O código.** Na ordem da seção "Leitura do código", abaixo.
5. **Os limites.** Seção "Limites" da referência dos comandos.
6. **A construção.** Seção "Como foi construído", abaixo.

## Problemas e respostas

Cada linha parte de um incidente real do projeto de origem (seção 1 do desenho, anonimizada). Os caminhos são relativos à raiz do repositório.

| Problema | Mecanismo | Código | Testes | Onde para |
|---|---|---|---|---|
| Sessões pisando umas nas outras: mesmos arquivos editados, commits no checkout comum, ramo do checkout comum trocado | Frente com ramo e worktree próprios; travas T1 (troca de ramo), T2 (adicionar tudo), T3 (descarte) e T4 (worktree de outra sessão viva) no gancho do agente | `nucleo/comandos/open.mjs`, `nucleo/lib/travas.mjs`, `nucleo/lib/shell.mjs` | `teste/travas.test.mjs`, `teste/shell.test.mjs`, `teste/ciclo-duas-sessoes.test.mjs` | As travas leem o texto do comando: script, `eval` ou programa que escreve arquivo por conta própria passam |
| Quadro de "quem faz o quê" dentro do git: 15% dos commits e cerca de 16 mil tokens por sessão para lê-lo | Estado fora do git, por máquina; `ah board`; resumo curto injetado no começo da sessão | `nucleo/lib/estado.mjs`, `nucleo/comandos/board.mjs`, `nucleo/lib/resumo.mjs` | `teste/estado.test.mjs`, `teste/board.test.mjs`, `teste/contrato.test.mjs` | O estado é de uma máquina; entre máquinas, o canal são os comentários nos tickets |
| Linha morta: sessão que morre deixa "em andamento" para sempre | Sessão viva = processo existe, mesma hora de início e sinal de vida dentro do prazo; `ah sweep` e `ah takeover` | `nucleo/lib/vida.mjs`, `nucleo/lib/varredura.mjs`, `nucleo/comandos/takeover.mjs` | `teste/vida.test.mjs`, `teste/sweep.test.mjs`, `teste/takeover.test.mjs` | No Windows a hora de início não é conferida: pid reaproveitado conta como vivo até o sinal vencer |
| Máquina derrubada por vários builds e testes ponta a ponta ao mesmo tempo | Fila de trabalho pesado da máquina (vagas, classes, ordem de chegada, árvore do comando encerrada); trava T6 | `nucleo/lib/fila.mjs`, `nucleo/lib/arvore.mjs`, `nucleo/comandos/pesado.mjs` | `teste/fila.test.mjs`, `teste/pesado.test.mjs` | A T6 lê o texto (`./build.sh` que chama o build passa); neto com `setsid` escapa do encerramento |
| Duas pessoas pegaram o mesmo ticket | Reserva no GitHub (comentário com marcador, responsável e rótulo), relida antes de criar a frente; fila de comentários pendentes sem rede | `nucleo/lib/reserva.mjs`, `nucleo/lib/pendentes.mjs` | `teste/reserva.test.mjs`, `teste/pendentes.test.mjs` | É aviso, não trava atômica: duas aberturas no mesmo segundo podem desistir uma diante da outra |
| Perda de contexto: depois de limpar ou compactar a conversa, a sessão não sabe qual é a frente dela | Resumo no começo da sessão; a continuação no mesmo processo herda frente e papel | `nucleo/lib/resumo.mjs`, `nucleo/lib/heranca.mjs`, `nucleo/adaptadores/contrato.mjs` | `teste/heranca.test.mjs`, `teste/contrato.test.mjs` | No Windows a continuação não herda a frente |
| Push acidental para o ramo que publica | Trava T5 (push e merge de PR em ramo protegido) e proteção de ramo no servidor, aplicada pelo `ah init` | `nucleo/lib/travas.mjs`, `nucleo/lib/github.mjs`, `nucleo/comandos/init.mjs` | `teste/travas.test.mjs`, `teste/protecao.test.mjs` | A barreira de verdade é o servidor; merge pelo GraphQL ou por outras rotas da API passa pela trava local |
| Passagem de bastão espalhada: quem retoma não acha o estado | `ah handoff` com comentário padronizado no ticket; `ah open <nome>` retoma na mesma máquina ou em outra | `nucleo/comandos/handoff.mjs`, `nucleo/comandos/open.mjs` | `teste/handoff.test.mjs`, `teste/retomar.test.mjs` | Frente sem ticket só é retomada na mesma máquina |

Quatro problemas apareceram durante a construção, e não no projeto de origem:

| Problema | Mecanismo | Onde ler |
|---|---|---|
| Agentes diferentes expõem ganchos diferentes | Contrato neutro de quatro eventos; cada agente tem um adaptador fino; o agente que chega escreve o próprio adaptador pelo roteiro e passa nos testes de contrato | `nucleo/adaptadores/`, [`docs/agentes/`](../agentes/README.md), `teste/contrato-adaptadores.test.mjs` |
| Cada projeto precisa de regras próprias sem mexer no núcleo | Interface de extensão (comandos, travas, verificações, reações ao ciclo, resumo, colunas do quadro) | `nucleo/lib/extensoes.mjs`, [`docs/extensoes/`](../extensoes/como-estender.md), `teste/extensoes.test.mjs` |
| A cópia do núcleo em cada projeto envelhece | `ah atualizar` com manifesto e sha256 de cada arquivo; recusa quando há alteração à mão | `nucleo/lib/copia.mjs`, `nucleo/comandos/atualizar.mjs`, `teste/atualizar.test.mjs` |
| Saber se o harness ajuda | Registro de eventos local (`eventos.jsonl`) e `ah board --numeros` | `nucleo/lib/numeros.mjs`, `teste/numeros.test.mjs` |

## Decisões de desenho que merecem discussão

- **Gancho que quebra recusa.** Se o gancho não consegue avaliar o comando, a ação é recusada (T0) e a saída é `ah doctor`. O projeto de origem deixava passar. Seção 7 do desenho.
- **Toda recusa diz a saída.** Motivo em uma linha e o que fazer no lugar, no formato único de `nucleo/lib/recusa.mjs`. Seção 12.4.
- **Travas são funções puras.** Entra o comando já interpretado, o diretório e o estado; sai "permite" ou "recusa". Nada de disco nem de git dentro de `travas.mjs`, o que torna cada trava testável com uma linha. Um interpretador de shell só (`shell.mjs`) serve a todas.
- **As travas pegam engano, não má-fé.** Elas avisam cedo; a barreira é a proteção de ramo no servidor. Seção 12.2 e "Limites" da referência.
- **Cópia por projeto.** O harness fica dentro de cada projeto, e o ponto de entrada sempre executa a cópia do checkout principal, nunca a do worktree. Seção 4.
- **O `open` não faz commit sozinho.** O original commitava os arquivos sujos do checkout principal; aqui ele só avisa. Seção 6.
- **Outros agentes se adaptam sozinhos.** Em vez de adaptadores prontos para Codex e OpenCode, um roteiro e testes de contrato. Seção 15.

## Leitura do código

Do menor para o maior, seguindo o caminho de um evento do agente até a decisão:

1. `nucleo/lib/recusa.mjs`: o formato da recusa.
2. `nucleo/adaptadores/claude-code.mjs`: como o JSON do gancho do Claude Code vira um evento neutro.
3. `nucleo/comandos/gancho.mjs`: o ponto em que o agente chama o harness, e o que acontece quando algo quebra.
4. `nucleo/adaptadores/contrato.mjs`: os quatro eventos (`inicio`, `sinal`, `antes`, `fim`) e o que o núcleo faz em cada um.
5. `nucleo/lib/travas.mjs` e `nucleo/lib/shell.mjs`: as travas e o interpretador de shell que elas usam. É a parte mais longa e a que mais recebeu revisão.
6. `nucleo/lib/estado.mjs`, `nucleo/lib/vida.mjs` e `nucleo/lib/heranca.mjs`: o estado fora do git, a exclusão mútua, a sessão viva e a continuação.
7. `nucleo/comandos/open.mjs` e `nucleo/comandos/close.mjs`: o ciclo da frente. O `close` roda em fases, com a rede fora da trava.
8. `nucleo/lib/fila.mjs` e `nucleo/lib/arvore.mjs`: a fila de pesado.

Para cada arquivo, o teste com o mesmo nome em `teste/` mostra o comportamento esperado, inclusive as formas disfarçadas (`bash -c`, encadeamento, `cd` antes).

## Experimentos

Num laboratório (README, seção "Laboratório"), cada experimento mostra um mecanismo funcionando. As saídas de referência estão em [`docs/video/apresentacao/demo/saidas/`](../video/apresentacao/demo/saidas/), gravadas pelo `capturar.sh` da mesma pasta em 13/11/2026. Hashes de commit e a contagem de arquivos do núcleo mudam a cada execução e a cada versão.

1. **Isolamento.** Abra duas frentes com sessões diferentes (`AH_SESSAO=ana tools/ah open carrinho`, `AH_SESSAO=carla tools/ah open cupom`) e mande ao gancho, em nome de `carla`, uma edição no worktree de `ana`. Esperado: recusa T4 com a saída (`09-t4.txt`).
2. **Checkout comum.** Mande ao gancho `git add -A` no checkout principal (`11-t2.txt`) e depois `git add src/total.js`. Compare.
3. **Publicação.** Mande `git push origin dev:main` (`10-t5.txt`). Depois, escreva o mesmo push de três formas disfarçadas (`bash -c`, `cd` antes, encadeado com `&&`) e confira se a T5 continua recusando.
4. **Passagem de bastão.** Faça `ana` passar a frente com `ah handoff --nota`, e `carla` tentar retomá-la tendo outra frente aberta (`12-handoff-ana.txt`, `13-open-carla-recusa.txt`).
5. **Sessão morta.** Abra uma frente com `AH_PID_AGENTE` apontando para um `sleep 900 &`, mate o `sleep` e assuma a frente com `ah takeover <nome> --confirmado` a partir de outra sessão.
6. **Limite.** Escreva um comando que a T4 deixa passar e explique por quê, usando a seção "Limites" da referência.

## Como foi construído

O harness reproduz, de forma replicável e explicável, uma estrutura que o autor usou num projeto real (mais de 280 unidades de trabalho abertas e fechadas em um mês). A construção seguiu o mesmo roteiro em cada etapa:

1. **Desenho.** Conversa com o autor registrada no [desenho do núcleo](../superpowers/specs/2026-11-12-nucleo-design.md), com cada decisão marcada como do autor ou do desenho, e com as [notas para o método](../superpowers/specs/2026-11-12-notas-para-o-metodo.md).
2. **Sondagem.** Antes de escrever trava, verificar o que cada agente permite interceptar ([capacidades por agente](../referencia/capacidades-por-agente.md)).
3. **Fatias.** Cada fatia com plano próprio, terminada utilizável e com teste, antes da seguinte ([histórico das fatias](historico-das-fatias.md)).
4. **Testes primeiro.** Cada comportamento com teste visto falhando antes do conserto, sobre repositórios descartáveis e um `gh` falso.
5. **Revisão independente.** O ramo pronto passa por revisão de quem não o construiu antes do merge na `dev`. Os achados são consertados com teste que falhava antes e ficam registrados nos planos (por exemplo, as revisões da fatia 5b e as seções "Terceira revisão" dos registros de execução).
6. **Pendências registradas.** O que não cabia na fatia foi para um arquivo de pendências e depois para um plano próprio, em linhas de trabalho paralelas.
7. **Ensaio real.** Comportamento conferido com o Claude Code de verdade (`claude -p` num projeto descartável) e o guia de extensão seguido por um agente sem contexto ([ensaios](../referencia/)).

Os planos e os registros de execução, em ordem:

| Documento | Conteúdo |
|---|---|
| [`2026-11-12-nucleo-fatias-0-e-1.md`](../superpowers/plans/2026-11-12-nucleo-fatias-0-e-1.md) e [pendências](../superpowers/plans/2026-11-12-nucleo-fatias-0-e-1-pendencias.md) | Sondagem e uma sessão |
| [`2026-11-13-nucleo-fatia-2.md`](../superpowers/plans/2026-11-13-nucleo-fatia-2.md) e [pendências](../superpowers/plans/2026-11-13-nucleo-fatia-2-pendencias.md) | Várias sessões |
| [`2026-11-13-nucleo-fatia-3.md`](../superpowers/plans/2026-11-13-nucleo-fatia-3.md) | Trabalho pesado |
| [`2026-11-13-nucleo-fatia-5.md`](../superpowers/plans/2026-11-13-nucleo-fatia-5.md) | Atualização do harness instalado |
| [`2026-11-13-nucleo-fatia-5b.md`](../superpowers/plans/2026-11-13-nucleo-fatia-5b.md) | Extensões, dependências e números |
| [`2026-11-13-pendencias.md`](../superpowers/plans/2026-11-13-pendencias.md) | Plano das pendências das fatias 0 a 5 |
| Registros [A](../superpowers/plans/2026-11-13-pendencias-execucao-a.md), [B](../superpowers/plans/2026-11-13-pendencias-execucao-b.md) e [C](../superpowers/plans/2026-11-13-pendencias-execucao-c.md) | Execução de cada linha e a terceira revisão |

A fatia 4 (outros agentes) não tem plano próprio: a seção 15 do desenho trocou os adaptadores do Codex e do OpenCode pelo roteiro em `docs/agentes/`.

Números da `dev` em 26/11/2026: 217 commits entre 12 e 13/11/2026, cerca de 11,7 mil linhas no núcleo e 12,3 mil nos testes, 983 testes.
