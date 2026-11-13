# Comandos do harness

Referência dos comandos das fatias 1 e 2. Todos rodam como `tools/ah <comando>` dentro do projeto (o `init` roda a partir do clone do agent-harness). Os exemplos usam o projeto fictício `loja`, as pessoas `ana-souza` (sigla `as`) e `carla-dias` (sigla `cd`), os tickets `#1` a `#9` e as sessões `sessao-teste-0001`, `sessao-b-0002` e `sessao-c-0003`. As saídas foram copiadas de um projeto descartável; `<worktrees>` é a pasta dos worktrees das frentes.

Toda recusa tem a mesma forma: o motivo em uma linha e o próximo passo concreto. Recusa de comando de linha de comando sai com código 1 (`Recusado: motivo` / `Faça: …`) e também vai para os eventos (`recusa-de-comando`); recusa de trava, no gancho do agente, sai com código 2 (`Recusado (Tn): motivo` / `Faça: …`).

Nas mensagens, a sessão aparece pelo id curto (os 8 primeiros caracteres: `sessao-teste-0001` vira `sessao-t`).

## Variáveis de ambiente

| Variável | O que faz |
|---|---|
| `AH_ESTADO` | pasta do estado local, em vez do padrão da máquina |
| `AH_WORKTREES` | pasta dos worktrees das frentes |
| `AH_SESSAO` | id da sessão, quando o agente não o fornece (terminal comum); tem precedência sobre `CLAUDE_CODE_SESSION_ID` |
| `AH_PID_AGENTE` | pid do processo do agente desta sessão. O gancho usa o processo pai dele quando a variável falta; os comandos `ah` só gravam pid com ela (o processo do `ah` morre logo). **Não pode ser herdada por outra sessão**: um agente aberto de dentro desta, com a mesma variável, parece o mesmo processo, e no começo dele esta sessão é substituída (ver "Vida da sessão"). Ao abrir outro agente a partir desta sessão, tire a variável (`env -u AH_PID_AGENTE …`) |
| `AH_GUARD` | `AH_GUARD=off` no começo de um comando libera as travas T1 a T5 só para ele, e a liberação fica nos eventos (`liberacao`); a T0 nunca é liberada |
| `AH_GH` | caminho do `gh` (para ensaio; um `.mjs` roda com o Node) |

Do agente, o harness lê `CLAUDE_CODE_SESSION_ID` (o id da sessão, quando não há `AH_SESSAO`) e, no gancho, `CLAUDE_PROJECT_DIR` (um dos lugares onde procura o projeto).

Ajuda: `ah --help` (ou `ah` sozinho) lista os comandos; `ah <comando> --help` (ou `-h`) mostra a descrição e o uso do comando e sai com código 0, sem executar nada e sem exigir configuração nem sessão. Depois de um `--`, `--help` é argumento comum (`ah nota -- --help` grava a nota "--help").

Recusas que valem para vários comandos:

| Recusa | Quando | Faça |
|---|---|---|
| `não sei qual é a sessão` | os que exigem sessão, sem `AH_SESSAO` e fora do agente | `defina AH_SESSAO ou ligue o adaptador do agente`: dentro do agente a sessão vem do gancho; à mão, `AH_SESSAO=<nome> tools/ah <comando>` |
| `este projeto ainda não tem .harness/config.json` | todos, menos `init`, `doctor` e `gancho` | `peça ao agente: prepare meu projeto (ah init)` |
| `Configuração inválida: <campo> (<motivo>)` | idem, com o arquivo existente mas inválido | corrija `.harness/config.json` (ou rode `ah doctor`) |
| `comando desconhecido: <nome>` | qualquer nome fora da lista | rode `ah --help` |
| `Opção desconhecida: …` / `Argumento a mais: …` | opção ou argumento que o comando não aceita | `use <uso do comando>` |

Exigem sessão: `open`, `nota`, `whoami`, `papel`, `handoff`, `takeover` e `close`. Não exigem: `board`, `sweep`, `doctor`, `init` (e o `gancho`, que recebe a sessão no evento). Sessão ainda sem registro (rodada à mão, sem gancho) é registrada, com papel `executor`, pelo primeiro `open`, `papel`, `whoami` ou `takeover --confirmado` dela.

## init

```
ah init [--projeto <nome>] [--sigla <sigla>] [--agentes claude-code] [--teste "<comando>"] [--sem-protecao] [--sobrescrever]
```

Instala o harness no projeto atual a partir do clone do agent-harness: copia o núcleo para `.harness/nucleo/` (inclusive o modelo dos ganchos, em `.harness/nucleo/modelos/claude-code/`), grava `.harness/config.json`, cria `tools/ah` e `tools/ah.cmd`, os documentos de `docs/agents/`, os ganchos do agente em `.claude/settings.json` (acrescentando aos que já existem, sem apagar nada) e a CI em `.github/workflows/ah-ci.yml`. Sem `--projeto`, o nome vem da pasta; sem `--sigla`, o `init` propõe uma a partir do login do `gh`.

- `--teste "<comando>"` liga a CI: o comando entra no arquivo entre aspas simples. Só vale quando a configuração ainda não existe; depois, edite `ci.comandoDeTeste` em `.harness/config.json` e rode `ah init` de novo. Sem a opção, a CI nasce desligada.
- Antes de proteger um ramo, o `init` consulta a proteção no servidor e não altera ramo que já está protegido ("já está protegido no servidor; não alterei"). `--sem-protecao` pula essa etapa.
- Repetir o `init` é seguro: o que existe fica como está ("Mantive como estavam"); `--sobrescrever` troca os arquivos do harness pelos do clone. Um documento de `docs/agents/` editado à mão não é trocado sem `--sobrescrever`: o `init` lista em "Não sobrescrevi" e sai com código 1.
- O `init` cria os ramos que faltam (`dev`, `stage`) a partir da `main`, sem trocar de ramo, e não faz commit.

Recusas e o que fazer:

| Recusa | Faça |
|---|---|
| `Opção desconhecida: <opção>` | use `ah init [--projeto …]` com as opções acima |
| `A opção <opção> precisa de um valor.` | escreva `<opção> <valor>` |
| `Sigla inválida: <sigla>` | use de 2 a 4 letras minúsculas, como `--sigla as` |
| `Não consegui decidir a sigla` | rode `ah init --sigla <sigla>` |
| `Agente não suportado: <nome>` | use `--agentes claude-code` |
| `Este é o próprio clone do agent-harness, não um projeto de destino.` | entre na pasta do projeto e rode o `init` de lá |
| `Este núcleo é a cópia instalada no projeto, não o clone do agent-harness.` | rode `node <clone>/nucleo/bin/ah.mjs init` |
| `.claude/settings.json … não mexi nele` | conserte (ou apague) o arquivo e rode o `init` de novo |
| `Valor inválido para ci.comandoDeTeste` | escreva o comando numa linha só, sem `${{ }}` |

Exemplo, num repositório que só tinha a `main`:

```
$ node ~/agent-harness/nucleo/bin/ah.mjs init --projeto loja --sigla as --sem-protecao
Criei:
  .harness/nucleo/ (25 arquivos)
  .harness/config.json
  .harness/extensoes/.gitkeep
  tools/ah
  tools/ah.cmd
  docs/agents/sessoes-paralelas.md
  docs/agents/historico-das-frentes.md
  .claude/settings.json
  .github/workflows/ah-ci.yml
  ramo dev (local)
  ramo stage (local)
Falta levar o harness para o ramo base dev (as frentes partem dele; fora dele não há tools/ah nem gancho):
  git switch dev
  git add -- .harness tools/ah tools/ah.cmd docs/agents/sessoes-paralelas.md docs/agents/historico-das-frentes.md .claude/settings.json .github/workflows/ah-ci.yml
  git commit -m "chore: instala o agent-harness"
Depois rode: tools/ah doctor
CI criada desligada: defina ci.comandoDeTeste em .harness/config.json e rode ah init de novo
```

(A última linha sai na saída de erro.) O commit do harness vai **no ramo base**: as frentes nascem dele, e um worktree sem `tools/ah` não tem gancho nem trava. O `init` só manda `git switch <base>` quando o checkout está em outro ramo. Se o harness já foi commitado em outro ramo (a `main`, por exemplo), o `init` repetido manda `git switch dev` e `git merge main`. Com tudo no ramo base, ele termina com `Agora rode: tools/ah doctor`.

