# Coordenação de vários agentes num mesmo repositório

Material de apoio · Programação Agêntica · IFSul · professor elderbernardi · aulas de 13/11/2026 e seguinte.

O material pode ser lido antes ou depois da aula. Cada questão contém um quadro **Atividade**, que pede uma proposta escrita (três linhas bastam) antes da leitura das alternativas e da solução. A leitura da solução antes da proposta invalida o exercício.

O assunto é o **harness de agentes de código**: o programa e as regras em torno do modelo. Um agente de código é um modelo que trabalha em laço: lê o contexto, pede uma ferramenta (execução de comando, edição de arquivo), recebe o resultado e decide o passo seguinte. O **harness do agente** é o programa que conduz esse laço (Claude Code, Codex, OpenCode): ferramentas, permissões, ganchos, gestão do contexto e leitura das instruções do projeto. O **harness do projeto** é o conjunto de acréscimos da equipe: instruções escritas, comandos próprios, ganchos configurados com as regras do projeto, proteção de ramo e CI no servidor. Com uma sessão, o harness do agente é suficiente. Com várias sessões e várias pessoas no mesmo repositório, surgem os problemas de coordenação tratados neste material, e as respostas cabem ao harness do projeto.

Cada questão apresenta o problema e a sua causa, pede uma proposta, compara alternativas e só então descreve um mecanismo geral, com condição de validade e custo. O repositório `agent-harness` aparece como **exemplo de implementação** desses mecanismos: uma linha adicional da tabela de alternativas, para comparação com a proposta do leitor.

Os exemplos usam um projeto fictício, a `loja` (repositório `exemplo/loja`), e duas pessoas fictícias, `ana-souza` e `carla-dias`.

## Sumário

1. Fundamentos de git e GitHub e vocabulário do agente
2. Problema geral: três sessões no mesmo repositório
3. Questões (13), cada uma com situação, atividade, alternativas e custos, custos e riscos da ausência de solução, solução proposta, exemplo de implementação, aplicação, limites e relação com o trabalho final
4. Visão geral do exemplo (agent-harness) e primeiro ciclo
5. Uso com OpenCode e Codex
6. Trabalho final: decisões do harness × cenários
7. Exercícios
8. Gabarito comentado
9. Glossário

Estado do exemplo: o `agent-harness` descrito aqui foi conferido no código com as fatias 3 a 5 prontas (referência em `docs/referencia/comandos.md` no clone). Fatia 3: fila de trabalho pesado (`pesado`) e trava T6, sem ensaio com agente real nem em Windows ou macOS. Fatia 4: roteiro de adaptação para outros agentes (`docs/agentes/`), com testes de contrato, sem ensaio com o Codex nem com o OpenCode; apenas o Claude Code tem adaptador. Fatia 5 (versão 0.2.0): atualização do harness instalado (`tools/ah atualizar --de <clone>`), sem ensaio com agente real; extensões do projeto em `.harness/extensoes/`, com a extensão `recursos` (portas e bancos por frente) e o guia `docs/extensoes/como-estender.md`, ensaiado por um agente sem contexto; dependências entre tickets (`tools/ah deps`); números de uso (`tools/ah board --numeros`). Para conferir o que existe em cada cópia: `tools/ah --help`.

---

## 1. Fundamentos de git e GitHub

Esta seção é pré-requisito para quem ainda não trabalhou com ramo e pull request; o restante do material depende dela.

### Fluxo de trabalho individual: do ticket ao merge

Ana mantém a `loja`. Passos para a correção de um defeito:

```
 ticket #1        ramo                 commits          PR            revisão + CI        merge
 "total errado" → conserta-total  →  2 commits   →  #5 para main →  Carla aprova,   →  main recebe
                  (a partir da main)                                testes passam       o conserto
```

1. **Ticket (issue).** Tarefa registrada no GitHub, com número: o #1 descreve "o total do carrinho está errado". O ticket evita o esquecimento da tarefa e concentra a discussão sobre ela.
2. **Repositório.** A pasta do projeto com todo o histórico de mudanças. Há uma cópia na máquina de Ana e outra no GitHub, chamada **remoto** (por convenção, `origin`).
3. **Ramo (branch).** Linha de trabalho separada. A `main` é o ramo principal; Ana cria `conserta-total` a partir dela para alterar o código sem afetar a `main`:
   ```
   git switch -c conserta-total
   ```
4. **Commit.** Registro das mudanças, com uma mensagem. Ana seleciona os arquivos (`git add src/total.js`) e grava o registro (`git commit -m "conserta a soma do total"`).
5. **Push.** Envio dos commits ao remoto: `git push origin conserta-total`.
6. **Pull request (PR).** Pedido, no GitHub, de junção do ramo `conserta-total` na `main`. O PR exibe a diferença e recebe comentários.
7. **Revisão.** Outra pessoa (Carla) lê a diferença e aprova ou pede mudanças.
8. **CI (integração contínua).** Serviço que executa os testes automaticamente em cada PR. Em caso de falha, o PR exibe um X vermelho.
9. **Merge.** Junção do ramo na `main`. A partir desse ponto, a correção faz parte do projeto.

### Conflito de merge

No mesmo dia, Carla alterou a mesma linha de `src/total.js` em outro ramo. No merge do segundo PR, o git não tem como escolher entre as duas versões e interrompe a operação:

```
<<<<<<< HEAD
export const total = itens => itens.reduce((s, i) => s + i.preco * i.qtd, 0);
=======
export const total = itens => itens.reduce((s, i) => s + i.preco, 0) - desconto;
>>>>>>> cupom
```

Uma pessoa precisa ler as duas versões, decidir o resultado e gravá-lo. Essa situação se chama **conflito de merge** e decorre de duas alterações no mesmo trecho.

### Ramos de integração e de produção

Em muitos projetos, a `main` contém o que está publicado (**produção**: a versão em uso pelos clientes). Para evitar uma publicação a cada merge, cria-se um ramo de **integração**, onde os trabalhos se juntam primeiro (aqui, `dev`), e às vezes um ramo de **teste** (`stage`). O percurso é: ramo do trabalho → `dev` → `stage` → `main`. Publicar consiste em levar a `dev` para `stage` ou `main`.

### Pasta de trabalho (checkout)

Pasta onde os arquivos ficam disponíveis para edição. Numa pasta, um único ramo está em uso por vez: `git switch outro-ramo` substitui os arquivos da pasta inteira. Essa restrição está na origem de vários problemas tratados neste material.

### Vocabulário do agente de código

- **Agente de código.** Programa que usa um modelo de linguagem para ler, editar e executar comandos no projeto (Claude Code, OpenCode, Codex).
- **Conversa (sessão).** Um terminal com o agente aberto, do primeiro pedido até o encerramento. Ana pode manter três conversas ao mesmo tempo.
- **Contexto.** Texto que o agente lê de uma vez: pedidos, respostas, arquivos abertos. O contexto tem tamanho limitado.
- **Limpeza e compactação.** Quando o contexto atinge o limite, a pessoa limpa a conversa (reinício do zero, no mesmo terminal) ou a compacta (o agente substitui a conversa por um resumo). Nos dois casos, o agente perde detalhes.
- **Ferramenta.** Cada ação executada pelo agente: execução de comando, edição de arquivo.
- **Processo.** Programa em execução no computador, identificado por um número atribuído pelo sistema. O agente aberto num terminal é um processo.

---

## 2. Problema geral: três sessões no mesmo repositório

Ana abre três terminais, cada um com um agente de código: um no carrinho, um no cupom, um no frete. Os três trabalham na mesma pasta da `loja`.

- O agente do cupom termina e faz commit de "tudo o que mudou". O commit inclui o `src/total.js` que o agente do carrinho ainda estava editando.
- O agente do frete troca de ramo para conferir um detalhe. Os outros dois continuam a editar, agora no ramo errado, sem detectar a troca.
- Ana limpa a conversa do carrinho porque o contexto atingiu o limite. O novo agente desconhece o trabalho do carrinho.
- Carla, em casa, assume o mesmo ticket do frete. Às 11h, existem duas soluções parciais.
- Às 18h, a sessão do cupom trava. No dia seguinte, ninguém sabe o que foi concluído.

Esses problemas decorrem de **vários atores que escrevem no mesmo lugar ao mesmo tempo**: várias conversas do mesmo agente, a mesma conversa antes e depois da limpeza, agentes diferentes, pessoas diferentes em máquinas diferentes, e um agente e uma pessoa na mesma pasta. Os mesmos problemas ocorrem em qualquer sistema concorrente: escrita no mesmo lugar, disputa por um recurso, corrupção de estado compartilhado, término de um participante que detém uma tarefa, mensagem não entregue.

Limites de uma instrução mais bem escrita (prompt):

1. Uma instrução não informa o que as outras sessões estão fazendo. "Não mexa no trabalho da outra conversa" só tem efeito se o agente souber onde está esse trabalho e se a outra conversa está viva.
2. A atenção individual não resolve disputas. Duas pessoas que conferem "ninguém pegou" no mesmo segundo concluem, as duas, que a tarefa está livre.
3. A falha de uma instrução é silenciosa: o agente esquece a instrução, interpreta-a ou usa uma forma de comando que ninguém previu.
4. Parte do problema não passa pelo agente: o comando digitado pela pessoa no terminal.

**Relato do autor do harness** (projeto real e privado; números não verificáveis aqui): mais de 280 frentes de trabalho em um mês; 15% dos commits consistiam apenas na atualização de um arquivo de "quem faz o quê"; cada sessão gastava cerca de 16 mil tokens na leitura desse arquivo; builds e testes simultâneos esgotaram a memória, e o sistema encerrou editor, sessões e banco.

---

## 3. Questões

Estrutura de cada questão: **situação**, **atividade**, **alternativas e custos** (custo de adoção × custo da ausência), **custos e riscos da ausência de solução**, **solução proposta** (o mecanismo geral, com condição de validade e custo), **exemplo de implementação** (o que o `agent-harness` faz, comparado com as linhas da tabela), **aplicação**, **limites** e **relação com o trabalho final**.

Na tabela, "custo de adoção" é o que a alternativa exige (tempo, código, infraestrutura, disciplina); "custo da ausência" é o dano quando a alternativa falta; "—" indica nada além do que as outras linhas já registram. "Custos e riscos da ausência de solução" é o preço de manter o problema como está.

### Questão 1. Identidade da sessão e continuidade do trabalho

**Situação.** Ana pede "comece o carrinho", trabalha uma hora e limpa a conversa. A nova conversa desconhece o carrinho e começa a editar no mesmo diretório. Em outro terminal, uma conversa do dia anterior é retomada e passa a tratar o carrinho como trabalho próprio.

