# Várias sessões de agente no mesmo repositório: levantamento para a aula

Este levantamento reúne a base dos artefatos (slides, roteiro, exercícios) da aula de Programação Agêntica (IFSul) sobre o `agent-harness`. O material da aula será derivado dele.

## Resumo

**Objeto.** O `agent-harness` é um conjunto de comandos (`tools/ah`) e de ganchos do agente que permite a várias sessões de agente de código, e a várias pessoas, trabalhar no mesmo repositório sem interferência mútua. Cada trabalho constitui uma *frente*, com ramo e worktree próprios. O estado de atribuições (quem faz o quê) fica na máquina, fora do git; travas avaliadas antes de cada comando do agente recusam as operações que danificam o trabalho alheio; os tickets do GitHub servem de canal entre máquinas. O núcleo é escrito em Node, sem dependências [D §10]. O harness foi extraído de um projeto real e privado, no qual operou durante um mês, com mais de 280 frentes abertas e fechadas [D §1].

**Estado de implementação** (lido no ramo `dev`, commit `b4c48f3`):

| Marca | Significado | Peças |
|---|---|---|
| **[pronto]** | implementado e testado (fatias 0 e 1) | `init`, `doctor`, `whoami`, `open`, `nota`, `board`, `close`; estado local; histórico; ID de frente; travas T0, T2, T5; adaptador do Claude Code, ensaiado com o agente real [README; P01] |
| **[fatia 2]** | em execução por subagentes na data da leitura | feito e revisado: sessão viva, herança na continuação, `papel`, fila de comentários pendentes [L 11, 23, 34, 56]; implementado e em correção após a revisão: reserva de ticket [L 41–52]; não iniciado: sobreposição, `handoff`, retomada, `open --para`, `takeover`, `sweep`, T1, T3, T4 [P2 tarefas 6–16] |
| **[planejado]** | previsto apenas no desenho | fila de trabalho pesado e T6 (fatia 3); roteiro para que outros agentes escrevam o próprio adaptador (fatia 4); extensões, `deps`, `atualizar`, `board --numeros` (fatia 5) [D §12.1, §15] |

**Organização do documento.** Após o panorama, cada questão do problema segue a mesma sequência de subtítulos: situação concreta, perguntas sem resposta única, tabela de alternativas com o custo de adoção e o custo ou risco da não adoção, solução adotada no harness (com o estado de cada peça), aplicação, limites e escolhas discutíveis, e relação com o trabalho final. Ao final constam a tabela de conciliação com o trabalho final, as propostas de artefatos e as lacunas que dependem do autor. Toda afirmação sobre o sistema traz a fonte entre colchetes.

**Siglas das fontes** (caminhos relativos a `agent-harness/`, exceto os da disciplina):

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

### Problema

Um único agente de código, em uma sessão e em um repositório, já apresenta problemas conhecidos pela turma: perda de contexto, execução de comando perigoso e declaração de "pronto" sem evidência. Quando mais de um ator escreve no mesmo repositório ao mesmo tempo, surgem problemas de outra natureza. Os atores podem ser:

- várias sessões do mesmo agente na mesma máquina (uma por terminal);
- a mesma sessão, antes e depois de limpar ou compactar o contexto;
- sessões de agentes diferentes (Claude Code, Codex, OpenCode);
- pessoas diferentes, cada uma com os seus agentes, em máquinas diferentes;
- um agente e um humano que alteram o mesmo checkout.

Entre esses atores ocorrem os problemas típicos de sistemas concorrentes: escrita no mesmo local, disputa por um recurso, corrupção de estado compartilhado, processo encerrado enquanto detém um lock e mensagem não entregue. O documento de desenho lista as dores que deram origem a cada peça [D §1, tabela "As dores de origem"]:

| Dor | Ocorrência |
|---|---|
| Sessões pisando umas nas outras | duas sessões editaram os mesmos arquivos; commits de uma foram parar no checkout compartilhado por todas; uma sessão trocou o ramo do checkout comum |
| Quadro dentro do git | o quadro de atribuições era um arquivo commitado: 15% de todos os commits eram apenas atualizações dele, e cada sessão gastava cerca de 16 mil tokens para lê-lo |
| Linha morta | uma sessão encerrada por falha deixava a frente "em andamento" indefinidamente |
| Máquina derrubada | builds e testes ponta a ponta simultâneos esgotaram a memória; o sistema encerrou o editor, as sessões e o banco |
| Trabalho duplicado entre máquinas | duas pessoas assumiram o mesmo ticket |
| Perda de contexto | depois de limpar ou compactar a conversa, a sessão não identificava mais a própria frente |
| Push acidental | agente que enviava push para o ramo que publica em produção |
| Passagem de trabalho dispersa | quem retomava um trabalho interrompido não encontrava o estado |

### Limites da instrução textual e papel dos mecanismos

1. **Ausência de estado na instrução.** A instrução "Não mexa no trabalho da outra sessão" só produz efeito se o agente souber onde está esse trabalho e se a outra sessão está ativa. Essa informação exige estado e consulta, que a redação da instrução não fornece. O harness mantém estado local e uma função que decide com base nele [D §6 "Estado", §7].
2. **Condições de corrida.** Dois `open` executados no mesmo segundo para o mesmo ticket passam pela conferência dos dois lados. A resolução depende de uma regra de desempate, em que prevalece o marcador mais antigo [D §11 "Reserva do ticket"; P2 decisão 6]. Nenhum prompt altera a ordem em que duas máquinas se comunicam com o GitHub.
3. **Modo de falha.** Uma instrução descumprida não produz erro visível, enquanto um mecanismo que falha produz uma recusa. O documento de desenho classifica como fracasso "travas que deixam passar em silêncio quando quebram" [D §3] e determina que o gancho incapaz de avaliar um comando o recuse [D §7].
4. **Contexto limitado do agente.** O agente age a partir do que está no seu contexto. A leitura do quadro commitado custava cerca de 16 mil tokens por sessão [D §1]; a solução foi retirar o quadro do git e injetar um resumo curto no começo da sessão [D §8].
5. **Comandos fora do agente.** Um comando digitado em um terminal comum não passa por nenhum gancho, em nenhum dos três agentes [R-cap, "O que não fica coberto"]. Por esse motivo, a barreira efetiva fica no servidor (proteção de ramo no GitHub) [D §12.2].

O documento de desenho resume a regra geral: o harness sugere e registra, e só recusa o que for necessário para proteger o trabalho dos outros e a máquina [D §11 "Regra geral de comportamento"; N "Decididas pelo autor"].

### Dois níveis de paralelismo

O documento de desenho distingue dois níveis [D §12.6]. Dentro de uma frente, a própria sessão despacha subagentes; o harness não os gerencia e fornece apenas o worktree e a fila de trabalho pesado. Entre frentes, várias sessões trabalham, cada uma na sua frente, e é esse o nível que o harness gerencia. A construção da fatia 2 usa o primeiro nível: um controlador despacha implementadores e revisores, um por vez, e registra as ocorrências em um ledger [L 3; RT 7]. A aula trata os dois níveis, com o harness como produto e o processo de construção como exemplo de método.

### Posição da aula na disciplina

Segundo o documento de desenho, o harness é objeto de uma ou duas aulas do encontro 13, "delegação e recuperação", com ponte para os encontros 10 a 12 [D §1]. No plano de encontros, o encontro 13 é "usar subagentes e ambientes isolados; integrar mudanças e recuperar falha parcial"; o 10 trata de requisitos e planejamento; o 11, de TDD; o 12, de depuração e revisão; o 14, de segurança [PE, tabela]. O harness da disciplina é montado sobre o OpenCode [HD "Arquitetura"], fato relevante para a questão 10.

---

## Questão 1. Identidade da sessão e continuidade do trabalho

### Situação

Ana abre o agente, pede "comece a frente do carrinho", trabalha durante uma hora e digita `/clear` porque o contexto se esgotou. A nova conversa não tem registro da frente do carrinho e, por isso, abre outra frente com outro nome ou passa a editar no checkout principal. Em outro terminal, uma sessão do dia anterior, retomada com `--resume`, ainda considera o carrinho como trabalho seu.

### Perguntas para a turma

- Depois de `/clear`, a sessão é a mesma? E depois de compactar o contexto? E no caso de uma conversa do dia anterior retomada?
- O que identifica uma sessão: o id fornecido pelo agente, o processo do sistema operacional, a pasta ou a pessoa?
- Quando não é possível saber se há continuação, é preferível herdar o trabalho ou liberá-lo? Qual dos dois erros custa mais?
- A qual sessão pertence um comando executado manualmente pela pessoa no terminal?

### Alternativas e custos

| Alternativa | Custo de adoção | Custo ou risco da não adoção | Suficiente quando |
|---|---|---|---|
| Nenhuma identidade: o agente lê o `AGENTS.md` e pergunta à pessoa | zero | depois de `/clear` o trabalho fica sem dono; duas sessões assumem o mesmo trabalho | uma pessoa, uma sessão, trabalho curto |
| Id da sessão fornecido pelo agente, sem herança | ler o id no gancho | `/clear` gera id novo e a frente fica órfã | sessões que não limpam o contexto |
| Id com vínculo de continuação (mesmo processo com a mesma hora de início, ou id da sessão anterior) | gancho de começo de sessão, leitura do processo em cada sistema operacional, casos de borda (pid reaproveitado, shell intermediário) | a perda de contexto se converte em perda de dono | várias sessões por dia na mesma máquina |
| Nome escolhido pela pessoa e exportado no terminal | disciplina de quem abre o terminal; o nome é herdado por processos filhos | — | uso manual, sem gancho |

### Solução no harness

