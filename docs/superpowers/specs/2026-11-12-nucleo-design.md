# agent-harness: desenho do núcleo

Desenho do projeto 1 de 4. Escrito em 12/11/2026 a partir da conversa com o autor (elderbernardi).
As decisões marcadas **[autor]** foram ditas por ele; as marcadas **[desenho]** são escolhas de quem escreveu este documento e podem ser revistas.

## 1. Por quê

O autor construiu, dentro de um projeto real, uma estrutura para programar com vários agentes ao mesmo tempo: várias sessões de agente na mesma máquina e várias pessoas no mesmo repositório, com o GitHub como registro de quem faz o quê. Essa estrutura funcionou (mais de 280 unidades de trabalho abertas e fechadas em um mês), mas está presa àquele projeto: nomes, caminhos, banco e ramos estão fixos no código, só roda em Linux e só foi provada com um agente.

O `agent-harness` é a versão replicável e explicável dessa estrutura. Serve a dois fins:

1. **Uso:** qualquer pessoa aponta o agente dela para o repositório, pede "prepare meu projeto" e passa a trabalhar com várias sessões sem que uma atrapalhe a outra.
2. **Ensino:** é o objeto de uma ou duas aulas da disciplina Programação Agêntica (encontro 13, delegação e recuperação, com ponte para os encontros 10 a 12). O público são concluintes de Ciência da Computação. Cada peça precisa ser legível e ter a dor que resolve escrita ao lado.

### As dores de origem (anonimizadas)

Cada peça do núcleo responde a um incidente real. O manual (projeto 4) vai contar essas histórias; o núcleo precisa preservar a resposta.

| Dor | O que aconteceu | Peça que responde |
|---|---|---|
| Sessões pisando umas nas outras | Duas sessões editaram os mesmos arquivos; commits de uma caíram no checkout que todas usam; uma trocou o ramo do checkout comum | Worktree e ramo por frente; travas |
| Quadro dentro do git | O quadro de "quem faz o quê" era um arquivo commitado: 15% de todos os commits eram só atualização dele, e cada sessão gastava cerca de 16 mil tokens para lê-lo | Estado fora do git, resumo curto no começo da sessão |
| Linha morta | Sessão que morria deixava "em andamento" para sempre | Sinal de vida e tomada de frente órfã |
| Máquina derrubada | Vários builds e testes ponta a ponta juntos esgotaram a memória; o sistema matou o editor, as sessões e o banco | Fila de trabalho pesado |
| Trabalho duplicado entre máquinas | Duas pessoas pegaram o mesmo ticket | Reserva do ticket no GitHub |
| Perda de contexto | Depois de limpar ou compactar a conversa, a sessão não sabia mais qual era a frente dela | Resumo injetado no começo da sessão, herança da frente |
| Push acidental | Agente empurrando para o ramo que publica em produção | Trava de ramo protegido |
| Passagem de bastão espalhada | Quem retomava um trabalho parado não achava o estado | `handoff` com comentário padronizado no ticket |

## 2. Os quatro projetos e as fronteiras

O trabalho todo foi dividido em quatro projetos, feitos nesta ordem **[autor]**. Este documento cobre só o primeiro, mas registra o que os outros esperam dele.

1. **Núcleo** (este documento).
2. **Método e conhecimento:** skill "prepare meu projeto", `AGENTS.md` de princípios, glossário e ADRs, triagem, instalação das skills do Superpowers e do Matt Pocock, skill de orquestração, wiki com suas skills, skill de ingestão de reunião, e os opcionais (banco e portas por worktree, reserva de migração, prova por árvore, cofre de segredos como sugestão).
3. **Identidade visual:** repositório-modelo clonável (tokens de design, geradores, CI, versão por tag) e a peça que o integra a uma aplicação.
4. **Manual de estudo e aulas:** dentro do `agent-harness` e publicado no GitHub Pages da disciplina.

O que o núcleo deve aos outros:

- Ao projeto 2 e 3: a **interface de extensão** (seção 9). Os opcionais e a integração com a wiki e a identidade serão extensões; o núcleo não conhece banco, migração, teste ponta a ponta, wiki nem identidade.
- Ao projeto 2: o comando `ah init`, que a skill "prepare meu projeto" chama, e `ah doctor`, que ela usa para mostrar que funcionou.
- Ao projeto 4: o registro de eventos (`eventos.jsonl`), que dá os números das aulas, e a documentação de referência por comando.

## 3. Objetivos, fora do escopo e o que seria fracasso

**Objetivos**

- Várias sessões de agente e várias pessoas trabalham no mesmo repositório sem conflito, com o estado visível num quadro.
- Nada do projeto fica fixo no código: tudo vem de um arquivo de configuração do projeto.
- Funciona com Claude Code, Codex e OpenCode **[autor]**, com a mesma lógica de travas para os três.
- Roda em Linux, WSL2, macOS e Windows nativo; o recomendado e o que a aula usa é Linux ou WSL2 **[autor]**.
- Pode ser estendido com novos comandos e funcionalidades sem mexer no núcleo, e o guia de como fazer isso faz parte da entrega **[autor]**.
- O próprio harness tem testes, e eles rodam na CI nos três sistemas.

