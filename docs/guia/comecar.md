# Como começar

Para o aprendiz que vai usar o agent-harness e o método de trabalho, e para o agente que ele usa. O harness cuida das frentes: cada sessão de agente trabalha num ramo e num worktree próprios, e as travas impedem uma sessão de atropelar a outra. O método diz como trabalhar dentro de cada frente: que trilha seguir e qual skill cuida de cada etapa. Tudo se pede ao agente; você não precisa decorar comando nenhum.

Os exemplos são de uma loja: Ana Souza mantém o código, e Carla é a cliente que pede as mudanças. Os números de ticket são inventados.

## 1. Instalar

Abra o agente na pasta do projeto (nova ou existente) e diga:

> Instale o agent-harness daqui: https://github.com/elderbernardiifsul/agent-harness, para eu usar com o Claude Code e o Codex.

Troque os agentes pelos que você usa. O agente segue a seção "Instalar num projeto (instruções para o agente)" do README do agent-harness; este guia não repete os passos.

O que o agente vai perguntar antes de agir:

- a origem e o commit do harness que vai executar;
- o seu "sim" para criar o repositório no GitHub, quando o projeto é novo;
- os agentes que você usa (as skills vão para a pasta de cada um).

Deu certo quando os commits que ele indicou foram feitos e o `tools/ah doctor` termina sem falha, com cada aviso explicado por ele.

## 2. A primeira sessão

Abra uma sessão nova no projeto. Nela, o agente deve:

- ler o `AGENTS.md` (o `CLAUDE.md` aponta para ele);
- rodar `tools/ah doctor`;
- a cada pedido, escolher a trilha pelo `docs/agents/metodo.md` e dizê-la em uma linha antes de começar;
- abrir a frente (`tools/ah open`) antes de mudar código;
- num pedido sem ticket, ou grande demais para um ticket, dizer que skill de triagem você deve chamar e por quê: `triage`, `to-tickets` e `wayfinder` só o humano chama (no Claude Code, `/triage`, `/to-tickets` e `/wayfinder`; no Codex, o equivalente dele, se houver): o agente diz qual chamar e por quê, e segue depois que o humano chamar.

Para testar se ele entendeu, sem deixar que execute nada:

> Leia o AGENTS.md e me diga que trilha você usaria para corrigir o arredondamento do frete, sem executar.

## 3. Um exemplo por trilha

Cada exemplo traz o pedido, o que dizer ao agente, a sequência de skills e comandos e o que fica escrito no fim.

### Um commit: o frete arredondado errado

- **Pedido.** Carla avisa que o frete de R$ 12,345 aparece como R$ 12,34 (ticket 12).
- **O que dizer.** "Corrija o ticket 12."
- **Sequência.** `tools/ah open frete-arredondado --tickets 12` → `systematic-debugging` (achar a causa antes de mexer) → `test-driven-development` (o teste que falha e o conserto) → `verification-before-completion` (comando e saída no ticket) → commit → merge na base → `tools/ah close`.
- **Fica escrito.** Um commit com o teste de regressão, o comando e a saída no ticket e uma linha no histórico das frentes.

### Plano de partida: cupom de desconto

- **Pedido.** Carla quer cupons no carrinho; o desenho do sistema não muda (ticket 15).
- **O que dizer.** "Planeje o ticket 15." Depois, numa sessão nova, cole a linha de partida que está no topo do plano.
- **Sequência.** `tools/ah open cupom --tickets 15` → `writing-plans` (cada tarefa com `Nível: …` e a linha de partida no topo) → commit do plano e `tools/ah handoff` → na sessão nova, a linha de partida: `tools/ah open cupom` e "execute o plano <arquivo do plano>" → `subagent-driven-development` com `test-driven-development` (com a extensão modelo ligada, `tools/ah modelo medio` diz o modelo de cada subagente) → `requesting-code-review` → `verification-before-completion` → `tools/ah registros guardar` → merge na base → `tools/ah close`.
- **Fica escrito.** O plano, os commits de cada tarefa, o diário da execução no ticket e a linha do histórico.