- **Sessão** é a conversa de um agente, identificada pelo id que o agente fornece [D §6 "Conceitos"]. No Claude Code, o id vem no JSON do gancho e em `CLAUDE_CODE_SESSION_ID` [R-cap, linha (f)]. Sem adaptador, `AH_SESSAO=<nome>` identifica a sessão [README; R-cmd, cabeçalho]. **[pronto]**
- `tools/ah whoami` informa sessão, papel e frente [R-cmd "whoami"]. **[pronto]**
- **Herança na continuação.** A sessão nova herda a frente apenas quando o adaptador informa que se trata de continuação e há vínculo (mesmo processo, com a hora de início conferida nos dois lados). A regra é "Na dúvida, não herdar"; nesse caso, o resumo informa "a frente X está sem dona; `ah open X` para retomar" [D §11 "Continuação de sessão"; P2 levantamento, linha "Herança"; L 16]. **[fatia 2, feito]**
- **`/clear` como continuação.** A fatia 1 tratava `clear` como sessão nova [P01 4]. A fatia 2 revisou essa decisão, porque o documento de desenho fala em "conversa limpa, compactada ou retomada" [P2 decisão 5; L 4]. **[fatia 2, feito]**
- **Sessão viva**: o processo registrado existe e o sinal de vida (data de modificação de `sessoes/<id>.sinal`, atualizada pelos ganchos) não venceu. O prazo padrão é de 120 min, configurável [D §6 "Sessão viva"; P2 decisões 1–3]. **[fatia 2, feito]**
- **Papéis**: executivo (o humano que decide), orquestrador (distribui e integra o trabalho e pode ter várias frentes) e executor (uma frente por vez); o papel é definido com `tools/ah papel <orquestrador|executor>` [D §6 "Conceitos"]. **[fatia 2, feito]** (`nucleo/comandos/papel.mjs` existe; L 34).
- O resumo do começo de sessão é curto (com limite em caracteres) e contém a identidade da sessão, o papel, a frente, as frentes das outras sessões, as sobreposições, o estado do ramo base e as regras em uma linha [D §8]. **[pronto]** para o essencial; as sobreposições entram na fatia 2 (tarefa 6, não iniciada).

### Aplicação

No Claude Code, o `init` instala os ganchos em `.claude/settings.json`, com o seletor `Bash|PowerShell|Edit|Write|NotebookEdit` [P01 4; `modelos/claude-code/ganchos.json`]. A conferência é feita com `tools/ah whoami`. Em outro agente, ou em uso manual, a sessão é indicada como em `AH_SESSAO=ana-terminal tools/ah open carrinho`, com o mesmo valor no `close` [README].

### Limites e escolhas discutíveis

- **Processo observado pelo gancho.** O processo que o gancho observa pode não ser o do agente. Se o processo pai do gancho for um shell de vida curta, a sessão parece encerrada logo após o registro e perde a proteção. Esse é o primeiro foco da revisão da fatia 2 [P2 foco 1] e ficou registrado como ponto a conferir no ensaio final [L 13].
- **Herança condicionada à hora de início.** A herança exige que a hora de início seja conhecida nos dois lados. No Windows, e no macOS sem `ps`, não há herança por processo; a frente fica no estado "passada" e requer `ah open` [L 16]. Essa regra foi decidida contra o que o brief da tarefa pedia e a favor do documento de desenho.
- **Herança da variável de id por agentes filhos.** Um Codex aberto a partir de um Claude Code lê o `CLAUDE_CODE_SESSION_ID` do processo pai [R-cap, "Detalhes que decidem código", item 2]. A variável `AH_PID_AGENTE` não pode ser herdada por outra sessão [L 18].
- **Condição de corrida encontrada na construção.** Os ganchos regravavam o JSON da sessão a cada interação, e um evento `Stop` desfazia a frente gravada pelo `open`. A correção transferiu o sinal de vida para um arquivo próprio [P2 decisão 1].
- **Ponto discutível.** Um revisor rejeitou a sugestão de `AH_SESSAO=<dona>` na mensagem de recusa do `close`, porque ela ensinava o agente a se passar por outra sessão [L 25]. A referência da fatia 1 ainda traz essa sugestão [R-cmd "close", tabela]. O caso permite discutir o limite entre uma orientação útil na mensagem de recusa e a indicação de um contorno da regra.

### Relação com o trabalho final

- **Cenário 5, "O veterano de bolso"** [C 5]: a hipótese de partida é que "o agente 'lembra' bem menos do que parece, e que a maior parte do trabalho seja decidir o que vale a pena guardar". O harness oferece um caso concreto: guarda fora do agente apenas a identidade da sessão e a frente, e injeta essas informações em um resumo curto [D §8]. O aluno pode usar o caso como contraste (memória do produto × memória do processo de desenvolvimento) ou contestá-lo, discutindo se o resumo constitui memória ou apenas estado.
- **Enunciado §4, "harness, modelo e versões usados"** [E §4]: a sessão é a unidade natural de registro. O harness grava o modelo da sessão quando o agente o informa [D §11 "Ligação com o método"], e o Claude Code o informa apenas em parte dos casos [R-cap, linha (g)]. Esse limite afeta o aluno que pretenda registrar o modelo por sessão.

---

## Questão 2. Isolamento do diretório de trabalho

### Situação

Três sessões trabalham no mesmo checkout. A sessão A edita `src/total.js`; a sessão B executa `git add -A` e inclui no commit o arquivo inacabado de A; a sessão C executa `git switch main` para uma conferência, e A e B passam a editar o ramo errado sem perceber.

### Perguntas para a turma

- Um worktree por agente resolve o problema ou apenas adia o conflito para o merge?
- Quem pode alterar o checkout principal, e com que finalidade?
- Qual é o custo de um worktree por trabalho em disco, em tempo de instalação de dependências, em portas e em banco de dados?
- Se o agente tem liberdade total no próprio worktree (inclusive para `reset --hard`), onde fica o limite?

### Alternativas e custos

| Alternativa | Custo de adoção | Custo ou risco da não adoção | Suficiente quando |
|---|---|---|---|
| Todos no mesmo checkout, com cuidado | zero | o cenário acima; perda de trabalho difícil de rastrear | uma sessão por vez |
| Um clone por sessão | disco e um `fetch` por clone; integração pelo remoto | — | máquinas diferentes, poucas sessões |
| Um worktree e um ramo por frente (recurso nativo do git) | criar e remover worktrees; reinstalar dependências em cada um; cada worktree contém a própria cópia de todos os arquivos | — | várias sessões na mesma máquina |
| Contêiner ou VM por sessão | infraestrutura, tempo de inicialização | — | quando também se pretende isolamento de segurança |

### Solução no harness

- `tools/ah open <nome>` cria o ramo `feat/<nome>` a partir da base (`dev`) e um worktree próprio, em uma pasta fora do projeto [R-cmd "open"; D §5 `worktrees`]. **[pronto]**
- Um executor com frente ativa não pode abrir outra [D §6 "Regras do ciclo"]. **[pronto]**
- Travas no checkout principal, compartilhado por todas as sessões: a T2 recusa `git add -A`, `.`, `-u`, `*` e `commit -a` [R-cmd "gancho"] **[pronto]**; a T1 recusa a troca de ramo do checkout principal e a T3 recusa o descarte de trabalho (`reset --hard`, `clean -f`, `stash`, `rebase`) [D §7; P2 levantamento, linhas T1 e T3] **[fatia 2, não começadas]**. No worktree da própria frente, a sessão pode executar qualquer operação, inclusive `rebase`, `stash` e `reset` [D §11 "Escopo das travas"].
- A T4 recusa a escrita no worktree de outra sessão viva, seja por git, por comando comum (`rm`, `mv`, `sed -i`, redirecionamento) ou por edição de arquivo, sem possibilidade de liberação [D §7; P2 tarefa 13; L 6]. **[fatia 2, não começada]**
- O ponto de entrada executa sempre a cópia do harness do checkout principal, de modo que todas as frentes usem a mesma versão [D §4 "Mitigação"]. **[pronto]**

### Aplicação

```
tools/ah open carrinho --tickets 1
# Frente as-1 carrinho aberta.
# Trabalhe em: <worktrees>/carrinho
```
[R-cmd "open"]. O agente trabalha e faz commits no worktree; a integração ocorre no checkout principal, com `git merge --no-ff feat/carrinho` na `dev` [M-sp "O ciclo de uma frente"].

### Limites e escolhas discutíveis

- **Worktree alheio sem proteção até o fim da fatia 2.** Enquanto a fatia 2 não terminar, nenhuma trava protege o worktree de outra frente: `git reset --hard`, `git clean -fd`, `git worktree remove --force`, `git branch -D` e `rm -rf` sobre o trabalho de outra frente são permitidos [P01 "Para a próxima fatia"; M-sp "As travas desta versão"]. A aula deve informar que, na versão atual, o isolamento depende apenas de convenção (pasta separada), sem trava correspondente.
- **Cópia do harness em cada worktree.** Cada worktree contém uma cópia própria do harness, e worktrees antigos mantêm cópias desatualizadas. A mitigação (executar sempre a cópia do checkout principal) consta do desenho, e a instalação única por máquina foi adiada [D §4].
- **Formas alternativas de caminho.** A T4 precisa recusar da mesma forma um caminho escrito de outro modo (link simbólico, `..`, `/private/var` × `/var` no macOS, diferença de maiúsculas e minúsculas no Windows) [P2 foco 2].
- **Ponto discutível.** O harness original fazia commit automático dos arquivos modificados no checkout principal ao abrir uma frente; nesta versão, o `open` apenas avisa, para não criar um commit que o aluno não solicitou [D §6 "Simplificação"]. A mudança aumenta a clareza e retira a garantia de que nenhum arquivo ficou sem commit.
- **Itens fora do núcleo.** Banco de dados, portas e dependências por worktree são opcionais do projeto 2 [D §2, §3].

### Relação com o trabalho final

- **Cenário 3, "Três pessoas, quantos agentes?"** [C 3]: a hipótese é que "cada um com o seu agente acelere o começo e complique a integração", e os itens a observar incluem "conflitos de integração". O uso de um worktree por frente é uma alternativa concreta para testar a hipótese, pois reduz a interferência durante o trabalho e concentra os conflitos no merge. O grupo pode registrar em que etapa cada conflito apareceu.
- **Cenário 3, "Onde aperta"** [C 3]: "combinem antes quem corrige quando o agente de uma pessoa quebra o código de outra". A T4 implementa mecanicamente uma parte desse acordo (não escrever no trabalho ativo de outra sessão); o restante (quem corrige depois do merge) continua a depender de acordo do grupo.