**Fora do escopo do núcleo**

- Banco, portas, migração, prova de teste ponta a ponta, wiki, identidade, cofre de segredos (projetos 2 e 3, como extensões).
- Deploy **[autor: fica para depois]**.
- Empacotar como plugin ou pacote de skills **[autor: follow-up]**.
- Instalação única por máquina em vez de cópia por projeto **[autor: follow-up]**; ver seção 4.
- Outros rastreadores além do GitHub. Outros agentes além dos três.
- Mensagens diretas entre sessões: dependem do agente. O núcleo oferece notas e comentários nos tickets.

**Seria fracasso mesmo funcionando**

- Qualquer nome real do projeto de origem aparecer no repositório (cliente, produto, sistema de terceiros, pessoa, número de ticket, endereço, caminho local). A única exceção é o nome do autor, elderbernardi **[autor]**.
- O aluno precisar rodar comandos na mão para instalar ou usar: toda interação é pelo agente **[autor]**.
- Uma peça que o aluno não consiga ler e explicar. Código curto e direto vale mais que código esperto.
- Travas que deixam passar em silêncio quando quebram.

## 4. Onde o harness mora

**Decisão [autor]:** o harness fica copiado dentro de cada projeto, como no projeto de origem. Separar a instalação criaria atrito para o aluno.

**Custo conhecido, a documentar:** cada worktree é um checkout completo e portanto carrega a própria cópia do harness; worktrees antigos ficam com cópias velhas e se comportam diferente. A instalação única por máquina resolveria e fica como follow-up.

**Mitigação [desenho]:** o ponto de entrada sempre descobre o checkout principal (pelo `git worktree list`) e executa a cópia de lá, nunca a do worktree onde foi chamado. Todas as frentes usam a mesma versão.

Disposição dentro do projeto que recebe o harness **[desenho]**:

```
.harness/
  nucleo/            cópia do harness; ninguém edita à mão
    MANIFEST.json    versão, commit de origem, data da cópia
  config.json        configuração do projeto (seção 5)
  extensoes/         extensões do próprio projeto (seção 9)
tools/ah             ponto de entrada (sh)
tools/ah.cmd         ponto de entrada (Windows)
docs/agents/
  sessoes-paralelas.md        referência de uso, copiada de um modelo
  historico-das-frentes.md    uma linha por frente fechada
```

Mais os arquivos de gancho de cada agente ligado (seção 8).

Disposição do repositório `agent-harness` **[desenho]**:

```
nucleo/        o que é copiado para .harness/nucleo/ (bin, lib, adaptadores, extensões que acompanham)
modelos/       documentos e arquivos de gancho copiados pelo init
teste/         testes do harness
docs/          referência, guia de extensão, desenhos e planos
```

`ah init` copia a partir de um clone local do `agent-harness`; `ah atualizar --de <clone>` troca `.harness/nucleo/` por uma versão mais nova e mostra o que mudou. `config.json` e `extensoes/` nunca são sobrescritos.

## 5. Configuração

Um arquivo, `.harness/config.json`, com esquema versionado. Tudo tem valor padrão; um projeto novo começa só com o nome. Conteúdo:

- `versaoDoEsquema`, e a versão mínima do harness que o projeto espera.
- `projeto`: nome curto (usado no diretório de estado e nos textos).
- `git`: ramo base das frentes, prefixo do ramo da frente (padrão `feat/`), lista de ramos protegidos, remoto. Padrões: base `dev`, protegidos `stage` e `main` (seção 11).
- `github`: repositório (`dono/nome`; padrão: descoberto pelo remoto), rótulo de reserva.
- `worktrees`: diretório onde as frentes são criadas (padrão: pasta de cache do usuário, com o nome do projeto).
- `pesado`: número de vagas, memória livre mínima para rodar ao lado de outro trabalho, classes com os padrões de comando que caem em cada uma (seção 7).
- `agentes`: quais adaptadores estão ligados.
- `extensoes`: quais extensões estão ligadas, e a configuração de cada uma.
- `fuso`.

Configuração inválida faz todo comando parar com a linha e o motivo. Não existe valor do projeto de origem como padrão em lugar nenhum.

## 6. Conceitos e ciclo de vida

**Sessão:** uma conversa de um agente, identificada pelo id que o agente fornece. **Frente:** uma unidade de trabalho com nome, ramo e worktree próprios, ligada a zero ou mais tickets. **Papéis:** o *executivo* é o humano que decide; o *orquestrador* distribui e integra, pode ter várias frentes e abrir frente para outra sessão; o *executor* (padrão) tem uma frente por vez.

Comandos (nomes em inglês, como no original; textos e mensagens em português **[desenho]**):