### Spec e plano: pagamento parcelado

- **Pedido.** Carla quer pagamento parcelado; muda o contrato com o meio de pagamento e o dado do pedido (ticket 20).
- **O que dizer.** "Vamos desenhar o parcelamento do ticket 20."
- **Sequência.** `tools/ah open parcelado --tickets 20` → `brainstorming`, com `grilling` (as decisões vão para o ticket; silêncio vale o padrão) e `domain-modeling` ("parcela" entra no `GLOSSARY.md`, a decisão vira ADR em `docs/adr/`) → spec → `writing-plans` → o resto como no cupom (`tools/ah handoff`, a linha de partida na sessão nova), até o merge e o `tools/ah close`.
- **Fica escrito.** A spec, o glossário, o ADR, o plano e os commits.

### Investigação longa: vender também num marketplace

- **Pedido.** Ana não sabe se vale vender num marketplace, nem em qual.
- **O que dizer.** "Investigue se vale vender num marketplace; não escreva código ainda." O agente vai pedir que você chame o `wayfinder` (no Claude Code, `/wayfinder`), porque essa skill só o humano chama.
- **Sequência.** `wayfinder` (um mapa de tickets de decisão) → `research` (relatório no repositório, com as fontes, numa frente aberta antes do relatório: `tools/ah open marketplace --tickets <n>`) → `prototype` (protótipo descartável da integração, para responder uma pergunta de desenho) → `grilling` com Ana nas decisões. O relatório entra na base pelo merge e `tools/ah close`; os tickets que saem voltam à escolha da trilha.
- **Fica escrito.** O mapa, o relatório em `docs/research/` e os tickets.

## 4. Ligar as extensões opcionais

Diga ao agente: "ligue a extensão <nome>". Ele a acrescenta em extensoes, no `.harness/config.json`, roda `tools/ah metodo instalar` (que instala as skills dela, quando ela tem), faz o commit indicado e roda `tools/ah doctor`. Quando ligada:

- **wiki**: base de conhecimento do projeto com evidência conferida, e a ingestão de reunião; `tools/ah wiki conferir`.
- **orquestracao**: distribuir tickets entre subagentes e sessões; `tools/ah candidatos`.
- **ambiente**: banco e portas por worktree, criados e apagados com a frente.
- **migracao**: número de migração sem choque entre frentes; `tools/ah migracao reservar`.
- **prova**: não repetir o teste ponta a ponta quando a árvore não mudou; `tools/ah prova <rótulo>`.

O que cada uma faz e quando usar está também no `docs/agents/metodo.md`, seção "Extensões opcionais". Se a extensão não existe na sua versão do harness, o `tools/ah doctor` diz que ela não carregou; a referência de cada uma está em `.harness/nucleo/docs/referencia/comandos.md`.

## 5. Quando algo falha

Primeiro, `tools/ah doctor`: cada aviso e cada falha traz o "Faça". Cada recusa do harness diz o motivo e o próximo passo; siga-o.

- **Skill mudada à mão ou ausente:** `tools/ah metodo instalar`; o `--forcar` descarta a mudança, então use só sabendo o que vai perder.
- **O agente não acha uma skill:** confira a pasta do agente (`.claude/skills/` no Claude Code, `.agents/skills/` no Codex e no OpenCode) e peça a skill `preparar-projeto`, que repara a instalação.
- **O `tools/ah close` recusa item ignorado:** é o diário da execução por subagentes; `tools/ah registros guardar` e o `tools/ah close` de novo.
- **Uma trava recusou um comando:** o motivo está na recusa; as travas estão em `docs/agents/sessoes-paralelas.md`.

Para ler mais: `docs/agents/metodo.md`, `docs/agents/sessoes-paralelas.md` e `.harness/nucleo/docs/referencia/comandos.md`.