> **Atividade.** Propor um meio de o agente identificar o próprio trabalho depois da limpeza da conversa. Indicar quem decide quando duas conversas reivindicam o carrinho. Escrever a proposta antes de seguir.

**Alternativas e custos.**

| Alternativa | Custo de adoção | Custo da ausência | Condição de suficiência |
|---|---|---|---|
| Nenhuma identidade: o agente pergunta à pessoa | nenhum | trabalho sem dono depois da limpeza; duas conversas assumem o mesmo trabalho | uma pessoa, uma conversa |
| Anotação do agente num arquivo do repositório | escrita do arquivo | disputa pelo arquivo (questão 3) | — |
| Id da conversa fornecido pelo agente | leitura do id | id novo a cada limpeza e trabalho órfão | conversas sem limpeza |
| Id com vínculo de continuação | conferência do processo e da hora de início | — | várias conversas por dia |
| Nome escolhido pela pessoa no terminal | disciplina | — | uso manual |

**Custos e riscos da ausência de solução.** Trabalho sem dono depois de cada limpeza, ou com dois donos; retrabalho.

**Solução proposta (identidade fornecida pelo agente e herança condicionada).** A sessão usa como identidade o id de conversa fornecido pelo agente; o vínculo entre a sessão e o trabalho fica registrado fora da conversa; a nova conversa herda o trabalho apenas com prova de continuidade e, em caso de dúvida, não herda. Condição de validade: o agente fornece o id e avisa o início de cada conversa.

**Exemplo de implementação (agent-harness).** Corresponde a "id com vínculo de continuação": um nome por conversa que não depende da memória da pessoa. Custo: em caso de dúvida, a conversa perde um trabalho que era seu.

- **Sessão** é a conversa de um agente, identificada pelo id que o agente fornece. No Claude Code, o agente entrega esse id ao harness a cada ação (e o grava na variável `CLAUDE_CODE_SESSION_ID`). Num agente que o harness ainda não sabe ler, `AH_SESSAO=<nome>` informa a sessão. **Pronto.**
- **Frente** é um trabalho com nome (o carrinho), um ID curto (`as-1`) e, como mostra a questão 2, um local próprio. Cada sessão tem no máximo uma frente.
- `tools/ah whoami` informa a sessão e a frente:
  ```
  $ tools/ah whoami
  Sessão 7f3a9c21 (executor) · frente: as-1 carrinho
  ```
- **Herança:** a conversa limpa, compactada ou retomada herda a frente apenas quando o agente informa que se trata de continuação **e** existe vínculo (o mesmo processo, com a hora de início conferida, para não confundir com outro programa que recebeu o mesmo número). Em caso de dúvida, não há herança; o resumo informa que a frente está sem dona e como retomá-la. **Pronto.**
- **Papéis:** *executor* (uma frente por vez, o padrão) e *orquestrador* (várias frentes e abertura de frente para outra sessão): `tools/ah papel orquestrador`. O *executivo* é o humano que decide. **Pronto.**
- **Resumo no início da sessão**, com até 1200 caracteres, injetado no contexto do agente:
  ```
  Sessão 7f3a9c21 (executor) no harness.
  Sua frente: nenhuma: `ah open <nome>` para abrir uma.
  Outras frentes: as-2 cupom (dona carla-te)
  Base dev: checkout principal limpo.
  Regras: …
  Mais: docs/agents/sessoes-paralelas.md · tools/ah board
  ```
  (Linha de regras omitida aqui por antecipar as questões 2 e 5.)

**Aplicação.** No Claude Code, o `init` configura o agente (em `.claude/settings.json`) para avisar o harness no início de cada conversa e antes de cada ação. No uso manual, o mesmo nome deve constar de todos os comandos: `AH_SESSAO=ana-terminal tools/ah open carrinho` e `AH_SESSAO=ana-terminal tools/ah close`.

**Limites.** No Windows, e no macOS sem `ps`, não há herança por processo: a frente fica sem dona e exige `ah open`. A variável do id se propaga para agentes abertos de dentro de outro agente. Uma sessão parada há mais de 120 min parece morta (questão 6). No `/clear`, a herança falhou no primeiro ensaio com o agente real; o defeito foi corrigido e a correção foi conferida no agente real (histórico na questão 12).

**Relação com o trabalho final.** Cenário 5: o harness guarda fora do agente apenas a identidade da sessão e o trabalho dela, e injeta essa informação num resumo curto. Questão para o grupo: isso é memória ou apenas estado? Enunciado §4: o modelo da sessão só é gravado quando o agente o informa, e o Claude Code o informa apenas em alguns casos.

### Questão 2. Isolamento do diretório de trabalho

**Situação.** Três agentes na mesma pasta. O do carrinho edita `src/total.js`; o do cupom executa `git add -A` (adiciona tudo o que mudou) e inclui o arquivo incompleto; o do frete executa `git switch main` para conferir um detalhe, e os outros dois passam a editar o ramo errado.

> **Atividade.** Três pessoas alteram os mesmos arquivos, na mesma pasta, ao mesmo tempo. Propor uma organização que impeça uma pessoa de danificar o trabalho de outra. Indicar o custo da proposta e a sua condição de falha.

**Alternativas e custos.**

| Alternativa | Custo de adoção | Custo da ausência | Condição de suficiência |
|---|---|---|---|
| Todos na mesma pasta, com combinação prévia | nenhum | a situação descrita acima | uma sessão por vez |
| Uma cópia (clone) do repositório por sessão | disco; integração pelo remoto | — | máquinas diferentes |
| Um ramo por trabalho, cada um na sua pasta (worktree) | criação e limpeza de pastas; instalação de dependências em cada uma | — | várias sessões numa máquina |
| Trava por arquivo | bloqueio de trabalho legítimo; trava esquecida | — | arquivos que não admitem merge |
| Contêiner por sessão | infraestrutura | — | isolamento também por segurança |

**Custos e riscos da ausência de solução.** Commit que inclui o trabalho incompleto de outra sessão; horas de trabalho no ramo errado, de rastreamento difícil.

**Solução proposta (isolamento por `git worktree`, um ramo por unidade de trabalho).** Cada trabalho recebe um ramo e uma pasta próprios; as pastas compartilham o repositório e o histórico, e cada uma tem ramo em uso e índice próprios. A pasta principal fica reservada à integração.

**Exemplo de implementação (agent-harness).** Combina "uma cópia por sessão" e "um ramo por trabalho", sem cópia do histórico. Custo: uma pasta adicional por trabalho, com cópia própria das dependências; todo o conflito fica para o merge.

- `tools/ah open carrinho` cria o ramo `feat/carrinho` a partir da `dev` e um **worktree** próprio: uma segunda pasta de trabalho do mesmo repositório, com ramo próprio, fora da pasta do projeto. **Pronto.**
  ```
  $ tools/ah open carrinho
  Frente as-1 carrinho aberta.
  Trabalhe em: /home/ana/.cache/agent-harness/loja/wt/carrinho
  ```
- A pasta principal (o *checkout principal*) é compartilhada e serve à integração. A proteção da pasta principal e da pasta de outra sessão é assunto da questão 5, que pede uma proposta própria antes da leitura.
- Um executor com frente ativa não abre outra:
  ```
  Recusado: Esta sessão já tem a frente carrinho.
  Faça: continue nela ou, antes de abrir outra, encerre com ah close carrinho (o orquestrador abre várias: ah papel orquestrador)
  ```
- No worktree da própria frente, a sessão não tem restrições.

**Aplicação.** O agente trabalha e faz commit no worktree. A integração ocorre na pasta principal, na `dev`: `git merge --no-ff feat/carrinho`.

**Limites.** A separação por pasta não impede o acesso à pasta de outra sessão; a questão 5 trata desse impedimento. Cada worktree tem cópia própria de dependências e configuração local. Banco e portas por worktree ficam fora do núcleo; a extensão `recursos`, que acompanha o harness, apenas registra qual frente usa cada porta ou banco e recusa o valor já reservado por outra (`tools/ah recursos reservar porta 3001`), sem criar o banco nem subir o serviço.

**Relação com o trabalho final.** Cenário 3: a hipótese "cada um com o seu agente acelera o começo e complica a integração" pode ser medida pela contagem dos locais onde os conflitos apareceram. O worktree reduz a interferência durante o trabalho e concentra o conflito no merge.

### Questão 3. Registro de quem faz o quê

**Situação.** O grupo cria `QUADRO.md` no repositório. Cada agente escreve "estou no carrinho" ao iniciar o trabalho. Uma semana depois, metade dos commits consiste em atualizações do quadro, os merges geram conflito nesse arquivo e cada agente lê o arquivo inteiro antes de trabalhar.

> **Atividade.** Propor um local para o registro de quem faz o quê que permita a consulta por todos, evite a disputa pelo registro e não consuma metade da conversa do agente na leitura. Indicar o que outra máquina precisa saber.

**Alternativas e custos.**

| Alternativa | Custo de adoção | Custo da ausência | Condição de suficiência |
|---|---|---|---|
| Arquivo no repositório | nenhuma infraestrutura | commits e conflitos só de quadro; tokens de leitura | uma pessoa, poucos dias |
| Grupo de mensagens ou planilha | nenhum | informação invisível para o agente | pessoas, sem agentes |
| Estado por máquina, fora do git, com resumo curto | código de gravação sem corrupção | — | várias sessões numa máquina |
| Tickets e comentários no GitHub entre máquinas | rede, API externa | trabalho duplicado | várias pessoas |
| Servidor de coordenação | infraestrutura | — | equipes grandes |

**Custos e riscos da ausência de solução.** Desconhecimento de quem faz o quê; consulta ou suposição a cada vez.

**Solução proposta (estado de coordenação fora do versionamento).** O estado atual fica fora do git, na máquina, com escrita atômica; o histórico vai para o git; entre máquinas, o canal é o rastreador de tickets; o agente recebe um resumo curto.

**Exemplo de implementação (agent-harness).** Combina "arquivo" (fora do git) e "tickets entre máquinas", um para cada alcance. Custo: outra máquina não vê o quadro desta.