| Comando | O que faz |
|---|---|
| `ah init` | Instala o harness num projeto: copia o núcleo, grava a configuração, os documentos e os ganchos dos agentes escolhidos. Não sobrescreve o que existe sem mostrar |
| `ah doctor` | Confere a máquina e o projeto (Node, git, `gh` autenticado, configuração, ganchos instalados e respondendo, versão). Cada item sai como passou ou falhou, com o conserto. É a verificação mostrada ao aluno no fim da preparação |
| `ah whoami` | Quem é a sessão, o papel e a frente dela |
| `ah papel <orquestrador\|executor>` | Troca o papel da sessão |
| `ah open <nome> [--tickets 1,2] [--plano <arquivo>] [--caminhos <globs>] [--para <sessão>]` | Reserva os tickets, cria ramo e worktree a partir da base, comenta nos tickets, avisa de frentes que tocam os mesmos arquivos |
| `ah nota "<texto>"` | Deixa uma nota na frente; aparece no quadro e para quem abrir frente que toca os mesmos arquivos |
| `ah handoff [--nota]` | Para no meio: exige worktree limpo, empurra o ramo, comenta a passagem de bastão com o comando para retomar; a frente fica "passada" e sem dona |
| `ah takeover <nome>` | Assume frente cuja sessão dona morreu; pede confirmação humana |
| `ah close [--resumo]` | Fecha: confere que nada se perde (worktree limpo, commits já na base ou no remoto, nenhum arquivo ignorado que sumiria), libera os tickets, remove worktree e ramo, grava a linha do histórico |
| `ah board` | O quadro: frentes, donas, estado, tickets, notas, sobreposições, fila de pesado |
| `ah deps [ticket] [--json]` | O que bloqueia o quê entre os tickets, e o que está livre para começar (seção 11) |
| `ah sweep [--reparar]` | Lista o que está fora do lugar (worktree sem frente, frente órfã, sessão morta). `--reparar` só conserta o estado; nunca apaga worktree nem ramo |
| `ah pesado -- <comando>` | Roda um comando pela fila de trabalho pesado (seção 7) |
| `ah atualizar --de <clone>` | Troca a cópia do núcleo |

Regras do ciclo que o núcleo impõe, herdadas do original:

- `open` com tickets reserva no GitHub antes de criar qualquer coisa; sem rede, recusa.
- Executor com frente ativa não abre outra.
- `close` só roda a partir do checkout principal, libera os tickets antes de apagar e não fecha o ticket (fechar é ato de quem integra).
- Integrar (merge na base) não é comando do harness: é git normal, feito no checkout principal. O harness só vigia com as travas.

**Simplificação em relação ao original [desenho]:** o original, ao abrir uma frente, commitava sozinho os arquivos sujos do checkout principal e para isso registrava a autoria de cada edição. Aqui o `open` só lista o que está sujo e avisa; o worktree nasce da base de qualquer forma. Fica mais simples de explicar e não cria commit que o aluno não pediu.

### Estado

Fora do git, por máquina, num diretório de estado do usuário com o nome do projeto (variável de ambiente para trocar; padrão do sistema: XDG no Linux, `Application Support` no macOS, `LOCALAPPDATA` no Windows). Só o harness escreve ali.

- Um arquivo JSON por sessão e um por frente, gravados de forma atômica (arquivo temporário e renomeação), com versão de esquema.
- Exclusão mútua por criação de diretório, com dono e vencimento quando o dono morreu. Funciona nos três sistemas.
- `eventos.jsonl`, só de acréscimo: aberturas, fechamentos, passagens, tomadas, recusas das travas.
- Fila de comentários pendentes quando o GitHub não responde, reenviada depois.

Dentro do git ficam só o histórico (uma linha curta por frente fechada, commitada pelo `close` com o caminho do arquivo) e, no GitHub, os comentários nos tickets, que são o canal entre máquinas.

### Sessão viva

O original lia `/proc`. Aqui **[desenho]**: a sessão está viva se o processo registrado existe e o sinal de vida (um arquivo cuja data os ganchos atualizam a cada interação) não venceu. Onde for barato conferir também a hora de início do processo, para não confundir com um pid reaproveitado, confere. O prazo de vencimento vem da configuração. A forma exata por sistema fica com quem constrói.

## 7. Travas e fila de pesado

### Travas

Avaliadas antes de o agente executar um comando de shell ou editar um arquivo. A lógica é uma função pura: entra o comando (ou o caminho do arquivo), o diretório e o estado; sai "permite" ou "recusa" com a explicação e o que fazer no lugar.

| Trava | Recusa |
|---|---|
| T1 | Trocar o ramo do checkout principal |
| T2 | Adicionar tudo de uma vez no checkout principal (`git add -A`, `git add .`, `commit -a`) |
| T3 | Descartar trabalho (`reset --hard`, `clean -f`, `checkout .`, `stash`, `rebase`) |
| T4 | Escrever no worktree de outra sessão viva, por git ou por edição de arquivo |
| T5 | Empurrar para ramo protegido, em qualquer forma (sem destino explícito, `--all`, `--mirror`), e mesclar PR pela linha de comando |
| T6 | Rodar trabalho pesado fora da fila |

