# Comandos do harness

Referência dos comandos das fatias 1 a 5, na versão 0.2.0, e das extensões (seção "Extensões", com o comando `recursos` da extensão que acompanha o harness). Os comandos são executados como `tools/ah <comando>` dentro do projeto, com exceção do `init`, executado a partir do clone do agent-harness. Os exemplos usam o projeto fictício `loja`, as pessoas `ana-souza` (sigla `as`) e `carla-dias` (sigla `cd`), os tickets `#1` a `#9` e as sessões `sessao-teste-0001`, `sessao-b-0002` e `sessao-c-0003`. As saídas foram copiadas de um projeto descartável, e `<worktrees>` designa a pasta dos worktrees das frentes.

Toda recusa segue o mesmo formato: o motivo em uma linha e, na linha seguinte, o próximo passo. A recusa de um comando `ah` sai com código 1 (`Recusado: motivo` / `Faça: …`) e também é registrada nos eventos (`recusa-de-comando`); a recusa de uma trava, emitida pelo gancho do agente, sai com código 2 (`Recusado (Tn): motivo` / `Faça: …`).

Nas mensagens, a sessão é identificada pelo id curto, formado pelos 8 primeiros caracteres (`sessao-teste-0001` vira `sessao-t`).

## Variáveis de ambiente

| Variável | O que faz |
|---|---|
| `AH_ESTADO` | pasta do estado local; substitui o padrão da máquina |
| `AH_WORKTREES` | pasta dos worktrees das frentes |
| `AH_SESSAO` | id da sessão quando o agente não o fornece (terminal comum); tem precedência sobre `CLAUDE_CODE_SESSION_ID` |
| `AH_PID_AGENTE` | pid do processo do agente desta sessão. Na falta da variável, o gancho usa o processo pai dele; os comandos `ah` só gravam pid quando ela está definida, porque o processo do `ah` termina logo. A variável não pode ser herdada por outra sessão: um agente aberto a partir desta, com o mesmo valor, é tratado como o mesmo processo, e no início dele esta sessão é substituída (ver "Vida da sessão"). Para abrir outro agente a partir desta sessão, remova a variável (`env -u AH_PID_AGENTE …`) |
| `AH_GUARD` | `AH_GUARD=off` no início de um comando libera as travas T1 a T6 apenas para esse comando, e a liberação é registrada nos eventos (`liberacao`); a T0 nunca é liberada |
| `AH_GH` | caminho do `gh` (para ensaio; um arquivo `.mjs` é executado com o Node) |
| `AH_FILA` | pasta da fila de trabalho pesado; substitui `_fila` na base do estado (a mesma pasta para todos os projetos da máquina) |
| `AH_PESADO_ANINHADO` | definida pelo `ah pesado` no ambiente do comando que ele executa, com o número da senha. Só tem efeito depois de conferida: se a senha está em execução na fila, com o `ah` dela vivo, um `ah pesado` interno roda diretamente e a T6 do gancho não recusa; caso contrário, é ignorada. Escrita como prefixo no texto do comando (`AH_PESADO_ANINHADO=3 npm run build`), não libera a T6 |
| `AH_FILA_MEMORIA_LIVRE_MB`, `AH_FILA_PAUSA_MS` | para ensaio: substituem a memória livre medida e o intervalo (100 ms) com que os comandos em espera releem a fila |

Do agente, o harness lê `CLAUDE_CODE_SESSION_ID` (id da sessão, na ausência de `AH_SESSAO`) e, no gancho, `CLAUDE_PROJECT_DIR` (um dos locais em que procura o projeto).

Ajuda: `ah --help` (ou `ah` sem argumentos) lista os comandos do núcleo e, numa seção própria, `Comandos de extensões:`, os das extensões ligadas e carregadas, cada um com o nome da extensão (`recursos   reserva, libera e lista recursos por frente (portas, bancos) (extensão recursos)`); `ah <comando> --help` (ou `-h`) mostra a descrição e o uso do comando e sai com código 0, sem executar nada e sem exigir configuração nem sessão. Depois de `--`, `--help` é tratado como argumento comum (`ah nota -- --help` grava a nota "--help").

Recusas comuns a vários comandos:

| Recusa | Quando | Faça |
|---|---|---|
| `não sei qual é a sessão` | comandos que exigem sessão, sem `AH_SESSAO` e fora do agente | `defina AH_SESSAO ou ligue o adaptador do agente`: dentro do agente, a sessão é informada pelo gancho; em execução manual, `AH_SESSAO=<nome> tools/ah <comando>` |
| `este projeto ainda não tem .harness/config.json` | todos, menos `init`, `doctor` e `gancho` | `peça ao agente: prepare meu projeto (ah init)` |
| `Configuração inválida: <campo> (<motivo>)` | idem, com o arquivo existente mas inválido | corrija `.harness/config.json` (ou rode `ah doctor`) |
| `comando desconhecido: <nome>` | qualquer nome fora da lista (inclusive comando de extensão desligada ou que não carregou) | rode `ah --help`; para extensão, confira `extensoes` em `.harness/config.json` e o item `Extensão <nome>` do `ah doctor` |
| `Opção desconhecida: …` / `Argumento a mais: …` | opção ou argumento que o comando não aceita | `use <uso do comando>` |

Exigem sessão: `open`, `nota`, `whoami`, `papel`, `handoff`, `takeover` e `close`. Não exigem: `board`, `deps`, `sweep`, `doctor`, `init`, `pesado` e o `gancho`, que recebe a sessão no evento. Um comando de extensão exige sessão salvo quando declara `requisitos: {sessao: false}`; o `recursos` exige sessão apenas em `reservar` e `liberar`. Uma sessão ainda sem registro (comandos executados à mão, sem gancho) é registrada com papel `executor` pelo primeiro `open`, `papel`, `whoami` ou `takeover --confirmado` que executar.

## init

```
ah init [--projeto <nome>] [--sigla <sigla>] [--agentes claude-code] [--teste "<comando>"] [--sem-protecao] [--sobrescrever]
```

Instala o harness no projeto atual a partir do clone do agent-harness. O comando copia o núcleo para `.harness/nucleo/` (incluindo o modelo dos ganchos, em `.harness/nucleo/modelos/claude-code/`), grava `.harness/config.json` e cria `tools/ah`, `tools/ah.cmd`, os documentos de `docs/agents/`, os ganchos do agente em `.claude/settings.json` (acrescentados aos existentes, sem apagar nenhum) e a CI em `.github/workflows/ah-ci.yml`. Sem `--projeto`, o nome do projeto é o da pasta; sem `--sigla`, o `init` propõe uma sigla a partir do login do `gh`. O `.harness/nucleo/MANIFEST.json` registra a versão, o commit do clone, a data e o sha256 de cada arquivo copiado; com esses dados, o `atualizar` identifica arquivo do núcleo alterado à mão. O caminho do clone fica em `<estado>/loja/origem.json`, fora do git, e o `doctor` compara o núcleo com ele.

- `--teste "<comando>"` liga a CI: o comando é gravado no arquivo entre aspas simples. A opção só tem efeito quando a configuração ainda não existe; depois disso, edite `ci.comandoDeTeste` em `.harness/config.json` e execute `ah init` novamente. Sem a opção, a CI é criada desligada.
- Antes de proteger um ramo, o `init` consulta a proteção no servidor e não altera ramo já protegido ("já está protegido no servidor; não alterei"). `--sem-protecao` omite essa etapa.
- O `init` pode ser repetido sem risco: os arquivos existentes são mantidos ("Mantive como estavam"), e `--sobrescrever` substitui os arquivos do harness pelos do clone. Um documento de `docs/agents/` editado à mão só é substituído com `--sobrescrever`; sem a opção, o `init` o lista em "Não sobrescrevi" e sai com código 1.
- O `init` cria os ramos ausentes (a base e os protegidos de `.harness/config.json`; no padrão, `dev`, `stage` e `main`) a partir do primeiro ramo protegido existente (no padrão, a `main`) ou, se nenhum existir, a partir do ramo atual. Não troca de ramo nem faz commit.
- Repositório cujo único ramo é `master`: o `init` cria `dev`, `stage` e `main` a partir da `master` e não a altera, porque ela não é base nem ramo protegido. Para usar a `master` como ramo protegido no lugar da `main`, altere `git.protegidos` em `.harness/config.json` e execute `ah init` novamente.
- Repositório sem commits: o `init` recusa de imediato, com código 1, sem gravar nada, porque não há commit a partir do qual criar os ramos.

Recusas e ações correspondentes:

| Recusa | Faça |
|---|---|
| `Opção desconhecida: <opção>` | use `ah init [--projeto …]` com as opções acima |
| `A opção <opção> precisa de um valor.` | escreva `<opção> <valor>` |
| `Sigla inválida: <sigla>` | use de 2 a 4 letras minúsculas, como `--sigla as` |
| `Não consegui decidir a sigla` | rode `ah init --sigla <sigla>` |
| `Agente não suportado: <nome>` | use `--agentes claude-code` |
| `Este é o próprio clone do agent-harness, não um projeto de destino.` | execute o `init` a partir da pasta do projeto |
| `Este núcleo é a cópia instalada no projeto, não o clone do agent-harness.` | rode `node <clone>/nucleo/bin/ah.mjs init` |
| `.claude/settings.json … não mexi nele` | conserte (ou apague) o arquivo e rode o `init` de novo |
| `Valor inválido para ci.comandoDeTeste` | escreva o comando numa linha só, sem `${{ }}` |
| `o repositório ainda não tem commit` | faça o primeiro commit (`git commit --allow-empty -m "começo"`) e rode `ah init` de novo |

Exemplo em um repositório que tinha apenas a `main`:

