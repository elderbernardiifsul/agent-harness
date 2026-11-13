# Vários agentes no mesmo repositório

Material de apoio · Programação Agêntica · IFSul · professor elderbernardi · aulas de 13/11/2026 e seguinte.

Leia antes ou depois da aula. Em cada questão há um quadro **Pare e proponha**: antes de ler a balança e a solução, escreva a sua proposta (três linhas bastam). Se você ler a solução primeiro, perde o exercício.

A solução apresentada em cada questão, o `agent-harness`, é **uma** alternativa entre várias: a que o professor escolheu para o projeto dele. Ela entra como mais uma linha da balança, para comparar com a sua.

Os exemplos usam um projeto fictício, a `loja` (repositório `exemplo/loja`), e duas pessoas fictícias, `ana-souza` e `carla-dias`.

## Sumário

1. O mínimo de git e GitHub para acompanhar (e o vocabulário do agente)
2. O problema, contado como história
3. As questões (13), cada uma com: situação, pare e proponha, balança, quanto custa não resolver, o que o harness faz, como aplicar, limites, trabalho final
4. Uma alternativa inteira: o agent-harness, da visão geral ao primeiro ciclo
5. Para quem usa OpenCode ou Codex
6. Como isto ajuda no trabalho final: decisões do harness × cenários
7. Exercícios
8. Gabarito comentado
9. Glossário

Estado do harness descrito aqui: conferido no código com as fatias 3 e 4 prontas (referência em `docs/referencia/comandos.md` no clone). Fatia 3: a fila de trabalho pesado (`pesado`) e a trava T6, sem ensaio com agente real nem em Windows ou macOS. Fatia 4: o roteiro de adaptação para outros agentes (`docs/agentes/`), com testes de contrato, não ensaiado com o Codex nem com o OpenCode; só o Claude Code tem adaptador. Fatia 5: a atualização do harness instalado (`tools/ah atualizar --de <clone>`), pronta, não ensaiada com agente real. Peças marcadas **em construção** estão só no desenho: os números de uso (`board --numeros`), da fatia 5. Para conferir o que existe na sua cópia: `tools/ah --help`.

---

## 1. O mínimo de git e GitHub para acompanhar

Se você nunca trabalhou com ramo e pull request, leia esta seção com calma. O resto do material depende dela.

### Uma pessoa só, do ticket ao merge

Ana mantém a `loja`. Os passos dela para consertar um defeito:

```
 ticket #1        ramo                 commits          PR            revisão + CI        merge
 "total errado" → conserta-total  →  2 commits   →  #5 para main →  Carla aprova,   →  main recebe
                  (a partir da main)                                testes passam       o conserto
```

1. **Ticket (issue).** Uma tarefa registrada no GitHub, com número: o #1 diz "o total do carrinho está errado". Serve para ninguém esquecer e para conversar sobre a tarefa.
2. **Repositório.** A pasta do projeto com todo o histórico de mudanças. Existe uma cópia na máquina de Ana e outra no GitHub, chamada **remoto** (por convenção, `origin`).
3. **Ramo (branch).** Uma linha de trabalho separada. A `main` é o ramo principal; Ana cria `conserta-total` a partir dela para mexer sem afetar a `main`:
   ```
   git switch -c conserta-total
   ```
4. **Commit.** Uma fotografia das mudanças, com uma mensagem. Ana escolhe os arquivos (`git add src/total.js`) e grava (`git commit -m "conserta a soma do total"`).
5. **Push.** Enviar os commits para o remoto: `git push origin conserta-total`.
6. **Pull request (PR).** Um pedido, no GitHub, para juntar o ramo `conserta-total` na `main`. O PR mostra a diferença e recebe comentários.
7. **Revisão.** Outra pessoa (Carla) lê a diferença e aprova ou pede mudança.
8. **CI (integração contínua).** Um serviço que roda os testes automaticamente em cada PR. Se falhar, o PR mostra um X vermelho.
9. **Merge.** Juntar o ramo na `main`. Depois disso, o conserto faz parte do projeto.

### Conflito de merge

No mesmo dia, Carla, em outro ramo, mudou a mesma linha de `src/total.js`. Quando o segundo PR vai ser mesclado, o git não sabe qual das duas versões vale e para:

```
<<<<<<< HEAD
export const total = itens => itens.reduce((s, i) => s + i.preco * i.qtd, 0);
=======
export const total = itens => itens.reduce((s, i) => s + i.preco, 0) - desconto;
>>>>>>> cupom
```

Alguém precisa ler as duas, decidir e gravar. Isso é um **conflito de merge**. Ele não é erro de ninguém; é o custo de duas pessoas mexerem no mesmo lugar.

### Ramos de integração e de produção

Em muitos projetos, a `main` é o que está publicado (**produção**: o que os clientes usam). Para não publicar a cada merge, cria-se um ramo de **integração**, onde os trabalhos se juntam primeiro (aqui, `dev`), e às vezes um de **teste** (`stage`). O caminho fica: ramo do trabalho → `dev` → `stage` → `main`. Publicar é levar a `dev` para `stage` ou `main`.

### Pasta de trabalho (checkout)

A pasta onde os arquivos aparecem e você edita. Numa pasta, só um ramo está em uso por vez: `git switch outro-ramo` troca os arquivos da pasta inteira. Guarde isto: é a raiz de metade dos problemas deste material.

### O agente e a conversa

- **Agente de código.** Programa que usa um modelo de linguagem para ler, editar e rodar comandos no projeto (Claude Code, OpenCode, Codex).
- **Conversa (sessão).** Um terminal com o agente aberto, do primeiro pedido até fechar. Ana pode ter três ao mesmo tempo.
- **Contexto.** O que o agente consegue ler de uma vez: os pedidos, as respostas, os arquivos abertos. Ele enche.
- **Limpar e compactar.** Quando o contexto enche, a pessoa limpa a conversa (começa do zero, no mesmo terminal) ou a compacta (o agente troca a conversa por um resumo dela). As duas coisas fazem o agente esquecer detalhes.
- **Ferramenta.** Cada ação que o agente executa: rodar um comando, editar um arquivo.
- **Processo.** O programa rodando no computador, com um número dado pelo sistema. O agente aberto num terminal é um processo.

---

## 2. O problema, contado como história

Ana descobriu que pode abrir três terminais e deixar um agente de código trabalhando em cada um: um no carrinho, um no cupom, um no frete. Os três estão na mesma pasta da `loja`.

- O agente do cupom termina e grava "tudo o que mudou" num commit. Leva junto o `src/total.js` que o agente do carrinho estava editando pela metade.
- O agente do frete troca de ramo para conferir uma coisa. Os outros dois continuam editando, agora no ramo errado, sem saber.
- Ana limpa a conversa do carrinho porque ela encheu. O agente novo não sabe que existia um carrinho.
- Carla, em casa, pega o mesmo ticket do frete. Às 11h, há duas metades de solução.
- Às 18h, a sessão do cupom trava. No dia seguinte, ninguém sabe o que ficou feito.

Nenhum desses problemas é de um agente sozinho. Eles aparecem porque há **vários atores escrevendo no mesmo lugar ao mesmo tempo**: várias conversas do mesmo agente, a mesma conversa antes e depois de limpar, agentes diferentes, pessoas diferentes em máquinas diferentes, e um agente e uma pessoa na mesma pasta. É o que acontece em qualquer sistema concorrente: escrita no mesmo lugar, disputa por um recurso, estado compartilhado que se corrompe, alguém que morre segurando uma tarefa, mensagem que não chega.

Por que "escrever um prompt melhor" não resolve:

1. Uma instrução não vê o que os outros estão fazendo. "Não mexa no trabalho da outra conversa" só funciona se o agente souber onde está esse trabalho e se a outra conversa está viva.
2. Disputa não se resolve com cuidado. Duas pessoas que conferem "ninguém pegou" no mesmo segundo veem as duas que está livre.
3. Instrução falha em silêncio. O agente esquece, interpreta, ou usa uma forma que ninguém escreveu.
4. Parte do problema nem passa pelo agente: o comando que a pessoa digita no terminal.

**Relato do autor do harness** (projeto real e privado, números não verificáveis aqui): mais de 280 frentes de trabalho em um mês; 15% dos commits eram só atualização de um arquivo de "quem faz o quê"; cada sessão gastava cerca de 16 mil tokens para lê-lo; builds e testes simultâneos esgotaram a memória e o sistema matou editor, sessões e banco.

---

## 3. As questões

Formato de cada uma: **situação**, **pare e proponha**, **balança** (custo de adotar × custo de não ter), **não resolver custa**, **o que o harness faz** (uma alternativa, comparada com as da balança), **como aplicar**, **limites** e **trabalho final**.

Na balança, "custo de adotar" é o que a alternativa cobra (tempo, código, infraestrutura, disciplina); "custo de não ter" é o estrago quando ela falta; "—" quer dizer nada além do que as outras linhas já dizem. "Não resolver custa" é o preço de deixar o problema como está.

### Questão 1. Quem é esta sessão?

**Situação.** Ana pede "comece o carrinho", trabalha uma hora e limpa a conversa. A conversa nova não sabe do carrinho e começa a editar no mesmo lugar. Em outro terminal, uma conversa de ontem é retomada e acha que o carrinho ainda é dela.

> **Pare e proponha.** Como o agente saberia, depois de limpar a conversa, qual é o trabalho dele? E se duas conversas disserem "o carrinho é meu", quem decide? Escreva a sua proposta antes de seguir.

**Balança.**

| Alternativa | Custo de adotar | Custo de não ter | Quando basta |
|---|---|---|---|
| Nenhuma identidade: o agente pergunta à pessoa | zero | depois de limpar, o trabalho fica sem dono; duas conversas assumem a mesma coisa | uma pessoa, uma conversa |
| O agente anota num arquivo do repositório | escrever o arquivo | o arquivo vira disputa (questão 3) | — |
| Id da conversa que o agente fornece | ler o id | limpar gera id novo e o trabalho fica órfão | conversas que não se limpam |
| Id mais vínculo de continuação | conferir processo e hora de início | — | várias conversas por dia |
| Nome escolhido pela pessoa no terminal | disciplina | — | uso à mão |