## doctor

```
ah doctor [--json]
```

Confere se o projeto está bem preparado, com 20 verificações: Node 22 ou mais novo; git presente; shell POSIX; `.harness/config.json` válido; cópia do núcleo (`MANIFEST.json`); arquivos de estado legíveis (inclusive o esquema: registro gravado por um harness mais novo falha com "atualize o harness"); sigla sem choque; `gh` presente e autenticado; ramo base e ramos protegidos; ganchos do Claude Code instalados; harness no ramo base (`tools/ah` e `.harness/config.json` commitados na `dev`); gancho responde (o `doctor` ensaia uma recusa T5 de verdade); hora de início do processo; gancho recusa troca de ramo (ensaia uma recusa T1); ganchos vigiam a edição (o seletor do `PreToolUse` pega `Edit`, `Write` e `NotebookEdit`, sem o que a T4 não vê a edição); comentários pendentes; frentes órfãs; proteção no servidor (uma linha por ramo protegido); CI com comando de teste; frentes com worktree (inclusive as em abertura parada). Cada item sai como `ok`, `aviso` (algo a melhorar, com o que fazer) ou `FALHOU` (algo que impede o uso). Código 0 se não houver falha; avisos não mudam o código. `--json` imprime `{"itens":[{"item","estado","fazer"}],"falhas","avisos"}`.

```
$ tools/ah doctor
ok      Node 22 ou mais novo
…
ok      Hora de início do processo
ok      Gancho recusa troca de ramo
ok      Ganchos vigiam a edição
ok      Comentários pendentes
aviso   Frente `orfa` órfã: dona sessao-m (processo não existe); ah takeover orfa com a ordem do executivo
ok      Proteção de stage no servidor
ok      Proteção de main no servidor
aviso   CI com comando de teste: defina ci.comandoDeTeste em .harness/config.json e rode ah init
aviso   Frente `sumida`: o worktree <worktrees>/sumida não existe; recrie-o ou encerre a frente com ah close sumida
aviso   Frente `parada` em abertura parada: um ah open parou no meio (sessão sessao-m-0006, processo 999999 morto); rode ah open parada para terminar, ou ah close parada para desistir
0 falha(s), 4 aviso(s).
```

Os itens novos da fatia 2:

| Item | Aviso ou falha | Faça |
|---|---|---|
| Hora de início do processo | aviso no Windows (`no Windows a hora de início não é conferida; um pid reaproveitado conta como vivo até o sinal vencer`) ou quando `/proc` ou `ps -o lstart` não responde | nada a fazer; saiba que a herança da continuação não acontece sem ela (ver "Vida da sessão") |
| Gancho recusa troca de ramo | falha se o ensaio de `git switch <primeiro protegido>` não sai com T1 | `rode ah init` |
| Ganchos vigiam a edição | falha se o seletor do `PreToolUse` não pega `Edit`, `Write` ou `NotebookEdit` | `rode ah init` |
| Comentários pendentes | aviso com `N operação(ões) na fila (#n, …)`; e um aviso `linha ilegível em pendentes: linha N de <arquivo>` por linha quebrada, com o conserto | `rode ah sweep --reparar com rede`; enquanto um ticket tem operação na fila, o `ah open` não o reserva |
| Frentes órfãs | um aviso por frente ativa sem dona viva (falha, com o que fazer, se a pasta `frentes/` não se lê) | `ah takeover <nome> com a ordem do executivo` |
| Frentes com worktree | um aviso por frente (ativa ou passada, o mesmo filtro do `sweep`) cujo worktree sumiu e por registro em abertura parada; um arquivo de frente ilegível não esconde as outras; falha, com o que fazer, se a pasta `frentes/` não se lê | `ah close <nome>` (ou recrie o worktree); `ah open <nome>` para terminar a abertura, ou `ah close <nome>` para desistir |

Exemplos de falha: `FALHOU  .harness/config.json válido: não há .harness/config.json; rode ah init`; `FALHOU  Arquivos de estado legíveis: <estado>/loja/sessoes/sessao-ruim-0009.json ilegível; apague ou conserte o arquivo`; `FALHOU  Harness no ramo base: tools/ah e .harness/config.json não estão no ramo dev, de onde as frentes partem; faça o commit do harness em dev: git switch dev e o git add/git commit que o ah init mostrou (se o commit já está em outro ramo: git switch dev && git merge <esse ramo>)`.

## open

```
ah open <nome> [--tickets 1,2] [--plano <arquivo>] [--caminhos <globs>] [--para <id curto>]
```

Abre uma frente de trabalho, ou retoma uma frente passada com esse nome. O nome tem de 2 a 49 caracteres: minúsculas, números e hífen, começando por letra ou número. `--plano` é um arquivo dentro do projeto (caminho relativo à raiz); `--caminhos` lista, separados por vírgula, os globs que a frente vai tocar (`src/**,docs/*.md`).

**Abrir.** Cria o ramo `feat/<nome>` a partir do ramo base (o do remoto, salvo quando a base local o contém e está à frente), um worktree próprio em `<worktrees>/<nome>` e o registro no estado (ID `as-1`, `as-2`…), e põe a frente no foco da sessão. A abertura tem três fases: sob a trava do estado, grava um registro `abrindo` (guarda o id e o nome contra outro `open`, com o processo deste); fora da trava, reserva os tickets; de novo sob a trava, cria o worktree e a frente vira `ativa`. Se o `open` morre no meio, o registro fica em "abertura parada": outro `ah open <nome>` o termina com o mesmo id, e `ah close <nome>` desiste dele.

**Reserva dos tickets** (`--tickets`). Para cada ticket: lê o ticket; recusa se ele já está com outra frente (marcador do harness ativo ou passado), com um responsável que não é você, ou com o rótulo de reserva sem frente nem responsável; ticket fechado não é reservado (aviso), mas fica na lista da frente. Depois cria o rótulo (`gh label create em-andamento --force`, o de `github.rotuloDeReserva`), comenta `Frente as-1 (carrinho) aberta por @ana-souza.` com o marcador na última linha, põe você de responsável e o rótulo, e relê. Se duas aberturas reservam o mesmo ticket quase juntas, fica a que comentou primeiro (a ordem do servidor) em todos os tickets dela; a outra comenta a desistência, se tira de responsável e recusa sem criar worktree. Sem rede, recusa (a reserva não fica para depois). Ticket com operação desta máquina ainda na fila de pendentes também recusa.

```
$ tools/ah open carrinho --tickets 1
Frente as-1 carrinho aberta.
Trabalhe em: <worktrees>/carrinho
```

No ticket #1 fica o comentário, com @ana-souza de responsável e o rótulo `em-andamento`:

```
Frente as-1 (carrinho) aberta por @ana-souza.

<!-- ah:frente id=as-1 nome=carrinho ramo=feat/carrinho estado=ativa login=ana-souza sessao=sessao-t tickets=1 abertaPor=ana-souza abertaEm=2026-11-12T23:19:45-03:00 sid=0bb41ce63d29136c v=1 -->
```

O marcador é sempre a última linha do comentário. Tipos: `frente` (abertura), `retomada`, `tomada`, `passagem`, `fechamento` e `desistencia`; o último marcador de uma frente nos tickets diz o estado dela (`ativa`, `passada` ou `livre`).

**Retomar na mesma máquina.** Se a frente com esse nome está `passada` aqui (depois de um `ah handoff`, de uma continuação sem vínculo ou de um `sweep --reparar`), o `open` a retoma em vez de abrir: recria o worktree se ele sumiu (do ramo local ou do remoto), confere que ele está no ramo da frente e sem operação em andamento, traz o ramo do remoto por fast-forward se outra máquina o empurrou, grava a sessão como dona e comenta `retomada` nos tickets. Frente com tickets sempre passa pelo GitHub antes: se outra máquina já a retomou, recusa; sem rede, recusa (`preciso do GitHub para confirmar que ninguém retomou carrinho`). `--tickets` não vale na retomada (os tickets são os da frente passada); `--plano` e `--caminhos` trocam os da frente.