```
$ node ~/agent-harness/nucleo/bin/ah.mjs init --projeto loja --sigla as --sem-protecao
Criei:
  .harness/nucleo/ (<n> arquivos)
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

A última linha é escrita na saída de erro, e o número de arquivos do núcleo varia de uma versão para outra. O commit do harness deve ser feito no ramo base, porque as frentes são criadas a partir dele e um worktree sem `tools/ah` não tem gancho nem trava. O `init` só indica `git switch <base>` quando o checkout está em outro ramo. Se o harness já foi commitado em outro ramo (a `main`, por exemplo), o `init` repetido indica `git switch dev` e `git merge main`. Com tudo no ramo base, a saída termina com `Agora rode: tools/ah doctor`.

## atualizar

```
ah atualizar [--de <clone>] [--simular] [--forcar]
```

Substitui a cópia do núcleo (`.harness/nucleo/`) pela de um clone mais recente do agent-harness e informa o que mudou. Pode ser executado a partir do clone, como o `init` (`node <clone>/nucleo/bin/ah.mjs atualizar`, na pasta do projeto), ou a partir da cópia instalada com `--de` (`tools/ah atualizar --de <clone>`); neste caso, a substituição é feita pelo `atualizar` do clone, chamado na mesma pasta, e a saída e o código de saída são os dele. Não exige sessão.

- **Conteúdo substituído:** o mesmo conjunto que o `init` copia para `.harness/nucleo/` (núcleo, `docs/agentes/`, `docs/referencia/` e os modelos dos ganchos e do trecho do `AGENTS.md`), mais o novo `MANIFEST.json`. A cópia nova é montada ao lado (`.harness/nucleo.novo-<pid>-<hora>`) e posta no lugar por renomeação; se a troca falha no meio, a cópia antiga é restaurada. Arquivos que existiam apenas na cópia antiga são removidos.
- **`AGENTS.md`:** o trecho entre marcas é reaplicado com as mesmas garantias do `init`: o restante do arquivo é preservado, marcas incompletas ou repetidas impedem a reescrita do conteúdo existente, link simbólico não é alterado e o fim de linha é mantido.
- **Conteúdo preservado:** `.harness/config.json`, `.harness/extensoes/`, o estado (frentes, sessões, fila de pesado; o comando apenas acrescenta o evento e grava o clone em `origem.json`), `tools/ah`, `tools/ah.cmd`, `docs/agents/`, `.claude/settings.json` e a CI. Se `tools/ah`, `tools/ah.cmd` ou os ganchos de `.claude/settings.json` diferem do que o `init` do clone gravaria, o `atualizar` os lista em "Fora do núcleo, diferentes do que o init deste clone grava (não mexi)" e indica a execução do `init` do clone.
- **Arquivos alterados à mão:** a atualização é recusada quando um arquivo do núcleo difere do sha256 do manifesto, foi removido ou não consta do manifesto, porque a alteração se perderia. Com manifesto anterior à fatia 5, que não contém a lista, a lista antiga é reconstruída a partir do clone, no commit gravado no manifesto (`git ls-tree` e `git cat-file` no clone), e a comparação é a mesma. Se esse commit não está no clone (clone sem git ou sem o commit), não é possível provar que o núcleo está intacto, porque uma alteração manual já commitada não aparece no `git status`. Nesse caso, o `atualizar` recusa sem `--forcar` e lista o que o `git status` mostra como não commitado. `--forcar` descarta a alteração e informa o que descartou.
- **Versão e commit:** clone com versão menor que a instalada é recusado (`--forcar` permite voltar a ela); clone com versão menor que `harnessMinimo` da configuração é sempre recusado. Como a versão só muda em lançamento, o commit também é conferido: se o commit gravado no manifesto existe no clone e o commit atual do clone é ancestral estrito dele (`git merge-base --is-ancestor`), o clone está defasado e o `atualizar` recusa sem `--forcar`. Clone sem git, ou sem o commit instalado, fica fora dessa conferência. Mesma versão com conteúdo diferente, num commit que não é anterior, é atualizada.
- `--simular` executa as mesmas conferências e informa o que mudaria, sem gravar nada, nem mesmo o evento. Havendo impedimento, mostra a recusa e sai com código 1, como a execução real.
- Sem mudanças: `Nada a atualizar: .harness/nucleo/ já é o do clone (<versão> (<commit>)).`, código 0, sem gravação.
- Resíduos de uma troca interrompida: `.harness/nucleo.novo-*` é removido na chamada seguinte, e `.harness/nucleo.velho-*` também, se `.harness/nucleo/` existir; caso contrário, o `atualizar` recusa e informa o `mv` que restaura a cópia antiga.
- Assim como o `init`, não faz commit: termina com os comandos exatos (`git add -- .harness/nucleo AGENTS.md` e `git commit -m "chore: atualiza o agent-harness"`, no ramo base).
- Os worktrees das frentes contêm a cópia do ramo de onde foram criados, mas o `tools/ah` de qualquer worktree executa a cópia do checkout principal; por isso, a atualização vale para todas as frentes assim que é feita, sem commit.

Recusas e ações correspondentes:

| Recusa | Faça |
|---|---|
| `não sei de onde atualizar: este é o núcleo instalado no projeto, não o clone` | `tools/ah atualizar --de <clone>` (a recusa traz o clone registrado nesta máquina, se houver) |
| `<caminho> não é um clone do agent-harness` | passe em `--de` a pasta do clone, a que tem `nucleo/` e `modelos/` |
| `N arquivo(s) de .harness/nucleo/ alterado(s) à mão` (a lista sai antes, na saída de erro) | leve a mudança para o clone (ou para `.harness/extensoes/`) e repita, ou repita com `--forcar` |
| `o clone tem a versão X, mais velha que a instalada (Y)` | atualize o clone (`git pull` nele), ou repita com `--forcar` |
| `o clone está no commit X, anterior ao instalado (Y)` | atualize o clone (`git pull` nele), ou repita com `--forcar` |
| `não consigo provar que .harness/nucleo/ está intacto` | rode de um clone que tenha o commit instalado (`git fetch` nele), ou confira `git log -p -- .harness/nucleo` e repita com `--forcar` |
| `o clone tem a versão X e o projeto pede Y ou mais nova (harnessMinimo)` | atualize o clone e repita |
| `uma atualização parou no meio` | `mv .harness/nucleo.velho-… .harness/nucleo` e repita |
| `.harness/nucleo é um link simbólico` | troque o link pela pasta e repita |
| `Este é o próprio clone do agent-harness` | rode da pasta do projeto |

Exemplo com um clone que acrescenta um arquivo e altera outro:

```
$ tools/ah atualizar --de ~/agent-harness --simular
Atualizaria .harness/nucleo/ de 0.1.0 (b1ce02f) para 0.1.0 (6e1d2a9):
  Novos:
    lib/novidade.mjs
  Alterados:
    comandos/whoami.mjs
Simulação: nada foi gravado.
$ tools/ah atualizar --de ~/agent-harness
Atualizei .harness/nucleo/ de 0.1.0 (b1ce02f) para 0.1.0 (6e1d2a9):
  Novos:
    lib/novidade.mjs
  Alterados:
    comandos/whoami.mjs
Falta levar a atualização para o ramo base dev (as frentes partem dele):
  git add -- .harness/nucleo AGENTS.md
  git commit -m "chore: atualiza o agent-harness"
Depois rode: tools/ah doctor
```

Exemplo com um arquivo do núcleo alterado no projeto:

```
$ tools/ah atualizar --de ~/agent-harness
Arquivos do núcleo alterados à mão no projeto:
  comandos/board.mjs (mudou)
