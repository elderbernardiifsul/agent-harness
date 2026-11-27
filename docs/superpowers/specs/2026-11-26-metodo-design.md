# agent-harness: desenho do método e conhecimento

Desenho do projeto 2 de 4. Escrito em 26/11/2026 a partir da conversa com o autor (elderbernardi), começando das notas de 12/11 (`2026-11-12-notas-para-o-metodo.md`) e do desenho do núcleo (`2026-11-12-nucleo-design.md`, seções 2, 9, 11 e 15).
As decisões marcadas **[autor]** foram ditas por ele (nas notas ou nesta conversa); as marcadas **[desenho]** são escolhas de quem escreveu este documento e podem ser revistas. Onde este documento e as notas divergirem, vale este.

## 1. Por quê

O núcleo resolve o conflito entre sessões: frentes, worktrees, travas, quadro, passagem de bastão. Ele não diz **como** trabalhar dentro de uma frente. No projeto de origem, o método foi praticado com duas coleções de skills (Superpowers e as do Matt Pocock), uma skill de orquestração, uma wiki com evidência conferida e um roteiro de ingestão de reunião. Funcionou, mas mora num projeto só, com nomes e caminhos de lá.

O projeto 2 entrega esse método de forma replicável: um aluno pede ao agente "prepare meu projeto" e sai com o harness, as skills certas na versão certa, um `AGENTS.md` que diz quem cuida de cada etapa e, quando quiser, wiki, orquestração e os opcionais de ambiente.

Princípio que atravessa tudo **[autor]**: o harness sugere e registra; só as travas recusam. Etapa do método e escolha de modelo nunca são motivo de recusa.

### As dores que cada peça responde

| Dor | Peça |
|---|---|
| O aluno não sabe instalar nem configurar, e erra a ordem | Instalação pelo agente, a partir do endereço do repositório (seção 5) |
| Skill de terceiros muda de nome ou de comportamento sem aviso e a tabela do método passa a apontar para o nada | Cópia com versão fixada e trava conferida pelo `doctor` (seção 6) |
| Duas coleções carregam muito texto no contexto e repetem papéis (dois TDD, dois revisores) | Só as skills da tabela são instaladas; um dono por etapa (seções 6 e 7) |
| O agente usa o processo pesado para uma mudança de uma linha, ou o leve para uma mudança de desenho | Três trilhas por tamanho com critério escrito (seção 7) |
| O diário da execução por subagentes some quando o worktree é removido | Registros levados pelo `handoff` e resumidos no ticket pelo `close` (seção 8) |
| Modelo grande em trabalho pequeno; nomes de modelo presos no texto | Níveis neutros traduzidos na configuração (seção 9) |
| Distribuir trabalho entre subagentes e sessões sem perder o fio | Skill de orquestração e escolha de candidatos (seção 10) |
| Conhecimento do projeto espalhado; respostas plausíveis sem fonte | Wiki com a invariante de evidência (seção 11) |
| Reunião com o cliente que vira só lembrança | Ingestão de reunião para a wiki (seção 12) |
| Frentes paralelas disputando banco, porta e número de migração; teste ponta a ponta repetido sem necessidade | Opcionais: ambiente por worktree, reserva de migração, prova por árvore (seção 13) |

## 2. Objetivos, fora do escopo e o que seria fracasso

**Objetivos**

- Toda interação do aluno é pelo agente **[autor]**. Do endereço do repositório ao `ah doctor` sem o aluno digitar comando.
- Funciona com Claude Code, Codex e OpenCode **[autor]**, testado nos três (as versões instaladas nesta máquina no dia do ensaio).
- Tudo do projeto 2 entra como extensão ou skill, sem mexer no núcleo **[autor]**. O que precisar do núcleo vira pendência para o autor decidir; as aprovadas estão na seção 15.
- Cada peça é legível e explicável por um concluinte de Ciência da Computação, com a dor que resolve escrita ao lado **[autor]**.

**Fora do escopo**

- Deploy **[autor: depois]**.
- Pacote de skills ou plugin do agent-harness **[autor: follow-up]**.
- Cofre de segredos como peça: entra só como sugestão no texto do método **[autor]**.
- Lançador de sessão nova (abrir sessão de agente em `tmux` a partir do orquestrador) **[autor aceitou: follow-up]**. Depende do `tmux` e de como cada agente abre sessão pela linha de comando.
- Identidade visual (projeto 3). A preparação só deixa o lugar: quando o projeto 3 existir, ele acrescenta o passo dele.
- O manual de estudo (projeto 4). Aqui cada peça traz a dor e o uso; o princípio durável de cada etapa é do manual.

**Seria fracasso mesmo funcionando**

- Qualquer nome do projeto de origem no repositório. As skills de lá são reescritas, nunca copiadas.
- O método virar recusa: uma etapa pulada, um plano sem nível de modelo ou uma wiki sem ingestão travando o trabalho.
- Uma regra escrita em dois lugares que divergem. Uma regra mora num lugar só; os outros apontam **[autor]**.
- Skill ou extensão que prescreve ferramenta e procedimento onde bastava dizer o resultado (seção 3).

## 3. Como as skills e extensões deste projeto são escritas [autor]