**Não resolver custa:** trabalho sem dono depois de cada limpeza, ou com dois donos; retrabalho.

**O que o harness faz.** Fica perto de "id da conversa mais vínculo": um nome por conversa que não depende da pessoa lembrar. Paga com isto: na dúvida, solta um trabalho que era da conversa.

- **Sessão** é a conversa de um agente, identificada pelo id que o agente fornece. No Claude Code, o agente entrega esse id ao harness a cada ação (e o deixa na variável `CLAUDE_CODE_SESSION_ID`). Num agente que o harness ainda não sabe ler, `AH_SESSAO=<nome>` diz quem é. **Pronto.**
- **Frente** é um trabalho com nome (o carrinho), um ID curto (`as-1`) e, como se verá na questão 2, um lugar próprio. Cada sessão tem no máximo uma frente.
- `tools/ah whoami` responde:
  ```
  $ tools/ah whoami
  Sessão 7f3a9c21 (executor) · frente: as-1 carrinho
  ```
- **Herança:** a conversa limpa, compactada ou retomada herda a frente só quando o agente informa que é continuação **e** há vínculo (o mesmo processo, com a hora de início conferida, para não confundir com outro programa que recebeu o mesmo número). Na dúvida, não herda; o resumo diz que a frente está sem dona e como retomá-la. **Pronto.**
- **Papéis:** *executor* (uma frente por vez, o padrão) e *orquestrador* (pode ter várias e abrir frente para outra sessão): `tools/ah papel orquestrador`. O *executivo* é o humano que decide. **Pronto.**
- **Resumo no começo da sessão**, com até 1200 caracteres, injetado no contexto do agente:
  ```
  Sessão 7f3a9c21 (executor) no harness.
  Sua frente: nenhuma: `ah open <nome>` para abrir uma.
  Outras frentes: as-2 cupom (dona carla-te)
  Base dev: checkout principal limpo.
  Regras: …
  Mais: docs/agents/sessoes-paralelas.md · tools/ah board
  ```
  (A linha de regras foi cortada aqui porque antecipa as questões 2 e 5.)

**Como aplicar.** No Claude Code, o `init` configura o agente (em `.claude/settings.json`) para avisar o harness quando uma conversa começa e antes de cada ação. À mão, use o mesmo nome em todos os comandos: `AH_SESSAO=ana-terminal tools/ah open carrinho` e `AH_SESSAO=ana-terminal tools/ah close`.

**Limites.** No Windows, e no macOS sem `ps`, não há herança por processo: a frente fica sem dona e pede `ah open`. A variável do id vaza para agentes abertos de dentro de outro. Uma sessão parada há mais de 120 min parece morta (questão 6). No `/clear`, a herança falhou no primeiro ensaio com o agente real; foi consertada e conferida no agente real (questão 12 conta a história).

**Trabalho final.** Cenário 5: o harness decidiu guardar fora do agente só quem a sessão é e qual o trabalho dela, e injetar isso num resumo curto. É memória ou só estado? Enunciado §4: o modelo da sessão só é gravado quando o agente informa, e o Claude Code informa às vezes.

### Questão 2. Cada um no seu lugar?

**Situação.** Três agentes na mesma pasta. O do carrinho edita `src/total.js`; o do cupom roda `git add -A` (adiciona tudo o que mudou) e leva junto o arquivo pela metade; o do frete roda `git switch main` para conferir uma coisa, e os outros dois passam a editar o ramo errado.

> **Pare e proponha.** Três pessoas mexem nos mesmos arquivos, na mesma pasta, ao mesmo tempo. Como vocês organizariam para uma não estragar o trabalho da outra? Quanto custa a sua proposta, e onde ela quebra?

**Balança.**

| Alternativa | Custo de adotar | Custo de não ter | Quando basta |
|---|---|---|---|
| Todos na mesma pasta, combinando | zero | a situação acima | uma sessão por vez |
| Uma cópia (clone) do repositório por sessão | disco; juntar pelo remoto | — | máquinas diferentes |
| Um ramo por trabalho, cada um na sua pasta (worktree) | criar e limpar pastas; instalar dependências em cada uma | — | várias sessões numa máquina |
| Trava por arquivo | bloqueia trabalho legítimo; trava esquecida | — | arquivos que não aceitam merge |
| Contêiner por sessão | infraestrutura | — | quando também se quer isolar por segurança |

**Não resolver custa:** commit que leva junto o trabalho pela metade de outro; horas de trabalho no ramo errado, difíceis de rastrear.

**O que o harness faz.** Junta "uma cópia por sessão" com "um ramo por trabalho", sem copiar o histórico. Paga com isto: uma pasta a mais por trabalho, com a sua cópia das dependências, e o conflito fica todo para o merge.

- `tools/ah open carrinho` cria o ramo `feat/carrinho` a partir da `dev` e um **worktree** próprio: uma segunda pasta de trabalho do mesmo repositório, com o seu ramo, fora da pasta do projeto. **Pronto.**
  ```
  $ tools/ah open carrinho
  Frente as-1 carrinho aberta.
  Trabalhe em: /home/ana/.cache/agent-harness/loja/wt/carrinho
  ```
- A pasta principal (o *checkout principal*) é de todos e serve para integrar. O que impede alguém de estragar a pasta principal ou a pasta do outro é assunto da questão 5: proponha lá antes de ler.
- Executor com frente ativa não abre outra:
  ```
  Recusado: Esta sessão já tem a frente carrinho.
  Faça: continue nela ou, antes de abrir outra, encerre com ah close carrinho (o orquestrador abre várias: ah papel orquestrador)
  ```
- No worktree da própria frente, a sessão é livre.

**Como aplicar.** O agente trabalha e commita no worktree. Para integrar, na pasta principal, na `dev`: `git merge --no-ff feat/carrinho`.

**Limites.** A separação por pasta não impede ninguém de entrar na pasta do outro; a questão 5 diz o que impede. Cada worktree tem a própria cópia de tudo (dependências, configuração local). Banco e portas por worktree ficam fora do núcleo.

**Trabalho final.** Cenário 3: a hipótese "cada um com o seu agente acelera o começo e complica a integração" pode ser medida contando onde os conflitos apareceram. O worktree reduz o atropelo durante o trabalho e concentra o conflito no merge.

### Questão 3. Quem faz o quê: onde anotar?

**Situação.** O grupo cria `QUADRO.md` no repositório. Cada agente escreve "estou no carrinho" ao começar. Uma semana depois, metade dos commits é atualização do quadro, os merges dão conflito nele e cada agente lê o arquivo inteiro antes de trabalhar.

> **Pare e proponha.** Onde vocês anotariam quem está fazendo o quê, de modo que todos vejam, ninguém brigue pelo papel e o agente não gaste meia conversa lendo? O que outra máquina precisa saber?

**Balança.**

| Alternativa | Custo de adotar | Custo de não ter | Quando basta |
|---|---|---|---|
| Arquivo no repositório | zero de infraestrutura | commits e conflitos só de quadro; tokens para ler | uma pessoa, poucos dias |
| Grupo de mensagens ou planilha | zero | o agente não vê | pessoas, sem agentes |
| Estado por máquina, fora do git, com resumo curto | código para gravar sem corromper | — | várias sessões numa máquina |
| Tickets e comentários no GitHub entre máquinas | rede, API externa | trabalho duplicado | várias pessoas |
| Servidor de coordenação | infraestrutura | — | times grandes |

**Não resolver custa:** ninguém sabe quem faz o quê; cada um pergunta, ou adivinha.

**O que o harness faz.** Junta "arquivo" (só que fora do git) com "tickets entre máquinas", um para cada alcance. Paga com isto: outra máquina não vê o quadro desta.

- **Estado por máquina, fora do git** (no Linux, em `~/.local/state/agent-harness/<projeto>`; `AH_ESTADO` troca). Um arquivo JSON por sessão e por frente. Cada um é gravado primeiro num arquivo temporário e depois trocado de nome de uma vez, para nunca ficar pela metade; só uma sessão escreve por vez (exclusão mútua). Um `eventos.jsonl` guarda, numa linha por evento, o que aconteceu, e só cresce. **Pronto.**
- **No git, só o histórico:** uma linha por frente fechada em `docs/agents/historico-das-frentes.md`, commitada pelo `close`. **Pronto.**
- **Quadro:**
  ```
  $ tools/ah board
  ID    NOME      DONA      ESTADO  TICKETS  SOBREPÕE  PLANO  ÚLTIMA NOTA
  as-1  carrinho  ana-term  ativa   #1       —         —      mexendo no total
  Sessões vivas: ana-term (executor, carrinho)
  ```
  `tools/ah nota "mexendo no total"` deixa o recado da última coluna. Estados possíveis: `ativa`, `órfã` (dona morta), `passada`, `abrindo`. **Pronto.**
- **ID curto por pessoa** (`as-1`, a sigla de `ana-souza` e um número), para não colidir no histórico entre máquinas. **Pronto.**

**Limites.** Outra máquina não vê o quadro desta; o canal entre máquinas é o comentário no ticket. Quem trabalha sem ticket fica invisível para os outros.

**Trabalho final.** Enunciado §4: o registro da disciplina é histórico (vai para o git, com data); o "quem faz o quê agora" do grupo não precisa ir. Cenário 3: "o que o `AGENTS.md` compartilhado virou".

### Questão 4. Duas pessoas, o mesmo ticket

**Situação.** Ana e Carla, cada uma em casa, olham os tickets às 9h e pegam o #2, "frete grátis acima de 200". Às 11h, há duas metades de solução.

> **Pare e proponha.** Como evitar que duas pessoas peguem a mesma tarefa? Se as duas pegarem no mesmo segundo, quem fica com ela, e o que a outra faz? E se quem pegou sumir?

**Balança.**