```
$ tools/ah open carrinho
Frente as-1 carrinho retomada.
Trabalhe em: <worktrees>/carrinho
```

**Retomar de outra máquina.** Sem frente nem ramo com esse nome aqui e com `feat/<nome>` no remoto, o `open` procura a passagem nos tickets abertos com o rótulo de reserva (`gh issue list --label em-andamento`) ou, com `--tickets`, só nos tickets dados. Achando a passagem, reconstrói a frente com o mesmo id, cria o worktree a partir do ramo do remoto e comenta `retomada`; a corrida com outra retomada é decidida como na reserva (quem perde desfaz o que fez e recusa). Frente sem ticket só se retoma na mesma máquina. A máquina de origem, que ainda tem o registro `passada`, descobre ao tentar retomar:

```
$ tools/ah open carrinho
Recusado: Não retomei carrinho: a frente as-1 está ativa com @carla-dias em outra máquina.
Faça: combine com @carla-dias; o registro desta máquina ficou velho: ah close carrinho o tira (só o worktree e o registro daqui; os tickets não mudam)
```

**`--para <id curto>`.** O orquestrador abre (ou retoma) a frente em nome de outra sessão viva, que fica a dona e com o foco nela; o foco de quem chama não muda. O id curto é qualquer começo único do id da sessão (`tools/ah board` mostra as sessões vivas). Apontando para a própria sessão, é o `open` comum.

```
$ tools/ah open cupom --para sessao-b
Frente as-3 cupom aberta.
Dona: sessão sessao-b (aberta por esta sessão).
Trabalhe em: <worktrees>/cupom
```

**Executor e orquestrador.** A sessão executora tem uma frente só: com uma frente ativa (ou em abertura), o `open` de outra recusa. A orquestradora abre quantas quiser (`ah papel orquestrador`).

**Avisos que não impedem a abertura** (na saída de erro): `Aviso: não consegui atualizar origin/dev; sigo com o que há aqui.` quando o `git fetch` da base falha; `Aviso: o ticket #N está fechado; não o reservei (a frente o guarda na lista).`; a lista dos arquivos modificados no checkout principal, que o `open` não toca; as três últimas notas de cada outra frente ativa ou em abertura (`Notas de as-2 frete:`); com `--caminhos`, `Atenção: as-2 frete já mudou N arquivo(s) de --caminhos: …` e `Atenção: as-1 carrinho declarou os mesmos caminhos: src/**`; na retomada, as alterações não commitadas deixadas no worktree e `o worktree … avançou até origin/feat/carrinho`.

| Recusa | Faça |
|---|---|
| `Nome de frente inválido: …` | use de 2 a 49 caracteres: minúsculas, números e hífen, começando por letra ou número |
| `--tickets só aceita números inteiros positivos…` / `--caminhos tem um item vazio.` | escreva, por exemplo, `--tickets 1,2` / `--caminhos "src/**,docs/*.md"` |
| `O plano precisa ser um arquivo dentro do repositório: …` / `O plano não existe: …` | passe o caminho relativo à raiz / crie o arquivo antes |
| `Esta máquina ainda não tem sigla.` | rode `ah init --sigla <sigla>` |
| `Esta sessão já tem a frente carrinho.` | continue nela ou, antes de abrir outra, encerre com `ah close carrinho` (o orquestrador abre várias: `ah papel orquestrador`) |
| `A frente as-1 carrinho já é desta sessão.` | trabalhe em `<worktrees>/carrinho` |
| `A frente as-1 carrinho está ativa com a sessão sessao-b, que está viva.` | peça à sessão sessao-b que rode `ah handoff`; depois rode `ah open carrinho` |
| `A frente as-1 carrinho está ativa, mas a dona (sessão sessao-b) não está viva.` | para assumi-la, rode `ah takeover carrinho` |
| `A frente as-1 carrinho está passada: os tickets vêm da frente passada; rode ah open carrinho sem --tickets.` | rode `ah open carrinho` sem `--tickets` |
| `Há uma abertura da frente carrinho em curso (…)` | espere esse `ah open` terminar ou escolha outro nome; se ele parou, rode `ah open carrinho` de novo |
| `Já existe frente com o nome carrinho.` (ou `ramo remoto`, sem passagem achada) | escolha outro nome (com ramo remoto: se é uma frente passada, `ah open carrinho --tickets <n>` com o ticket dela) |
| `Já existe ramo local com o nome carrinho.` | escolha outro nome; se é sobra de um `ah open` interrompido, `git worktree remove <worktrees>/carrinho` (se a pasta existir) e `git branch -d feat/carrinho`, e rode `ah open` de novo |
| `O harness ainda não está no ramo dev (… não tem tools/ah); a frente nasceria sem ele.` | faça o commit do harness lá: `git switch dev` e o `git add`/`git commit` que o `ah init` mostrou |
| `Não reservei: há comentário pendente para o ticket #1 nesta máquina, que o GitHub ainda não recebeu.` | rode de novo quando o GitHub responder; `ah doctor` mostra a fila |
| `Não reservei os tickets: não consegui falar com o GitHub para reservar #4 (sem rede)` | tente de novo com rede, ou abra sem `--tickets` (sem reserva) |
| `Não reservei os tickets: o ticket #1 já está reservado pela frente as-2 (frete), de @carla-dias.` | combine com @carla-dias, dona da frente as-2, ou escolha outro ticket; se a reserva ficou velha, peça a quem a fez para rodar `ah close` ou `ah handoff` |
| `… já está reservado pela frente as-2 (frete), de @carla-dias, que foi passada adiante (sem dona).` | retome essa frente com `ah open frete` em vez de abrir outra |
| `… o ticket #1 tem o rótulo em-andamento sem frente do harness nem responsável.` | se ninguém o usa, `gh issue edit 1 --remove-label em-andamento` e rode `ah open` de novo |
| `… a frente as-2 (frete), de @carla-dias, reservou #1 antes desta; desisti da reserva (…)` | combine com @carla-dias ou escolha outro ticket |
| `Não retomei carrinho: a frente as-1 está ativa com @carla-dias em outra máquina.` | combine com @carla-dias; o registro daqui ficou velho: `ah close carrinho` o tira |
| `Não retomei carrinho: preciso do GitHub para confirmar que ninguém retomou carrinho (…).` | tente de novo com rede: `ah open carrinho` |
| `O ramo feat/carrinho daqui e o de origin divergiram …` | junte os dois no worktree (`git -C <worktree> pull --rebase origin feat/carrinho`, ou merge) e rode `ah open carrinho` de novo |
| `O worktree da frente as-1 carrinho não existe e o ramo feat/carrinho não está aqui nem em origin.` | se o trabalho foi para outro lugar, `ah close carrinho`; senão traga o ramo (`git fetch`) e repita |
| `Só o orquestrador abre frente para outra sessão, e esta sessão (sessao-b) é executor.` | `ah papel orquestrador` |
| `A sessão sessao-c não está viva; uma frente aberta para ela ficaria sem ninguém.` | confira as sessões vivas em `tools/ah board` |
| `A sessão sessao-b é executora e já tem a frente cupom.` | escolha outra sessão ou peça a ela `ah handoff` |
| `Não achei sessão com o id …` / `O id … é de mais de uma sessão: …` | confira o id em `tools/ah board` / use mais letras do id |

## nota

```
ah nota "<texto>"
```

Acrescenta uma nota à frente em foco da sessão (aparece na última coluna do `board` e, nas três últimas, no `open` das outras sessões).

| Recusa | Faça |
|---|---|
| `A nota está vazia.` | escreva o texto, como `ah nota "mexendo no total"` |
| `Esta sessão não tem frente ativa.` | rode `ah open <nome>` |

```
$ tools/ah nota "mexendo no total"
Nota registrada na frente as-1 carrinho.
```

## board

```
ah board [--json]
```

Mostra as frentes do estado em tabela e, embaixo, as sessões vivas. Sem frente: `Nenhuma frente aberta.` e a linha das sessões. Colunas:

| Coluna | Conteúdo |
|---|---|
| ID, NOME | o id (`as-1`) e o nome da frente |
| DONA | id curto da sessão dona; `(morta)` se ela não está viva, `(ilegível)` se o registro dela não se lê; `—` sem dona |
| ESTADO | `ativa`; `órfã` (ativa sem dona viva: `ah takeover`; a mesma regra do `sweep`, e dona com registro ilegível não conta como órfã); `passada` (sem dona: `ah open`); `abrindo` (um `ah open` em curso); `abrindo (parada)` (o processo do `open` morreu) |
| TICKETS | `#1,#2` ou `—` |
| SOBREPÕE | IDs das outras frentes (ativas ou passadas) que mudaram algum arquivo em comum, pelo ramo desde a base e pelo worktree; `?` quando o git passou do prazo total (3 s) antes de conferir a frente |
| PLANO, ÚLTIMA NOTA | o plano e a última nota, cortados |

Depois da tabela: `Sobreposições:` com cada arquivo e as frentes que o mudaram (até 20); `Sessões vivas: <id curto> (<papel>, <frente em foco>); …`; e `Sessões ilegíveis: …` quando há registro de sessão que não se lê. Arquivo de frente ilegível não derruba o quadro: vira aviso na saída de erro. `--json` imprime `{"frentes","sessoes","sessoesIlegiveis","sobreposicoes","sobreposicaoIncompleta"}`, cada frente com o registro inteiro mais `donaViva`, `donaIlegivel`, `sobrepoe`, `sobreposicaoConferida` e, em abertura, `aberturaParada`.

```
$ tools/ah board
ID    NOME      DONA      ESTADO  TICKETS  SOBREPÕE  PLANO  ÚLTIMA NOTA
as-1  carrinho  sessao-t  ativa   #1       —         —      —
as-3  cupom     sessao-b  ativa   —        —         —      —
as-2  frete     sessao-t  ativa   —        —         —      —
Sessões vivas: sessao-t (orquestrador, frete); sessao-b (executor, cupom)
```

```
ID    NOME    DONA              ESTADO            TICKETS  SOBREPÕE  PLANO  ÚLTIMA NOTA
as-9  parada  sessao-m (morta)  abrindo (parada)  —        —         —      —
as-1  alheia  —                 passada           —        —         —      —
as-2  orfa    sessao-m (morta)  órfã              —        —         —      —
```

## whoami

```
ah whoami [--json]
```

Diz quem é a sessão, o papel e a frente em foco: `Sessão sessao-t (executor) · frente: as-1 carrinho` (ou `frente: nenhuma`). Com `--json`: `{"sessao","papel","frente"}`; `frente` é `null` sem frente.

## papel

```
ah papel [orquestrador|executor]
```

Sem argumento, mostra o papel da sessão; com um, troca. Toda sessão nasce `executor`. A executora tem uma frente só; a orquestradora abre e retoma várias, assume várias (`takeover`) e abre frente para outra sessão (`open --para`). O papel passa para a sessão que continua esta (ver "Vida da sessão").

```
$ tools/ah papel
Sessão sessao-t: executor.
$ tools/ah papel orquestrador
Sessão sessao-t: orquestrador.
```

| Recusa | Faça |
|---|---|
| `Papel desconhecido: chefe` | `ah papel orquestrador ou ah papel executor` |
| `Argumento a mais: b` | idem |
| `Executor tem uma frente só, e esta sessão tem 2: carrinho, frete.` | fique com frete e, nas outras, rode `ah handoff carrinho ou ah close carrinho`; depois `ah papel executor` |

## handoff

```
ah handoff [<nome>] [--nota "<texto>"]
```

Passa a frente adiante sem fechá-la, para outra sessão (desta máquina ou de outra) continuar. Sem `<nome>`, vale a frente em foco (ou a única da sessão). O `handoff`:

1. confere que a frente é desta sessão e está ativa, e que o worktree existe, está no ramo da frente, sem operação em andamento (merge, rebase…) e sem alterações não commitadas;
2. empurra o ramo para o remoto (`git push -u origin feat/<nome>`), mesmo sem commit novo; sem remoto, avisa que só esta máquina retoma a frente;
3. sob a trava, confere que nada mudou (frente, dona, topo do ramo), marca a frente `passada`, sem dona, guarda a nota e passa o foco da sessão para a frente mais nova que sobrou (ou nenhuma);
4. comenta a passagem em cada ticket: quem passou, a nota, o estado deixado (ramo, últimos 3 commits fora da base, plano) e o comando para retomar. Sem rede, o comentário fica na fila e sai no próximo comando com rede.

A reserva continua: o responsável e o rótulo ficam nos tickets até a frente ser fechada. O worktree fica onde está. Para retomar: `ah open <nome>` (nesta máquina ou em outra).

```
$ tools/ah handoff carrinho --nota "falta o total"
Frente as-1 carrinho passada.
Para retomar: tools/ah open carrinho
```

No ticket:

```
Passagem de bastão: frente as-1 (carrinho), por @ana-souza.

falta o total

Estado deixado: ramo feat/carrinho no remoto origin. Últimos commits:
- 34277a9 wip: x

Para retomar: tools/ah open carrinho

<!-- ah:passagem id=as-1 nome=carrinho ramo=feat/carrinho estado=passada login=ana-souza sessao=sessao-t tickets=1 abertaPor=ana-souza abertaEm=2026-11-12T23:19:45-03:00 v=1 -->
```

| Recusa | Faça |
|---|---|
| `Esta sessão não tem frente ativa para passar.` | rode `ah board` para ver as frentes |
| `Esta sessão tem mais de uma frente (carrinho, frete).` | diga qual: `ah handoff <nome>` |
| `A frente carrinho não é desta sessão: é da sessão sessao-b.` (ou `já está passada, sem dona`) | rode `ah board` (passada: `ah open carrinho` para retomá-la) |
| `A frente as-1 carrinho não está ativa (estado abrindo).` | se o `ah open` dela parou no meio, `ah open carrinho` para terminar ou `ah close carrinho` para desistir |
| `O worktree da frente as-1 carrinho não existe (…).` | se o trabalho já está no ramo ou na base, `ah close carrinho`; senão `git worktree add <worktree> feat/carrinho` e repita |
| `O worktree <worktrees>/carrinho tem alterações não commitadas (1): ?? x.txt.` | faça o commit no worktree (um commit `wip:` serve) e rode `ah handoff` de novo |
| o worktree fora do ramo da frente ou com operação em andamento | o que a recusa descreve, e repita |
| `O git push do ramo feat/carrinho para origin falhou: …` | resolva (rede, permissão, ramo divergente no remoto) e rode `ah handoff` de novo; nada mudou |
| `A frente carrinho mudou durante o handoff (…)` / `O ramo feat/carrinho ganhou commits durante o handoff.` | rode `ah board` / rode `ah handoff` de novo; o estado local não mudou |

## takeover

```
ah takeover <nome> [--confirmado]
```

Assume a frente ativa de uma sessão que não está viva (morta, encerrada ou sem registro). É decisão humana: sem `--confirmado`, o comando só lê: mostra a dona, o motivo e a idade do sinal e recusa, pedindo a confirmação do executivo, sem registrar a sessão nem tocar o sinal (grava só o evento `recusa-de-comando`). Com `--confirmado`: reenvia a fila de pendentes, confere nos tickets que nenhuma outra máquina está com a frente (sem rede, avisa e assume pelo registro local), comenta `Frente as-1 (carrinho) assumida pela sessão … (a anterior, …, <motivo>).` com o marcador `tomada`, põe o seu login de responsável (com o rótulo) se ele ainda não estava na reserva, grava esta sessão como dona e lhe dá o foco. A sessão antiga, se voltar (uma conversa retomada com `--resume`), não recupera a frente: o resumo do começo dela diz quem a tem.

```
$ AH_SESSAO=sessao-d-0004 tools/ah takeover carrinho
Recusado: A frente as-1 carrinho é da sessão sessao-c (morta: processo não existe; último sinal há 0 min).
Faça: peça ao executivo que confirme e rode ah takeover carrinho --confirmado
$ AH_SESSAO=sessao-d-0004 tools/ah takeover carrinho --confirmado
Frente as-1 carrinho assumida.
Trabalhe em: <worktrees>/carrinho
```

