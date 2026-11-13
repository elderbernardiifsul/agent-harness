# Várias sessões de agente no mesmo repositório: levantamento para a aula

Base para os artefatos (slides, roteiro, exercícios) da aula de Programação Agêntica (IFSul) sobre o `agent-harness`. Não é o material da aula: é de onde ele sai.

## Resumo

**O que é.** O `agent-harness` é um conjunto de comandos (`tools/ah`) e de ganchos do agente que deixa várias sessões de agente de código, e várias pessoas, trabalharem no mesmo repositório sem uma atrapalhar a outra. Cada trabalho vira uma *frente*, com ramo e worktree próprios; o estado de quem faz o quê fica na máquina, fora do git; travas avaliadas antes de cada comando do agente recusam o que estraga o trabalho alheio; os tickets do GitHub servem de canal entre máquinas. Núcleo em Node, sem dependências [D §10]. Foi extraído de um projeto real e privado, em que funcionou por um mês com mais de 280 frentes abertas e fechadas [D §1].

**Em que estado está** (lido no ramo `dev`, commit `b4c48f3`):

| Marca | Significa | Peças |
|---|---|---|
| **[pronto]** | implementado e testado (fatias 0 e 1) | `init`, `doctor`, `whoami`, `open`, `nota`, `board`, `close`; estado local; histórico; ID de frente; travas T0, T2, T5; adaptador do Claude Code, ensaiado com o agente real [README; P01] |
| **[fatia 2]** | em execução agora, por subagentes | feito e revisado: sessão viva, herança na continuação, `papel`, fila de comentários pendentes [L 11, 23, 34, 56]; implementado e em conserto depois da revisão: reserva de ticket [L 41–52]; ainda não começado: sobreposição, `handoff`, retomar, `open --para`, `takeover`, `sweep`, T1, T3, T4 [P2 tarefas 6–16] |
| **[planejado]** | só no desenho | fila de trabalho pesado e T6 (fatia 3); roteiro para outros agentes escreverem o próprio adaptador (fatia 4); extensões, `deps`, `atualizar`, `board --numeros` (fatia 5) [D §12.1, §15] |

**Como usar este documento.** Depois do panorama, cada questão do problema tem os mesmos subtítulos: a situação concreta, perguntas sem resposta única, uma tabela de alternativas com custo de adotar e de não ter, o que o harness faz (com o estado da peça), como aplicar, o que fica de fora e a ligação com o trabalho final. No fim: a tabela de conciliação com o trabalho final, ideias de artefatos e as lacunas que dependem do autor. Toda afirmação sobre o sistema traz a fonte entre colchetes.

**Siglas das fontes** (caminhos relativos a `agent-harness/`, salvo os da disciplina):

| Sigla | Arquivo |
|---|---|
| D §n | `docs/superpowers/specs/2026-11-12-nucleo-design.md`, seção n |
| N | `docs/superpowers/specs/2026-11-12-notas-para-o-metodo.md` |
| P01 n | `docs/superpowers/plans/2026-11-12-nucleo-fatias-0-e-1-pendencias.md`, item n da lista de decisões (ou a seção nomeada) |
| P2 | `docs/superpowers/plans/2026-11-13-nucleo-fatia-2.md` (linha, "decisão n", "foco n" ou "tarefa n") |
| L n | `.superpowers/sdd/2026-11-13-nucleo-fatia-2/progress.md`, linha n |
| RT n | `.superpowers/sdd/2026-11-13-nucleo-fatia-2/restricoes.md`, item n |
| T5r | `.superpowers/sdd/2026-11-13-nucleo-fatia-2/task-5-report.md` |
| R-cmd | `docs/referencia/comandos.md` (seção do comando) |
| R-cap | `docs/referencia/capacidades-por-agente.md` |
| R-ens | `docs/referencia/ensaio-claude-code.md` |
| M-sp | `modelos/sessoes-paralelas.md` |
| README | `README.md` |
| E §n | `ensino/programacao-agentica/projetos/trabalho-final/enunciado.md`, seção n (Prelúdio = E §0) |
| C n | `ensino/programacao-agentica/projetos/trabalho-final/cenarios.md`, cenário n |
| PE | `ensino/programacao-agentica/programa/snapshots/workflows/plano-encontros-programacao-agentica.md` |
| HD | `ensino/programacao-agentica/HARNESS.md` |

---

## Panorama

### O problema

Um agente de código sozinho, numa sessão, num repositório, já tem problemas conhecidos pela turma: contexto que se perde, comando perigoso, "pronto" sem prova. Quando há mais de um ator escrevendo no mesmo repositório ao mesmo tempo, aparecem problemas de outra natureza. Os atores podem ser:

- várias sessões do mesmo agente na mesma máquina (uma por terminal);
- a mesma sessão, antes e depois de limpar ou compactar o contexto;
- sessões de agentes diferentes (Claude Code, Codex, OpenCode);
- pessoas diferentes, cada uma com os seus agentes, em máquinas diferentes;
- um agente e um humano mexendo no mesmo checkout.

O que acontece entre eles é o que acontece em qualquer sistema concorrente: escrita no mesmo lugar, corrida por um recurso, estado compartilhado que corrompe, processo que morre segurando um lock, mensagem que não chega. O desenho do harness lista as dores que deram origem a cada peça [D §1, tabela "As dores de origem"]:

| Dor | O que aconteceu |
|---|---|
| Sessões pisando umas nas outras | duas sessões editaram os mesmos arquivos; commits de uma caíram no checkout que todas usam; uma trocou o ramo do checkout comum |
| Quadro dentro do git | o quadro de quem faz o quê era um arquivo commitado: 15% de todos os commits eram só atualização dele, e cada sessão gastava cerca de 16 mil tokens para lê-lo |
| Linha morta | sessão que morria deixava "em andamento" para sempre |
| Máquina derrubada | builds e testes ponta a ponta juntos esgotaram a memória; o sistema matou o editor, as sessões e o banco |
| Trabalho duplicado entre máquinas | duas pessoas pegaram o mesmo ticket |
| Perda de contexto | depois de limpar ou compactar a conversa, a sessão não sabia mais qual era a frente dela |
| Push acidental | agente empurrando para o ramo que publica em produção |
| Passagem de bastão espalhada | quem retomava um trabalho parado não achava o estado |

### Por que é engenharia e não "prompt melhor"

1. **Uma instrução não vê o estado dos outros.** "Não mexa no trabalho da outra sessão" só funciona se o agente souber onde está esse trabalho e se a outra sessão está viva. Isso é estado e consulta, não redação. O harness responde com estado local e uma função que decide com ele [D §6 "Estado", §7].
2. **Corrida não se resolve com cuidado.** Dois `open` no mesmo segundo para o mesmo ticket passam pela conferência dos dois lados; quem resolve é uma regra de desempate (o marcador mais antigo vence) [D §11 "Reserva do ticket"; P2 decisão 6]. Nenhum prompt muda a ordem em que duas máquinas falam com o GitHub.
3. **Instrução falha em silêncio; mecanismo falha alto.** O desenho lista como fracasso "travas que deixam passar em silêncio quando quebram" [D §3] e decide que gancho que não consegue avaliar recusa [D §7].
4. **O agente segue o que vê, e vê pouco.** O quadro commitado custava cerca de 16 mil tokens por sessão [D §1]; a resposta foi tirar o quadro do git e injetar um resumo curto no começo da sessão [D §8].
5. **Parte do problema nem passa pelo agente.** Comando digitado num terminal comum não passa por gancho nenhum, em nenhum dos três agentes [R-cap, "O que não fica coberto"]. Por isso a barreira de verdade fica no servidor (proteção de ramo no GitHub) [D §12.2].

O desenho resume a regra geral: o harness sugere e registra; só recusa o que protege o trabalho dos outros e a máquina [D §11 "Regra geral de comportamento"; N "Decididas pelo autor"].

### Dois níveis de paralelismo

O desenho separa [D §12.6]: **dentro de uma frente**, subagentes despachados pela própria sessão (o harness não gerencia, só dá o worktree e a fila de pesado); **entre frentes**, várias sessões, cada uma com a sua frente (é o que o harness gerencia). A própria construção da fatia 2 usa o primeiro nível: um controlador despacha implementadores e revisores, um por vez, e registra tudo num ledger [L 3; RT 7]. Os dois níveis aparecem na aula: o harness como produto e o processo que o constrói como exemplo de método.

### Onde a aula se encaixa na disciplina

O desenho diz que o harness é objeto de uma ou duas aulas do encontro 13, "delegação e recuperação", com ponte para os encontros 10 a 12 [D §1]. No plano de encontros, o 13 é "usar subagentes e ambientes isolados; integrar mudanças e recuperar falha parcial"; o 10 é requisitos e planejamento; o 11, TDD; o 12, depuração e revisão; o 14, segurança [PE, tabela]. O harness da disciplina é montado sobre o OpenCode [HD "Arquitetura"], o que pesa na questão 10.

---

## Questão 1. Identidade da sessão

### Situação

Ana abre o agente, pede "comece a frente do carrinho", trabalha uma hora e digita `/clear` porque o contexto encheu. A conversa nova não sabe que existe uma frente do carrinho. Ela abre outra frente com outro nome, ou começa a editar no checkout principal. Em outro terminal, uma sessão de ontem é retomada com `--resume` e acha que o carrinho ainda é dela.

### Perguntas para a turma

- Depois de `/clear`, é a mesma sessão? E depois de compactar? E uma conversa de ontem retomada?
- O que identifica uma sessão: o id que o agente dá, o processo do sistema operacional, a pasta, a pessoa?
- Quando não dá para saber se é continuação, é melhor herdar o trabalho ou soltar? Qual erro custa mais?
- Um comando rodado à mão pela pessoa no terminal é de qual sessão?

### Alternativas e trade-offs