| Alternativa | Custo de adotar | Custo de não ter | Quando basta |
|---|---|---|---|
| Combinar no chat | zero | trabalho duplicado | duas pessoas que conversam o tempo todo |
| Pôr o nome no ticket à mão | um clique | esquece-se de pôr e de tirar | times pequenos |
| Reserva automática no ticket, com regra de desempate | código; rede obrigatória | — | várias pessoas e sessões |
| Trava num servidor próprio | serviço próprio | — | quando duplicar custa muito |

**Não resolver custa:** duas metades de solução; a manhã de uma das duas jogada fora.

**O que o harness faz.** Fica perto de "nome no ticket", feito pelo programa, com "quem chegar primeiro" decidido pelo relógio do servidor, não pelo de cada máquina. Paga com isto: rede obrigatória, e o GitHub vira o banco de coordenação.

- `tools/ah open frete --tickets 2` reserva **antes** de criar ramo ou pasta: põe a pessoa como responsável no ticket, o rótulo (etiqueta colorida do ticket) `em-andamento` e um comentário cuja última linha é um marcador que o programa lê:
  ```
  <!-- ah:frente id=as-3 nome=frete ramo=feat/frete estado=ativa login=ana-souza ... v=1 -->
  ```
  O último marcador de uma frente diz o estado dela no ticket. **Pronto.**
- **Ticket já reservado:**
  ```
  Recusado: Não reservei os tickets: o ticket #2 já está reservado pela frente cd-4 (frete), de @carla-dias.
  Faça: combine com @carla-dias, dona da frente cd-4, ou escolha outro ticket; se a reserva ficou velha, peça a quem a fez para rodar ah close ou ah handoff
  ```
- **Corrida:** a reserva é um aviso, não uma trava atômica. Se duas aberturas passarem juntas, cada uma relê o ticket depois de comentar; vence a frente cujo comentário é o mais antigo **no servidor** (o número do comentário no GitHub, não o relógio de cada máquina). A outra comenta a desistência, sai de responsável e não cria nada. Com vários tickets, fica só quem é a primeira em todos; se cada uma for a primeira em um, as duas desistem e é preciso abrir de novo. Nunca ficam as duas. **Pronto.**
- **Sem rede**, `open` com `--tickets` recusa ("tente de novo com rede, ou abra sem --tickets (sem reserva)").
- `close` tira responsável e rótulo e comenta o fechamento; não fecha o ticket, porque fechar é ato de quem integra.

**Como aplicar.** Precisa do `gh` instalado e com login (`tools/ah doctor` confere).

**Limites.** Depender do GitHub como banco de coordenação funciona para poucas pessoas. Uma corrida real foi achada na revisão da construção: frente A pedia #1 e #2, frente B pedia #2 e #1, e as duas desistiam. O código de hoje aceita esse caso: prefere que as duas desistam a deixar as duas com o mesmo ticket. Garantir um vencedor pediria uma ordem única entre todos os tickets (exercício 6).

**Trabalho final.** Cenário 3: quantas vezes o grupo duplicou trabalho. Enunciado §3: no estudo, duas pessoas na mesma tarefa de jeitos diferentes é um dado; o que é defeito no trabalho de produção pode ser método no experimento.

### Questão 5. Uma regra escrita basta?

**Situação.** O arquivo de instruções diz "nunca envie para a `main`". No meio de uma tarefa longa, o agente roda `git push origin main` "para publicar a correção". Outra vez, roda `git checkout main && git push`; ninguém tinha escrito essa forma.

> **Pare e proponha.** Escreva uma regra que deveria ser *proibida de verdade* e uma que basta *recomendar*. Se o mecanismo que proíbe quebrar, ele deve deixar passar ou bloquear tudo? Deve existir um jeito de furar em emergência? Quem autoriza?

**Balança.**

| Alternativa | Custo de adotar | Custo de não ter | Quando basta |
|---|---|---|---|
| Só instrução (`AGENTS.md`, skill) | escrever bem | falha em silêncio | estilo e método |
| Lista de comandos permitidos do agente | configurar por agente; casar texto | — | comandos inteiros e fáceis de reconhecer |
| Gancho antes da ferramenta, que lê o comando | escrever e manter um leitor de shell; falso positivo e negativo | — | regras que dependem de estado (qual ramo, de quem é a pasta) |
| Proteção de ramo no servidor | conta que permita; publicar vira PR | envio direto para produção | ramos publicados |
| Caixa de areia (contêiner, usuário sem permissão) | infraestrutura | — | quando o risco é ataque, não engano |

**Não resolver custa:** um envio para produção que ninguém revisou, descoberto depois.

**O que o harness faz.** Junta "gancho que lê o comando" com "proteção de ramo no servidor": a trava local avisa antes e diz a saída; a barreira de verdade fica no servidor. Paga com isto: a trava lê texto, e sempre há forma que escapa.

- **Gancho** é um programa que o agente chama antes de executar uma ferramenta. O do harness lê o comando como o terminal leria (entende comandos encadeados com `&&` e `;`, comandos dentro de comandos, como `bash -c "…"`, e troca de pasta com `cd`) e devolve "permite" ou "recusa, com motivo e próximo passo". **Pronto.**
- **Trava** é uma regra do gancho que recusa. As do harness:

| Trava | Recusa | Estado |
|---|---|---|
| T0 | comando que menciona git ou gh e não pode ser lido; nome de comando vindo de variável; gancho que não consegue avaliar | pronto |
| T1 | trocar o ramo da pasta principal | pronto |
| T2 | `git add` de tudo e `commit -a` na pasta principal | pronto |
| T3 | descartar trabalho na pasta principal (`reset --hard`, `clean -f`, `stash`, `rebase`) | pronto |
| T4 | escrever no worktree ou no ramo da frente de outra sessão viva, por comando ou por edição de arquivo | pronto |
| T5 | push para ramo protegido em qualquer forma; `gh pr merge` com base protegida | pronto |
| T6 | trabalho pesado fora da fila, quando o projeto configura classes (questão 8) | pronto |

- **De volta à questão 2:** T1, T2 e T3 guardam a pasta principal; T4 guarda a pasta e o ramo da frente de outra sessão viva (pasta de frente passada, órfã ou de dona morta não é protegida: aí vale o `takeover`). T1 e T3 valem só na pasta principal: no worktree da própria frente, `rebase`, `stash` e `reset` são livres.
- **Gancho que quebra recusa.** Mesmo quebrado, deixa passar uma chamada a `tools/ah` (para rodar o `doctor`) e a edição de `.harness/config.json`.
- **Desvio de emergência:** `AH_GUARD=off` no começo do próprio comando, só com ordem do executivo, libera T1 a T6 naquele comando e fica registrado. Nunca libera a T0. Na edição de arquivo (T4) não há liberação: o caminho é pedir à dona ou o `takeover`.
- **A barreira de verdade fica no servidor:** o `init` configura proteção de ramo no GitHub para `stage` e `main`. As travas locais avisam antes e dão a saída certa; não substituem a proteção.
- **Regra geral:** o harness sugere e registra; só recusa o que protege o trabalho dos outros e a máquina. Método (fazer plano, escrever teste antes) nunca é motivo de recusa.

**Como aplicar.** Dá para ver a trava sem agente, entregando ao gancho o evento que o Claude Code mandaria:

```
$ echo '{"session_id":"abc","hook_event_name":"PreToolUse","cwd":"'"$PWD"'","tool_name":"Bash","tool_input":{"command":"git add -A"}}' | tools/ah gancho claude-code
Recusado (T2): git add com tudo (-A, ., -u, *, a raiz) no checkout principal leva junto o trabalho de outras frentes
Faça: git add <caminhos> com só os arquivos que você mudou (e git commit sem -a), ou trabalhe no worktree da frente
$ echo $?
2
```

Com `"command":"git push origin dev:main"` (a forma que ninguém tinha escrito na instrução):

```
Recusado (T5): push para o ramo protegido main
Faça: abra um PR para main e peça a ordem do executivo; para publicar o seu trabalho, empurre o ramo da frente (git push origin <ramo>)
```

Com `"command":"git switch main"` (e também `git checkout main && git push`, que a T1 recusa já na troca de ramo):

```
Recusado (T1): trocar o ramo do checkout principal muda o chão das outras sessões
Faça: trabalhe no worktree de uma frente (tools/ah open <nome>); o checkout principal fica em dev
```

Com `"command":"git reset --hard"`:

```
Recusado (T3): git reset --hard no checkout principal descarta ou esconde trabalho que pode ser de outra sessão
Faça: faça isso no worktree da sua frente; no checkout principal, guarde por caminho (git add <caminhos> e git commit) ou combine com a dona das mudanças
```

A sessão `carla-terminal` tentando editar (`"tool_name":"Edit"`) um arquivo na pasta da frente da Ana, com a sessão da Ana viva:

```
Recusado (T4): <worktrees>/carrinho/src/total.js está no worktree da frente as-1 carrinho, da sessão ana-term, que está viva
Faça: escreva só no worktree da sua frente; para mexer em carrinho, peça à sessão ana-term (ah handoff) ou, se ela morrer, ah takeover carrinho
```

Com `"command":"G=git; $G push"`:

```
Recusado (T0): o nome do comando vem de uma variável e o texto menciona git ou gh
Faça: escreva o comando por extenso, sem variável, crase nem aspas abertas (git push origin <ramo>)
```

No ensaio com o Claude Code de verdade, o agente recebeu as recusas com o motivo literal e não tentou contornar.

**Limites, ditos com honestidade.**

> **As travas pegam engano, não má-fé.** Elas leem o texto do comando antes de ele rodar; não acompanham o que um programa faz por conta própria. Passam, mesmo na pasta de outra sessão viva: `python -c "…"`, `find <pasta> -delete`, `… | xargs rm`, `rsync`, um script ou um `npm` que escreve arquivo. Na pasta principal, passam `find . | xargs git add`, apelidos do git e `gh api …/merge`. A lista completa está em `docs/referencia/comandos.md`, seção "Limites".
>
> Na balança: **resolver** de verdade pede caixa de areia (contêiner, usuário sem permissão), que custa infraestrutura e atrapalha o trabalho normal. **Não resolver** custa pouco enquanto o risco é o agente se enganar, e muito se o risco é alguém (ou uma skill de terceiros) agindo de má-fé. Por isso a barreira de verdade fica no servidor.