| Recusa | Faça |
|---|---|
| `Falta o nome da frente a assumir.` | rode `ah takeover <nome>`, com o nome que `ah board` mostra |
| `Não achei a frente carrinho no estado.` | confira o nome em `ah board` |
| `A frente as-1 carrinho está passada, sem dona: retome-a em vez de assumir.` | `ah open carrinho` |
| `A frente as-1 carrinho parou no meio da abertura; não há frente ativa para assumir.` (ou `Há uma abertura … em curso`) | `ah open carrinho` para retomar a abertura parada, ou `ah close carrinho` para desistir |
| `A frente as-1 carrinho é desta sessão.` | trabalhe no worktree dela |
| `A frente as-1 carrinho é da sessão sessao-c, que está viva.` | peça à sessão sessao-c que rode `ah handoff`; ou espere o sinal dela vencer (120 min) |
| `Esta sessão já tem a frente frete.` | antes, `ah handoff frete` ou `ah close frete` (o orquestrador assume várias: `ah papel orquestrador`) |
| `O worktree da frente as-1 carrinho não existe (…).` | `ah close carrinho` e abra de novo com `ah open carrinho` |
| registro da dona ilegível | conserte ou apague o arquivo (`ah doctor`): a dona pode estar viva |
| `Não assumi carrinho: há operações desta máquina na fila para #1 que precisam sair antes.` | tente de novo com rede: `ah takeover carrinho --confirmado` |
| `Não assumi carrinho: a frente as-1 está ativa com @carla-dias em outra máquina.` | combine com @carla-dias |
| `Não assumi carrinho: nos tickets a frente as-1 foi passada por @carla-dias em outra máquina; …` | combine com @carla-dias (a frente se retoma pela passagem dele, com `ah open`) |
| `Não assumi carrinho: nos tickets a frente as-1 não está ativa (…)` / `não achei o ticket #1` | confira os tickets; se a frente foi fechada em outra máquina, `ah close carrinho` |
| `A frente carrinho mudou enquanto eu conferia o GitHub.` | rode `ah takeover carrinho --confirmado` de novo |

## sweep

```
ah sweep [--reparar] [--json]
```

Lista o que está fora do lugar no estado desta máquina, sem rede: uma linha por achado, `- <tipo>: <detalhe>. Faça: <saída>`, ou `Nada fora do lugar.`. Sai sempre com código 0. `--json` imprime `{"reparos":[…],"achados":[{"tipo","detalhe","saida"}]}`.

| Achado | Quando | Faça |
|---|---|---|
| `estado-ilegivel` | arquivo de sessão, de frente ou a fila de pendentes que não se lê | apague ou conserte o arquivo (rode `ah doctor`) |
| `abertura-parada` | registro `abrindo` cujo processo do `open` morreu (ou, sem processo, sem dona viva) | `ah open <nome>` para terminar, ou `ah close <nome>` para desistir |
| `frente-orfa` | frente ativa sem dona viva | `ah takeover <nome>` (com a ordem do executivo) |
| `worktree-sumiu` | a pasta do worktree da frente (ativa ou passada) não existe | `ah close <nome>` |
| `ramo-sumiu` | o ramo da frente não existe nem local nem no remoto | confira com quem abriu; `ah close <nome>` |
| `worktree-sem-frente` | worktree do git sem frente no estado, com o ramo, os commits fora da base e do remoto e os arquivos sujos | no padrão `<worktrees>/<nome>` com o ramo `feat/<nome>`: `ah sweep --reparar`; fora dele: confira e `git worktree remove` à mão |
| `sessao-morta` | sessão que não está viva, sem frente, sem passagem feita há menos de 7 dias, parada há mais de 7 dias (não sai enquanto houver arquivo de frente ilegível) | `ah sweep --reparar` |
| `principal-fora-da-base` | o checkout principal não está no ramo base | `git switch dev` no principal |
| `principal-sujo` | o checkout principal tem arquivos alterados | commit por caminho ou combine com a dona |
| `pendentes` | operações na fila de comentários e edições de ticket | `ah sweep --reparar` (com rede) |
| `pendente-ilegivel` | `linha ilegível em pendentes: linha N de <estado>/pendentes.jsonl` (uma por linha quebrada; as outras seguem na fila) | apague a linha N (o próximo reenvio com rede, `ah sweep --reparar`, também a descarta) |

```
$ tools/ah sweep
- estado-ilegivel: <estado>/loja/sessoes/sessao-ruim-0009.json. Faça: apague ou conserte o arquivo (rode ah doctor)
- abertura-parada: frente as-9 parada, sessão sessao-m, processo 999999 morto. Faça: ah open parada para terminar, ou ah close parada para desistir
- frente-orfa: frente as-2 orfa, dona sessao-m (processo não existe). Faça: ah takeover orfa (com a ordem do executivo)
- worktree-sumiu: frente as-3 sumida, worktree <worktrees>/sumida. Faça: ah close sumida
- worktree-sem-frente: <tmp>/fora (ramo outro, 0 commits fora da base e do remoto, 0 arquivos sujos). Faça: confira e git worktree remove à mão
- worktree-sem-frente: <worktrees>/solta (ramo feat/solta, 0 commits fora da base e do remoto, 0 arquivos sujos). Faça: ah sweep --reparar
- sessao-morta: sessao-velha-0008 (encerrada (fim), último sinal há 42 dias). Faça: ah sweep --reparar
- principal-sujo: <raiz> com 1 arquivo alterado. Faça: commit por caminho ou combine com a dona
```

`--reparar` mexe só no estado, nunca apaga worktree, ramo nem arquivo ilegível, e lista o que fez antes dos achados que sobraram (`Reparos: nada a fazer.` quando não há). Os reparos, cada um também gravado como evento `reparo`:

1. apaga o registro das sessões do achado `sessao-morta`;
2. tira o foco da sessão que aponta para uma frente que não existe ou que é de outra dona;
3. para cada `worktree-sem-frente` no padrão, reconstrói a frente `passada`, sem dona, com `reconstruida: true` e **um ID novo** (o original se perdeu com o estado), sem tickets; retome com `ah open <nome>`. Sem sigla na máquina, avisa e não reconstrói;
4. reenvia a fila de pendentes (com rede).

```
$ tools/ah sweep --reparar
Reparos:
  apaguei a sessão sessao-velha-0008 (parada há mais de 7 dias, sem frente)
  reconstruí a frente as-10 solta (passada, sem dona) para o worktree <worktrees>/solta; retome com ah open solta
- estado-ilegivel: …
```

## close

```
ah close [<nome>] [--resumo "<texto>"] [--descartar-ignorados]
```

Fecha a frente em foco da sessão sem perder trabalho: confere que o ramo foi mesclado e que não há nada solto no worktree, comenta o fechamento nos tickets e libera a reserva, remove o worktree e o ramo, grava a linha em `docs/agents/historico-das-frentes.md` (com um commit `docs(frentes): fecha …` no ramo base) e solta o foco (passa para a frente mais nova que sobrou à sessão, ou nenhuma). Sem `--resumo`, o resumo é o título do último commit do ramo. Rode no checkout principal, no ramo base, depois do merge. Frente sem commits novos (nada a mesclar) fecha direto, com código 0.