- Um interpretador de shell só, escrito uma vez, serve a todas as travas (o original tinha dois). Precisa entender encadeamento, subshell, `bash -c`, heredoc e `cd`.
- Liberar uma trava: prefixo `AH_GUARD=off` no próprio comando, só com ordem do executivo; vale para aquele comando.
- **Gancho que quebra recusa [autor aceitou]**: se o gancho não consegue avaliar (Node ausente, configuração inválida, erro interno), a ação é recusada com a explicação e a instrução de rodar `ah doctor`. O original deixava passar.
- Toda recusa vai para `eventos.jsonl`.
- **Limite a declarar:** as travas leem o texto do comando; não são uma caixa de areia. E o interpretador cobre shell POSIX. No Windows nativo com PowerShell as travas de comando não se aplicam; o `doctor` avisa, e é mais um motivo para recomendar WSL2. T4 para edição de arquivo vale em todos.

### Fila de trabalho pesado

`ah pesado -- <comando>` espera a vez, roda o comando e devolve a saída e o código dele.

- Número de vagas e classes vêm da configuração. Cada classe tem padrões de comando e diz quantas vagas ocupa (por exemplo: "exclusivo" ocupa todas; "grande" e "leve" ocupam uma). Comando não reconhecido cai na classe mais restritiva.
- Para rodar ao lado de outro trabalho, exige memória livre mínima e que o outro seja de outro worktree.
- Ordem de chegada: quem espera tem senha; senha de processo morto é descartada; quem precisa de todas as vagas não é ultrapassado indefinidamente.
- Ao receber sinal de término, mata a árvore inteira do comando antes de soltar a vaga.
- Chamada aninhada (um comando pesado que chama outro) roda direto.
- `ah pesado --help` mostra ajuda e `--classe <comando>` diz a classe sem rodar.
- Escrita em Node, sem `flock` nem `/proc` **[desenho]**, para rodar nos três sistemas.
- A fila é da máquina, não do projeto: dois projetos com o harness na mesma máquina disputam as mesmas vagas **[desenho; o original já fazia assim entre repositórios irmãos]**.

## 8. Adaptadores de agente

O núcleo define um contrato de quatro eventos, com entrada e saída em JSON já normalizadas:

| Evento | O que o núcleo faz |
|---|---|
| Começo de sessão | Registra a sessão; se ela continua uma anterior (conversa limpa, compactada ou retomada), herda a frente; devolve o resumo a injetar no contexto |
| Sinal de vida | Atualiza a data do sinal; sem saída |
| Antes de ferramenta | Aplica as travas; devolve permite ou recusa |
| Fim de sessão | Marca a sessão como encerrada |

O resumo do começo de sessão é curto (limite em caracteres): quem a sessão é, papel, frente dela, frentes das outras, sobreposições, estado do ramo base, quem está no pesado, as regras em uma linha e onde ler mais.

Cada adaptador é fino: traduz o formato do agente para o contrato e de volta, e traz o arquivo de gancho que o `init` copia. Três adaptadores:

- **Claude Code:** ganchos no arquivo de configuração do projeto.
- **Codex:** arquivo de ganchos do projeto; conhece a ferramenta de aplicar patch.
- **OpenCode:** plugin do projeto. Não existia no original; quem constrói tira o contrato da documentação oficial e, se o OpenCode não permitir injetar contexto no começo da sessão, o resumo chega por uma instrução no `AGENTS.md` mandando rodar `ah whoami`.

Sem adaptador, o comando `ah` continua funcionando com o id da sessão passado por variável de ambiente; só não há travas automáticas nem resumo.

**Prova de cada adaptador:**

1. Testes automáticos com eventos gravados do agente (rodam na CI).
2. Um ensaio que roda o agente de verdade, sem interface, num repositório descartável: pede uma ação proibida e confere que a recusa aconteceu e foi registrada. Precisa de credenciais, então roda na máquina do autor, e a saída fica guardada na documentação com a versão do agente e a data.

## 9. Extensões

A abertura pedida pelo autor. Uma extensão é uma pasta com um arquivo de entrada que declara o que acrescenta. Mora em `nucleo/extensoes/` (as que acompanham o harness) ou em `.harness/extensoes/` (as do projeto) e só vale se estiver ligada na configuração.

Uma extensão pode acrescentar:

- **Comandos:** `ah <nome>`, com descrição que aparece na ajuda.
- **Travas:** regras a mais avaliadas antes de ferramenta.
- **Verificações do `doctor`.**
- **Reações ao ciclo de vida:** depois de abrir, antes de fechar (podendo recusar o fechamento), depois de fechar, ao passar o bastão, no `sweep`.
- **Linhas no resumo e colunas no quadro.**
- **Campos próprios** no estado da frente e a própria seção na configuração, validada por ela.

