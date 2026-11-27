# Método de trabalho

Como trabalhar dentro de uma frente. As frentes (worktree, ramo, quadro, passagem) são do harness (`tools/ah`) e estão em `docs/agents/sessoes-paralelas.md`. Este documento é para o agente, em toda tarefa, e para o aluno, quando quiser entender por que o agente faz o que faz.

O método sugere; nada nele recusa. Só as travas do harness recusam. Exemplos com a loja, um por trilha: o guia `docs/guia/comecar.md` do repositório do agent-harness (o endereço que o README dele usa; a cópia em cache fica onde a instalação a buscou).

Código inline de uma palavra só, em minúsculas, é nome de skill (como `writing-plans`); comandos e arquivos vêm com barra ou ponto.

## Escolha a trilha

Antes de começar, responda em ordem; a primeira resposta que decide vale:

1. Já se sabe o que fazer? Não → Investigação longa.
2. Muda contrato, dado ou fronteira entre partes (API, esquema, formato de arquivo, quem chama quem)? Sim → Spec e plano.
3. Cabe num commit (um comportamento, sem decisão de desenho)? Sim → Um commit.
4. Senão → Plano de partida.

Na dúvida entre duas, a mais leve: a trilha padrão é a leve. Diga ao humano a trilha escolhida em uma linha antes de começar. Trocar de trilha no meio é normal: diga no ticket por quê. Carregue só as skills da trilha (a linha **Skills:** de cada uma).

### Antes da trilha: triar

- Pedido sem ticket, vago ou de fora: `triage` (sai um ticket com rótulo; os rótulos estão em `docs/agents/triage-labels.md`).
- Spec ou plano grande que precisa virar vários tickets: `to-tickets`.
- **Skills:** `triage`, `to-tickets`.

## As trilhas

Cada trilha diz quando usar, a sequência e as skills que entram.

### Um commit

- Quando: comportamento pequeno, sem decisão de desenho.
- Sequência: `tools/ah open <nome> --tickets <n>` → teste que falha e conserto (`test-driven-development`) → verificação com comando e saída (`verification-before-completion`) → commit → merge na base e `tools/ah close`. Bug: `systematic-debugging` antes do conserto.
- **Skills:** `test-driven-development`, `verification-before-completion`, `systematic-debugging`.

### Plano de partida

- Quando: várias tarefas, desenho que não muda.
- Sequência: plano curto (`writing-plans`), com a linha `Nível: …` em cada tarefa (seção "Nível de modelo") e, no topo, a linha de partida para colar numa sessão nova: `tools/ah open <nome> --tickets <n> --plano <arquivo do plano>`, seguida de "execute o plano" → execução por subagentes (`subagent-driven-development`) ou na própria conversa (`executing-plans`), sempre com `test-driven-development` → revisão (`requesting-code-review`) → verificação → registros (seção "Registros da execução por subagentes") → merge na base e `tools/ah close`.
- **Skills:** `writing-plans`, `subagent-driven-development`, `executing-plans`, `test-driven-development`, `requesting-code-review`, `verification-before-completion`, `systematic-debugging`.

### Spec e plano

- Quando: muda contrato, dado ou fronteira.
- Sequência: desenho com o humano (`brainstorming`); perguntas de decisão por exceção, no ticket (`grilling`; silêncio = padrão); vocabulário e decisões (`domain-modeling`: `GLOSSARY.md` e `docs/adr/`) → spec → a partir do plano, siga o Plano de partida.
- **Skills:** `brainstorming`, `grilling`, `domain-modeling`, `writing-plans`.

### Investigação longa

- Quando: ainda não se sabe o que fazer.
- Sequência: mapa de decisões em tickets (`wayfinder`); leitura de fontes primárias com relatório no repositório (`research`); protótipo descartável para uma pergunta de desenho (`prototype`); decisões com o humano (`grilling`). Sai um mapa e tickets; cada ticket volta a "Escolha a trilha". A frente só abre quando um ticket vira trabalho de código.
- **Skills:** `wayfinder`, `research`, `prototype`, `grilling`.

## Um dono por etapa

| Etapa | Skill | O que fica escrito | Harness |
|---|---|---|---|
| Entender e triar | `triage`, `to-tickets` | Ticket com rótulo | — |
| Investigação longa | `wayfinder`, `research`, `prototype` | Mapa e tickets filhos, `docs/research/` | — |
| Decisão com o humano | `grilling` | Ticket de decisões por exceção (silêncio = padrão) | — |
| Vocabulário e decisões | `domain-modeling` | `GLOSSARY.md`, `docs/adr/` | — |
| Desenho | `brainstorming` | Spec | — |
| Plano | `writing-plans` | Plano com o nível de cada tarefa e a linha de partida | `tools/ah open --tickets --plano` |
| Execução | `subagent-driven-development` (ou `executing-plans`, na conversa) com `test-driven-development` | Commits e diário da execução | Worktree da frente, fila de pesado, `tools/ah registros guardar` (extensão registros) |
| Depuração | `systematic-debugging` | Teste de regressão | — |
| Revisão | `requesting-code-review` | Commit de consertos | — |
| Verificação | `verification-before-completion` | Comando e saída no PR ou no ticket | — |
| Integrar e encerrar | nenhuma; é do harness | Linha do histórico | Merge na base, `tools/ah close` ou `tools/ah handoff` |

Uma etapa, uma skill. As coleções trazem outros TDD e revisores, que não estão instalados de propósito.

## Atritos resolvidos