- **Estado por máquina, fora do git** (no Linux, em `~/.local/state/agent-harness/<projeto>`; `AH_ESTADO` altera o local). Um arquivo JSON por sessão e por frente. Cada arquivo é gravado primeiro num arquivo temporário e depois renomeado numa única operação, para nunca ficar incompleto; apenas uma sessão escreve por vez (exclusão mútua). Um `eventos.jsonl` registra cada evento numa linha e só recebe acréscimos. **Pronto.**
- **No git, apenas o histórico:** uma linha por frente fechada em `docs/agents/historico-das-frentes.md`, com commit feito pelo `close`. **Pronto.**
- **Quadro:**
  ```
  $ tools/ah board
  ID    NOME      DONA      ESTADO  TICKETS  SOBREPÕE  PLANO  ÚLTIMA NOTA
  as-1  carrinho  ana-term  ativa   #1       —         —      mexendo no total
  Sessões vivas: ana-term (executor, carrinho)
  ```
  `tools/ah nota "mexendo no total"` registra o recado da última coluna. Estados possíveis: `ativa`, `órfã` (dona morta), `passada`, `abrindo`. **Pronto.**
- **ID curto por pessoa** (`as-1`: a sigla de `ana-souza` e um número), para evitar colisão no histórico entre máquinas. **Pronto.**

**Limites.** Outra máquina não vê o quadro desta; o canal entre máquinas é o comentário no ticket. Trabalho sem ticket fica invisível para as outras máquinas.

**Relação com o trabalho final.** Enunciado §4: o registro da disciplina é histórico (vai para o git, com data); o "quem faz o quê agora" do grupo não precisa ir. Cenário 3: "o que o `AGENTS.md` compartilhado virou".

### Questão 4. Reserva de tarefas e desempate

**Situação.** Ana e Carla, cada uma em casa, consultam os tickets às 9h e assumem o #2, "frete grátis acima de 200". Às 11h, existem duas soluções parciais.

> **Atividade.** Propor um meio de impedir que duas pessoas assumam a mesma tarefa. Definir quem fica com a tarefa se as duas a assumirem no mesmo segundo, o que a outra pessoa faz e o que acontece se a pessoa que assumiu desaparecer.

**Alternativas e custos.**

| Alternativa | Custo de adoção | Custo da ausência | Condição de suficiência |
|---|---|---|---|
| Combinação no chat | nenhum | trabalho duplicado | duas pessoas em comunicação constante |
| Nome no ticket, inserido à mão | um clique | esquecimento de inserir e de remover | equipes pequenas |
| Reserva automática no ticket, com regra de desempate | código; rede obrigatória | — | várias pessoas e sessões |
| Trava num servidor próprio | serviço próprio | — | duplicação de alto custo |

**Custos e riscos da ausência de solução.** Duas soluções parciais; a manhã de trabalho de uma das pessoas perdida.

**Solução proposta (reserva otimista com desempate por uma autoridade única).** Cada pessoa registra a reserva sem trava prévia e relê o registro depois de gravá-lo; com duas reservas, vence a mais antiga na ordem do servidor, e a outra pessoa desiste e desfaz o que fez. Condição de validade: rede e servidor que ordene os registros.

**Exemplo de implementação (agent-harness).** Corresponde a "nome no ticket", feito pelo programa, com a prioridade de quem chegar primeiro decidida pela ordem do servidor, e não pelo relógio de cada máquina. Custo: rede obrigatória, e o GitHub passa a ser o banco de coordenação.

- `tools/ah open frete --tickets 2` faz a reserva **antes** de criar ramo ou pasta: atribui o ticket à pessoa, aplica o rótulo (etiqueta colorida do ticket) `em-andamento` e publica um comentário cuja última linha é um marcador lido pelo programa:
  ```
  <!-- ah:frente id=as-3 nome=frete ramo=feat/frete estado=ativa login=ana-souza ... v=1 -->
  ```
  O último marcador de uma frente indica o estado dela no ticket. **Pronto.**
- **Ticket já reservado:**
  ```
  Recusado: Não reservei os tickets: o ticket #2 já está reservado pela frente cd-4 (frete), de @carla-dias.
  Faça: combine com @carla-dias, dona da frente cd-4, ou escolha outro ticket; se a reserva ficou velha, peça a quem a fez para rodar ah close ou ah handoff
  ```
- **Corrida:** a reserva é um aviso, sem garantia atômica. Se duas aberturas ocorrerem juntas, cada uma relê o ticket depois de comentar; vence a frente cujo comentário é o mais antigo **no servidor** (o número do comentário no GitHub, e não o relógio de cada máquina). A outra comenta a desistência, deixa de ser responsável e não cria nada. Com vários tickets, permanece apenas a frente que é a primeira em todos; se cada uma for a primeira em um ticket, as duas desistem e a abertura precisa ser repetida. As duas nunca permanecem. **Pronto.**
- **Sem rede**, `open` com `--tickets` recusa ("tente de novo com rede, ou abra sem --tickets (sem reserva)").
- `close` remove o responsável e o rótulo e comenta o fechamento; o ticket permanece aberto, porque o fechamento cabe a quem integra.

**Aplicação.** Exige o `gh` instalado e com login (`tools/ah doctor` confere).

**Limites.** O uso do GitHub como banco de coordenação atende a poucas pessoas. A revisão da construção encontrou uma corrida real: a frente A pedia #1 e #2, a frente B pedia #2 e #1, e as duas desistiam. O código atual aceita esse caso: entre as duas desistirem e as duas ficarem com o mesmo ticket, prefere o primeiro erro. Garantir um vencedor exigiria uma ordem única entre todos os tickets (exercício 6).

**Relação com o trabalho final.** Cenário 3: número de vezes que o grupo duplicou trabalho. Enunciado §3: no estudo, duas pessoas na mesma tarefa com abordagens diferentes constituem um dado; o que é defeito em trabalho de produção pode ser método num experimento.

### Questão 5. Regras pedidas e regras impostas

**Situação.** O arquivo de instruções contém a regra "nunca envie para a `main`". Durante uma tarefa longa, o agente executa `git push origin main` "para publicar a correção". Em outra ocasião, executa `git checkout main && git push`, forma que ninguém havia previsto na instrução.

> **Atividade.** Escrever uma regra que exige proibição efetiva e uma que admite simples recomendação. Indicar se o mecanismo de proibição, em caso de falha, deve liberar ou bloquear tudo, se deve existir um desvio de emergência e quem o autoriza.

**Alternativas e custos.**

| Alternativa | Custo de adoção | Custo da ausência | Condição de suficiência |
|---|---|---|---|
| Apenas instrução (`AGENTS.md`, skill) | redação cuidadosa | falha silenciosa | estilo e método |
| Lista de comandos permitidos do agente | configuração por agente; comparação de texto | — | comandos inteiros e de fácil reconhecimento |
| Gancho antes da ferramenta, que lê o comando | escrita e manutenção de um leitor de shell; falso positivo e falso negativo | — | regras que dependem de estado (ramo em uso, dona da pasta) |
| Proteção de ramo no servidor | conta que ofereça o recurso; publicação por PR | push direto para produção | ramos publicados |
| Caixa de areia (contêiner, usuário sem permissão) | infraestrutura | — | risco de ataque, além de engano |

**Custos e riscos da ausência de solução.** Push para produção sem revisão, descoberto depois.

**Solução proposta (gancho antes do comando, com falha fechada, e proteção de ramo no servidor).** Um gancho que o agente executa antes de cada ferramenta lê o comando e recusa o que danifica o trabalho de outras sessões, com motivo e alternativa; se não consegue avaliar o comando, recusa. No servidor, a proteção de ramo recusa o push direto, em qualquer forma de comando. O método permanece como instrução.

**Exemplo de implementação (agent-harness).** Combina "gancho que lê o comando" e "proteção de ramo no servidor": a trava local avisa antes e indica a alternativa; a barreira efetiva fica no servidor. Custo: a trava lê texto, e sempre existe uma forma de comando que escapa.

- **Gancho** é um programa que o agente chama antes de executar uma ferramenta. O gancho do harness lê o comando como o terminal o leria (interpreta comandos encadeados com `&&` e `;`, comandos dentro de comandos, como `bash -c "…"`, e troca de pasta com `cd`) e devolve "permite" ou "recusa, com motivo e próximo passo". **Pronto.**
- **Trava** é uma regra do gancho que recusa. Travas do harness:

| Trava | Recusa | Estado |
|---|---|---|
| T0 | comando que menciona git ou gh e não pode ser lido; nome de comando vindo de variável; gancho que não consegue avaliar | pronto |
| T1 | trocar o ramo da pasta principal | pronto |
| T2 | `git add` de tudo e `commit -a` na pasta principal | pronto |
| T3 | descartar trabalho na pasta principal (`reset --hard`, `clean -f`, `stash`, `rebase`) | pronto |
| T4 | escrever no worktree ou no ramo da frente de outra sessão viva, por comando ou por edição de arquivo | pronto |
| T5 | push para ramo protegido em qualquer forma; `gh pr merge` com base protegida | pronto |
| T6 | trabalho pesado fora da fila, quando o projeto configura classes (questão 8) | pronto |

- **Relação com a questão 2:** T1, T2 e T3 protegem a pasta principal; T4 protege a pasta e o ramo da frente de outra sessão viva (a pasta de frente passada, órfã ou de dona morta não tem proteção; nesse caso vale o `takeover`). T1 e T3 valem apenas na pasta principal: no worktree da própria frente, `rebase`, `stash` e `reset` são permitidos.
- **Gancho com defeito recusa.** Mesmo com defeito, o gancho permite uma chamada a `tools/ah` (para a execução do `doctor`) e a edição de `.harness/config.json`.
- **Desvio de emergência:** `AH_GUARD=off` no início do próprio comando, apenas com ordem do executivo, libera T1 a T6 naquele comando e fica registrado. O prefixo nunca libera a T0. Na edição de arquivo (T4) não há liberação: o caminho é o pedido à dona ou o `takeover`.
- **Barreira efetiva no servidor:** o `init` configura proteção de ramo no GitHub para `stage` e `main`. As travas locais avisam antes e indicam a alternativa correta; não substituem a proteção.
- **Regra geral:** o harness sugere e registra; recusa apenas o que protege o trabalho de outras sessões e a máquina. Método (plano, teste antes) nunca é motivo de recusa.

**Aplicação.** A trava pode ser observada sem agente, com a entrega ao gancho do evento que o Claude Code enviaria:

```
$ echo '{"session_id":"abc","hook_event_name":"PreToolUse","cwd":"'"$PWD"'","tool_name":"Bash","tool_input":{"command":"git add -A"}}' | tools/ah gancho claude-code
Recusado (T2): git add com tudo (-A, ., -u, *, a raiz) no checkout principal leva junto o trabalho de outras frentes
Faça: git add <caminhos> com só os arquivos que você mudou (e git commit sem -a), ou trabalhe no worktree da frente
$ echo $?
2
```