- **Dizem o resultado, não a ferramenta.** Cada skill descreve o que entra, o que sai e o que precisa ser verdade. A escolha das ferramentas, a instalação delas conforme o ambiente e a troca por outra que entregue a mesma coisa ficam com o agente que está rodando **[autor, 26/11]**. O que pede licença ao aluno: instalar algo na máquina dele, criar algo no GitHub e executar código baixado.
- **Exceção fixada:** a versão das coleções de skills (seção 6), porque a tabela do método depende dos nomes delas **[autor]**.
- **Código** das extensões: Node 22 ou mais novo, módulos ES, sem dependências externas, testes primeiro, sobre repositórios descartáveis e o `gh` falso de `teste/apoio/`. Nenhum teste usa rede real **[como no núcleo]**.
- **Textos** em português, exemplos com nomes inventados (a loja, Ana Souza, Carla).

## 4. Onde cada coisa mora

O `init` copia o `nucleo/` inteiro para `.harness/nucleo/` no projeto, extensões incluídas. Por isso tudo que o projeto 2 leva ao projeto do aluno mora em `nucleo/extensoes/<nome>/` **[desenho]**, sem tocar no núcleo:

| Pasta no clone | O que tem |
|---|---|
| `nucleo/extensoes/metodo/` | Extensão `metodo`: instalação e atualização das skills, trava, `AGENTS.md` de princípios, conferências do `doctor`. Guarda `colecoes.json` (origem, commit recomendado e lista de skills de cada coleção), as skills escritas aqui (`skills/<nome>/SKILL.md`) e os textos instalados (`modelos/`) |
| `nucleo/extensoes/registros/` | Extensão `registros` (seção 8) |
| `nucleo/extensoes/modelo/` | Extensão `modelo` (seção 9) |
| `nucleo/extensoes/orquestracao/` | Extensão `orquestracao` (seção 10) |
| `nucleo/extensoes/wiki/` | Extensão `wiki` (seção 11) |
| `nucleo/extensoes/ambiente/`, `migracao/`, `prova/` | Opcionais (seção 13) |
| `README.md` (raiz) | A seção "Instalar num projeto (instruções para o agente)" (seção 5) |

As skills escritas neste projeto (`preparar-projeto`, `orquestrar`, `wiki-ingerir`, `wiki-consultar`, `wiki-conferir`, `reuniao-ingerir`) ficam todas em `nucleo/extensoes/metodo/skills/` **[desenho]**: um lugar só, instalado pelo mesmo mecanismo das skills de terceiros. A extensão de cada assunto (wiki, orquestração) traz o código; a skill traz o roteiro para o agente.

Quando cada uma é instalada **[desenho]**: `preparar-projeto` sempre; as outras só quando a extensão do assunto está ligada (`orquestrar` com `orquestracao`; `wiki-*` e `reuniao-ingerir` com `wiki`, porque a reunião termina na wiki). O `metodo instalar` é idempotente: quando o aluno pede uma extensão depois, o agente a liga na configuração e roda o `metodo instalar` de novo. O `doctor` avisa quando uma extensão está ligada sem as skills dela, e quando há skill instalada de extensão desligada.

Cada extensão só vale ligada em `extensoes` no `.harness/config.json` (interface v1). A preparação liga `metodo`, `registros` e `modelo`; as outras, o aluno pede ao agente quando quiser.

## 5. Fatia 1a: preparar o projeto

### Dois caminhos [autor]

1. **Pelo endereço do repositório.** O aluno abre o agente na pasta do projeto (existente ou vazia) e diz "instale o harness daqui: `<endereço>`". O agente lê o README e faz o resto. O aluno não clona nada à mão **[autor]**.
2. **Por um clone que já existe** (laboratório, estudo, quem quer ler antes). A mesma sequência, com o clone como origem: `node <clone>/nucleo/bin/ah.mjs init` e o resto igual. É o caminho que o README já descreve.

### A seção do README [autor: no README, para o agente fazer sozinho]

Logo no topo do `README.md`, uma seção "Instalar num projeto (instruções para o agente)", suficiente para um agente que só recebeu o endereço. Ela é o único lugar do procedimento; a skill `preparar-projeto` aponta para ela. Conteúdo **[desenho]**:

1. **Confirmar o alvo.** Qual pasta; se o projeto existe ou é novo. Projeto novo: `git init`, primeiro commit e, com o "sim" do aluno, `gh repo create` (privado por padrão).
2. **Conferir requisitos.** Node 22 ou mais novo, git; `gh` autenticado é opcional (sem ele, `--sigla` e sem proteção de ramo, como o `init` já trata).
3. **Trazer o harness.** Sem clone: `git clone --depth 1` da última tag `vX.Y.Z` da `main` (enquanto não houver tag, o commit atual da `main`) numa pasta de cache da máquina, fora do projeto (no Linux, `~/.cache/agent-harness/<versão>`; em outro sistema, o equivalente que o agente escolher). Mostrar ao aluno a origem e o commit e pedir confirmação antes de executar. Com clone: usar o clone.
4. **Instalar o núcleo.** `node <origem>/nucleo/bin/ah.mjs init`, fazer o commit que ele indica na `dev`.
5. **Ligar o método.** Acrescentar em `.harness/config.json` as extensões `metodo` (com `agentes`, a lista dos agentes que o aluno vai usar; o agente em uso entra sempre), `registros` e `modelo`. Rodar `tools/ah metodo instalar`, fazer o commit que ele indica.
6. **Conferir.** `tools/ah doctor` e relatar ao aluno o que ficou, o que avisa e o que fazer.
7. **Quando algo falha:** cada recusa traz o próximo passo; o agente segue o passo, e se não houver, para e relata ao aluno.

Criar a tag de versão faz parte da publicação e espera ordem do autor. O manifesto do núcleo já grava o commit da origem.

### Skill `preparar-projeto`

Instalada no projeto pelo `metodo instalar`. Gatilhos: "prepare meu projeto", "instale o harness", "repare a instalação". Diz quando usar e aponta para a seção do README (no cache ou no endereço); não repete os passos **[autor: uma regra num lugar só]**.