Há também recusa demais: a T1 recusa `git switch main && git pull && git switch dev`, mesmo voltando para a `dev` no fim. `AH_GUARD=off` é acordo de confiança: o agente pode digitar o prefixo sem ordem; o registro é a contrapartida. Proteção de ramo não existe em repositório privado de conta gratuita do GitHub. No Windows nativo as travas de comando não valem (use WSL2).

**Trabalho final.** Cenário 9: transformar um método em código dentro de um harness. O harness traçou uma fronteira (proteger o trabalho alheio vira trava; método fica recomendação). Vocês podem adotá-la ou contestá-la. Cenário 1: `AH_GUARD=off` é aprovação humana antes da ação, mas só para a exceção. Cenário 4: a lista de formas que escapam é um catálogo de falso negativo.

### Questão 6. A sessão que morre no meio

**Situação.** A sessão de Ana trava às 16h com o carrinho pela metade. No dia seguinte, o quadro ainda diz "carrinho: Ana, ativa". Carla quer continuar. Ana, no notebook, quer retomar o que deixou no computador do laboratório.

> **Pare e proponha.** Como saber que uma sessão morreu, e não está só pensando há 40 minutos? Escreva o bilhete que você deixaria para quem continuar o seu trabalho. Quem pode tirar um trabalho de uma sessão?

**Balança.**

| Alternativa | Custo de adotar | Custo de não ter | Quando basta |
|---|---|---|---|
| Esperar a pessoa | zero | "em andamento" para sempre | uma pessoa |
| Prazo automático sem sinal | escolher o prazo; sessão lenta parece morta | — | sessões curtas |
| Tomada explícita, com confirmação humana | um passo e uma decisão | — | várias sessões |
| Passagem planejada (envia o ramo, escreve o estado no ticket) | disciplina de rodar antes de parar | quem retoma não acha nada | várias pessoas e máquinas |

**Não resolver custa:** trabalho parado e sem dono; quem continua começa do zero.

**O que o harness faz.** Junta três linhas: prazo (sinal de vida), passagem planejada (`handoff`) e tomada só com confirmação humana (`takeover`). Paga com isto: uma sessão morta parece viva por até duas horas.

- **Sessão viva:** o processo registrado existe **e** o sinal de vida (um arquivo tocado pelos ganchos) tem menos de 120 min (configurável em `sessoes.prazoDoSinalMin`). Frente ativa com dona morta aparece como `órfã` no quadro. **Pronto.**
- **Passagem de bastão:**
  ```
  $ tools/ah handoff --nota "falta validar a data"
  Frente as-2 cupom passada.
  Para retomar: tools/ah open cupom
  ```
  Exige worktree limpo (senão recusa e manda fazer um commit `wip:`), envia o ramo, comenta no ticket a passagem (nota, últimos commits, plano, comando para retomar) e deixa a frente `passada`, sem dona, com a reserva mantida. Sem remoto, avisa: "só esta máquina retoma a frente". **Pronto.**
- **Retomar é o próprio `open`:**
  ```
  $ tools/ah open cupom
  Frente as-2 cupom retomada.
  Trabalhe em: /home/carla/.cache/agent-harness/loja/wt/cupom
  ```
  Na mesma máquina, pelo estado local; em outra, pelo ramo no remoto e pela passagem no ticket, que reconstrói a frente com o mesmo ID. O GitHub confere que ninguém retomou antes. **Pronto.**
- `open <nome> --para <sessão>`: o orquestrador abre frente para outra sessão viva. **Pronto.**
- `close <nome>` de frente cuja dona já encerrou é aceito, com as mesmas conferências. **Pronto.**
- `takeover <nome>`: toma a frente ativa cuja dona morreu. Sem `--confirmado`, mostra a dona, o motivo e a idade do sinal e recusa, pedindo a confirmação do executivo; com `--confirmado`, assume. **Pronto.** O `--confirmado` é um acordo de confiança: o gancho não tem como perguntar a um humano, e o agente pode passar a opção sozinho; o registro em `eventos.jsonl` é a contrapartida.
- `sweep [--reparar] [--json]`: lista o que está fora do lugar no estado desta máquina, sem rede (frente órfã, worktree ou ramo sumido, sessão morta, abertura parada, comentários pendentes, pasta principal fora da base ou suja); `--reparar` conserta só o estado e reenvia os comentários pendentes, nunca apaga pasta nem ramo. Sem nada a apontar: `Nada fora do lugar.` **Pronto.**

**Limites.** Uma sessão morta parece viva por até duas horas, se o processo não sumiu. Frente sem ticket só se retoma na mesma máquina.

**Trabalho final.** Enunciado §4, "onde travou": o comentário de passagem é um formato pronto de registro de parada, que o grupo pode usar à mão. Cenário 3: combinem antes quem pode assumir o trabalho de quem sumiu.

### Questão 7. Dois trabalhos no mesmo arquivo

**Situação.** A frente do carrinho e a do cupom mexem em `src/total.js`. Ninguém sabe até o merge, e uma delas refaz meia tarde.

> **Pare e proponha.** Duas frentes no mesmo arquivo é erro, risco ou normal? Avisar antes basta? Quem lê o aviso, a pessoa ou o agente?

**Balança.**

| Alternativa | Custo de adotar | Custo de não ter | Quando basta |
|---|---|---|---|
| Resolver no merge | zero | retrabalho descoberto tarde | partes distantes do código |
| Aviso calculado pelo que cada frente já mudou | um `git diff` por frente | — | várias frentes no mesmo módulo |
| Declarar antes o que vai tocar | prever | — | quando prever é fácil |
| Trava por arquivo | bloqueia trabalho legítimo | — | arquivos que não aceitam merge |

**Não resolver custa:** retrabalho descoberto tarde, na hora do merge.

**O que o harness faz.** Fica com "aviso calculado" mais "declarar antes", e rejeita a trava por arquivo. Paga com isto: o aviso não impede nada. Aviso, nunca recusa. A sobreposição é calculada pelo que cada frente ativa já mudou em relação à base (commits do ramo e mudanças não commitadas) e aparece no quadro e no resumo. No `open`, `--caminhos` diz o que a frente nova pretende tocar. **Pronto.**

```
$ tools/ah open cupom --caminhos 'src/**'
Frente as-2 cupom aberta.
Trabalhe em: /home/ana/.cache/agent-harness/loja/wt/cupom
Notas de as-1 carrinho:
  2026-11-13 mexendo no total
Atenção: as-1 carrinho já mudou 1 arquivo(s) de --caminhos: src/total.js

$ tools/ah board
ID    NOME      DONA      ESTADO  TICKETS  SOBREPÕE  PLANO  ÚLTIMA NOTA
as-1  carrinho  ana-term  ativa   —        as-2      —      mexendo no total
as-2  cupom     carla-te  ativa   —        as-1      —      —
Sobreposições:
  src/total.js: as-1, as-2
Sessões vivas: ana-term (executor, carrinho); carla-te (executor, cupom)
```

**Limites.** Compara arquivo, não trecho. Só enxerga frentes do estado desta máquina.

**Trabalho final.** Cenário 3: contem os conflitos e anotem se um aviso antes os teria evitado.

### Questão 8. Recurso escasso da máquina

**Situação.** Três sessões rodam a suíte de testes e uma quarta compila. A memória acaba e o sistema mata o editor, as sessões e o banco. Incidente real na construção do próprio harness: a suíte deixou 5471 pastas temporárias e encheu o `/tmp`; o subagente que percebeu rodou com `TMPDIR` apontando para outra pasta e registrou que "teste que falha não limpa".

> **Pare e proponha.** Quem é dono da memória e do disco quando há cinco sessões na máquina? Fila, limite ou "cada um se vira"?

**Balança.**

| Alternativa | Custo de adotar | Custo de não ter | Quando basta |
|---|---|---|---|
| Cada sessão roda o que quiser | zero | máquina derrubada; disco cheio | uma sessão |
| Instrução ("não rode os testes em paralelo") | escrever | o agente esquece; ninguém vê os outros | poucas sessões, comandos leves |
| Fila de trabalho pesado por máquina | código, configuração, espera | — | várias sessões com builds e testes pesados |
| Limite do sistema operacional (cotas, contêiner) | configuração por sistema | — | infraestrutura própria |
| Cada teste apaga o que criou | disciplina em cada teste novo | temporário cheio | sempre |

**Não resolver custa:** editor, sessões e banco mortos de uma vez; trabalho não salvo perdido.

**O que o harness faz.** Fica com a fila por máquina, e deixa a limpeza a cargo de cada teste. Paga com isto: espera, e configuração de quem conhece o projeto.

- `tools/ah pesado -- <comando>` espera a vez numa **fila da máquina** (a mesma para todos os projetos com o harness), roda o comando, repassa a saída e devolve o código dele. **Pronto** (fatia 3; não ensaiado com agente real nem em Windows ou macOS).
- **Vagas e memória são da máquina**, num `config.json` da fila, criado com os padrões na primeira chamada: 2 vagas e 4096 MB livres para um comando rodar ao lado de outro.
- **Classes são do projeto**, em `pesado.classes` no `.harness/config.json`: quais comandos são pesados e quantas vagas pedem. Comando que não casa com nenhuma classe cai na mais restritiva. Um exemplo:
  ```json
  "pesado": {
    "classes": {
      "exclusivo": { "vagas": "todas", "padroes": ["npm test*"] },
      "grande": { "vagas": 1, "padroes": ["npm run build*"] }
    }
  }
  ```
  ```
  $ tools/ah pesado --classe npm run build
  grande (1 vaga(s); casou com um padrão)
  $ tools/ah pesado -- npm test
  ```