Com `"command":"git push origin dev:main"` (forma não prevista na instrução):

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

Tentativa de edição (`"tool_name":"Edit"`) pela sessão `carla-terminal` de um arquivo na pasta da frente de Ana, com a sessão de Ana viva:

```
Recusado (T4): <worktrees>/carrinho/src/total.js está no worktree da frente as-1 carrinho, da sessão ana-term, que está viva
Faça: escreva só no worktree da sua frente; para mexer em carrinho, peça à sessão ana-term (ah handoff) ou, se ela morrer, ah takeover carrinho
```

Com `"command":"G=git; $G push"`:

```
Recusado (T0): o nome do comando vem de uma variável e o texto menciona git ou gh
Faça: escreva o comando por extenso, sem variável, crase nem aspas abertas (git push origin <ramo>)
```

No ensaio com o Claude Code real, o agente recebeu as recusas com o motivo literal e não tentou contorná-las.

**Limites das travas.**

> **Escopo: engano do agente; má-fé fica fora do escopo.** As travas leem o texto do comando antes da execução e não acompanham o que um programa faz durante a execução. Passam, mesmo na pasta de outra sessão viva: `python -c "…"`, `find <pasta> -delete`, `… | xargs rm`, `rsync`, um script ou um `npm` que escreve arquivo. Na pasta principal, passam `find . | xargs git add`, apelidos do git e `gh api …/merge`. A lista completa está em `docs/referencia/comandos.md`, seção "Limites".
>
> Comparação de custos: a **solução completa** exige caixa de areia (contêiner, usuário sem permissão), com custo de infraestrutura e prejuízo ao trabalho normal. A **manutenção das brechas** custa pouco enquanto o risco é engano do agente, e muito se o risco for má-fé de uma pessoa ou de uma skill de terceiros. Por esse motivo, a barreira efetiva fica no servidor.

Há também recusas indevidas: a T1 recusa `git switch main && git pull && git switch dev`, mesmo com o retorno à `dev` no final. `AH_GUARD=off` depende de confiança: o agente pode digitar o prefixo sem ordem, e o registro é a contrapartida. A proteção de ramo não existe em repositório privado de conta gratuita do GitHub. No Windows nativo, as travas de comando não valem (a alternativa é o WSL2).

**Relação com o trabalho final.** Cenário 9: transformação de um método em código dentro de um harness. O harness define uma fronteira (a proteção do trabalho alheio vira trava; o método fica como recomendação), que o grupo pode adotar ou contestar. Cenário 1: `AH_GUARD=off` é aprovação humana anterior à ação, restrita à exceção. Cenário 4: a lista de formas que escapam constitui um catálogo de falsos negativos.

### Questão 6. Sessão interrompida e passagem do trabalho

**Situação.** A sessão de Ana trava às 16h com o carrinho incompleto. No dia seguinte, o quadro ainda indica "carrinho: Ana, ativa". Carla pretende continuar o trabalho. Ana, no notebook, pretende retomar o trabalho deixado no computador do laboratório.

> **Atividade.** Propor um critério que distinga uma sessão morta de uma sessão que processa há 40 minutos. Redigir o bilhete destinado a quem continuar o trabalho. Indicar quem pode retirar um trabalho de uma sessão.

**Alternativas e custos.**

| Alternativa | Custo de adoção | Custo da ausência | Condição de suficiência |
|---|---|---|---|
| Espera pela pessoa | nenhum | "em andamento" indefinidamente | uma pessoa |
| Prazo automático sem sinal | escolha do prazo; sessão lenta tratada como morta | — | sessões curtas |
| Tomada explícita, com confirmação humana | um passo e uma decisão | — | várias sessões |
| Passagem planejada (push do ramo, estado registrado no ticket) | disciplina de executar a passagem antes de parar | ausência de informação para quem retoma | várias pessoas e máquinas |

**Custos e riscos da ausência de solução.** Trabalho parado e sem dono; recomeço do zero por quem continua.

**Solução proposta (sinal periódico com prazo e passagem explícita com nota).** A sessão renova um sinal periódico (heartbeat); sem sinal dentro do prazo, ou sem o processo, o trabalho aparece como órfão, como numa trava com prazo (lease). Numa parada planejada, a sessão faz push do ramo e deixa uma nota no ticket. A tomada do trabalho de uma sessão morta exige confirmação humana.

**Exemplo de implementação (agent-harness).** Combina três linhas: prazo (sinal de vida), passagem planejada (`handoff`) e tomada apenas com confirmação humana (`takeover`). Custo: uma sessão morta parece viva por até duas horas.

- **Sessão viva:** o processo registrado existe **e** o sinal de vida (um arquivo atualizado pelos ganchos) tem menos de 120 min (valor configurável em `sessoes.prazoDoSinalMin`). Frente ativa com dona morta aparece como `órfã` no quadro. **Pronto.**
- **Passagem do trabalho:**
  ```
  $ tools/ah handoff --nota "falta validar a data"
  Frente as-2 cupom passada.
  Para retomar: tools/ah open cupom
  ```
  Exige worktree limpo (do contrário, recusa e pede um commit `wip:`), faz push do ramo, comenta a passagem no ticket (nota, últimos commits, plano, comando de retomada) e deixa a frente `passada`, sem dona, com a reserva mantida. Sem remoto, avisa: "só esta máquina retoma a frente". **Pronto.**
- **Retomada pelo próprio `open`:**
  ```
  $ tools/ah open cupom
  Frente as-2 cupom retomada.
  Trabalhe em: /home/carla/.cache/agent-harness/loja/wt/cupom
  ```
  Na mesma máquina, a retomada usa o estado local; em outra, usa o ramo no remoto e a passagem no ticket, que reconstrói a frente com o mesmo ID. O GitHub confere que nenhuma outra sessão retomou a frente antes. **Pronto.**
- `open <nome> --para <sessão>`: o orquestrador abre frente para outra sessão viva. **Pronto.**
- `close <nome>` de frente cuja dona já encerrou é aceito, com as mesmas conferências. **Pronto.**
- `takeover <nome>`: tomada da frente ativa cuja dona morreu. Sem `--confirmado`, exibe a dona, o motivo e a idade do sinal e recusa, com pedido de confirmação do executivo; com `--confirmado`, assume a frente. **Pronto.** O `--confirmado` depende de confiança: o gancho não tem como consultar um humano, e o agente pode passar a opção por conta própria; o registro em `eventos.jsonl` é a contrapartida.
- `sweep [--reparar] [--json]`: lista as inconsistências do estado desta máquina, sem rede (frente órfã, worktree ou ramo ausente, sessão morta, abertura interrompida, comentários pendentes, pasta principal fora da base ou com mudanças); `--reparar` corrige apenas o estado e reenvia os comentários pendentes, sem nunca apagar pasta nem ramo. Sem inconsistências: `Nada fora do lugar.` **Pronto.**

**Limites.** Uma sessão morta parece viva por até duas horas, se o processo não terminou. Frente sem ticket só pode ser retomada na mesma máquina.

**Relação com o trabalho final.** Enunciado §4, "onde travou": o comentário de passagem é um formato pronto de registro de parada, utilizável também à mão. Cenário 3: definir com antecedência quem pode assumir o trabalho de quem desapareceu.

### Questão 7. Dois trabalhos no mesmo arquivo

**Situação.** A frente do carrinho e a do cupom alteram `src/total.js`. Ninguém percebe até o merge, e uma das frentes refaz meia tarde de trabalho.

> **Atividade.** Classificar duas frentes no mesmo arquivo como erro, risco ou situação normal. Avaliar se um aviso prévio é suficiente e indicar quem lê o aviso: a pessoa ou o agente.

**Alternativas e custos.**

| Alternativa | Custo de adoção | Custo da ausência | Condição de suficiência |
|---|---|---|---|
| Resolução no merge | nenhum | retrabalho descoberto tarde | partes distantes do código |
| Aviso calculado pelo que cada frente já mudou | um `git diff` por frente | — | várias frentes no mesmo módulo |
| Declaração prévia do que a frente vai alterar | previsão | — | previsão fácil |
| Trava por arquivo | bloqueio de trabalho legítimo | — | arquivos que não admitem merge |

**Custos e riscos da ausência de solução.** Retrabalho descoberto tarde, no momento do merge.

**Solução proposta (aviso de sobreposição calculado, sem trava por arquivo).** A sobreposição entre trabalhos é calculada pelo que cada trabalho ativo já mudou em relação à base, complementada pela declaração prévia do que um trabalho novo pretende alterar. O resultado é um aviso, nunca uma recusa. Custo: o aviso não impede nada.

**Exemplo de implementação (agent-harness).** Combina "aviso calculado" e "declaração prévia" e rejeita a trava por arquivo. A sobreposição considera, para cada frente ativa, os commits do ramo e as mudanças sem commit em relação à base, e aparece no quadro e no resumo. No `open`, `--caminhos` declara o que a frente nova pretende alterar. **Pronto.**

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

**Limites.** A comparação é por arquivo, e não por trecho. Apenas as frentes do estado desta máquina entram no cálculo.

**Relação com o trabalho final.** Cenário 3: contagem dos conflitos, com a indicação de quais um aviso prévio teria evitado.

### Questão 8. Recurso escasso da máquina

**Situação.** Três sessões executam a suíte de testes e uma quarta compila. A memória se esgota e o sistema encerra o editor, as sessões e o banco. Incidente real na construção do próprio harness: a suíte deixou 5471 pastas temporárias e encheu o `/tmp`; o subagente que identificou o problema executou os testes com `TMPDIR` apontado para outra pasta e registrou que "teste que falha não limpa".

> **Atividade.** Indicar a quem pertencem a memória e o disco quando há cinco sessões na máquina. Escolher entre fila, limite e ausência de controle, com justificativa.

**Alternativas e custos.**

| Alternativa | Custo de adoção | Custo da ausência | Condição de suficiência |
|---|---|---|---|
| Execução livre em cada sessão | nenhum | máquina derrubada; disco cheio | uma sessão |
| Instrução ("não rode os testes em paralelo") | redação | esquecimento do agente; sessões sem visão das outras | poucas sessões, comandos leves |
| Fila de trabalho pesado por máquina | código, configuração, espera | — | várias sessões com builds e testes pesados |
| Limite do sistema operacional (cotas, contêiner) | configuração por sistema | — | infraestrutura própria |
| Limpeza, por cada teste, do que ele criou | disciplina em cada teste novo | diretório temporário cheio | sempre |