| Alternativa | Custo de adotar | Custo de não ter | Quando basta |
|---|---|---|---|
| Nenhuma identidade: o agente lê o `AGENTS.md` e pergunta à pessoa | zero | depois de `/clear` o trabalho fica sem dono; duas sessões assumem a mesma coisa | uma pessoa, uma sessão, trabalho curto |
| Id da sessão que o agente fornece, sem herança | ler o id no gancho | `/clear` gera id novo e a frente fica órfã | sessões que não limpam contexto |
| Id mais vínculo de continuação (mesmo processo com a mesma hora de início, ou id da sessão anterior) | gancho de começo de sessão, leitura do processo por sistema, casos de borda (pid reaproveitado, shell intermediário) | perda de contexto vira perda de dono | várias sessões por dia na mesma máquina |
| Nome escolhido pela pessoa e exportado no terminal | disciplina de quem abre o terminal; vaza para processos filhos | — | uso à mão, sem gancho |

### O que o harness faz

- **Sessão** é a conversa de um agente, identificada pelo id que o agente fornece [D §6 "Conceitos"]. No Claude Code o id vem no JSON do gancho e em `CLAUDE_CODE_SESSION_ID` [R-cap, linha (f)]. Sem adaptador, `AH_SESSAO=<nome>` diz quem é [README; R-cmd, cabeçalho]. **[pronto]**
- `tools/ah whoami` diz sessão, papel e frente [R-cmd "whoami"]. **[pronto]**
- **Herança na continuação:** a sessão nova herda a frente só quando o adaptador informa que é continuação **e** há vínculo (mesmo processo, com hora de início conferida nos dois lados). "Na dúvida, não herdar"; o resumo diz "a frente X está sem dona; `ah open X` para retomar" [D §11 "Continuação de sessão"; P2 levantamento, linha "Herança"; L 16]. **[fatia 2, feito]**
- **`/clear` é continuação.** A fatia 1 tratava `clear` como sessão nova [P01 4]; a fatia 2 reviu, porque o desenho fala em "conversa limpa, compactada ou retomada" [P2 decisão 5; L 4]. **[fatia 2, feito]**
- **Sessão viva** = o processo registrado existe **e** o sinal de vida (data de modificação de `sessoes/<id>.sinal`, tocado pelos ganchos) não venceu; prazo padrão de 120 min, configurável [D §6 "Sessão viva"; P2 decisões 1–3]. **[fatia 2, feito]**
- **Papéis:** executivo (o humano que decide), orquestrador (distribui e integra, pode ter várias frentes), executor (uma frente por vez); `tools/ah papel <orquestrador|executor>` [D §6 "Conceitos"]. **[fatia 2, feito]** (`nucleo/comandos/papel.mjs` existe; L 34).
- O resumo do começo de sessão é curto (limite em caracteres): quem a sessão é, papel, frente, frentes das outras, sobreposições, estado do ramo base, regras em uma linha [D §8]. **[pronto]** para o essencial; sobreposições entram na fatia 2 (tarefa 6, não começada).

### Como aplicar

No Claude Code, o `init` instala os ganchos em `.claude/settings.json`, com o seletor `Bash|PowerShell|Edit|Write|NotebookEdit` [P01 4; `modelos/claude-code/ganchos.json`]. Para conferir: `tools/ah whoami`. Em outro agente, ou à mão: `AH_SESSAO=ana-terminal tools/ah open carrinho` e o mesmo valor no `close` [README].

### Limites e escolhas discutíveis

- **O processo que o gancho vê pode não ser o do agente.** Se o pai do gancho for um shell de vida curta, a sessão parece morta logo depois de registrada, e a proteção some. É o primeiro foco da revisão da fatia 2 [P2 foco 1] e ficou como preocupação a conferir no ensaio final [L 13].
- **Herança só com hora de início conhecida dos dois lados.** No Windows, e no macOS sem `ps`, não há herança por processo: a frente fica passada e pede `ah open` [L 16]. A regra foi decidida contra o que o brief da tarefa pedia, a favor do desenho.
- **A variável do id vaza para agentes filhos.** Um Codex aberto de dentro de um Claude Code enxerga o `CLAUDE_CODE_SESSION_ID` do pai [R-cap, "Detalhes que decidem código", item 2]. `AH_PID_AGENTE` não pode ser herdado por outra sessão [L 18].
- **Uma corrida real achada na construção:** os ganchos regravavam o JSON da sessão a cada interação, e um `Stop` desfazia a frente gravada pelo `open`. A saída foi tirar o sinal de vida para um arquivo próprio [P2 decisão 1].
- **Discutível:** um revisor recusou a sugestão de `AH_SESSAO=<dona>` na mensagem de recusa do `close`, porque ensinava o agente a se passar por outra sessão [L 25]. A referência da fatia 1 ainda traz essa sugestão [R-cmd "close", tabela]: é um bom caso para debater onde termina a saída útil e começa o contorno.

### Ligação com o trabalho final

- **Cenário 5, "O veterano de bolso"** [C 5]: a hipótese de partida é que "o agente 'lembra' bem menos do que parece, e que a maior parte do trabalho seja decidir o que vale a pena guardar". O harness é um caso pronto: decidiu guardar fora do agente só quem a sessão é e qual a frente, e injetar isso num resumo curto [D §8]. O aluno pode usar como contraste (memória do produto × memória do processo de desenvolvimento) ou contestar: o resumo é memória ou é só estado?
- **Enunciado §4, "harness, modelo e versões usados"** [E §4]: a sessão é a unidade natural de registro. O harness grava o modelo da sessão quando o agente informa [D §11 "Ligação com o método"], mas o Claude Code só informa às vezes [R-cap, linha (g)]. O aluno que quiser registrar o modelo por sessão precisa saber disso.

---

## Questão 2. Isolamento do trabalho

### Situação

Três sessões no mesmo checkout. A sessão A edita `src/total.js`; a B roda `git add -A` e commita junto o arquivo pela metade da A; a C faz `git switch main` para conferir uma coisa, e A e B passam a editar o ramo errado sem saber.

### Perguntas para a turma

- Cada agente no seu worktree resolve, ou só adia o conflito para a hora do merge?
- Quem pode mexer no checkout principal, e para quê?
- O que custa um worktree por trabalho: disco, tempo de instalação de dependências, portas, banco?
- Se o agente tem liberdade total no próprio worktree (inclusive `reset --hard`), onde fica o limite?

### Alternativas e trade-offs

| Alternativa | Custo de adotar | Custo de não ter | Quando basta |
|---|---|---|---|
| Todos no mesmo checkout, com cuidado | zero | o cenário acima; perda de trabalho difícil de rastrear | uma sessão por vez |
| Um clone por sessão | disco e um `fetch` por clone; integração por remoto | — | máquinas diferentes, poucas sessões |
| Um worktree e um ramo por frente (git nativo) | criar e limpar worktrees; dependências instaladas de novo em cada um; cada worktree carrega a própria cópia de tudo | — | várias sessões na mesma máquina |
| Contêiner ou VM por sessão | infraestrutura, tempo de subida | — | quando também se quer isolar segurança |

### O que o harness faz

- `tools/ah open <nome>` cria o ramo `feat/<nome>` a partir da base (`dev`) e um worktree próprio, numa pasta fora do projeto [R-cmd "open"; D §5 `worktrees`]. **[pronto]**
- Executor com frente ativa não abre outra [D §6 "Regras do ciclo"]. **[pronto]**
- Travas no checkout principal, que é de todos: T2 recusa `git add -A`, `.`, `-u`, `*` e `commit -a` [R-cmd "gancho"] **[pronto]**; T1 recusa trocar o ramo do checkout principal e T3 recusa descartar trabalho (`reset --hard`, `clean -f`, `stash`, `rebase`) [D §7; P2 levantamento, linhas T1 e T3] **[fatia 2, não começadas]**. No worktree da própria frente, a sessão é livre, inclusive para `rebase`, `stash` e `reset` [D §11 "Escopo das travas"].
- T4 recusa escrever no worktree de outra sessão viva, por git, por comando comum (`rm`, `mv`, `sed -i`, redirecionamento) ou por edição de arquivo; sem liberação nenhuma [D §7; P2 tarefa 13; L 6]. **[fatia 2, não começada]**
- O ponto de entrada sempre executa a cópia do harness do checkout principal, para todas as frentes usarem a mesma versão [D §4 "Mitigação"]. **[pronto]**

### Como aplicar

```
tools/ah open carrinho --tickets 1
# Frente as-1 carrinho aberta.
# Trabalhe em: <worktrees>/carrinho
```
[R-cmd "open"]. O agente trabalha e commita no worktree; integra no checkout principal com `git merge --no-ff feat/carrinho` na `dev` [M-sp "O ciclo de uma frente"].

### Limites e escolhas discutíveis

- **Até a fatia 2 terminar, nada protege o worktree alheio.** Passam `git reset --hard`, `git clean -fd`, `git worktree remove --force`, `git branch -D` e `rm -rf` sobre o trabalho de outra frente [P01 "Para a próxima fatia"; M-sp "As travas desta versão"]. Na aula, isto precisa ser dito: o isolamento hoje é por convenção (pasta separada), não por trava.
- **Cada worktree carrega a própria cópia do harness**; worktrees antigos ficam com cópias velhas. A mitigação (rodar sempre a cópia do principal) é desenho, e a instalação única por máquina ficou para depois [D §4].
- **Caminho escrito de outro jeito** (link simbólico, `..`, `/private/var` × `/var` no macOS, caixa diferente no Windows) precisa ser recusado igual pela T4 [P2 foco 2].
- **Discutível:** o original commitava sozinho os arquivos sujos do checkout principal ao abrir uma frente; aqui o `open` só avisa, para não criar commit que o aluno não pediu [D §6 "Simplificação"]. Ganha-se clareza e perde-se a garantia de que nada ficou para trás.
- **Fora do núcleo:** banco, portas e dependências por worktree são opcionais do projeto 2 [D §2, §3].

### Ligação com o trabalho final