- **Ordem estrita de chegada, por senha:** só o primeiro da espera começa; quem pede todas as vagas não é ultrapassado (o custo: um comando leve atrás dele espera, mesmo com vaga). Interrompido, o `pesado` mata a árvore inteira do comando antes de soltar a vaga.
- **T6:** com classes configuradas, o gancho recusa rodar fora da fila um comando que casa com uma delas:
  ```
  Recusado (T6): npm é trabalho pesado (classe exclusivo) e roda fora da fila; vários juntos esgotam a memória da máquina
  Faça: tools/ah pesado -- npm test
  ```
- **Projeto novo nasce com `classes: {}`:** a T6 fica desligada até o grupo configurar. O `init` deixa um `_exemplo` ao lado para copiar.

**Limites.** O incidente não foi de memória, foi de pasta temporária: a fila não o teria evitado. Continue apontando `TMPDIR` para uma pasta própria, e cada teste que cria pasta apaga ao terminar. A T6 lê texto, como as outras travas: `npm run build` dentro de um script passa (ponha o script na classe). Comando digitado no terminal, fora do agente, não passa por gancho; para ir pela fila, use `tools/ah pesado` também à mão.

**Trabalho final.** Enunciado §4: rodar código de terceiros em ambiente descartável também protege disso.

### Questão 9. Rede que cai

**Situação.** Ana fecha a frente sem internet. O `close` precisa comentar no ticket e tirar o rótulo; o GitHub não responde.

> **Pare e proponha.** Uma operação que mexe no estado local e no servidor deve falhar inteira ou fazer o que dá? Mandar o mesmo comentário duas vezes é pior que não mandar?

**Balança.**

| Alternativa | Custo de adotar | Custo de não ter | Quando basta |
|---|---|---|---|
| Recusar tudo sem rede | simples | não se trabalha sem internet | operações que precisam de resposta (reservar) |
| Fazer o local e esquecer o servidor | simples | ticket com estado errado para sempre | nunca |
| Guardar o que falhou e reenviar depois | código da fila; risco de mandar duas vezes | — | comentários que podem esperar |

**Não resolver custa:** o ticket diz "em andamento com Ana" para sempre, e outra pessoa não pega a tarefa.

**O que o harness faz.** Fila de comentários e edições pendentes: falha passageira fica na fila, em ordem, e é reenviada em todo comando `tools/ah`; erro permanente (ticket inexistente) é separado. **Pronto.** A reserva no `open` não vai para a fila: sem rede, recusa, porque reservar exige saber se outro já reservou.

**Limites.** "Pelo menos uma vez" aceita comentário duplicado como mal menor. A distinção entre falha passageira e permanente depende do texto da mensagem do `gh`.

### Questão 10. Um grupo, três agentes

**Situação.** No grupo, uma pessoa usa Claude Code, outra OpenCode, a terceira Codex. A regra "não envie para a `main`" precisa valer para as três.

> **Pare e proponha.** A mesma regra pode valer em três programas que avisam coisas diferentes? Quem escreve a ponte entre cada agente e as regras: quem mantém o harness ou o próprio agente?

**Balança.**

| Alternativa | Custo de adotar | Custo de não ter | Quando basta |
|---|---|---|---|
| Um agente só para o grupo | perde-se a escolha | — | grupo que concorda |
| Núcleo comum e uma ponte fina por agente | escrever e ensaiar cada ponte | regras diferentes por pessoa | grupo misto |
| O próprio agente escreve a ponte, com roteiro e testes | roteiro e testes bons | — | agentes que o mantenedor não usa |
| Só regras no servidor | nada local | aviso tardio, já no envio | complemento sempre |

**Não resolver custa:** a regra vale para uma pessoa do grupo e não para as outras.

**O que o harness faz.** Fica com "núcleo comum e ponte fina", e deixa a ponte dos outros agentes para o próprio agente escrever. Paga com isto: hoje, só o Claude Code tem ponte pronta.

- **Contrato de quatro eventos**: começo de sessão, sinal de vida, antes de ferramenta, fim de sessão. O adaptador de cada agente só traduz. **Pronto.**
- **Adaptador do Claude Code**, ensaiado com o agente real (versão 2.1.319). **Pronto.**
- **Tabela de capacidades** dos três agentes em `docs/referencia/capacidades-por-agente.md`: os três permitem recusar antes de comando e de edição; o OpenCode não tem evento de começo nem de fim de sessão; o Codex só roda ganchos do projeto depois de a pasta e cada gancho serem confiados.
- **Roteiro de adaptação para outros agentes**, em `docs/agentes/` (fatia 4): o contrato, o adaptador do Claude Code comentado como exemplo, o passo a passo e como provar; testes de contrato que todo adaptador precisa passar (`AH_ADAPTADOR=<agente> node --test teste/contrato-adaptadores.test.mjs`); um ponteiro no `AGENTS.md` que o `init` instala; e o item "Adaptador do agente em uso" no `doctor`. **Pronto**, não ensaiado com o Codex nem com o OpenCode.
- **Adaptadores do Codex e do OpenCode não existem, por decisão do autor:** o agente que chega lê o roteiro e escreve o próprio. A seção 5 diz como.

**Trabalho final.** Cenário 9 e cenário 7: escrever o adaptador do OpenCode é estender um harness por dentro, por eventos, com o contrato já definido.

### Questão 11. Custo do método

**Situação.** Para uma mudança de três linhas, o agente escreve especificação, plano de oito tarefas e despacha um subagente e um revisor por tarefa. Em outra frente, sem plano, reescreve metade do módulo e ninguém revisa.

> **Pare e proponha.** Quando plano e revisão compensam? O harness deveria recusar trabalho sem plano?

**Balança.**

| Alternativa | Custo de adotar | Custo de não ter | Quando basta |
|---|---|---|---|
| Pedido direto ao agente, sem método | nenhum | retrabalho; nada para revisar contra | mudanças de um commit |
| Plano de partida curto | escrever o plano | — | a maior parte do trabalho |
| Especificação, plano, subagentes e revisão por tarefa | tempo, tokens, revisão de quem decide | defeitos descobertos tarde | mudança de desenho |
| Várias sessões em paralelo, uma frente cada | atenção de quem coordena; integração | — | trabalho independente e grande |

**Não resolver custa:** ou uma tarde e muitos tokens numa mudança pequena, ou metade do módulo reescrita sem ninguém revisar.

**O que o harness faz.** Nunca recusa por método nem por escolha de modelo. `tools/ah open <nome> --plano docs/plano.md` liga a frente ao plano, que aparece no quadro e no resumo. **Pronto.** Medir custo por frente (`board --numeros`): **em construção** (fatia 5). O próprio harness foi construído em fatias, cada uma utilizável e testada antes da seguinte, com revisão independente por tarefa.

**Trabalho final.** Cenário 6 (especificação quando o pedido muda); enunciado §4 ("horas e gasto com modelos": o harness não mede gasto; registre à mão).

### Questão 12. "Pronto": o que prova?

**Situação.** O agente diz "pronto, todos os testes passam". A pessoa integra. No dia seguinte, outra sessão descobre que duas reservas em ordem cruzada desistem dos dois lados.

> **Pare e proponha.** O que conta como prova de que terminou: a frase do agente, o comando e a saída, a CI? Quem revisa, e com que informação?

**Balança.**

| Alternativa | Custo de adotar | Custo de não ter | Quando basta |
|---|---|---|---|
| Confiar na frase do agente | zero | defeito integrado | nunca |
| Comando e saída colados no PR ou no ticket | colar a saída | "pronto" sem prova | sempre, como mínimo |
| Revisão pelo mesmo agente | barata | ele vê o que já pensou | mudanças pequenas |
| Revisão por outro agente, sem o raciocínio do primeiro | tokens, tempo, consertos | defeitos de desenho e de borda passam | mudanças com corrida, estado, segurança |
| Ensaio com o agente de verdade | credenciais, máquina | contrato errado com o agente | adaptadores e travas |

**Não resolver custa:** defeito integrado, descoberto por outra pessoa no dia seguinte.

**O que o harness faz e o que o método fez.**

- `tools/ah doctor` confere a preparação em 22 itens, mais um ("Adaptador do agente em uso") quando o agente se identifica (Node, git, `gh`, configuração, ganchos, proteção dos ramos, estado, fila de pesado) e ensaia recusas de verdade (uma T5 e uma T1). **Pronto.**
- **Ensaio com o agente de verdade.** Os testes do harness simulam o agente: entregam ao gancho eventos escritos à mão. Todos passavam. No ensaio com o Claude Code de verdade, apareceu um defeito que eles não pegavam: no `/clear`, o agente avisa o **fim** da conversa velha **antes** de avisar o **começo** da nova. O harness tratava todo fim como fim; quando o começo chegava, não havia mais conversa viva para herdar, e a frente ficava órfã. O conserto: um fim por `/clear` ou por retomada não encerra a sessão; ela fica esperando a continuação. O reensaio com o agente real (Claude Code 2.1.319, 13/11) conferiu: o agente mandou o fim com o motivo `clear`, depois o começo com a origem `clear` e um id novo, no mesmo processo, e a conversa nova herdou a frente. E o segundo ensaio achou outro defeito: retomar (`/resume`) uma conversa que já tinha frente deixava o executor com duas frentes, quando a regra é uma só. Lição: **teste simulado prova a lógica; só o ensaio com o agente real prova o que supomos sobre o agente.** (Fonte: `docs/referencia/ensaio-claude-code.md`, seções da fatia 2 e "Reensaio do `/clear`".)
- **O agente afirma o que não fez.** No mesmo reensaio, com um pedido vago, o modelo pequeno não chamou ferramenta nenhuma e respondeu que o `git reset --hard` "descartou" as alterações. Nada tinha rodado. Para ver uma recusa com o agente, peça "rode exatamente este comando: …" e confira no registro do harness (`tools/ah board`, `eventos.jsonl`) que ela aconteceu. É a mesma regra do enunciado §8: vale o que o registro mostra, não o que o agente diz.
- Na construção do harness, cada tarefa passou por revisão independente (outro agente, com o diff e o plano, sem o raciocínio do implementador). Em cinco tarefas seguidas a revisão pediu conserto; o defeito das reservas cruzadas foi achado assim, não pelos testes de quem implementou.
- Teste contra um falso prova o falso: o `gh` falso dos testes aceitava rótulos que o real recusaria.

