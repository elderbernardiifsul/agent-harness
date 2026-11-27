# Método de trabalho

Como trabalhar dentro de uma frente. As frentes (worktree, ramo, quadro, passagem) são do harness (`tools/ah`) e estão em `docs/agents/sessoes-paralelas.md`. Este documento é para o agente, em toda tarefa, e para o aluno, quando quiser entender por que o agente faz o que faz.

O método sugere; nada nele recusa. Só as travas do harness recusam. Exemplos com a loja, um por trilha: o guia [Como começar](https://github.com/elderbernardiifsul/agent-harness/blob/main/docs/guia/comecar.md) (na cópia do harness em cache, `<cache>/docs/guia/comecar.md`).

Código inline de uma palavra só, em minúsculas, é nome de skill (como `writing-plans`); comandos e arquivos vêm com barra ou ponto.

## Escolha a trilha

Antes de começar, responda em ordem; a primeira resposta que decide vale:

1. Já se sabe o que fazer? Não → Investigação longa.
2. Muda contrato, dado ou fronteira entre partes (API, esquema, formato de arquivo, quem chama quem)? Sim → Spec e plano.
3. Cabe num commit (um comportamento, sem decisão de desenho)? Sim → Um commit.
4. Senão → Plano de partida.

Na dúvida entre duas, a mais leve: a trilha padrão é a leve. Diga ao humano a trilha escolhida em uma linha antes de começar. Trocar de trilha no meio é normal: diga no ticket por quê. Carregue só as skills da trilha (a linha **Skills:** de cada uma). Antes do primeiro arquivo do projeto (spec, plano, relatório ou código), abra a frente: `tools/ah open <nome> --tickets <n>`.

### Antes da trilha: triar

- Pedido sem ticket, vago ou de fora: `triage` (sai um ticket com rótulo; os rótulos estão em `docs/agents/triage-labels.md`).
- Spec ou plano grande que precisa virar vários tickets: `to-tickets`.
- `triage`, `to-tickets` e `wayfinder` só o humano chama: o agente diz qual chamar e por quê, e segue depois que o humano chamar. No Claude Code, `/triage`, `/to-tickets` e `/wayfinder`; no Codex, a menção `$triage`, `$to-tickets` ou `$wayfinder` no pedido (ou a lista de `/skills`).
- **Skills (o humano chama):** `triage`, `to-tickets`.

## As trilhas

Cada trilha diz quando usar, a sequência e as skills que entram.

### Um commit

- Quando: comportamento pequeno, sem decisão de desenho.
- Sequência: `tools/ah open <nome> --tickets <n>` → teste que falha e conserto (`test-driven-development`) → verificação com comando e saída (`verification-before-completion`) → commit → integre e feche como em `docs/agents/sessoes-paralelas.md`, passos 4 e 5. Bug: `systematic-debugging` antes do conserto.
- **Skills:** `test-driven-development`, `verification-before-completion`, `systematic-debugging`.

### Plano de partida

- Quando: várias tarefas, desenho que não muda.
- Sequência: `tools/ah open <nome> --tickets <n>` → plano curto (`writing-plans`), com a linha `Nível: …` em cada tarefa (seção "Nível de modelo") e, no topo, a linha de partida para uma sessão nova: `tools/ah open <nome>` seguida de "execute o plano <arquivo do plano>" → commit do plano e `tools/ah handoff` nesta sessão; na nova, a linha de partida → execução por subagentes (`subagent-driven-development`) ou na própria conversa (`executing-plans`), sempre com `test-driven-development` → a revisão final, que a skill de execução já faz (com o revisor do `requesting-code-review`) → no lugar do passo em que a skill apaga a pasta do plano, `tools/ah registros guardar` (seção "Registros da execução por subagentes") → verificação → integre e feche como em `docs/agents/sessoes-paralelas.md`, passos 4 e 5.
- O `--plano <arquivo>` do `tools/ah open` só vale quando o plano já está na base; o plano escrito na frente está no worktree que a retomada devolve.
- **Skills:** `writing-plans`, `subagent-driven-development`, `executing-plans`, `test-driven-development`, `requesting-code-review`, `verification-before-completion`, `systematic-debugging`.

### Spec e plano

- Quando: muda contrato, dado ou fronteira.
- Sequência: `tools/ah open <nome> --tickets <n>` → desenho com o humano (`brainstorming`); perguntas de decisão por exceção, no ticket (`grilling`; silêncio = padrão); vocabulário e decisões (`domain-modeling`: `GLOSSARY.md` e `docs/adr/`) → spec → a partir do plano, siga o Plano de partida.
- **Skills:** `brainstorming`, `grilling`, `domain-modeling`, `writing-plans`.

### Investigação longa

- Quando: ainda não se sabe o que fazer.
- Sequência: mapa de decisões em tickets (`wayfinder`, que o humano chama: ver "Antes da trilha"); leitura de fontes primárias com relatório no repositório (`research`); protótipo descartável para uma pergunta de desenho (`prototype`, numa frente própria: ver "Atritos resolvidos"); decisões com o humano (`grilling`). Sai um mapa e tickets; cada ticket volta a "Escolha a trilha". O mapa e os tickets ficam no rastreador, sem frente; o relatório e o protótipo, que são arquivos, pedem a frente antes.
- **Skills:** `wayfinder`, `research`, `prototype`, `grilling`.

## Um dono por etapa

| Etapa | Skill | O que fica escrito | Harness |
|---|---|---|---|
| Entender e triar | `triage`, `to-tickets` | Ticket com rótulo | — |
| Investigação longa | `wayfinder`, `research`, `prototype` | Mapa e tickets filhos, `docs/research/` | — |
| Decisão com o humano | `grilling` | Ticket de decisões por exceção (silêncio = padrão) | — |
| Vocabulário e decisões | `domain-modeling` | `GLOSSARY.md`, `docs/adr/` | — |
| Desenho | `brainstorming` | Spec | — |
| Plano | `writing-plans` | Plano com o nível de cada tarefa e a linha de partida | `tools/ah open --tickets` antes; `tools/ah handoff` e a linha de partida na sessão nova |
| Execução | `subagent-driven-development` (ou `executing-plans`, na conversa) com `test-driven-development` | Commits e diário da execução | Worktree da frente, fila de pesado (`tools/ah pesado`), `tools/ah registros guardar` (extensão registros) |
| Depuração | `systematic-debugging` | Teste de regressão | — |
| Revisão | `requesting-code-review` (na execução, é a revisão final da própria skill) | Commit de consertos | — |
| Verificação | `verification-before-completion` | Comando e saída no PR ou no ticket | — |
| Integrar e encerrar | nenhuma; é do harness | Linha do histórico | `docs/agents/sessoes-paralelas.md`, passos 4 e 5; `tools/ah handoff` para passar a frente |

Uma etapa, uma skill. As coleções trazem outras skills de TDD (teste antes do código) e de revisão, que não estão instaladas de propósito.

## Atritos resolvidos

- Worktree e encerramento de ramo são do harness (`tools/ah`): quando uma skill manda criar worktree ou encerrar o ramo, vale a tabela das skills citadas, no trecho do método do `AGENTS.md`.
- Um TDD só (`test-driven-development`) e um revisor só (`requesting-code-review`).
- O `prototype` pede um ramo descartável, fora da base: o protótipo vai numa frente própria que nunca entra na base. Empurre o ramo dela (`git push -u origin <ramo>`; empurrar o ramo da frente não é publicar, porque os ramos protegidos são stage e main), cite o commit no ticket e, com a resposta registrada, feche com `tools/ah close`; o ramo fica no remoto, fora da base. Sem remoto, a frente do protótipo não fecha: deixe-a passada com `tools/ah handoff`, com uma `tools/ah nota` dizendo que é protótipo encerrado, e cite o commit no ticket ou no plano.
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

Para saber o modelo e o esforço no seu agente, rode `tools/ah modelo <nível>` (`--agente <nome>` para outro agente, `--json` para máquina; com a extensão modelo ligada). Ao abrir um subagente, passe os dois. A tradução fica em `extensoes.modelo.agentes`, no `.harness/config.json`. Tarefa sem nível: trate como `Nível: medio`. O nível é sugestão: o harness nunca recusa por causa de modelo.

## Registros da execução por subagentes

O `subagent-driven-development` e o `executing-plans` gravam o diário de cada plano em `.superpowers/sdd/`, pasta que o git ignora e que some com o worktree. No fim, a própria skill faz a revisão final do ramo, que lê o diário (as decisões `Ruling:` e o que ficou estacionado), e só depois apaga a pasta do plano. Com a extensão registros ligada:

- rode `tools/ah registros guardar` depois da revisão final que a própria skill de execução faz, no lugar do passo em que ela apaga a pasta do plano: o guardar, em vez de apagar, leva o diário para o ticket da frente (com uma cópia nesta máquina) e tira a pasta do worktree. Rode de novo antes do `tools/ah close`;
- para continuar um plano parado, `tools/ah registros devolver` traz o diário mais novo de volta ao worktree (a retomada de uma frente passada já o devolve sozinha);
- esqueceu de guardar: o `tools/ah close` recusa o item ignorado e diz o que rodar. O `tools/ah handoff` leva o diário sozinho.

## Extensões opcionais

Desligadas até o aluno pedir. Para ligar uma depois da instalação: acrescente `extensoes.<nome>` no `.harness/config.json`; rode `tools/ah metodo instalar`, que traz as skills dela; faça o commit que ele indica; rode `tools/ah doctor`. Uma linha por extensão, quando ligada:

- **Wiki e reunião** (extensão wiki): conhecimento espalhado e resposta sem fonte. Skills da extensão wiki: `wiki-ingerir`, `wiki-consultar`, `wiki-conferir`, e `reuniao-ingerir` para levar uma gravação até a wiki (extensão wiki); confira com `tools/ah wiki conferir`.
- **Orquestração** (extensão orquestracao): distribuir tickets entre subagentes e sessões sem perder o fio. Skill da extensão orquestracao: `orquestrar`; a parte determinística é `tools/ah candidatos`.
- **Ambiente** (extensão ambiente): frentes disputando banco e porta; cria e apaga o banco e reserva portas por worktree, no `tools/ah open` e no `tools/ah close`.
- **Migração** (extensão migracao): duas frentes com o mesmo número de migração; `tools/ah migracao reservar`, que precisa da pasta das migrações em `extensoes.migracao.pasta`.
- **Prova** (extensão prova): repetir o teste ponta a ponta depois de um merge que não mudou a árvore; `tools/ah prova <rótulo> -- <comando do teste>` roda o teste e, se ele passa, grava a árvore testada; `tools/ah prova --confere <ramo>` confere.

## Segredos

- Nunca segredo no repositório: nem no código, nem no teste, nem no plano, nem no ticket.
- Sugestão: um cofre ou gerenciador de segredos, ou variáveis de ambiente num arquivo ignorado pelo git; onde guardar é decisão do projeto.
- Segredo que vazou num commit: troque o segredo; apagar o commit não basta.

## Por que cada etapa existe

- Entender e triar: pedido vago vira trabalho errado; o ticket com rótulo diz o que está pronto para começar.
- Investigação longa: começar a codar sem saber o que fazer gasta sessões; o mapa diz o próximo passo.
- Decisão com o humano: uma pergunta sem resposta trava o trabalho; o ticket de decisões registra o padrão aplicado, e o trabalho segue.
- Vocabulário e decisões: o mesmo nome com dois sentidos; o glossário e o ADR (registro de uma decisão de arquitetura) fixam um.
- Desenho: mudança de contrato descoberta no meio do código custa caro; a spec decide antes.
- Plano: a sessão nova não sabe o que a anterior decidiu; o plano leva as decisões e o nível de cada tarefa.
- Execução: código sem teste não prova nada; teste primeiro e commits pequenos.
- Depuração: conserto por tentativa esconde a causa; o teste de regressão a prende.
- Revisão: quem escreveu não vê o próprio erro; um revisor novo vê.
- Verificação: "pronto" sem evidência; comando e saída.
- Integrar e encerrar: ramo e worktree esquecidos; o `tools/ah close` fecha e registra no histórico.