- **Cenário 3, "Três pessoas, quantos agentes?"** [C 3]: a hipótese é que "cada um com o seu agente acelere o começo e complique a integração", e o que observar inclui "conflitos de integração". Worktree por frente é uma alternativa concreta para testar a hipótese: reduz o atropelo durante o trabalho e concentra o conflito no merge. O grupo pode medir onde o conflito apareceu.
- **Cenário 3, "Onde aperta"** [C 3]: "combinem antes quem corrige quando o agente de uma pessoa quebra o código de outra". A T4 é a versão mecânica de um pedaço desse combinado (não escrever no trabalho vivo do outro); o resto (quem corrige depois do merge) continua sendo acordo do grupo.

---

## Questão 3. Quem faz o quê: o quadro e onde mora o estado

### Situação

O grupo mantém um `QUADRO.md` no repositório: cada sessão, ao começar, escreve "estou no carrinho". Depois de uma semana, metade dos commits é atualização do quadro, os merges dão conflito justamente nele, e o agente lê o arquivo inteiro a cada sessão.

### Perguntas para a turma

- O quadro de quem faz o quê é histórico do projeto (vai para o git) ou estado de agora (não vai)?
- O que outra máquina precisa saber, e por qual canal?
- Quanto contexto o agente deve gastar para saber o que os outros fazem?
- Se um arquivo de estado corrompe, quem para de funcionar?

### Alternativas e trade-offs

| Alternativa | Custo de adotar | Custo de não ter | Quando basta |
|---|---|---|---|
| Arquivo versionado no repositório | zero de infraestrutura | commits e conflitos só de quadro; tokens para ler (15% dos commits e cerca de 16 mil tokens por sessão no projeto de origem [D §1]) | uma pessoa, poucos dias |
| Estado local por máquina, fora do git, mais um resumo curto injetado | código para gravar de forma atômica e com exclusão mútua; outra máquina não vê | — | várias sessões numa máquina |
| Rastreador (tickets, rótulos, comentários) como canal entre máquinas | depende de rede e de API externa | trabalho duplicado entre pessoas | várias pessoas |
| Serviço central (banco, servidor de coordenação) | infraestrutura para manter | — | times grandes |

### O que o harness faz

- **Estado fora do git, por máquina,** num diretório do usuário com o nome do projeto (XDG no Linux, `Application Support` no macOS, `LOCALAPPDATA` no Windows; `AH_ESTADO` troca). Um JSON por sessão e por frente, gravado com arquivo temporário e renomeação; exclusão mútua por criação de diretório, com dono e vencimento; `eventos.jsonl` só de acréscimo [D §6 "Estado"]. **[pronto]**
- **Dentro do git ficam só** a linha do histórico de cada frente fechada (`docs/agents/historico-das-frentes.md`, commitada pelo `close`) e, no GitHub, os comentários nos tickets [D §6 "Estado"; R-cmd "close"]. **[pronto]**
- `tools/ah board` mostra ID, nome, dona, estado, tickets, plano e última nota; `tools/ah nota "<texto>"` deixa recado [R-cmd "board", "nota"]. **[pronto]** O quadro passa a acusar frente órfã e sessão ilegível na fatia 2 [L 26–29]. **[fatia 2, feito]**
- **ID curto por pessoa** (`<sigla>-<n>`, como `as-1`), em vez de número em sequência por máquina, que colidia no histórico com várias pessoas [D §11 "Frente com ID curto"]. **[pronto]**
- Resumo curto no começo da sessão em vez de ler o quadro [D §8]. **[pronto]**

### Como aplicar

```
$ tools/ah board
ID    NOME      DONA      ESTADO  TICKETS  PLANO  ÚLTIMA NOTA
as-1  carrinho  sessao-t  ativa   #1       —      mexendo no total
```
[R-cmd "board"]. Para ver o estado cru: a pasta indicada por `AH_ESTADO` (nos testes) ou o diretório de estado do usuário.

### Limites e escolhas discutíveis

- **Um arquivo de frente corrompido derrubava `board`, `open` e `close` de todas as sessões** até ser apagado [P01 "Pendências menores"]. A fatia 2 trata o caso como foco de revisão: o gancho não pode recusar toda ferramenta por causa disso, senão o agente nem consegue apagar o arquivo [P2 foco 3].
- **Uma decisão de projeto bateu no comportamento real:** com a reserva de ticket, chamar o GitHub dentro da trava de estado podia segurá-la de 5 a 20 s, o que derrubaria o começo de sessão, o `close` e o `whoami` das outras sessões. A solução foi reservar em duas fases (estado sob a trava, rede fora, estado de novo) [L 52]. Custo declarado: um estado intermediário a mais que `board`, `sweep` e `doctor` precisam conhecer.
- **Outra máquina não vê o quadro desta.** O canal entre máquinas é o comentário no ticket [D §6 "Estado"]. Quem trabalha sem ticket fica invisível para os outros.
- **Discutível:** histórico commitado (uma linha por frente) e quadro fora do git é uma linha traçada pelo autor; dá para defender que o histórico também é ruído no git.

### Ligação com o trabalho final

- **Enunciado §4, Registro** [E §4]: "o registro vive no repositório git do grupo" e "a data do commit é a prova de que a anotação veio antes do resultado". O harness tira do git justamente o estado de agora e deixa nele só o que é histórico. O aluno pode aproveitar a distinção: o registro da disciplina é histórico (vai para o git, com data); o "quem está fazendo o quê agora" do grupo não precisa ir.
- **Cenário 3, "O que observar em você"** [C 3]: "o que o `AGENTS.md` compartilhado virou ao longo do trabalho". O quadro commitado do projeto de origem é um exemplo do que um arquivo compartilhado pode virar: 15% dos commits [D §1].

---

## Questão 4. Reserva de trabalho entre máquinas e corrida

### Situação

Ana e Carla, cada uma na sua máquina, olham a lista de tickets abertos às 9h. As duas pegam o #2, "frete grátis acima de 200". Às 11h, cada uma tem metade de uma solução diferente.

### Perguntas para a turma

- Reserva tem de ser garantida (ninguém mais pega) ou basta ser um aviso visível?
- Sem rede, deve-se poder abrir trabalho num ticket?
- Se duas reservas acontecem no mesmo segundo, quem ganha, e o que o perdedor faz?
- Reserva que ninguém solta (pessoa sumiu) vence quando?

### Alternativas e trade-offs

| Alternativa | Custo de adotar | Custo de não ter | Quando basta |
|---|---|---|---|
| Combinar no chat do grupo | zero | trabalho duplicado | duas pessoas que conversam o tempo todo |
| Responsável no ticket, posto à mão | um clique | esquece-se de pôr e de tirar | times pequenos e disciplinados |
| Reserva automática no rastreador (responsável, rótulo, comentário com marcador) mais desempate | código, rede obrigatória, casos de corrida | — | várias pessoas e sessões |
| Trava atômica num serviço central | serviço próprio | — | quando duplicar custa muito |

### O que o harness faz

- `tools/ah open <nome> --tickets 1,2` reserva **antes** de criar qualquer coisa: põe a pessoa como responsável, o rótulo de reserva (padrão `em-andamento`) e um comentário com marcador legível por máquina; sem rede, recusa [D §6 "Regras do ciclo"; D §11 "Reserva do ticket"; P2 decisões 6 e 7]. **[fatia 2, implementado e em conserto]** (commit `4228bd1` [L 41]).
- O marcador é a última linha do comentário: `<!-- ah:frente id=as-1 nome=carrinho ramo=feat/carrinho estado=ativa login=ana-souza … v=1 -->`. O **último** marcador de uma frente diz o estado dela no ticket [P2 decisão 6].
- **Corrida:** "a reserva é um aviso, não uma trava atômica: dois `open` no mesmo segundo podem passar, e o segundo descobre ao conferir depois de comentar" [D §11]. Vence a frente cujo marcador ativo é o mais antigo; quem perde comenta `desistencia`, sai de responsável e não cria worktree [P2 decisão 6; P2 foco 4].
- O `close` libera: tira responsável e rótulo e comenta o fechamento; não fecha o ticket, porque fechar é ato de quem integra [D §6 "Regras do ciclo"; P2 tarefa 5].

### Como aplicar

Pré-requisito: `gh` instalado e autenticado (`tools/ah doctor` confere) [R-cmd "doctor"]. Depois, `tools/ah open frete --tickets 2`. Se o #2 já está com outra frente, a recusa diz quem e o que fazer: "combine com @carla-dias, dona da frente cd-4, ou escolha outro ticket" [P2 tarefa 5, interface de `reservar`].

### Limites e escolhas discutíveis