**Custos e riscos da ausência de solução.** Editor, sessões e banco encerrados ao mesmo tempo; perda do trabalho não salvo.

**Solução proposta (fila de trabalho pesado por máquina).** Os comandos pesados (build, suíte de testes) aguardam a vez numa fila comum a todas as sessões da máquina, com vagas e memória livre mínima definidas por máquina e classes de comando definidas por projeto. Um gancho recusa o comando pesado executado fora da fila. A limpeza dos arquivos temporários cabe a cada teste. Custo: espera e configuração por quem conhece o projeto.

**Exemplo de implementação (agent-harness).** Adota a fila por máquina e deixa a limpeza a cargo de cada teste.

- `tools/ah pesado -- <comando>` aguarda a vez numa **fila da máquina** (a mesma para todos os projetos com o harness), executa o comando, repassa a saída e devolve o código de saída do comando. **Pronto** (fatia 3; sem ensaio com agente real nem em Windows ou macOS).
- **Vagas e memória pertencem à máquina** e ficam num `config.json` da fila, criado com valores padrão na primeira chamada: 2 vagas e 4096 MB livres para que um comando execute ao lado de outro.
- **Classes pertencem ao projeto** e ficam em `pesado.classes`, no `.harness/config.json`: quais comandos são pesados e quantas vagas exigem. Um comando que não corresponde a nenhuma classe recebe a classe mais restritiva. Exemplo:
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
- **Ordem estrita de chegada, por senha:** apenas o primeiro da fila começa; um comando que pede todas as vagas não é ultrapassado (custo: um comando leve atrás dele espera, mesmo com vaga livre). Se interrompido, o `pesado` encerra toda a árvore de processos do comando antes de liberar a vaga.
- **T6:** com classes configuradas, o gancho recusa a execução fora da fila de um comando que corresponda a uma delas:
  ```
  Recusado (T6): npm é trabalho pesado (classe exclusivo) e roda fora da fila; vários juntos esgotam a memória da máquina
  Faça: tools/ah pesado -- npm test
  ```
- **Projeto novo começa com `classes: {}`:** a T6 fica desligada até que o grupo a configure. O `init` deixa um `_exemplo` ao lado, para cópia.

**Limites.** O incidente relatado envolveu pasta temporária, e não memória: a fila não o teria evitado. Continua necessário apontar `TMPDIR` para uma pasta própria, e cada teste que cria uma pasta deve apagá-la ao terminar. A T6 lê texto, como as outras travas: `npm run build` dentro de um script passa (a solução é incluir o script na classe). O comando digitado no terminal, fora do agente, não passa pelo gancho; para que ele entre na fila, `tools/ah pesado` também deve ser usado à mão.

**Relação com o trabalho final.** Enunciado §4: a execução de código de terceiros em ambiente descartável também protege contra esse problema.

### Questão 9. Queda de rede

**Situação.** Ana fecha a frente sem acesso à internet. O `close` precisa comentar no ticket e remover o rótulo; o GitHub não responde.

> **Atividade.** Decidir se uma operação que altera o estado local e o servidor deve falhar por inteiro ou executar a parte possível. Avaliar se o envio duplicado de um comentário é pior que o não envio.

**Alternativas e custos.**

| Alternativa | Custo de adoção | Custo da ausência | Condição de suficiência |
|---|---|---|---|
| Recusa de tudo sem rede | baixo | impossibilidade de trabalhar sem internet | operações que dependem de resposta (reserva) |
| Execução local sem atualização do servidor | baixo | ticket com estado errado indefinidamente | nunca |
| Registro das falhas e reenvio posterior | código da fila; risco de envio duplicado | — | comentários que admitem espera |

**Custos e riscos da ausência de solução.** O ticket indica "em andamento com Ana" indefinidamente, e nenhuma outra pessoa assume a tarefa.

**Solução proposta (fila de envios pendentes com reenvio).** A operação conclui a parte local; o envio ao servidor que falha por causa passageira entra numa fila, em ordem, e é reenviado depois; o erro permanente é separado. Operações que dependem da resposta do servidor, como a reserva, recusam sem rede.

**Exemplo de implementação (agent-harness).** Fila de comentários e edições pendentes: a falha passageira entra na fila, em ordem, e é reenviada a cada comando `tools/ah`; o erro permanente (ticket inexistente) é separado. **Pronto.** A reserva no `open` não entra na fila: sem rede, o `open` recusa, porque a reserva exige saber se outra frente já reservou o ticket.

**Limites.** A entrega "pelo menos uma vez" aceita o comentário duplicado como mal menor. A distinção entre falha passageira e permanente depende do texto da mensagem do `gh`.

### Questão 10. Regra comum para agentes diferentes

**Situação.** No grupo, uma pessoa usa Claude Code, outra usa OpenCode e a terceira usa Codex. A regra "não envie para a `main`" precisa valer para as três.

> **Atividade.** Avaliar se a mesma regra pode valer em três programas que enviam eventos diferentes. Indicar quem escreve a ponte entre cada agente e as regras: quem mantém o harness ou o próprio agente.

**Alternativas e custos.**

| Alternativa | Custo de adoção | Custo da ausência | Condição de suficiência |
|---|---|---|---|
| Um único agente para o grupo | perda da escolha | — | grupo em acordo |
| Núcleo comum e uma ponte fina por agente | escrita e ensaio de cada ponte | regras diferentes por pessoa | grupo misto |
| Ponte escrita pelo próprio agente, com roteiro e testes | roteiro e testes de qualidade | — | agentes que o mantenedor não usa |
| Apenas regras no servidor | nenhuma configuração local | aviso tardio, só no push | complemento, em qualquer caso |

**Custos e riscos da ausência de solução.** A regra vale para uma pessoa do grupo e não para as outras.

**Solução proposta (núcleo comum e adaptador fino por agente).** As regras ficam num núcleo comum, que recebe um contrato mínimo de eventos; cada agente tem um adaptador que apenas traduz os eventos do agente para o contrato e a resposta do núcleo de volta para o agente.

**Exemplo de implementação (agent-harness).** Adota "núcleo comum e ponte fina" e atribui ao próprio agente a escrita da ponte dos demais agentes. Custo: atualmente, apenas o Claude Code tem ponte pronta.

- **Contrato de quatro eventos**: início de sessão, sinal de vida, antes de ferramenta, fim de sessão. O adaptador de cada agente apenas traduz. **Pronto.**
- **Adaptador do Claude Code**, com ensaio no agente real (versão 2.1.319). **Pronto.**
- **Tabela de capacidades** dos três agentes em `docs/referencia/capacidades-por-agente.md`: os três permitem recusar antes de comando e de edição; o OpenCode não tem evento de início nem de fim de sessão; o Codex só executa ganchos do projeto depois que a pasta e cada gancho são marcados como confiáveis.
- **Roteiro de adaptação para outros agentes**, em `docs/agentes/` (fatia 4): o contrato, o adaptador do Claude Code comentado como exemplo, o passo a passo e o procedimento de prova; testes de contrato obrigatórios para todo adaptador (`AH_ADAPTADOR=<agente> node --test teste/contrato-adaptadores.test.mjs`); um ponteiro no `AGENTS.md` instalado pelo `init`; e o item "Adaptador do agente em uso" no `doctor`. **Pronto**, sem ensaio com o Codex nem com o OpenCode.
- **Adaptadores do Codex e do OpenCode inexistentes, por decisão do autor:** o agente que chega ao projeto lê o roteiro e escreve o próprio adaptador. A seção 5 descreve o procedimento.

**Relação com o trabalho final.** Cenários 9 e 7: a escrita do adaptador do OpenCode é uma extensão de um harness por dentro, por eventos, com o contrato já definido.

### Questão 11. Custo do método

**Situação.** Para uma mudança de três linhas, o agente escreve especificação e plano de oito tarefas e despacha um subagente e um revisor por tarefa. Em outra frente, sem plano, o agente reescreve metade do módulo e ninguém revisa.

> **Atividade.** Indicar em que casos plano e revisão compensam o custo. Avaliar se o harness deveria recusar trabalho sem plano.

**Alternativas e custos.**

| Alternativa | Custo de adoção | Custo da ausência | Condição de suficiência |
|---|---|---|---|
| Pedido direto ao agente, sem método | nenhum | retrabalho; ausência de referência para revisão | mudanças de um commit |
| Plano de partida curto | redação do plano | — | a maior parte do trabalho |
| Especificação, plano, subagentes e revisão por tarefa | tempo, tokens, revisão por quem decide | defeitos descobertos tarde | mudança de desenho |
| Várias sessões em paralelo, uma frente cada | atenção de quem coordena; integração | — | trabalho independente e extenso |

**Custos e riscos da ausência de solução.** Uma tarde e muitos tokens gastos numa mudança pequena, ou metade do módulo reescrita sem revisão.

**Solução proposta (método como instrução, sem recusa).** O harness não recusa trabalho por método nem por escolha de modelo; o método permanece como instrução, e o harness torna visível o plano associado a cada trabalho.

**Exemplo de implementação (agent-harness).** O harness nunca recusa por método nem por escolha de modelo. `tools/ah open <nome> --plano docs/plano.md` associa a frente ao plano, que aparece no quadro e no resumo. **Pronto.** Números de uso (`tools/ah board --numeros`): frentes abertas e fechadas, tempo médio e mediano por frente, passagens, sessões por modelo, recusas por trava e espera do trabalho pesado, a partir do registro de eventos da máquina. **Pronto.** O gasto com modelo (tokens) não entra na conta. O próprio harness foi construído em fatias, cada uma utilizável e testada antes da seguinte, com revisão independente por tarefa.

**Relação com o trabalho final.** Cenário 6 (especificação quando o pedido muda); enunciado §4 ("horas e gasto com modelos": o harness não mede gasto, que exige registro manual).

### Questão 12. Critério de "pronto" e prova

**Situação.** O agente informa "pronto, todos os testes passam". A pessoa integra a mudança. No dia seguinte, outra sessão descobre que duas reservas em ordem cruzada resultam na desistência das duas.

> **Atividade.** Definir o que conta como prova de conclusão: a frase do agente, o comando e a saída, ou a CI. Indicar quem revisa e com que informação.

**Alternativas e custos.**

| Alternativa | Custo de adoção | Custo da ausência | Condição de suficiência |
|---|---|---|---|
| Confiança na frase do agente | nenhum | defeito integrado | nunca |
| Comando e saída colados no PR ou no ticket | cópia da saída | "pronto" sem prova | sempre, como mínimo |
| Revisão pelo mesmo agente | baixo | revisão limitada ao raciocínio já feito | mudanças pequenas |
| Revisão por outro agente, sem o raciocínio do primeiro | tokens, tempo, correções | defeitos de desenho e de borda não detectados | mudanças com corrida, estado, segurança |
| Ensaio com o agente real | credenciais, máquina | contrato errado com o agente | adaptadores e travas |