- Worktree e encerramento de ramo são do harness (`tools/ah`): quando uma skill manda criar worktree ou encerrar o ramo, vale a tabela das skills citadas, no trecho do método do `AGENTS.md`.
- Um TDD só (`test-driven-development`) e um revisor só (`requesting-code-review`).
- "Pronto" exige comando e saída: no ticket ou no PR vão o comando executado e a saída (cortada no que for longo). Sem isso, a tarefa não está pronta, mesmo com o código escrito.
- Nomes com prefixo de coleção: ver o trecho do método no `AGENTS.md`.

## Paralelismo em dois níveis

- **Dentro de uma frente, subagentes** (`subagent-driven-development`): um subagente novo por tarefa e um revisor novo depois de cada uma. Custo: um contexto novo por tarefa e por revisão, com mais tokens e mais tempo de modelo. Ganho: revisão independente. Na conversa (`executing-plans`) é mais barato, sem revisão independente até o fim.
- **Entre frentes, várias sessões**, cada uma na sua frente (`docs/agents/sessoes-paralelas.md`). Custo: o humano acompanha várias sessões, a base muda sob cada frente e o merge pode ter conflito. Use quando os tickets não tocam os mesmos arquivos (`tools/ah board` mostra os arquivos em comum).
- Comece por um nível só. Para distribuir entre frentes, veja a orquestração em "Extensões opcionais".

## Nível de modelo

Cada tarefa do plano traz `Nível: alto`, `Nível: medio` ou `Nível: leve`:

- alto: decisão de desenho, algoritmo que os testes não determinam, peça que protege dados ou trabalho, depuração difícil, ensaio com agente real, revisão final, texto que o humano revisa;
- medio: código com interface e testes dados no plano, integração entre arquivos, tarefa descrita em prosa;
- leve: tarefa com o código inteiro no plano, ajuste mecânico num arquivo, renomeação, texto curto, conferência.

Para saber o modelo e o esforço no seu agente, rode `tools/ah modelo <nível>` (`--agente <nome>` para outro agente, `--json` para máquina; com a extensão modelo ligada). Ao abrir um subagente, passe os dois. A tradução fica na seção modelo do `.harness/config.json`. Tarefa sem nível: use medio. O nível é sugestão: o harness nunca recusa por causa de modelo.

## Registros da execução por subagentes

O `subagent-driven-development` grava o diário de cada plano em `.superpowers/sdd/`, pasta que o git ignora e que some com o worktree; quando a revisão final fica limpa, a própria skill apaga a pasta do plano. Com a extensão registros ligada:

- rode `tools/ah registros guardar` em dois momentos: quando todas as tarefas do plano estiverem concluídas, **antes** de a skill apagar a pasta do plano; e antes do `tools/ah close`. O diário vai para o ticket da frente, com uma cópia nesta máquina;
- para continuar um plano parado, `tools/ah registros devolver` traz o diário mais novo de volta ao worktree (a retomada de uma frente passada já o devolve sozinha);
- esqueceu de guardar: o `tools/ah close` recusa o item ignorado e diz o que rodar. O `tools/ah handoff` leva o diário sozinho.

## Extensões opcionais

Desligadas até o aluno pedir; o agente a liga em extensoes, no `.harness/config.json`, roda `tools/ah metodo instalar` e `tools/ah doctor`. Uma linha por extensão, quando ligada:

- **Wiki e reunião** (extensão wiki): conhecimento espalhado e resposta sem fonte. Skills da extensão wiki: `wiki-ingerir`, `wiki-consultar`, `wiki-conferir`, e `reuniao-ingerir` para levar uma gravação até a wiki (extensão wiki); confira com `tools/ah wiki conferir`.
- **Orquestração** (extensão orquestracao): distribuir tickets entre subagentes e sessões sem perder o fio. Skill da extensão orquestracao: `orquestrar`; a parte determinística é `tools/ah candidatos`.
- **Ambiente** (extensão ambiente): frentes disputando banco e porta; cria e apaga o banco e reserva portas por worktree, no `tools/ah open` e no `tools/ah close`.
- **Migração** (extensão migracao): duas frentes com o mesmo número de migração; `tools/ah migracao reservar`.
- **Prova** (extensão prova): repetir o teste ponta a ponta depois de um merge que não mudou a árvore; `tools/ah prova <rótulo>` grava a árvore testada e `tools/ah prova --confere <ramo>` confere.

## Segredos

- Nunca segredo no repositório: nem no código, nem no teste, nem no plano, nem no ticket.
- Sugestão: um cofre ou gerenciador de segredos, ou variáveis de ambiente num arquivo ignorado pelo git; onde guardar é decisão do projeto.
- Segredo que vazou num commit: troque o segredo; apagar o commit não basta.

## Por que cada etapa existe

- Entender e triar: pedido vago vira trabalho errado; o ticket com rótulo diz o que está pronto para começar.
- Investigação longa: começar a codar sem saber o que fazer gasta sessões; o mapa diz o próximo passo.
- Decisão com o humano: pergunta solta para o trabalho; o ticket de decisões registra o padrão aplicado.
- Vocabulário e decisões: o mesmo nome com dois sentidos; o glossário e o ADR fixam um.
- Desenho: mudança de contrato descoberta no meio do código custa caro; a spec decide antes.
- Plano: a sessão nova não sabe o que a anterior decidiu; o plano leva as decisões e o nível de cada tarefa.
- Execução: código sem teste não prova nada; teste primeiro e commits pequenos.
- Depuração: conserto por tentativa esconde a causa; o teste de regressão a prende.
- Revisão: quem escreveu não vê o próprio erro; um revisor novo vê.
- Verificação: "pronto" sem evidência; comando e saída.
- Integrar e encerrar: ramo e worktree esquecidos; o `tools/ah close` fecha e registra no histórico.