---

## Questão 3. Registro de quem faz o quê

### Situação

O grupo mantém um arquivo `QUADRO.md` no repositório, no qual cada sessão, ao começar, escreve "estou no carrinho". Após uma semana, metade dos commits consiste em atualizações do quadro, os conflitos de merge concentram-se nesse arquivo e o agente lê o arquivo inteiro a cada sessão.

### Perguntas para a turma

- O quadro de atribuições é histórico do projeto (e vai para o git) ou estado corrente (e não vai)?
- Que informação outra máquina precisa receber, e por qual canal?
- Quanto contexto o agente deve gastar para saber o que as outras sessões fazem?
- Se um arquivo de estado for corrompido, que componentes deixam de funcionar?

### Alternativas e custos

| Alternativa | Custo de adoção | Custo ou risco da não adoção | Suficiente quando |
|---|---|---|---|
| Arquivo versionado no repositório | nenhuma infraestrutura | commits e conflitos apenas de quadro; tokens para a leitura (15% dos commits e cerca de 16 mil tokens por sessão no projeto de origem [D §1]) | uma pessoa, poucos dias |
| Estado local por máquina, fora do git, com um resumo curto injetado | código para gravação atômica e com exclusão mútua; outras máquinas não têm acesso | — | várias sessões em uma máquina |
| Rastreador (tickets, rótulos, comentários) como canal entre máquinas | dependência de rede e de API externa | trabalho duplicado entre pessoas | várias pessoas |
| Serviço central (banco de dados, servidor de coordenação) | infraestrutura a manter | — | equipes grandes |

### Solução no harness

- **Estado fora do git, por máquina**, em um diretório do usuário com o nome do projeto (XDG no Linux, `Application Support` no macOS, `LOCALAPPDATA` no Windows; `AH_ESTADO` altera o local). Há um JSON por sessão e por frente, gravado por meio de arquivo temporário e renomeação; a exclusão mútua usa criação de diretório, com dono e vencimento; o arquivo `eventos.jsonl` admite apenas acréscimos [D §6 "Estado"]. **[pronto]**
- **Conteúdo mantido no git**: apenas a linha do histórico de cada frente fechada (`docs/agents/historico-das-frentes.md`, com commit feito pelo `close`) e, no GitHub, os comentários nos tickets [D §6 "Estado"; R-cmd "close"]. **[pronto]**
- `tools/ah board` mostra ID, nome, dona, estado, tickets, plano e última nota; `tools/ah nota "<texto>"` registra uma nota [R-cmd "board", "nota"]. **[pronto]** Na fatia 2, o quadro passou a indicar frentes órfãs e sessões ilegíveis [L 26–29]. **[fatia 2, feito]**
- **ID curto por pessoa** (`<sigla>-<n>`, como `as-1`), em substituição ao número sequencial por máquina, que gerava colisões no histórico quando várias pessoas trabalhavam no projeto [D §11 "Frente com ID curto"]. **[pronto]**
- Resumo curto injetado no começo da sessão, em substituição à leitura do quadro [D §8]. **[pronto]**

### Aplicação

```
$ tools/ah board
ID    NOME      DONA      ESTADO  TICKETS  PLANO  ÚLTIMA NOTA
as-1  carrinho  sessao-t  ativa   #1       —      mexendo no total
```
[R-cmd "board"]. O estado bruto pode ser consultado na pasta indicada por `AH_ESTADO` (nos testes) ou no diretório de estado do usuário.

### Limites e escolhas discutíveis

- **Arquivo de frente corrompido.** Um arquivo de frente corrompido interrompia `board`, `open` e `close` de todas as sessões até ser apagado [P01 "Pendências menores"]. A fatia 2 trata o caso como foco de revisão: o gancho não pode recusar todas as ferramentas por esse motivo, pois o agente ficaria impedido de apagar o arquivo [P2 foco 3].
- **Chamada de rede dentro da trava de estado.** Na reserva de ticket, a chamada ao GitHub feita dentro da trava de estado podia retê-la por 5 a 20 s, o que faria falhar o começo de sessão, o `close` e o `whoami` das outras sessões. A solução adotada foi a reserva em duas fases (estado sob a trava, rede fora dela, estado novamente sob a trava) [L 52]. O custo declarado é um estado intermediário adicional, que `board`, `sweep` e `doctor` precisam reconhecer.
- **Quadro restrito à máquina.** O quadro de uma máquina não é visível nas outras; o canal entre máquinas é o comentário no ticket [D §6 "Estado"]. Quem trabalha sem ticket não aparece para as demais pessoas.
- **Ponto discutível.** A separação entre histórico commitado (uma linha por frente) e quadro fora do git é uma escolha do autor. Também é defensável a posição de que o histórico constitui ruído no git.

### Relação com o trabalho final

- **Enunciado §4, Registro** [E §4]: "o registro vive no repositório git do grupo" e "a data do commit é a prova de que a anotação veio antes do resultado". O harness retira do git o estado corrente e mantém nele apenas o histórico. O aluno pode aplicar a mesma distinção: o registro da disciplina é histórico e vai para o git, com data; a informação sobre quem faz o quê em cada momento não precisa ir.
- **Cenário 3, "O que observar em você"** [C 3]: "o que o `AGENTS.md` compartilhado virou ao longo do trabalho". O quadro commitado do projeto de origem exemplifica a evolução de um arquivo compartilhado, que chegou a responder por 15% dos commits [D §1].

---

## Questão 4. Reserva de tarefas e desempate

### Situação

Às 9h, Ana e Carla consultam, cada uma em sua máquina, a lista de tickets abertos, e as duas escolhem o #2, "frete grátis acima de 200". Às 11h, cada uma tem metade de uma solução diferente para o mesmo ticket.

### Perguntas para a turma

- A reserva deve ser garantida (nenhuma outra pessoa assume o ticket) ou basta um aviso visível?
- Sem rede, deve ser possível abrir trabalho em um ticket?
- Se duas reservas ocorrem no mesmo segundo, qual prevalece, e o que faz a perdedora?
- Quando vence uma reserva que ninguém libera (por exemplo, porque a pessoa se ausentou)?

### Alternativas e custos

| Alternativa | Custo de adoção | Custo ou risco da não adoção | Suficiente quando |
|---|---|---|---|
| Acordo no chat do grupo | zero | trabalho duplicado | duas pessoas em comunicação constante |
| Responsável no ticket, atribuído manualmente | um clique | a atribuição e a remoção são esquecidas | equipes pequenas e disciplinadas |
| Reserva automática no rastreador (responsável, rótulo, comentário com marcador) com desempate | código, rede obrigatória, casos de corrida | — | várias pessoas e sessões |
| Trava atômica em um serviço central | serviço próprio | — | quando a duplicação tem custo alto |

### Solução no harness

- `tools/ah open <nome> --tickets 1,2` faz a reserva antes de criar qualquer outro elemento: atribui a pessoa como responsável, aplica o rótulo de reserva (padrão `em-andamento`) e publica um comentário com marcador legível por máquina; sem rede, o comando recusa [D §6 "Regras do ciclo"; D §11 "Reserva do ticket"; P2 decisões 6 e 7]. **[fatia 2, implementado e em conserto]** (commit `4228bd1` [L 41]).
- O marcador é a última linha do comentário: `<!-- ah:frente id=as-1 nome=carrinho ramo=feat/carrinho estado=ativa login=ana-souza … v=1 -->`. O último marcador de uma frente indica o estado dela no ticket [P2 decisão 6].
- **Condição de corrida**: "a reserva é um aviso, não uma trava atômica: dois `open` no mesmo segundo podem passar, e o segundo descobre ao conferir depois de comentar" [D §11]. Prevalece a frente cujo marcador ativo é o mais antigo; a perdedora publica o comentário `desistencia`, deixa de ser responsável e não cria worktree [P2 decisão 6; P2 foco 4].
- O `close` libera a reserva: remove responsável e rótulo e comenta o fechamento. O comando não fecha o ticket, porque o fechamento cabe a quem integra [D §6 "Regras do ciclo"; P2 tarefa 5].

### Aplicação

O pré-requisito é o `gh` instalado e autenticado, o que `tools/ah doctor` confere [R-cmd "doctor"]. Em seguida, executa-se `tools/ah open frete --tickets 2`. Se o #2 já pertence a outra frente, a mensagem de recusa indica a dona e a ação: "combine com @carla-dias, dona da frente cd-4, ou escolha outro ticket" [P2 tarefa 5, interface de `reservar`].

### Limites e escolhas discutíveis