Recusado: 1 arquivo(s) de .harness/nucleo/ alterado(s) à mão; a atualização apagaria a mudança
Faça: leve a mudança para o clone do agent-harness (ou para .harness/extensoes/) e repita, ou repita com --forcar para descartá-la
```

## doctor

```
ah doctor [--json]
```

Confere a preparação do projeto em 23 verificações do núcleo (a última aparece apenas quando um agente se identifica), seguidas dos itens das extensões (tabela abaixo): Node 22 ou mais recente; git presente; shell POSIX; `.harness/config.json` válido; cópia do núcleo (`MANIFEST.json`); núcleo igual ao clone de origem; arquivos de estado legíveis (incluindo o esquema: registro gravado por um harness mais novo falha com "atualize o harness"); sigla sem conflito; `gh` presente e autenticado; ramo base e ramos protegidos; ganchos do Claude Code instalados; harness no ramo base (`tools/ah` e `.harness/config.json` commitados na `dev`); gancho responde (o `doctor` provoca uma recusa T5 real); hora de início do processo; gancho recusa troca de ramo (o `doctor` provoca uma recusa T1); ganchos vigiam a edição (o seletor do `PreToolUse` inclui `Edit`, `Write` e `NotebookEdit`; sem eles, a T4 não detecta a edição); comentários pendentes; frentes órfãs; proteção no servidor (uma linha por ramo protegido); CI com comando de teste; frentes com worktree (incluindo as de abertura parada); fila de pesado (configuração da máquina legível, estado em versão conhecida, senhas de processo morto); adaptador do agente em uso. Cada item recebe o estado `ok`, `aviso` (algo a melhorar, com a ação indicada) ou `FALHOU` (algo que impede o uso). O código de saída é 0 quando não há falha; avisos não alteram o código. `--json` imprime `{"itens":[{"item","estado","fazer"}],"falhas","avisos"}`.

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

Itens acrescentados na fatia 2:

| Item | Aviso ou falha | Faça |
|---|---|---|
| Hora de início do processo | aviso no Windows (`no Windows a hora de início não é conferida; um pid reaproveitado conta como vivo até o sinal vencer`) ou quando `/proc` ou `ps -o lstart` não responde | nenhuma ação; sem a hora de início, a continuação não herda a frente (ver "Vida da sessão") |
| Gancho recusa troca de ramo | falha se o ensaio de `git switch <primeiro protegido>` não sai com T1 | `rode ah init` |
| Ganchos vigiam a edição | falha se o seletor do `PreToolUse` não inclui `Edit`, `Write` ou `NotebookEdit` | `rode ah init` |
| Comentários pendentes | aviso com `N operação(ões) na fila (#n, …)`; e um aviso `linha ilegível em pendentes: linha N de <arquivo>` por linha quebrada, com o conserto | `rode ah sweep --reparar com rede`; enquanto um ticket tem operação na fila, o `ah open` não o reserva |
| Frentes órfãs | um aviso por frente ativa sem dona viva (falha, com o que fazer, se a pasta `frentes/` não se lê) | `ah takeover <nome> com a ordem do executivo` |
| Frentes com worktree | um aviso por frente (ativa ou passada, o mesmo filtro do `sweep`) cujo worktree não existe mais e por registro em abertura parada; um arquivo de frente ilegível não esconde as outras; falha, com o que fazer, se a pasta `frentes/` não se lê | `ah close <nome>` (ou recrie o worktree); `ah open <nome>` para terminar a abertura, ou `ah close <nome>` para desistir |

Itens das extensões (fatia 5), depois dos itens do núcleo:

| Item | Aviso ou falha | Faça |
|---|---|---|
| `Extensões (nenhuma ligada)` | sempre `ok`; aparece quando `extensoes` não liga nenhuma extensão | nenhuma ação |
| `Extensão <nome> (projeto)` ou `Extensão <nome> (harness)` | um item por extensão ligada, com a origem. Falha (`FALHOU  Extensão <nome>: <motivo>; <conserto>`) quando a extensão não carregou: pasta ou `extensao.mjs` ausente, erro de sintaxe, campo desconhecido no `export default`, versão da interface diferente de 1, configuração recusada por `validarConfig`, comando com nome já usado. Aviso quando a do projeto sombreia a do harness com o mesmo nome | o conserto da linha; ou desligar a extensão com `"<nome>": false` |
| `<item> (<extensão>)` | as verificações que a extensão declara (`verificacoes`), com `ok`, `aviso` ou `FALHOU`; erro lançado pela verificação vira falha | o que a linha indica |
| `Recursos sem conflito (recursos)` | da extensão `recursos`, quando ligada: falha quando o mesmo recurso (tipo e valor) está em duas frentes, caso que só ocorre com o estado editado à mão | `libere numa delas: ah recursos liberar <tipo> <valor> --frente <nome>` |

```
$ tools/ah doctor
…
ok      Extensão recursos (harness)
FALHOU  Recursos sem conflito (recursos): banco loja_cupom em as-2 cupom e as-3 frete; libere numa delas: ah recursos liberar banco loja_cupom --frente <nome>
1 falha(s), 3 aviso(s).
```

```
FALHOU  Extensão idade: versão 2 da interface; o núcleo espera a 1; atualize a extensão para a versão 1 da interface (docs/extensoes/interface.md) ou desligue-a em .harness/config.json
aviso   Extensão recursos (projeto): a extensão recursos de .harness/extensoes/ sombreia a que acompanha o harness; renomeie a do projeto se a do harness era a desejada
```

Item da fatia 3: **Fila de pesado** falha quando o `config.json` ou o `fila.json` da pasta da fila não pode ser lido ou tem versão desconhecida para este harness (`corrija o arquivo (ou apague-o para voltar aos padrões)`; `atualize o harness deste projeto`), e avisa sobre senhas de processo morto (`saem sozinhas na próxima chamada de ah pesado`).

Item da fatia 5: **Núcleo igual ao clone de origem** compara a lista de sha256 do `MANIFEST.json` com o clone registrado em `<estado>/loja/origem.json`, arquivo gravado pelo `init` e pelo `atualizar` que pertence à máquina e não ao git. O resultado é `ok` quando os dois coincidem; `ok` com "(sem clone registrado nesta máquina; não conferido)" quando não há registro (projeto preparado em outra máquina, por exemplo); e `aviso` quando o clone difere (`rode tools/ah atualizar --de <clone> (--simular mostra o que muda)`), quando o clone registrado foi removido e quando o manifesto é anterior à lista. A comparação usa o conteúdo dos arquivos e ignora o commit, de modo que um commit no clone que altera apenas os testes não gera aviso.

Exemplos de falha: `FALHOU  .harness/config.json válido: não há .harness/config.json; rode ah init`; `FALHOU  Arquivos de estado legíveis: <estado>/loja/sessoes/sessao-ruim-0009.json ilegível; apague ou conserte o arquivo`; `FALHOU  Harness no ramo base: tools/ah e .harness/config.json não estão no ramo dev, de onde as frentes partem; faça o commit do harness em dev: git switch dev e o git add/git commit que o ah init mostrou (se o commit já está em outro ramo: git switch dev && git merge <esse ramo>)`.

## open

```
ah open <nome> [--tickets 1,2] [--plano <arquivo>] [--caminhos <globs>] [--para <id curto>]
```

Abre uma frente de trabalho ou retoma uma frente passada com o mesmo nome. O nome tem de 2 a 49 caracteres (letras minúsculas, números e hífen) e começa por letra ou número. `--plano` indica um arquivo dentro do projeto (caminho relativo à raiz); `--caminhos` lista, separados por vírgula, os globs dos arquivos que a frente vai alterar (`src/**,docs/*.md`).

**Abertura.** Cria o ramo `feat/<nome>` a partir do ramo base (o do remoto, salvo quando a base local o contém e está à frente dele), um worktree próprio em `<worktrees>/<nome>` e o registro no estado (ID `as-1`, `as-2`…), e coloca a frente no foco da sessão. A abertura tem três fases. Na primeira, sob a trava do estado, o comando grava um registro `abrindo`, que reserva o id e o nome contra outro `open` e guarda o processo deste. Na segunda, fora da trava, reserva os tickets. Na terceira, de novo sob a trava, cria o worktree, e a frente passa a `ativa`. Se o `open` morre no meio, o registro fica em "abertura parada": outro `ah open <nome>` conclui a abertura com o mesmo id, e `ah close <nome>` a desfaz.

**Reserva dos tickets** (`--tickets`). Para cada ticket, o comando lê o ticket e recusa se ele já está com outra frente (marcador do harness ativo ou passado), se tem responsável diferente do usuário autenticado no `gh` ou se tem o rótulo de reserva sem frente nem responsável. Ticket fechado não é reservado (aviso), mas permanece na lista da frente. Em seguida, o comando cria o rótulo (`gh label create em-andamento --force`, o de `github.rotuloDeReserva`), comenta `Frente as-1 (carrinho) aberta por @ana-souza.` com o marcador na última linha, atribui o ticket ao usuário autenticado, aplica o rótulo e relê o ticket. Se duas aberturas reservam o mesmo ticket quase ao mesmo tempo, prevalece, em todos os tickets dela, a que comentou primeiro segundo a ordem do servidor; a outra comenta a desistência, remove-se como responsável e recusa sem criar worktree. Sem rede, o comando recusa, porque a reserva não é adiada. Ticket com operação desta máquina ainda na fila de pendentes também provoca recusa.

**Bloqueios.** Depois de abrir ou retomar, o comando consulta a última leitura guardada pelo `ah deps` (`deps.json`, sem nova chamada de rede) e, para cada ticket da frente bloqueado por outro aberto, emite na saída de erro `Aviso: o ticket #14 está bloqueado por #13 (aberta); a frente abre assim mesmo (leitura de ah deps de 2026-11-13 10:00).`. O bloqueio não provoca recusa (desenho, seção 11, "Regra geral de comportamento"). Sem leitura guardada, ou com o arquivo ilegível, não há aviso.

```
$ tools/ah open carrinho --tickets 1
Frente as-1 carrinho aberta.
Trabalhe em: <worktrees>/carrinho
```

O ticket #1 recebe o comentário, @ana-souza como responsável e o rótulo `em-andamento`:

```
Frente as-1 (carrinho) aberta por @ana-souza.

<!-- ah:frente id=as-1 nome=carrinho ramo=feat/carrinho estado=ativa login=ana-souza sessao=sessao-t tickets=1 abertaPor=ana-souza abertaEm=2026-11-12T23:19:45-03:00 sid=0bb41ce63d29136c v=1 -->
```

O marcador ocupa sempre a última linha do comentário. Tipos: `frente` (abertura), `retomada`, `tomada`, `passagem`, `fechamento` e `desistencia`; o último marcador de uma frente nos tickets indica o estado dela (`ativa`, `passada` ou `livre`).

**Retomada na mesma máquina.** Se a frente com esse nome está `passada` nesta máquina (após um `ah handoff`, uma continuação sem vínculo ou um `sweep --reparar`), o `open` a retoma em vez de abrir uma nova. O comando recria o worktree, se ele foi removido (a partir do ramo local ou do remoto), confere que ele está no ramo da frente e sem operação em andamento, atualiza o ramo a partir do remoto por fast-forward, se outra máquina o enviou, grava a sessão como dona e comenta `retomada` nos tickets. Frente com tickets é sempre conferida antes no GitHub: se outra máquina já a retomou, o comando recusa; sem rede, também recusa (`preciso do GitHub para confirmar que ninguém retomou carrinho`). `--tickets` não é aceito na retomada, porque os tickets são os da frente passada; `--plano` e `--caminhos` substituem os da frente.

```
$ tools/ah open carrinho
Frente as-1 carrinho retomada.
Trabalhe em: <worktrees>/carrinho
```

**Retomada a partir de outra máquina.** Quando não há frente nem ramo com esse nome nesta máquina e `feat/<nome>` existe no remoto, o `open` procura a passagem nos tickets abertos com o rótulo de reserva (`gh issue list --label em-andamento`) ou, com `--tickets`, apenas nos tickets indicados. Encontrada a passagem, o comando reconstrói a frente com o mesmo id, cria o worktree a partir do ramo do remoto e comenta `retomada`; a disputa com outra retomada é resolvida como na reserva (quem perde desfaz o que fez e recusa). Frente sem ticket só pode ser retomada na mesma máquina. A máquina de origem, que ainda mantém o registro `passada`, recebe a recusa ao tentar retomar:

```
$ tools/ah open carrinho
Recusado: Não retomei carrinho: a frente as-1 está ativa com @carla-dias em outra máquina.
Faça: combine com @carla-dias; o registro desta máquina ficou velho: ah close carrinho o tira (só o worktree e o registro daqui; os tickets não mudam)
```

**`--para <id curto>`.** O orquestrador abre (ou retoma) a frente em nome de outra sessão viva, que passa a ser a dona e recebe o foco na frente; o foco da sessão que executa o comando não muda. O id curto é qualquer prefixo único do id da sessão (`tools/ah board` mostra as sessões vivas). Com o id da própria sessão, o comando equivale ao `open` comum.

```
$ tools/ah open cupom --para sessao-b
Frente as-3 cupom aberta.
Dona: sessão sessao-b (aberta por esta sessão).
Trabalhe em: <worktrees>/cupom
```

**Executor e orquestrador.** A sessão executora tem uma única frente: com uma frente ativa (ou em abertura), o `open` de outra frente é recusado. A orquestradora abre frentes sem limite de quantidade (`ah papel orquestrador`).

**Avisos que não impedem a abertura** (na saída de erro): `Aviso: não consegui atualizar origin/dev; sigo com o que há aqui.` quando o `git fetch` da base falha; `Aviso: o ticket #N está fechado; não o reservei (a frente o guarda na lista).`; a lista dos arquivos modificados no checkout principal, que o `open` não altera; as três últimas notas de cada outra frente ativa ou em abertura (`Notas de as-2 frete:`); com `--caminhos`, `Atenção: as-2 frete já mudou N arquivo(s) de --caminhos: …` e `Atenção: as-1 carrinho declarou os mesmos caminhos: src/**`; na retomada, as alterações não commitadas deixadas no worktree e `o worktree … avançou até origin/feat/carrinho`.

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
| `Já existe frente com o nome carrinho.` (ou `ramo remoto`, sem passagem achada) | escolha outro nome (com ramo remoto: se é uma frente passada, `ah open carrinho --tickets <n>` com o ticket dela; se é o ramo de uma frente já fechada, confira que `git log dev..origin/feat/carrinho` vem vazio e apague-o com `git push origin --delete feat/carrinho`) |
| `Já existe ramo local com o nome carrinho.` | escolha outro nome; se é resíduo de um `ah open` interrompido, `git worktree remove <worktrees>/carrinho` (se a pasta existir) e `git branch -d feat/carrinho`, e rode `ah open` de novo |
| `O harness ainda não está no ramo dev (… não tem tools/ah); a frente nasceria sem ele.` | faça o commit do harness na `dev`: `git switch dev` e o `git add`/`git commit` que o `ah init` mostrou |
| `Não reservei: há comentário pendente para o ticket #1 nesta máquina, que o GitHub ainda não recebeu.` | rode de novo quando o GitHub responder; `ah doctor` mostra a fila |
| `Não reservei os tickets: não consegui falar com o GitHub para reservar #4 (sem rede)` | tente de novo com rede, ou abra sem `--tickets` (sem reserva) |
| `Não reservei os tickets: o ticket #1 já está reservado pela frente as-2 (frete), de @carla-dias.` | combine com @carla-dias, dona da frente as-2, ou escolha outro ticket; se a reserva ficou velha, peça a quem a fez para rodar `ah close` ou `ah handoff` |
| `… já está reservado pela frente as-2 (frete), de @carla-dias, que foi passada adiante (sem dona).` | retome essa frente com `ah open frete` em vez de abrir outra |
| `… o ticket #1 tem o rótulo em-andamento sem frente do harness nem responsável.` | se ninguém o usa, `gh issue edit 1 --remove-label em-andamento` e rode `ah open` de novo |
| `… a frente as-2 (frete), de @carla-dias, reservou #1 antes desta; desisti da reserva (…)` | combine com @carla-dias ou escolha outro ticket |
| `Não retomei carrinho: a frente as-1 está ativa com @carla-dias em outra máquina.` | combine com @carla-dias; o registro desta máquina está desatualizado: `ah close carrinho` o remove |
| `Não retomei carrinho: preciso do GitHub para confirmar que ninguém retomou carrinho (…).` | tente de novo com rede: `ah open carrinho` |
| `O ramo feat/carrinho daqui e o de origin divergiram …` | junte os dois no worktree (`git -C <worktree> pull --rebase origin feat/carrinho`, ou merge) e rode `ah open carrinho` de novo |
| `O worktree da frente as-1 carrinho não existe e o ramo feat/carrinho não está aqui nem em origin.` | se o trabalho foi para outro lugar, `ah close carrinho`; caso contrário, traga o ramo (`git fetch`) e repita |
| `Só o orquestrador abre frente para outra sessão, e esta sessão (sessao-b) é executor.` | `ah papel orquestrador` |
| `A sessão sessao-c não está viva; uma frente aberta para ela ficaria sem ninguém.` | confira as sessões vivas em `tools/ah board` |
| `A sessão sessao-b é executora e já tem a frente cupom.` | escolha outra sessão ou peça a ela `ah handoff` |
| `Não achei sessão com o id …` / `O id … é de mais de uma sessão: …` | confira o id em `tools/ah board` / use mais letras do id |

## nota

```
ah nota "<texto>"
```

Acrescenta uma nota à frente em foco da sessão. A nota aparece na última coluna do `board` e, se estiver entre as três mais recentes, no `open` das outras sessões.

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
ah board --numeros [--desde AAAA-MM-DD] [--ate AAAA-MM-DD] [--json]
```

Mostra as frentes do estado em tabela e, abaixo dela, as sessões vivas. Sem frentes, mostra `Nenhuma frente aberta.` e a linha das sessões. Colunas:

| Coluna | Conteúdo |
|---|---|
| ID, NOME | o id (`as-1`) e o nome da frente |
| DONA | id curto da sessão dona; `(morta)` se ela não está viva, `(ilegível)` se o registro dela não se lê; `—` sem dona |
| ESTADO | `ativa`; `órfã` (ativa sem dona viva: `ah takeover`; a mesma regra do `sweep`, e dona com registro ilegível não conta como órfã); `passada` (sem dona: `ah open`); `abrindo` (um `ah open` em curso); `abrindo (parada)` (o processo do `open` morreu) |
| TICKETS | `#1,#2` ou `—` |
| SOBREPÕE | IDs das outras frentes (ativas ou passadas) que mudaram algum arquivo em comum, pelo ramo desde a base e pelo worktree; `?` quando o git excedeu o prazo total (3 s) antes de conferir a frente |
| PLANO, ÚLTIMA NOTA | o plano e a última nota, cortados |

Depois da tabela, a saída traz: `Sobreposições:`, com cada arquivo e as frentes que o alteraram (até 20); `Sessões vivas: <id curto> (<papel>, <frente em foco>); …`, com `, sem processo` ao fim do parêntese da sessão sem pid gravado (sessão de um `ah` executado à mão, sem `AH_PID_AGENTE`, que vive apenas pelo sinal; a regra de vida é a mesma); `Sessões ilegíveis: …`, quando há registro de sessão ilegível; e, quando a fila de pesado da máquina não está vazia, `Fila de pesado (N vaga(s)):`, com uma linha por senha: `rodando` ou `esperando`, a senha, a classe, o tempo decorrido (desde o início ou, para quem espera, desde a chegada), o projeto e a pasta do worktree, `(processo morto)` ou `(comando órfão: sendo morto)` quando for o caso, e o comando. A fila pertence à máquina, de modo que o quadro de qualquer projeto mostra as senhas de todos os projetos. Um arquivo de frente ilegível não impede a exibição do quadro e gera um aviso na saída de erro. `--json` imprime `{"frentes","sessoes","sessoesIlegiveis","sobreposicoes","sobreposicaoIncompleta","fila"}` (`fila`: `dir`, `vagas`, `memoriaLivreMinimaMb`, `erro` e `entradas`, cada uma com o registro mais `estado`, `desde`, `haMs`, `morta` e `orfa`), cada sessão com `semProcesso`, cada frente com o registro inteiro mais `donaViva`, `donaIlegivel`, `sobrepoe`, `sobreposicaoConferida` e, em abertura, `aberturaParada`.

Cada extensão ligada pode acrescentar colunas à direita (`colunas` da interface), com o valor cortado em 30 caracteres, `—` quando vazio e `!` quando a extensão falha. No `--json`, os valores vão em `colunas: {<extensão>: {<título>: valor}}` de cada frente; o campo `extensoes` da frente é o estado gravado pelas extensões. Com a extensão `recursos` ligada:

```
ID    NOME      DONA      ESTADO  TICKETS  SOBREPÕE  PLANO  ÚLTIMA NOTA  RECURSOS
as-1  carrinho  ana-term  ativa   —        —         —      —            porta 3001
as-2  cupom     carla-te  ativa   —        —         —      —            banco loja_cupom
```

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

### Números do registro (`--numeros`)

Com `--numeros`, o `board` não mostra o quadro: agrega `<estado>/eventos.jsonl` e mostra o uso do harness no período (seção 12.5 do desenho). A agregação é local e não envia dados para fora da máquina.

| Linha | Origem nos eventos |
|---|---|
| Frentes abertas e fechadas | `abertura`; `fechamento` e `fechamento-local` (estes contados também à parte, como "só local") |
| Tempo por frente fechada (médio e mediano) | de `aberta` a `fechada` nos eventos de fechamento do período |
| Passagens de bastão, tomadas, retomadas | `passagem`, `tomada`, `retomada` |
| Sessões iniciadas, por modelo | `sessao-inicio` com `origem` `novo` (ou sem origem), contado por id de sessão distinto e agrupado por `modelo` (`não informado` quando o agente não o envia); os começos com `origem` `continuacao` (limpeza, compactação, retomada) contam à parte, como continuações, porque a limpeza no Claude Code dá id novo à mesma conversa |
| Recusas por trava | `recusa`, por `trava` (inclusive as de extensão, `<extensão>/<id>`) |
| Liberações por trava | `liberacao`, por `trava` |
| Recusas de comando | `recusa-de-comando`, por `comando` |
| Pesado | `pesado`: número de execuções, espera média e máxima (`esperaMs`) e duração média (`duracaoMs`) |

**Período.** `--desde` e `--ate` recebem datas `AAAA-MM-DD` e fecham o intervalo nos dois lados. O dia de cada evento é calculado no fuso da configuração (`fuso`), a partir do `em`. Sem período, vale o registro inteiro; com período, evento sem `em` legível fica fora. Uma frente entra no tempo médio quando o fechamento cai no período, mesmo que a abertura seja anterior.

**Linhas ilegíveis.** Uma linha de `eventos.jsonl` que não é JSON não interrompe o comando: fica fora da conta e é informada à parte (`Linhas ilegíveis em eventos.jsonl: N`), com qualquer período, porque não tem data legível.

`--json` imprime `{"periodo","frentes","passagens","tomadas","retomadas","sessoes","recusas","pesado","linhasIlegiveis"}`; os tempos vêm em milissegundos (`tempoMedioMs`, `tempoMedianoMs`, `esperaMediaMs`, `esperaMaximaMs`, `duracaoMediaMs`, `null` quando não há o que medir) e as contagens por chave em objetos (`sessoes.iniciadas`, `sessoes.continuacoes`, `sessoes.porModelo`, `recusas.porTrava`, `recusas.liberacoesPorTrava`, `recusas.deComando`).

| Recusa | Próximo passo |
|---|---|
| `data inválida em --desde: …` (ou `--ate`) | escrever a data como `AAAA-MM-DD` |
| `--desde pede uma data AAAA-MM-DD` | informar a data depois da opção |
| `período invertido: …` | trocar as datas de lugar |
| `--desde e --ate só valem com --numeros` | acrescentar `--numeros` |

```
$ tools/ah board --numeros --desde 2026-11-09 --ate 2026-11-11
Números de 2026-11-09 a 2026-11-11 (fuso America/Sao_Paulo)
Frentes: 3 abertas, 3 fechadas (1 só local)
Tempo por frente fechada: médio 7 h 0 min, mediano 6 h 0 min (3 frentes)
Passagens de bastão: 1; tomadas: 1; retomadas: 1
Sessões iniciadas: 4 (modelo-a 2, modelo-b 1, não informado 1); continuações: 2
Recusas por trava: T2 2, revisao/gerados 1
Liberações por trava: T5 1
Recusas de comando: open 2, close 1
Pesado: 2 execuções; espera média 2 s, máxima 3 s; duração média 1 min 30 s
Linhas ilegíveis em eventos.jsonl: 1 (fora da conta)
```

O exemplo corresponde ao registro de teste `teste/eventos-de-exemplo/eventos.jsonl`. A trava `revisao/gerados` desse registro é a da extensão de exemplo do guia (`docs/extensoes/como-estender.md`) e mostra o formato `<extensão>/<id>`.

## deps

```
ah deps [ticket] [--json]
```

Mostra a relação de bloqueio entre as issues do repositório. O harness apenas lê essa relação, que pertence ao GitHub (desenho, seção 11, "Ordem e dependências").

**Fonte.** A fonte principal é a API REST de dependências de issues, chamada pelo `gh api`. Contrato conferido em 13/11/2026 na documentação oficial (https://docs.github.com/en/rest/issues/issue-dependencies):

| Endpoint | Resposta |
|---|---|
| `GET /repos/{owner}/{repo}/issues/{issue_number}/dependencies/blocked_by` | 200 com lista de issues (`number`, `title`, `state`, `repository_url`, `html_url`, `issue_dependencies_summary`, entre outros); 301, 404 e 410 nos demais casos |
| `GET /repos/{owner}/{repo}/issues/{issue_number}/dependencies/blocking` | idem, com as issues que ela bloqueia |

Os dois endpoints paginam com `per_page` (padrão 30, máximo 100) e `page`; o comando pede páginas de 100. A lista das issues abertas vem de `GET /repos/{owner}/{repo}/issues?state=open` (https://docs.github.com/en/rest/issues/issues#list-repository-issues, conferido na mesma data), até 200 issues; os pull requests, que essa lista também devolve (chave `pull_request`), são descartados. Cada issue da lista traz `issue_dependencies_summary` (`blocked_by`, `blocking`, `total_blocked_by`, `total_blocking`), e o comando só consulta `blocked_by` das issues com `total_blocked_by` maior que zero (ou sem o resumo). Um bloqueio por issue de outro repositório aparece como `dono/repo#n`, identificado pelo `repository_url`.

A linha `Bloqueado por: #N[, #M]` no corpo da issue (sem diferenciar maiúsculas) é sempre aceita e se soma à API. Quando a API de dependências responde 404 ou 410 (instância sem o recurso), ela é a única fonte, e a saída informa: `Fonte: a linha "Bloqueado por:" do corpo das issues (a API de dependências do GitHub não respondeu)`.

**Sem argumento.** Lê as issues abertas e mostra, da mais nova para a mais antiga, cada uma com bloqueio pendente (aberto ou de estado desconhecido) e a árvore do que a bloqueia, em cascata (até 10 níveis, com ciclos marcados). Em seguida, `Livres para começar:` lista as issues abertas sem bloqueio pendente e sem frente no estado (ativa, passada ou abrindo), e `Sem bloqueio, já com frente:` lista as que estão livres mas já têm frente.

**Com ticket.** `ah deps <n>` mostra a issue, o que a bloqueia em cascata e o que ela bloqueia (pelo endpoint `blocking`, somado às issues da leitura guardada que a citam no corpo).

**Leitura guardada.** Toda leitura bem-sucedida grava `<estado>/deps.json` com a data (`lidoEm`). A leitura sem argumento substitui o retrato; a leitura de uma issue soma ao que estava guardado. Sem acesso ao GitHub, o comando usa o arquivo e informa a data no cabeçalho (`leitura guardada de AAAA-MM-DD HH:MM`, no fuso da configuração). O `open` usa o mesmo arquivo para avisar de tickets bloqueados.

**Leitura guardada parcial.** O arquivo gravado só por `ah deps <n>`, sem uma leitura sem argumento por baixo, é marcado como parcial (`parcial: true`). Sem acesso ao GitHub, `ah deps` sobre ele avisa que a lista de livres para começar foi calculada só com as issues visitadas e pode ser outra.

**Árvore.** Cada subárvore sai uma vez na saída inteira; a repetição aparece como `(aberta, ver acima)` no texto e com `verAcima: true` e `bloqueadaPor: []` no JSON. Assim um grafo denso de bloqueios não multiplica a saída.

`--json` imprime, sem argumento, `{"repo","lidoEm","deCache","fonte","completa","parcial","issues","livres","avisos"}` (cada issue com `numero`, `titulo`, `estado`, `frente`, `pendente` e a árvore `bloqueadaPor`) e, com ticket, `{"repo","lidoEm","deCache","fonte","ticket","bloqueadaPor","bloqueia","avisos"}`. O estado vem como `aberta`, `fechada` ou `null` (desconhecido).

| Recusa | Próximo passo |
|---|---|
| `ticket inválido: …` | usar o número da issue, como `ah deps 12` |
| `não achei a issue #99 em exemplo/loja` | conferir o número (`gh issue view 99`) |
| `sem acesso ao GitHub e sem leitura guardada (…)` | repetir com acesso ao GitHub (`gh auth status`) |
| `sem acesso ao GitHub, e a leitura guardada não tem a issue #99` | idem |
| `sem acesso ao GitHub (…) e a leitura guardada (…) está ilegível: …` | apagar o arquivo e repetir com acesso ao GitHub |

```
$ tools/ah deps
Bloqueios de exemplo/loja (lidos agora)
#14 Frete por região
  bloqueada por #13 Cupom no checkout (aberta)
    bloqueada por #12 Carrinho persistente (aberta)
      bloqueada por #11 Base do catálogo (fechada)
    bloqueada por exemplo/pagamentos#5 API de pagamento (aberta)
#13 Cupom no checkout
  bloqueada por #12 Carrinho persistente (aberta, ver acima)
  bloqueada por exemplo/pagamentos#5 API de pagamento (aberta)
Livres para começar: #15 Página de ajuda; #12 Carrinho persistente
Sem bloqueio, já com frente: #16 Revisão do layout (as-1)

$ tools/ah deps 14
Bloqueios de exemplo/loja (lidos agora)
#14 Frete por região (aberta)
Bloqueada por:
  #13 Cupom no checkout (aberta)
    #12 Carrinho persistente (aberta)
      #11 Base do catálogo (fechada)
    exemplo/pagamentos#5 API de pagamento (aberta)
Bloqueia: nada
```

**Limites.** Sem argumento, o comando faz uma chamada por página da lista e uma por issue com bloqueio; com ticket, uma por issue visitada na cascata. O quadro (`board`) não mostra bloqueios, porque isso exigiria rede ou cache a cada execução (pendência registrada no plano da fatia 5b).

## Extensões

Uma extensão acrescenta comandos, travas, verificações do `doctor`, reações ao ciclo de vida, linhas no resumo e colunas no quadro sem alterar o núcleo. A interface está em `docs/extensoes/interface.md`, e o passo a passo de criação, em `docs/extensoes/como-estender.md`. As do projeto ficam em `.harness/extensoes/<nome>/extensao.mjs`; as que acompanham o harness, em `.harness/nucleo/extensoes/<nome>/` (nesta versão, só a `recursos`).

**Configuração.** Uma extensão só carrega quando a chave dela existe em `extensoes`, no `.harness/config.json` (padrão: `{}`, nenhuma ligada):

```json
"extensoes": { "recursos": { "tipos": ["porta", "banco"] }, "revisao": true, "antiga": false }
```

| Valor | Efeito |
|---|---|
| `true` | ligada, com configuração vazia (`{}`) |
| objeto | ligada, com o objeto como configuração, conferido pela própria extensão (`validarConfig`) |
| `false` | desligada, como a ausência da chave |

O nome casa com `^[a-z][a-z0-9-]*$`; outro valor ou outro nome invalida a configuração (`Configuração inválida: extensoes (…)`). Com o mesmo nome no projeto e no harness, vale a do projeto, e o `doctor` avisa da sombra.

**Carga.** A extensão que não carrega (arquivo ausente, erro de sintaxe, forma inválida, versão da interface diferente de 1, configuração recusada, comando com nome já usado) fica de fora sem derrubar os comandos do núcleo: o `doctor` mostra a falha no item `Extensão <nome>`; `open`, `close`, `handoff`, `sweep`, `board` e o despacho de comando avisam uma vez por processo, na saída de erro (`Aviso: a extensão idade não carregou (versão 2 da interface; o núcleo espera a 1); rode ah doctor.`); o gancho segue só com as travas do núcleo.

**Comandos de extensão.** Viram `ah <nome>`, com a mesma ajuda (`ah <nome> --help`) e os mesmos requisitos dos comandos do núcleo. A recusa da extensão segue o formato comum (`Recusado: …` / `Faça: …`, código 1, evento `recusa-de-comando`). Um erro que não é recusa sai como `Recusado: a extensão <nome> falhou no comando <comando>: <erro>`, com `Faça: corrija a extensão ou desligue-a em .harness/config.json`.

**Travas de extensão.** São avaliadas depois das travas T0 a T6 e recusam como elas, com código 2: `Recusado (<extensão>/<id>): <motivo>` / `Faça: …`. `AH_GUARD=off` libera a trava de extensão num comando de shell quando todo comando simples da linha, fora o `cd`, traz o prefixo; na edição de arquivo, não há liberação.

**Fechamento.** A reação `antesDeFechar` de uma extensão pode recusar o `close` (ver "close"); as demais reações não recusam, e um erro nelas vira `Aviso: extensão <nome> falhou em <reação>: …`.

## recursos

```
ah recursos reservar <tipo> <valor> [--frente <nome>]
ah recursos liberar <tipo> <valor>|--todos [--frente <nome>]
ah recursos listar [--json]
```

Comando da extensão `recursos`, que acompanha o harness e só existe com `"recursos"` ligada em `extensoes`. Registra recursos por frente (tipo e valor, como `porta 3001` ou `banco loja_frete`) em `frente.extensoes.recursos.itens`, para que duas frentes não usem o mesmo recurso. A configuração opcional `{"tipos": [...]}` limita os tipos aceitos; sem ela, vale qualquer tipo com minúsculas, números e hífen, começando por letra. O valor tem de 1 a 100 caracteres, sem espaço.

- **`reservar`.** Grava o recurso na frente da sessão (ou na dada em `--frente`, por nome ou id). A conferência e a gravação ocorrem sob a trava das frentes; um valor já reservado por outra frente do estado (ativa, passada ou abrindo) é recusado com o nome dela. Reservar de novo o mesmo recurso na mesma frente não muda nada.
- **`liberar`.** Retira um recurso, ou todos com `--todos`. `--frente` permite liberar os recursos de uma frente de outra sessão, por exemplo antes de fechar uma frente órfã ou passada.
- **`--frente` em frente alheia.** Vale para frente passada, órfã (dona morta) ou sem dona. Frente ativa de outra sessão viva é recusada em `reservar` e `liberar`: só a sessão dona mexe nos recursos dela. A conferência ocorre sob a trava das frentes.
- **`listar`.** Mostra os recursos de cada frente que tem algum, com o estado da frente quando não é `ativa`. `--json` imprime `{"recursos":[{"id","frente","estado","tipo","valor","em"}]}`, com `em` em UTC.
- **Sessão.** `reservar` e `liberar` exigem sessão; `listar` não.
- **Ciclo.** O `close` recusa a frente que ainda tem recursos e indica o `liberar --todos`. O `handoff` não libera: a frente passada continua dona dos recursos.
- **Quadro e doctor.** A coluna `RECURSOS` do `board` lista os recursos de cada frente; o item `Recursos sem conflito (recursos)` do `doctor` acusa o mesmo recurso em duas frentes.

| Recusa | Faça |
|---|---|
| `Falta o subcomando.` / `Subcomando desconhecido: …` | use `ah recursos reservar <tipo> <valor> [--frente <nome>] \| liberar <tipo> <valor>\|--todos [--frente <nome>] \| listar [--json]` |
| `não sei qual é a sessão` (em `reservar` e `liberar`) | defina AH_SESSAO ou ligue o adaptador do agente |
| `Esta sessão não tem frente.` | abra uma com ah open <nome>, ou diga qual com --frente <nome> |
| `Não achei a frente <nome>.` | rode ah board para ver as frentes abertas |
| `A frente <id> <nome> é da sessão <s>, que está viva.` | peça à sessão dona (<s>) que reserve ou libere ela mesma; com a sessão morta (frente órfã) ou a frente passada, o --frente vale |
| `Faltam ou sobram argumentos.` / `Opção desconhecida: …` / `Argumento a mais: …` / `A opção --frente precisa do nome da frente.` | use o uso acima |
| `Tipo inválido: …` | use minúsculas, números e hífen, começando por letra (ex.: porta) |
| `Valor inválido: precisa ter de 1 a 100 caracteres, sem espaço.` | escreva o valor sem espaço (ex.: 3001) |
| `Tipo fila fora de extensoes.recursos.tipos (porta, banco).` | use um desses tipos ou acrescente fila em .harness/config.json |
| `porta 3001 já está reservado pela frente as-1 carrinho.` | escolha outro valor (ah recursos listar mostra os reservados) ou combine com a dona da frente carrinho |
| `porta 9999 não está reservado pela frente as-1 carrinho.` | ah recursos listar mostra o que cada frente tem |
| `Com --todos não vão tipo nem valor.` | use o uso acima |

```
$ AH_SESSAO=ana-terminal tools/ah recursos reservar porta 3001
Reservado: porta 3001 para a frente as-1 carrinho.
$ AH_SESSAO=carla-terminal tools/ah recursos reservar porta 3001
Recusado: porta 3001 já está reservado pela frente as-1 carrinho.
Faça: escolha outro valor (ah recursos listar mostra os reservados) ou combine com a dona da frente carrinho
$ AH_SESSAO=carla-terminal tools/ah recursos reservar banco loja_cupom
Reservado: banco loja_cupom para a frente as-2 cupom.
$ tools/ah recursos listar
as-1 carrinho: porta 3001
as-2 cupom: banco loja_cupom
$ AH_SESSAO=ana-terminal tools/ah close
Recusado: a extensão recursos não deixa fechar a frente as-1 carrinho: a frente ainda tem recursos reservados: porta 3001
Faça: libere com ah recursos liberar --todos --frente carrinho e rode ah close de novo
$ AH_SESSAO=ana-terminal tools/ah recursos liberar --todos
Liberados 1 recurso(s) da frente as-1 carrinho.
$ AH_SESSAO=ana-terminal tools/ah close
Frente as-1 carrinho fechada.
```

## whoami

```
ah whoami [--json]
```

Informa a sessão, o papel e a frente em foco: `Sessão sessao-t (executor) · frente: as-1 carrinho` (ou `frente: nenhuma`). Com `--json`: `{"sessao","papel","frente"}`; `frente` é `null` quando não há frente.

## papel

```
ah papel [orquestrador|executor]
```

Sem argumento, mostra o papel da sessão; com argumento, altera o papel. Toda sessão começa como `executor`. A executora tem uma única frente; a orquestradora abre e retoma várias, assume várias (`takeover`) e abre frente para outra sessão (`open --para`). O papel é transmitido à sessão que continua esta (ver "Vida da sessão").

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
| `Executor tem uma frente só, e esta sessão tem 2: carrinho, frete.` | mantenha frete e, nas demais, rode `ah handoff carrinho ou ah close carrinho`; depois, `ah papel executor` |

## handoff

```
ah handoff [<nome>] [--nota "<texto>"]
```

Passa a frente adiante sem fechá-la, para que outra sessão, desta máquina ou de outra, a continue. Sem `<nome>`, vale a frente em foco (ou a única da sessão). Etapas do `handoff`:

1. confere que a frente pertence a esta sessão e está ativa, e que o worktree existe, está no ramo da frente, sem operação em andamento (merge, rebase…) e sem alterações não commitadas;
2. envia o ramo ao remoto (`git push -u origin feat/<nome>`), mesmo sem commit novo; sem remoto, avisa que apenas esta máquina poderá retomar a frente;
3. sob a trava, confere que nada mudou (frente, dona, topo do ramo), marca a frente como `passada`, sem dona, guarda a nota e transfere o foco da sessão para a frente mais recente que restou (ou para nenhuma);
4. comenta a passagem em cada ticket: quem a fez, a nota, o estado deixado (ramo, últimos 3 commits fora da base, plano) e o comando de retomada. Sem rede, o comentário fica na fila e é enviado no próximo comando com rede.

A reserva é mantida: o responsável e o rótulo permanecem nos tickets até o fechamento da frente. O worktree permanece no mesmo lugar. Para retomar: `ah open <nome>`, nesta ou em outra máquina.

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
| o worktree fora do ramo da frente ou com operação em andamento | corrija o que a recusa descreve e repita |
| `O git push do ramo feat/carrinho para origin falhou: …` | resolva (rede, permissão, ramo divergente no remoto) e rode `ah handoff` de novo; nada mudou |
| `A frente carrinho mudou durante o handoff (…)` / `O ramo feat/carrinho ganhou commits durante o handoff.` | rode `ah board` / rode `ah handoff` de novo; o estado local não mudou |

## takeover

```
ah takeover <nome> [--confirmado]
```

Assume a frente ativa de uma sessão que não está viva (morta, encerrada ou sem registro). A decisão cabe a uma pessoa. Sem `--confirmado`, o comando apenas lê: mostra a dona, o motivo e a idade do sinal e recusa, pedindo a confirmação do executivo, sem registrar a sessão nem tocar o sinal (grava apenas o evento `recusa-de-comando`). Com `--confirmado`, o comando reenvia a fila de pendentes, confere nos tickets que nenhuma outra máquina está com a frente (sem rede, avisa e assume com base no registro local), comenta `Frente as-1 (carrinho) assumida pela sessão … (a anterior, …, <motivo>).` com o marcador `tomada`, atribui os tickets ao login de quem executa o comando (com o rótulo), se esse login ainda não estava na reserva, grava esta sessão como dona e lhe dá o foco. Se a sessão antiga voltar (uma conversa retomada com `--resume`), ela não recupera a frente; o resumo do início dessa sessão informa quem detém a frente.

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
| `Não assumi carrinho: nos tickets a frente as-1 foi passada por @carla-dias em outra máquina; …` | combine com @carla-dias (a frente é retomada pela passagem feita por @carla-dias, com `ah open`) |
| `Não assumi carrinho: nos tickets a frente as-1 não está ativa (…)` / `não achei o ticket #1` | confira os tickets; se a frente foi fechada em outra máquina, `ah close carrinho` |
| `A frente carrinho mudou enquanto eu conferia o GitHub.` | rode `ah takeover carrinho --confirmado` de novo |

## sweep

```
ah sweep [--reparar] [--json]
```

Lista o que está fora do lugar no estado desta máquina, sem usar a rede: uma linha por achado, no formato `- <tipo>: <detalhe>. Faça: <saída>`, ou `Nada fora do lugar.`. Sai sempre com código 0. `--json` imprime `{"reparos":[…],"achados":[{"tipo","detalhe","saida"}]}`. Extensões com a reação `noSweep` acrescentam linhas `- <extensão>: <linha>` e, no `--json`, o campo `extensoes: {<extensão>: [linhas]}` (ausente quando nenhuma extensão ligada tem `noSweep`); com `--reparar`, a extensão também conserta o que é dela.

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

`--reparar` altera apenas o estado e nunca apaga worktree, ramo nem arquivo ilegível. A saída lista os reparos feitos antes dos achados restantes (`Reparos: nada a fazer.` quando não há reparo). Reparos, cada um também gravado como evento `reparo`:

1. apaga o registro das sessões do achado `sessao-morta`;
2. remove o foco da sessão que aponta para uma frente inexistente ou de outra dona;
3. para cada `worktree-sem-frente` no padrão, reconstrói a frente como `passada`, sem dona, com `reconstruida: true`, um ID novo (o original se perdeu com o estado) e sem tickets; a frente é retomada com `ah open <nome>`. Sem sigla na máquina, avisa e não reconstrói;
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

Fecha a frente em foco da sessão sem perda de trabalho. O comando confere que o ramo foi mesclado e que não há nada solto no worktree, comenta o fechamento nos tickets e libera a reserva, remove o worktree e o ramo, grava a linha em `docs/agents/historico-das-frentes.md` (com um commit `docs(frentes): fecha …` no ramo base) e libera o foco, que passa para a frente mais recente que restou à sessão, ou para nenhuma. O ramo remoto da frente também é apagado quando existe e o topo dele está contido em `origin/dev`, a referência de acompanhamento da base, sem novo fetch: `git push origin --delete` com `--force-with-lease` no topo conhecido. Se a remoção falha, ou se o ramo remoto avançou, o comando emite um aviso com o comando para apagá-lo à mão, porque, enquanto ele existir, o `open` recusa o nome. Se o topo está contido apenas na `dev` local, o ramo remoto é mantido, com o aviso de que a base ainda não foi enviada e `Faça: git push origin dev e depois git push origin --delete feat/carrinho`. Sem `--resumo`, o resumo é o título do último commit do ramo. O comando deve ser executado no checkout principal, no ramo base, depois do merge. Frente sem commits novos (nada a mesclar) é fechada diretamente, com código 0.

- **Tickets:** cada ticket recebe o comentário `Frente as-1 (carrinho) fechada.`, com o resumo e o marcador `fechamento` (`estado=livre`). Com reserva, o comando remove o rótulo e os responsáveis atribuídos pela frente (os da reserva local e os indicados pelos marcadores do ticket, exceto os logins mantidos por outra frente ativa no ticket; o rótulo permanece se outra frente ainda o mantém). O ticket não é fechado. A operação ocorre uma única vez, mesmo que o `close` seja repetido.
- **Fila:** as operações que falham por falta de rede (comentário ou edição) entram na fila de pendentes, em ordem, e são enviadas no próximo comando com rede (todo comando que altera ticket reenvia a fila antes); o `close` avisa `o comentário ficou na fila; sai no próximo comando com rede`. Erro permanente (ticket inexistente) retira a operação da fila e a registra em `pendentes-descartados.jsonl`. `ah doctor` e `ah sweep` mostram a fila; `ah sweep --reparar` a reenvia.
- `--descartar-ignorados`: aceita a perda dos arquivos ignorados pelo git presentes no worktree (`node_modules/`, caches…); sem a opção, o `close` recusa e lista esses itens. O worktree é sempre removido com `git worktree remove` sem `--force` (comando que já apaga os ignorados): se surgir alteração ou arquivo novo entre a conferência e a remoção, o `close` recusa e não apaga nada.
- `<nome>` fecha uma frente pelo nome. Se a dona não está viva (encerrada, morta ou sem registro) ou a frente está passada, esta sessão a fecha com as mesmas conferências, e a saída informa `A frente era da sessão <id>, já encerrada; esta sessão a fechou.` (ou `que não está viva (<motivo>)`, ou `A frente estava passada pela sessão sessao-t, sem dona; esta sessão a fechou.`).
- **Frente passada com tickets:** outra máquina pode tê-la retomado. O `close` primeiro assume a frente nos tickets, pelo mesmo procedimento de disputa da retomada, e só então a fecha. Se ela está ativa em outra máquina (ou já foi fechada lá), o comando fecha apenas o registro e o worktree locais, sem comentar nem alterar os tickets e sem alterar o histórico. Sem rede, recusa.
- **Abertura parada:** com o registro `abrindo` e o processo do `open` morto, o `close` apenas desfaz a abertura: retira a reserva dos tickets em que ela pertence a esta frente (comentário `desistencia`), apaga o registro e lista o que restou para limpeza manual. Não grava linha no histórico nem faz commit. As reações das extensões também rodam nesse caminho: `antesDeFechar` antes de mexer nos tickets (pode recusar) e `depoisDeFechar` no fim, ambas com `ctx.aberturaDesfeita`.

```
$ tools/ah close --resumo "soma do carrinho"
Frente as-1 carrinho fechada.
Falta: git push origin dev
```

```
$ tools/ah close carrinho
Registro local da frente as-1 carrinho fechado: nos tickets a frente as-1 já não está passada (fechada em outra máquina). Não comentei nem mexi nos tickets, e o histórico não mudou.
```

A linha `Falta: git push …` aparece apenas quando o projeto tem remoto. O `close` não envia o ramo base ao remoto.

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
| `a extensão <nome> não deixa fechar a frente as-1 carrinho: <motivo>` | o `Faça:` da extensão (na `recursos`: `libere com ah recursos liberar --todos --frente carrinho e rode ah close de novo`); a reação `antesDeFechar` roda depois da primeira conferência de perda de trabalho, e nada foi apagado |
| `O git não removeu o worktree <wt>: … (apareceu alteração ou arquivo novo depois da conferência?)` | confira o que apareceu (`git -C <wt> status`), guarde ou apague e rode `ah close` de novo; nada foi apagado |

## pesado

```
ah pesado -- <comando>
ah pesado --classe <comando>
```

Executa um comando de trabalho pesado (build, testes ponta a ponta) pela fila da máquina: espera a vez, executa o comando, repassa a saída e devolve o código de saída dele (128 + o número do sinal, se o comando terminar por sinal). Não exige sessão. Com um único argumento depois do `--`, o texto é passado ao shell (`ah pesado -- "npm run build && npm test"`); com vários argumentos, o comando é executado diretamente, sem shell (`ah pesado -- npm run build`). `--classe` informa a classe do comando sem executá-lo e sem entrar na fila.

**Fila da máquina.** Dois projetos com o harness na mesma máquina disputam as mesmas vagas. A fila fica em `AH_FILA` ou, sem a variável, em `_fila` na base do estado (`~/.local/state/agent-harness/_fila` no Linux, `~/Library/Application Support/agent-harness/_fila` no macOS, `%LOCALAPPDATA%\agent-harness\estado\_fila` no Windows), com dois arquivos: `config.json`, da máquina, criado com os valores padrão na primeira chamada, e `fila.json`, com o estado.

```json
{ "versao": 1, "vagas": 2, "memoriaLivreMinimaMb": 4096 }
```

`vagas` vai de 1 a 64, e `memoriaLivreMinimaMb`, de 0 a 1048576. O `fila.json` tem versão de formato: se o arquivo foi gravado por um harness mais novo, o `pesado` para com `atualize o harness deste projeto`, e o `board` e o `doctor` acusam o problema.

**Classes do projeto**, em `.harness/config.json`:

```json
"pesado": {
  "classes": {
    "exclusivo": { "vagas": "todas", "padroes": ["npm run e2e*", "npx playwright*"] },
    "grande": { "vagas": 1, "padroes": ["npm run build*"] }
  }
}
```

Um padrão é uma sequência de palavras separadas por espaço e casa quando as primeiras palavras do comando casam uma a uma (`*` e `?` valem dentro da palavra; o programa é comparado sem a pasta e sem `.exe`). Num texto com vários comandos (`a && b`, `bash -c '…'`, `env X=1 …`), vale a classe mais restritiva entre as que casam. Comando que não casa com nenhuma classe recebe a mais restritiva, que é a de mais vagas (`"todas"` tem precedência). Sem classes, todo comando da fila pede todas as vagas, e a T6 não recusa nada. Chaves de `pesado` iniciadas por `_` são comentários: o `init` instala `classes` vazio e um `_exemplo` que serve de modelo.

**Ordem de execução.** A ordem de chegada é estrita, por senha: apenas o primeiro da espera pode começar, de modo que um comando que pede todas as vagas não é ultrapassado. Em contrapartida, um comando leve que chega depois dele espera, mesmo havendo vaga livre. Para começar ao lado de outro, o comando precisa caber nas vagas, ter pelo menos `memoriaLivreMinimaMb` livres e não estar no mesmo worktree de nenhum dos comandos em execução. Senha de processo morto (pid inexistente ou com outra hora de início) é descartada a cada passagem.

**Interrupção.** Com SIGINT (Ctrl-C), SIGTERM ou SIGHUP, o `pesado` encerra a árvore inteira do comando (SIGTERM ao grupo e SIGKILL depois de 3 s; no Windows, `taskkill /T /F`), só então libera a vaga e sai com 130, 143 ou 129.

**Execução aninhada.** O comando recebe `AH_PESADO_ANINHADO=<senha>`. Um `ah pesado` executado dentro dele roda diretamente, sem fila, depois de conferir que essa senha está em execução na fila com o `ah` dela vivo; um valor herdado de outra origem, ou de uma senha que já saiu, é ignorado, e o comando entra na fila. A T6 do gancho usa a mesma conferência.

**Término e comando órfão.** No término normal, o grupo do comando recebe SIGTERM antes de a vaga ser liberada, e os processos netos deixados em segundo plano terminam com ele. A entrada guarda o grupo do comando e a hora de início do líder do grupo. Se o `ah pesado` morre sem poder encerrar a árvore (`kill -9`), a entrada permanece enquanto o líder viver com a mesma hora de início; a passagem seguinte pela fila envia SIGTERM ao grupo órfão, SIGKILL depois de 3 s, e só então libera a vaga (o `board` mostra `(comando órfão: sendo morto)`). Com o líder morto ou com hora de início desconhecida ou diferente (número reaproveitado), a entrada sai e nenhum sinal é enviado; netos remanescentes escapam, mas um grupo de outro processo nunca é encerrado. Uma trava da fila cujo dono morreu vence imediatamente quando o dono é desta máquina (hostname e, no Linux, o boot e o namespace de pid gravados no `dono.json`); se o dono é de outra máquina, ou se a trava foi gravada sem essa identidade, vale o prazo de 30 s. Os comandos em espera tratam trava presa como espera adicional.

Durante a espera, o comando escreve na saída de erro `ah pesado: esperando a vez (senha 2, classe exclusivo): <motivo>` a cada motivo novo (`à frente na espera: senha 1`, `sem vaga (1 de 1 em uso; esta pede 1)`, `a senha 3 roda no mesmo worktree`, `memória livre 900 MB, abaixo do mínimo de 4096 MB para rodar ao lado de outro`) e, ao chegar a vez, o tempo de espera.

```
$ tools/ah pesado --classe npm run build:prod
grande (1 vaga(s); casou com um padrão)
$ tools/ah pesado --classe echo oi
exclusivo (todas as vagas; não casou com nenhum padrão: vale a classe mais restritiva)
```

| Recusa | Faça |
|---|---|
| `Falta o -- antes do comando` / `Opção desconhecida: …` | `use ah pesado -- <comando> (ou ah pesado --help)` |
| `Falta o comando depois do --` / `… depois de --classe` | `use ah pesado -- <comando>` |
| `O estado da fila tem formato N, que este harness não conhece` | atualize o harness deste projeto |
| `O estado da fila não se lê` | confira que nenhum `ah pesado` está rodando (`ah board`) e apague o `fila.json` |
| `Configuração da fila inválida` / `não é JSON válido` / `versão N, mais nova` | corrija o arquivo (ou apague-o para voltar aos padrões); atualize o harness |
| `Não consegui rodar o comando` | confira o nome do programa e o PATH |

## gancho

```
ah gancho claude-code
```

Não se destina a uso manual: é o comando que o `.claude/settings.json` chama em cada evento do agente (`SessionStart`, `UserPromptSubmit`, `PreToolUse` de `Bash|PowerShell|Edit|Write|NotebookEdit`, `Stop`, `SessionEnd`). O gancho lê o JSON do evento na entrada padrão, registra o evento no `eventos.jsonl` do estado, toca o sinal de vida da sessão e, antes de uma ferramenta, aplica as travas. Código 0 permite a execução da ferramenta; código 2 a recusa, e o agente recebe o texto da recusa.

**Início de sessão.** Registra a sessão com o pid do agente (`AH_PID_AGENTE` ou o processo pai do gancho) e a hora de início desse processo, executa a continuação (ver "Vida da sessão") e devolve ao agente um resumo curto: a sessão e o papel, a frente em foco e o worktree, avisos (`Sua frente as-1 carrinho está com a sessão sessao-d.`), frentes sem dona com a ação para cada uma (`Sem dona: as-2 carrinho (ah open carrinho)`; pela mesma regra do `sweep`, frente cuja dona tem registro ilegível fica de fora e gera o aviso `A frente as-2 carrinho: registro da dona ilegível (ah doctor).`), sobreposição de arquivos com outras frentes, as demais frentes, o estado do checkout principal e as regras.

```
Sessão sessao-c (executor) no harness.
Sua frente: as-2 carrinho · worktree: <worktrees>/carrinho
Outras frentes: as-1 alheia (dona sessao-b)
Base dev: checkout principal limpo.
Regras: trabalhe no worktree da sua frente; git add só por caminho; push e merge em stage e main só com ordem do executivo.
Mais: docs/agents/sessoes-paralelas.md · tools/ah board
```

**Interações** (`UserPromptSubmit`, `Stop`, `PreToolUse`) tocam o sinal. **Fim** (`SessionEnd`): encerra a sessão, exceto com `reason` `clear` ou `resume`, que anunciam uma sessão nova no mesmo processo; nesse caso, a sessão fica `aguardandoContinuacao`.

**Travas.** Recusas, com exemplos de comandos recusados e aceitos:

| Trava | O que recusa | Passa | Faça (da recusa) |
|---|---|---|---|
| T0 | comando que menciona git ou gh e não pode ser lido como shell (aspas ou parêntese sem fechar, heredoc sem fim); nome do comando vindo de variável ou crase (`$GIT push`, `` `which git` push ``) ou `eval`/`source` com variável, num texto que menciona git ou gh; evento do `PreToolUse` que o gancho não entende; `cwd` inexistente; configuração quebrada | `echo $(git rev-parse HEAD)` (o nome do comando é legível) | escreva o comando por extenso; rode `tools/ah doctor` |
| T1 | no checkout principal (ou em pasta que o gancho não determina): `git switch main`, `git switch -c/-C/--orphan/--detach`, `git switch -`, `git checkout -b/-B/--orphan/--detach`, `git checkout -`, `git checkout feat/alheia` (palavra solta que é ramo, ramo do remoto ou etiqueta, mesmo que também seja um arquivo), `gh pr checkout 3` | `git switch dev` (a base), `git checkout -- README.md`, `git checkout README.md` (arquivo que existe); qualquer troca dentro de um worktree de frente | trabalhe no worktree de uma frente (`tools/ah open <nome>`); o checkout principal fica em `dev` |
| T2 | no checkout principal: `git add -A`, `.`, `-u`, `*` solto, caminho que resolve para a raiz ou acima (`cd src && git add ..`), `git commit -a`, `git commit .`; e `git add`/`git commit` com caminho ilegível (`git add $(git ls-files -m)`) | `git add README.md`, `git commit -m x` | `git add <caminhos>` só com o que você mudou, ou trabalhe no worktree da frente; caminhos ilegíveis: escreva-os por extenso |
| T3 | no checkout principal: `git reset --hard/--keep/--merge`, `git clean -f` (sem `-n`), `git checkout -f`, `git checkout .` e `git restore .` (caminho que abrange tudo, ou ilegível), `git switch -f/--discard-changes`, `git stash` e `git stash pop/drop/…`, `git rebase main` | `git reset --soft HEAD~1`, `git clean -n`, `git restore README.md`, `git stash list`, `git stash show`, `git rebase --abort`, `git rebase --quit` | faça isso no worktree da sua frente; no checkout principal, guarde por caminho (`git add <caminhos>` e `git commit`) ou combine com a dona das mudanças |
| T4 | escrita no worktree (ou no ramo) da frente ativa de **outra sessão viva**: subcomando do git que escreve, executado nesse worktree (`cd <wt> && git commit -am x`, `git -C <wt> commit …`; vale para `add`, `commit`, `reset`, `checkout`, `switch`, `restore`, `rebase`, `merge`, `pull`, `push`, `stash`, `clean`, `cherry-pick`, `revert`, `am`, `apply`, `mv`, `rm`, `tag`, `notes`); `git branch -d/-D/-m/-M/-f feat/alheia`; `git worktree remove/move <wt>`; `rm`, `rmdir`, `touch`, `mkdir`, `tee`, `truncate`, `chmod`, `chown`, `chgrp`, `mv`, `cp`, `install`, `ln`, `sed -i`, `perl -i`, `dd of=` com destino lá dentro; redirecionamento (`echo x > <wt>/a.txt`); edição de arquivo pela ferramenta (`Edit`, `Write`, `NotebookEdit`). Com `rm -r`, `rmdir`, `mv` e `chmod/chown/chgrp -R`, também a pasta que contém o worktree (`rm -rf <worktrees>`). Caminho com curinga do shell (`*`, `?`, `[`) recusa quando pode casar o worktree alheio, algo dentro dele ou, nos comandos de árvore, uma pasta acima dele (`rm -rf <worktrees>/*`, `cd <worktrees> && rm -rf *`, `rm -rf <worktrees>/al?eia`); `rm -rf <worktrees>/x*` passa quando nenhum worktree alheio vivo casa. O caminho é comparado depois de normalizado (link simbólico, `..`, `/private/var` × `/var` no macOS, caixa no Windows) | ler (`cat <wt>/a.txt`, `git -C <wt> status`, `cd <wt> && git log`, `git stash list`); escrever no worktree da própria frente; o worktree de frente passada, órfã ou de dona morta | escreva só no worktree da sua frente; para mexer em `alheia`, peça à sessão dona (`ah handoff`) ou, se ela morrer, `ah takeover alheia` |
| T6 | comando que casa com uma classe de `pesado.classes` (em qualquer posição: `a && npm run build`, `(cd x && npm run build)`, `bash -c 'npm run build'`, `env CI=1 npm run build`) rodado fora do `ah pesado`. Sem classes configuradas, nada | `tools/ah pesado -- npm run build`; dentro de um comando da fila (`AH_PESADO_ANINHADO` no ambiente do gancho, conferida na fila; como prefixo do texto, não); comando que não casa com padrão nenhum | `tools/ah pesado -- <o comando>` |
| T5 | `git push` para ramo protegido (ou destino que pode atingi-lo, ou sem destino com o ramo protegido em uso, inclusive depois de `git checkout main` ou `git switch main` na mesma linha; `--all`, `--mirror`); `gh pr merge` cuja base é protegida, ou cuja base o gancho não consegue consultar em 5 segundos | `git push origin feat/carrinho` | abra um PR e peça a ordem do executivo; empurre o ramo da frente |

Exemplos (evento simplificado; o texto é o que o agente recebe):

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

Sem o `session_id`, o mesmo evento produz `Recusado (T0): o harness não conseguiu avaliar (session_id inválido: undefined).`

Variável nos argumentos de um comando legível não aciona a T0: no `git add`/`git commit` do checkout principal, ela é tratada pela T2, e no destino de um push, pela T5; nos demais casos, o comando passa (ver "Limites"). Fora de um `PreToolUse`, o que o gancho não entende não causa recusa: uma entrada que não é JSON, por exemplo, sai com código 0 e o aviso `Aviso: o harness não conseguiu tratar o evento (a entrada do agente não é JSON). Rode tools/ah doctor.`. O merge local (`git checkout main && git merge dev`) não é recusado pela T5, porque não publica nada; no checkout principal, a T1 recusa o `git checkout main`.

Arquivo de frente ilegível não faz o gancho recusar as ferramentas do agente: a T4 o ignora, e o evento `estado-ilegivel` é gravado uma vez por conjunto de arquivos ilegíveis. Registro ilegível da dona conta como dona viva, de modo que, na dúvida, o worktree fica protegido.

`AH_GUARD=off` no início do comando libera T1 a T6 apenas para esse comando (evento `liberacao`), mas nunca a T0. Com o harness quebrado, passam somente `tools/ah …` (para executar o `doctor`) e a edição de `.harness/config.json`.

## Vida da sessão

Cada sessão tem um registro em `<estado>/sessoes/<id>.json` e um arquivo de sinal de vida em `<estado>/sessoes/<id>.sinal`, cuja data de modificação constitui o sinal. Os ganchos tocam o sinal no início da sessão, a cada pedido, a cada fim de resposta e antes de cada ferramenta; os comandos `ah` que exigem sessão também o tocam.

Uma sessão está **viva** quando não foi encerrada, o sinal não venceu e, se há pid gravado, o processo existe com a mesma hora de início registrada. O prazo do sinal é `sessoes.prazoDoSinalMin` em `.harness/config.json`: padrão `120`, inteiro de 1 a 10080 minutos. Nos demais casos, a sessão é `morta` (`sinal vencido`, `processo não existe` ou `pid reaproveitado`), `encerrada` (`fim` ou `substituida`), `desconhecida` (sem registro) ou `ilegível`.

- **pid.** O gancho grava `AH_PID_AGENTE`, se definida, ou o processo pai do gancho (no Claude Code, o próprio agente). Os comandos `ah` só gravam pid quando `AH_PID_AGENTE` está definida. Sessão sem pid (aberta por um `ah` executado à mão, sem `AH_PID_AGENTE`) vive apenas pelo sinal e aparece viva por até `prazoDoSinalMin` depois do último comando. Se o pid gravado morre enquanto os ganchos da sessão continuam chegando, ele é descartado (evento `pid-instavel`), e a vida passa a depender apenas do sinal.
- **Hora de início do processo.** Linux: lida de `/proc/<pid>/stat`; macOS: `ps -o lstart=` (prazo de 2 s); Windows: não é conferida (`ah doctor` avisa), e um pid reaproveitado conta como vivo até o sinal vencer.
- **Componentes que consultam a vida da sessão:** a T4 (protege apenas o worktree de dona viva), o `takeover` (só assume frente de dona que não está viva), o `open` (recusa frente ativa de dona viva; `--para` aceita apenas sessão viva), o `close` de frente de outra sessão, o `board`, o `sweep` e o `doctor`.

**Continuação.** O agente pode trocar de sessão sem trocar de processo. No Claude Code, o `SessionStart` com `source` `clear`, `resume`, `compact` ou `fork` é continuação, e `startup` é início novo. No início de uma sessão, as sessões anteriores do **mesmo processo** (mesmo pid e mesma hora de início, conhecida nos dois lados) são substituídas, isto é, encerradas com `substituida`. Na continuação, a sessão nova herda as frentes delas (torna-se dona), o papel e o foco (eventos `substituida` e `heranca`). No início novo, as frentes delas ficam passadas, sem dona (evento `frente-solta`), e o resumo indica `ah open <nome>`.

- Destino executor que já tem frente ativa (por exemplo, `/resume` de uma conversa que tem frente, a partir de uma sessão que tem outra): as frentes da sessão anterior não são herdadas. Elas ficam passadas, como no `handoff` (com tickets, o comentário de passagem segue pela fila de pendentes), o papel e o foco do destino não mudam, é gravado o evento `frente-solta` com `motivo: "destino-ja-tem-frente"`, e o resumo avisa `A frente as-2 frete ficou passada; para retomar, tools/ah open frete.`. O orquestrador herda todas as frentes. Se o destino já é dono da frente em foco da sessão anterior, nada muda.
- O `/clear` e o `resume` no mesmo processo transferem a frente: o `SessionEnd` com esses motivos chega antes do `SessionStart` da sessão nova e não encerra a sessão anterior, que fica `aguardandoContinuacao`, e o início seguinte a substitui. Se o início não vier, a sessão anterior permanece sem fim, e a vida dela passa a depender do pid e do sinal.
- Onde a hora de início não pode ser lida (Windows, ou `ps` que falhou), não há substituição nem herança, porque, na dúvida, o harness não encerra uma sessão que pode estar viva. A frente fica com a sessão anterior até o sinal dela vencer, já que nenhuma sessão volta a tocá-lo. Nesse intervalo, a T4 não barra a sessão nova no worktree da frente (dona com o mesmo pid do agente e sem hora de início não conta como outra sessão viva), mas `handoff` e `close` recusam, porque a frente não pertence à sessão nova. Vencido o sinal, a frente aparece órfã, e `ah takeover <nome> --confirmado` a transfere para a sessão nova.
- Uma conversa antiga retomada (`claude --resume`) depois de um `takeover` não recupera a frente: o resumo do início informa quem a detém, e a T4 protege a nova dona.
- `AH_PID_AGENTE` herdada por outro agente faz esse agente ser tratado como o mesmo processo: no início dele, a sessão de origem é substituída e perde as frentes. Por isso, a variável não pode passar para outra sessão.

## Eventos

O gancho e os comandos acrescentam uma linha JSON a `<estado>/eventos.jsonl` a cada fato registrado. Todo evento tem `tipo` e `em` (instante em UTC). A frente aparece no campo `frente` (o nome); os eventos de fechamento e o `abertura-desfeita` trazem também `nome`, com o mesmo valor, por compatibilidade com o campo gravado em versões anteriores.

| `tipo` | Campos | Quem grava |
|---|---|---|
| `sessao-inicio` | `sessao`, `agente`, `origem` (`novo` ou `continuacao`), `modelo` | gancho, começo |
| `sessao-fim` | `sessao`, `motivo` (o `reason` do agente, quando vem), `aguardandoContinuacao: true` (no `clear` e no `resume`) | gancho, fim |
| `substituida` | `de` (sessão velha), `por` | gancho, continuação |
| `heranca` | `de`, `sessao`, `frentes` (nomes) | gancho, continuação |
| `frente-solta` | `sessao` (a velha), `frente`, `por`, `motivo` (`continuacao-sem-vinculo` no começo novo; `destino-ja-tem-frente` na continuação para executora que já tem frente) | gancho, começo |
| `pid-instavel` | `sessao`, `pid` | gancho |
| `estado-ilegivel` | `sessao`, `caminhos` | gancho (T4) |
| `recusa` | `sessao`, `trava`, `comando` (até 500 caracteres) ou `ferramenta` e `caminho` (edição); na trava de extensão, `trava` é `<extensão>/<id>` e vem também `extensao` | gancho |
| `liberacao` | `sessao`, `trava`, `comando`; na trava de extensão, também `extensao` | gancho (`AH_GUARD=off`) |
| `recusa-de-comando` | `comando` (inclusive o nome de um comando de extensão), `sessao`, `motivo` | todo comando que recusa |
| `pesado` | `sessao`, `senha`, `classe`, `esperaMs`, `duracaoMs`, `codigo` | `pesado`, ao terminar o comando |
| `atualizacao` | `sessao` (ou `null` no terminal), `de` e `para` (versões), `deCommit`, `paraCommit`, `novos`, `alterados`, `removidos` (contagens), `forcado` | `atualizar` |
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

As travas tratam enganos do agente; a má-fé está fora do escopo. Elas leem o texto do comando antes da execução e não acompanham o que um programa faz por conta própria.

- As travas leem o texto do comando. Comando montado em tempo de execução (variável, `eval`, script que chama o git internamente, apelido do git) pode escapar; o que o gancho não consegue ler e menciona git ou gh é recusado pela T0, sem garantia de cobertura completa.
- No Windows nativo, as travas de comando não valem (o `doctor` avisa); recomenda-se o WSL2.
- O gancho fica no próprio projeto (`tools/ah` e `.claude/settings.json`). Com o checkout principal num ramo que não tem o harness (por exemplo, a `main` antes da primeira promoção da `dev`), o gancho não existe e nada é recusado. O `doctor` acusa quando o ramo base não tem o harness, e o `open` não abre frente sem ele.
- T1: `git pull --rebase` no checkout principal passa (não troca de ramo, e a T3 só olha o `git rebase`).
- T2: o `git add` que recebe os caminhos por `xargs` (`find . | xargs git add`) ou por `--pathspec-from-file`, e globs que cobrem tudo sem ser `*` solto (`*.*`, `[a-z]*`), passam.
- T4: comandos que passam mesmo no worktree de outra sessão viva:
  - `git push origin :feat/alheia`, `git push origin --delete feat/alheia` e `git update-ref -d refs/heads/feat/alheia` (apagam o ramo alheio no remoto ou no local);
  - `find <wt> -delete`, `… | xargs rm`, `unlink`, `shred`, `rsync`, `tar -C <wt>`, `python -c "…"` e qualquer programa que escreva arquivo por conta própria (script, `npm`, compilador);
  - caminho relativo com pasta desconhecida (`cd "$X" && rm a`) e caminho com variável, crase ou `~` não são avaliados;
  - a leitura dos arquivos que `sed -i`, `perl -i` e `cp -t` escrevem é aproximada (opções raras podem confundir qual argumento é o arquivo).
- `cd <pasta>; <comando>`: o comando também é avaliado na pasta anterior, porque o `cd` pode falhar. Isso vale quando o trecho antes do `;` é uma lista simples; em `cd x && a; b`, o `b` só é avaliado no cwd do caminho em que todos os comandos tiveram sucesso.
- T5 e troca de ramo na mesma linha: só `git checkout` e `git switch` contam (o ramo anterior continua entre os possíveis, e destino ilegível é tratado como ramo desconhecido, que recusa o push sem destino). Ramo trocado por outro meio (`git worktree add` seguido de `cd`, script) é lido do disco na hora da avaliação, antes de o comando rodar.
- Gravar arquivo fora do worktree da própria frente (no checkout principal ou numa pasta qualquer que não seja worktree de outra sessão viva) não é recusado; a T4 protege apenas o worktree e o ramo das outras sessões vivas.
- A T6 lê o texto, como as demais travas: `npm run build` dentro de um script (`./build.sh`), de um `Makefile` ou de outro programa passa; nesse caso, inclua o script na classe (`./build.sh`) ou execute-o pela fila. Comando digitado no terminal, fora do agente, não passa por gancho.
- Fila de pesado: a memória livre é a de `os.freemem()`. No Linux, corresponde à memória disponível; no macOS, não inclui o cache que o sistema liberaria, de modo que tende a ser menor que a real e a fila serializa mais; no Windows, é a memória física livre. O consumo do comando não é medido: o mínimo configurado é a memória que precisa estar livre para começar ao lado de outro.
- Fila de pesado: o comando roda em grupo de processos próprio (POSIX), e a árvore é encerrada pelo grupo; um neto que abre sessão nova (`setsid`) escapa. No Windows, usa-se `taskkill /T /F`. Num `kill -9` no próprio `ah pesado`, no POSIX, o grupo órfão é encerrado pela passagem seguinte pela fila antes de a vaga ser liberada (um processo que inicie e termine entre o começo do comando e o registro do grupo, intervalo de alguns milissegundos, escapa); no Windows não há grupo, de modo que a senha sai como morta e o comando continua em execução, ocupando a máquina fora da fila.
- Fila de pesado: com o `ah pesado` num terminal, o comando não lê do terminal (a entrada fica fechada); por pipe ou arquivo, a entrada é repassada.
- A trava do estado (a pasta `travas/<nome>` com o `dono.json`) supõe todos os processos no mesmo sistema de arquivos local, com `rename`, `mkdir` e criação exclusiva atômicos, a data da pasta comparável com o relógio e nenhuma parada maior que o prazo (até 120 s) no meio de uma tomada; numa pasta de rede (NFS, SMB) ou com relógios diferentes, a exclusão não é garantida. Uma trava cuja pasta tem algo além do `dono.json` não vence sozinha: a recusa lista o que há e indica apagar a pasta.
- A reserva de ticket funciona como aviso e não como trava atômica: duas aberturas no mesmo segundo podem passar pela primeira leitura; a segunda percebe o conflito ao reler o ticket, desiste e recusa (as duas podem desistir uma diante da outra e tentar novamente).
- No Windows, a hora de início do processo não é conferida: um pid reaproveitado conta como vivo até o sinal vencer, e a continuação não herda a frente (ver "Vida da sessão").
- Frente sem ticket só pode ser retomada na mesma máquina, porque a passagem feita em outra máquina é localizada pelos tickets.
- O `sweep --reparar` atribui um ID novo à frente que reconstrói para um worktree solto; o original se perdeu com o estado.
- A proteção efetiva é a proteção de ramo no servidor (GitHub). As travas locais evitam o erro antes que ele ocorra e indicam ao agente a ação correta, mas não substituem a proteção do servidor. O `ah init` e o `ah doctor` conferem que ela existe.

## Publicar

O trabalho entra no ramo base (`dev`) por merge local e `git push origin dev`. A publicação em teste e em produção é feita por um PR para `stage` e outro para `main`. O merge desses PRs é ato do executivo, e o agente não o executa por iniciativa própria. Quando a ordem é dada, o executivo (ou o agente, por ordem dele) mescla com `AH_GUARD=off gh pr merge <número>`. A T5 recusa o `gh pr merge` com base protegida, e o prefixo `AH_GUARD=off` registra explicitamente que a ordem foi dada.