## 6. Fatia 1b: as skills de terceiros

### Cópia no projeto com versão fixada [autor, 26/11]

O autor escolheu copiar as skills para dentro do projeto, e não instalar os plugins oficiais. Ver a seção 14 (abordagens).

- `colecoes.json`, na extensão, guarda por coleção: `origem` (URL git), `commit` recomendado, `versao` (texto, só para leitura humana), `skills` (lista do que entra) e o caminho da licença. A recomendação é a versão com que o `AGENTS.md` de princípios foi testado.
- `tools/ah metodo instalar` busca cada origem no commit pedido numa pasta de cache da máquina (nunca no projeto), copia as skills da lista e a licença da coleção para as pastas dos agentes configurados, grava a trava e termina com os comandos do commit (como o `init`).
- `tools/ah metodo atualizar [--para <tag|commit>] [--colecao <nome>] [--simular]`: compara os arquivos do projeto com a trava; skill alterada à mão não é sobrescrita (mostra a diferença e o que fazer); mostra o que mudou na origem (arquivos, skills novas, renomeadas, removidas); copia, regrava a trava. Sem `--para`, vai para a recomendada; com `--para`, o aluno passa à frente e o `doctor` avisa "fora da versão testada".
- A trava `.harness/skills.lock.json`, commitada: por coleção, `origem`, `commit`, `versao`, `skills`, `arquivos` (`{caminho: sha256}`) e, por agente, a pasta de destino. As skills escritas neste projeto entram na mesma trava, com a origem "agent-harness" e a versão do harness.
- Nos testes, a origem é um repositório git local descartável.

### Quais skills entram [autor: aceitou a proposta]

| Coleção | Entram | Ficam de fora, e por quê |
|---|---|---|
| Superpowers | brainstorming, writing-plans, subagent-driven-development, executing-plans, test-driven-development, systematic-debugging, requesting-code-review, verification-before-completion | using-git-worktrees e finishing-a-development-branch (worktree e encerramento são do `ah`); using-superpowers (é o arranque do plugin; o `AGENTS.md` de princípios faz o papel); as demais, por não terem etapa na tabela |
| Matt Pocock | triage, to-tickets, wayfinder, research, prototype, grilling, domain-modeling | tdd e code-review (um dono por etapa: os do Superpowers); implement (a execução é do Superpowers); as demais, por não terem etapa na tabela |

`executing-plans` entra **[desenho]** porque o writing-plans oferece a execução na própria conversa e, nela, exige essa skill; a trilha "plano de partida" prevê os dois modos.

A lista exata dos nomes sai da versão recomendada: quem constrói confere que cada nome existe nela e procura as referências a skills que ficaram de fora (referência cruzada, script ou arquivo de apoio). Cada referência achada tem um destino **[desenho]**: ou a skill citada entra na lista, ou o `metodo.md` diz o que fazer no lugar. As já conhecidas na 7.0.2 e na 1.3.1:

| Quem cita | Cita | No lugar |
|---|---|---|
| writing-plans, subagent-driven-development | using-git-worktrees, finishing-a-development-branch | o worktree é o da frente (`ah open`); encerrar é merge na `dev` e `ah close` ou `ah handoff` |
| triage (brief para agente) | implement | a trilha escolhida (seção 7), com subagent-driven-development ou executing-plans |

O teste da fatia 2 confere que toda skill citada por uma skill instalada está instalada ou tem linha nessa tabela.

### Pastas por agente [desenho, sobre a pesquisa de 26/11]

Pela documentação oficial (fontes e data em `2026-11-26-metodo-pesquisa-instalacao.md`): o Claude Code lê só `.claude/skills/`; o Codex lê só `.agents/skills/`; o OpenCode lê `.opencode/skills/`, `.claude/skills/` e `.agents/skills/`.

- A cópia vai só para as pastas dos agentes listados em `metodo.agentes`: `claude-code` → `.claude/skills/`; `codex` → `.agents/skills/`; `opencode` → `.agents/skills/`.
- Com Claude Code e OpenCode juntos, o OpenCode vê cada skill duas vezes (`.claude` e `.agents`). Quem constrói ensaia, num projeto descartável, o que o OpenCode faz com o nome repetido e escolhe a saída (uma pasta só para os dois, link, ou aviso), registrando o ensaio.
- `metodo.agentes` é da extensão, não o `agentes` do núcleo: o `init` hoje só aceita `claude-code` ali.

### Nomes com prefixo

As skills do Superpowers citam umas às outras com o prefixo do plugin (`superpowers:writing-plans`). Copiadas para o projeto, elas não têm prefixo. O `AGENTS.md` de princípios diz: "onde uma skill cita `superpowers:<nome>` ou `mattpocock-skills:<nome>`, use a skill `<nome>` do projeto". O ensaio da fatia 1 confere que o agente segue isso nos três agentes.

### Preparação das skills do Matt Pocock

Algumas skills dele (triagem, tickets) esperam a configuração que `setup-matt-pocock-skills` grava (rastreador, rótulos de triagem). O `metodo instalar` deixa essa configuração feita para o GitHub e para os rótulos que o método usa, sem instalar a skill de setup. Quem constrói lê a skill de setup na versão recomendada e reproduz o resultado.

### `AGENTS.md` e `CLAUDE.md`

O Claude Code só lê o `AGENTS.md` quando não há `CLAUDE.md`; o OpenCode ignora o `CLAUDE.md` quando os dois existem na mesma pasta (pesquisa de 26/11).