**Custos e riscos da ausência de solução.** Defeito integrado, descoberto por outra pessoa no dia seguinte.

**Solução proposta (prova por comando e saída, revisão independente e ensaio com o agente real).** "Pronto" exige o comando e a saída no registro. Mudanças com corrida, estado ou segurança passam por revisão de outro agente, sem acesso ao raciocínio do primeiro. Adaptadores e travas passam por ensaio com o agente real, além dos testes com agente simulado.

**Exemplo de implementação (agent-harness) e método da construção.**

- `tools/ah doctor` confere a preparação em 22 itens, mais um ("Adaptador do agente em uso") quando o agente se identifica (Node, git, `gh`, configuração, ganchos, proteção dos ramos, estado, fila de pesado), e ensaia recusas reais (uma T5 e uma T1). **Pronto.**
- **Ensaio com o agente real.** Os testes do harness simulam o agente: entregam ao gancho eventos escritos à mão. Todos passavam. O ensaio com o Claude Code real revelou um defeito fora do alcance desses testes: no `/clear`, o agente avisa o **fim** da conversa antiga **antes** de avisar o **início** da nova. O harness tratava todo fim como encerramento; quando o início chegava, não havia mais conversa viva para herdar, e a frente ficava órfã. Correção: um fim por `/clear` ou por retomada não encerra a sessão, que passa a aguardar a continuação. O reensaio com o agente real (Claude Code 2.1.319, 13/11) confirmou a correção: o agente enviou o fim com o motivo `clear`, depois o início com a origem `clear` e um id novo, no mesmo processo, e a conversa nova herdou a frente. O segundo ensaio revelou outro defeito: a retomada (`/resume`) de uma conversa que já tinha frente deixava o executor com duas frentes, contra a regra de uma só. Conclusão: **os testes simulados verificam a lógica; o ensaio com o agente real verifica as suposições sobre o agente.** (Fonte: `docs/referencia/ensaio-claude-code.md`, seções da fatia 2 e "Reensaio do `/clear`".)
- **Afirmação sem execução.** No mesmo reensaio, diante de um pedido vago, o modelo pequeno não chamou nenhuma ferramenta e respondeu que o `git reset --hard` "descartou" as alterações. Nenhum comando havia sido executado. Para observar uma recusa com o agente, o pedido deve ser "rode exatamente este comando: …", com conferência posterior no registro do harness (`tools/ah board`, `eventos.jsonl`). É a mesma regra do enunciado §8: vale o que o registro mostra, e não o que o agente afirma.
- Na construção do harness, cada tarefa passou por revisão independente (outro agente, com o diff e o plano, sem o raciocínio do implementador). Em cinco tarefas seguidas, a revisão pediu correções; o defeito das reservas cruzadas foi encontrado por essa revisão, e não pelos testes do implementador.
- Os testes contra um `gh` falso verificam apenas o comportamento do falso: o `gh` falso dos testes aceitava rótulos que o real recusaria.

**Relação com o trabalho final.** Enunciado §8: "o trabalho fica insuficiente se o artigo afirma o que o registro não mostra". "Pronto com comando e saída" é a mesma regra, aplicada ao código.

### Questão 13. Fechamento do trabalho e publicação

**Situação.** A sessão termina e apaga a pasta do trabalho e o ramo. Um commit ainda não tinha sido integrado; um arquivo de configuração local, ignorado pelo git, foi apagado junto. Em outro dia, o agente leva a `dev` para a `main` "para publicar".

> **Atividade.** Escrever três conferências anteriores à remoção do local de trabalho de outra pessoa. Indicar quem fecha o ticket, quem trabalhou ou quem integrou, e classificar a publicação como passo técnico ou decisão.

**Alternativas e custos.**

| Alternativa | Custo de adoção | Custo da ausência | Condição de suficiência |
|---|---|---|---|
| Remoção manual da pasta | nenhum | perda de commits e arquivos locais | pessoa que conhece todo o conteúdo da pasta |
| Comando que confere antes de apagar | código das conferências; recusas | perda silenciosa | sempre |
| `dev` livre; `stage` e `main` só por PR com ordem | um ramo adicional; PRs | publicação acidental | projetos com publicação |

**Custos e riscos da ausência de solução.** Trabalho perdido sem que ninguém perceba; produção com mudanças cuja publicação ninguém decidiu.

**Solução proposta (fechamento com conferências e publicação por PR com ordem humana).** Um comando de fechamento confere, antes de apagar a pasta, as mudanças sem commit, os commits ausentes da base e do remoto e os arquivos ignorados; libera a reserva sem fechar o ticket; não envia nada ao remoto. O ramo de integração é livre; os ramos de teste e de produção recebem apenas PR, com merge por ordem humana.

**Exemplo de implementação (agent-harness).**

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

O `close` só é executado na pasta principal, na base, depois do merge; confere worktree limpo, commits na base ou no remoto e arquivos ignorados (`--descartar-ignorados` aceita a perda desses arquivos); libera os tickets sem fechá-los; grava a linha do histórico com um commit `docs(frentes): fecha as-1 carrinho`; nunca faz push. **Pronto.** A `dev` é livre; `stage` e `main` são protegidas e só recebem PR, com merge por `AH_GUARD=off gh pr merge <n>` mediante ordem do executivo.

**Limites.** Submódulos não são tratados. Três ramos (`dev`, `stage`, `main`) podem representar sobrecarga para um grupo de quatro semanas; os nomes vêm da configuração.

**Relação com o trabalho final.** Cenário 3, "quem pode alterar"; enunciado §5: o commit de fechamento é um marco datado no histórico.

---

## 4. Visão geral do exemplo (agent-harness) e primeiro ciclo

### Visão geral

- **Definição.** Conjunto de comandos (`tools/ah`) e de ganchos do agente, escrito em Node, sem dependências. Foi extraído de um projeto real e privado (relato do autor: mais de 280 frentes abertas e fechadas em um mês; número não verificável aqui).
- **Problemas tratados.** Várias conversas de agente, e várias pessoas, no mesmo repositório sem que uma danifique o trabalho da outra: questões 1 a 7, 9 e 13. Tratamento parcial: questões 10 e 12.
- **Mecanismos.** Cada trabalho é uma frente, com ramo e pasta próprios (questão 2); o registro de quem faz o quê fica na máquina, fora do git (questão 3); a reserva vai para o ticket do GitHub, que serve de canal entre máquinas (questão 4); travas avaliadas antes de cada comando do agente recusam o que danifica o trabalho alheio (questão 5); passagem do trabalho e tomada com confirmação tratam a sessão que para ou morre (questão 6).
- **Aplicação.** `init` no projeto e `doctor` para conferência; o passo a passo vem a seguir.
- **Problemas não tratados.** Método e escolha de modelo (o harness nunca recusa por esses motivos; questão 11), medição de horas e gasto, agentes sem adaptador (Codex e OpenCode: o agente escreve o próprio adaptador pelo roteiro de `docs/agentes/`; questão 10), má-fé (as travas detectam engano; questão 5).
- **Regra de projeto.** O harness sugere e registra; recusa apenas o que protege o trabalho de outras sessões e a máquina.

O harness é uma das linhas da tabela de alternativas, entre outras. As propostas da turma em aula continuam válidas como alternativas para o trabalho final (seção 6).

### Instalação e primeiro ciclo

Ciclo de uma frente:

```
open ──► trabalho no worktree ──► commit ──┬──► handoff ──► (outra sessão) open ──► …
                                           └──► merge na dev ──► close
```

Pré-requisitos: Node 22 ou mais recente, git, `gh` instalado e com login (`gh auth login`), Linux, WSL2 ou macOS. Não há dependências a instalar.

**1. Obtenção do harness.** Depois da publicação:

```
git clone https://github.com/elderbernardiifsul/agent-harness ~/agent-harness
```

**2. Instalação no projeto.** Na pasta da `loja`, abrir o agente e pedir "prepare meu projeto com o harness, a partir do clone em `~/agent-harness`". O agente executa:

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

O `AGENTS.md` instalado contém as regras do harness e, para quem não usa o Claude Code, aponta o roteiro de adaptação (`.harness/nucleo/docs/agentes/README.md`).

Sem `gh` com login, a sigla deve ser informada: `--sigla as`. Num repositório sem remoto, ou num ensaio, `--sem-protecao` dispensa a proteção de ramo no servidor. O `init` não faz commit: os três comandos exibidos ao final devem ser executados.

**3. Conferência.**

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

(São 23 itens. O último aparece apenas quando um agente se identifica, como neste caso, em que o próprio agente executou o `doctor`; num terminal comum, aparecem 22. Há uma linha de proteção por ramo protegido. Sem `gh`, aparecem avisos no lugar dessas linhas e no da sigla; avisos não alteram o código de saída.)

**4. Abertura da frente.** Dentro do agente, a sessão vem do gancho. No uso manual, num terminal, a sessão é informada por `AH_SESSAO`:

```
$ AH_SESSAO=ana-terminal tools/ah open carrinho --tickets 1
Frente as-1 carrinho aberta.
Trabalhe em: /home/ana/.cache/agent-harness/loja/wt/carrinho
```

**5. Trabalho.** Edição e commit no worktree:

```
$ cd /home/ana/.cache/agent-harness/loja/wt/carrinho
$ git add src/total.js && git commit -m "feat: frete no total"
$ AH_SESSAO=ana-terminal tools/ah nota "mexendo no total"
Nota registrada na frente as-1 carrinho.
```

**6. Consulta ao quadro.** `tools/ah board` (não exige sessão).

**7a. Interrupção.** `tools/ah handoff --nota "falta o frete grátis"`. A sessão que continuar executa `tools/ah open carrinho`.

**7b. Conclusão.** Na pasta principal, na `dev`:

```
$ git merge --no-ff feat/carrinho
$ git push origin dev
$ AH_SESSAO=ana-terminal tools/ah close --resumo "frete no total"
Frente as-1 carrinho fechada.
```

**8. Publicação.** PR de `dev` para `stage` ou `main`; o merge é decisão do executivo.

Ajuda: `tools/ah --help` lista os comandos; `tools/ah <comando> --help` exibe o uso. Referência completa: `docs/referencia/comandos.md` no clone.

---

## 5. Uso com OpenCode e Codex