- **Tickets:** em cada um, o comentário `Frente as-1 (carrinho) fechada.` com o resumo e o marcador `fechamento` (`estado=livre`); com reserva, tira o rótulo e os responsáveis que a frente pôs (os da reserva local e os que os marcadores do ticket mostram, menos os logins que outra frente ativa no ticket segura; o rótulo fica se outra frente ainda o segura). O ticket não é fechado. Uma vez só, mesmo se o `close` for repetido.
- **Fila:** o que falha por rede (comentário ou edição) entra na fila de pendentes, em ordem, e sai no próximo comando com rede (todo comando que mexe em ticket reenvia antes); o `close` avisa `o comentário ficou na fila; sai no próximo comando com rede`. Erro permanente (ticket inexistente) tira a operação da fila e a guarda em `pendentes-descartados.jsonl`. `ah doctor` e `ah sweep` mostram a fila; `ah sweep --reparar` a reenvia.
- `--descartar-ignorados`: aceita perder os arquivos ignorados pelo git que estão no worktree (`node_modules/`, caches…); sem ela, o `close` recusa e lista esses itens.
- `<nome>` fecha uma frente pelo nome. Se a dona não está viva (encerrada, morta ou sem registro) ou a frente está passada, esta sessão a fecha, com as mesmas conferências, e a saída diz `A frente era da sessão <id>, já encerrada; esta sessão a fechou.` (ou `que não está viva (<motivo>)`, ou `A frente estava passada pela sessão sessao-t, sem dona; esta sessão a fechou.`).
- **Frente passada com tickets:** outra máquina pode tê-la retomado. O `close` primeiro a toma nos tickets pela mesma corrida da retomada e só então fecha; se ela está ativa com outra máquina (ou já foi fechada lá), fecha só o registro e o worktree daqui, sem comentar nem mexer nos tickets e sem mudar o histórico. Sem rede, recusa.
- **Abertura parada:** com o registro `abrindo` e o processo do `open` morto, o `close` só desfaz a abertura: tira a reserva dos tickets onde ela é desta frente (comentário `desistencia`), apaga o registro e lista o que sobrou para limpar à mão. Sem linha no histórico nem commit.

```
$ tools/ah close --resumo "soma do carrinho"
Frente as-1 carrinho fechada.
Falta: git push origin dev
```

```
$ tools/ah close carrinho
Registro local da frente as-1 carrinho fechado: nos tickets a frente as-1 já não está passada (fechada em outra máquina). Não comentei nem mexi nos tickets, e o histórico não mudou.
```

A linha `Falta: git push …` só aparece quando o projeto tem remoto. O `close` nunca empurra.

| Recusa | Faça |
|---|---|
| `O ah close não roda de dentro de um worktree de frente.` | rode no checkout principal |
| `Esta sessão não tem frente.` | rode `ah board` para ver as frentes |
| `A frente as-1 carrinho é da sessão <id inteiro>, que ainda está aberta, não desta.` | peça à sessão dona que rode `ah close`; se ela parou, espere o sinal de vida dela vencer (`sessoes.prazoDoSinalMin`, hoje 120 min), confira em `ah board` que a frente aparece órfã e repita `ah close carrinho` |
| `A frente as-1 carrinho está sendo aberta agora (…).` | espere esse `ah open` terminar e, se ainda quiser, repita |
| `O checkout principal não está no ramo base dev.` | rode `git switch dev` no checkout principal |
| `O checkout principal tem alterações em docs/agents/historico-das-frentes.md.` | faça commit ou descarte essas alterações |
| `Fechar a frente … perderia trabalho.` | lista o que se perderia (commits fora do ramo base e do remoto, arquivos soltos, itens ignorados) e o que fazer com cada um |
| `Não fechei carrinho: há operações desta máquina na fila para #1 que precisam sair antes.` | tente de novo com rede; nada foi apagado |
| `Não fechei carrinho: preciso do GitHub para confirmar que ninguém retomou carrinho (…).` | tente de novo com rede; nada foi apagado |
| `Não consegui conferir …` | resolva o que o git descreve; nada foi apagado |

## gancho

```
ah gancho claude-code
```

Não é para uso manual: é o comando que o `.claude/settings.json` chama em cada evento do agente (`SessionStart`, `UserPromptSubmit`, `PreToolUse` de `Bash|PowerShell|Edit|Write|NotebookEdit`, `Stop`, `SessionEnd`). Lê o JSON do evento na entrada padrão, registra no `eventos.jsonl` do estado, toca o sinal de vida da sessão e, antes de uma ferramenta, aplica as travas. Código 0 deixa a ferramenta passar; código 2 a recusa, e o agente recebe o texto da recusa.

**Começo de sessão.** Registra a sessão (com o pid do agente: `AH_PID_AGENTE` ou o processo pai do gancho, e a hora de início dele), faz a continuação (ver "Vida da sessão") e devolve ao agente um resumo curto: a sessão e o papel, a frente em foco e o worktree, avisos (`Sua frente as-1 carrinho está com a sessão sessao-d.`), frentes sem dona com a saída de cada uma (`Sem dona: as-2 carrinho (ah open carrinho)`), sobreposição de arquivos com outras frentes, as outras frentes, o estado do checkout principal e as regras.

```
Sessão sessao-c (executor) no harness.
Sua frente: as-2 carrinho · worktree: <worktrees>/carrinho
Outras frentes: as-1 alheia (dona sessao-b)
Base dev: checkout principal limpo.
Regras: trabalhe no worktree da sua frente; git add só por caminho; push e merge em stage e main só com ordem do executivo.
Mais: docs/agents/sessoes-paralelas.md · tools/ah board
```

**Cada interação** (`UserPromptSubmit`, `Stop`, `PreToolUse`) toca o sinal. **Fim** (`SessionEnd`): encerra a sessão, salvo com `reason` `clear` ou `resume`, que anunciam uma sessão nova no mesmo processo; aí a sessão fica `aguardandoContinuacao`.

**Travas.** Recusas, com exemplos de recusa e de passagem:

| Trava | O que recusa | Passa | Faça (da recusa) |
|---|---|---|---|
| T0 | comando que menciona git ou gh e não pode ser lido como shell (aspas ou parêntese sem fechar, heredoc sem fim); nome do comando vindo de variável ou crase (`$GIT push`, `` `which git` push ``) ou `eval`/`source` com variável, num texto que menciona git ou gh; evento do `PreToolUse` que o gancho não entende; `cwd` inexistente; configuração quebrada | `echo $(git rev-parse HEAD)` (o nome do comando é legível) | escreva o comando por extenso; rode `tools/ah doctor` |
| T1 | no checkout principal (ou em pasta que o gancho não determina): `git switch main`, `git switch -c/-C/--orphan/--detach`, `git switch -`, `git checkout -b/-B/--orphan/--detach`, `git checkout -`, `git checkout feat/alheia` (palavra solta que é ramo, ramo do remoto ou etiqueta, mesmo que também seja um arquivo), `gh pr checkout 3` | `git switch dev` (a base), `git checkout -- README.md`, `git checkout README.md` (arquivo que existe); qualquer troca dentro de um worktree de frente | trabalhe no worktree de uma frente (`tools/ah open <nome>`); o checkout principal fica em `dev` |
| T2 | no checkout principal: `git add -A`, `.`, `-u`, `*` solto, caminho que resolve para a raiz ou acima (`cd src && git add ..`), `git commit -a`, `git commit .`; e `git add`/`git commit` com caminho que não dá para ler (`git add $(git ls-files -m)`) | `git add README.md`, `git commit -m x` | `git add <caminhos>` só com o que você mudou, ou trabalhe no worktree da frente; caminhos ilegíveis: escreva-os por extenso |
| T3 | no checkout principal: `git reset --hard/--keep/--merge`, `git clean -f` (sem `-n`), `git checkout -f`, `git checkout .` e `git restore .` (caminho que pega tudo, ou ilegível), `git switch -f/--discard-changes`, `git stash` e `git stash pop/drop/…`, `git rebase main` | `git reset --soft HEAD~1`, `git clean -n`, `git restore README.md`, `git stash list`, `git stash show`, `git rebase --abort`, `git rebase --quit` | faça isso no worktree da sua frente; no checkout principal, guarde por caminho (`git add <caminhos>` e `git commit`) ou combine com a dona das mudanças |
| T4 | escrita no worktree (ou no ramo) da frente ativa de **outra sessão viva**: subcomando do git que escreve rodado lá (`cd <wt> && git commit -am x`, `git -C <wt> commit …`; vale para `add`, `commit`, `reset`, `checkout`, `switch`, `restore`, `rebase`, `merge`, `pull`, `push`, `stash`, `clean`, `cherry-pick`, `revert`, `am`, `apply`, `mv`, `rm`, `tag`, `notes`); `git branch -d/-D/-m/-M/-f feat/alheia`; `git worktree remove/move <wt>`; `rm`, `rmdir`, `touch`, `mkdir`, `tee`, `truncate`, `chmod`, `chown`, `chgrp`, `mv`, `cp`, `install`, `ln`, `sed -i`, `perl -i`, `dd of=` com destino lá dentro; redirecionamento (`echo x > <wt>/a.txt`); edição de arquivo pela ferramenta (`Edit`, `Write`, `NotebookEdit`). Com `rm -r`, `rmdir`, `mv` e `chmod/chown/chgrp -R`, também a pasta que contém o worktree (`rm -rf <worktrees>`). Caminho com curinga do shell (`*`, `?`, `[`) recusa quando pode casar o worktree alheio, algo dentro dele ou, nos comandos de árvore, uma pasta acima dele (`rm -rf <worktrees>/*`, `cd <worktrees> && rm -rf *`, `rm -rf <worktrees>/al?eia`); `rm -rf <worktrees>/x*` passa quando nenhum worktree alheio vivo casa. O caminho é comparado depois de normalizado (link simbólico, `..`, `/private/var` × `/var` no macOS, caixa no Windows) | ler (`cat <wt>/a.txt`, `git -C <wt> status`, `cd <wt> && git log`, `git stash list`); escrever no worktree da própria frente; o worktree de frente passada, órfã ou de dona morta | escreva só no worktree da sua frente; para mexer em `alheia`, peça à sessão dona (`ah handoff`) ou, se ela morrer, `ah takeover alheia` |
| T5 | `git push` para ramo protegido (ou destino que pode atingi-lo, ou sem destino com o ramo protegido em uso, inclusive depois de `git checkout main` ou `git switch main` na mesma linha; `--all`, `--mirror`); `gh pr merge` cuja base é protegida, ou cuja base o gancho não consegue consultar em 5 segundos | `git push origin feat/carrinho` | abra um PR e peça a ordem do executivo; empurre o ramo da frente |