**[autor, 26/11]:** o Claude deve respeitar o `AGENTS.md` do projeto criado. Isso vale para todo projeto com o harness, com ou sem o método, e por isso passa a ser do núcleo (pendência P1, decidida), feito na fatia 1:

- sem `CLAUDE.md`: o `init` (e o `ah atualizar`) cria um com a única linha `@AGENTS.md`;
- com `CLAUDE.md` sem a linha: acrescenta `@AGENTS.md` no topo, sem tocar no resto **[desenho]**; o Claude Code passa a ler os dois;
- o `doctor` do núcleo acusa `CLAUDE.md` sem a linha e avisa quando ele tem conteúdo próprio (o Codex e o OpenCode não o veem), com o conserto: mover esse conteúdo para o `AGENTS.md`;
- `docs/referencia/comandos.md` acompanha a mudança.

### Conferências do `doctor` (extensão `metodo`)

Todas são aviso, salvo trava ilegível (falha):

- arquivo de skill diferente da trava, ou ausente;
- coleção fora da versão recomendada;
- a mesma coleção também instalada como plugin do agente (lendo o que cada agente registra: no Claude Code, `~/.claude/plugins/installed_plugins.json`; nos outros, o que o ensaio mostrar);
- nome de skill repetido entre `.claude/skills/`, `.agents/skills/` e `.opencode/skills/`;
- skill citada no `AGENTS.md` de princípios que não está na trava (fatia 2).

## 7. Fatia 2: o `AGENTS.md` de princípios

O `metodo instalar` escreve, no `AGENTS.md` do projeto, um trecho próprio entre marcas da extensão (separadas das marcas do núcleo), curto, que aponta para `docs/agents/metodo.md`, instalado e atualizado pela extensão **[desenho]**. O trecho diz só o que o agente precisa em toda sessão; o resto fica no documento.

### Um dono por etapa [autor, das notas]

| Etapa | Skill | O que fica escrito | Harness |
|---|---|---|---|
| Entender e triar | triage, to-tickets | Ticket com rótulo | — |
| Investigação longa | wayfinder, research, prototype | Mapa e tickets filhos, `docs/research/` | — |
| Decisão com o humano | grilling | Ticket de decisões por exceção (silêncio = padrão) | — |
| Vocabulário e decisões | domain-modeling | `CONTEXT.md`, `docs/adr/` | — |
| Desenho | brainstorming | Spec | — |
| Plano | writing-plans | Plano com o nível de modelo de cada tarefa e o comando de partida para colar numa sessão nova | `ah open --tickets --plano` |
| Execução | subagent-driven-development (ou executing-plans, na própria conversa) com test-driven-development | Commits e diário da execução | Worktree da frente, fila de pesado, `registros` |
| Depuração | systematic-debugging | Teste de regressão | — |
| Revisão | requesting-code-review | Commit de consertos | — |
| Verificação | verification-before-completion | Comando e saída no PR ou ticket | — |
| Integrar e encerrar | nenhuma; é do harness | Linha do histórico | merge na `dev`, `ah close` ou `ah handoff` |

### Trilhas [autor, das notas]

- **Um commit:** comportamento pequeno, sem decisão de desenho. Teste primeiro, verificação, commit.
- **Plano de partida:** várias tarefas, desenho que não muda. Plano curto, execução (por subagentes ou na conversa), revisão, verificação.
- **Spec e plano:** muda o desenho (contrato, dado, fronteira entre partes). Brainstorming (com grilling e domain-modeling quando couber), spec, plano, execução.
- **Investigação longa:** não se sabe ainda o que fazer. Wayfinder, research, prototype; sai mapa e tickets.

O critério de escolha fica escrito em forma de perguntas (muda contrato, dado ou fronteira? cabe num commit? sabe-se o que fazer?). A trilha padrão é a leve **[autor]**. Para cada trilha, a lista de skills que entram, para o agente não carregar as outras **[autor]**.

### Também no documento

- Os atritos resolvidos **[autor]**: worktree e encerramento de ramo são do `ah`; um TDD só; "pronto" exige comando e saída.
- O aviso dos prefixos (seção 6).
- Paralelismo em dois níveis e o custo de cada um **[autor]**: subagentes dentro de uma frente; sessões entre frentes.
- O nível de modelo no plano e `ah modelo` (seção 9).
- Cofre de segredos como sugestão **[autor]**: nunca segredo no repositório; onde guardar, a critério do projeto.
- Para cada etapa, a dor que ela resolve em uma linha. O princípio durável fica para o manual (projeto 4).

## 8. Fatia 3: registros da execução por subagentes (extensão `registros`)

O subagent-driven-development grava, por plano, o diário `progress.md`, as instruções e os relatórios em `.superpowers/sdd/<plano>/` dentro do worktree, numa pasta ignorada pelo git. Remover o worktree apaga tudo.

Dois fatos da versão 7.0.2 moldam a extensão (conferidos no código em 26/11):

- o próprio subagent-driven-development apaga a pasta do plano quando a revisão final fica limpa ("the git history is the record now"); num plano concluído, o diário não existe mais quando o `close` chega;
- a pasta `.superpowers/sdd/` é ignorada pelo git (ela grava um `.gitignore` próprio), e o `close` do núcleo recusa worktree com item ignorado antes de chamar `antesDeFechar`; a saída dele, `--descartar-ignorados`, descarta também `.env` e dados locais.

Por isso o registro é guardado por um comando, no momento em que ele ainda existe, e não só nas reações **[desenho]**. O destino durável é o ticket **[autor aceitou, 26/11]**:

- **`tools/ah registros guardar`:** comenta no(s) ticket(s) da frente o diário (`progress.md`) de cada plano achado no worktree, com um marcador legível por máquina (frente, plano, commit, data e fase `guardado`), guarda uma cópia na pasta de estado do projeto e tira do worktree só o que é do subagent-driven-development: as pastas de plano (as que têm `progress.md` ou `plan-path`) e o `.gitignore` que o `sdd-workspace` cria, sem apagar o que o git versiona; um arquivo do aluno em `.superpowers/sdd/` fica, com aviso **[desenho, 27/11]**. Sem ticket, só guarda a cópia e avisa; sem rede, a cópia vale como guarda e o ticket fica pendente para o `close`. Plano com tarefa parada é guardado do mesmo jeito, com o aviso do próximo passo (`registros devolver`) **[desenho, 27/11]**. O `metodo.md` manda rodá-lo em dois momentos: no fim do subagent-driven-development, **antes** de a skill apagar a pasta do plano, e antes do `ah close`. Assim o `close` não encontra o item ignorado e não é preciso `--descartar-ignorados`.
- **`tools/ah registros devolver`** **[desenho, 27/11]:** traz de volta ao worktree o diário mais novo de cada plano, inclusive o que o `guardar` tirou, pelas regras da retomada.
- **`aoPassar` (handoff):** comenta o diário no ticket como o `guardar`, com a fase `passagem`, mas não remove a pasta, porque o trabalho continua.
- **`depoisDeAbrir` com retomada** **[desenho, 27/11]:** cada plano recebe de volta o diário de passagem mais novo, pela data do marcador, juntando todos os tickets e a cópia desta máquina (que entra quando nenhum ticket se lê, quando o ticket não tem o plano ou quando ela é mais nova); o de fase `guardado` saiu de propósito e não volta sozinho. O diário que já está no worktree só é trocado quando é igual à cópia desta máquina (ninguém mexeu nele aqui desde a última guarda) e o da fonte é mais novo; diferente, fica, com aviso. Ao devolver do ticket, a cópia passa a saber em que tickets ele já está, para o handoff seguinte não comentá-lo de novo. Ele volta ao lugar em que o subagent-driven-development o procura, e a execução continua de onde parou, em outra máquina.
- **Quem pode deixar diário** **[desenho, 27/11]:** num repositório público qualquer um comenta, e o diário é lido pelo agente como instrução de trabalho. Só vale o comentário cujo autor tem acesso ao repositório (`authorAssociation` `OWNER`, `MEMBER` ou `COLLABORATOR`; sem o campo, não vale) e tem marcador do núcleo nesta frente naquele ticket; os outros são ignorados, com aviso. O nome da pasta e o caminho do plano vindos do marcador são conferidos antes de qualquer escrita. O núcleo tem o limite que esta regra fecha (os marcadores de reserva só conferem que o autor é o login declarado): pendência para o autor.
- **`depoisDeFechar`:** comenta no ticket o diário que ficou pendente e um resumo a partir das cópias guardadas: tarefas concluídas, commits, vereditos de revisão e o que ficou parado, com o caminho do plano; com tudo no ticket, apaga as cópias. Fechamento só local, sem ticket ou sem rede: mostra o resumo e mantém a cópia; na primeira falha de rede, para de chamar o `gh`, porque roda sob a trava do `close` **[desenho, 27/11]**. Sem cópia guardada, diz que não há registro e não faz nada.
- **`antesDeFechar`:** não é usada para guardar, porque o `close` recusa o item ignorado antes dela. Nunca recusa.
- **`resumo`:** quando o worktree da frente tem diário não guardado, uma linha lembra o `guardar` antes do `ah close` (no meio do plano, guardar tiraria a pasta de que a execução precisa) **[desenho, 27/11]**.
- A leitura do diário é tolerante: formato que não reconhece vai cortado, como texto, e o comentário diz isso; a cópia local guarda o diário inteiro e não é apagada enquanto o ticket tiver só a parte cortada.

Quem esquece o `guardar` encontra a recusa do `close` pelo item ignorado, que aponta o `registros guardar` em vez do `--descartar-ignorados` (pendência P5, seção 15, construída na fatia 3).

## 9. Fatia 4: níveis de modelo (extensão `modelo`)

- Três níveis com nomes neutros: `alto`, `medio`, `leve`, cada um com o esforço dentro dele **[autor]**.
- A tradução de nível para modelo e esforço reais fica na seção `modelo` da configuração, por agente **[autor]**. A extensão traz padrões datados para os três agentes; o projeto muda os dele.
- `tools/ah modelo <nível> [--agente <nome>] [--json]` mostra a tradução; sem nível, mostra a tabela e aponta os critérios no `metodo.md` **[autor]**.
- O plano marca o nível de cada tarefa (`Nível: alto|medio|leve`); o orquestrador usa a marca ao distribuir **[autor]**. Como writing-plans é de terceiros, a instrução está no `metodo.md`.
- O quadro mostra o modelo de cada sessão **[autor]**, numa coluna da extensão (depende da pendência P2, seção 15).
- Nunca recusa por causa de modelo **[autor]**.

## 10. Fatia 5: orquestração (skill `orquestrar` e extensão `orquestracao`)

**[autor]**: precisa existir, com base na skill do projeto de origem, reescrita sem nada de lá.

### O que a skill faz