Não há adaptador pronto para OpenCode nem para Codex, por decisão do autor: o agente que chega ao repositório segue um roteiro, escreve o próprio adaptador, executa os testes de contrato e faz a prova com o agente real. O roteiro existe (fatia 4), mas **não foi ensaiado** com o Codex nem com o OpenCode; o resultado deve ser tratado como experimento, com registro do que aconteceu.

**Funcionamento sem adaptador:** todos os comandos funcionam, com a sessão informada por variável. No OpenCode, o id da conversa está em `OPENCODE_SESSION_ID`; no Codex, em `CODEX_THREAD_ID`:

```
AH_SESSAO=$OPENCODE_SESSION_ID tools/ah open carrinho
AH_SESSAO=$OPENCODE_SESSION_ID tools/ah whoami
```

Sem adaptador, faltam as travas automáticas e o resumo no início da sessão. O `doctor` informa essa situação no item "Adaptador do agente em uso"; se o agente não for reconhecido, ele deve ser declarado: `AH_AGENTE=opencode tools/ah doctor`.

**Roteiro oficial**, no clone do agent-harness (com cópia no projeto em `.harness/nucleo/docs/agentes/`):

| Arquivo | Conteúdo |
|---|---|
| `docs/agentes/README.md` | ponto de partida: função do adaptador, localização dos arquivos, critério de conclusão |
| `docs/agentes/contrato.md` | os quatro eventos, a recusa, a sessão e o processo, o fim que indica continuação |
| `docs/agentes/exemplo-claude-code.md` | o adaptador existente, comentado, com os eventos reais do ensaio |
| `docs/agentes/escrever-um-adaptador.md` | o passo a passo e o tratamento de agentes sem algum dos eventos |
| `docs/agentes/provar.md` | os testes de contrato e o ensaio com o agente real |

O adaptador é escrito **no clone**, e não no projeto: o módulo `nucleo/adaptadores/<agente>.mjs` e o arquivo de gancho do agente, que o `init` leva para o projeto. O adaptador está concluído quando `AH_ADAPTADOR=<agente> node --test teste/contrato-adaptadores.test.mjs` passa, a suíte inteira continua passando, o ensaio com o agente real recusou as ações proibidas e o que o agente não entrega está declarado.

**Pedido a entregar ao agente**, num repositório descartável com o harness instalado:

> Leia `.harness/nucleo/docs/agentes/README.md` e siga o roteiro até o fim, no clone do agent-harness. Confira o formato do nosso agente na documentação oficial dele, não só na tabela de capacidades. Antes de escrever código, diga o que falta para o nosso agente ter as travas. No fim, prove com o agente real, num repositório descartável sem remoto: peça "rode exatamente: `git push origin main`" e mostre a recusa e a linha no `eventos.jsonl`. Não use `AH_GUARD=off`. Registre cada passo com o comando e a saída.

**Informações conhecidas, detalhadas no roteiro** (de `docs/referencia/capacidades-por-agente.md`, extraídas da documentação; nenhuma ensaiada com o harness):

- **OpenCode:** não há gancho por comando externo; a extensão é um plugin em `.opencode/plugins/`, e a recusa é uma exceção no gancho `execute.before`. Não há evento de início nem de fim de sessão, de modo que o resumo inicial não tem o mesmo ponto de entrada.
- **Codex:** `PreToolUse` semelhante ao do Claude Code, mas a edição chega como `apply_patch`, com o caminho dentro do texto do patch; os ganchos do projeto só são executados depois que a pasta e cada gancho são marcados como confiáveis (`/hooks`). Sem essa marcação, os ganchos são ignorados sem aviso.

---

## 6. Trabalho final: decisões do harness × cenários

Cada linha associa uma decisão de desenho do harness a um dos cenários de `cenarios.md` (ou a uma seção do enunciado) e indica o aproveitamento possível pelo grupo, por adoção ou contestação da decisão.

| Decisão do harness | Questão | Cenário ou seção do trabalho final | Aproveitamento pelo grupo |
|---|---|---|---|
| Uma pasta (worktree) e um ramo por frente | 2 | Cenário 3, "Três pessoas, quantos agentes?" | teste da hipótese "acelera o começo e complica a integração" pela contagem dos conflitos, durante o trabalho ou no merge |
| Reserva do ticket como aviso, sem garantia de exclusão | 4 | Cenário 3, "Três pessoas, quantos agentes?" | decisão entre o custo da reserva (rede, `gh`) e a combinação no chat para três pessoas, com registro do número de duplicações |
| Proibição de escrita na pasta de sessão viva; tomada só com confirmação (T4, `takeover`) | 5, 6 | Cenário 3, "Onde aperta": "quem corrige quando o agente de uma pessoa quebra o código de outra" | acordo prévio, por escrito, sobre quem pode alterar o trabalho de quem e após quanto tempo sem notícia |
| Estado atual fora do git; no git, apenas o histórico | 3 | Cenário 3 ("o que o `AGENTS.md` compartilhado virou") e enunciado §4, Registro | separação entre o registro com data, que vai para o git, e o "quem faz o quê agora", que não precisa ir |
| Regra geral: sugestão e registro; recusa apenas do que protege o trabalho alheio e a máquina | 5, 11 | Cenário 9, "Um plugin para o DSH" | decisão sobre o que do método vira código e o que permanece instrução, com justificativa da fronteira (por que "não enviar para a main" gera recusa e "teste antes" não?) |
| Gancho com defeito recusa; toda recusa indica a alternativa | 5 | Cenário 9, "Um plugin para o DSH" | plugin que falha de forma visível e indica o próximo passo em cada recusa |
| Contrato de quatro eventos; o adaptador apenas traduz | 10 | Cenário 7, "O meu harness", e cenário 9 | uso dos quatro eventos como lista mínima do que um harness precisa interceptar; adaptador do OpenCode como produto |
| Construção em fatias; "uma peça que o aluno não consiga ler e explicar" como fracasso | 11 | Cenário 7, "O meu harness" | construção do harness por partes, cada uma utilizável, e remoção da peça que ninguém do grupo explica |
| Resumo curto no início da sessão; ausência de herança em caso de dúvida | 1 | Cenário 5, "O veterano de bolso" | decisão sobre o que guardar fora do agente e o que descartar; discussão sobre o resumo como memória ou estado |
| Exceção só com ordem humana registrada (`AH_GUARD=off`, `takeover --confirmado`) | 5, 6 | Cenário 1, "O balcão que responde" | comparação entre "aprovar cada resposta" e "aprovar só a exceção", com registro de quem aprovou |
| Desenho que muda, com seções novas que prevalecem sobre as antigas | 11 | Cenário 6, "Especificação antes do código" | marcação, na especificação, do que mudou e do que vale, ou demonstração de que reescrever custa menos |
| Trava por leitura de texto, com recusa do ilegível (T0); sem caixa de areia | 5 | Cenário 4, "A portaria das skills" | formas que escapam da trava como exemplos de falso negativo |
| "Pronto" só com comando e saída; revisão independente por tarefa | 12 | Enunciado §8, Evidência e Domínio; §1, "o que eu delego e depois tenho de refazer?" | comando e saída em cada "pronto"; registro do que a revisão mandou refazer e do motivo |
| Ensaio com o agente real num repositório descartável | 12 | Enunciado §4, cuidados (ambiente descartável) | execução de skills e de código de terceiros nas mesmas condições |

Cenários com ligação fraca ou inexistente: cenário 2, "O manual que cabe no notebook" (nele, a falta de rede e de memória é do produto, e não do desenvolvimento); cenário 8, "Será que dá mesmo em uma semana?" (as fatias garantem um resultado utilizável a cada etapa, mas o harness não registra prazos); cenário 10, "Decisão tipada ou texto?" (nenhuma ligação).

Três práticas independentes do uso do harness:

1. **Registro com data.** O enunciado pede registro durante o trabalho, no git. O comentário de passagem do trabalho (questão 6) serve de formato: estado do trabalho, últimos commits, plano, procedimento de retomada.
2. **"Pronto" com comando e saída.** É a regra da evidência (enunciado §8) aplicada ao código.
3. **Ambiente descartável.** O ensaio do harness com o agente real ocorreu num repositório descartável, sem remoto. Skills e código de terceiros exigem o mesmo cuidado (enunciado §4).

O harness não mede horas de trabalho nem gasto com modelo: o `tools/ah board --numeros` dá o tempo entre a abertura e o fechamento de cada frente, que inclui as pausas. Se a pergunta do grupo depende desses dados, o registro deve ser manual.

---

## 7. Exercícios

Os três primeiros exercícios são de nivelamento e devem ser feitos antes da aula 2. O gabarito está na seção 8.

1. **Ordenação do fluxo.** Os passos do fluxo de Ana estão fora de ordem: merge; revisão; ticket; push; commit; criar ramo; PR; CI. Ordenar os passos e indicar, em uma frase para cada caso, a consequência da omissão da revisão e da omissão da CI.
2. **Conflito de merge.** Num repositório descartável: criar `total.js` com uma linha e fazer commit na `main`; criar dois ramos e alterar a mesma linha de formas diferentes em cada um; fazer o merge do primeiro na `main` e depois do segundo. Copiar a mensagem do git e resolver o conflito.
3. **Duas pastas de trabalho no mesmo repositório.** No mesmo repositório: `git worktree add ../loja-cupom -b cupom`. Fazer um commit em cada pasta. Executar `git worktree list` e `git log --all --oneline`. Indicar o resultado de `git switch cupom` na pasta principal.
4. **Classificação de comandos.** Para cada comando executado na pasta principal, na `dev`, indicar se o harness atual o recusa e por qual trava: (a) `git add src/total.js`; (b) `git add .`; (c) `git push origin dev`; (d) `git push origin main`; (e) `git switch main`; (f) `git reset --hard`; (g) `git checkout main && git push`; (h) `find . -name '*.js' | xargs git add`.
5. **Brechas da T5.** Escrever duas formas de push para a `main` que a T5 possivelmente não detecta. Para cada uma, indicar o que ainda impediria o dano.
6. **Corrida entre reservas.** A frente A pede os tickets #1 e #2; a frente B pede #2 e #1, ao mesmo tempo. Com a regra "vence o comentário mais antigo", e supondo que A comentou primeiro no #1 e B primeiro no #2, descrever o resultado. Propor uma regra que garanta um vencedor.
7. **Detecção de sessão viva.** Escrever em pseudocódigo a função "a sessão está viva?". Listar três modos de erro da função (sessão morta classificada como viva, ou o contrário).
8. **Local de armazenamento.** Classificar cada item como "vai para o git" ou "fica fora": (a) a pessoa responsável pelo ticket #2 neste momento; (b) o fechamento da frente as-1 em 12/11; (c) a nota "mexendo no total"; (d) a previsão de prazo do grupo, escrita antes da etapa.
9. **Adaptador para o OpenCode (aula 2).** Entregar ao OpenCode o roteiro oficial (`docs/agentes/README.md`; o pedido está na seção 5). Registrar: o que o agente apontou como faltante, o que escreveu, quais testes executou, se a recusa ocorreu com o agente real e quais correções foram necessárias.