Exemplos (o evento simplificado; o texto é o que o agente recebe):

```
git switch main
Recusado (T1): trocar o ramo do checkout principal muda o chão das outras sessões
Faça: trabalhe no worktree de uma frente (tools/ah open <nome>); o checkout principal fica em dev

git reset --hard
Recusado (T3): git reset --hard no checkout principal descarta ou esconde trabalho que pode ser de outra sessão
Faça: faça isso no worktree da sua frente; no checkout principal, guarde por caminho (git add <caminhos> e git commit) ou combine com a dona das mudanças

echo x > <worktrees>/alheia/a.txt
Recusado (T4): <worktrees>/alheia/a.txt está no worktree da frente as-1 alheia, da sessão sessao-b, que está viva
Faça: escreva só no worktree da sua frente; para mexer em alheia, peça à sessão sessao-b (ah handoff) ou, se ela morrer, ah takeover alheia

git branch -D feat/alheia
Recusado (T4): o ramo feat/alheia é da frente as-1 alheia, da sessão sessao-b, que está viva; apagar, renomear ou mover o ramo tira o trabalho dela do lugar
Faça: deixe o ramo feat/alheia como está; para mexer nele, peça à sessão sessao-b (ah handoff) ou, se ela morrer, ah takeover alheia
```

```
$ echo '{"session_id":"abc","hook_event_name":"PreToolUse","cwd":"<projeto>","tool_name":"Bash","tool_input":{"command":"git add -A"}}' | tools/ah gancho claude-code
Recusado (T2): git add com tudo (-A, ., -u, *, a raiz) no checkout principal leva junto o trabalho de outras frentes
Faça: git add <caminhos> com só os arquivos que você mudou (e git commit sem -a), ou trabalhe no worktree da frente
$ echo $?
2
```

Sem o `session_id`, o mesmo evento sai com `Recusado (T0): o harness não conseguiu avaliar (session_id inválido: undefined).`

Variável nos **argumentos** de um comando legível não é T0: no `git add`/`git commit` do checkout principal ela cai na T2, e no destino de um push, na T5; nos demais casos passa (ver "Limites"). Fora de um `PreToolUse`, o que o gancho não entende não recusa nada: entrada que não é JSON, por exemplo, sai com código 0 e o aviso `Aviso: o harness não conseguiu tratar o evento (a entrada do agente não é JSON). Rode tools/ah doctor.`. O merge local (`git checkout main && git merge dev`) não é recusado pela T5: ele não publica nada (a T1, no checkout principal, recusa o `git checkout main`).

Arquivo de frente ilegível não faz o gancho recusar as ferramentas do agente: a T4 o pula, e o evento `estado-ilegivel` sai uma vez por conjunto de arquivos ilegíveis. Registro ilegível da dona conta como dona viva (na dúvida, protege).

`AH_GUARD=off` no começo do comando libera T1 a T5 só para ele (evento `liberacao`), mas nunca a T0. Com o harness quebrado, só passam `tools/ah …` (para rodar o `doctor`) e a edição de `.harness/config.json`.

## Vida da sessão

Cada sessão tem um registro em `<estado>/sessoes/<id>.json` e um sinal de vida em `<estado>/sessoes/<id>.sinal`, cuja data de modificação é o sinal. Os ganchos tocam o sinal no começo da sessão, a cada pedido, a cada fim de resposta e antes de cada ferramenta; os comandos `ah` que exigem sessão também o tocam.

Uma sessão está **viva** quando não foi encerrada, o sinal não venceu e, se ela tem pid gravado, o processo existe com a mesma hora de início de quando foi gravado. O prazo do sinal é `sessoes.prazoDoSinalMin` em `.harness/config.json`: padrão `120`, inteiro de 1 a 10080 minutos. Fora isso, a sessão é `morta` (`sinal vencido`, `processo não existe` ou `pid reaproveitado`), `encerrada` (`fim` ou `substituida`), `desconhecida` (sem registro) ou `ilegível`.

- **pid.** O gancho grava `AH_PID_AGENTE`, se houver, senão o processo pai do gancho (no Claude Code, o próprio agente). Os comandos `ah` só gravam pid com `AH_PID_AGENTE`. Sessão sem pid (aberta por um `ah` rodado à mão, sem `AH_PID_AGENTE`) vive só pelo sinal: aparece viva por até `prazoDoSinalMin` depois do último comando. Se o pid gravado morre enquanto os ganchos da sessão continuam chegando, ele é descartado (evento `pid-instavel`) e a vida passa a depender só do sinal.
- **Hora de início do processo.** Linux: lida de `/proc/<pid>/stat`; macOS: `ps -o lstart=` (prazo de 2 s); Windows: não é conferida (`ah doctor` avisa), e um pid reaproveitado conta como vivo até o sinal vencer.
- **Quem usa a vida:** a T4 (protege só o worktree de dona viva), o `takeover` (só assume de dona que não está viva), o `open` (frente ativa de dona viva recusa; `--para` só para sessão viva), o `close` de frente alheia, o `board`, o `sweep` e o `doctor`.

**Continuação.** O agente pode trocar de sessão sem trocar de processo: no Claude Code, o `SessionStart` com `source` `clear`, `resume`, `compact` ou `fork` é continuação; `startup` é começo novo. No começo de uma sessão, as sessões anteriores do **mesmo processo** (mesmo pid e mesma hora de início, conhecida nos dois lados) são substituídas (encerradas com `substituida`). Na continuação, a sessão nova herda as frentes delas (fica dona), o papel e o foco (eventos `substituida` e `heranca`). No começo novo, as frentes delas ficam passadas, sem dona (evento `frente-solta`), e o resumo manda `ah open <nome>`.

- O `/clear` e o `resume` no mesmo processo herdam a frente: o `SessionEnd` com esses motivos chega antes do `SessionStart` da sessão nova e não encerra a sessão velha (fica `aguardandoContinuacao`), e o começo seguinte a substitui. Se o começo não vier, a sessão velha segue sem fim, e a vida dela é a do pid e do sinal.
- Onde a hora de início não se lê (Windows, ou `ps` que falhou), não há substituição nem herança: na dúvida, o harness não encerra uma sessão que pode estar viva. A frente fica com a sessão velha até o sinal dela vencer (ninguém mais o toca); nesse meio-tempo a T4 não barra a sessão nova no worktree dela (dona no mesmo pid do agente e sem hora de início não conta como outra sessão viva), mas `handoff` e `close` recusam, porque a frente não é da sessão nova. Vencido o sinal, a frente aparece órfã, e `ah takeover <nome> --confirmado` a passa para a sessão nova.
- Uma conversa antiga retomada (`claude --resume`) depois de um `takeover` não recupera a frente: o resumo do começo diz quem está com ela, e a T4 protege a nova dona.
- `AH_PID_AGENTE` herdado por outro agente faz esse agente parecer o mesmo processo: no começo dele, a sessão de origem é substituída e perde as frentes. Por isso a variável não pode passar para outra sessão.