1. **Começar:** `ah papel orquestrador`, `ah board`, `ah sweep`, o estado do repositório e as sessões visíveis ao agente. Abre (ou retoma) um ticket de decisões da orquestração: toda pergunta ao humano vai para lá com o padrão aplicado (silêncio = padrão).
2. **Escolher:** os candidatos de `tools/ah candidatos` (abaixo). Linha que não passa vira linha no ticket de decisões. Nada passa: fim.
3. **Distribuir:** para subagente (`ah open` e o subagente no worktree da frente, com o modelo de `ah modelo <nível da tarefa>`) ou para sessão ociosa (`ah open --para <sessão>` e uma mensagem pelo meio que o agente tiver). Sessão nova quem abre é o humano.
4. **Instruir quem executa:** um texto fixo, num arquivo ao lado da skill (o que ler, só o próprio worktree, `git add` com caminhos, pesado pela fila, merge fica com o orquestrador, decisões no ticket de decisões, avisar ao terminar com commits e saída dos testes, `ah handoff` ao travar).
5. **Acompanhar:** cada mensagem conferida com evidência (git, quadro, testes ou revisor).
6. **Fechar cada frente:** revisão por revisor novo quando o diff toca os caminhos marcados na configuração; reintegração da base no worktree; com `prova` ligada, a prova por árvore (seção 13) e a conferência antes de repetir o teste; merge na base; `ah close`; ticket fechado com o commit como evidência.
7. **Integrar PRs de fora** como frente própria; **publicar** só com ordem do humano; **encerrar** com relatório (o que entrou, com commit e verificação; o que ficou; o que espera o humano).

O que é de um agente só (ferramenta de subagente, de mensagem e de lista de sessões) vai numa tabela "como fazer em cada agente": preenchida para o Claude Code; para os outros, o agente acha o equivalente dele e, sem mensagem entre sessões, distribui só para subagentes **[desenho, conforme seção 3]**.

### Extensão `orquestracao`

- `tools/ah candidatos [--json]`: o que está livre para começar segundo `ah deps --json` (aberto, sem bloqueio pendente, sem frente), cruzado com o rótulo de pronto da triagem e sem a marca "A decidir" no corpo nem nos comentários. É a parte determinística da escolha, com teste; o julgamento fica na skill **[desenho]**.
- Configuração: o rótulo de pronto, a marca de pendência e os caminhos que pedem revisão.

## 11. Fatia 6: wiki (skills `wiki-ingerir`, `wiki-consultar`, `wiki-conferir` e extensão `wiki`)

**[autor]**: wiki dentro do projeto, como base de conhecimento, com as skills de ingestão, consulta e conferência, e o harness conversa com ela.

Base: a skill de wiki praticada no projeto de origem, ela mesma adaptada de `astro-han/karpathy-llm-wiki` (MIT). Reescrita genérica, com o crédito à origem MIT e a licença junto **[desenho]**.

- **Fontes** são os documentos que o projeto já tem, lidos onde estão; a wiki nunca os edita. Fonte externa (URL, PDF, texto colado) entra no repositório antes, com o "sim" do aluno.
- **A wiki** fica em `docs/wiki/<tema>/<artigo>.md`, com `index.md` e `log.md` (só acrescenta).
- **Decisão prevalece:** ADR, decisão em ticket e verbete do glossário valem sobre o que documentos anteriores disseram; a wiki registra a divergência e aponta quem decide.
- **A invariante de evidência:** todo número, data, horário ou citação de um artigo existe literalmente numa fonte ligada pelo campo Fontes dele.
- O formato do artigo, do índice e do log mora num arquivo de referência compartilhado pelas três skills (um lugar só).

### Extensão `wiki`

- `tools/ah wiki conferir [--json]`: procura, nas fontes ligadas de cada artigo, os literais de alto sinal (números com separador ou unidade, números de 4 ou mais dígitos, datas, horários, citações longas) e lista os suspeitos. Em Node, para o projeto não depender de Python **[desenho]**.
- A lista de fontes (padrões de inclusão e exclusão) mora só na seção `wiki` da configuração **[desenho]**: na origem ela estava duplicada entre a skill e o script.
- "O harness conversa com ela" **[desenho]**, tudo como sugestão:
  - `resumo`: uma linha no começo da sessão com o número de artigos e as fontes novas desde a última ingestão;
  - `antesDeFechar`/`depoisDeFechar`: quando a frente acrescentou ou mudou fonte (ADR, spec, pesquisa, reunião), sugere a ingestão;
  - `doctor`: avisa quando a conferência acha suspeitos.

## 12. Fatia 7: ingestão de reunião (skill `reuniao-ingerir`)

**[autor]**: no molde do roteiro praticado: gravação → transcrição com falante → blocos analisados por agentes → artigos na wiki, com as sobras para o humano decidir.

- **Entradas [autor, 26/11]:** gravação com vídeo e áudio, ou só áudio. Uma transcrição exportada da plataforma, quando houver, entra como leitura a mais.
- **O que precisa sair:**
  - uma pasta por reunião (a skill propõe `docs/reunioes/<data>-<assunto>/`; o aluno confirma), com um README (fontes, leituras do áudio usadas, eixo de tempo, participantes e o que é incerto);
  - transcrição com o instante de cada fala; falante quando a fonte traz, e "inferido" quando o agente atribui pelo contexto;
  - blocos de cerca de 10 minutos, cada fato com o instante `[H:MM:SS]`;
  - com vídeo: capturas no instante dos fatos que dependem da tela, e a faixa de legenda com falante quando a gravação tiver uma;
  - `sobras.md`: o que o agente não decidiu, para o humano;
  - a ingestão dos fatos na wiki pela `wiki-ingerir`.