---

## 8. Gabarito comentado

**1.** Ticket → criar ramo → commit → push → PR → CI → revisão → merge (CI e revisão podem ocorrer em paralelo). Sem revisão, apenas o autor lê o código antes da integração; sem CI, a execução dos testes depende da memória de alguém. Com agentes, as duas lacunas se agravam: o autor é o agente, e o agente afirma ter executado os testes.

**2.** O git interrompe o merge com `CONFLICT (content): Merge conflict in total.js` e marca o arquivo com `<<<<<<<`, `=======` e `>>>>>>>`. A resolução consiste em editar o arquivo até a versão correta, executar `git add total.js` e `git commit`. O conflito aparece apenas no segundo merge: o primeiro merge não tem custo.

**3.** `git worktree list` exibe as duas pastas, cada uma com o seu ramo; `git log --all` exibe os dois commits, porque o repositório é o mesmo. O próprio git recusa `git switch cupom` na pasta principal: o ramo já está em uso em outro worktree. Essa proteção nativa do git explica por que um worktree por frente evita a troca do ramo de uma sessão em atividade.

**4.** (a) passa: caminho explícito. (b) T2. (c) passa: a `dev` é livre. (d) T5. (e) T1. (f) T3. (g) T1, já na troca de ramo (sem ela, a T5 recusaria o push, porque o gancho acompanha a troca de ramo na mesma linha). (h) passa: limite declarado da T2 (o `xargs` recebe os caminhos durante a execução). O item (h) mostra a diferença entre o que a trava promete e o que ela consegue ler; até a véspera da aula, (e) e (f) também passavam. A conferência deve ser feita sempre no código: `tools/ah --help` e `docs/referencia/comandos.md`.

**5.** Exemplos: um script `publicar.sh` que executa `git push origin main` internamente; `gh api` diretamente na API de merge; um apelido do git. O que ainda impede o dano é a proteção de ramo no servidor (PR obrigatório), que não lê o comando e examina o que chega ao servidor. Por isso o harness situa a barreira efetiva no servidor; em repositório privado de conta gratuita, apenas a trava local protege.

**6.** Com "vence quem comentou primeiro **em cada ticket**", A vence no #1 e B vence no #2; se cada frente desistir ao perder em algum ticket, as duas desistem e nenhuma fica com nada. Esse foi o caso encontrado na revisão da construção. Uma regra que garante um vencedor: uma ordem global (por exemplo, a menor posição de comentário entre todos os tickets, com desempate pelo ID da frente), de modo que as duas máquinas, ao ler o mesmo servidor, cheguem à mesma conclusão. O harness atual não implementa essa regra: aceita que as duas desistam e repitam a abertura, porque o erro inadmissível é as duas ficarem com o mesmo ticket. Ponto de discussão: qual dos dois erros custa mais para o grupo?

**7.** Esboço: a sessão está viva se o processo registrado existe **e** a hora de início do processo é a registrada **e** o último sinal tem menos de N minutos. Modos de erro: número de processo reaproveitado por outro programa (sessão morta classificada como viva, sem a conferência da hora de início); sessão parada há mais de N minutos à espera da pessoa (sessão viva classificada como morta); processo observado pelo gancho que é um shell de vida curta, e não o agente (sessão classificada como morta logo depois do registro).

**8.** (a) fora: estado atual, que muda continuamente (no ticket, sim, como comentário). (b) git: histórico. (c) fora: recado atual. (d) git, com commit antes da etapa: é a prova pedida pelo enunciado §4.

**9.** Não há gabarito único. Um registro adequado informa a versão do OpenCode e do modelo, o que o agente afirmou e o que foi conferido, e se a recusa chegou ao modelo com o motivo. O registro informa também se os testes de contrato (`AH_ADAPTADOR=<agente> node --test teste/contrato-adaptadores.test.mjs`) passaram. Se o agente declarou "pronto" sem demonstrar a recusa com o agente real, o exercício não está concluído.

---

## 9. Glossário

| Termo | Definição |
|---|---|
| **adaptador** | Ponte entre um agente específico e o núcleo do harness: traduz os eventos do agente para o contrato e a resposta de volta. |
| **agente de código** | Programa que usa um modelo de linguagem para ler, editar e executar comandos num projeto (Claude Code, OpenCode, Codex). |
| **base (ramo base)** | Ramo de onde as frentes partem e onde são integradas; no harness, `dev` por padrão. |
| **board (quadro)** | Tabela de quem está fazendo o quê no momento: `tools/ah board`. |
| **checkout principal** | Pasta original do repositório, onde ocorre a integração; as frentes trabalham em worktrees. |
| **CI (integração contínua)** | Serviço que executa os testes automaticamente a cada push ou PR. |
| **commit** | Registro gravado das mudanças, com mensagem, data e autor. |
| **compactar (a conversa)** | Substituir a conversa com o agente por um resumo, para que caiba no contexto. |
| **conflito de merge** | Situação em que dois ramos alteraram o mesmo trecho e o git não tem como escolher a versão válida; uma pessoa decide manualmente. |
| **contexto** | Texto que o agente lê de uma vez: pedidos, respostas, arquivos abertos. Tem tamanho limitado. |
| **contrato de eventos** | Os quatro eventos que todo adaptador entrega ao núcleo: início de sessão, sinal de vida, antes de ferramenta, fim de sessão. |
| **corrida** | Duas ações simultâneas sobre o mesmo recurso, com resultado dependente da ordem de chegada. |
| **executivo** | Humano que decide: autoriza publicações, exceções e tomadas de frente. |
| **executor** | Papel padrão de uma sessão: uma frente por vez. |
| **ferramenta** | Cada ação executada pelo agente: execução de comando, edição de arquivo. |
| **frente** | Unidade de trabalho no harness: nome, ID curto (`as-1`), ramo `feat/<nome>`, worktree, dona e tickets. |
| **gancho (hook)** | Programa que o agente chama em momentos definidos (antes da execução de um comando, por exemplo); pode recusar a ação. |
| **handoff (passagem do trabalho)** | Interrupção planejada de uma frente, com tudo preparado para outra sessão continuar: ramo enviado, comentário no ticket, frente `passada`. |
| **harness** | Programa e regras em torno do modelo. *Harness do agente*: o programa que conduz o laço do agente (Claude Code, Codex, OpenCode). *Harness do projeto*: os acréscimos da equipe (instruções, comandos, ganchos configurados, proteção de ramo). |
| **instrução** | Regra escrita para leitura pelo agente (`AGENTS.md`, skill); o agente pode esquecê-la ou interpretá-la. |
| **issue** | Ver *ticket*. |
| **main** | Por convenção, o ramo principal; em muitos projetos, a versão publicada (produção). |
| **marcador** | Linha `<!-- ah:… -->` no fim de um comentário de ticket, lida pelo harness para determinar o estado da frente. |
| **merge** | Junção de um ramo em outro. |
| **orquestrador** | Papel de sessão que distribui trabalho: pode ter várias frentes e abrir frente para outra sessão. |
| **órfã** | Frente ativa cuja sessão dona não está mais viva. |
| **limpar (a conversa)** | Reiniciar a conversa com o agente do zero, no mesmo terminal. |
| **processo** | Programa em execução no computador, identificado por um número atribuído pelo sistema. |
| **produção** | Versão publicada e em uso; no fluxo do harness, a `main`. |
| **proteção de ramo** | Regra no servidor (GitHub) que impede o push direto para um ramo e exige PR. |
| **pull request (PR)** | Pedido, no GitHub, de junção de um ramo em outro, com diferença visível, comentários e revisão. |
| **push** | Envio de commits da máquina para o remoto. |
| **ramo (branch)** | Linha de trabalho separada dentro do repositório. |
| **ramo de integração** | Ramo onde os trabalhos se juntam antes da publicação; aqui, `dev`. |
| **remoto** | Cópia do repositório no servidor (GitHub), por convenção `origin`. |
| **repositório** | Projeto com todo o histórico de mudanças. |
| **rótulo (label)** | Etiqueta colorida de um ticket no GitHub, como `em-andamento`. |
| **pesado (fila de)** | Fila da máquina para builds e testes pesados: `tools/ah pesado -- <comando>` aguarda a vez e executa o comando; as classes do projeto definem o que é pesado. |
| **reserva** | Marcação, no ticket, de que uma frente está com ele (responsável, rótulo `em-andamento` e marcador). |
| **resumo da sessão** | Texto curto (até 1200 caracteres) que o harness injeta no início da conversa: identidade da sessão, frente da sessão, frentes das outras sessões, regras. |
| **revisão** | Leitura do código por outra pessoa ou outro agente antes do merge. |
| **sessão** | Conversa de um agente, identificada pelo id que o agente fornece. |
| **sessão viva** | Sessão cujo processo registrado existe e cujo sinal de vida tem menos de 120 min. |
| **sinal de vida** | Arquivo que os ganchos atualizam a cada interação; a data do arquivo indica o último sinal da sessão. |
| **sobreposição** | Duas frentes ativas que já alteraram o mesmo arquivo; o harness avisa, sem recusar. |
| **stage** | Ramo de teste: publicação numa versão de conferência anterior à produção. |
| **takeover (tomada)** | Assunção da frente ativa de uma sessão morta, apenas com a confirmação do executivo (`--confirmado`). |
| **testes de contrato** | Testes obrigatórios para todo adaptador (`AH_ADAPTADOR=<agente> node --test teste/contrato-adaptadores.test.mjs`). |
| **ticket** | Tarefa registrada no rastreador (no GitHub, *issue*), com número. |
| **trava** | Regra do gancho que recusa um comando antes da execução (T0 a T6). |
| **worktree** | Pasta de trabalho adicional do mesmo repositório, com ramo próprio em uso; no harness, uma por frente. |
| **`AH_GUARD=off`** | Prefixo de comando que libera T1 a T6 naquele comando, por ordem do executivo; fica registrado; nunca libera a T0. |
| **`AH_SESSAO`** | Variável que informa ao harness a sessão quando o agente não a informa (uso manual ou agente sem adaptador). |
