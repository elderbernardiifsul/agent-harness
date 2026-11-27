---
name: orquestrar
description: Use quando pedirem para orquestrar, tocar a fila de tickets, distribuir trabalho entre subagentes e sessões, integrar PRs de fora ou retomar uma orquestração parada.
---

# Orquestrar

A sessão orquestradora escolhe o trabalho pronto, distribui a quem executa (subagentes desta sessão ou outras sessões), confere cada entrega com evidência, integra na base e relata. Ela não executa as tarefas, não decide o que é do humano e não publica sem ordem dele.

Cada passo abaixo diz o **resultado** que precisa existir ao fim dele. Os comandos `tools/ah` dão os dados; a forma de chegar ao resultado é sua. O que depende do agente em que você roda (subagente, mensagem, lista de sessões, espera) está na tabela "Como fazer em cada agente", no fim.

O harness sugere e registra; só as travas recusam. Uma recusa de trava é sinal para decidir, nunca para contornar: leia o motivo, siga o "Faça" ou leve a decisão ao humano.

## 1. Começar

Dados: `tools/ah papel orquestrador`, `tools/ah board`, `tools/ah sweep`, o `git status` do checkout principal e as sessões visíveis.

Resultado:

- esta sessão tem o papel de orquestradora;
- você sabe quais frentes estão abertas, de quem, e o que o `sweep` achou fora do lugar; cada achado foi resolvido pelo "Faça" dele ou virou linha no ticket de decisões;
- o checkout principal está na base e sem alteração solta;
- existe um ticket de decisões desta orquestração ("Decisões da orquestração <data>: <assunto>"), novo ou retomado. Toda pergunta ao humano vai para lá com a decisão padrão que você aplicou, e o trabalho segue com o padrão. O humano responde por exceção: silêncio é o padrão.

## 2. Escolher

Dados: `tools/ah candidatos`, que lista os tickets livres (sem bloqueio pendente, sem frente), com o rótulo de pronto e sem a marca de decisão pendente; e, em "Fora", cada outro ticket aberto com o motivo.

Resultado: para cada candidato, uma decisão sua, entra agora ou não entra.

- Não entra o que depende de ação do humano (publicar, credencial, custo, decisão de desenho) nem o que mexeria nos mesmos arquivos de uma frente aberta (o `tools/ah board` mostra as sobreposições). Cada um vira linha no ticket de decisões, com o motivo.
- Ticket que parece pronto e está em "Fora" (sem o rótulo, com a marca) não muda de rótulo por conta sua: vira linha no ticket de decisões.
- Nenhum candidato entra: vá ao passo 7.

## 3. Distribuir

Uma frente por ticket ou plano: `tools/ah open <nome> --tickets <n>` (com `--plano <arquivo>` quando houver plano).

- **Subagente.** Abra a frente nesta sessão e dê ao subagente o caminho do worktree da frente e o texto de quem executa (passo 4). O modelo vem de `tools/ah modelo <nível>`, com o nível que o plano marca na tarefa (`Nível: alto|medio|leve`); sem marca, `medio`.
- **Sessão ociosa.** Uma sessão viva no `tools/ah board` e sem trabalho em andamento: `tools/ah open <nome> --tickets <n> --para <sessão>` e a mensagem de atribuição, com o texto de quem executa. Sessão nova quem abre é o humano: peça no ticket de decisões.

Resultado: cada frente tem dona (esta sessão ou a sessão ociosa), e quem executa recebeu o texto inteiro, com a frente, o worktree e os tickets ou o plano.

## 4. Instruir quem executa

O texto fixo está em `executor.md`, ao lado desta skill. Copie-o inteiro e preencha os campos. Não resuma: cada linha evita um erro conhecido (sair do worktree, `git add` de tudo, merge por conta própria, decisão do humano tomada sem registro).

Resultado: quem executa recebeu o texto sem cortes, com os campos preenchidos.

## 5. Acompanhar

As entregas chegam sozinhas (o fim de um subagente, a mensagem de uma sessão). Entre uma e outra, espere sem consultar em laço.