O núcleo entrega a cada extensão um contexto com acesso de leitura ao estado, escrita só nos campos dela, configuração, git e GitHub pelos mesmos auxiliares do núcleo. Extensão que falha ao carregar faz o `doctor` acusar e não derruba os comandos do núcleo; trava de extensão que falha recusa, como as do núcleo.

Entregas desta parte:

- A interface, estável e com versão.
- Uma extensão de exemplo, pequena e completa, que acompanha o harness e é testada (sugestão: `recursos`, um registro simples de recursos por frente, como portas, que o `close` confere; serve de base aos opcionais do projeto 2).
- O guia "como estender o harness": um passo a passo que cria um comando novo, uma trava nova e uma reação ao fechamento, com teste.

## 10. Forma de construir

- Node 22 ou mais novo, sem dependências externas, módulos ES **[desenho]**. O motivo é didático e prático: nada para instalar, tudo legível.
- Código novo, escrito a partir do comportamento do original. O original é fonte de observação: nenhum texto, nome ou exemplo é copiado dele sem passar pela anonimização.
- Testes com o executor de testes do próprio Node, sobre repositórios descartáveis, com um `gh` falso. CI no GitHub Actions em Linux, Windows e macOS.
- Desenvolvimento por testes primeiro.
- Licença MIT **[desenho]**.
- Textos, mensagens e documentos em português **[desenho, confirmado pelo autor]**.

### Anonimização

- Exemplos usam nomes inventados (um projeto fictício, tickets fictícios).
- A lista de termos proibidos (nomes reais do projeto de origem) fica **fora** do repositório, num arquivo local do autor: uma lista commitada seria ela mesma o vazamento. Um script do repositório lê esse arquivo e varre a árvore e o histórico de commits; roda antes de cada publicação e a saída entra no pedido de publicação.
- Números das aulas (quantas frentes, quantas recusas por trava) podem ser citados, porque não identificam ninguém.

### Publicação

- Trabalho local em `~/projetos/agent-harness` até o autor aprovar.
- Destino: conta `elderbernardiifsul` no GitHub, repositório público **[autor]**. Criar o repositório remoto e empurrar só com ordem expressa do autor.

## 11. Esclarecimentos depois da revisão

Respostas às dúvidas de quem leu o desenho para planejar. Todas são **[desenho]**, salvo indicação.

**Acesso ao original.** Quem constrói lê o projeto de origem só para leitura. O caminho dele e a lista dos arquivos do harness de lá ficam fora deste repositório, em `~/.config/agent-harness/origem.md`, pelo mesmo motivo da lista de termos proibidos. O plano começa com um levantamento de comportamento dos pontos "herdados do original": reserva de ticket, texto do resumo, critérios do `sweep`. Onde este documento e o original divergirem, vale este documento.

**Fluxo de integração padrão [autor].** Três ramos: `dev` é a base das frentes e é livre; `stage` publica em teste e `main` publica em produção, e os dois são protegidos. Os nomes vêm da configuração. Caminho feliz, todo pelo agente: `ah open` → trabalho e commits no worktree → no checkout principal, `git merge --no-ff feat/<nome>` na `dev` → `git push origin dev:dev` → `ah close` (que commita a linha do histórico na `dev`) → novo push da `dev`. Levar `dev` para `stage` e `stage` para `main` é publicar: só com ordem do executivo, com `AH_GUARD=off` no comando. Se o `init` encontra um repositório sem `dev` ou sem `stage`, cria cada um a partir da `main`.

**Frente com ID curto, sem número em sequência [autor pediu um ID].** O original numerava as frentes em sequência, por máquina; com várias pessoas, os números colidem no histórico commitado. Aqui cada frente tem um nome (que dá o ramo e a pasta) e um ID no formato `<sigla>-<n>` **[autor: prefixo com o usuário abreviado]**, por exemplo `eb-12`.
- A sigla tem de duas a quatro letras, é derivada do login do GitHub na preparação da máquina (o agente propõe, a pessoa confirma) e fica no estado da máquina. O `doctor` e o `open` conferem a sigla contra os logins já presentes no histórico e pedem outra se duas pessoas chocarem.
- O número é o próximo daquela pessoa: o maior entre o que está no histórico commitado (depois de buscar o remoto, quando há rede) e o que está no estado local, mais um.
- O ID nasce uma vez e acompanha a frente até o fim; quem retoma não muda o ID (ele diz quem abriu; o quadro diz quem tem agora). Viaja no marcador do comentário do ticket.
- Aparece no quadro, no resumo, nos comentários dos tickets, na linha do histórico e na mensagem do commit de fechamento, e os comandos o aceitam no lugar do nome.
- Se o `close` encontra o mesmo ID já no histórico (mesma pessoa, duas máquinas, sem rede), avisa e grava assim mesmo, com a data distinguindo.
- O `open` recusa nome que já exista como ramo local ou remoto de frente aberta. A linha do histórico leva data, ID, nome, login de quem abriu, tickets e resumo.