- **Ferramentas [autor, 26/11]:** o agente que está rodando escolhe, confere o que a máquina tem e instala o que faltar conforme o ambiente, com o "sim" do aluno; pode trocar por ferramenta equivalente. Sem capacidade de lidar com vídeo, segue só com o áudio e diz o que deixou de fazer. Não há extensão nem conferência do `doctor` para essas ferramentas **[desenho, conforme seção 3]**.
- **Cuidados:** a gravação é dado de terceiros: a skill pergunta se o arquivo entra no repositório (o padrão é não entrar; o README diz onde ele está) e lembra o consentimento dos participantes.

## 13. Fatia 8: opcionais

Cada um é uma extensão própria, desligada por padrão. Comportamento a partir do projeto de origem, sem nada específico de lá (banco, ferramenta de migração ou teste próprios) **[desenho]**.

**Leitura do original.** Como no núcleo (seção 11 do desenho dele), quem constrói lê o projeto de origem só para leitura, pelo caminho em `~/.config/agent-harness/origem.md`, fora do repositório. O plano das fatias 5 a 8 começa por esse levantamento: a skill de orquestração e o texto para o executor (fatia 5), a skill de wiki e o formato de artigo, índice e log (fatia 6), o roteiro de reunião (fatia 7) e o comportamento de cada opcional (fatia 8). Nada de lá é copiado; tudo passa pela anonimização e pela varredura.

- **`ambiente` (banco e portas por worktree):** construída sobre a ideia da extensão `recursos`. Na abertura, reserva portas livres de uma faixa (fora das usadas por outras frentes e das fixas declaradas), cria o banco da frente por um comando da configuração e escreve no worktree o arquivo de ambiente com as chaves configuradas. No fechamento, apaga o banco (comando da configuração) e libera as portas. O `sweep` lista banco ou porta sem frente. A configuração declara também os recursos fixos (que não são de frente nenhuma).
- **`migracao` (reserva de número de migração):** `ah migracao reservar|liberar|listar|renumerar`. O número reservado é o maior entre a última migração da base e as reservas das frentes vivas, mais um; o `close` libera. `renumerar` ajusta a frente depois da reintegração. A pasta e o padrão do nome vêm da configuração; o passo próprio de cada ferramenta de migração, se houver, é um comando da configuração.
- **`prova` (prova por árvore):** `ah prova <rótulo>` grava na frente a árvore testada (`HEAD^{tree}`), o comando e a hora, depois que o teste passou; `ah prova --confere <ramo> [<rótulo>]` sai 0 quando a árvore do ramo é a provada e 3 quando não é. Serve para não repetir o teste ponta a ponta depois de um merge que não mudou a árvore.
- **Cofre de segredos:** só a sugestão no `metodo.md` (seção 7) **[autor]**.

## 14. Abordagens consideradas

**Skills de terceiros: cópia no projeto × plugin oficial de cada agente.** O autor escolheu a cópia (26/11).
- Plugin: é o caminho documentado e recebe as correções sozinho, mas liga a coleção inteira em toda sessão (contra "só as skills da trilha"), mantém as duplicatas ativas (dois TDD), se atualiza sozinho e não aceita versão fixada pelo marketplace oficial do Claude Code. Além disso, cada agente instala de um jeito (o Codex oficial traz uma cópia antiga do Superpowers; no OpenCode, a coleção do Matt Pocock já é cópia por `npx skills`), e a instalação fica fora do repositório.
- Cópia: um mecanismo para os três agentes, versão no git, auditável pelo aluno, só as skills da tabela; custa o texto de terceiros commitado no projeto (com a licença), o comando de atualização e a conferência de duplicata com plugin.
- Variante descartada: guardar as skills de terceiros dentro do repositório do agent-harness. Funciona sem rede, mas o repositório carregaria texto de terceiros, sujeito à varredura de termos e à atualização à mão. Com a trava, o repositório guarda só origem e commit.

**Preparar: endereço × clone.** O autor quis os dois (26/11): o endereço para o uso comum, sem clone à mão; o clone para laboratório e estudo. O procedimento fica no README.

**Registros dos subagentes: ticket × repositório.** O autor seguiu a recomendação do ticket (26/11): sobrevive ao worktree, viaja entre máquinas e não acrescenta arquivo por frente. Commitar ao lado do plano daria leitura sem rede e entraria na auditoria, mas obrigaria a frente a commitar antes do merge, e o harness só poderia lembrar.

**Sessão nova pelo `tmux`:** de fora por enquanto (26/11), ver seção 2.

## 15. Mudanças no núcleo

O projeto 1 terminou em 26/11 (dev em 571c583). As mudanças abaixo no núcleo foram aprovadas pelo autor em 26/11 **[autor]** e entram na fatia indicada, com teste e com `docs/referencia/comandos.md` e `docs/extensoes/interface.md` atualizados junto.

- **P1. `CLAUDE.md` no `init` (fatia 1).** Ver seção 6: o `init`, o `atualizar` e o `doctor` garantem a linha `@AGENTS.md`.
- **P2. Ler a sessão pela interface (fatia 4).** O núcleo acrescenta `ctx.sessao(id)` (cópia só de leitura do registro da sessão, ou `null`) à interface, como acréscimo compatível, sem mudar a versão 1. A coluna de modelo no quadro usa isso.
- **P3. `--agentes` do `init`.** Hoje só aceita `claude-code`. O projeto 2 usa a própria lista (`metodo.agentes`), sem depender disso; nada muda no núcleo.
- **P5. Item ignorado que uma extensão sabe guardar (fatia 3).** O `close` recusa worktree com item ignorado antes das reações de extensão (seção 8). A extensão passa a poder declarar os caminhos ignorados de que cuida, com o comando que os guarda; a recusa do `close` para esses caminhos aponta o comando da extensão (`ah registros guardar`) em vez de só `--descartar-ignorados`. Acréscimo compatível na interface v1.
- **P4. README.** A seção de instalação para agentes muda o `README.md`; rebase sobre a `dev` antes de cada merge.