**Trabalho final.** Enunciado §8: "o trabalho fica insuficiente se o artigo afirma o que o registro não mostra". "Pronto com comando e saída" é a mesma regra, aplicada ao código.

### Questão 13. Fechar o trabalho e publicar

**Situação.** A sessão termina, apaga a pasta do trabalho e o ramo. Um commit não tinha sido integrado; um arquivo de configuração local, ignorado pelo git, sumiu junto. Em outro dia, o agente leva a `dev` para a `main` "para publicar".

> **Pare e proponha.** Escreva três conferências para fazer antes de apagar o lugar de trabalho de alguém. Quem fecha o ticket: quem trabalhou ou quem integrou? Publicar é passo técnico ou decisão?

**Balança.**

| Alternativa | Custo de adotar | Custo de não ter | Quando basta |
|---|---|---|---|
| Apagar a pasta à mão | zero | commits e arquivos locais perdidos | quem sabe exatamente o que tem |
| Um comando que confere antes de apagar | código das conferências; recusas | perda silenciosa | sempre |
| `dev` livre; `stage` e `main` só por PR com ordem | um ramo a mais; PRs | publicação acidental | projetos com publicação |

**Não resolver custa:** trabalho perdido sem ninguém notar; produção recebendo o que ninguém decidiu publicar.

**O que o harness faz.**

```
$ tools/ah close
Recusado: Fechar a frente as-1 carrinho perderia trabalho.
Faça: - commits do ramo feat/carrinho que não estão na dev nem no remoto (1); saída: git merge --no-ff feat/carrinho na dev, ou git push -u origin feat/carrinho
    192774c feat: frete no total

$ git merge --no-ff feat/carrinho
$ tools/ah close --resumo "frete no total"
Frente as-1 carrinho fechada.
Falta: git push origin dev
```

`close` só roda na pasta principal, na base, depois do merge; confere worktree limpo, commits na base ou no remoto e arquivos ignorados (`--descartar-ignorados` aceita perdê-los); libera os tickets; não fecha o ticket; grava a linha do histórico com um commit `docs(frentes): fecha as-1 carrinho`; nunca envia. **Pronto.** `dev` é livre; `stage` e `main` são protegidas e só recebem PR, mesclado com `AH_GUARD=off gh pr merge <n>` por ordem do executivo.

**Limites.** Submódulos não são tratados. Três ramos (`dev`, `stage`, `main`) podem ser peso para um grupo de quatro semanas; os nomes vêm da configuração.

**Trabalho final.** Cenário 3, "quem pode alterar"; enunciado §5: o commit de fechamento é um marco datado no histórico.

---

## 4. Uma alternativa inteira: o agent-harness

### Visão geral

- **O que é.** Um conjunto de comandos (`tools/ah`) e de ganchos do agente, escrito em Node, sem dependências. Foi extraído de um projeto real e privado (relato do autor: mais de 280 frentes abertas e fechadas em um mês; não dá para conferir aqui).
- **O que resolve.** Várias conversas de agente, e várias pessoas, trabalhando no mesmo repositório sem uma estragar o trabalho da outra: questões 1 a 7, 9 e 13. Em parte: questões 10 e 12.
- **Como resolve.** Cada trabalho vira uma frente, com ramo e pasta próprios (questão 2); quem faz o quê fica na máquina, fora do git (questão 3); a reserva vai para o ticket do GitHub, que serve de canal entre máquinas (questão 4); travas avaliadas antes de cada comando do agente recusam o que estraga o trabalho alheio (questão 5); passagem de bastão e tomada com confirmação para quem para ou morre (questão 6).
- **Como aplicar.** `init` no projeto e `doctor` para conferir; o passo a passo está logo abaixo.
- **O que não resolve.** Método e escolha de modelo (nunca recusa por isso; questão 11), medida de horas e gasto, agentes sem adaptador (Codex e OpenCode: o agente escreve o seu pelo roteiro de `docs/agentes/`; questão 10), má-fé (as travas pegam engano; questão 5).
- **A regra do autor.** O harness sugere e registra; só recusa o que protege o trabalho dos outros e a máquina.

Ele é uma das linhas da balança, não a resposta. As propostas que a turma fez em aula continuam valendo como alternativas para o trabalho final (seção 6).

### Do zero ao primeiro ciclo

O ciclo de uma frente:

```
open ──► trabalho no worktree ──► commit ──┬──► handoff ──► (outra sessão) open ──► …
                                           └──► merge na dev ──► close
```

Pré-requisitos: Node 22 ou mais novo, git, `gh` instalado e com login (`gh auth login`), Linux, WSL2 ou macOS. Sem dependências para instalar.

**1. Obter o harness.** Quando estiver publicado:

```
git clone https://github.com/elderbernardiifsul/agent-harness ~/agent-harness
```

**2. Instalar no projeto.** Na pasta da `loja`, abra o agente e peça "prepare meu projeto com o harness, a partir do clone em `~/agent-harness`". Ele roda:

```
$ node ~/agent-harness/nucleo/bin/ah.mjs init
CI criada desligada: defina ci.comandoDeTeste em .harness/config.json e rode ah init de novo
Criei:
  .harness/nucleo/ (48 arquivos)
  .harness/config.json
  .harness/extensoes/.gitkeep
  tools/ah
  tools/ah.cmd
  docs/agents/sessoes-paralelas.md
  docs/agents/historico-das-frentes.md
  AGENTS.md
  .claude/settings.json
  .github/workflows/ah-ci.yml
  ramo dev (local)
  ramo stage (local)
Falta levar o harness para o ramo base dev (as frentes partem dele; fora dele não há tools/ah nem gancho):
  git switch dev
  git add -- .harness tools/ah tools/ah.cmd AGENTS.md docs/agents/sessoes-paralelas.md docs/agents/historico-das-frentes.md .claude/settings.json .github/workflows/ah-ci.yml
  git commit -m "chore: instala o agent-harness"
Depois rode: tools/ah doctor
```

O `AGENTS.md` instalado traz as regras do harness e, para quem não usa o Claude Code, aponta o roteiro de adaptação (`.harness/nucleo/docs/agentes/README.md`).

Sem `gh` com login, passe a sigla: `--sigla as`. Num repositório sem remoto, ou para ensaiar, `--sem-protecao` pula a proteção de ramo no servidor. O `init` não faz commit: rode os três comandos que ele mostra.

**3. Conferir.**

```
$ tools/ah doctor
ok      Node 22 ou mais novo
ok      git presente
ok      Shell POSIX
ok      .harness/config.json válido
ok      Cópia do núcleo (MANIFEST.json)
ok      Núcleo igual ao clone de origem
ok      Arquivos de estado legíveis
ok      Sigla sem choque
ok      gh presente e autenticado
ok      Ramo base e ramos protegidos
ok      Ganchos do Claude Code instalados
ok      Harness no ramo base
ok      Gancho responde
ok      Hora de início do processo
ok      Gancho recusa troca de ramo
ok      Ganchos vigiam a edição
ok      Comentários pendentes
ok      Frentes órfãs
ok      Proteção de stage no servidor
ok      Proteção de main no servidor
aviso   CI com comando de teste: defina ci.comandoDeTeste em .harness/config.json e rode ah init
ok      Frentes com worktree
ok      Fila de pesado
ok      Adaptador do agente em uso (claude-code)
0 falha(s), 1 aviso(s).
```

(São 23 itens. O último só aparece quando um agente se identifica, como aqui, em que o próprio agente rodou o `doctor`; num terminal comum, saem 22. Uma linha de proteção por ramo protegido. Sem `gh`, saem avisos no lugar delas e no da sigla; avisos não mudam o código de saída.)

**4. Abrir a frente.** Dentro do agente, a sessão vem do gancho. À mão, num terminal, diga quem é com `AH_SESSAO`:

```
$ AH_SESSAO=ana-terminal tools/ah open carrinho --tickets 1
Frente as-1 carrinho aberta.
Trabalhe em: /home/ana/.cache/agent-harness/loja/wt/carrinho
```

**5. Trabalhar.** Edite e commite no worktree:

```
$ cd /home/ana/.cache/agent-harness/loja/wt/carrinho
$ git add src/total.js && git commit -m "feat: frete no total"
$ AH_SESSAO=ana-terminal tools/ah nota "mexendo no total"
Nota registrada na frente as-1 carrinho.
```

**6. Ver o quadro.** `tools/ah board` (não exige sessão).

**7a. Parar no meio.** `tools/ah handoff --nota "falta o frete grátis"`. Quem continuar roda `tools/ah open carrinho`.

**7b. Terminar.** Na pasta principal, na `dev`:

```
$ git merge --no-ff feat/carrinho
$ git push origin dev
$ AH_SESSAO=ana-terminal tools/ah close --resumo "frete no total"
Frente as-1 carrinho fechada.
```

**8. Publicar.** PR de `dev` para `stage` ou `main`; o merge é decisão do executivo.

Ajuda: `tools/ah --help` lista os comandos; `tools/ah <comando> --help` mostra o uso. Referência completa: `docs/referencia/comandos.md` no clone.

---

## 5. Para quem usa OpenCode ou Codex

Não há adaptador pronto para OpenCode nem para Codex, por decisão do autor: o agente que chega ao repositório segue um roteiro, escreve o próprio adaptador, roda os testes de contrato e prova com o agente de verdade. O roteiro existe (fatia 4), mas **não foi ensaiado** com o Codex nem com o OpenCode; tratem o resultado como experimento e registrem o que aconteceu.