**Retomar uma frente passada.** O comando é o próprio `ah open <nome>`. Se existe estado local "passada", a sessão assume. Se não existe estado local mas existe o ramo `feat/<nome>` no remoto (outra máquina), o `open` cria o worktree a partir desse ramo e reconstrói o estado pelo comentário de passagem de bastão no ticket, que carrega um marcador legível por máquina (nome, tickets, ramo). O `takeover` fica só para frente ativa cuja dona morreu.

**Reserva do ticket.** Responsável, rótulo de reserva e um comentário com marcador legível por máquina dizendo quem reservou. O `open` recusa se já existe reserva ativa de outro. A reserva é um aviso, não uma trava atômica: dois `open` no mesmo segundo podem passar, e o segundo descobre ao conferir depois de comentar. Isso deve estar escrito na referência.

**Escopo das travas.**
- T1, T2 e T3 valem no checkout principal, que é de todos. No worktree da própria frente a sessão é livre, inclusive para `rebase`, `stash` e `reset`.
- T4 protege o worktree de outra sessão viva. Editar arquivo no checkout principal é permitido (a integração precisa disso).
- T5 recusa mesclar PR quando o destino é ramo protegido ou não dá para saber o destino; PR para a base passa.

**Saída quando o gancho quebra.** Mesmo com configuração inválida ou erro interno, duas coisas sempre passam: um comando que seja só uma chamada ao `ah` (para o `doctor` rodar) e a edição de `.harness/config.json`. `AH_GUARD=off` continua valendo para comandos de shell. Para edição de arquivo em worktree alheio (T4) não há liberação: o caminho é `takeover` ou pedir à sessão dona.

**Continuação de sessão.** A sessão nova herda a frente da anterior só quando o adaptador informa que é uma continuação (conversa limpa, compactada ou retomada) **e** fornece o vínculo: o mesmo processo do agente ou o id da sessão anterior. Sem vínculo, não herda; o resumo diz "a frente X está sem dona; `ah open X` para retomar". Na dúvida, não herdar.

**`open --para <sessão>`.** A sessão destino é nomeada pelo id curto que aparece no quadro. Ela fica sabendo pelo resumo do próximo começo de sessão e pelo `ah whoami`; avisar na hora é tarefa de quem distribui, pelo meio que o agente tiver.

**Sobreposição de arquivos.** É calculada pelo que cada frente ativa já mudou em relação à base (diff do ramo), e aparece no quadro e no resumo. No `open`, a frente nova ainda não tocou nada: ele mostra as notas das frentes ativas e aceita `--caminhos <globs>` para declarar a intenção e receber o aviso já na abertura.

**Fila de pesado entre projetos.** O número de vagas e a memória mínima são da máquina: ficam num arquivo de configuração da própria fila, criado com os padrões na primeira chamada. A configuração do projeto só define as classes (quais comandos são pesados e quantas vagas pedem). O estado da fila tem versão de formato; versão desconhecida faz o comando parar e pedir atualização.

**Quem executa o quê no "pronto quando".**
- Ensaio com agente de verdade: quem constrói roda, na máquina do autor, com os agentes que já estão autenticados nela **[autor autorizou]**. A versão suportada de cada agente é a instalada no dia do ensaio, registrada junto com a saída.
- Varredura de anonimização: a lista fica em `~/.config/agent-harness/termos-proibidos.txt`, um termo por linha, sem diferenciar maiúsculas. Quem constrói monta a primeira versão a partir do levantamento do original e o autor revisa.

**Ordem e dependências [autor].**
- Ordem de criação: cada frente grava o instante da abertura, com fuso, no estado e no histórico; quadro e histórico ordenam por ele. Não há encadeamento gravado entre frentes.
- Dependência é entre tickets e mora no GitHub (relação de bloqueio e sub-issues). O harness só lê. Quem constrói confirma na documentação oficial se a relação de bloqueio é acessível pelo `gh`; se não for, a forma principal passa a ser uma linha padronizada no corpo do ticket (`Bloqueado por: #N`), que de todo modo é aceita como reserva.
- O quadro mostra, por frente, o que a bloqueia e o que ela bloqueia, com o estado do ticket e a frente que o tem.
- `ah open` avisa quando um ticket da frente está bloqueado por outro aberto; não recusa.
- `ah deps [ticket]` mostra a árvore de bloqueios e a lista do que está livre para começar (aberto, sem bloqueio pendente, sem frente), em texto e em JSON (`--json`). Sem rede, usa a última leitura guardada e diz de quando é.

**Regra geral de comportamento [autor].** O harness sugere e registra; só recusa o que protege o trabalho dos outros e a máquina (as travas e as conferências do `close`). Etapas do método e escolha de modelo nunca são motivo de recusa.