## Eventos

O gancho e os comandos acrescentam uma linha JSON a `<estado>/eventos.jsonl` a cada fato. Todo evento tem `tipo` e `em` (instante em UTC). A frente aparece no campo `frente` (o nome); os eventos de fechamento e o `abertura-desfeita` trazem também `nome`, com o mesmo valor (o campo que gravavam antes).

| `tipo` | Campos | Quem grava |
|---|---|---|
| `sessao-inicio` | `sessao`, `agente`, `origem` (`novo` ou `continuacao`), `modelo` | gancho, começo |
| `sessao-fim` | `sessao`, `motivo` (o `reason` do agente, quando vem), `aguardandoContinuacao: true` (no `clear` e no `resume`) | gancho, fim |
| `substituida` | `de` (sessão velha), `por` | gancho, continuação |
| `heranca` | `de`, `sessao`, `frentes` (nomes) | gancho, continuação |
| `frente-solta` | `sessao` (a velha), `frente`, `por`, `motivo: "continuacao-sem-vinculo"` | gancho, começo novo |
| `pid-instavel` | `sessao`, `pid` | gancho |
| `estado-ilegivel` | `sessao`, `caminhos` | gancho (T4) |
| `recusa` | `sessao`, `trava`, `comando` (até 500 caracteres) ou `ferramenta` e `caminho` (edição) | gancho |
| `liberacao` | `sessao`, `trava`, `comando` | gancho (`AH_GUARD=off`) |
| `recusa-de-comando` | `comando`, `sessao`, `motivo` | todo comando que recusa |
| `papel` | `sessao`, `papel`, `anterior` | `papel` |
| `nota` | `sessao`, `frente` | `nota` |
| `abertura` | `sessao` (a dona), `frente`, `id`, `tickets` | `open` |
| `abertura-retomada` | `sessao`, `frente`, `id`, `de` | `open` que toma uma abertura parada |
| `reserva` | `sessao`, `frente`, `id`, `tickets`, `fechados` | `open` |
| `reserva-desistida` | `sessao`, `frente`, `id`, `tickets`, `vencedor` | `open` que perdeu a corrida |
| `atribuicao` | `sessao` (quem chama), `para`, `frente`, `id` | `open --para` |
| `retomada` | `sessao`, `frente`, `id`, `de`, `login` | `open` de frente passada |
| `retomada-desfeita` | `sessao`, `frente`, `id` | `open` cuja retomada perdeu ou falhou |
| `passagem` | `sessao`, `frente`, `id`, `remoto` (ou `null`) | `handoff` |
| `tomada` | `sessao`, `de`, `frente`, `id` | `takeover` |
| `fechamento`, `fechamento-local` | `sessao`, `id`, `frente`, `nome` (igual a `frente`), `aberta`, `fechada` | `close` (o local, quando a frente continua em outra máquina) |
| `fechamento-sem-registro` | `sessao`, `frente`, `nome` (igual a `frente`) | `close` de foco sem registro |
| `abertura-desfeita` | `sessao`, `id`, `frente`, `nome` (igual a `frente`), `tickets` | `close` de abertura parada |
| `comentario-falhou`, `edicao-falhou` | `ticket`, `sessao` e `frente` (quando há); `guardada: false` e `motivo` quando nem a fila aceitou | operação de ticket que foi para a fila |
| `pendente-descartado` | `ticket`, `operacao`, `erro` | reenvio da fila (erro permanente) |
| `reparo` | `acao` (`apagar-sessao`, `limpar-foco`, `reconstruir-frente`, `reenviar-pendentes`) e os dados dela (`sessao`, `frente`, `id`, `enviados`, `restam`, `descartados`) | `sweep --reparar` |

## Limites

As travas pegam engano, não má-fé: elas leem o texto do comando antes de ele rodar e não acompanham o que um programa faz por conta própria.

- As travas leem o **texto** do comando. Comando montado em tempo de execução (variável, `eval`, script que chama o git por dentro, apelido do git) pode escapar; o que o gancho não consegue ler e menciona git ou gh é recusado por T0, mas não há garantia para tudo.
- No Windows nativo as travas de comando não valem (o `doctor` avisa); use o WSL2.
- O gancho mora no próprio projeto (`tools/ah` e `.claude/settings.json`). Com o checkout principal num ramo que não tem o harness (por exemplo, a `main` antes da primeira promoção da `dev`), o gancho não existe e nada é recusado. O `doctor` acusa quando o ramo base não tem o harness, e o `open` não abre frente sem ele.
- T1: `git pull --rebase` no checkout principal passa (não troca de ramo, e a T3 só olha o `git rebase`).
- T2: o `git add` que recebe os caminhos por `xargs` (`find . | xargs git add`) ou por `--pathspec-from-file`, e globs que cobrem tudo sem ser `*` solto (`*.*`, `[a-z]*`), passam.
- T4, o que passa mesmo com o worktree de outra sessão viva:
  - `git push origin :feat/alheia`, `git push origin --delete feat/alheia` e `git update-ref -d refs/heads/feat/alheia` (apagam o ramo alheio no remoto ou no local);
  - `find <wt> -delete`, `… | xargs rm`, `unlink`, `shred`, `rsync`, `tar -C <wt>`, `python -c "…"` e qualquer programa que escreva arquivo por conta própria (script, `npm`, compilador);
  - caminho relativo com pasta desconhecida (`cd "$X" && rm a`) e caminho com variável, crase ou `~` não são avaliados;
  - a leitura dos arquivos que `sed -i`, `perl -i` e `cp -t` escrevem é aproximada (opções raras podem confundir qual argumento é o arquivo).
- `cd <pasta>; <comando>`: o comando também é avaliado na pasta de antes (o `cd` pode falhar). Isso vale quando o que vem antes do `;` é uma lista simples; em `cd x && a; b`, o `b` só é avaliado no cwd do caminho em que tudo deu certo.
- T5 e troca de ramo na mesma linha: só `git checkout` e `git switch` contam (o ramo de antes continua entre os possíveis, e destino ilegível vira ramo desconhecido, que recusa o push sem destino). Ramo trocado por outro meio (`git worktree add` seguido de `cd`, script) é lido do disco na hora da avaliação, antes de o comando rodar.
- Gravar arquivo fora do worktree da própria frente (no checkout principal ou numa pasta qualquer que não seja worktree de outra sessão viva) não é recusado; a T4 só protege o worktree e o ramo das outras sessões vivas. A T6 (trabalho pesado fora da fila) é da próxima fatia.
- A reserva de ticket é aviso, não trava atômica: duas aberturas no mesmo segundo podem passar da primeira leitura; a segunda descobre ao reler o ticket, desiste e recusa (as duas podem desistir uma diante da outra e tentar de novo).
- No Windows, a hora de início do processo não é conferida: um pid reaproveitado conta como vivo até o sinal vencer, e a continuação não herda a frente (ver "Vida da sessão").
- Frente sem ticket só se retoma na mesma máquina: a passagem de outra máquina é achada pelos tickets.
- O `sweep --reparar` dá um ID novo à frente que reconstrói para um worktree solto; o original se perdeu com o estado.
- A barreira de verdade é a **proteção de ramo no servidor** (GitHub). As travas locais evitam o erro antes dele e dão ao agente a saída certa; não substituem a proteção. O `ah init` e o `ah doctor` cuidam de conferir que ela existe.

## Publicar

O trabalho entra no ramo base (`dev`) por merge local e `git push origin dev`. Para publicar em teste e em produção, abra um PR para `stage` e outro para `main`. O merge desses PRs é ato do executivo: o agente não o faz; quando a ordem vier, o executivo (ou o agente, por ordem dele) mescla com `AH_GUARD=off gh pr merge <número>` — a T5 recusa o `gh pr merge` com base protegida, e o prefixo `AH_GUARD=off` é o registro explícito de que a ordem foi dada.