- **Defeitos encontrados na revisão.** A revisão encontrou um defeito que os testes do implementador não detectavam: com tickets cruzados (a frente A pede #1 e #2, a frente B pede #2 e #1), as duas frentes desistiam. A correção solicitada foi uma ordem global pelo id do comentário no servidor, com desempate pelo id da frente [L 44–45]. A mesma revisão constatou que o login da própria pessoa como responsável era recusado e que o marcador era lido em qualquer posição do comentário e de qualquer autor [L 46–47]. No momento da leitura, a correção estava despachada e ainda sem nova revisão [L 55].
- **Reserva como aviso.** Duas aberturas no mesmo segundo podem passar; o documento de desenho aceita essa possibilidade e determina que ela conste da referência [D §11].
- **Recusa sem rede.** Sem rede, o `open` com ticket é recusado. Trata-se de uma escolha: na fatia 1, o `open` prosseguia com aviso, e o teste passou a exigir "recusa sem criar nada" [T5r "Testes"]. Quem trabalha sem conexão abre a frente sem `--tickets` e, portanto, sem reserva.
- **Ponto discutível.** O harness usa o GitHub como meio de coordenação (comentários como mensagens, rótulo como trava). A solução atende a poucas pessoas e não seria adequada a um sistema com muitas escritas concorrentes.

### Relação com o trabalho final

- **Cenário 3** [C 3]: grupo de três pessoas, cada uma com um agente, e sistema grande o suficiente para dividir o trabalho. A reserva impede que duas pessoas trabalhem no mesmo ticket. O grupo pode avaliar se o custo (rede, `gh`) se justifica ou se um acordo no chat basta para três pessoas, e registrar o número de duplicações.
- **Enunciado §3, Grupo** [E §3]: "se duas pessoas viveram a mesma tarefa de jeitos diferentes, essa diferença é um dado". A reserva impede essa situação no trabalho de produção; no estudo, a duplicação pode ser deliberada. O contraste permite discutir como um defeito no fluxo de trabalho pode servir de recurso de método em um experimento.

---

## Questão 5. Regras pedidas e regras impostas

### Situação

O `AGENTS.md` contém a regra "nunca faça push para a `main`". Durante uma tarefa longa, o agente executa `git push origin main` para "publicar a correção". Em outra ocasião, o agente respeita a forma escrita da regra, mas executa `git checkout main && git push`, forma que ninguém havia previsto no texto.

### Perguntas para a turma

- O que deve ser recusado por mecanismo, e o que basta recomendar?
- Se a trava falhar (por defeito ou configuração inválida), ela deve permitir ou recusar todos os comandos?
- Deve existir um desvio de emergência? Quem o autoriza, e o que ele nunca deve liberar?
- Uma trava que lê o texto do comando oferece segurança?

### Alternativas e custos

| Alternativa | Custo de adoção | Custo ou risco da não adoção | Suficiente quando |
|---|---|---|---|
| Apenas instrução (`AGENTS.md`, skill) | redação cuidadosa | o agente esquece a regra, a interpreta ou encontra uma forma não prevista; a falha é silenciosa | regras de estilo e de método |
| Permissões do agente (lista de comandos permitidos ou negados) | configuração por agente; regras por padrão de texto | — | comandos inteiros e fáceis de reconhecer |
| Gancho antes da ferramenta, com interpretador de shell | escrever e manter o interpretador; falsos positivos e falsos negativos | — | regras que dependem de estado (ramo atual, dono do worktree) |
| Barreira no servidor (proteção de ramo) | conta ou plano que a permita; a publicação passa a exigir PR | push direto para produção | ramos publicados |
| Caixa de areia (contêiner, usuário sem permissão) | infraestrutura | — | quando o risco é de segurança, e não de engano |

### Solução no harness

- **Travas como função pura.** A entrada é o comando (ou o caminho do arquivo), o diretório e o estado; a saída é "permite" ou "recusa", com a explicação e a alternativa a seguir. Um único interpretador de shell atende a todas as travas e reconhece encadeamento, subshell, `bash -c`, heredoc e `cd` [D §7 "Travas"]. **[pronto]**
- **Travas e estado de implementação** [D §7; R-cmd "gancho"; P2]:

| Trava | Recusa | Estado |
|---|---|---|
| T0 | comando que menciona git ou gh e não pode ser lido; nome de comando vindo de variável ou crase; gancho que não consegue avaliar | [pronto] |
| T1 | trocar o ramo do checkout principal | [fatia 2, não começada] |
| T2 | `git add` de tudo e `commit -a` no checkout principal | [pronto] |
| T3 | descartar trabalho no checkout principal | [fatia 2, não começada] |
| T4 | escrever no worktree de outra sessão viva | [fatia 2, não começada] |
| T5 | push para ramo protegido em qualquer forma; `gh pr merge` com base protegida | [pronto] |
| T6 | trabalho pesado fora da fila | [planejado, fatia 3] |

- **Recusa em caso de falha do gancho.** Quando o gancho falha, ele recusa o comando; o original permitia [D §7]. Para garantir uma saída, um comando que consiste apenas em uma chamada a `tools/ah` (para executar o `doctor`) e a edição de `.harness/config.json` são sempre permitidos [D §11 "Saída quando o gancho quebra"]. **[pronto]**
- **Desvio de emergência.** O prefixo `AH_GUARD=off` no começo do próprio comando, usado apenas com ordem do executivo, vale para aquele comando e fica registrado. O desvio nunca libera a T0 [P01 6; R-cmd "gancho"; `nucleo/lib/travas.mjs:371`]. A T4 aplicada à edição de arquivo também não admite liberação; as alternativas são o `takeover` ou um pedido à dona [D §11]. **[pronto]** para T0, T2, T5.
- **Saída indicada em toda recusa.** Cada recusa informa o motivo em uma linha e um próximo passo concreto; uma recusa sem próximo passo é tratada como defeito e coberta por teste [D §12.4].
- **Barreira no servidor.** A barreira efetiva fica no servidor: o `init` configura proteção de ramo no GitHub para `stage` e `main`, e a publicação passa a ser um PR mesclado com `AH_GUARD=off gh pr merge`, por ordem do executivo [D §12.2; R-cmd "Publicar"]. **[pronto]**
- **Regra geral.** O método (etapas, escolha de modelo) nunca é motivo de recusa [D §11 "Regra geral"; N "Escolha de modelos"].

### Aplicação

A trava pode ser demonstrada sem agente, com a entrada do gancho fornecida manualmente [R-cmd "gancho"]:

```
$ echo '{"session_id":"abc","hook_event_name":"PreToolUse","cwd":"<projeto>","tool_name":"Bash","tool_input":{"command":"git add -A"}}' | tools/ah gancho claude-code
Recusado (T2): git add com tudo (-A, ., -u, *, a raiz) no checkout principal leva junto o trabalho de outras frentes
Faça: git add <caminhos> com só os arquivos que você mudou (e git commit sem -a), ou trabalhe no worktree da frente
$ echo $?
2
```

No ensaio com o agente real, foram solicitados `git add -A` e `git push origin main`. As duas recusas chegaram ao modelo com o motivo literal, o modelo não tentou contorná-las e o `eventos.jsonl` registrou um `sessao-inicio`, uma recusa T2 e uma recusa T5 [R-ens "Resposta do agente", "Eventos gravados"].

### Limites e escolhas discutíveis

- **Análise textual, sem caixa de areia.** As travas analisam o texto do comando e não constituem caixa de areia [D §7 "Limite a declarar"]. Passam sem recusa, por exemplo, `xargs git add`, apelidos do git, `gh api …/merge` e `$G push` [P01 "Pendências menores"; R-cmd "Limites"].
- **Falsos positivos observados.** O comando `git switch main && git pull && git switch dev && git push` é recusado pela T5, embora o push ocorra na `dev` [P01 "Pendências menores"]. Um caminho com `$` entre aspas simples é recusado pela T2 [idem].
- **T0 como recusa por incompreensão.** A T0 recusa o comando que o interpretador não consegue ler, mas apenas quando o texto menciona git ou gh; os demais passam [P01 5]. A regra arbitra entre bloquear o agente e permitir o que não foi lido.
- **Ramo sem harness.** Se o checkout principal estiver em um ramo sem `tools/ah`, o gancho não existe e nenhum comando é recusado. O caso ficou como limite documentado, porque recusar todos os comandos bloquearia o agente [P01 11].
- **Ponto discutível.** `AH_GUARD=off` e `takeover --confirmado` dependem de confiança, pois o agente pode digitar o prefixo sem ordem alguma. A contrapartida é o registro em `eventos.jsonl` [L 5].
- **Windows nativo.** No Windows nativo, as travas de comando não se aplicam; o requisito é o WSL2 [D §12.7].
- **Proteção de ramo em conta Free.** O GitHub não oferece proteção de ramo em repositório privado de conta Free [R-cap "Proteção de ramo no GitHub"]; nesse caso, o `doctor` informa que apenas a trava local protege o ramo [D §12.2].

### Relação com o trabalho final

- **Cenário 9, "Um plugin para o DSH"** [C 9]: a curiosidade é "transformar a minha metodologia em código, dentro do harness, em vez de só escrevê-la como instrução", e a hipótese é que isso "me obrigue a decidir coisas que, escritas como instrução no `AGENTS.md`, ficavam vagas". Esta é a relação mais direta com a aula. Para o método, o harness tomou a decisão inversa: "o harness sugere e registra; só as travas recusam. O método é recomendação" [N "Decididas pelo autor"]. O grupo pode adotar essa fronteira entre o que vira código e o que permanece instrução, ou contestá-la, examinando por que a proteção do trabalho dos outros se tornou trava e a regra "teste antes do código" não.
- **Enunciado §1, "Um harness"** [E §1]: "consigo montar um modo de trabalho meu, a partir das skills e metodologias que já existem?". O harness apresenta uma peça que nenhuma skill fornece: um gancho que recusa o comando antes da execução.
- **Cenário 1, "O balcão que responde"** [C 1] e a aula 03 (gate de aprovação humana; `aulas/03-api-llm-primeiro-agente/README.md`): `AH_GUARD=off` e `takeover --confirmado` são formas de aprovação humana antes da ação, expressas como prefixo registrado. Há uma diferença a discutir: no cenário 1, o humano aprova cada resposta; no harness, o humano autoriza apenas a exceção, e o fluxo normal não passa por ele.
- **Cenário 4, "A portaria das skills"** [C 4]: "a skill inspecionada pode trazer instruções para enganar o revisor". A T0 recusa o que não consegue ler, mas a referência declara que a trava não é caixa de areia [R-cmd "Limites"]. O grupo pode usar a lista de formas que escapam às travas (P01) como exemplo de falso negativo.

---

## Questão 6. Sessão interrompida e passagem do trabalho

### Situação

A sessão de Ana trava às 16h com a frente do carrinho ativa. No dia seguinte, o quadro ainda mostra "carrinho: sessão de Ana, ativa", e Carla pretende continuar o carrinho. Em outra máquina, Ana pretende retomar o trabalho que deixou inacabado no notebook.

### Perguntas para a turma

- Como distinguir uma sessão morta de uma sessão que processa uma resposta há 40 minutos?
- Quem pode retirar uma frente de uma sessão: qualquer sessão, apenas um humano ou ninguém?
- O que precisa estar escrito para que outra pessoa retome o trabalho sem fazer perguntas?
- O que a retomada em outra máquina exige: o ramo no remoto, o estado ou ambos?

### Alternativas e custos

| Alternativa | Custo de adoção | Custo ou risco da não adoção | Suficiente quando |
|---|---|---|---|
| Nenhuma tomada; aguarda-se a pessoa | zero | frente "em andamento" indefinidamente [D §1, "Linha morta"] | uma pessoa |
| Prazo: depois de X horas sem sinal, a frente é liberada automaticamente | definição do prazo; falso positivo em sessão lenta | — | sessões curtas |
| Tomada explícita, com confirmação humana | um passo adicional; alguém precisa decidir | — | várias sessões |
| Passagem planejada do trabalho (envio do ramo ao remoto, estado registrado no ticket) | disciplina de executar o comando antes de parar | quem retoma não encontra o estado [D §1] | várias pessoas e máquinas |

### Solução no harness

- O **sinal de vida** e a existência do processo determinam se a dona está viva (questão 1). **[fatia 2, feito]**
- `tools/ah handoff [--nota]` exige worktree limpo e no ramo da frente, envia o ramo ao remoto e comenta a passagem no ticket, com os últimos commits, o plano e o comando para retomar. A frente fica no estado "passada", sem dona, e a reserva é mantida [D §6; P2 levantamento, linha "Passagem de bastão"; P2 tarefa 7]. **[fatia 2, não começado]**
- **Retomada pelo `open <nome>`.** A retomada usa o próprio `open <nome>`: na mesma máquina, a partir do estado local; em outra máquina, a partir do ramo no remoto e do marcador de passagem no ticket, que permite reconstruir a frente com o mesmo ID [D §11 "Retomar uma frente passada"; P2 tarefa 8]. **[fatia 2, não começado]**
- `tools/ah takeover <nome>` aplica-se apenas a uma frente ativa cuja dona morreu. Sem `--confirmado`, o comando mostra a dona, o motivo da morte e a idade do sinal, e recusa com "peça ao executivo que confirme" [P2 decisão 8; P2 tarefa 10]. **[fatia 2, não começado]**
- `tools/ah sweep [--reparar]` lista o que está fora do lugar (worktree sem frente, frente órfã, sessão morta); `--reparar` corrige apenas o estado e nunca apaga worktree nem ramo [D §6; P2 tarefa 11]. **[fatia 2, não começado]**
- Com `open --para <sessão>`, o orquestrador abre uma frente para outra sessão viva [D §11; P2 tarefa 9]. **[fatia 2, não começado]**
- O `close` de uma frente cuja sessão dona já encerrou é aceito, com as mesmas conferências [P01 10]. **[pronto]**

### Aplicação

Na versão atual (fatia 1 e a parte já integrada da fatia 2), `tools/ah board` mostra as frentes órfãs e `tools/ah close <nome>` fecha a frente de uma sessão encerrada. Com a fatia 2 concluída, o ciclo previsto é:

```
tools/ah handoff --nota "falta o frete"
# Frente as-1 carrinho passada.
# Para retomar: tools/ah open carrinho
```
[P2 tarefa 7, "Saída"].

### Limites e escolhas discutíveis

- **Prazo do sinal de vida.** O prazo padrão é de 120 min [P2 decisão 2]. Uma sessão viva e parada por mais tempo parece morta, e uma sessão morta parece viva por até duas horas, caso o processo ainda exista.
- **Sessão antiga retomada após `takeover`.** Uma sessão antiga retomada depois de um `takeover` (`--resume` do dia anterior) não pode recuperar a frente; o caso é foco de revisão e de teste [P2 foco 5].
- **Frente sem ticket.** Uma frente sem ticket só pode ser retomada na mesma máquina [P2 decisão 9].
- **Ponto discutível.** A opção `--confirmado` depende de confiança, porque o gancho não tem meio de consultar um humano [L 5], e o agente pode passar a opção por conta própria.

### Relação com o trabalho final

- **Enunciado §4, Registro** [E §4]: "onde travou, o que precisou aprender". O comentário de passagem é um formato pronto para registrar uma interrupção, com o que ficou pendente, os últimos commits, o plano e o comando para retomar [P2 tarefa 7]. O grupo pode adotar o formato manualmente, sem o harness.
- **Cenário 3** [C 3]: a ausência de uma pessoa do grupo por dois dias configura o caso de tomada da frente. O grupo pode definir a regra com antecedência (quem pode assumir e após quanto tempo) e registrar se precisou aplicá-la.
- **Plano de encontros, encontro 13** [PE]: "recuperar falha parcial". Neste contexto, a falha parcial mais comum é a sessão morta com trabalho inacabado.

---

## Questão 7. Dois trabalhos no mesmo arquivo

### Situação

As frentes do carrinho e do cupom alteram `src/total.js`. Nenhuma das duas tem conhecimento da outra até o merge, quando surge o conflito e uma delas precisa refazer meia tarde de trabalho.

### Perguntas para a turma

- Duas frentes que alteram o mesmo arquivo configuram erro, risco ou situação normal?
- Um aviso prévio é suficiente? Quem lê o aviso, a pessoa ou o agente?
- É realista declarar com antecedência quais caminhos a frente vai alterar?

### Alternativas e custos

| Alternativa | Custo de adoção | Custo ou risco da não adoção | Suficiente quando |
|---|---|---|---|
| Nenhum mecanismo; o conflito é resolvido no merge | zero | retrabalho descoberto tarde | frentes em partes distantes do código |
| Aviso calculado pelo que cada frente já mudou (diff do ramo) | um `git diff` por frente a cada consulta ao quadro | — | várias frentes no mesmo módulo |
| Declaração de intenção (`--caminhos <globs>`) com aviso na abertura | a pessoa ou o agente precisa prever os caminhos | — | quando a previsão é fácil |
| Trava por arquivo (lock) | bloqueio de trabalho legítimo; locks esquecidos | — | arquivos que não admitem merge (binários) |

### Solução no harness

- **Aviso sem recusa.** O harness calcula a sobreposição a partir do que cada frente ativa já mudou em relação à base (commits do ramo e mudanças sem commit no worktree) e a exibe no quadro (coluna `SOBREPÕE`) e no resumo da sessão. No `open`, a frente nova ainda não alterou nenhum arquivo; o comando mostra as notas das frentes ativas e, com `--caminhos <globs>`, avisa quais frentes já alteram esses caminhos [D §11 "Sobreposição de arquivos"; P2 tarefa 6]. **[fatia 2, não começado]**
- `tools/ah nota` já existe e aparece no quadro [R-cmd "nota"]. **[pronto]**

### Aplicação

Na versão atual, registra-se uma nota com `tools/ah nota "mexendo no total"` e consulta-se a coluna de notas do `board`. Na versão prevista, `tools/ah open cupom --caminhos 'src/**'` produz `Atenção: as-2 frete já mudou 1 arquivo(s) de --caminhos: src/total.js` [P2 tarefa 6, testes].

### Limites e escolhas discutíveis

- **Ausência de bloqueio.** O aviso não impede nenhuma operação. A escolha é coerente com a regra geral (recusar apenas o que protege o trabalho dos outros), embora a sobreposição também represente um risco ao trabalho dos outros; essa tensão pode ser levada ao debate em aula.
- **Granularidade por arquivo.** O cálculo considera o arquivo, e não o trecho: duas frentes que alteram funções diferentes do mesmo arquivo geram aviso, embora o merge ocorra sem conflito.
- **Alcance restrito à máquina.** As frentes de outra pessoa só entram no cálculo se o ramo estiver no remoto e a frente constar do estado local; o documento de desenho não define o tratamento de frentes de outra máquina nesse cálculo [D §11] (ver Lacunas).

### Relação com o trabalho final

- **Cenário 3, "O que observar em você"** [C 3]: "conflitos de integração". O grupo pode contar os conflitos e anotar quais teriam sido evitados por um aviso prévio. A contagem fornece uma medida para a hipótese "complica a integração" sem exigir o harness.

---

## Questão 8. Recurso escasso da máquina

### Situação

Três sessões executam a suíte de testes ao mesmo tempo, e uma quarta executa o build. A memória se esgota e o sistema encerra o editor, as sessões e o banco de dados [D §1, "Máquina derrubada"].

**Incidente da fatia 2 (registrado no ledger).** Durante a execução, a suíte de testes do próprio harness deixou 5471 pastas `/tmp/ah-teste-*` e excedeu a cota do `/tmp` da máquina [L 42]. O implementador da tarefa 5 identificou o problema, não apagou nada além do que lhe era permitido, executou a suíte com `TMPDIR` apontado para outra pasta e registrou no relatório que "teste que falha não limpa" [T5r "Preocupações"]. O controlador apagou as sobras, alterou a regra para todos os implementadores (`TMPDIR` no temporário do job e remoção das sobras ao terminar) e solicitou limpeza automática na correção da tarefa 4 [L 42; RT 10]. Após a correção, a suíte rodou "sem sobras no TMPDIR" [L 53].

### Perguntas para a turma

- Quem é dono de um recurso da máquina (memória, disco, temporário, porta) quando cinco sessões a compartilham?
- O agente deve saber que outra sessão executa o build, ou esse controle cabe ao sistema operacional?
- Qual mecanismo adotar: fila, limite por processo ou nenhuma coordenação?
- Que tempo de espera é aceitável para evitar o esgotamento da máquina?

### Alternativas e custos

| Alternativa | Custo de adoção | Custo ou risco da não adoção | Suficiente quando |
|---|---|---|---|
| Nenhum controle; cada sessão executa o que quiser | zero | máquina derrubada; sessões e banco encerrados; disco cheio | uma sessão |
| Instrução ("não rode e2e em paralelo") | redação | o agente esquece; nenhuma sessão vê as demais | poucas sessões, comandos leves |
| Fila de trabalho pesado por máquina, com vagas e classes | código, configuração, espera | — | várias sessões com builds e testes pesados |
| Limite do sistema (cgroups, cotas, contêiner) | configuração por sistema operacional | — | infraestrutura própria |
| Limpeza automática no próprio teste | disciplina em cada teste novo | temporário cheio (incidente acima) | sempre |

### Solução no harness

- `tools/ah pesado -- <comando>` aguarda a vez, executa o comando e devolve a saída e o código de retorno. Vagas e classes vêm da configuração ("exclusivo" ocupa todas as vagas; um comando não reconhecido cai na classe mais restritiva). Há um mínimo de memória livre para executar ao lado de outro comando; a ordem é de chegada, com senha, e quem precisa de todas as vagas não pode ser ultrapassado indefinidamente; ao receber sinal de término, o harness encerra toda a árvore de processos do comando antes de liberar a vaga; a fila pertence à máquina, e não ao projeto [D §7 "Fila de trabalho pesado"; D §11 "Fila de pesado entre projetos"]. A T6 recusa trabalho pesado fora da fila [D §7]. **[planejado, fatia 3]**
- Situação atual: o estado do harness e os testes usam `node:os` e `node:path`, sem `/tmp` fixo [P2 restrições globais, linha 20]. A regra do `TMPDIR` e da limpeza pertence ao processo de construção e não é uma peça do harness [RT 10].

### Aplicação

Enquanto a fatia 3 não existir, recomenda-se limitar manualmente o número de sessões que executam testes ao mesmo tempo, apontar `TMPDIR` para uma pasta própria, apagar as sobras ao final e registrar a limpeza (`t.after`) em cada teste que cria pasta [RT 10].

### Limites e escolhas discutíveis

- **Fila não implementada.** A fila ainda não existe; a aula pode apresentar o desenho e o incidente, mas não pode demonstrar a peça.
- **Natureza do incidente.** O incidente envolveu o espaço temporário, e não a memória. A fila de trabalho pesado, tal como desenhada, não o teria evitado, porque a causa eram testes que não removiam as próprias pastas. O conceito de recurso escasso abrange, portanto, mais do que a peça planejada.
- **Ponto discutível.** Como a fila pertence à máquina e não ao projeto [D §7], dois projetos do aluno na mesma máquina disputam as mesmas vagas. Esse é o comportamento desejado, mas pode surpreender quem usa o harness.

### Relação com o trabalho final

- **Cenário 2, "O manual que cabe no notebook"** [C 2]: "limites de hardware" e modelo local em uma máquina modesta. A relação é fraca, pois nesse cenário o recurso pertence ao produto e não ao processo de desenvolvimento. Ela só se aplica se o grupo executar várias sessões de agente e o modelo local na mesma máquina.
- **Enunciado §4, cuidados** [E §4]: "rodem skills, distribuições e código de terceiros em ambiente descartável". O incidente mostra que o próprio código de teste pode esgotar recursos da máquina, risco contra o qual o ambiente descartável também protege.
- **Enunciado §1, "Você: o que eu delego e depois tenho de refazer?"** [E §1]: o incidente é um efeito colateral não solicitado, identificado por um subagente e resolvido por quem coordena. Serve de exemplo de registro de um imprevisto (ocorrência, mudança adotada, custo).

---

## Questão 9. Queda de rede

### Situação

Às 18h, Ana fecha a frente no ônibus, sem acesso à internet. O `close` precisa comentar no ticket e remover o rótulo de reserva, mas o GitHub não responde. A frente desaparece do estado local, e o ticket continua a indicar "em andamento com Ana".

### Perguntas para a turma

- Uma operação que altera o estado local e o servidor deve falhar por inteiro ou executar a parte possível?
- O que pode ser adiado sem prejuízo, e o que não pode?
- Enviar o mesmo comentário duas vezes é pior ou melhor do que não enviá-lo?

### Alternativas e custos

| Alternativa | Custo de adoção | Custo ou risco da não adoção | Suficiente quando |
|---|---|---|---|
| Recusar todas as operações sem rede | simples | impossibilidade de trabalhar sem conexão | operações que precisam de resposta (reservar) |
| Executar a parte local e descartar a remota | simples | ticket com estado errado indefinidamente | nunca |
| Fila de pendentes reenviada depois ("pelo menos uma vez") | código da fila, ordenação, distinção entre erro permanente e passageiro, risco de duplicação | — | comentários e edições que podem esperar |
| Transação distribuída | complexidade desproporcional ao caso | — | — |

### Solução no harness

- **Fila de comentários e edições pendentes.** Uma falha passageira mantém o item na fila, em ordem; um erro permanente (ticket inexistente) é separado da fila; o reenvio ocorre a cada comando; a fila também cobre a edição de responsável e de rótulo [D §6 "Estado"; P2 levantamento, linha "Fila de comentários"]. **[fatia 2, feito]** (tarefa 4 completa [L 56]).
- **Reserva fora da fila.** A reserva no `open` não entra na fila. Sem rede, o `open` com ticket é recusado, porque a reserva exige saber se outra frente já reservou o ticket [D §6 "Regras do ciclo"; T5r "Testes"].
- O gancho consulta o servidor (`gh pr view`) apenas para `gh pr merge`, com prazo de 5 s; sem resposta, recusa o comando [P01 7]. **[pronto]**

### Aplicação

Não há ação necessária: o reenvio ocorre em todo comando `tools/ah`. O `sweep` previsto lista os itens pendentes [P2 levantamento, linha "sweep"].

### Limites e escolhas discutíveis

- **Achados da revisão da fila** [L 35–40]: um erro permanente com texto diferente do esperado travava a fila sem aviso; o `close` podia duplicar o comentário se o enfileiramento falhasse; o `gh` falso dos testes aceitava rótulo e campo desconhecidos, de modo que os testes passavam em casos em que o `gh` real falharia. Todos os achados foram corrigidos e revisados novamente [L 53, 56].
- **Pendências para a revisão final:** "rede reconhecida por texto", ou seja, a distinção entre falha passageira e permanente depende da mensagem do `gh` [L 54].
- **Ponto discutível.** A semântica "pelo menos uma vez" aceita comentários duplicados como mal menor. Essa é a escolha usual em filas, e os motivos dessa preferência podem ser discutidos com a turma.

### Relação com o trabalho final

- Não há relação direta com os cenários. A mais próxima é com o **Cenário 2** [C 2], "sem internet, não há modelo maior para socorrer", mas nele a falta de rede afeta o produto, e a relação não deve ser forçada.

---

## Questão 10. Regra comum para agentes diferentes

### Situação

Em um grupo, uma pessoa usa Claude Code, outra usa OpenCode (o agente da disciplina [HD]) e a terceira usa Codex. A regra "não empurre para a `main`" precisa valer para os três agentes.

### Perguntas para a turma

- A mesma lógica de travas pode valer em três agentes que expõem eventos diferentes?
- Como tratar um agente que não permite recusar um comando antes da execução?
- Quem escreve o adaptador de um agente novo: o mantenedor do harness ou o próprio agente?

### Alternativas e custos

| Alternativa | Custo de adoção | Custo ou risco da não adoção | Suficiente quando |
|---|---|---|---|
| Um único agente para o grupo | perda da liberdade de escolha | — | grupo que chega a acordo |
| Núcleo com contrato de eventos e adaptador fino por agente | escrever e ensaiar cada adaptador | regras diferentes para cada pessoa | grupo com agentes diferentes |
| O próprio agente escreve o adaptador, a partir de um roteiro e de testes de contrato | roteiro e testes de qualidade; confiança no resultado | — | agentes que o mantenedor não usa |
| Apenas regras no servidor (proteção de ramo, CI) | nenhum componente local | aviso tardio, só no push | complemento em todos os casos |

### Solução no harness

- **Contrato de quatro eventos** (começo de sessão, sinal de vida, antes de ferramenta, fim de sessão), com entrada e saída em JSON normalizadas; o adaptador apenas traduz [D §8]. **[pronto]**
- **Adaptador do Claude Code**, ensaiado com o agente real (Claude Code 2.1.319) [R-ens; README]. **[pronto]**
- **Tabela de capacidades** do Claude Code, do Codex e do OpenCode, com fontes oficiais e ensaio [R-cap]. Os três permitem recusar antes de comando e de edição; o OpenCode não tem evento de começo nem de fim de sessão com origem (o contexto entra por um gancho executado antes de cada chamada ao modelo); o Codex só executa ganchos do projeto depois que a pasta e cada gancho são marcados como confiáveis [R-cap, tabela e "O que não fica coberto"]. **[pronto]** (documento).
- **Adaptadores escritos pelos próprios agentes.** O autor decidiu que o harness não inclui adaptadores prontos do Codex e do OpenCode. A fatia 4 entrega um roteiro em `docs/agentes/`, testes de contrato que todo adaptador precisa passar, uma referência no `AGENTS.md` e um item no `doctor` que informa quando as travas não se aplicam [D §15]. **[planejado, fatia 4]**
- **Sem adaptador**, o `ah` funciona com `AH_SESSAO`, sem travas automáticas e sem resumo [D §8]. O `init` aceita hoje apenas `--agentes claude-code` [R-cmd "init", tabela de recusas]. **[pronto]**

### Aplicação

Com o Claude Code, usam-se `node <clone>/nucleo/bin/ah.mjs init` e `tools/ah doctor` [README]. Com OpenCode ou Codex, na versão atual, os comandos funcionam com `AH_SESSAO=<nome>`, mas as travas automáticas não. A tabela de capacidades indica o que um adaptador do OpenCode teria de usar (plugin em `.opencode/plugins/`, com `execute.before` lançando exceção para recusar) [R-cap, linhas (a)–(c), (h)].

### Limites e escolhas discutíveis

- **Paridade entre agentes.** A paridade é o resultado de uma sondagem, sem compromisso de garantia [D §12.3].
- **Codex e OpenCode sem ensaio.** O Codex e o OpenCode não foram ensaiados com o harness; as colunas correspondentes vêm da documentação e de uma sonda mínima [P01 "Não ensaiado"; R-cap "Ensaio"]. No Codex, a sonda não conseguiu executar os ganchos do projeto sem marcá-los como confiáveis [R-cap "Ensaio"].
- **Data do ensaio com o Claude Code.** O ensaio com o Claude Code ocorreu antes da última rodada de correções e sem `--setting-sources project` [P01 "Não ensaiado"; R-ens "Execução"].
- **Ponto discutível (decisão do autor).** A escrita do adaptador pelo próprio agente transfere ao aluno um trabalho que o mantenedor não testou [D §15]. Como a turma usa o OpenCode [HD], o harness, na versão atual, não protege o agente usado pela turma.

### Relação com o trabalho final

- **Cenário 9** [C 9]: escrever um plugin que aplica um método dentro de um harness. A escrita do adaptador do OpenCode para o `agent-harness`, com base na tabela de capacidades, é um trabalho do mesmo tipo (extensão do harness por eventos), com o contrato já definido. A proposta depende da existência da fatia 4 ou de o aluno trabalhar apenas com a tabela (ver Lacunas).
- **Cenário 7, "O meu harness"** [C 7]: "Tocam em hooks". O contrato de quatro eventos é um modelo reduzido do que um harness precisa interceptar.

---

## Questão 11. Custo do método

### Situação

Para uma mudança de três linhas, o agente escreve uma especificação e um plano de oito tarefas e despacha um subagente e um revisor por tarefa, com gasto de uma tarde e de muitos tokens. Em outra frente, sem plano, o agente reescreve metade do módulo sem revisão.

### Perguntas para a turma

- Em que situações a spec e o plano compensam, e em quais representam peso?
- O que muda em custo, controle e revisão entre subagentes dentro de uma sessão e várias sessões em paralelo?
- Modelo grande para todas as tarefas ou modelo escolhido por tarefa? Quem decide?
- O harness deve recusar trabalho sem plano?

### Alternativas e custos

| Alternativa | Custo de adoção | Custo ou risco da não adoção | Suficiente quando |
|---|---|---|---|
| Sem método: pedido direto ao agente | nenhum | retrabalho; ausência de referência para a revisão | mudanças de um commit |
| Plano de partida curto | escrita do plano | — | a maior parte do trabalho |
| Spec, plano e execução por subagentes com revisão por tarefa | tempo, tokens, revisão por quem decide | defeitos descobertos tarde | mudança de desenho |
| Várias sessões em paralelo, uma frente cada | atenção de quem coordena; integração | — | trabalho independente e extenso |

### Solução no harness

- **Ausência de recusa por método ou modelo.** O harness nunca recusa por causa do método ou do modelo [D §11 "Regra geral"; N "Escolha de modelos"].
- `tools/ah open --plano <arquivo>` guarda o caminho do plano na frente, e o quadro e o resumo o exibem [D §11 "Ligação com o método"; R-cmd "open"]. **[pronto]**
- **Trilhas por tamanho** (um commit; plano de partida; spec e plano; investigação longa), com a trilha leve como padrão do aluno. O `AGENTS.md` instalado indica quais skills entram em cada trilha, para evitar a carga de texto desnecessário [N "Peso do método"]. **[planejado, projeto 2]**
- **Níveis de modelo neutros** (alto, médio, leve), traduzidos na configuração de cada agente. O plano marca o nível de cada tarefa; `ah modelo <nível>` fica como extensão; o modelo de cada sessão vai para o quadro, para medir o uso de modelo grande em trabalho pequeno [N "Escolha de modelos"]. **[planejado]**
- **Construção em fatias.** Cada fatia termina utilizável e testada, e a seguinte só começa depois [D §12.1]. A construção do harness aplica, portanto, o método que ele recomenda.
- **Custo declarado:** "cada sessão e cada subagente a mais consome tokens e pede revisão de quem decide; o número de sessões é escolha de quem usa" [D §12.6].

**Método aplicado na fatia 2** (fonte primária). Por ordem do autor, implementadores e revisores usam um modelo grande, e as tarefas mecânicas, um modelo médio [L 3]. Trabalha um implementador por vez, e o implementador não despacha subagente nem revisor [RT 7]. Cada tarefa passa por revisão de conformidade e de qualidade e, quando há achados, por correção e nova revisão [L 9–56]. O ledger registra cada decisão do controlador como "Ruling", com o custo caso ela esteja errada [L 4–8, 16–17, 29, 52].

### Aplicação

No projeto do aluno, recomenda-se escolher a trilha pelo tamanho da mudança, registrar no plano o nível de modelo de cada tarefa e, se houver subagentes, manter um ledger no formato "decisão — motivo — custo se errado" [L 4]. O comando `tools/ah open <nome> --plano docs/plano.md` associa a frente ao plano.

### Limites e escolhas discutíveis

- **Ausência de medida de custo.** O material não contém medida de custo: o ledger não registra horas nem tokens por tarefa, e `board --numeros` está apenas planejado [D §12.5]. A aula não pode informar o custo da fatia 2.
- **Volume de texto das skills.** As duas coleções de skills carregam muito texto no contexto, e o próprio autor reconhece esse peso [N "Peso do método"].
- **Ponto discutível.** A regra "nunca recusar por método" deixa a adoção do método a critério de quem usa o harness; em uma turma, o resultado pode ser a não adoção.

### Relação com o trabalho final

- **Cenário 6, "Especificação antes do código"** [C 6] e **Enunciado §1, "Um método"** [E §1]: a hipótese é que a spec ajuda no começo e se torna peso quando o pedido muda. O desenho do harness mudou durante a construção, e o documento registrou as mudanças em seções novas que prevalecem sobre as anteriores: "§12 Ajustes depois da avaliação do desenho" ("onde esta seção e as anteriores divergirem, vale esta") e "§15 Outros agentes se adaptam sozinhos", que anula partes da §8 e da §14 [D §12, §15]. O plano da fatia 2 revisou uma decisão da fatia 1 (`/clear`) [P2 decisão 5]. O aluno pode adotar o padrão (spec viva com precedência explícita) ou contestá-lo, com o argumento de que ler uma spec com seções que se anulam custa mais do que reescrevê-la.
- **Cenário 7, "O meu harness"** [C 7]: a hipótese é "acabe tirando boa parte das peças que copiei". O desenho registra um episódio semelhante: após a avaliação do desenho, o autor reorganizou a construção em fatias e retirou os adaptadores prontos de dois agentes [D §12, §15]. O mesmo documento define: "Seria fracasso: uma peça que o aluno não consiga ler e explicar" [D §3].
- **Enunciado §4, "horas e gasto com modelos"** e "definam um teto de gasto" [E §4]: o harness não mede gasto na versão atual, e o aluno que usar subagentes precisa registrá-lo manualmente.
- **Cenário 8, "Será que dá mesmo em uma semana?"** [C 8]: a relação é fraca. As fatias garantem "algo utilizável" a cada etapa, mas o material não registra prazos previstos × realizados.

---

## Questão 12. Critério de "pronto" e prova

### Situação

O agente declara "pronto, todos os testes passam", e a pessoa integra a mudança. No dia seguinte, outra sessão descobre que a reserva de ticket desiste nos dois lados quando dois tickets são pedidos em ordem cruzada.

### Perguntas para a turma

- O que conta como evidência de "pronto": a declaração do agente, o comando e a saída, ou a CI?
- Quem revisa o que o agente fez: o mesmo agente, outro agente ou a pessoa?
- Um revisor que leu o raciocínio do implementador encontra menos defeitos?
- O que prova um teste aprovado contra uma implementação falsa (`gh` falso)?

### Alternativas e custos

| Alternativa | Custo de adoção | Custo ou risco da não adoção | Suficiente quando |
|---|---|---|---|
| Confiar na declaração do agente | zero | defeito integrado | nunca |
| Comando e saída no PR ou no ticket | colar a saída | "pronto" sem evidência | sempre, como mínimo |
| Revisão pelo mesmo agente | baixo custo | o agente revê apenas o que já considerou | mudanças pequenas |
| Revisão independente (outro agente, sem o contexto do implementador) | tokens, tempo, correções | defeitos de desenho e de casos de borda passam | mudanças com corrida, estado, segurança |
| Ensaio com o agente real | credenciais, máquina do autor | contrato errado com o agente | adaptadores e travas |

### Solução no harness

- **Comando e saída como condição de "pronto"**, por regra do `AGENTS.md` que o projeto 2 instala [N "Proposta de integração das skills"]. **[planejado, projeto 2]**
- **Critério de término das tarefas.** Cada tarefa termina com `node --test teste/` aprovado, a varredura de termos com código 0 e um commit por caminho [P2 restrições globais; RT 5].
- **`tools/ah doctor`** confere 15 itens e executa uma recusa real ("gancho responde") [R-cmd "doctor"]. **[pronto]**
- **Ensaio com o agente real** registrado na documentação, com versão e data [D §8 "Prova de cada adaptador"; R-ens]. **[pronto]** para o Claude Code.
- **Revisão independente por tarefa** na execução da fatia 2 (conformidade com o plano e qualidade). Casos registrados no ledger:

| Tarefa | Achados do revisor | Fonte |
|---|---|---|
| 1, sessão viva | 5 achados, entre eles a hora de início lida pelo `ps` em fuso e idioma locais, `AH_PID_AGENTE` ausente nos testes e a falta de um teste com dois processos | L 10 |
| 2, herança | herança por processo sem conferir a hora de início dos dois lados; o controlador decidiu contra o brief, a favor da spec ("na dúvida, não") | L 15–16, 21 |
| 3, papel e quadro | a recusa do `close` sugeria `AH_SESSAO=<dona>` (o que ensinava o agente a se passar por outra sessão); uma sessão ilegível derrubava o quadro; uma frente sem dona não aparecia como órfã | L 24–28 |
| 4, fila de pendentes | um erro permanente com outro texto travava a fila sem aviso; um comentário podia sair duplicado; o `gh` falso aceitava o que o real recusaria | L 35–40 |
| 5, reserva | tickets cruzados: as duas frentes desistiam; o próprio login era recusado; marcador lido de qualquer autor; chamada de rede dentro da trava de estado | L 44–52 |

Nas cinco tarefas, a revisão solicitou correção. Nas quatro primeiras, a correção passou por nova revisão antes de a tarefa ser considerada completa [L 11, 23, 34, 56]; na quinta, a correção estava despachada e ainda sem nova revisão no momento da leitura [L 55]. Nesse intervalo, o número de testes passou de 410 para 487 [L 9, 53].

### Aplicação

No projeto do aluno, toda declaração de "pronto" deve vir acompanhada do comando e da saída (no commit, no PR ou no registro). Com subagentes, o revisor deve receber o diff e o plano, e não a conclusão do implementador. Ao final da preparação, executa-se `tools/ah doctor` e registra-se a saída [D §6 "ah doctor"].

### Limites e escolhas discutíveis

- **Testes contra implementação falsa.** Um teste executado contra uma implementação falsa verifica apenas o comportamento dessa implementação. O revisor da tarefa 4 constatou que o `gh` falso aceitava rótulo e campo desconhecidos [L 40], de modo que os testes passavam em casos que o `gh` real recusaria.
- **Testes em Windows e macOS.** Os testes nunca foram executados em Windows e macOS; a CI nos três sistemas consta do desenho [D §3, §10], mas o registro indica "não executado" [P01 "Não ensaiado"].
- **Ponto discutível.** O revisor usa um modelo do mesmo fornecedor e do mesmo porte que o implementador [L 3]; a independência de contexto não implica independência de vieses.

### Relação com o trabalho final

- **Enunciado §8, Avaliação** [E §8]: "Evidência: o que o artigo afirma aparece no registro feito durante o trabalho" e "o trabalho fica insuficiente se o artigo afirma o que o registro não mostra". A exigência de comando e saída para declarar "pronto" aplica a mesma regra ao código. O ledger (`progress.md`) exemplifica um registro feito durante o trabalho, linha a linha, com decisões e achados anotados no momento em que ocorreram.
- **Enunciado §8, Domínio** [E §8]: "Você explica a parte que fez". O desenho do harness tem a regra equivalente para o código: uma peça que não se consegue ler e explicar é considerada fracasso [D §3].
- **Enunciado §1, "Você: o que eu delego e depois tenho de refazer?"** [E §1]: a tabela de achados acima é um caso concreto de "o que o agente fez e o revisor mandou refazer", com a causa de cada item.
- **Enunciado §4, cuidados, ambiente descartável** [E §4]: o ensaio com o agente real foi executado em um repositório descartável, sem remoto [R-ens "Preparo"; R-cap "Ensaio"].

---

## Questão 13. Fechamento do trabalho e publicação

### Situação

A sessão conclui a frente e apaga o worktree e o ramo. Um commit ainda não tinha sido integrado, e um `.env` ignorado pelo git, com a configuração local, foi apagado junto. Em outro dia, o agente envia a `dev` para a `main` "para publicar".

### Perguntas para a turma

- O que precisa ser conferido antes de apagar o local de trabalho de outra pessoa?
- Quem fecha o ticket: quem trabalhou ou quem integrou?
- Publicar é um passo técnico ou uma decisão? De quem?

### Alternativas e custos

| Alternativa | Custo de adoção | Custo ou risco da não adoção | Suficiente quando |
|---|---|---|---|
| Apagar o worktree manualmente | zero | perda de commits e de arquivos ignorados | quem conhece todo o conteúdo do worktree |
| `close` com conferência (commits na base ou no remoto, worktree limpo, arquivos ignorados listados) | código de conferência; recusas | perda silenciosa | sempre |
| Fluxo com `dev` livre e `stage` e `main` apenas por PR com ordem | um ramo adicional; PRs | publicação acidental | projetos com publicação |

### Solução no harness

- `tools/ah close` executa apenas no checkout principal, na base, depois do merge. O comando confere que nada se perde (worktree limpo, commits já na base ou no remoto, nenhum arquivo ignorado que seria apagado; `--descartar-ignorados` aceita perdê-los), libera os tickets antes de apagar, não fecha o ticket, grava a linha do histórico com um commit e nunca faz push [D §6; R-cmd "close"]. **[pronto]**
- Fluxo de ramos: `dev` é a base e não tem restrições; `stage` publica em teste e `main` em produção, e os dois são protegidos [D §11 "Fluxo de integração padrão"; D §12.2; M-sp "Fluxo de ramos"]. **[pronto]**

### Aplicação

```
git merge --no-ff feat/carrinho        # no checkout principal, na dev
git push origin dev
tools/ah close --resumo "soma do carrinho"
# Frente as-1 carrinho fechada.
# Falta: git push origin dev
```
[M-sp "O ciclo de uma frente"; R-cmd "close"].

### Limites e escolhas discutíveis

- O `close` não trata submódulos [P01 "Pendências menores"].
- **Ponto discutível.** O fluxo de três ramos (`dev`, `stage`, `main`) vem do projeto de origem e pode ser excessivo para um grupo com quatro semanas de trabalho. Os nomes vêm da configuração [D §5], mas o `init` cria `dev` e `stage` caso não existam [R-cmd "init"].

### Relação com o trabalho final

- **Cenário 3, "Onde aperta"** [C 3]: "quem pode alterar o `AGENTS.md` compartilhado". A mesma pergunta vale para os ramos: quem pode integrar na base e quem publica. O harness responde com papéis: o executivo decide, e a integração é uma operação comum do git no checkout principal [D §6].
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

**Temas sem relação.** O cenário 10 (decisão tipada) não se relaciona com nenhuma peça do harness. Os cenários 2 e 8 têm apenas relação fraca, que não deve ser forçada. A questão 9 (rede e servidor) não tem correspondente no trabalho final. O prelúdio (E §0) trata de AI slop e de produtividade medida apenas por código, aspectos que o harness não mede na versão atual.

---

## Propostas de artefatos

- **Slide:** a tabela das dores de origem [D §1] ao lado da peça que responde a cada uma.
- **Slide:** a tabela das travas com o estado de cada uma (questão 5).
- **Slide:** os dois níveis de paralelismo [D §12.6].
- **Demonstração ao vivo:** o comando `echo '{…"git add -A"…}' | tools/ah gancho claude-code`, com a recusa T2 e o código 2, em um repositório descartável (questão 5). A demonstração dispensa agente e rede.
- **Demonstração ao vivo:** a sequência `init`, `doctor`, `open carrinho`, `board`, merge e `close`, em um repositório descartável, com `AH_SESSAO` e `--sem-protecao` [R-ens "Preparo"].
- **Demonstração gravada:** o agente real recusado em `git push origin main` [R-ens].
- **Exercício:** dado um comando de shell, prever se a T2 ou a T5 o recusam e encontrar uma forma que escape às travas (com a lista de P01 como gabarito).
- **Exercício:** escrever a função que determina se a sessão está viva em três sistemas operacionais e listar as falhas possíveis (questão 1, P2 decisão 3).
- **Exercício:** desenhar o desempate de duas reservas no mesmo ticket e, em seguida, com tickets cruzados (questão 4, L 45).
- **Debate:** travas e instruções, a partir do cenário 9 e da regra "só as travas recusam" (questão 5).
- **Debate:** `/clear` como continuação da mesma sessão (questão 1, P01 4 × P2 decisão 5).
- **Debate:** o incidente do temporário cheio, a atribuição de responsabilidade e as medidas que o teriam evitado (questão 8).
- **Leitura guiada:** o ledger `progress.md` como exemplo de registro feito durante o trabalho (questão 12, E §4).

---

## Lacunas

**Afirmações sem sustentação nas fontes**

1. **Custo da construção.** Nem o ledger nem as pendências registram horas, tokens ou gasto por tarefa. Um número de custo na aula exigiria outra fonte.
2. **Números do projeto de origem.** "Mais de 280 frentes em um mês", "15% dos commits" e "16 mil tokens por sessão" constam do desenho [D §1], mas a fonte primária não está acessível nem pode ser citada (anonimização). Na aula, esses números devem ser apresentados como "relato do autor".
3. **Sobreposição entre máquinas.** O desenho não define se a sobreposição considera frentes de outra pessoa que não estão no estado local [D §11]; o plano faz o cálculo apenas sobre as frentes do estado [P2 tarefa 6].
4. **Variação do estado da fatia 2.** O estado da fatia 2 muda ao longo do dia. Este levantamento leu o commit `b4c48f3` e o ledger até a linha 56, e as tarefas 6 a 16 podiam estar em andamento. Antes da aula, é preciso conferir o `git log` e o fim do `progress.md`.
5. **Validade do ensaio.** O ensaio com o Claude Code é anterior à última rodada de correções da fatia 1 e a toda a fatia 2 [P01 "Não ensaiado"]. A fatia 2 prevê novo ensaio na tarefa 14 [P2].
6. **Nível da turma.** A pasta `aulas/` vai até a aula 03 (API, loop, aprovação humana), e o desenho situa o harness no encontro 13 [D §1; PE]. As fontes consultadas não informam em que encontro a turma está nem o que ela já estudou de git (worktree, ramos, merge).

**Pontos que dependem de decisão do autor**

1. **Forma de acesso dos alunos ao harness.** O repositório é local e só será publicado com ordem expressa [D §10 "Publicação"]. Sem publicação, a turma não pode clonar o repositório, e a aula se limita a demonstrações.
2. **Agente da demonstração.** A turma trabalha com OpenCode [HD]; o harness só tem adaptador do Claude Code, e o do OpenCode depende da fatia 4 (planejada) ou de ser escrito pelo próprio aluno [D §15]. Cabe decidir se a demonstração usa o Claude Code, ou se o adaptador do OpenCode se torna exercício ou proposta de trabalho final (cenário 9).
3. **Peças ainda não implementadas.** Handoff, takeover, sweep, sobreposição, T1, T3, T4 e a fila de pesado não existiam no código no momento desta leitura. Cabe decidir se entram na aula como desenho (com o estado marcado) ou ficam de fora.
4. **Uso do ledger e dos relatórios da execução como material.** São arquivos em `.superpowers/sdd/`, com caminhos da máquina (por exemplo, a pasta temporária do job). Antes de projetá-los ou distribuí-los, cabe decidir se entram na aula e aplicar a varredura de termos a eles.
5. **Peso do fluxo de três ramos para grupos de quatro semanas** (questão 13): recomendar o fluxo como está ou sugerir apenas `main` com ramos de frente.
6. **Revisão do controlador sobre `--confirmado` e `AH_GUARD=off` como acordos de confiança** [L 5]: a aula pode tratá-los como escolha discutível, e convém que o autor declare se mantém essa escolha.