**Ligação com o método.** `ah open` aceita `--plano <arquivo>` e guarda o caminho na frente; o quadro e o resumo mostram. Quando o adaptador recebe do agente o modelo em uso, o núcleo grava no registro da sessão e nos eventos. O resto (níveis de modelo, registros da execução por subagentes) é extensão do projeto 2; ver `2026-11-12-notas-para-o-metodo.md`.

## 12. Ajustes depois da avaliação do desenho

O autor pediu uma avaliação franca do desenho e aceitou os ajustes abaixo. Onde esta seção e as anteriores divergirem, vale esta.

### 12.1 Construção em fatias

Todos os comandos da seção 6 ficam **[autor: não remover; manter os de menor atrito primeiro]**. O que muda é a ordem: cada fatia termina utilizável e com teste, e a seguinte só começa depois. A divisão é **[desenho]**.

| Fatia | Entra | Fica utilizável |
|---|---|---|
| 0. Sondagem | Verificação, na documentação oficial e num ensaio mínimo, do que Claude Code, Codex e OpenCode permitem: interceptar comando e edição antes de executar, injetar contexto no começo da sessão, informar id de sessão e modelo. Sai uma tabela de capacidades por agente | A decisão de quais travas valem em qual agente |
| 1. Uma sessão | `init`, `doctor`, `whoami`, `open`, `nota`, `close`, `board`; estado; histórico; ID da frente; T5 (ramo protegido) e T2 (adicionar tudo); adaptador do Claude Code; proteção de ramo e CI (12.2) | Uma pessoa, uma sessão, um worktree por trabalho |
| 2. Várias sessões | `handoff`, retomar pelo `open`, `takeover`, `sweep`, `papel`, `open --para`; sessão viva; herança na continuação; T1, T3, T4; sobreposição de arquivos; reserva de ticket | Várias sessões e várias pessoas |
| 3. Máquina | `pesado` e T6 | Trabalho pesado sem derrubar a máquina |
| 4. Outros agentes | Adaptadores do Codex e do OpenCode, conforme a tabela da fatia 0; ensaio com os três | Os três agentes |
| 5. Abertura | Interface de extensão, extensão de exemplo, guia de como estender, `atualizar`, `deps`, números (12.5) | Extensível e medido |

Os comandos que ficaram para fatias mais tardias (`papel`, `deps`, `atualizar`) são os de menor uso no dia a dia, não os menos importantes.

### 12.2 A barreira de verdade fica no servidor

As travas locais leem o texto do comando: são aviso cedo, não barreira. Por isso o `init` também prepara, pelo `gh`:

- **Proteção de ramo** no GitHub para os ramos protegidos da configuração (sem push direto, inclusive para quem administra; entrada por PR). Com isso, publicar deixa de ser um push: levar `dev` para `stage` e `stage` para `main` é abrir um PR e mesclá-lo com `AH_GUARD=off gh pr merge`, por ordem do executivo. Isto substitui o push com `AH_GUARD=off` descrito na seção 11.
- **Um fluxo de CI** modelo, que roda os testes do projeto em PR e em push na base. O comando de teste vem da configuração; sem comando definido, o fluxo é criado desligado e o `doctor` avisa.

Se a conta ou o plano não permitir proteção de ramo, o `init` segue, e o `doctor` mostra o item como "sem proteção no servidor: só a trava local protege". Quem constrói confirma na documentação oficial o que cada tipo de conta permite.

### 12.3 Paridade entre agentes é resultado da sondagem, não promessa

O objetivo "mesma lógica de travas para os três" (seção 3) vale para a lógica. O alcance em cada agente é o que a fatia 0 mostrar. Onde um agente não permitir interceptar antes de executar, o adaptador dele entrega o que der (resumo, sinal de vida, registro) e a referência e o `doctor` dizem com clareza o que não está coberto.

### 12.4 Toda recusa diz a saída

Vale para travas e para comandos: a mensagem de recusa traz o motivo em uma linha e o próximo passo concreto (o comando a rodar ou a quem pedir). Recusa sem próximo passo é defeito, e há teste para isso.

### 12.5 Medir se ajuda

A partir de `eventos.jsonl`, `ah board --numeros` mostra, por período: frentes abertas e fechadas, tempo médio por frente, passagens de bastão, tomadas, recusas por trava, tempo de espera no pesado e, quando o agente informa, sessões por modelo. Não é telemetria: fica na máquina. Serve ao projeto 4 e a quem quiser saber se o harness está pagando o que custa.

### 12.6 Paralelismo em dois níveis [autor: manter]

O paralelismo é o centro do harness e fica. O desenho distingue dois níveis, que o manual deve explicar:

- **Dentro de uma frente:** subagentes despachados pela própria sessão (a skill de plano pergunta se a execução é por subagentes ou na própria conversa). O harness não gerencia isso; só dá o worktree e a fila de pesado.
- **Entre frentes:** várias sessões, cada uma com a sua frente. É o que o harness gerencia.

O harness precisa ser útil já com uma sessão (fatia 1). A referência declara o custo: cada sessão e cada subagente a mais consome tokens e pede revisão de quem decide; o número de sessões é escolha de quem usa.