**Sem adaptador, o que já funciona:** todos os comandos, passando a sessão por variável. No OpenCode, o id da conversa está em `OPENCODE_SESSION_ID`; no Codex, em `CODEX_THREAD_ID`:

```
AH_SESSAO=$OPENCODE_SESSION_ID tools/ah open carrinho
AH_SESSAO=$OPENCODE_SESSION_ID tools/ah whoami
```

O que não funciona sem adaptador: travas automáticas e o resumo no começo da sessão. O `doctor` diz isso no item "Adaptador do agente em uso"; se o agente não for reconhecido, declare-o: `AH_AGENTE=opencode tools/ah doctor`.

**O roteiro oficial**, no clone do agent-harness (e copiado no projeto em `.harness/nucleo/docs/agentes/`):

| Arquivo | Para quê |
|---|---|
| `docs/agentes/README.md` | por onde começar: o que o adaptador faz, onde as coisas moram, quando está pronto |
| `docs/agentes/contrato.md` | os quatro eventos, a recusa, a sessão e o processo, o fim que é continuação |
| `docs/agentes/exemplo-claude-code.md` | o adaptador que existe, comentado, com os eventos reais do ensaio |
| `docs/agentes/escrever-um-adaptador.md` | o passo a passo, e o que fazer quando o agente não tem um dos eventos |
| `docs/agentes/provar.md` | os testes de contrato e o ensaio com o agente de verdade |

O adaptador se escreve **no clone**, não no projeto: o módulo `nucleo/adaptadores/<agente>.mjs` e o arquivo de gancho do agente, que o `init` leva para o projeto. Está pronto quando `AH_ADAPTADOR=<agente> node --test teste/contrato-adaptadores.test.mjs` passa, a suíte inteira continua passando, o ensaio com o agente de verdade recusou as ações proibidas e o que o agente não entrega está declarado.

**O pedido, para dar ao agente.** Num repositório descartável com o harness instalado:

> Leia `.harness/nucleo/docs/agentes/README.md` e siga o roteiro até o fim, no clone do agent-harness. Confira o formato do nosso agente na documentação oficial dele, não só na tabela de capacidades. Antes de escrever código, diga o que falta para o nosso agente ter as travas. No fim, prove com o agente de verdade, num repositório descartável sem remoto: peça "rode exatamente: `git push origin main`" e mostre a recusa e a linha no `eventos.jsonl`. Não use `AH_GUARD=off`. Registre cada passo com o comando e a saída.

**O que já se sabe e o roteiro detalha** (de `docs/referencia/capacidades-por-agente.md`, tirado da documentação; nada disso foi ensaiado com o harness):

- **OpenCode:** não há gancho por comando externo; é um plugin em `.opencode/plugins/`, e a recusa é uma exceção no gancho `execute.before`. Não há evento de começo nem de fim de sessão: o resumo do começo não tem onde entrar do mesmo jeito.
- **Codex:** `PreToolUse` parecido com o do Claude Code, mas a edição chega como `apply_patch`, com o caminho dentro do texto do patch; e os ganchos do projeto só rodam depois de a pasta e cada gancho serem confiados (`/hooks`). Sem isso, são ignorados em silêncio.

---

## 6. Como isto ajuda no trabalho final: decisões do harness × cenários

Cada linha liga uma decisão tomada no desenho do harness a um dos cenários de `cenarios.md` (ou a uma seção do enunciado) e diz o que o grupo pode aproveitar, adotando a decisão ou contestando-a.

| Decisão do harness | Questão | Cenário ou seção do trabalho final | O que o grupo pode aproveitar |
|---|---|---|---|
| Uma pasta (worktree) e um ramo por frente | 2 | Cenário 3, "Três pessoas, quantos agentes?" | testar a hipótese "acelera o começo e complica a integração" contando onde cada conflito apareceu, durante o trabalho ou no merge |
| A reserva do ticket é aviso, não trava garantida | 4 | Cenário 3, "Três pessoas, quantos agentes?" | decidir se a reserva vale o custo (rede, `gh`) ou se combinar no chat basta para três pessoas, e registrar quantas vezes houve duplicação |
| Não escrever na pasta de quem está vivo; tomar só com confirmação (T4, `takeover`) | 5, 6 | Cenário 3, "Onde aperta": "quem corrige quando o agente de uma pessoa quebra o código de outra" | combinar antes, por escrito, quem pode mexer no trabalho de quem e depois de quanto tempo sem notícia |
| Estado de agora fora do git; no git, só o histórico | 3 | Cenário 3 ("o que o `AGENTS.md` compartilhado virou") e enunciado §4, Registro | separar o registro com data, que vai para o git, do "quem faz o quê agora", que não precisa ir |
| Regra geral: sugere e registra; só recusa o que protege o trabalho dos outros e a máquina | 5, 11 | Cenário 9, "Um plugin para o DSH" | decidir o que do método vira código e o que fica instrução, e justificar a fronteira (por que "não enviar para a main" recusa e "teste antes" não?) |
| Gancho que quebra recusa; toda recusa diz a saída | 5 | Cenário 9, "Um plugin para o DSH" | fazer o plugin falhar alto e dizer o próximo passo em cada recusa |
| Contrato de quatro eventos; o adaptador só traduz | 10 | Cenário 7, "O meu harness", e cenário 9 | usar os quatro eventos como lista mínima do que um harness precisa interceptar; escrever o adaptador do OpenCode como produto |
| Construção em fatias; "uma peça que o aluno não consiga ler e explicar" é fracasso | 11 | Cenário 7, "O meu harness" | montar o harness por partes, cada uma utilizável, e tirar a peça que ninguém do grupo explica |
| Resumo curto no começo da sessão; na dúvida, não herdar | 1 | Cenário 5, "O veterano de bolso" | decidir o que guardar fora do agente e o que deixar esquecer; discutir se o resumo é memória ou só estado |
| Exceção só com ordem humana registrada (`AH_GUARD=off`, `takeover --confirmado`) | 5, 6 | Cenário 1, "O balcão que responde" | comparar "aprovar cada resposta" com "aprovar só a exceção", e registrar quem aprovou |
| Desenho que muda, com seções novas que prevalecem sobre as antigas | 11 | Cenário 6, "Especificação antes do código" | marcar na especificação o que mudou e o que vale agora, ou mostrar que reescrever custa menos |
| A trava lê texto e recusa o ilegível (T0); não é caixa de areia | 5 | Cenário 4, "A portaria das skills" | usar as formas que escapam da trava como exemplos de falso negativo |
| "Pronto" só com comando e saída; revisão independente por tarefa | 12 | Enunciado §8, Evidência e Domínio; §1, "o que eu delego e depois tenho de refazer?" | colar o comando e a saída em cada "pronto"; anotar o que a revisão mandou refazer e por quê |
| Ensaio com o agente real num repositório descartável | 12 | Enunciado §4, cuidados (ambiente descartável) | rodar skills e código de terceiros do mesmo jeito |

Onde a ligação é fraca ou não existe: cenário 2, "O manual que cabe no notebook" (lá a falta de rede e de memória é do produto, não do desenvolvimento); cenário 8, "Será que dá mesmo em uma semana?" (as fatias garantem algo utilizável a cada etapa, mas o harness não registra prazos); cenário 10, "Decisão tipada ou texto?" (nenhuma). Não forcem.

Mesmo sem usar o harness, três hábitos servem a qualquer grupo:

1. **Registro com data.** O enunciado pede registro durante o trabalho, no git. O comentário de passagem de bastão (questão 6) é um bom formato: o que ficou, os últimos commits, o plano, como retomar.
2. **"Pronto" com comando e saída.** É a regra da evidência (enunciado §8) aplicada ao código.
3. **Ambiente descartável.** O ensaio do harness com o agente real foi feito num repositório descartável, sem remoto. Façam o mesmo com skills e código de terceiros (enunciado §4).

O harness não mede horas nem gasto com modelo. Se a pergunta do grupo depende disso, registrem à mão.

---

## 7. Exercícios

Os três primeiros são de nivelamento; façam antes da aula 2. O gabarito está na seção 8.

1. **Ponha em ordem.** Os passos do fluxo de Ana estão embaralhados: merge; revisão; ticket; push; commit; criar ramo; PR; CI. Ordene e diga, em uma frase cada, o que acontece se pular a revisão e se pular a CI.
2. **Provoque um conflito.** Num repositório descartável: crie `total.js` com uma linha e commite na `main`; crie dois ramos, mude a mesma linha de jeitos diferentes em cada um; mescle o primeiro na `main`, depois o segundo. Copie a mensagem do git e resolva.
3. **Duas pastas, um repositório.** No mesmo repositório: `git worktree add ../loja-cupom -b cupom`. Faça um commit em cada pasta. Rode `git worktree list` e `git log --all --oneline`. O que aconteceria se você tentasse `git switch cupom` na pasta principal?
4. **Recusa ou não?** Para cada comando rodado na pasta principal, na `dev`, diga se o harness de hoje recusa e por qual trava: (a) `git add src/total.js`; (b) `git add .`; (c) `git push origin dev`; (d) `git push origin main`; (e) `git switch main`; (f) `git reset --hard`; (g) `git checkout main && git push`; (h) `find . -name '*.js' | xargs git add`.
5. **Ache a brecha.** Escreva duas formas de enviar para a `main` que a T5 talvez não pegue. Para cada uma, diga o que ainda impediria o estrago.
6. **Corrida.** Frente A pede os tickets #1 e #2; frente B pede #2 e #1, ao mesmo tempo. Com a regra "vence o comentário mais antigo", e supondo que A comentou primeiro no #1 e B primeiro no #2, o que acontece? Proponha uma regra que garanta um vencedor.
7. **Sessão viva.** Escreva em pseudocódigo a função "a sessão está viva?". Liste três jeitos de ela errar (dizer viva quando está morta, ou o contrário).
8. **Onde mora.** Classifique como "vai para o git" ou "fica fora": (a) quem está no ticket #2 agora; (b) que a frente as-1 foi fechada em 12/11; (c) a nota "mexendo no total"; (d) a previsão de prazo do grupo, escrita antes da etapa.
9. **Prática (aula 2).** Dê ao OpenCode o roteiro oficial (`docs/agentes/README.md`; o pedido está na seção 5). Registre: o que ele disse que faltava, o que escreveu, quais testes rodou, se a recusa aconteceu com o agente real e o que você precisou corrigir.