## 16. O que fica com quem constrói

- O formato exato da trava, de `colecoes.json` e das seções de configuração de cada extensão.
- A saída para o nome repetido no OpenCode (seção 6), decidida por ensaio.
- O texto das skills escritas aqui, dentro do que as seções 5 e 10 a 12 pedem, e o do `metodo.md`, que o autor revisa.
- Os padrões de modelo por agente na data do ensaio.
- Como achar e devolver o diário do subagent-driven-development (o caminho vem do script dele, na versão recomendada).
- O algoritmo da conferência da wiki, desde que cumpra a invariante.
- A organização interna de cada extensão.

## 17. Pronto quando

Cada fatia termina utilizável, testada e com o próprio "pronto". Valem para todas: `npm test` verde, `node ferramentas/varre-termos.mjs` com código 0, `node ferramentas/verifica.mjs` (Node mínimo e atual) com código 0 antes de integrar na `dev`, e nenhum nome do projeto de origem.

**Onde os ensaios rodam [autor, 26/11]:** em pasta descartável, sem o harness de agente da máquina. Esta máquina tem o Superpowers e as skills do Matt Pocock instalados como plugins; um ensaio que os enxergasse passaria pela skill do plugin e não pela cópia do projeto. Cada ensaio com agente real roda com um `HOME` descartável (e, no Claude Code, `CLAUDE_CONFIG_DIR` apontando para dentro dele): sem plugins, skills de usuário, configurações nem instruções globais. A autenticação dos três agentes entra nesse `HOME` só como os arquivos de credencial, copiados com permissão `0600` e apagados no fim, ou por login feito ali, se a cópia não funcionar ou se o agente renovar o token de um jeito que invalide o original (quem constrói confere antes e registra). As ferramentas de áudio e vídeo que a máquina já tem podem ser usadas no ensaio da fatia 7 **[autor, 26/11]**; o que o ensaio precisar instalar a mais fica dentro da pasta descartável. O registro de cada ensaio diz a versão do agente e como o isolamento foi montado. Uma segunda passada no ambiente normal da máquina registra o aviso do `doctor` diante do plugin duplicado.

**Fatia 1 (preparar e skills)**
- Testes: `metodo instalar` sobre origens git locais descartáveis copia só as skills da lista para as pastas dos agentes configurados e grava a trava; `metodo atualizar` não sobrescreve skill alterada, mostra o que muda e vai para `--para`; cada conferência do `doctor` tem teste de aviso e de passagem; `init` e `atualizar` criam o `CLAUDE.md` com `@AGENTS.md` quando não existe, acrescentam a linha quando falta e não tocam no resto; o `doctor` acusa a falta da linha.
- Ensaio, nos três agentes desta máquina (Claude Code, Codex e OpenCode, versões registradas): um agente sem contexto, com só o endereço do repositório (antes da publicação, o endereço do clone local), prepara um projeto descartável seguindo o README, até o `doctor`; em seguida, numa sessão nova, o agente lista as skills do projeto e usa uma delas que cita outra pelo prefixo. Saídas guardadas no registro de execução da fatia.
- O comportamento do OpenCode com nome de skill repetido está ensaiado e a saída escolhida está implementada.
- A pesquisa de instalação (`2026-11-26-metodo-pesquisa-instalacao.md`) foi conferida contra o ensaio, e o que o ensaio desmentiu está corrigido nela.

**Fatia 2 (princípios)**
- Teste: toda skill citada no `metodo.md` e no trecho do `AGENTS.md` está em `colecoes.json`; o `doctor` acusa a que falta na trava.
- O autor revisou o texto do `metodo.md`.

**Fatia 3 (registros)**
- Testes com o `gh` falso: `ah registros guardar` comenta o diário com o marcador, guarda a cópia e remove a pasta, e o `close` seguinte passa sem `--descartar-ignorados`; o `handoff` comenta sem remover; a retomada devolve o diário ao lugar dele; o `close` comenta o resumo a partir da cópia; diário em formato desconhecido vai cortado; nada disso recusa.

**Fatia 4 (modelo)**
- Testes: `ah modelo <nível>` para cada agente, em texto e JSON; nível desconhecido recusa com o próximo passo (é erro de uso do comando, não recusa por modelo); a coluna do quadro, se a P2 for aceita.

**Fatia 5 (orquestração)**
- Testes de `ah candidatos` com o `gh` falso (bloqueio, frente ativa, rótulo, "A decidir").
- Ensaio com o Claude Code num projeto descartável com o `gh` falso: a skill escolhe dois tickets, distribui a subagentes, integra e fecha, com o relatório guardado.

**Fatia 6 (wiki)**
- Testes de `ah wiki conferir` (literal presente, literal ausente, fonte que mudou); linha do resumo; sugestão no fechamento.
- Ensaio: um agente ingere um documento de exemplo, consulta e confere.

**Fatia 7 (reunião)**
- Ensaio nesta máquina com uma gravação de exemplo inventada (só áudio e com vídeo): a pasta da reunião sai como a seção 12 pede, com os fatos ingeridos na wiki; o caminho "falta ferramenta" passa pela oferta de instalação.

**Fatia 8 (opcionais)**
- Testes de cada extensão: portas sem choque entre frentes e com os fixos, banco criado e apagado pelos comandos (falsos) da configuração, `sweep`; reserva, liberação e renumeração de migração; prova gravada e conferida (0 e 3).