### 12.7 Windows

As travas de comando exigem shell POSIX. Para tê-las no Windows, o requisito é WSL2, dito assim no `doctor`, na referência e na preparação. No Windows nativo, o harness funciona (comandos, estado, quadro, T4 na edição de arquivo) e a proteção de ramo no servidor cobre o ramo protegido.

## 13. O que fica com quem constrói

- Formato exato dos arquivos de estado e da configuração, dentro do que as seções 5 e 6 pedem.
- Como conferir processo vivo e matar árvore de processos em cada sistema.
- Algoritmo da fila, desde que cumpra a seção 7.
- Assinatura exata da interface de extensão.
- Organização interna dos módulos.
- Como o OpenCode recebe o resumo, conforme a documentação oficial dele permitir.

## 14. Pronto quando

Cada fatia da seção 12.1 tem o próprio "pronto": os itens abaixo que dizem respeito ao que ela entrega. O núcleo está pronto quando todos valem.

- A tabela de capacidades por agente (fatia 0) está na documentação, com a fonte e a data.
- O `init` deixa a proteção de ramo e a CI configuradas, ou o `doctor` acusa a falta.
- Toda recusa testada traz o próximo passo.
- `ah board --numeros` sai de um registro de eventos de exemplo.
- Num repositório descartável, `ah init` seguido de `ah doctor` passa nos três sistemas (CI).
- Duas sessões simuladas abrem frentes diferentes, uma tenta escrever no worktree da outra e é recusada; uma morre e a outra assume com `takeover`; `handoff` e `close` deixam o estado e os tickets (no `gh` falso) como descrito.
- Cada trava tem teste de recusa e de passagem, incluindo as formas disfarçadas (`bash -c`, encadeamento, `cd` antes).
- A fila de pesado respeita vagas, classes, ordem e mata a árvore ao ser interrompida.
- A extensão de exemplo funciona e o guia de extensão foi seguido do zero por um agente sem contexto, que conseguiu criar o comando novo.
- O ensaio com agente de verdade passou para Claude Code, Codex e OpenCode no alcance que a tabela de capacidades declara para cada um, com a saída guardada.
- A varredura de anonimização não acha nada.

## 15. Outros agentes se adaptam sozinhos [autor, 12/11/2026]

Onde esta seção e as anteriores divergirem, vale esta.

O autor decidiu que o harness não traz adaptadores do Codex e do OpenCode escritos e ensaiados por quem constrói. O agente que chega ao repositório lê as instruções, escreve ou ajusta o próprio adaptador, roda os testes e corrige por conta própria.

A fatia 4 da seção 12.1 passa a entregar:

- **Roteiro de adaptação** em `docs/agentes/`: o contrato dos quatro eventos (seção 8), o adaptador do Claude Code como exemplo, o passo a passo para escrever o adaptador e o arquivo de gancho de outro agente, e como provar que funciona.
- **Testes de contrato** que todo adaptador precisa passar, para o agente rodar, ver o que falha e corrigir.
- **Ponteiro no `AGENTS.md`** que o `init` instala, para o agente achar o roteiro sem ninguém mandar.
- **Item no `doctor`:** sem adaptador para o agente em uso, diz que as travas automáticas não valem e aponta o roteiro.

Ficam sem efeito: os adaptadores do Codex e do OpenCode como entrega (seção 8), o ensaio com os três agentes (seção 8, "Prova de cada adaptador", item 2, para os outros dois) e o último item do "pronto quando" (seção 14) no que diz respeito a Codex e OpenCode. O ensaio com o Claude Code de verdade continua.

No "pronto quando", o item passa a ser: um agente sem contexto, seguindo só o roteiro, consegue dizer o que falta para o adaptador dele e rodar os testes de contrato.

## 16. Sem CI no GitHub [autor, 26/11/2026]

Onde esta seção e as anteriores divergirem, vale esta.

O repositório não tem CI no GitHub: toda verificação roda na máquina de quem desenvolve. O fluxo `.github/workflows/ci.yml`, que nunca chegou a rodar, sai do repositório.

- A CI deste repositório (seções 3 e 10) passa a ser a verificação local `ferramentas/verifica.mjs` (`npm run verifica`): a suíte inteira em cada Node pedido, inclusive o mínimo do `package.json`, e a varredura de termos.
- No "pronto quando" (seção 14), o item "num repositório descartável, `ah init` seguido de `ah doctor` passa nos três sistemas (CI)" passa a ser: passa no Linux, com o Node mínimo e o atual, pela verificação local. Windows e macOS ficam como limite declarado (README, seção "Limites" de `docs/referencia/comandos.md`): o código trata os três sistemas, mas só o Linux foi executado. O caminho recomendado no Windows continua sendo o WSL2 (seção 12.7), que é Linux.
- A CI que o `init` instala nos projetos (`modelos/ci/`, seção 12.2) não muda: é do projeto que recebe o harness, não deste repositório.