A cada entrega, confira com evidência antes de aceitar: os commits no ramo da frente (`git log <base>..<ramo>`), os testes rodados por você no worktree, o `tools/ah board` e, quando for o caso, um revisor novo. "Pronto" sem comando e saída não é entrega.

Resultado: cada frente está num destes estados, com a evidência anotada:

- em execução;
- entregue e conferida;
- devolvida a quem executa, com o que falta;
- travada: passada com `tools/ah handoff <nome>` (com a nota do que falta) e, se falta decisão, linha no ticket de decisões.

## 6. Fechar cada frente

Na ordem, para cada frente entregue e conferida:

1. **Revisão.** `tools/ah pede-revisao <ramo>`. Se pede, um revisor novo, sem o contexto de quem executou, revisa o diff; os achados se corrigem na frente antes de seguir.
2. **Reintegração.** A base mesclada no worktree da frente (`git merge <base>` lá), com os testes de novo. Com a extensão `migracao` ligada e migração na frente: `tools/ah migracao renumerar --frente <nome>`.
3. **Registros.** Com a extensão `registros` ligada: `tools/ah registros guardar --frente <nome>`, que leva o diário da execução por subagentes para o ticket antes de o worktree sumir.
4. **Prova.** Com a extensão `prova` ligada: `tools/ah prova <rótulo> --frente <nome>`, no estado reintegrado.
5. **Merge.** `git merge --no-ff <ramo>` na base, no checkout principal. Com a prova: `tools/ah prova --confere <base>`. Código 0: a árvore é a provada, e o teste não se repete. Código 3: outra coisa entrou no meio, e o teste roda na base.
6. **Fechamento.** `tools/ah close <nome>` no checkout principal, e o ticket fechado com o commit do merge como evidência.

Resultado: a base tem o merge; os testes da base passam, com o comando e a saída anotados para o relatório; a frente saiu do quadro; o ticket está fechado com o commit.

## 7. Encerrar

- **PRs de fora** (de quem não usa o harness): cada lote é uma frente própria (`tools/ah open integrar-prs-<data>`), com revisão por PR e o passo 6 inteiro.
- **Publicar** (levar a base adiante, deploy, push de ramo protegido): só com ordem explícita do humano nesta orquestração. Sem a ordem, o relatório diz o que a publicação levaria.
- **Parar** quando nada mais passa no passo 2 ou o humano manda: as frentes ativas fechadas ou passadas (`tools/ah handoff <nome>`), e `tools/ah papel executor`.

Resultado: o relatório, como comentário no ticket de decisões. Se passa de uma tela, também num arquivo do projeto: proponha `docs/orquestracao/<data>-<assunto>.md`, e o humano confirma. O relatório tem:

- **Entrou:** por frente, os tickets, o commit do merge e a verificação (comando e resultado);
- **Ficou:** o que está em ramo ou em frente passada, e por quê;
- **Tickets novos:** o número e o motivo de cada um;
- **Espera o humano:** as linhas do ticket de decisões ainda sem resposta.

## Como fazer em cada agente

| Preciso de | Claude Code | Outro agente |
|---|---|---|
| Subagente numa frente | ferramenta `Agent`, com o caminho do worktree e o texto de `executor.md` no prompt e o `model` de `tools/ah modelo <nível>`; sem isolamento próprio, porque o worktree é o da frente | ache o equivalente; sem subagente, execute uma frente por vez nesta sessão |
| Mensagem a outra sessão | `SendMessage`, com o nome da sessão | ache o equivalente; sem mensagem entre sessões, distribua só a subagentes |
| Lista de sessões | `ListAgents` (ociosa ali e viva no `tools/ah board`) | o que o agente oferecer; sem lista, só subagentes |
| Esperar entre entregas | as notificações de subagente e de sessão chegam sozinhas; para acordar de tempos em tempos, `/loop` ou `ScheduleWakeup`, de 20 a 30 minutos | o que o agente oferecer; sem isso, espere a próxima entrega |