---

## 8. Gabarito comentado

**1.** Ticket → criar ramo → commit → push → PR → CI → revisão → merge (CI e revisão podem correr juntas). Sem revisão, ninguém além do autor lê o código antes de entrar; sem CI, os testes dependem de alguém lembrar de rodá-los. Os dois buracos aparecem dobrados com agentes: o autor é o agente, e ele diz que rodou.

**2.** O git para com `CONFLICT (content): Merge conflict in total.js` e marca o arquivo com `<<<<<<<`, `=======` e `>>>>>>>`. Resolver é editar até ficar a versão certa, `git add total.js` e `git commit`. Repare que o conflito só aparece no segundo merge: quem mesclou primeiro não paga nada.

**3.** `git worktree list` mostra as duas pastas, cada uma com o seu ramo; `git log --all` mostra os dois commits, porque é o mesmo repositório. `git switch cupom` na pasta principal é recusado pelo próprio git: o ramo já está em uso em outro worktree. Essa é uma proteção que vem de graça e explica por que um worktree por frente evita "trocar o ramo de quem está trabalhando".

**4.** (a) passa: caminho explícito. (b) T2. (c) passa: `dev` é livre. (d) T5. (e) T1. (f) T3. (g) T1, já na troca de ramo (sem ela, a T5 recusaria o push, porque o gancho acompanha a troca de ramo na mesma linha). (h) passa: limite declarado da T2 (o `xargs` recebe os caminhos em tempo de execução). Lição: (h) mostra a diferença entre "o que a trava promete" e "o que ela consegue ler"; até a véspera da aula, (e) e (f) também passavam. Confiram sempre no código: `tools/ah --help` e `docs/referencia/comandos.md`.

**5.** Exemplos: um script `publicar.sh` que roda `git push origin main` por dentro; `gh api` direto na API de merge; um apelido do git. O que ainda impede é a proteção de ramo no servidor (PR obrigatório), que não lê o comando: olha o que chega. Por isso o harness diz que a barreira de verdade fica no servidor, e que em repositório privado de conta gratuita só a trava local protege.

**6.** Com "vence quem comentou primeiro **em cada ticket**", A vence no #1 e B vence no #2; se cada um desistir quando perde em algum ticket, os dois desistem e ninguém fica com nada. Foi o caso achado na revisão da construção. Uma regra que garante vencedor: uma ordem global (por exemplo, a menor posição de comentário entre todos os tickets, com desempate pelo ID da frente), de modo que as duas máquinas, lendo o mesmo servidor, cheguem à mesma conclusão. O harness de hoje não faz isso: aceita que as duas desistam e abram de novo, porque o erro que ele não admite é as duas ficarem com o mesmo ticket. Discuta: qual dos dois erros custa mais para o seu grupo?

**7.** Um esboço: viva se o processo registrado existe **e** a hora de início dele é a registrada **e** o último sinal tem menos de N minutos. Erros: número de processo reaproveitado por outro programa (diz viva quando está morta, se não conferir a hora de início); sessão parada há mais de N minutos esperando a pessoa (diz morta quando está viva); o processo visto pelo gancho é um shell de vida curta, não o agente (diz morta logo depois de registrar).

**8.** (a) fora: estado de agora, muda o tempo todo (no ticket, sim, como comentário). (b) git: histórico. (c) fora: recado de agora. (d) git, com commit antes da etapa: é a prova pedida pelo enunciado §4.

**9.** Sem gabarito único. Um bom registro diz a versão do OpenCode e do modelo, o que o agente afirmou e o que você conferiu, e se a recusa chegou ao modelo com o motivo. Diga também se os testes de contrato (`AH_ADAPTADOR=<agente> node --test teste/contrato-adaptadores.test.mjs`) passaram. Se o agente disse "pronto" sem mostrar a recusa acontecendo com o agente real, o exercício não terminou.

---

## 9. Glossário

| Termo | O que é |
|---|---|
| **adaptador** | Ponte entre um agente específico e o núcleo do harness: traduz os eventos do agente para o contrato e a resposta de volta. |
| **agente de código** | Programa que usa um modelo de linguagem para ler, editar e executar comandos num projeto (Claude Code, OpenCode, Codex). |
| **base (ramo base)** | O ramo de onde as frentes partem e onde se integram; no harness, `dev` por padrão. |
| **board (quadro)** | A tabela de quem está fazendo o quê agora: `tools/ah board`. |
| **checkout principal** | A pasta original do repositório, onde se integra; as frentes trabalham em worktrees. |
| **CI (integração contínua)** | Serviço que roda os testes automaticamente a cada envio ou PR. |
| **commit** | Fotografia gravada das mudanças, com mensagem, data e autor. |
| **compactar (a conversa)** | Trocar a conversa com o agente por um resumo dela, para caber no contexto. |
| **conflito de merge** | Quando dois ramos mudaram o mesmo trecho e o git não sabe qual vale; alguém decide à mão. |
| **contexto** | O que o agente consegue ler de uma vez: pedidos, respostas, arquivos abertos. Enche. |
| **contrato de eventos** | Os quatro eventos que todo adaptador entrega ao núcleo: começo de sessão, sinal de vida, antes de ferramenta, fim de sessão. |
| **corrida** | Duas ações ao mesmo tempo sobre o mesmo recurso, em que o resultado depende de quem chega primeiro. |
| **executivo** | O humano que decide: autoriza publicar, exceções e tomadas de frente. |
| **executor** | Papel padrão de uma sessão: uma frente por vez. |
| **ferramenta** | Cada ação que o agente executa: rodar um comando, editar um arquivo. |
| **frente** | Uma unidade de trabalho no harness: nome, ID curto (`as-1`), ramo `feat/<nome>`, worktree, dona e tickets. |
| **gancho (hook)** | Programa que o agente chama em certos momentos (antes de rodar um comando, por exemplo); pode recusar a ação. |
| **handoff (passagem de bastão)** | Parar uma frente no meio deixando tudo para outro continuar: ramo enviado, comentário no ticket, frente `passada`. |
| **instrução** | Regra escrita para o agente ler (`AGENTS.md`, skill); ele pode esquecer ou interpretar. |
| **issue** | Ver *ticket*. |
| **main** | Por convenção, o ramo principal; em muitos projetos, o que está publicado (produção). |
| **marcador** | Linha `<!-- ah:… -->` no fim de um comentário de ticket, que o harness lê para saber o estado da frente. |
| **merge** | Juntar um ramo em outro. |
| **orquestrador** | Papel de sessão que distribui trabalho: pode ter várias frentes e abrir frente para outra sessão. |
| **órfã** | Frente ativa cuja sessão dona não está mais viva. |
| **limpar (a conversa)** | Começar a conversa com o agente do zero, no mesmo terminal. |
| **processo** | Um programa rodando no computador, com um número dado pelo sistema. |
| **produção** | O que está publicado e em uso; no fluxo do harness, a `main`. |
| **proteção de ramo** | Regra no servidor (GitHub) que impede enviar direto para um ramo e exige PR. |
| **pull request (PR)** | Pedido, no GitHub, para juntar um ramo em outro, com diferença visível, comentários e revisão. |
| **push** | Enviar commits da máquina para o remoto. |
| **ramo (branch)** | Linha de trabalho separada dentro do repositório. |
| **ramo de integração** | Onde os trabalhos se juntam antes de publicar; aqui, `dev`. |
| **remoto** | A cópia do repositório no servidor (GitHub), por convenção `origin`. |
| **repositório** | O projeto com todo o histórico de mudanças. |
| **rótulo (label)** | Etiqueta colorida de um ticket no GitHub, como `em-andamento`. |
| **pesado (fila de)** | Fila da máquina para builds e testes pesados: `tools/ah pesado -- <comando>` espera a vez e roda; as classes do projeto dizem o que é pesado. |
| **reserva** | Marcar no ticket que uma frente está com ele (responsável, rótulo `em-andamento` e marcador). |
| **resumo da sessão** | Texto curto (até 1200 caracteres) que o harness injeta no começo da conversa: quem é a sessão, a frente dela, as dos outros, as regras. |
| **revisão** | Leitura do código por outra pessoa ou agente antes do merge. |
| **sessão** | Uma conversa de um agente, identificada pelo id que o agente fornece. |
| **sessão viva** | Processo registrado existe e o sinal de vida tem menos de 120 min. |
| **sinal de vida** | Arquivo que os ganchos tocam a cada interação; a data dele diz quando a sessão deu notícia pela última vez. |
| **sobreposição** | Duas frentes ativas que já mudaram o mesmo arquivo; o harness avisa, não recusa. |
| **stage** | Ramo de teste: publica numa versão para conferir antes da produção. |
| **takeover (tomada)** | Assumir a frente ativa de uma sessão que morreu, só com a confirmação do executivo (`--confirmado`). |
| **testes de contrato** | Testes que todo adaptador precisa passar (`AH_ADAPTADOR=<agente> node --test teste/contrato-adaptadores.test.mjs`). |
| **ticket** | Tarefa registrada no rastreador (no GitHub, *issue*), com número. |
| **trava** | Regra do gancho que recusa um comando antes de ele rodar (T0 a T6). |
| **worktree** | Uma pasta de trabalho a mais do mesmo repositório, com o seu próprio ramo em uso; no harness, uma por frente. |
| **`AH_GUARD=off`** | Prefixo de um comando que libera T1 a T6 naquele comando, por ordem do executivo; fica registrado; nunca libera a T0. |
| **`AH_SESSAO`** | Variável que diz ao harness qual é a sessão quando o agente não informa (uso à mão, ou agente sem adaptador). |