- **A revisão achou um defeito que os testes do implementador não pegavam:** com tickets cruzados (frente A pede #1 e #2, frente B pede #2 e #1), as duas desistiam. A correção pedida foi uma ordem global pelo id do comentário no servidor, com desempate pelo id da frente [L 44–45]. A mesma revisão achou que o próprio login como responsável era recusado, e que o marcador era lido em qualquer lugar do comentário e de qualquer autor [L 46–47]. Estado: conserto despachado, ainda não re-revisado no momento da leitura [L 55].
- **Reserva é aviso.** Duas aberturas no mesmo segundo podem passar; o desenho aceita e manda escrever isso na referência [D §11].
- **Sem rede, `open` com ticket recusa.** É escolha: antes (fatia 1), o `open` seguia com aviso; o teste mudou para "recusa sem criar nada" [T5r "Testes"]. Quem trabalha offline abre sem `--tickets`, sem reserva.
- **Discutível:** depender do GitHub como banco de coordenação (comentários como mensagens, rótulo como trava). Funciona para poucas pessoas; não é o que se faria num sistema com muitas escritas concorrentes.

### Ligação com o trabalho final

- **Cenário 3** [C 3]: grupo de três pessoas, cada uma com agente, sistema grande o bastante para dividir o trabalho. A reserva é a peça que evita duas pessoas no mesmo ticket. O grupo pode decidir se vale o custo (rede, `gh`) ou se combinar no chat basta para três pessoas, e registrar quantas vezes houve duplicação.
- **Enunciado §3, Grupo** [E §3]: "se duas pessoas viveram a mesma tarefa de jeitos diferentes, essa diferença é um dado". A reserva existe para impedir justamente isso no trabalho de produção; no estudo, a duplicação pode ser deliberada. É um bom ponto de discussão: o que é defeito no fluxo de trabalho pode ser método no experimento.

---

## Questão 5. Trava × instrução

### Situação

O `AGENTS.md` diz "nunca faça push para a `main`". No meio de uma tarefa longa, o agente roda `git push origin main` para "publicar a correção". Outra vez, a regra foi seguida, mas o agente rodou `git checkout main && git push`, e ninguém tinha escrito essa forma.

### Perguntas para a turma

- O que deve ser recusado por mecanismo e o que basta recomendar?
- Se a trava quebra (bug, configuração inválida), ela deve deixar passar ou recusar tudo?
- Deve existir um desvio de emergência? Quem autoriza, e o que ele não libera nunca?
- Uma trava que lê o texto do comando é segurança?

### Alternativas e trade-offs

| Alternativa | Custo de adotar | Custo de não ter | Quando basta |
|---|---|---|---|
| Só instrução (`AGENTS.md`, skill) | escrever bem | o agente esquece, interpreta ou acha forma não prevista; falha em silêncio | regras de estilo e de método |
| Permissões do agente (lista de comandos permitidos ou negados) | configurar por agente; regras por padrão de texto | — | comandos inteiros e fáceis de casar |
| Gancho antes da ferramenta, com interpretador de shell | escrever e manter o interpretador; falso positivo e falso negativo | — | regras que dependem de estado (qual ramo, de quem é o worktree) |
| Barreira no servidor (proteção de ramo) | conta ou plano que permita; publicar passa a ser PR | push direto para produção | ramos publicados |
| Caixa de areia (contêiner, usuário sem permissão) | infraestrutura | — | quando o risco é segurança, não engano |

### O que o harness faz

- **Travas como função pura:** entra o comando (ou o caminho do arquivo), o diretório e o estado; sai "permite" ou "recusa" com a explicação e o que fazer no lugar. Um interpretador de shell só serve a todas, e entende encadeamento, subshell, `bash -c`, heredoc e `cd` [D §7 "Travas"]. **[pronto]**
- **As travas e o estado** [D §7; R-cmd "gancho"; P2]:

| Trava | Recusa | Estado |
|---|---|---|
| T0 | comando que menciona git ou gh e não pode ser lido; nome de comando vindo de variável ou crase; gancho que não consegue avaliar | [pronto] |
| T1 | trocar o ramo do checkout principal | [fatia 2, não começada] |
| T2 | `git add` de tudo e `commit -a` no checkout principal | [pronto] |
| T3 | descartar trabalho no checkout principal | [fatia 2, não começada] |
| T4 | escrever no worktree de outra sessão viva | [fatia 2, não começada] |
| T5 | push para ramo protegido em qualquer forma; `gh pr merge` com base protegida | [pronto] |
| T6 | trabalho pesado fora da fila | [planejado, fatia 3] |

- **Gancho que quebra recusa** (o original deixava passar) [D §7]. Saída garantida: um comando que é só uma chamada a `tools/ah` (para rodar o `doctor`) e a edição de `.harness/config.json` sempre passam [D §11 "Saída quando o gancho quebra"]. **[pronto]**
- **Desvio de emergência:** `AH_GUARD=off` no começo do próprio comando, só com ordem do executivo; vale para aquele comando e fica registrado. **Nunca libera a T0** [P01 6; R-cmd "gancho"; `nucleo/lib/travas.mjs:371`]. A T4 na edição de arquivo também não tem liberação: o caminho é `takeover` ou pedir à dona [D §11]. **[pronto]** para T0, T2, T5.
- **Toda recusa diz a saída:** motivo em uma linha e próximo passo concreto; recusa sem próximo passo é defeito, com teste [D §12.4].
- **A barreira de verdade fica no servidor:** o `init` configura proteção de ramo no GitHub para `stage` e `main`; publicar passa a ser PR mesclado com `AH_GUARD=off gh pr merge` por ordem do executivo [D §12.2; R-cmd "Publicar"]. **[pronto]**
- **Regra geral:** o método (etapas, escolha de modelo) nunca é motivo de recusa [D §11 "Regra geral"; N "Escolha de modelos"].

### Como aplicar

Demonstrável sem agente, alimentando o gancho à mão [R-cmd "gancho"]:

```
$ echo '{"session_id":"abc","hook_event_name":"PreToolUse","cwd":"<projeto>","tool_name":"Bash","tool_input":{"command":"git add -A"}}' | tools/ah gancho claude-code
Recusado (T2): git add com tudo (-A, ., -u, *, a raiz) no checkout principal leva junto o trabalho de outras frentes
Faça: git add <caminhos> com só os arquivos que você mudou (e git commit sem -a), ou trabalhe no worktree da frente
$ echo $?
2
```

Com o agente real, o ensaio pediu `git add -A` e `git push origin main`; as duas recusas chegaram ao modelo com o motivo literal, ele não tentou contornar, e o `eventos.jsonl` registrou um `sessao-inicio`, uma recusa T2 e uma T5 [R-ens "Resposta do agente", "Eventos gravados"].

### Limites e escolhas discutíveis

- **As travas leem o texto; não são caixa de areia** [D §7 "Limite a declarar"]. Passam sem recusa, por exemplo: `xargs git add`, apelidos do git, `gh api …/merge`, `$G push` [P01 "Pendências menores"; R-cmd "Limites"].
- **Falso positivo real:** `git switch main && git pull && git switch dev && git push` é recusado pela T5, embora o push rode na `dev` [P01 "Pendências menores"]. Caminho com `$` entre aspas simples cai na T2 [idem].
- **T0 é recusa por não entender.** Só recusa quando o texto menciona git ou gh; o resto passa [P01 5]. É uma escolha entre prender o agente e deixar passar o que não se leu.
- **Sem harness no ramo, sem trava.** Com o checkout principal num ramo que não tem `tools/ah`, o gancho não existe e nada é recusado; ficou como limite documentado, porque recusar tudo prenderia o agente [P01 11].
- **Discutível:** `AH_GUARD=off` e `takeover --confirmado` são acordos de confiança: o agente pode digitar o prefixo sem ordem nenhuma. O registro em `eventos.jsonl` é a contrapartida [L 5].
- **No Windows nativo** as travas de comando não valem; o requisito é WSL2 [D §12.7].
- **Proteção de ramo não existe em repositório privado de conta Free** do GitHub [R-cap "Proteção de ramo no GitHub"]; nesse caso o `doctor` diz que só a trava local protege [D §12.2].

### Ligação com o trabalho final

- **Cenário 9, "Um plugin para o DSH"** [C 9]: a curiosidade é "transformar a minha metodologia em código, dentro do harness, em vez de só escrevê-la como instrução", e a hipótese é que isso "me obrigue a decidir coisas que, escritas como instrução no `AGENTS.md`, ficavam vagas". É a ligação mais direta da aula. O harness tomou a decisão inversa para o método: "o harness sugere e registra; só as travas recusam. O método é recomendação" [N "Decididas pelo autor"]. O grupo pode aproveitar a fronteira (o que vira código e o que fica instrução) e contestá-la: por que proteger o trabalho dos outros vira trava e "teste antes do código" não?
- **Enunciado §1, "Um harness"** [E §1]: "consigo montar um modo de trabalho meu, a partir das skills e metodologias que já existem?". O harness mostra uma peça que skill nenhuma dá: gancho que recusa antes de executar.
- **Cenário 1, "O balcão que responde"** [C 1] e a aula 03 (gate de aprovação humana; `aulas/03-api-llm-primeiro-agente/README.md`): `AH_GUARD=off` e `takeover --confirmado` são aprovação humana antes da ação, em forma de prefixo registrado. Diferença a discutir: no cenário 1 o humano aprova cada resposta; aqui o humano autoriza a exceção, e o caminho normal não passa por ele.
- **Cenário 4, "A portaria das skills"** [C 4]: "a skill inspecionada pode trazer instruções para enganar o revisor". A T0 recusa o que não consegue ler, mas a referência declara que a trava não é caixa de areia [R-cmd "Limites"]. O grupo pode usar a lista de formas que escapam (P01) como exemplo de falso negativo.

---

## Questão 6. Sessão que morre, troca de dono, passagem de bastão

### Situação

A sessão de Ana trava às 16h com a frente do carrinho ativa. No dia seguinte, o quadro ainda diz "carrinho: sessão de Ana, ativa". Carla quer continuar o carrinho. Em outra máquina, Ana quer retomar o que deixou pela metade no notebook.

### Perguntas para a turma

- Como saber que uma sessão morreu, e não está só pensando há 40 minutos?
- Quem pode tirar uma frente de uma sessão: qualquer sessão, só um humano, ninguém?
- O que precisa estar escrito para outra pessoa retomar sem perguntar nada?
- Retomar em outra máquina exige o quê: ramo no remoto, estado, as duas coisas?

### Alternativas e trade-offs

| Alternativa | Custo de adotar | Custo de não ter | Quando basta |
|---|---|---|---|
| Ninguém tira; espera-se a pessoa | zero | "em andamento" para sempre [D §1, "Linha morta"] | uma pessoa |
| Prazo: depois de X horas sem sinal, a frente fica livre automaticamente | definir o prazo; falso positivo em sessão lenta | — | sessões curtas |
| Tomada explícita, com confirmação humana | um passo a mais; alguém precisa decidir | — | várias sessões |
| Passagem de bastão planejada (empurra o ramo, escreve o estado no ticket) | disciplina de rodar o comando antes de parar | quem retoma não acha o estado [D §1] | várias pessoas e máquinas |

### O que o harness faz

- **Sinal de vida** e processo vivo decidem se a dona está viva (questão 1). **[fatia 2, feito]**
- `tools/ah handoff [--nota]`: exige worktree limpo e no ramo da frente, empurra o ramo, comenta no ticket a passagem com os últimos commits, o plano e o comando para retomar; a frente fica "passada" e sem dona; a reserva continua [D §6; P2 levantamento, linha "Passagem de bastão"; P2 tarefa 7]. **[fatia 2, não começado]**
- **Retomar é o próprio `open <nome>`:** na mesma máquina, pelo estado local; em outra, pelo ramo no remoto e pelo marcador de passagem no ticket, que reconstrói a frente com o mesmo ID [D §11 "Retomar uma frente passada"; P2 tarefa 8]. **[fatia 2, não começado]**
- `tools/ah takeover <nome>`: só para frente ativa cuja dona morreu; sem `--confirmado`, mostra dona, motivo da morte e idade do sinal e recusa com "peça ao executivo que confirme" [P2 decisão 8; P2 tarefa 10]. **[fatia 2, não começado]**
- `tools/ah sweep [--reparar]`: lista o que está fora do lugar (worktree sem frente, frente órfã, sessão morta); `--reparar` só conserta o estado, nunca apaga worktree nem ramo [D §6; P2 tarefa 11]. **[fatia 2, não começado]**
- `open --para <sessão>`: o orquestrador abre frente para outra sessão viva [D §11; P2 tarefa 9]. **[fatia 2, não começado]**
- `close` de frente cuja sessão dona já encerrou é aceito, com as mesmas conferências [P01 10]. **[pronto]**

### Como aplicar

Hoje (fatia 1 e o que já entrou da 2): `tools/ah board` mostra frentes órfãs; `tools/ah close <nome>` fecha a de uma sessão encerrada. Quando a fatia 2 terminar, o ciclo previsto é:

```
tools/ah handoff --nota "falta o frete"
# Frente as-1 carrinho passada.
# Para retomar: tools/ah open carrinho
```
[P2 tarefa 7, "Saída"].

### Limites e escolhas discutíveis

- **Prazo do sinal é 120 min por padrão** [P2 decisão 2]: uma sessão viva e parada há mais tempo parece morta; uma morta parece viva por até duas horas, se o processo também não sumiu.
- **Sessão antiga retomada depois de um `takeover`** (`--resume` de ontem) não pode recuperar a frente; é foco de revisão e teste [P2 foco 5].
- **Frente sem ticket só se retoma na mesma máquina** [P2 decisão 9].
- **Discutível:** `--confirmado` é um acordo de confiança, porque o gancho não tem como perguntar a um humano [L 5]. O agente pode passar a opção sozinho.

### Ligação com o trabalho final

- **Enunciado §4, Registro** [E §4]: "onde travou, o que precisou aprender". O comentário de passagem de bastão é um formato pronto de registro de parada: o que ficou, os últimos commits, o plano, o comando para retomar [P2 tarefa 7]. O grupo pode adotar o formato à mão, sem o harness.
- **Cenário 3** [C 3]: quando uma pessoa do grupo some por dois dias, a frente dela é o caso de tomada. O grupo pode combinar a regra antes (quem pode assumir, depois de quanto tempo) e registrar se precisou usá-la.
- **Plano de encontros, encontro 13** [PE]: "recuperar falha parcial". Sessão morta com trabalho no meio é a falha parcial mais comum neste contexto.

---

## Questão 7. Sobreposição de arquivos: avisar ou recusar

### Situação

A frente do carrinho e a frente do cupom mexem em `src/total.js`. Nenhuma sabe da outra até o merge, quando o conflito aparece e uma das duas precisa refazer meia tarde de trabalho.

### Perguntas para a turma

- Duas frentes tocando o mesmo arquivo é erro, risco ou normal?
- Avisar antes basta? Quem lê o aviso, a pessoa ou o agente?
- Declarar antes quais caminhos a frente vai tocar é realista?

### Alternativas e trade-offs

| Alternativa | Custo de adotar | Custo de não ter | Quando basta |
|---|---|---|---|
| Nada; resolve-se no merge | zero | retrabalho descoberto tarde | frentes em partes distantes do código |
| Aviso calculado pelo que cada frente já mudou (diff do ramo) | um `git diff` por frente a cada quadro | — | várias frentes no mesmo módulo |
| Declaração de intenção (`--caminhos <globs>`) com aviso na abertura | a pessoa ou o agente precisa prever | — | quando a previsão é fácil |
| Trava por arquivo (lock) | bloqueia trabalho legítimo; lock esquecido | — | arquivos que não aceitam merge (binários) |

### O que o harness faz

- **Aviso, nunca recusa.** A sobreposição é calculada pelo que cada frente ativa já mudou em relação à base (commits do ramo e mudanças não commitadas no worktree) e aparece no quadro (coluna `SOBREPÕE`) e no resumo da sessão. No `open`, a frente nova ainda não tocou nada: ele mostra as notas das frentes ativas e, com `--caminhos <globs>`, avisa quem já mexe nesses caminhos [D §11 "Sobreposição de arquivos"; P2 tarefa 6]. **[fatia 2, não começado]**
- `tools/ah nota` já existe e aparece no quadro [R-cmd "nota"]. **[pronto]**

### Como aplicar

Hoje: `tools/ah nota "mexendo no total"` e ler a coluna de notas do `board`. Previsto: `tools/ah open cupom --caminhos 'src/**'` → `Atenção: as-2 frete já mudou 1 arquivo(s) de --caminhos: src/total.js` [P2 tarefa 6, testes].

### Limites e escolhas discutíveis

- **O aviso não impede nada.** É coerente com a regra geral (só recusa o que protege o trabalho dos outros), mas sobreposição é, de certo modo, risco ao trabalho dos outros. Bom ponto de debate.
- **Arquivo, não trecho.** Duas frentes no mesmo arquivo em funções diferentes geram aviso e merge limpo.
- **Só vê o que está nesta máquina.** Frentes de outra pessoa entram no cálculo só se o ramo estiver no remoto e a frente no estado local; o desenho não diz como tratar frente de outra máquina aqui [D §11] (ver Lacunas).

### Ligação com o trabalho final

- **Cenário 3, "O que observar em você"** [C 3]: "conflitos de integração". O grupo pode contar os conflitos e anotar se teriam sido evitados com um aviso antes. Isso dá uma medida para a hipótese "complica a integração", sem precisar do harness.

---

## Questão 8. Recurso escasso da máquina

### Situação

Três sessões rodam a suíte de testes ao mesmo tempo, e uma quarta roda o build. A memória acaba e o sistema mata o editor, as sessões e o banco [D §1, "Máquina derrubada"].

**O incidente da fatia 2 (real, registrado no ledger):** durante a execução, a suíte de testes do próprio harness deixou 5471 pastas `/tmp/ah-teste-*` e estourou a cota do `/tmp` da máquina [L 42]. O implementador da tarefa 5 percebeu, não apagou nada fora do que lhe era permitido, rodou a suíte com `TMPDIR` apontado para outra pasta e escreveu no relatório que "teste que falha não limpa" [T5r "Preocupações"]. O controlador apagou as sobras, mudou a regra para todos os implementadores (`TMPDIR` no temporário do job e apagar as sobras ao terminar) e pediu limpeza automática no conserto da tarefa 4 [L 42; RT 10]. Depois do conserto, a suíte rodou "sem sobras no TMPDIR" [L 53].

### Perguntas para a turma

- Quem é dono de um recurso da máquina (memória, disco, temporário, porta) quando há cinco sessões nela?
- O agente deve saber que outra sessão está rodando o build, ou isso é problema do sistema operacional?
- Fila, limite por processo ou "cada um se vira"?
- Quanto tempo de espera é aceitável para não derrubar a máquina?

### Alternativas e trade-offs

| Alternativa | Custo de adotar | Custo de não ter | Quando basta |
|---|---|---|---|
| Nada; cada sessão roda o que quiser | zero | máquina derrubada; sessões e banco mortos; disco cheio | uma sessão |
| Instrução ("não rode e2e em paralelo") | escrever | o agente esquece; ninguém vê os outros | poucas sessões, comandos leves |
| Fila de trabalho pesado por máquina, com vagas e classes | código, configuração, espera | — | várias sessões com builds e testes pesados |
| Limite do sistema (cgroups, cotas, contêiner) | configuração por sistema operacional | — | infraestrutura própria |
| Limpeza automática no próprio teste | disciplina em cada teste novo | temporário cheio (incidente acima) | sempre |

### O que o harness faz

- `tools/ah pesado -- <comando>` espera a vez, roda e devolve saída e código. Vagas e classes vêm da configuração ("exclusivo" ocupa todas; comando não reconhecido cai na classe mais restritiva); memória livre mínima para rodar ao lado de outro; ordem de chegada com senha, sem ultrapassar indefinidamente quem precisa de todas as vagas; ao receber sinal de término, mata a árvore inteira do comando antes de soltar a vaga; a fila é da máquina, não do projeto [D §7 "Fila de trabalho pesado"; D §11 "Fila de pesado entre projetos"]. T6 recusa trabalho pesado fora da fila [D §7]. **[planejado, fatia 3]**
- O que já existe: o estado do harness e os testes usam `node:os` e `node:path`, nunca `/tmp` fixo [P2 restrições globais, linha 20]; a regra do `TMPDIR` e da limpeza é processo, não peça do harness [RT 10].

### Como aplicar

Hoje, sem a fatia 3: limite à mão quantas sessões rodam testes ao mesmo tempo; aponte `TMPDIR` para uma pasta própria e apague as sobras ao fim; registre limpeza em cada teste que cria pasta (`t.after`) [RT 10].

### Limites e escolhas discutíveis

- **A fila não existe ainda.** A aula pode mostrar o desenho e o incidente; não pode demonstrar a peça.
- **O incidente não foi de memória, foi de temporário.** A fila de pesado, como desenhada, não teria evitado: o problema era teste que não limpava. Isso mostra que "recurso escasso" é mais largo que a peça planejada.
- **Discutível:** fila da máquina e não do projeto [D §7] significa que dois projetos do aluno na mesma máquina disputam as vagas, o que é o comportamento desejado mas pode surpreender.

### Ligação com o trabalho final

- **Cenário 2, "O manual que cabe no notebook"** [C 2]: "limites de hardware" e modelo local numa máquina fraca. Ligação fraca: o recurso ali é do produto, não do processo de desenvolvimento. Só vale se o grupo rodar várias sessões de agente e o modelo local na mesma máquina.
- **Enunciado §4, cuidados** [E §4]: "rodem skills, distribuições e código de terceiros em ambiente descartável". O incidente mostra que o próprio código de teste pode encher a máquina; o ambiente descartável também protege disso.
- **Enunciado §1, "Você: o que eu delego e depois tenho de refazer?"** [E §1]: o incidente é um caso de efeito colateral que ninguém pediu, descoberto por um subagente e resolvido por quem coordena. Bom exemplo de como registrar um imprevisto (o que aconteceu, o que se mudou, o custo).

---

## Questão 9. Falha da rede e do servidor

### Situação

Ana fecha a frente às 18h, sem internet no ônibus. O `close` precisa comentar no ticket e tirar o rótulo de reserva. O GitHub não responde. A frente some do estado local, mas o ticket continua dizendo "em andamento com Ana".

### Perguntas para a turma

- Uma operação que mexe no estado local e no servidor deve falhar inteira ou fazer o que dá?
- O que pode ficar para depois sem estragar nada, e o que não pode?
- Mandar duas vezes o mesmo comentário é pior ou melhor que não mandar?

### Alternativas e trade-offs

| Alternativa | Custo de adotar | Custo de não ter | Quando basta |
|---|---|---|---|
| Recusar tudo sem rede | simples | não se trabalha offline | operações que precisam de resposta (reservar) |
| Fazer o local e esquecer o remoto | simples | ticket com estado errado para sempre | nunca |
| Fila de pendentes reenviada depois ("pelo menos uma vez") | código da fila, ordem, erro permanente × passageiro, risco de duplicar | — | comentários e edições que podem esperar |
| Transação distribuída | complexo demais para o caso | — | — |

### O que o harness faz

- **Fila de comentários e edições pendentes:** falha passageira fica na fila em ordem; erro permanente (ticket inexistente) é estacionado; reenvio em todo comando; vale também para a edição de responsável e rótulo [D §6 "Estado"; P2 levantamento, linha "Fila de comentários"]. **[fatia 2, feito]** (tarefa 4 completa [L 56]).
- **O que não vai para a fila:** a reserva no `open`. Sem rede, `open` com ticket recusa, porque reservar exige saber se outro já reservou [D §6 "Regras do ciclo"; T5r "Testes"].
- O gancho consulta o servidor (`gh pr view`) só para `gh pr merge`, com prazo de 5 s; sem resposta, recusa [P01 7]. **[pronto]**

### Como aplicar

Nada a fazer: o reenvio roda em todo comando `tools/ah`. O `sweep` previsto lista os pendentes [P2 levantamento, linha "sweep"].

### Limites e escolhas discutíveis

- **Achados da revisão da fila** [L 35–40]: um erro permanente com texto diferente do esperado travava a fila sem aviso; o `close` podia duplicar o comentário se enfileirar falhasse; o `gh` falso dos testes aceitava rótulo e campo desconhecidos, então os testes passavam onde o real falharia. Todos consertados e re-revisados [L 53, 56].
- **Pendências para a revisão final:** "rede reconhecida por texto" (a distinção entre falha passageira e permanente depende da mensagem do `gh`) [L 54].
- **Discutível:** "pelo menos uma vez" aceita comentário duplicado como mal menor. É a escolha usual em filas; vale discutir por quê.

### Ligação com o trabalho final

- Não há ligação direta com os cenários. A mais próxima é o **Cenário 2** [C 2], "sem internet, não há modelo maior para socorrer": lá a falta de rede é do produto. Não force.

---

## Questão 10. Agnosticismo de agente

### Situação

No grupo, uma pessoa usa Claude Code, outra usa OpenCode (o da disciplina [HD]), a terceira usa Codex. A regra "não empurre para a `main`" precisa valer para as três.

### Perguntas para a turma

- A mesma lógica de travas pode valer em três agentes que expõem eventos diferentes?
- O que fazer com um agente que não deixa recusar antes de executar?
- Quem escreve o adaptador de um agente novo: quem mantém o harness, ou o próprio agente?

### Alternativas e trade-offs

| Alternativa | Custo de adotar | Custo de não ter | Quando basta |
|---|---|---|---|
| Um agente só para o grupo | perde-se a escolha | — | grupo que concorda |
| Núcleo com contrato de eventos e adaptador fino por agente | escrever e ensaiar cada adaptador | regras diferentes por pessoa | grupo misto |
| O próprio agente escreve o adaptador seguindo um roteiro e testes de contrato | roteiro e testes bons; confiança no resultado | — | agentes que o mantenedor não usa |
| Só regras no servidor (proteção de ramo, CI) | nada local | aviso tardio, já no push | complemento sempre |

### O que o harness faz

- **Contrato de quatro eventos** (começo de sessão, sinal de vida, antes de ferramenta, fim de sessão), com entrada e saída em JSON normalizadas; o adaptador só traduz [D §8]. **[pronto]**
- **Adaptador do Claude Code**, ensaiado com o agente real (Claude Code 2.1.319) [R-ens; README]. **[pronto]**
- **Tabela de capacidades** do Claude Code, do Codex e do OpenCode, com fontes oficiais e ensaio [R-cap]. Resultado: os três permitem recusar antes de comando e de edição; o OpenCode não tem evento de começo nem de fim de sessão com origem (o contexto entra por um gancho que roda antes de cada chamada ao modelo); o Codex só roda ganchos do projeto depois de a pasta e cada gancho serem confiados [R-cap, tabela e "O que não fica coberto"]. **[pronto]** (documento).
- **Outros agentes se adaptam sozinhos:** o autor decidiu que o harness não traz adaptadores do Codex e do OpenCode prontos. A fatia 4 entrega um roteiro em `docs/agentes/`, testes de contrato que todo adaptador precisa passar, um ponteiro no `AGENTS.md` e um item no `doctor` que diz quando as travas não valem [D §15]. **[planejado, fatia 4]**
- **Sem adaptador**, o `ah` funciona com `AH_SESSAO`, sem travas automáticas e sem resumo [D §8]. O `init` hoje só aceita `--agentes claude-code` [R-cmd "init", tabela de recusas]. **[pronto]**

### Como aplicar

Com Claude Code: `node <clone>/nucleo/bin/ah.mjs init` e `tools/ah doctor` [README]. Com OpenCode ou Codex, hoje: os comandos funcionam com `AH_SESSAO=<nome>`; as travas automáticas, não. A tabela de capacidades diz o que um adaptador do OpenCode teria de usar (plugin em `.opencode/plugins/`, `execute.before` lançando exceção para recusar) [R-cap, linhas (a)–(c), (h)].

### Limites e escolhas discutíveis

- **Paridade é resultado da sondagem, não promessa** [D §12.3].
- **Codex e OpenCode não foram ensaiados com o harness**; a coluna deles vem da documentação e de uma sonda mínima [P01 "Não ensaiado"; R-cap "Ensaio"]. No Codex, a sonda não conseguiu fazer os ganchos do projeto rodarem sem confiança [R-cap "Ensaio"].
- **O ensaio com o Claude Code foi feito antes da onda final de consertos** e sem `--setting-sources project` [P01 "Não ensaiado"; R-ens "Execução"].
- **Discutível (decisão do autor):** deixar o agente escrever o próprio adaptador transfere para o aluno um trabalho que o mantenedor não testou [D §15]. Para a turma, que usa OpenCode [HD], isso significa que o harness, hoje, não protege o agente que ela usa.

### Ligação com o trabalho final

- **Cenário 9** [C 9]: escrever um plugin que põe um método em prática dentro de um harness. Escrever o adaptador do OpenCode para o `agent-harness`, seguindo a tabela de capacidades, é um trabalho do mesmo tipo (estender o harness por dentro, por eventos), com o contrato já definido. Depende de a fatia 4 existir ou de o aluno trabalhar só com a tabela (ver Lacunas).
- **Cenário 7, "O meu harness"** [C 7]: "Tocam em hooks". O contrato de quatro eventos é um modelo pequeno do que um harness precisa interceptar.

---

## Questão 11. Custo do método

### Situação

Para uma mudança de três linhas, o agente escreve uma especificação, um plano de oito tarefas, despacha um subagente por tarefa e um revisor para cada uma. Gasta uma tarde e muitos tokens. Em outra frente, sem plano nenhum, o agente reescreve metade do módulo e ninguém revisa.

### Perguntas para a turma

- Quando spec e plano compensam, e quando são peso?
- Subagentes dentro de uma sessão ou várias sessões em paralelo: o que muda em custo, controle e revisão?
- Modelo grande para tudo, ou modelo por tarefa? Quem decide?
- O harness deve recusar trabalho sem plano?

### Alternativas e trade-offs

| Alternativa | Custo de adotar | Custo de não ter | Quando basta |
|---|---|---|---|
| Sem método: pedido direto ao agente | nenhum | retrabalho; nada para revisar contra | mudanças de um commit |
| Plano de partida curto | escrever o plano | — | a maior parte do trabalho |
| Spec, plano, execução por subagentes com revisão por tarefa | tempo, tokens, revisão de quem decide | defeitos descobertos tarde | mudança de desenho |
| Várias sessões em paralelo, uma frente cada | atenção de quem coordena; integração | — | trabalho independente e grande |

### O que o harness faz

- **Nunca recusa por método nem por modelo** [D §11 "Regra geral"; N "Escolha de modelos"].
- `tools/ah open --plano <arquivo>` guarda o caminho do plano na frente; quadro e resumo mostram [D §11 "Ligação com o método"; R-cmd "open"]. **[pronto]**
- **Trilhas por tamanho** (um commit; plano de partida; spec e plano; investigação longa), com a leve como padrão do aluno; o `AGENTS.md` instalado diz quais skills entram em cada trilha, para não carregar texto à toa [N "Peso do método"]. **[planejado, projeto 2]**
- **Níveis de modelo neutros** (alto, médio, leve), traduzidos na configuração por agente; o plano marca o nível de cada tarefa; `ah modelo <nível>` como extensão; o modelo de cada sessão vai para o quadro, para medir uso de modelo grande em trabalho pequeno [N "Escolha de modelos"]. **[planejado]**
- **Construção em fatias:** cada fatia termina utilizável e com teste; a seguinte só começa depois [D §12.1]. É o próprio método aplicado ao harness.
- **Custo declarado:** "cada sessão e cada subagente a mais consome tokens e pede revisão de quem decide; o número de sessões é escolha de quem usa" [D §12.6].

**O método em uso, na fatia 2** (fonte de primeira mão): implementadores e revisores em um modelo grande, por ordem do autor; tarefas mecânicas em um modelo médio [L 3]. Um implementador por vez; o implementador não despacha subagente nem revisor [RT 7]. Cada tarefa passa por revisão de conformidade e de qualidade, e por um conserto e uma re-revisão quando há achados [L 9–56]. O ledger registra cada decisão do controlador como "Ruling", com o custo se ela estiver errada [L 4–8, 16–17, 29, 52].

### Como aplicar

Para o projeto do aluno: escolha a trilha pelo tamanho da mudança; registre no plano o nível de modelo de cada tarefa; se usar subagentes, mantenha um ledger no formato "decisão — motivo — custo se errado" [L 4]. `tools/ah open <nome> --plano docs/plano.md` liga a frente ao plano.

### Limites e escolhas discutíveis

- **Não há medida de custo no material.** O ledger não registra horas nem tokens por tarefa; `board --numeros` está planejado [D §12.5]. A aula não pode dizer quanto a fatia 2 custou.
- **Duas coleções de skills carregam muito texto no contexto** [N "Peso do método"]: o próprio autor reconhece o peso.
- **Discutível:** a regra "nunca recusar por método" deixa o método inteiramente na mão de quem usa. Em turma, isso pode significar ninguém usar.

### Ligação com o trabalho final

- **Cenário 6, "Especificação antes do código"** [C 6] e **Enunciado §1, "Um método"** [E §1]: a hipótese é que a spec ajuda no começo e vira peso quando o pedido muda. O desenho do harness mudou no meio do caminho, e o documento registrou as mudanças como seções novas que prevalecem sobre as anteriores: "§12 Ajustes depois da avaliação do desenho" ("onde esta seção e as anteriores divergirem, vale esta") e "§15 Outros agentes se adaptam sozinhos", que anula partes da §8 e da §14 [D §12, §15]. O plano da fatia 2 reviu uma decisão da fatia 1 (`/clear`) [P2 decisão 5]. O aluno pode aproveitar o padrão (spec viva com precedência explícita) ou contestá-lo (ler uma spec com seções que se anulam custa mais do que reescrevê-la).
- **Cenário 7, "O meu harness"** [C 7]: a hipótese é "acabe tirando boa parte das peças que copiei". O desenho tem um episódio parecido: depois de uma avaliação franca, o autor reorganizou a construção em fatias e cortou os adaptadores prontos de dois agentes [D §12, §15]. Também: "Seria fracasso: uma peça que o aluno não consiga ler e explicar" [D §3].
- **Enunciado §4, "horas e gasto com modelos"** e "definam um teto de gasto" [E §4]: o harness não mede gasto hoje. O aluno que usar subagentes precisa registrar à mão.
- **Cenário 8, "Será que dá mesmo em uma semana?"** [C 8]: ligação fraca. As fatias são uma forma de garantir "algo utilizável" a cada etapa, mas o material não registra prazos previstos × realizados.

---

## Questão 12. Verificação: "pronto" com prova e revisão independente

### Situação

O agente diz "pronto, todos os testes passam". A pessoa integra. No dia seguinte, outra sessão descobre que a reserva de ticket desiste dos dois lados quando dois tickets são pedidos em ordem cruzada.

### Perguntas para a turma

- O que conta como prova de "pronto": a frase do agente, o comando e a saída, a CI?
- Quem revisa o que o agente fez: o mesmo agente, outro agente, a pessoa?
- Revisor que leu o raciocínio do implementador acha menos defeitos?
- Teste que passa contra um falso (`gh` falso) prova o quê?

### Alternativas e trade-offs

| Alternativa | Custo de adotar | Custo de não ter | Quando basta |
|---|---|---|---|
| Confiar na frase do agente | zero | defeito integrado | nunca |
| Comando e saída no PR ou no ticket | colar a saída | "pronto" sem prova | sempre, como mínimo |
| Revisão pelo mesmo agente | barata | vê o que já pensou | mudanças pequenas |
| Revisão independente (outro agente, sem o contexto do implementador) | tokens, tempo, consertos | defeitos de desenho e de borda passam | mudanças com corrida, estado, segurança |
| Ensaio com o agente real | credenciais, máquina do autor | contrato errado com o agente | adaptadores e travas |

### O que o harness faz

- **"Pronto" exige comando e saída**, como regra do `AGENTS.md` que o projeto 2 instala [N "Proposta de integração das skills"]. **[planejado, projeto 2]**
- **Cada tarefa termina com** `node --test teste/` passando, a varredura de termos com código 0 e um commit por caminho [P2 restrições globais; RT 5].
- **`tools/ah doctor`** confere 15 itens e ensaia uma recusa de verdade ("gancho responde") [R-cmd "doctor"]. **[pronto]**
- **Ensaio com o agente real** guardado na documentação, com versão e data [D §8 "Prova de cada adaptador"; R-ens]. **[pronto]** para o Claude Code.
- **Revisão independente por tarefa** na execução da fatia 2 (conformidade com o plano e qualidade). Casos reais do ledger:

| Tarefa | O que o revisor achou | Fonte |
|---|---|---|
| 1, sessão viva | 5 achados, entre eles a hora de início lida pelo `ps` em fuso e idioma locais, `AH_PID_AGENTE` faltando nos testes e falta de um teste com dois processos | L 10 |
| 2, herança | herança por processo sem conferir a hora de início dos dois lados; o controlador decidiu contra o brief, a favor da spec ("na dúvida, não") | L 15–16, 21 |
| 3, papel e quadro | a recusa do `close` sugeria `AH_SESSAO=<dona>` (ensinar o agente a se passar por outra sessão); sessão ilegível derrubava o quadro; frente sem dona não aparecia como órfã | L 24–28 |
| 4, fila de pendentes | erro permanente com outro texto travava a fila sem aviso; comentário podia sair duplicado; o `gh` falso aceitava o que o real recusaria | L 35–40 |
| 5, reserva | tickets cruzados: as duas frentes desistiam; o próprio login era recusado; marcador lido de qualquer autor; chamada de rede dentro da trava de estado | L 44–52 |

Nas cinco tarefas a revisão pediu conserto. Nas quatro primeiras, o conserto foi re-revisado antes de a tarefa ser dada como completa [L 11, 23, 34, 56]; na quinta, o conserto estava despachado e ainda sem re-revisão no momento da leitura [L 55]. A contagem de testes subiu de 410 para 487 nesse trecho [L 9, 53].

### Como aplicar

No projeto do aluno: toda afirmação de "pronto" vem com o comando e a saída colados (no commit, no PR ou no registro). Se usar subagentes, despache o revisor com o diff e o plano, não com a conclusão do implementador. `tools/ah doctor` no fim da preparação, com a saída no registro [D §6 "ah doctor"].

### Limites e escolhas discutíveis

- **Teste contra falso prova o falso.** O revisor da tarefa 4 achou que o `gh` falso aceitava rótulo e campo desconhecidos [L 40]: os testes passavam onde o `gh` real recusaria.
- **Windows e macOS nunca rodaram** os testes de verdade; a CI nos três sistemas está no desenho [D §3, §10], mas o registro diz "não executado" [P01 "Não ensaiado"].
- **Discutível:** revisão por um modelo do mesmo fornecedor e do mesmo tamanho que o implementador [L 3]. Independente de contexto não quer dizer independente de vieses.

### Ligação com o trabalho final

- **Enunciado §8, Avaliação** [E §8]: "Evidência: o que o artigo afirma aparece no registro feito durante o trabalho" e "o trabalho fica insuficiente se o artigo afirma o que o registro não mostra". "Pronto com comando e saída" é a mesma regra aplicada ao código. O ledger (`progress.md`) é um exemplo de registro feito durante o trabalho, linha a linha, com decisões e achados na hora em que aconteceram.
- **Enunciado §8, Domínio** [E §8]: "Você explica a parte que fez". O desenho do harness tem a regra equivalente para o código: uma peça que não se consegue ler e explicar é fracasso [D §3].
- **Enunciado §1, "Você: o que eu delego e depois tenho de refazer?"** [E §1]: a tabela de achados acima é um caso concreto de "o que o agente fez e o revisor mandou refazer", com a causa de cada um.
- **Enunciado §4, cuidados, ambiente descartável** [E §4]: o ensaio com o agente real rodou num repositório descartável, sem remoto [R-ens "Preparo"; R-cap "Ensaio"].

---

## Questão 13. Fechar sem perder trabalho e publicar só com ordem

### Situação

A sessão termina a frente, apaga o worktree e o ramo. Um commit não tinha sido integrado; um `.env` ignorado pelo git, com a configuração local, sumiu junto. Em outro dia, o agente empurra a `dev` para a `main` "para publicar".

### Perguntas para a turma

- O que precisa ser conferido antes de apagar o lugar de trabalho de alguém?
- Quem fecha o ticket: quem trabalhou ou quem integrou?
- Publicar é um passo técnico ou uma decisão? De quem?

### Alternativas e trade-offs

| Alternativa | Custo de adotar | Custo de não ter | Quando basta |
|---|---|---|---|
| Apagar o worktree à mão | zero | commits e arquivos ignorados perdidos | quem sabe exatamente o que tem |
| `close` que confere (commits na base ou no remoto, worktree limpo, ignorados listados) | código de conferência; recusas | perda silenciosa | sempre |
| Fluxo `dev` livre, `stage` e `main` só por PR com ordem | um ramo a mais; PRs | publicação acidental | projetos com publicação |

### O que o harness faz

- `tools/ah close` só roda no checkout principal, na base, depois do merge; confere que nada se perde (worktree limpo, commits já na base ou no remoto, nenhum ignorado que sumiria; `--descartar-ignorados` aceita perdê-los); libera os tickets antes de apagar; não fecha o ticket; grava a linha do histórico com um commit; nunca empurra [D §6; R-cmd "close"]. **[pronto]**
- Fluxo de ramos: `dev` é a base e é livre; `stage` publica em teste e `main` em produção; os dois protegidos [D §11 "Fluxo de integração padrão"; D §12.2; M-sp "Fluxo de ramos"]. **[pronto]**

### Como aplicar

```
git merge --no-ff feat/carrinho        # no checkout principal, na dev
git push origin dev
tools/ah close --resumo "soma do carrinho"
# Frente as-1 carrinho fechada.
# Falta: git push origin dev
```
[M-sp "O ciclo de uma frente"; R-cmd "close"].

### Limites e escolhas discutíveis

- Submódulos não são tratados pelo `close` [P01 "Pendências menores"].
- **Discutível:** três ramos (`dev`, `stage`, `main`) é o fluxo do projeto de origem; para um grupo de quatro semanas pode ser peso. Os nomes vêm da configuração [D §5], mas o `init` cria `dev` e `stage` se faltarem [R-cmd "init"].

### Ligação com o trabalho final

- **Cenário 3, "Onde aperta"** [C 3]: "quem pode alterar o `AGENTS.md` compartilhado". A mesma pergunta, para ramos: quem pode integrar na base e quem publica. O harness responde com papéis (executivo decide; integrar é git normal no checkout principal) [D §6].
- **Enunciado §5, Calendário** [E §5]: "o que conta é o histórico de commits". O commit de fechamento de cada frente (`docs(frentes): fecha …`) é um marco datado no histórico [R-cmd "close"].

---

## Conciliação com o trabalho final

| Tema ou cenário do trabalho final | Questão | Decisão do harness | Fonte |
|---|---|---|---|
| C 3, "Três pessoas, quantos agentes?": integração, conflitos, `AGENTS.md` compartilhado | 2, 3, 4, 7, 13 | worktree e ramo por frente; estado fora do git; reserva de ticket; aviso de sobreposição; papéis e fluxo de ramos | D §6, §11; P2 tarefas 5–6 |
| C 3, "Onde aperta": quem corrige quando o agente de um quebra o código de outro | 2, 6 | T4 (não escrever no worktree vivo de outro); `takeover` com confirmação humana | D §7; P2 tarefas 10, 13 |
| C 9, "Um plugin para o DSH": método como código × instrução | 5, 10 | "o harness sugere e registra; só as travas recusam"; gancho antes da ferramenta; extensões | N; D §7, §9, §11 |
| E §1, "Um harness" e C 7, "O meu harness" | 5, 10, 11 | contrato de quatro eventos; construção em fatias; peça que não se explica é fracasso | D §3, §8, §12.1 |
| C 6, "Especificação antes do código" e E §1, "Um método": spec quando o pedido muda | 11 | spec com seções que prevalecem (§12, §15); decisão revista entre fatias | D §12, §15; P2 decisão 5 |
| E §4, Registro: anotar na hora, commit como prova | 3, 12 | ledger com "Ruling" e achados na hora; histórico commitado por frente; `eventos.jsonl` | L; D §6 |
| E §4, "harness, modelo e versões usados"; "horas e gasto com modelos" | 1, 11 | modelo gravado na sessão quando o agente informa; `board --numeros` planejado; modelos por papel no ledger | D §11, §12.5; R-cap (g); L 3 |
| E §4, cuidados: ambiente descartável | 5, 8, 12 | ensaio em repositório descartável; `TMPDIR` próprio depois do incidente | R-ens; R-cap "Ensaio"; RT 10 |
| E §4, cuidados: não pôr credencial no repositório | — | lista de termos sensíveis fora do repositório ("uma lista commitada seria ela mesma o vazamento") | D §10 "Anonimização" |
| E §8, Evidência e Domínio | 12 | "pronto" com comando e saída; revisão independente; peça legível | N; L 9–56; D §3 |
| E §1, "Você: o que delego e tenho de refazer?" | 8, 12 | achados de revisão por tarefa; incidente do temporário | L 10–52 |
| C 5, "O veterano de bolso": o que o agente lembra | 1 | resumo curto injetado; herança só com vínculo | D §8, §11 |
| C 1, "O balcão que responde": aprovação humana antes da ação | 5, 6 | `AH_GUARD=off` e `--confirmado` como ordem registrada do humano | D §7; P2 decisão 8 |
| C 4, "A portaria das skills": falso negativo, enganar o revisor | 5 | T0 recusa o ilegível; travas leem texto, não são caixa de areia | D §7; P01 pendências |
| C 8, "Será que dá mesmo em uma semana?" | 11 | fatias utilizáveis (ligação fraca: sem prazos registrados) | D §12.1 |
| C 2, "O manual que cabe no notebook" | 8, 9 | ligação fraca: recurso e rede do produto, não do processo | — |
| C 10, "Decisão tipada ou texto?" | — | sem ligação | — |
| E §3, Grupo: diferença entre duas pessoas na mesma tarefa como dado | 4 | a reserva impede a duplicação que, no estudo, pode ser deliberada (contraste, não aplicação) | D §11 |

**Onde não há ligação:** o cenário 10 (decisão tipada) não toca nada do harness. Os cenários 2 e 8 só se ligam de forma fraca e não devem ser forçados. A questão 9 (rede e servidor) não tem par no trabalho final. O prelúdio (E §0) fala de AI slop e de produtividade medida só por código; o harness não mede nada disso hoje.

---

## Ideias de artefatos

- **Slide:** a tabela das dores de origem [D §1] lado a lado com a peça que responde.
- **Slide:** a tabela das travas com o estado de cada uma (questão 5).
- **Slide:** os dois níveis de paralelismo [D §12.6].
- **Demonstração ao vivo:** o `echo '{…"git add -A"…}' | tools/ah gancho claude-code` com a recusa T2 e o código 2, num repositório descartável (questão 5). Não precisa de agente nem de rede.
- **Demonstração ao vivo:** `init` → `doctor` → `open carrinho` → `board` → merge → `close`, num repositório descartável com `AH_SESSAO` e `--sem-protecao` [R-ens "Preparo"].
- **Demonstração gravada:** o agente real recusado em `git push origin main` [R-ens].
- **Exercício:** dado um comando de shell, prever se a T2 ou a T5 recusam, e achar uma forma que escape (lista de P01 como gabarito).
- **Exercício:** escrever a função "a sessão está viva?" para três sistemas e listar o que pode dar errado (questão 1, P2 decisão 3).
- **Exercício:** desenhar o desempate de duas reservas no mesmo ticket e depois com tickets cruzados (questão 4, L 45).
- **Debate:** trava × instrução, a partir do cenário 9 e da regra "só as travas recusam" (questão 5).
- **Debate:** `/clear` é a mesma sessão? (questão 1, P01 4 × P2 decisão 5).
- **Debate:** o incidente do temporário cheio: de quem era a responsabilidade, e o que teria evitado (questão 8).
- **Leitura guiada:** o ledger `progress.md` como exemplo de registro feito durante o trabalho (questão 12, E §4).

---

## Lacunas

**O que não consegui sustentar nas fontes**

1. **Custo da construção.** Nem o ledger nem as pendências registram horas, tokens ou gasto por tarefa. Qualquer número de custo na aula precisaria de outra fonte.
2. **Números do projeto de origem.** "Mais de 280 frentes em um mês", "15% dos commits" e "16 mil tokens por sessão" estão no desenho [D §1], mas a fonte primária não está acessível nem pode ser citada (anonimização). Na aula, ficam como "relato do autor".
3. **Sobreposição entre máquinas.** O desenho não diz se a sobreposição considera frentes de outra pessoa que não estão no estado local [D §11]; o plano calcula só sobre as frentes do estado [P2 tarefa 6].
4. **Estado da fatia 2 muda durante o dia.** Esta base leu o commit `b4c48f3` e o ledger até a linha 56. As tarefas 6 a 16 podiam estar em andamento; antes da aula, conferir `git log` e o fim do `progress.md`.
5. **Validade do ensaio.** O ensaio com o Claude Code é anterior à onda final de consertos da fatia 1 e anterior a toda a fatia 2 [P01 "Não ensaiado"]. A fatia 2 prevê novo ensaio na tarefa 14 [P2].
6. **Nível da turma.** A pasta `aulas/` vai até a aula 03 (API, loop, aprovação humana); o desenho põe o harness no encontro 13 [D §1; PE]. Não achei em que encontro a turma está nem o que já viu de git (worktree, ramos, merge).

**O que precisa de decisão do autor**

1. **Como os alunos obtêm o harness.** O repositório é local e só será publicado com ordem expressa [D §10 "Publicação"]. Sem publicação, a turma não clona; a aula fica em demonstração.
2. **Qual agente mostrar.** A turma trabalha com OpenCode [HD]; o harness só tem adaptador do Claude Code, e o do OpenCode depende da fatia 4 (planejada) ou de o próprio aluno escrever [D §15]. Decidir se a demonstração usa Claude Code, ou se o adaptador do OpenCode vira exercício ou proposta de trabalho final (cenário 9).
3. **Mostrar peças não prontas.** Handoff, takeover, sweep, sobreposição, T1, T3, T4 e a fila de pesado não existem no código no momento desta leitura. Decidir se entram como desenho (com o estado marcado) ou ficam fora.
4. **Usar o ledger e os relatórios da execução como material.** São arquivos em `.superpowers/sdd/`, com caminhos de máquina (por exemplo, a pasta temporária do job). Antes de projetar ou distribuir, decidir se entram e passar a varredura neles.
5. **Peso do fluxo de três ramos para grupos de quatro semanas** (questão 13): recomendar como está ou sugerir só `main` mais ramos de frente.
6. **Revisão do controlador sobre `--confirmado` e `AH_GUARD=off` como acordos de confiança** [L 5]: a aula pode tratá-los como escolha discutível; convém o autor dizer se mantém.
