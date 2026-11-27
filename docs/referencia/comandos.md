# Comandos do harness

Referência dos comandos das fatias 1 a 5, na versão 0.2.0, e das extensões (seção "Extensões", com os comandos `recursos` e `metodo` das extensões que acompanham o harness). Os comandos são executados como `tools/ah <comando>` dentro do projeto, com exceção do `init`, executado a partir do clone do agent-harness. Os exemplos usam o projeto fictício `loja`, as pessoas `ana-souza` (sigla `as`) e `carla-dias` (sigla `cd`), os tickets `#1` a `#9` e as sessões `sessao-teste-0001`, `sessao-b-0002` e `sessao-c-0003`. As saídas foram copiadas de um projeto descartável, e `<worktrees>` designa a pasta dos worktrees das frentes.

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
| `AH_CLOSE_ESPERA_DA_TRAVA_MS` | para ensaio: substitui a espera (30 s) do `close` pela trava das frentes na última fase |
| `AH_CACHE` | pasta onde o `metodo instalar` guarda as coleções de skills baixadas; substitui o cache da máquina (`~/.cache/agent-harness/colecoes` no Linux, `~/Library/Caches/agent-harness/colecoes` no macOS, `%LOCALAPPDATA%\agent-harness\colecoes` no Windows) |
| `AH_METODO_COLECOES` | só para teste: caminho de um `colecoes.json` que substitui o da extensão `metodo`; caminhos relativos dentro dele valem a partir da pasta do arquivo |

Do agente, o harness lê `CLAUDE_CODE_SESSION_ID` (id da sessão, na ausência de `AH_SESSAO`) e, no gancho, `CLAUDE_PROJECT_DIR` (um dos locais em que procura o projeto).

Ajuda: `ah --help` (ou `ah` sem argumentos) lista os comandos do núcleo e, numa seção própria, `Comandos de extensões:`, os das extensões ligadas e carregadas, cada um com o nome da extensão (`recursos   reserva, libera e lista recursos por frente (portas, bancos) (extensão recursos)`); `ah <comando> --help` (ou `-h`) mostra a descrição e o uso do comando e sai com código 0, sem executar nada e sem exigir configuração nem sessão. Depois de `--`, `--help` é tratado como argumento comum (`ah nota -- --help` grava a nota "--help"). Um comando cujos argumentos são texto livre declara `ajudaSoComoUnicoArgumento` no módulo; nele, `-h` e `--help` só pedem a ajuda como único argumento (hoje, apenas o `nota`).

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

Instala o harness no projeto atual a partir do clone do agent-harness. O comando copia o núcleo para `.harness/nucleo/` (incluindo o modelo dos ganchos, em `.harness/nucleo/modelos/claude-code/`), grava `.harness/config.json` e cria `tools/ah`, `tools/ah.cmd`, os documentos de `docs/agents/`, os ganchos do agente em `.claude/settings.json` (acrescentados aos existentes, sem apagar nenhum) e a CI em `.github/workflows/ah-ci.yml`. Com `claude-code` em `agentes`, garante também um `CLAUDE.md` com a linha `@AGENTS.md`: o Claude Code ignora o `AGENTS.md` quando existe um `CLAUDE.md`, e a linha importa o `AGENTS.md` para dentro dele. Sem `CLAUDE.md`, o `init` o cria só com a linha; com um `CLAUDE.md` sem a linha, a acrescenta no topo, seguida de uma linha em branco, e mantém o resto e o fim de linha (CRLF ou LF); se alguma linha já é `@AGENTS.md`, não muda nada. Link simbólico não é seguido: se ele aponta para o próprio `AGENTS.md` do projeto (`ln -s AGENTS.md CLAUDE.md`), está certo e o `init` não faz nada; se aponta para outro arquivo, o `init` avisa (`CLAUDE.md é um link simbólico; não mexi nele`, com `Faça: acrescente a linha @AGENTS.md ao arquivo de destino do link`). Sem `--projeto`, o nome do projeto é o da pasta; sem `--sigla`, o `init` propõe uma sigla a partir do login do `gh`. O `.harness/nucleo/MANIFEST.json` registra a versão, o commit do clone, a data e o sha256 de cada arquivo copiado; com esses dados, o `atualizar` identifica arquivo do núcleo alterado à mão. O caminho do clone fica em `<estado>/loja/origem.json`, fora do git, e o `doctor` compara o núcleo com ele.

- `--teste "<comando>"` liga a CI: o comando é gravado no arquivo entre aspas simples. A opção só tem efeito quando a configuração ainda não existe, porque o `init` nunca reescreve `.harness/config.json`. Com a configuração já existente, `--teste` com valor diferente de `ci.comandoDeTeste` é recusado antes de qualquer gravação; nesse caso, edite `ci.comandoDeTeste` em `.harness/config.json` e execute `ah init` novamente (o `init` reescreve a CI com o comando da configuração). Com o mesmo valor, a opção é aceita. Sem a opção, a CI é criada desligada.
- `--projeto` e `--agentes` seguem a mesma regra: com a configuração já existente, um valor diferente do gravado (`projeto`, ou a lista `agentes`, sem contar ordem e espaços) é recusado antes de qualquer gravação, e o mesmo valor é aceito.
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
| `a configuração já existe e o init não a reescreve: --teste … não seria aplicado` | ponha o comando em `ci.comandoDeTeste` no `.harness/config.json` e rode `ah init` de novo |
| `a configuração já existe e o init não a reescreve: --projeto … não seria aplicado` | rode sem `--projeto`, ou mude `projeto` no `.harness/config.json` (o estado local fica na pasta do nome antigo) |
| `a configuração já existe e o init não a reescreve: --agentes … não seria aplicado` | ponha a lista em `agentes` no `.harness/config.json` e rode `ah init` de novo; o `init` instala os ganchos dos agentes de lá |
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
- **`CLAUDE.md`:** com `claude-code` em `agentes`, a linha `@AGENTS.md` é reaplicada com as mesmas regras do `init` (cria o arquivo que falta, acrescenta a linha no topo, não duplica, não segue link simbólico); o relatório diz `Reapliquei a linha @AGENTS.md em CLAUDE.md.`
- **Conteúdo preservado:** `.harness/config.json`, `.harness/extensoes/`, o estado (frentes, sessões, fila de pesado; o comando apenas acrescenta o evento e grava o clone em `origem.json`), `tools/ah`, `tools/ah.cmd`, `docs/agents/`, `.claude/settings.json` e a CI. Se `tools/ah`, `tools/ah.cmd` ou os ganchos de `.claude/settings.json` diferem do que o `init` do clone gravaria, o `atualizar` os lista em "Fora do núcleo, diferentes do que o init deste clone grava (não mexi)" e indica a execução do `init` do clone.
- **Arquivos alterados à mão:** a atualização é recusada quando um arquivo do núcleo difere do sha256 do manifesto, foi removido ou não consta do manifesto, porque a alteração se perderia. Com manifesto anterior à fatia 5, que não contém a lista, a lista antiga é reconstruída a partir do clone, no commit gravado no manifesto (`git ls-tree` e `git cat-file` no clone), e a comparação é a mesma. Se esse commit não está no clone (clone sem git ou sem o commit), não é possível provar que o núcleo está intacto, porque uma alteração manual já commitada não aparece no `git status`. Nesse caso, o `atualizar` recusa sem `--forcar` e lista o que o `git status` mostra como não commitado. `--forcar` descarta a alteração e informa o que descartou. Nos arquivos de texto (sem byte nulo, o mesmo critério do git), o sha256 do manifesto e da conferência é calculado com CRLF convertido em LF, de modo que um checkout com `core.autocrlf=true` não aparece como alteração à mão; nos binários, o sha256 é o exato.
- **Versão e commit:** clone com versão menor que a instalada é recusado (`--forcar` permite voltar a ela); clone com versão menor que `harnessMinimo` da configuração é sempre recusado. Como a versão só muda em lançamento, o commit também é conferido: se o commit gravado no manifesto existe no clone e o commit atual do clone é ancestral estrito dele (`git merge-base --is-ancestor`), o clone está defasado e o `atualizar` recusa sem `--forcar`. Clone sem git, ou sem o commit instalado, fica fora dessa conferência. Mesma versão com conteúdo diferente, num commit que não é anterior, é atualizada.
- `--simular` executa as mesmas conferências e informa o que mudaria, sem gravar nada, nem mesmo o evento. Havendo impedimento, mostra a recusa e sai com código 1, como a execução real, mas sem registrar o evento `recusa-de-comando`.
- **Duas execuções ao mesmo tempo:** a conferência e a troca rodam sob a trava `atualizar` do estado do projeto (`<estado>/loja/travas/atualizar`); um segundo `atualizar`, inclusive com `--simular`, espera até 30 s que o primeiro termine e, depois disso, recusa com a mensagem da trava presa.
- Sem mudanças: `Nada a atualizar: .harness/nucleo/ já é o do clone (<versão> (<commit>)).`, código 0, sem gravação.
- Resíduos de uma troca interrompida: `.harness/nucleo.novo-*` é removido na chamada seguinte, e `.harness/nucleo.velho-*` também, se `.harness/nucleo/` existir; caso contrário, o `atualizar` recusa e informa o `mv` que restaura a cópia antiga.
- Assim como o `init`, não faz commit: termina com os comandos exatos (`git add -- .harness/nucleo AGENTS.md CLAUDE.md` e `git commit -m "chore: atualiza o agent-harness"`, no ramo base).
- **Intervalo da troca:** entre as duas renomeações há alguns milissegundos sem `.harness/nucleo/`. Não há trava entre o `atualizar` e as sessões vivas: um gancho ou um `tools/ah` que comece exatamente nesse intervalo recusa (`Recusado: não achei .harness/nucleo`, código 2), e a ação do agente não é executada. Basta repetir a ação.
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
  git add -- .harness/nucleo AGENTS.md CLAUDE.md
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

Confere a preparação do projeto em 25 verificações do núcleo (a última aparece apenas quando um agente se identifica), seguidas dos itens das extensões (tabela abaixo): Node 22 ou mais recente; git presente; shell POSIX; `.harness` é uma pasta do projeto (link simbólico falha: o gancho recusa tudo enquanto ele existir, salvo o `tools/ah doctor`); `.harness/config.json` válido (inclusive o `fuso`, conferido com `Intl.DateTimeFormat`); cópia do núcleo (`MANIFEST.json`); núcleo igual ao clone de origem; arquivos de estado legíveis (incluindo o esquema: registro gravado por um harness mais novo falha com "atualize o harness"); sigla sem conflito; `gh` presente e autenticado; ramo base e ramos protegidos; `CLAUDE.md` aponta para o `AGENTS.md` (só com `claude-code` em `agentes`: aviso quando falta o arquivo ou a linha `@AGENTS.md`, com `rode ah init`; `ok` quando o `CLAUDE.md` é link para o `AGENTS.md`, aviso quando é link para outro arquivo; aviso também quando o `CLAUDE.md` tem conteúdo além da linha, porque o Codex e o OpenCode não leem o `CLAUDE.md` e esse conteúdo deve ir para o `AGENTS.md`); ganchos do Claude Code instalados; harness no ramo base (`tools/ah` e `.harness/config.json` commitados na `dev`); gancho responde (o `doctor` provoca uma recusa T5 real); hora de início do processo; gancho recusa troca de ramo (o `doctor` provoca uma recusa T1); ganchos vigiam a edição (o seletor do `PreToolUse` inclui `Edit`, `Write` e `NotebookEdit`; sem eles, a T4 não detecta a edição); comentários pendentes; frentes órfãs; proteção no servidor (uma linha por ramo protegido); CI com comando de teste; frentes com worktree (incluindo as de abertura parada); fila de pesado (configuração da máquina legível, estado em versão conhecida, senhas de processo morto); adaptador do agente em uso. Cada item recebe o estado `ok`, `aviso` (algo a melhorar, com a ação indicada) ou `FALHOU` (algo que impede o uso). O código de saída é 0 quando não há falha; avisos não alteram o código. `--json` imprime `{"itens":[{"item","estado","fazer"}],"falhas","avisos"}`.

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

**Arquivo de frente ilegível.** Um arquivo de outra frente que não se lê não impede o `open`: o comando emite `Aviso: arquivo de frente ilegível: <estado>/loja/frentes/<nome>.json (rode ah doctor)` e segue sem ele, que fica como está (fora da regra do executor e da conta do próximo id). O `open` com o nome da frente ilegível recusa com `O arquivo de estado não é JSON válido: …` e `Faça: rode ah doctor`.

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
| `A frente as-1 carrinho está sendo fechada agora (processo <pid>).` | espere esse `ah close` terminar (o quadro mostra `fechando` enquanto ele roda); se a frente continuar no quadro, repita |
| `A frente as-1 carrinho está com o fechamento parado: os tickets já receberam (ou estavam recebendo) o comentário de fechamento.` | termine com `ah close carrinho`, que não comenta de novo. Vale para a frente passada e é conferido antes de qualquer rede |
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

Acrescenta uma nota à frente em foco da sessão. A nota aparece na última coluna do `board` e, se estiver entre as três mais recentes, no `open` das outras sessões. Os argumentos formam o texto, com ou sem aspas: `-h` e `--help` só mostram a ajuda quando são o único argumento (`ah nota corrigir o -h do parser` grava a nota), e `ah nota -- --help` grava o texto `--help`.

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
| ESTADO | `ativa`; `órfã` (ativa sem dona viva: `ah takeover`; a mesma regra do `sweep`, e dona com registro ilegível não conta como órfã); `passada` (sem dona: `ah open`); `abrindo` (um `ah open` em curso); `abrindo (parada)` (o processo do `open` morreu); `fechando` (um `ah close` em curso, na fase de rede); `fechamento parado` (um `close` começou a comentar o fechamento nos tickets e parou depois, por recusa, trava ocupada ou processo morto: `ah close <nome>` termina sem comentar de novo; o `--json` traz `fechamentoComentado: true`) |
| TICKETS | `#1,#2` ou `—` |
| SOBREPÕE | IDs das outras frentes (ativas ou passadas) que mudaram algum arquivo em comum, pelo ramo desde a base e pelo worktree; `?` quando o git excedeu o prazo total (3 s) antes de conferir a frente |
| PLANO, ÚLTIMA NOTA | o plano e a última nota, cortados |
| BLOQUEIOS | só com leitura guardada do `ah deps` (`deps.json` no estado): o que bloqueia os tickets da frente e está aberto (`#3`, `dono/outro#7`), ou `—`; sem rede, e sem leitura guardada a coluna não aparece |

Depois da tabela, a saída traz: `Sobreposições:`, com cada arquivo e as frentes que o alteraram (até 20); com a coluna BLOQUEIOS, `Bloqueios: leitura de ah deps de AAAA-MM-DD HH:MM <fuso> (rode ah deps para atualizar).`, no fuso da configuração, com o nome do fuso; `Sessões vivas: <id curto> (<papel>, <frente em foco>); …`, com `, sem processo` ao fim do parêntese da sessão sem pid gravado (sessão de um `ah` executado à mão, sem `AH_PID_AGENTE`, que vive apenas pelo sinal; a regra de vida é a mesma); `Sessões ilegíveis: …`, quando há registro de sessão ilegível; e, quando a fila de pesado da máquina não está vazia, `Fila de pesado (N vaga(s)):`, com uma linha por senha: `rodando` ou `esperando`, a senha, a classe, o tempo decorrido (desde o início ou, para quem espera, desde a chegada), o projeto e a pasta do worktree, `(processo morto)` ou `(comando órfão: sendo morto)` quando for o caso, e o comando. A fila pertence à máquina, de modo que o quadro de qualquer projeto mostra as senhas de todos os projetos. Um arquivo de frente ilegível não impede a exibição do quadro e gera um aviso na saída de erro. `--json` imprime `{"frentes","sessoes","sessoesIlegiveis","sobreposicoes","sobreposicaoIncompleta","fila"}` (`fila`: `dir`, `vagas`, `memoriaLivreMinimaMb`, `erro` e `entradas`, cada uma com o registro mais `estado`, `desde`, `haMs`, `morta` e `orfa`), cada sessão com `semProcesso`, cada frente com o registro inteiro mais `donaViva`, `donaIlegivel`, `sobrepoe`, `sobreposicaoConferida`, em abertura `aberturaParada`, com a marca de um `close` `fechamentoEmCurso` e, com leitura guardada do `ah deps`, `bloqueios` (e `bloqueiosLidosEm` no objeto de fora).

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

**Leitura guardada.** Toda leitura bem-sucedida grava `<estado>/deps.json` com a data (`lidoEm`). A leitura sem argumento substitui o retrato; a leitura de uma issue soma ao que estava guardado. Sem acesso ao GitHub, o comando usa o arquivo e informa a data no cabeçalho (`leitura guardada de AAAA-MM-DD HH:MM America/Sao_Paulo`): a hora está no fuso da configuração, cujo nome vem logo depois dela, enquanto o `lidoEm` gravado fica em UTC. O `open` usa o mesmo arquivo para avisar de tickets bloqueados, com a data no mesmo formato.

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

Uma extensão acrescenta comandos, travas, verificações do `doctor`, reações ao ciclo de vida, linhas no resumo e colunas no quadro sem alterar o núcleo. A interface está em `docs/extensoes/interface.md`, e o passo a passo de criação, em `docs/extensoes/como-estender.md`. As do projeto ficam em `.harness/extensoes/<nome>/extensao.mjs`; as que acompanham o harness, em `.harness/nucleo/extensoes/<nome>/`:

| Extensão | Para que serve | Referência |
|---|---|---|
| `recursos` | Registro de recursos por frente (porta, banco), para duas frentes não usarem o mesmo | "recursos" |
| `metodo` | Instala e atualiza as skills do método com versão fixada, escreve o `AGENTS.md` de princípios e confere tudo no `doctor` | "metodo" |
| `registros` | Leva o diário da execução por subagentes para o ticket da frente e o devolve na retomada | "registros" |
| `modelo` | Traduz os níveis `alto`, `medio` e `leve` do plano em modelo e esforço de cada agente | "modelo" |
| `wiki` | Confere a wiki do projeto (a invariante de evidência) e conversa com o resto do ciclo | "wiki" |
| `ambiente` | Banco e portas por worktree, criados na abertura e apagados no fechamento | "ambiente" |
| `migracao` | Reserva do número de migração entre frentes | "migracao" |
| `prova` | Prova por árvore: grava a árvore testada para não repetir o teste ponta a ponta | "prova" |
| `orquestracao` | Candidatos para a orquestração: o que está livre para começar | "orquestracao" |

A preparação do projeto (README, "Instalar num projeto", passo 5) liga `metodo`, `registros` e `modelo`; as outras se ligam em `extensoes`, no `.harness/config.json`, quando o projeto precisar delas.

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

## metodo

```
ah metodo instalar [--forcar]
ah metodo atualizar [--colecao <nome>] [--para <tag|commit>] [--simular] [--forcar]
```

Comando da extensão `metodo`, que acompanha o harness e só existe com ela ligada em `extensoes`, com a lista dos agentes que o projeto usa: `"metodo": {"agentes": ["claude-code", "codex"]}` (valem `claude-code`, `codex` e `opencode`). Sem `agentes`, ou com agente desconhecido, a extensão não carrega: `ah metodo` sai como `comando desconhecido`, com o aviso `a extensão metodo não carregou (configuração recusada: …)`, e o `doctor` mostra a falha no item `Extensão metodo`. Não exige sessão.

O `instalar` copia para o projeto as skills das coleções fixadas em `.harness/nucleo/extensoes/metodo/colecoes.json` (origem git, commit e lista de skills de cada uma) e as skills do próprio harness (`preparar-projeto`; uma skill ligada a uma extensão só entra com ela ligada). Passos:

1. **Busca.** Cada coleção é buscada no commit fixado numa pasta de cache da máquina (`AH_CACHE`), nunca no projeto; um clone raso por coleção, reaproveitado enquanto o commit não muda. O git roda sem pedir senha no terminal. Uma origem inacessível recusa antes de qualquer escrita.
2. **Cópia.** Cada skill da lista vai para a pasta de cada agente (`claude-code` → `.claude/skills/`; `codex` e `opencode` → `.agents/skills/`), com a licença da coleção (`LICENSE`) e com o bit de execução dos scripts. A pasta da skill é recriada inteira quando difere da origem no conteúdo ou no bit de execução (um script que perdeu o bit é recopiado); skill que saiu da lista (ou de extensão desligada, ou de agente retirado) é apagada quando está igual à trava, e mantida, com aviso, quando tem mudança à mão.
3. **Trava.** `.harness/skills.lock.json` registra por coleção a origem, o commit, a versão, as skills e o sha256 de cada arquivo copiado, e as pastas de destino. As skills do harness entram com a origem `agent-harness`, `commit: null` e a versão do harness.
4. **Mudança à mão.** Um arquivo de skill que difere da trava e da versão nova (inclusive arquivo acrescentado na pasta da skill), um link simbólico dentro da pasta da skill ou a pasta da skill que é ela mesma um link não é sobrescrito: o comando recusa e lista os arquivos (`(link simbólico)` nos links); `--forcar` descarta as mudanças (o link é removido; o destino dele fica intacto). Com o disco igual à trava, um commit novo na origem é instalado sem recusa. A trava só aceita como destino `.claude/skills` e `.agents/skills`; outro valor a torna ilegível.
5. **AGENTS.md.** O trecho do método entre as marcas `<!-- agent-harness/metodo: início … -->` e `<!-- agent-harness/metodo: fim -->`, com as mesmas regras do trecho do núcleo: só o texto entre as marcas é reescrito. Ele diz onde estão as skills e a trava, que `superpowers:<nome>` e `mattpocock-skills:<nome>` valem como a skill `<nome>` do projeto, e o que usar no lugar das skills citadas que não foram instaladas. `AGENTS.md` que é link simbólico para um arquivo dentro do projeto não é alterado (aviso `AGENTS.md é um link simbólico; não mexi nele`, com `Faça: copie para o arquivo de destino do link o trecho de .harness/nucleo/extensoes/metodo/modelos/agents-metodo.md`); link que aponta para fora do projeto recusa (`o destino sai do projeto: AGENTS.md`).
6. **Arquivos do projeto.** `docs/agents/issue-tracker.md`, `docs/agents/triage-labels.md` e `docs/agents/domain.md` (a preparação que as skills do Matt Pocock esperam) são copiados só quando faltam; depois, são do projeto.
7. **Rótulos.** Com `github.repo` na configuração, lista os rótulos do repositório (`gh label list`) e cria os de triagem que faltam, cada um com cor fixa e descrição; os que já existem não são recriados nem repintados. Os nomes vêm da coluna `Label in our tracker` da tabela de `docs/agents/triage-labels.md`; se a tabela não traz os cinco papéis, valem os nomes padrão `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human` e `wontfix`. A lista é consultada a cada execução. Falha do `gh` vira aviso (`não criei os rótulos de triagem no GitHub`, com `Faça:`) e o comando termina com código 0.
8. **Commit.** Termina com os comandos do commit no ramo base, como o `init`. O `git add` leva também o `.harness/config.json`, onde as extensões do método foram ligadas: sem ele na `dev`, as frentes nasceriam sem o método. Sem nada a mudar, diz `Nada a mudar: as skills já estão como a trava.`

| Recusa | Faça |
|---|---|
| `não consegui buscar a coleção <nome> (<origem>): <erro do git>` | confira a conexão com a internet e o endereço da origem e rode tools/ah metodo instalar de novo; nada foi gravado |
| `a instalação sobrescreveria arquivos de skill mudados à mão (.claude/skills: alfa/SKILL.md)` | guarde as suas mudanças fora da pasta da skill (ou numa skill de outro nome) e rode tools/ah metodo instalar de novo; para descartá-las, rode tools/ah metodo instalar --forcar |
| `a coleção <nome> não tem a pasta da skill <skill> (<pasta>)` | na coleção `agent-harness`: a cópia do harness está incompleta, rode tools/ah atualizar a partir do clone; nas outras: confira o commit em colecoes.json |
| `a trava .harness/skills.lock.json está ilegível: …` | recupere-a do git (git checkout -- .harness/skills.lock.json), ou apague-a, e rode tools/ah metodo instalar de novo |
| `o destino sai do projeto: <caminho>` | remova o link simbólico no caminho e rode tools/ah metodo instalar de novo |
| `Opção desconhecida: …` / `Argumento a mais: …` / `Falta o subcomando.` / `Subcomando desconhecido: …` | use ah metodo instalar [--forcar] \| atualizar |

```
$ tools/ah metodo instalar
Instalei 1 skill(s) de agent-harness (0.2.0) em .claude/skills, .agents/skills.
Instalei 7 skill(s) de mattpocock-skills (1.3.2, d1478fc) em .claude/skills, .agents/skills.
Instalei 8 skill(s) de superpowers (7.0.2, 22f0b46) em .claude/skills, .agents/skills.
Criei docs/agents/issue-tracker.md.
Criei docs/agents/triage-labels.md.
Criei docs/agents/domain.md.
Escrevi o trecho do método no AGENTS.md.
Gravei a trava .harness/skills.lock.json.
Falta levar o método para o ramo base dev (as frentes partem dele):
  git add -- .harness/skills.lock.json .harness/config.json .claude/skills .agents/skills AGENTS.md docs/agents/issue-tracker.md docs/agents/triage-labels.md docs/agents/domain.md
  git commit -m "chore: instala o método do agent-harness"
Depois rode: tools/ah doctor
$ tools/ah metodo instalar
Nada a mudar: as skills já estão como a trava.
Agora rode: tools/ah doctor
```

### atualizar

Leva as skills já instaladas para a versão nova das coleções, com as mesmas regras do `instalar` (busca antes de gravar, mudança à mão, trava, commit).

| Opção | Efeito |
|---|---|
| (nenhuma) | cada coleção vai para o commit de `colecoes.json`, o recomendado por esta versão do harness |
| `--colecao <nome>` | só essa coleção; as outras ficam como na trava |
| `--para <tag\|commit>` | leva a coleção a esse ref, mesmo à frente do recomendado; exige `--colecao`. A trava grava o commit resolvido e `versao: <ref dado>` |
| `--simular` | mostra o que mudaria e não grava nada (nem trava nem skills) |
| `--forcar` | descarta as mudanças à mão nas skills, como no `instalar` |

Com `--para`, a coleção fica à frente (ou atrás) do recomendado: um `atualizar` simples depois a devolve ao commit de `colecoes.json`, e o item `Coleções na versão recomendada` do `doctor` avisa enquanto ela estiver fora dele. Um ref que a origem não tem (tag errada) recusa com `não achei a referência <ref> em <origem>` e `Faça: confira a tag ou o commit (git ls-remote --tags <origem>) e rode tools/ah metodo atualizar --colecao <nome> --para <ref> de novo`, antes de qualquer escrita; falha de rede mantém a recusa de busca. Repetir `--colecao` ou `--para` recusa (`informe --para uma vez só`). Sem trava anterior, o `atualizar` age como a primeira instalação. Um script que só mudou o bit de execução aparece em `Alterados:` com `(modo)`.

Relatório, por coleção com mudança: `Atualizei N skill(s) de <coleção> (<versão>, <commit>) em <pastas>.`, seguido de `Alterados:`, `Novos arquivos:` e `Arquivos removidos:` (cada um com `<coleção>: <skill>/<arquivo>, …`), `Novas skills: …` e, no fim, `Skills removidas: …` (a skill que saiu da lista é apagada se está igual à trava; com mudança à mão, fica e há aviso). Com `--simular`, termina com `Simulação: nada foi gravado.`; sem mudança, diz `Nada a mudar: as skills já estão como a trava.`

```
$ tools/ah metodo atualizar --colecao superpowers --para v7.0.3 --simular
Atualizei 2 skill(s) de superpowers (v7.0.3, 3fa9c21) em .claude/skills, .agents/skills.
Alterados:
  superpowers: brainstorming/SKILL.md
Novas skills: revisao
Simulação: nada foi gravado.
```

| Recusa | Faça |
|---|---|
| `--para precisa de --colecao (…)` | rode tools/ah metodo atualizar --colecao <nome> --para <tag\|commit>; sem --para, cada coleção vai para o commit recomendado |
| `Falta o valor de --colecao` / `--para` / `informe --colecao uma vez só` | dê o valor logo depois da opção, e uma vez só |
| `Opção desconhecida: …` / `Argumento a mais: …` | use ah metodo atualizar [--colecao <nome>] [--para <tag\|commit>] [--simular] [--forcar] |
| `não conheço a coleção <nome>` | use uma das coleções de colecoes.json |
| `os agentes do método mudaram desde a última instalação` | rode tools/ah metodo instalar, que leva todas as coleções às pastas novas |
| as recusas do `instalar` (busca, mudança à mão, trava ilegível, destino fora do projeto) | as mesmas, com `tools/ah metodo atualizar` no lugar de `instalar` |

### Conferências do `doctor`

Com a extensão ligada, o `ah doctor` acrescenta estes itens, depois dos do núcleo (`<item> (metodo)`). Todos são aviso, salvo a trava ilegível, que falha.

| Item | Aviso ou falha | Faça |
|---|---|---|
| `Trava das skills (metodo)` | falha quando `.harness/skills.lock.json` existe e está ilegível; aviso quando falta | `git checkout -- .harness/skills.lock.json` ou apague-a, e `tools/ah metodo instalar`; no aviso, `tools/ah metodo instalar` |
| `Skills iguais à trava (metodo)` | aviso com os arquivos alterados e ausentes por pasta de destino; também quando uma skill do harness presa a uma extensão está instalada com a extensão desligada, ou falta com a extensão ligada (`colecoes.json`, `agent-harness.extensoes`) | guarde a mudança numa skill de outro nome ou rode `tools/ah metodo instalar` (`--forcar` descarta a mudança) |
| `Coleções na versão recomendada (metodo)` | aviso por coleção cujo commit na trava difere do de `colecoes.json`; as skills do harness (`commit: null`) ficam de fora; também aviso quando a coleção da trava não está mais no `colecoes.json`, ou quando o `colecoes.json` (ou `AH_METODO_COLECOES`) não se lê | `tools/ah metodo atualizar` (`--simular` mostra antes o que muda) |
| `Coleções sem plugin duplicado (metodo)` | aviso quando `claude-code` está em `agentes` e `<CLAUDE_CONFIG_DIR ou ~/.claude>/plugins/installed_plugins.json` tem uma chave `superpowers@*` ou `mattpocock-skills@*` (ex.: `superpowers no Claude Code`); `installed_plugins.json` ilegível segue `ok`, com `não consegui ler <caminho>; a conferência de plugin duplicado foi pulada` | desinstale o plugin do agente ou tire a coleção do método |
| `Skills sem nome repetido (metodo)` | aviso só com `opencode` em `agentes`: o mesmo nome de skill em mais de uma entre `.claude/skills/`, `.agents/skills/` e `.opencode/skills/` com conteúdo diferente; cópias idênticas (o que o `instalar` faz) não avisam | deixe cópias iguais: renomeie a skill própria ou `tools/ah metodo instalar --forcar` |

Uma pasta de skill com arquivo ilegível vira aviso nos itens `Skills iguais à trava` e `Skills sem nome repetido`, com a pasta e o código do erro.

Limite: a conferência de plugin duplicado lê só o Claude Code; para o Codex e o OpenCode a sondagem não achou onde ficam os plugins instalados, e o `doctor` não chuta.

## ambiente

```
ah ambiente [mostrar] [--json]
ah ambiente preparar
ah ambiente desfazer
```

Comando da extensão `ambiente`, que acompanha o harness, desligada por padrão. Resolve a disputa de porta e banco entre frentes paralelas: na abertura, cada frente recebe portas livres de uma faixa, um banco próprio e um arquivo no worktree com as chaves para o programa ler; no fechamento, o banco é apagado e as portas voltam para a faixa. Construída sobre a ideia da extensão `recursos`, mas automática.

**Configuração.** Os comandos de banco são listas de argumentos rodadas sem shell, na raiz do projeto, com `{banco}` e `{frente}` trocados. A extensão não conhece banco nenhum: o projeto diz qual ferramenta usa.

```json
"extensoes": { "ambiente": {
  "arquivo": ".env.frente",
  "portas": { "faixa": [4100, 4199], "chaves": ["PORTA_WEB", "PORTA_API"] },
  "banco": { "nome": "loja_{frente}", "chave": "BANCO",
             "criar": ["createdb", "{banco}"], "apagar": ["dropdb", "--if-exists", "{banco}"],
             "listar": ["psql", "-Atc", "select datname from pg_database"] },
  "fixos": { "portas": [3000, 5432], "bancos": ["loja", "loja_test"] }
} }
```

| Campo | Conteúdo |
|---|---|
| `arquivo` | caminho, relativo ao worktree, do arquivo de ambiente (padrão `.env.frente`) |
| `portas.faixa`, `portas.chaves` | de onde saem as portas, e uma chave por porta da frente |
| `banco.nome` | molde do nome; `{frente}` vira o nome da frente com `-` trocado por `_` (`loja_{frente}` → `loja_cupom_novo`) |
| `banco.chave` | a chave do nome do banco no arquivo |
| `banco.criar`, `banco.apagar` | os comandos que criam e apagam o banco |
| `banco.listar` | opcional: imprime os bancos existentes, um por linha (usado pelo `sweep`) |
| `fixos` | portas e bancos que não são de frente nenhuma (desenvolvimento, teste comum, serviços do projeto): nunca vão para uma frente e nunca são apagados |

O marcador `{frente}` não vale o mesmo em todo lugar (exemplo com a frente `cupom-novo`):

| Onde | `{frente}` vale | Exemplo |
|---|---|---|
| `banco.nome` (o molde) | o nome da frente com `-` trocado por `_` | `loja_{frente}` → `loja_cupom_novo` |
| argv de `banco.criar` e `banco.apagar` | o nome da frente como está | `cupom-novo` |

Nos argv, `{banco}` vale o nome final do banco (`loja_cupom_novo`).

`portas` e `banco` são opcionais, mas um dos dois é obrigatório. O arquivo de ambiente vai no `.gitignore` do projeto (acrescente a linha `.env.frente`, ou o nome escolhido, e commite na `dev`): fora dele, o arquivo aparece como alteração não commitada, e o `close` recusa o worktree. A abertura avisa quando ele não está ignorado.

- **Abertura** (`depoisDeAbrir`, também na retomada). Portas: as menores da faixa fora das portas de outras frentes (desta extensão e, com a `recursos` ligada, as do tipo `porta`), das fixas e das que estão escutando agora nesta máquina (em `127.0.0.1` ou em `::1`); a escolha e a gravação ficam sob a trava das frentes, e duas aberturas ao mesmo tempo não recebem a mesma porta. Banco: roda `criar` e grava `{nome, criado}`; se o nome da frente dá um banco fixo (a frente `test` com o molde `loja_{frente}` e o fixo `loja_test`), a frente fica sem banco, com aviso. Arquivo: escreve no worktree um cabeçalho e uma linha `CHAVE=valor` por porta e pelo banco; um arquivo que já existe sem esse cabeçalho (o `.env` do aluno) nunca é sobrescrito nem apagado. Só faz o que falta: a frente que já tem portas fica com elas, e o banco já criado não é criado de novo. Falta de porta na faixa ou banco que não foi criado não impedem a abertura: viram aviso com o próximo passo.
- **`mostrar`** (o padrão). As portas, o banco e o arquivo da frente da sessão; `--json` imprime `{"id","frente","portas","banco","arquivo"}`.
- **`preparar`.** Refaz o que falta (depois de aumentar a faixa, ou com o banco de volta) e reescreve o arquivo. Sai com 1 quando sobra aviso.
- **`desfazer`.** Apaga o banco criado pela frente, remove o arquivo gerado do worktree e libera as portas; a saída diz o que de fato foi feito.
- **Fechamento** (`depoisDeFechar`). Apaga o banco criado pela frente, salvo se for fixo; a falha vira aviso com o comando para apagar à mão. As portas saem do estado com a frente.
- **Arquivo de ambiente e o `close`.** A extensão declara o arquivo como descartável (`ignorados`, ver `docs/extensoes/interface.md`): ele é refeito a partir do estado, e o `close` não o conta como item ignorado que se perderia. Com o arquivo no `.gitignore`, o `close` passa sem `ah ambiente desfazer`.
- **Sweep.** O `ah sweep` lista, como `- ambiente: …`, cada porta da faixa que está escutando sem ser de frente (desta extensão ou da `recursos`) nem fixa e, com `banco.listar`, cada banco que casa com o molde sem ser de frente nem fixo, com o próximo passo. Banco fora do molde não aparece. Se `listar` falha, sai uma linha com o erro. O `--reparar` não apaga banco nem encerra processo: só acrescenta uma linha dizendo isso.
- **Passagem.** O `handoff` não libera nada: a frente passada continua dona das portas e do banco.
- **Windows.** Não ensaiado no Windows.
- **Quadro.** A coluna `AMBIENTE` mostra as portas e o banco (`4100 4101 loja_carrinho`).

| Recusa ou aviso | Faça |
|---|---|
| `Esta sessão não tem frente.` | abra uma com ah open <nome> |
| `Subcomando desconhecido: …` | use `ah ambiente [mostrar] [--json] \| ah ambiente preparar \| ah ambiente desfazer` |
| Aviso: `a faixa 4100-4199 não tem 2 portas livres para a frente <nome>` | aumente extensoes.ambiente.portas.faixa e rode ah ambiente preparar |
| Aviso: `não consegui criar o banco <banco>: …` | confira o banco e o comando extensoes.ambiente.banco.criar e rode ah ambiente preparar |
| Aviso: `o banco <banco> não é um nome válido (minúsculas, números e _)` | mude extensoes.ambiente.banco.nome |
| Aviso: `o nome da frente <nome> dá o banco fixo <banco>` | mude extensoes.ambiente.banco.nome ou abra a frente com outro nome |
| Aviso: `<arquivo> já existe e não foi gerado pelo ah ambiente` | use outro extensoes.ambiente.arquivo ou apague o arquivo à mão e rode ah ambiente preparar |
| Aviso: `<arquivo> não está no .gitignore` | acrescente <arquivo> ao .gitignore e commite (senão o close recusa o worktree) |
| Aviso: `não consegui apagar o banco <banco>: …` | apague à mão com o comando de extensoes.ambiente.banco.apagar |
| Sweep: `porta <n> em uso sem frente` | encerre o processo ou declare a porta em extensoes.ambiente.fixos.portas |
| Sweep: `banco <nome> sem frente` | apague com o comando de extensoes.ambiente.banco.apagar ou declare em fixos.bancos |
| Sweep: `não consegui listar os bancos: …` | confira extensoes.ambiente.banco.listar |
| `não consegui apagar o banco <banco>: …` (em `desfazer`) | confira o banco e rode ah ambiente desfazer de novo |

```
$ AH_SESSAO=ana-terminal tools/ah open carrinho
…
$ cat <worktree>/.env.frente
# gerado por ah ambiente para esta frente; não edite: refaça com tools/ah ambiente preparar
PORTA_WEB=4100
PORTA_API=4101
BANCO=loja_carrinho
$ AH_SESSAO=carla-terminal tools/ah open cupom
$ AH_SESSAO=carla-terminal tools/ah ambiente
Ambiente da frente as-2 cupom: PORTA_WEB=4102, PORTA_API=4103, banco loja_cupom (arquivo .env.frente).
$ AH_SESSAO=ana-terminal tools/ah ambiente desfazer
Ambiente da frente as-1 carrinho desfeito: banco loja_carrinho apagado, portas liberadas, .env.frente removido.
```

## migracao

```
ah migracao reservar [--frente <nome>]
ah migracao liberar [--frente <nome>]
ah migracao listar [--json]
ah migracao renumerar [--frente <nome>]
```

Comando da extensão `migracao`, que acompanha o harness, desligada por padrão. Resolve o número repetido: duas frentes abertas sobre a mesma base criam, cada uma, a "próxima" migração, com o mesmo número. A reserva diz que número cada frente terá se a base receber as frentes na ordem das reservas. O número sai do nome do arquivo; a extensão não depende de ferramenta de migração.

**Configuração:**

```json
"extensoes": { "migracao": { "pasta": "db/migracoes", "padrao": "^(\\d+)_", "digitos": 4 } }
```

| Campo | Padrão | Conteúdo |
|---|---|---|
| `pasta` | obrigatório | pasta das migrações, relativa à raiz |
| `padrao` | `^(\d+)_` | expressão regular aplicada ao nome do arquivo; o primeiro grupo é o número, e ele precisa ser simples (sem nome) e obrigatório (sem `?` ou `*` depois). Arquivo que não casa (um `README.md` na pasta) é ignorado |
| `digitos` | `4` | quantos dígitos o número tem no nome (`0003`) |
| `renumerar` | — | passo próprio da ferramenta de migração, usado por `renumerar` (abaixo) |

- **`reservar`.** Grava `frente.extensoes.migracao.numero` na frente da sessão (ou na de `--frente`). O número é o maior entre a última migração da base (`git.base`, lida no ramo local) e as reservas de todas as outras frentes do estado, mais um. A frente que já tem reserva acima da última da base fica com ela (`já reservada`). A conferência e a gravação ocorrem sob a trava das frentes.
- **`liberar`.** Apaga a reserva da frente.
- **`listar`.** A última migração da base e cada reserva, em ordem. A reserva que a base já ultrapassou (outra frente entrou com aquele número) aparece com `(a dev já passou dela: rode ah migracao renumerar depois de reintegrar)`. `--json` imprime `{"base","ultima","reservas":[{"id","frente","estado","numero"}]}`.
- **`renumerar`.** Na reintegração: quando outra frente entrou na base com o número reservado, rode no worktree `git merge dev --no-edit` (resolva o conflito e commite, se houver) e depois `ah migracao renumerar`. As migrações da frente (os arquivos da pasta que casam com o padrão e não existem na base) são renomeadas com `git mv` em sequência a partir do próximo número livre (depois da última da base e das reservas das outras frentes), trocando só o número (`0003_frete.sql` → `0005_frete.sql`). A reserva, conferida e gravada sob a trava antes dos renomes, passa a ser o último número da frente. A ferramenta de migração que guarda mais do que o nome do arquivo (um registro, um metadado) declara o passo dela em `renumerar`, uma lista argv rodada no worktree para cada arquivo renomeado, com `{de}`, `{para}` e `{pasta}` trocados: `"renumerar": ["node", "scripts/renomear-migracao.mjs", "{de}", "{para}"]`. No fim, tudo fica em stage, a saída lista os arquivos fora da pasta que citam o nome antigo e termina com `Falta: git commit no worktree.`. Já em dia (os números da frente vêm depois da última da base, em sequência, e nenhum foi reservado por outra frente), não mexe em nada.
- **Mais de uma migração na frente.** A reserva é de um número. A frente que cria mais de uma roda `ah migracao renumerar` logo depois de criá-las: a reserva passa a ser a última, e as reservas seguintes de outras frentes vêm depois dela.
- **Sessão e frente alheia.** `reservar`, `liberar` e `renumerar` exigem sessão; `listar` não. `--frente` em frente ativa de outra sessão viva recusa, como na extensão `recursos`.
- **Ciclo.** O `close` libera a reserva (ela mora no registro da frente) e diz `Reserva de migração 0003 liberada.`. O `handoff` não libera: a frente passada continua dona do número.
- **Windows.** Não ensaiado no Windows.
- **Quadro.** A coluna `MIGRACAO` mostra o número reservado.

| Recusa | Faça |
|---|---|
| `Falta o subcomando.` / `Subcomando desconhecido: …` | use `ah migracao reservar\|liberar\|renumerar [--frente <nome>] \| ah migracao listar [--json]` |
| `não sei qual é a sessão` | defina AH_SESSAO ou ligue o adaptador do agente |
| `Esta sessão não tem frente.` | abra uma com ah open <nome>, ou diga qual com --frente <nome> |
| `Não achei a frente <nome>.` | rode ah board para ver as frentes abertas |
| `A frente <id> <nome> é da sessão <s>, que está viva.` | peça à sessão dona (<s>) que faça ela mesma; com a sessão morta (frente órfã) ou a frente passada, o --frente vale |
| `não consegui ler <pasta> no ramo <base>: …` | confira se o ramo <base> existe neste repositório |
| `o worktree <wt> tem um merge em curso …` (em `renumerar`) | resolva os conflitos, termine o merge com git commit e rode ah migracao renumerar de novo |
| `a dev não está mesclada no ramo <ramo>: …` | no worktree, git merge dev --no-edit (pode parar em conflito: resolva e commite), e rode ah migracao renumerar de novo |
| `a migração <arquivo> ainda não está no git (arquivo novo, sem git add).` | git add -- <pasta>/<arquivo> e rode ah migracao renumerar de novo |
| `<arquivo> já existe em <pasta>.` | renomeie à mão o arquivo que está no caminho e rode ah migracao renumerar de novo |
| `o passo de renumerar da configuração falhou em <de> → <para> (…); já renomeados (em stage): …` | conserte o passo da ferramenta para esses arquivos à mão, ou desfaça com git restore --source=HEAD --staged --worktree -- <pasta> (descarta também o que não foi commitado nessa pasta) e rode de novo |
| `Opção desconhecida: …` / `Argumento a mais: …` / `A opção --frente precisa do nome da frente.` | use o uso acima |

```
$ AH_SESSAO=ana-terminal tools/ah migracao reservar
Frente as-1 carrinho: migração reservada: 0003 (a última da dev é a 0002).
$ AH_SESSAO=carla-terminal tools/ah migracao reservar
Frente as-2 cupom: migração reservada: 0004 (a última da dev é a 0002).
$ tools/ah migracao listar
Última da dev: 0002 (0002_cupom.sql)
0003 as-1 carrinho
0004 as-2 cupom
$ git merge --no-ff feat/cupom && AH_SESSAO=carla-terminal tools/ah close     # o cupom entra primeiro
$ cd <worktree do carrinho> && git merge dev --no-edit
$ AH_SESSAO=ana-terminal tools/ah migracao renumerar
A migração da frente agora vai de 0005 em diante (a última da dev é a 0004): 0003_carrinho.sql → 0005_carrinho.sql.
Falta: git commit no worktree.
```

## prova

```
ah prova <rótulo> [--frente <nome>] [-- <comando>…]
ah prova --confere <ramo> [<rótulo>]
```

Comando da extensão `prova`, que acompanha o harness, desligada por padrão. Serve para não repetir o teste ponta a ponta depois de um merge que não mudou o código: o git identifica o conteúdo de um commit pela árvore (`HEAD^{tree}`), e o `merge --no-ff` de uma frente numa base parada produz a mesma árvore da frente.

**Configuração** (opcional): o comando padrão de cada rótulo, como lista de argumentos, rodada sem shell.

```json
"extensoes": { "prova": { "comandos": { "e2e": ["tools/ah", "pesado", "--", "npm", "run", "e2e"] } } }
```

- **Gravar** (`ah prova <rótulo>`, exige sessão com frente). Recusa o worktree com mudança fora do commit: arquivo rastreado alterado ou arquivo novo não rastreado, que o teste usaria e a árvore não tem (o que o `.gitignore` ignora não conta). Roda o teste no worktree da frente: o comando depois de `--` (um argumento só vai para o shell; vários rodam direto) ou, sem ele, o de `comandos.<rótulo>`. Teste que falha: `O teste <rótulo> falhou (código N): nada gravado.`, e o `ah` sai com o código do teste. Teste que passa sem mudar a árvore: grava `{rotulo, arvore, commit, comando, em}` em `frente.extensoes.prova.provas` (uma por rótulo, a última) e acrescenta uma linha em `<estado>/extensoes/prova/provas.jsonl`, que sobrevive ao `close`. Teste pesado vai pela fila pondo `tools/ah pesado --` no comando.
- **`--frente <nome>`** (nome ou id). Grava a prova dessa frente, com o teste rodado no worktree dela e a árvore dela, e não a da frente em foco: é como a orquestradora, que tem várias frentes e não troca o foco entre elas, prova cada uma no fechamento. Frente passada, órfã (dona morta) ou sem dona vale; frente ativa ou em abertura de outra sessão viva recusa, como na extensão `recursos`. A dona é conferida antes do teste e de novo na gravação, sob a trava das frentes, porque o teste pode demorar.
- **Conferir** (`ah prova --confere <ramo>`, não exige sessão). Procura uma prova com a mesma árvore do ramo (e o mesmo rótulo, se dado) na lista durável e nas frentes do estado. Achou: código 0, com a frente, o rótulo e o commit. Não achou: código 3 (`nenhuma prova. Rode o teste.`). Ref que não existe: recusa, código 1.
- **Fluxo.** Na frente: reintegrar a base (`git merge dev`), rodar `ah prova e2e`. Ao integrar: `git merge --no-ff` na base e `ah prova --confere dev`; com 0, o teste não se repete; com 3 (outra frente entrou no meio), roda o teste de novo.
- **Windows.** Não ensaiado no Windows.
- **Quadro.** A coluna `PROVA` mostra a prova mais recente da frente (`e2e 1a2b3c4`).

| Recusa | Faça |
|---|---|
| `não sei qual é a sessão` | defina AH_SESSAO ou ligue o adaptador do agente |
| `Esta sessão não tem frente.` | abra uma com ah open <nome>, ou diga qual com --frente <nome> |
| `Não achei a frente <nome>.` | rode ah board para ver as frentes abertas |
| `A frente <id> <nome> é da sessão <s>, que está viva.` | peça à sessão dona (<s>) que grave a prova; com a sessão morta (frente órfã) ou a frente passada, o --frente vale |
| `A opção --frente precisa do nome da frente.` | use o uso acima |
| `O rótulo vem primeiro.` | ah prova <rótulo> --frente <nome> [-- <comando>…] |
| `Rótulo inválido: …` | use minúsculas, números, hífen e dois-pontos, começando por letra (ex.: e2e) |
| `Não sei qual é o teste <rótulo>.` | diga depois de -- (ah prova <rótulo> -- npm test) ou declare em extensoes.prova.comandos.<rótulo> |
| `o worktree tem mudança fora do commit (…)` | commite, ponha no .gitignore o que é gerado, ou desfaça, e rode ah prova de novo |
| `o teste <rótulo> passou, mas a árvore mudou durante o teste; nada gravado.` | commite o que o teste gerou (ou ponha no .gitignore) e rode ah prova de novo |
| `<ref> não é um ramo nem um commit deste repositório.` | confira o nome com git branch -a |
| `Faltam ou sobram argumentos.` / `Argumento a mais: …` | use o uso acima |

```
$ AH_SESSAO=ana-terminal tools/ah prova e2e
Prova gravada: e2e na frente as-1 carrinho, árvore 1a2b3c4 (commit 9f8e7d6).
$ git merge --no-ff feat/carrinho
$ tools/ah prova --confere dev
Árvore 1a2b3c4 de dev provada pela frente as-1 carrinho (e2e, commit 9f8e7d6, em 2026-11-26T15:02:11.000Z): não precisa repetir o teste.
$ tools/ah prova --confere dev; echo $?      # depois que outra frente entrou na dev
Árvore 5d6e7f8 de dev: nenhuma prova. Rode o teste.
3
```

## orquestracao

```
ah candidatos [--json]
ah pede-revisao <ramo> [--json]
```

Comandos da extensão `orquestracao`, que acompanha o harness, desligada por padrão. São a parte determinística do trabalho de quem orquestra (a skill `orquestrar`): a escolha a olho deixa passar ticket bloqueado, já começado por outra sessão ou à espera de uma decisão do humano.

**Configuração** (opcional):

```json
"extensoes": { "orquestracao": { "pronto": "ready-for-agent", "pendencia": "A decidir", "revisao": ["src/pagamento/**"] } }
```

| Campo | Padrão | Conteúdo |
|---|---|---|
| `pronto` | `ready-for-agent` | o rótulo que a triagem põe no ticket pronto para um agente |
| `pendencia` | `A decidir` | a marca de decisão pendente, procurada no começo de uma linha do corpo e de cada comentário (veja abaixo) |
| `revisao` | `[]` | padrões de caminho cujo diff pede revisor novo (`pede-revisao`, abaixo) |

- **`candidatos`.** Cruza os livres do `ah deps --json` (abertos, sem bloqueio pendente, sem frente) com os tickets abertos que têm o rótulo `pronto` (`gh issue list --label`, até 200, com o corpo e os rótulos) e tira os que têm o rótulo de reserva (`github.rotuloDeReserva`, que o `ah open` põe no ticket: o `deps` só conhece as frentes desta máquina) ou a marca `pendencia`. Os comentários são lidos um ticket por vez (`gh issue view --json comments`), só dos que passaram no resto. A saída lista os candidatos, na ordem do `deps` (o mais novo primeiro), e em `Fora:` cada outro ticket aberto com o motivo: `bloqueada`, `com frente <id>`, `com o rótulo <reserva> (frente em outra máquina?)`, `sem o rótulo <pronto>`, `"<pendencia>" no corpo` ou `"<pendencia>" num comentário de <autor>`. Quando o `deps` usou a leitura guardada (sem GitHub), a primeira linha diz a data dela; os avisos do `deps` saem como `Aviso: …`; quando o `deps` ou o `gh` bateu no limite de 200 tickets, `Aviso: lista incompleta: …`, e o ticket que pode ter ficado fora da lista dos prontos aparece como `não está entre os 200 prontos lidos (lista incompleta)`, não como `sem o rótulo`. `--json` imprime `{"pronto","pendencia","deCache","lidoEm","incompleta","avisos","candidatos":[{"numero","titulo"}],"fora":[{"numero","titulo","motivo"}]}`.
- **A marca.** Casa no começo de uma linha, depois de espaço e da marcação de título, lista, citação ou negrito (`A decidir: …`, `## A decidir`, `- A decidir:`, `> A decidir`, `**A decidir:**`), sem diferenciar maiúsculas, e termina a palavra (`A decidirmos` não casa). No meio da frase não conta: `Tudo certo, nada a decidir.` não tira o ticket.
- **Liberar um ticket com a marca.** Depois que o humano decide, edite o corpo ou o comentário tirando a marca do começo da linha (ou troque-a pela decisão). Não exige sessão.
- **`pede-revisao`.** Compara o ramo com a base (`git diff --name-only <base>...<ramo>`) e diz se algum arquivo do diff casa com `revisao`: `feat/cartao pede revisão: toca src/pagamento/cartao.js (extensoes.orquestracao.revisao).` ou `… não pede revisão: …`. Nos padrões, relativos à raiz (sem `./` nem `/` no começo), `**` atravessa pastas (`src/**/x.js` casa também `src/x.js`), `*` e `?` ficam dentro de uma pasta, e a barra no fim vale "tudo abaixo" (`src/pagamento/` é `src/pagamento/**`, como no `--caminhos` do `open`). Nome com acento conta como está, e o arquivo movido conta pelos dois lados (o de onde saiu e o para onde foi). Sai sempre com 0; `--json` imprime `{"ramo","base","pede","arquivos"}`. Não exige sessão.
- **Windows.** Não ensaiado no Windows.

| Recusa | Faça |
|---|---|
| `Falta o ramo.` / `Argumento a mais: …` (em `pede-revisao`) | use ah pede-revisao <ramo> [--json] |
| `<ramo> não é um ramo deste repositório.` | confira o nome com git branch |
| `o ah deps não respondeu: …` | rode tools/ah deps para ver o motivo e conserte antes |
| `não consegui ler os tickets com o rótulo <pronto>: …` / `não consegui ler os comentários do #<n>: …` | confira o acesso ao GitHub (gh auth status) e rode de novo |
| `o gh demorou ou respondeu demais ao ler …` | rode de novo; se repetir, use um rótulo de pronto mais específico em extensoes.orquestracao.pronto |
| `o gh devolveu … num formato que não li` | confira o gh (gh --version) e rode de novo |
| `o ah deps --json devolveu uma saída que não li` | rode tools/ah deps --json e confira a saída |
| `Argumento desconhecido: …` | use ah candidatos [--json] |

```
$ tools/ah candidatos
Candidatos (rótulo ready-for-agent, sem "A decidir"):
#13 Carrinho vazio
#12 Total do carrinho
Fora:
#17 Página de ajuda: sem o rótulo ready-for-agent
#16 Revisão do layout: com frente as-1
#15 Cupom no checkout: bloqueada
#14 Frete por região: "A decidir" num comentário de carla
```

## modelo

```
ah modelo [alto|medio|leve] [--agente <nome>] [--json]
```

Comando da extensão `modelo`, que acompanha o harness e só existe com `"modelo"` ligada em `extensoes` (a preparação do método a liga). Traduz os três níveis neutros que o plano marca em cada tarefa (`Nível: alto|medio|leve`) para o modelo e o esforço reais de cada agente. Nunca recusa por causa de modelo: as únicas recusas são de uso do comando.

- **Com nível.** Uma linha por agente (ou só o de `--agente`): `alto (claude-code): modelo opus, esforço high`, seguida de `Como usar: …`, com a opção de linha de comando ou o campo do subagente em que o par entra. Esforço `null` sai como `padrão do agente`.
- **Sem nível.** A tabela inteira, a data dos padrões e `Critérios: docs/agents/metodo.md (nível de modelo).`
- **`--json`.** `{"nivel"?, "padroesDe", "traducoes": [{"agente", "nivel", "modelo", "esforco", "origem", "uso"}]}`, com `origem` `padrao` ou `projeto`.
- **Sessão.** Não exige sessão.
- **Padrões.** Em `.harness/nucleo/extensoes/modelo/padroes.json`, com a data e as fontes (a documentação oficial de cada agente, conferida em 2026-11-27). No OpenCode, o modelo é `provedor/modelo` e o esforço é uma variante do catálogo do provedor (`--model <modelo>#<variante>`); como variante desconhecida dá erro de resolução, o padrão não fixa variante. Nomes de modelo mudam: o projeto troca os dele na configuração.
- **Configuração.** `extensoes.modelo.agentes.<agente>.<nível>` com `modelo` (texto) e `esforco` (texto ou `null`), mesclados campo a campo sobre o padrão. Um agente que não está nos padrões pode ser acrescentado; o nível que ele não traduz sai como `sem tradução (acrescente em extensoes.modelo.agentes)`.

```json
"extensoes": { "modelo": { "agentes": { "opencode": { "leve": { "modelo": "opencode-go/claude-haiku-5-5" } } } } }
```

- **Quadro.** A coluna `MODELO` do `board` mostra o modelo que a sessão dona da frente declarou ao começar (`modelo` do registro da sessão, lido por `ctx.sessao`); hoje só o adaptador do Claude Code informa. Sem dona ou sem o dado, `—`.

```
$ tools/ah modelo
Níveis de modelo (padrões de 2026-11-27; o projeto muda os dele em extensoes.modelo.agentes):
  alto (claude-code): modelo opus, esforço high
  medio (claude-code): modelo sonnet, esforço medium
  leve (claude-code): modelo haiku, esforço low
  alto (codex): modelo gpt-6.2-astra, esforço high
  medio (codex): modelo gpt-6.2-sol, esforço medium
  leve (codex): modelo gpt-6-luna, esforço low
  alto (opencode): modelo anthropic/claude-opus-5-5, esforço padrão do agente
  medio (opencode): modelo anthropic/claude-sonnet-5-5, esforço padrão do agente
  leve (opencode): modelo anthropic/claude-haiku-5-5, esforço padrão do agente
Critérios: docs/agents/metodo.md (nível de modelo).
$ tools/ah modelo leve --agente codex
leve (codex): modelo gpt-6-luna, esforço low
Como usar: codex -m <modelo> -c model_reasoning_effort=<esforço>
```

| Recusa | Faça |
|---|---|
| `Nível desconhecido: altissimo.` | use alto, medio ou leve (tools/ah modelo mostra a tabela) |
| `Agente desconhecido: cursor.` | use claude-code, codex ou opencode, ou acrescente o agente em extensoes.modelo.agentes |
| `Opção desconhecida: …` / `Argumento a mais: …` / `A opção --agente precisa do nome do agente.` | use o uso acima |

## registros

```
ah registros guardar [--frente <nome>]
ah registros devolver [--frente <nome>]
```

Comando da extensão `registros`, que acompanha o harness e só existe com `"registros"` ligada em `extensoes` (a preparação do método a liga). Leva para o ticket da frente o diário da execução por subagentes: o `progress.md` que o subagent-driven-development grava, por plano, em `.superpowers/sdd/<pasta do plano>/`, dentro do worktree e ignorado pelo git. Sem isso, o diário some com o worktree, e a própria skill o apaga quando a revisão final fica limpa.

- **`guardar`.** Para cada plano achado no worktree da frente da sessão (ou da dada em `--frente`, por nome ou id): comenta o diário em cada ticket da frente, com o marcador `<!-- ah:registro id=<id> nome=<nome> pasta=<pasta> plano=<plano> commit=<commit> cortado=<0|1> em=<ISO> fase=guardado v=2 -->`; guarda uma cópia em `<estado>/registros/<id da frente>/<pasta>/` (`progress.md` e `meta.json`, com o estado de cada ticket: `comentado` ou `pendente`); e tira do worktree as pastas de plano e o `.gitignore` que o `sdd-workspace` cria, sem apagar o que o git versiona (o projeto pode versionar os diários, como o `sdd-workspace` prevê). O que não é do subagent-driven-development (um arquivo do aluno em `.superpowers/sdd/`) fica, com um aviso, e o `close` continua recusando por ele na linha de sempre dos ignorados: a extensão declara ao `close` só as pastas de plano e o `.gitignore` do `sdd-workspace`. O mesmo diário, na mesma fase, já comentado no mesmo ticket não é comentado de novo. Plano com tarefa parada (citada no diário sem a linha `complete`) é guardado do mesmo jeito, com o aviso `o plano … tem tarefa parada (…); o diário saiu do worktree e está guardado. Para continuar o plano: tools/ah registros devolver --frente carrinho`.
- **Quando rodar.** No fim do subagent-driven-development, antes de a skill apagar a pasta do plano, e antes do `ah close`. Quem esquece encontra a recusa do `close` com a linha `itens ignorados que a extensão registros guarda (…); saída: tools/ah registros guardar --frente carrinho e repita ah close`.
- **Diário grande ou estranho.** O diário reconhecido (primeira linha `# SDD ledger — plan: …`) vai inteiro até 60 000 caracteres; acima disso, ou em outro formato (até 4 000 caracteres, como texto), vai cortado, com `cortado=1` e uma linha que diz o motivo. A cópia local guarda o diário inteiro e não é apagada no fechamento enquanto o ticket tiver só a parte cortada.
- **Sem ticket.** Só a cópia, com o aviso `a frente as-1 não tem ticket: o diário ficou só nesta máquina (…)`.
- **Sem rede.** A cópia vale como guarda e a pasta sai do worktree mesmo assim; o ticket fica `pendente`, com o aviso, e o `close` comenta o diário antes do resumo.
- **`--frente` em frente alheia.** Vale para frente passada, órfã (dona morta) ou sem dona. A frente ativa de outra sessão viva é recusada: ela pode estar no meio da execução.
- **`devolver`.** Traz de volta ao worktree o diário mais novo de cada plano da frente, inclusive o que o `guardar` tirou (fase `guardado`), pelas regras da retomada abaixo. A saída diz por que não trouxe nada: `Nada a devolver: o worktree já tem o diário mais novo de cada plano.`, `Nada a devolver: não achei diário desta frente nos tickets nem nesta máquina.`, `Nada devolvido: veja os avisos acima.` ou `A frente as-1 carrinho não tem worktree nesta máquina; nada a devolver.`
- **Handoff.** A reação `aoPassar` comenta o diário (fase `passagem`) e guarda a cópia como o `guardar`, mas deixa a pasta no worktree, porque o trabalho continua. Sem rede, avisa que outra máquina que retomar a frente não terá o diário.
- **Retomada.** Na retomada (`ah open` de frente passada), cada plano recebe o diário de passagem mais novo: o comentário `ah:registro` da frente com o maior `em`, juntando todos os tickets (o marcador `v=1`, sem `em` nem `fase`, conta como o mais antigo e como passagem). O diário de fase `guardado` saiu de propósito e não volta sozinho (para ele, `registros devolver`). A cópia desta máquina entra na conta quando nenhum ticket se leu, quando o ticket não tem o plano, ou quando ela é mais nova (guardada sem rede, com o ticket pendente); a cópia com ticket pendente não é trocada pelo que vem do ticket. Ele vai para `progress.md` e `plan-path`, com o `.gitignore` de `.superpowers/sdd/`, no lugar em que o subagent-driven-development o procura (`Registros: devolvi o diário de 2 planos a …/.superpowers/sdd/ (do ticket).`), e a cópia desta máquina passa a saber em que tickets ele já está (todos os que têm o mesmo texto e o mesmo `em`). O diário que já está no worktree só é trocado quando é igual à cópia desta máquina (ninguém mexeu nele aqui desde a última guarda) e o do ticket é mais novo; diferente da cópia, fica, com o aviso e o próximo passo. Diário cortado no ticket não é devolvido.
- **Quem pode deixar diário.** Só vale o comentário cujo autor tem acesso ao repositório (o `authorAssociation` que o GitHub dá ao comentário é `OWNER`, `MEMBER` ou `COLLABORATOR`; sem o campo, num `gh` antigo, o comentário não vale) e tem marcador do harness nesta frente naquele ticket (abertura, retomada, tomada ou passagem, com o autor igual ao `login` do marcador; o `ah:frente` antigo, sem `login`, vale pelo autor; a mesma regra do núcleo); os outros são ignorados, com `Aviso: ignorei o diário que @<login> comentou em #7 (associação NONE): …`. O marcador sozinho não basta, porque um terceiro pode forjá-lo com o próprio login. O motivo: num repositório público qualquer um comenta, e o diário é lido pelo agente como instrução de trabalho. Pelo mesmo motivo, o nome da pasta e o caminho do plano vindos do marcador são conferidos (sem `..`, sem barra invertida, pasta sem ponto no começo).
- **Fechamento.** Depois do `close`, a reação `depoisDeFechar` comenta primeiro o diário que ficou `pendente` e depois o resumo (marcador `ah:registro-resumo`): por plano, as tarefas concluídas com os commits e o veredito da revisão, as paradas com a última linha e as decisões (`Ruling:`). Com todos os comentários feitos, apaga a cópia (`Registros: resumo da execução comentado em #7.`). Fechamento só local, sem ticket ou sem rede: mostra o resumo na saída e mantém a cópia. Na primeira falha de rede, a reação para de chamar o `gh` (`Aviso: sem rede (…): parei de comentar; …`), para a rede travada não segurar a trava. Sem cópia: `Registros: nenhum diário guardado para a frente as-1.` Ela roda sob a trava das frentes do `close`; cada chamada ao `gh` tem o prazo de 15 s do núcleo.
- **Começo de sessão.** Quando o worktree da frente tem diário sem cópia, ou diferente dela, o resumo traz `Registros: antes do ah close, rode tools/ah registros guardar.` (no meio do plano, guardar tiraria a pasta de que a execução precisa).
- **Nunca recusa o trabalho.** A extensão não usa `antesDeFechar`; as reações que falham viram aviso.

```
$ tools/ah registros guardar
Diário de 1 plano guardado em /home/ana/.local/state/agent-harness/loja/registros/as-1; comentado em #7.
$ tools/ah close
Registros: resumo da execução comentado em #7.
Frente as-1 carrinho fechada.
```

| Recusa | Faça |
|---|---|
| `Falta o subcomando.` / `Subcomando desconhecido: …` / `Argumento desconhecido: …` / `A opção --frente precisa do nome da frente.` | use `ah registros guardar\|devolver [--frente <nome>]` |
| `não sei qual é a sessão` | defina AH_SESSAO ou ligue o adaptador do agente |
| `Esta sessão não tem frente.` | abra uma com ah open <nome>, ou diga qual com --frente <nome> |
| `Não achei a frente <nome>.` | rode ah board para ver as frentes abertas |
| `A frente <id> <nome> é da sessão <s>, que está viva.` | peça à sessão dona (<s>) que rode tools/ah registros guardar (ou devolver); com a sessão morta (frente órfã) ou a frente passada, o --frente vale |

## wiki

```
ah wiki conferir [--json] [--pendentes] [<artigo>...]
ah wiki fontes [--json]
```

Comandos da extensão `wiki`, que acompanha o harness e só existe com `"wiki"` ligada em `extensoes`. A wiki fica em `docs/wiki/<tema>/<artigo>.md`, com `index.md` e `log.md`, e é escrita pelo agente com as skills `wiki-ingerir`, `wiki-consultar` e `wiki-conferir` (instaladas pelo `metodo instalar` com a extensão ligada). O formato do artigo, do índice e do log está num lugar só: `.harness/nucleo/extensoes/wiki/formato.md`. Nenhum comando exige sessão; dentro do worktree de uma frente, valem a wiki e as fontes daquele worktree.

**Configuração** (`extensoes.wiki`: `true` ou um objeto com qualquer destes campos). É o único lugar da lista de fontes; as skills mandam rodar `ah wiki fontes` em vez de repeti-la.

| Campo | Padrão | O que é |
|---|---|---|
| `pasta` | `"docs/wiki"` | Pasta da wiki, relativa à raiz; nunca é fonte |
| `fontes` | `["CONTEXT.md", "GLOSSARY.md", "docs/**"]` | Padrões do que a wiki pode citar |
| `foraDasFontes` | `["docs/agents/**"]` | Padrões que saem das fontes mesmo casando com `fontes` |

Nos padrões, relativos à raiz e com `/`, `**` casa qualquer sequência (inclusive `/`) e `*` qualquer sequência sem `/`. Campo desconhecido ou valor fora da forma recusa a configuração, e a extensão não carrega (`doctor`: `FALHOU Extensão wiki: …`).

- **`conferir`.** A invariante da wiki: todo número, data, horário ou citação de um artigo existe literalmente numa fonte ligada pelo campo `Fontes` dele. Extrai de cada artigo os literais de alto sinal (números com separador ou sufixo, como `1.234,56` e `2,5%`; números de 4 ou mais dígitos; datas `2026-11-20` e `01/12/2026`; horários `0:12:40`; citações de 15 ou mais caracteres entre aspas ou em blockquote) e procura cada um, inteiro, nas fontes ligadas. O que falta é **suspeito**: valor derivado, paráfrase ou fonte que mudou depois do artigo; quem julga é a skill `wiki-conferir`. **Erros de evidência**: `artigo sem campo Fontes`, `link fora das fontes`, `link que não resolve`, `fonte que não é texto conferível` (texto conferível: `.md`, `.txt`, `.srt`, `.vtt`, `.json`, `.csv`, `.yaml`, `.yml`). **Cobertura**: por pasta de fontes (`docs/adr`) ou arquivo (`CONTEXT.md`), quantos `.md` algum artigo cita; a entrada `## [AAAA-MM-DD] ingestão | sem material: <caminho>` do log conta como citada. Páginas arquivadas (`> Arquivado:`) e blocos de status não são conferidos; nada dentro de cerca de código conta. Com artigos dados, confere só eles (a cobertura é sempre do todo); `--pendentes` lista as fontes ainda não citadas; `--json` imprime `{"suspeitos":[{"artigo","valores"}],"erros":[{"artigo","erros"}],"cobertura":[{"grupo","citados","total"}],"pendentes":[…],"artigos":n}`. O código é 0 com ou sem suspeitos: o relatório é a interface.
- **`fontes`.** Uma fonte por linha, ordenadas, pela configuração; `--json`, `{"fontes":[…]}`.
- **Começo de sessão.** Uma linha no resumo: `Wiki: ainda vazia; a primeira ingestão (skill wiki-ingerir) cria docs/wiki/.`; `Wiki: <n> artigo(s); nenhuma ingestão registrada no git ainda (commite docs/wiki/log.md).`; `Wiki: <n> artigo(s); nenhuma fonte nova desde a última ingestão.`; ou `Wiki: <n> artigo(s); <k> fonte(s) nova(s) desde a última ingestão (<até três caminhos>, …): skill wiki-ingerir.` A última ingestão é o último commit que acrescentou ao `docs/wiki/log.md` uma entrada de ingestão (`## [AAAA-MM-DD] ingestão | …`, inclusive a de "sem material"); commit que só registra conferência, consulta ou movimento não conta. Fonte nova é fonte (pela configuração, com extensão conferível) mudada entre esse commit e o `HEAD` do checkout principal. Nada é gravado para saber isso.
- **Fechamento.** No `close`, antes de qualquer mudança, a mesma conta no ramo da frente: se a frente mudou fonte depois da última ingestão do ramo, sai `Wiki: a frente mudou fonte(s) sem ingestão (<caminhos>). Sugestão: ingira com a skill wiki-ingerir antes de começar outra coisa.` Nunca recusa; falha do git vira silêncio.
- **Doctor.** O item `Evidência da wiki (wiki)` avisa quando a conferência acha suspeitos ou erros (`aviso Evidência da wiki (wiki): 1 suspeito(s) de fidelidade e 0 erro(s) de evidência; rode tools/ah wiki conferir e julgue cada um com a skill wiki-conferir`); sem wiki, `ok`.

| Recusa | Faça |
|---|---|
| `Não achei a wiki em docs/wiki (<raiz>).` | faça a primeira ingestão com a skill wiki-ingerir, que cria docs/wiki/index.md e log.md |
| `docs/wiki/log.md não é artigo da wiki (fica fora de docs/wiki, ou é index.md ou log.md).` | passe caminhos de artigos, relativos à raiz, como docs/wiki/<tema>/<artigo>.md |
| `Não achei o artigo <caminho>.` | confira o caminho, relativo à raiz do projeto |
| `Falta o subcomando.` / `Subcomando desconhecido: …` / `Opção desconhecida: …` / `Argumento a mais: …` | use o uso acima |

```
$ tools/ah wiki conferir
# Conferência de evidência

## Suspeitos de fidelidade

docs/wiki/frete/gratis.md
- 250,00

## Erros de evidência
(nenhum)

## Cobertura das fontes

| Fonte | Citados | Total |
|---|---|---|
| docs/adr | 1 | 1 |

## Resumo
1 suspeito(s) de fidelidade, 0 erro(s) de evidência, 1 de 1 arquivo(s)-fonte citados
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
| `A frente as-1 carrinho está sendo fechada agora (processo <pid>).` | espere esse `ah close` terminar (o quadro mostra `fechando` enquanto ele roda); se a frente continuar no quadro, repita |
| `A frente as-1 carrinho está com o fechamento parado: os tickets já receberam (ou estavam recebendo) o comentário de fechamento.` | termine com `ah close carrinho`, que não comenta de novo (o quadro mostra `fechamento parado`); a passagem chegaria aos tickets depois do fechamento |
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
| `A frente as-1 carrinho está sendo fechada agora (processo <pid>).` | espere esse `ah close` terminar (o quadro mostra `fechando` enquanto ele roda); se a frente continuar no quadro, repita |
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
- `--descartar-ignorados`: aceita a perda dos arquivos ignorados pelo git presentes no worktree (`node_modules/`, caches…); sem a opção, o `close` recusa e lista esses itens. Os itens de que uma extensão ligada cuida (campo `ignorados`, em `docs/extensoes/interface.md`) têm tratamento próprio: o descartável (refeito a partir do estado, como o arquivo de ambiente da frente) não conta como perda e sai com o worktree; o guardado (como o diário do subagent-driven-development, da extensão `registros`) recusa numa linha só dele, com o comando da extensão que o leva a um lugar durável: `itens ignorados que a extensão registros guarda (4); saída: tools/ah registros guardar --frente carrinho e repita ah close (o --descartar-ignorados apagaria junto)`. Os outros seguem a linha de sempre. Se a extensão falha ao declarar, o `close` avisa (`Aviso: a extensão <nome> falhou em ignorados: …`) e os itens dela seguem a linha de sempre. O worktree é sempre removido com `git worktree remove` sem `--force` (comando que já apaga os ignorados): se surgir alteração ou arquivo novo entre a conferência e a remoção, o `close` recusa e não apaga nada.
- `<nome>` fecha uma frente pelo nome. Se a dona não está viva (encerrada, morta ou sem registro) ou a frente está passada, esta sessão a fecha com as mesmas conferências, e a saída informa `A frente era da sessão <id>, já encerrada; esta sessão a fechou.` (ou `que não está viva (<motivo>)`, ou `A frente estava passada pela sessão sessao-t, sem dona; esta sessão a fechou.`).
- **Frente passada com tickets:** outra máquina pode tê-la retomado. O `close` primeiro assume a frente nos tickets, pelo mesmo procedimento de disputa da retomada, e só então a fecha. Se ela está ativa em outra máquina (ou já foi fechada lá), o comando fecha apenas o registro e o worktree locais, sem comentar nem alterar os tickets e sem alterar o histórico. Sem rede, recusa.
- **Fases:** a rede fica fora da trava do estado. Na primeira fase, sob a trava, ocorrem as recusas, as conferências de perda de trabalho e o `antesDeFechar`, e o registro da frente recebe a marca `fechando` com o processo do `close`. Na segunda, fora da trava, ocorrem a consulta ao GitHub (frente passada com tickets) e o comentário de fechamento. Na terceira, de novo sob a trava, o `close` reconfere, remove worktree e ramo, grava o histórico e retira o registro; o `push` que apaga o ramo remoto roda depois, fora da trava. Enquanto o processo do `close` vive, outro `close`, o `handoff`, o `takeover` e a retomada pelo `open` recusam a frente, e o quadro a mostra como `fechando`; com o processo morto, a marca deixa de valer e o `close` seguinte termina o fechamento. Na terceira fase (e para retirar a marca depois de uma recusa) o `close` espera a trava por até 30 s, como o `atualizar` (`AH_CLOSE_ESPERA_DA_TRAVA_MS` troca o valor, para ensaio). Limite no Windows: ali o harness não lê a hora de início de um processo, e a marca `fechando` se confere só pelo pid. O `close` tira a própria marca em toda recusa ou erro; só um `close` morto à força a deixa, e se o pid dele for reaproveitado por outro processo, a frente continua `fechando` enquanto esse processo viver. Saída: confirme que nenhum `ah close` está rodando e apague o campo `fechando` de `<estado>/frentes/<nome>.json`; o `close` seguinte termina sem comentar de novo.
- **Comentário de fechamento uma vez só:** o fato fica em `<estado>/fechamentos/<nome>.json`, gravado fora da trava, por troca atômica de arquivo, logo antes (`comentando`) e logo depois (`comentado`) do comentário, e apagado junto com o registro da frente. Se o `close` para depois disso (recusa, trava ocupada, processo morto), o quadro mostra a frente como `fechamento parado` e o `close` seguinte termina sem comentar de novo. Se ele parou no meio do comentário (`comentando`), o seguinte relê os tickets e comenta só nos que não têm o marcador `fechamento` da frente (ou não o têm na fila desta máquina); sem rede, recusa sem comentar. A marca vale para a frente no estado (`ativa` ou `passada`) em que ela estava quando o `close` comentou; se o estado mudou depois, o `close` seguinte confere de novo quem tem a frente e comenta de novo. A continuação de sessão no mesmo processo (ver "Vida da sessão") não passa uma frente com fechamento em curso ou parado: a frente fica com a sessão nova, com as marcas, e o resumo do início avisa `A frente as-1 carrinho está sendo fechada e ficou com esta sessão; …`.
- **Arquivo de frente ilegível:** um arquivo de outra frente que não se lê não impede o `close`, que emite o mesmo aviso do `open` (`… (rode ah doctor)`) e não toca no arquivo; o `close` da própria frente ilegível recusa com `Faça: rode ah doctor`.
- **Abertura parada:** com o registro `abrindo` e o processo do `open` morto, o `close` apenas desfaz a abertura: retira a reserva dos tickets em que ela pertence a esta frente (comentário `desistencia`), apaga o registro e lista o que restou para limpeza manual. Não grava linha no histórico nem faz commit. As reações das extensões também rodam nesse caminho: `antesDeFechar` antes de mexer nos tickets (pode recusar) e `depoisDeFechar` no fim, ambas com `ctx.aberturaDesfeita`. A leitura e a desistência nos tickets também rodam fora da trava do estado: antes delas, o registro `abrindo` passa a guardar o processo do `close`, de modo que outro `open` (ou `close`) da frente vê uma abertura em curso e recusa até o `close` terminar.

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
| `A frente as-1 carrinho está sendo fechada agora (processo <pid>).` | espere esse `ah close` terminar (o quadro mostra `fechando` enquanto ele roda); se a frente continuar no quadro, rode `ah close carrinho` |
| `A frente carrinho mudou durante o fechamento (…).` | rode `ah board` para ver como ela está; a saída diz se os tickets já receberam o comentário de fechamento |
| `Esperei 30000 ms pela trava "frentes" e ela não foi solta; o fechamento da frente as-1 carrinho parou antes de remover o worktree.` | espere o outro `ah` que segura a trava terminar e rode `ah close carrinho` de novo; com tickets, a recusa informa que eles já receberam o comentário de fechamento, e o `close` seguinte termina sem comentar de novo |
| `Não fechei carrinho: um ah close anterior parou no meio do comentário de fechamento, e preciso do GitHub para saber em que tickets ele saiu (…).` | tente de novo com rede; nada foi apagado |
| `O checkout principal não está no ramo base dev.` | rode `git switch dev` no checkout principal |
| `O checkout principal tem alterações em docs/agents/historico-das-frentes.md.` | faça commit ou descarte essas alterações |
| `Fechar a frente … perderia trabalho.` | lista o que se perderia (commits fora do ramo base e do remoto, arquivos soltos, itens ignorados) e o que fazer com cada um; os itens guardados por uma extensão vêm numa linha própria, com o comando dela |
| `Não fechei carrinho: há operações desta máquina na fila para #1 que precisam sair antes.` | tente de novo com rede; nada foi apagado |
| `Não fechei carrinho: preciso do GitHub para confirmar que ninguém retomou carrinho (…).` | tente de novo com rede; nada foi apagado |
| `Não consegui conferir …` | resolva o que o git descreve; nada foi apagado |
| `a extensão <nome> não deixa fechar a frente as-1 carrinho: <motivo>` | o `Faça:` da extensão (na `recursos`: `libere com ah recursos liberar --todos --frente carrinho e rode ah close de novo`); a reação `antesDeFechar` roda depois da primeira conferência de perda de trabalho, e nada foi apagado |
| `O worktree <wt> está trancado no git (<motivo>); o git não o remove.` | se ninguém mais o usa, `git worktree unlock <wt>` e rode `ah close` de novo; a conferência ocorre antes de mexer nos tickets, e nada foi apagado |
| `O worktree <wt> tem submódulos, e o git não remove worktree com submódulos.` | veja os commits dos submódulos que não estão em nenhum remoto (`git -C <wt> submodule foreach --recursive 'git log --oneline HEAD --branches --not --remotes'`) e empurre o que aparecer para o remoto do submódulo: os submódulos iniciados no worktree guardam os objetos na pasta `modules` dele, que a remoção forçada apaga, e o `git submodule status` não mostra o commit que só existe ali. Depois, `git worktree remove --force <wt>` e `ah close` de novo; a conferência ocorre antes de mexer nos tickets, e nada foi apagado |
| `O git não removeu o worktree <wt>: … (apareceu alteração ou arquivo novo depois da conferência?)` | confira o que apareceu (`git -C <wt> status`), guarde ou apague e rode `ah close` de novo. Com tickets, a recusa informa que eles já receberam o comentário de fechamento: a frente fica como `fechamento parado` no quadro, e o `close` seguinte termina sem comentar de novo |

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

**Início de sessão.** Registra a sessão com o pid do agente (`AH_PID_AGENTE` ou o processo pai do gancho) e a hora de início desse processo, executa a continuação (ver "Vida da sessão") e devolve ao agente um resumo curto: a sessão e o papel, a frente em foco e o worktree, avisos (`Sua frente as-1 carrinho está com a sessão sessao-d.`), frentes sem dona com a ação para cada uma (`Sem dona: as-2 carrinho (ah open carrinho)`; pela mesma regra do `sweep`, frente cuja dona tem registro ilegível fica de fora e gera o aviso `A frente as-2 carrinho: registro da dona ilegível (ah doctor).`), sobreposição de arquivos com outras frentes, quem está no pesado da máquina quando a fila não está vazia (`Pesado: rodando senha 2 (loja, carrinho, há 5 min); 1 esperando (tools/ah board).`), as demais frentes, o estado do checkout principal e as regras.

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
| T1 | no checkout principal (ou em pasta que o gancho não determina): `git switch main`, `git switch -c/-C/--orphan/--detach`, `git switch -`, `git checkout -b/-B/--orphan/--detach`, `git checkout -`, `git checkout feat/alheia` (palavra solta que é ramo, ramo do remoto ou etiqueta, mesmo que também seja um arquivo), `git checkout main --` (o `--` sem caminhos diz que é referência), `gh pr checkout 3` | `git switch dev` (a base), `git checkout -- README.md`, `git checkout README.md` (arquivo que existe); qualquer troca dentro de um worktree de frente | trabalhe no worktree de uma frente (`tools/ah open <nome>`); o checkout principal fica em `dev` |
| T2 | no checkout principal: `git add -A`, `.`, `-u`, `*` solto, caminho que resolve para a raiz ou acima (`cd src && git add ..`), `git commit -a`, `git commit .`; e `git add`/`git commit` com caminho ilegível (`git add $(git ls-files -m)`, `git add "$X"`) ou que chega pela entrada do `xargs` (`git ls-files -m \| xargs git add`); no texto relido que veio de palavra com expansão, as aspas simples de dentro não seguram o `$` (`bash -c "git add '$(pwd)'"`, `eval "git add '$X'"`: a camada de fora expande antes) | `git add README.md`, `git commit -m x`; caminho com `$` ou crase entre aspas simples ou escapado, que é texto e não expansão (`git add 'docs/$ver.md'`, `sh -c "git add 'a\$b'"`) | `git add <caminhos>` só com o que você mudou, ou trabalhe no worktree da frente; caminhos ilegíveis: escreva-os por extenso |
| T3 | no checkout principal: `git reset --hard/--keep/--merge`, `git clean -f` (sem `-n`), `git checkout -f`, `git checkout .` e `git restore .` (caminho que abrange tudo, ou ilegível), `git switch -f/--discard-changes`, `git stash` e `git stash pop/drop/…`, `git rebase main` | `git reset --soft HEAD~1`, `git clean -n`, `git restore README.md`, `git stash list`, `git stash show`, `git rebase --abort`, `git rebase --quit` | faça isso no worktree da sua frente; no checkout principal, guarde por caminho (`git add <caminhos>` e `git commit`) ou combine com a dona das mudanças |
| T4 | escrita no worktree (ou no ramo) da frente ativa de **outra sessão viva**: subcomando do git que escreve, executado nesse worktree (`cd <wt> && git commit -am x`, `git -C <wt> commit …`; vale para `add`, `commit`, `reset`, `checkout`, `switch`, `restore`, `rebase`, `merge`, `pull`, `push`, `stash`, `clean`, `cherry-pick`, `revert`, `am`, `apply`, `mv`, `rm`, `tag`, `notes`); `git branch -d/-D/-m/-M/-f feat/alheia`; `git worktree remove/move <wt>`; `rm`, `rmdir`, `touch`, `mkdir`, `tee`, `truncate`, `chmod`, `chown`, `chgrp`, `mv`, `cp`, `install`, `ln`, `sed -i`, `perl -i`, `dd of=` com destino lá dentro; redirecionamento (`echo x > <wt>/a.txt`); edição de arquivo pela ferramenta (`Edit`, `Write`, `NotebookEdit`). Com `rm -r`, `rmdir`, `mv` e `chmod/chown/chgrp -R`, também a pasta que contém o worktree (`rm -rf <worktrees>`). Caminho com curinga do shell (`*`, `?`, `[`) recusa quando pode casar o worktree alheio, algo dentro dele ou, nos comandos de árvore, uma pasta acima dele (`rm -rf <worktrees>/*`, `cd <worktrees> && rm -rf *`, `rm -rf <worktrees>/al?eia`); `rm -rf <worktrees>/x*` passa quando nenhum worktree alheio vivo casa. Como no shell, `*`, `?` e `[!…]` não casam o ponto do começo de um nome: com os worktrees em `<projeto>/.wt/`, `rm -rf *` em `<projeto>` passa, e `rm -rf .*`, `rm -rf .w*`, `rm -rf [.]wt` e `**` recusam; com `dotglob`, `globdots` ou `GLOBIGNORE` na própria linha (escritos com qualquer caixa, `_`, aspas ou escape: `setopt GLOB_DOTS`, `shopt -s dot\glob`), ou com `shopt`, `setopt`, `unsetopt` ou `set` de opção que não dá para ler (`shopt -s $o`), o curinga casa o ponto. O caminho é comparado depois de normalizado (link simbólico, `..`, `/private/var` × `/var` no macOS, caixa no Windows) | ler (`cat <wt>/a.txt`, `git -C <wt> status`, `cd <wt> && git log`, `git stash list`); escrever no worktree da própria frente; o worktree de frente passada, órfã ou de dona morta | escreva só no worktree da sua frente; para mexer em `alheia`, peça à sessão dona (`ah handoff`) ou, se ela morrer, `ah takeover alheia` |
| T6 | comando que casa com uma classe de `pesado.classes` (em qualquer posição: `a && npm run build`, `(cd x && npm run build)`, `bash -c 'npm run build'`, `env CI=1 npm run build`) rodado fora do `ah pesado`. Sem classes configuradas, nada | `tools/ah pesado -- npm run build`; dentro de um comando da fila (`AH_PESADO_ANINHADO` no ambiente do gancho, conferida na fila; como prefixo do texto, não); comando que não casa com padrão nenhum | `tools/ah pesado -- <o comando>` |
| T5 | `git push` para ramo protegido (ou destino que pode atingi-lo, ou sem destino com o ramo protegido em uso, inclusive depois de `git checkout main`, `git checkout main --` ou `git switch main` na mesma linha; `--all`, `--mirror`); `gh pr merge` cuja base é protegida, ou cuja base o gancho não consegue consultar em 5 segundos; o mesmo merge pela API (`gh api -X PUT repos/{owner}/{repo}/pulls/<n>/merge`, ou com `-f`, que vira POST), e pela API em repositório escrito por extenso (`repos/<dono>/<repo>/…`) ou vindo de `GH_REPO` (no prefixo ou na linha, como `export GH_REPO=…`) ou de `--repo`/`-R`, cuja base não dá para saber; `GH_REPO` vale também para o `gh pr merge` | `git push origin feat/carrinho`; `git switch dev && git push` (a troca deu certo antes do push, que roda na `dev`); `gh api repos/{owner}/{repo}/pulls/<n>/merge` (GET, só lê) | abra um PR e peça a ordem do executivo; empurre o ramo da frente |

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

**Continuação.** O agente pode trocar de sessão sem trocar de processo. No Claude Code, o `SessionStart` com `source` `clear`, `resume`, `compact` ou `fork` é continuação, e `startup` é início novo. No início de uma sessão, as sessões anteriores do **mesmo processo** (mesmo pid e mesma hora de início, conhecida nos dois lados) são substituídas, isto é, encerradas com `substituida`. Na continuação, a sessão nova herda as frentes delas (torna-se dona), o papel e o foco (eventos `substituida` e `heranca`). No início novo, as frentes delas ficam passadas, sem dona (evento `frente-solta`), e o resumo indica `ah open <nome>`. Exceção: a frente com um `close` em curso, ou com o fechamento parado depois do comentário nos tickets, nunca fica passada nessas trocas; vai para a sessão nova (evento `frente-em-fechamento`), e o resumo indica terminar com `ah close <nome>`.

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
| `frente-em-fechamento` | `sessao` (a velha), `frente`, `por` | gancho, começo ou continuação: a frente em fechamento passa à sessão nova sem ficar passada |
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
- T2: o `git add` que recebe os caminhos por `--pathspec-from-file`, e globs que cobrem tudo sem ser `*` solto (`*.*`, `[a-z]*`), passam. O que chega pelo `xargs` recusa como ilegível.
- T4: comandos que passam mesmo no worktree de outra sessão viva:
  - `git push origin :feat/alheia`, `git push origin --delete feat/alheia` e `git update-ref -d refs/heads/feat/alheia` (apagam o ramo alheio no remoto ou no local);
  - `find <wt> -delete`, `… | xargs rm`, `unlink`, `shred`, `rsync`, `tar -C <wt>`, `python -c "…"` e qualquer programa que escreva arquivo por conta própria (script, `npm`, compilador);
  - caminho relativo com pasta desconhecida (`cd "$X" && rm a`) e caminho com variável, crase ou `~` não são avaliados;
  - a leitura dos arquivos que `sed -i`, `perl -i` e `cp -t` escrevem é aproximada (opções raras podem confundir qual argumento é o arquivo).
- `cd <pasta>; <comando>`: o comando também é avaliado na pasta anterior, porque o `cd` pode falhar. Em `cd x && a; b`, o `a` é avaliado só em `x`, e o `b` em `x` e na pasta anterior. Um `cd` absoluto que certamente deu certo (seguido de `&&`, ou com `|| exit` depois) desfaz a pasta anterior, e o `git -C` absoluto não a leva junto: em `cd /w && git status; cd /w && git add -A`, o `git add` só roda em `/w`; com `cd` ou `git -C` relativo, a pasta anterior segue com ele (`cd /w; git -C sub add -A` também é avaliado em `<pasta anterior>/sub`). Depois de um `||` no meio da lista, o operando que pode rodar em mais de uma pasta é avaliado com pasta desconhecida.
- T5 e troca de ramo na mesma linha: só `git checkout` e `git switch` contam. A troca substitui o ramo em uso quando certamente deu certo antes do push (só `&&` entre as duas, inclusive dentro de subshell, chaves e `bash -c`) e o destino é com certeza um ramo (`switch`, `checkout -b`, `checkout <nome> --` sem caminhos, ou `checkout <nome>` em que o nome é referência); nos outros casos (`;`, `||`, `&`, `!`, pipeline, corpo de função, `trap`, `xargs`, `setsid`, `coproc`, lista com `exit`, `checkout` de nome que pode ser arquivo), o ramo anterior continua entre os possíveis. A substituição só descarta as trocas que certamente rodaram antes dela (de novo, só `&&` entre as duas): a de corpo de função, de `trap`, de segundo plano ou de `coproc` pode rodar depois (`f() { git switch main; }; git switch dev && f && git push`) e continua entre os possíveis. Troca de ramo dentro de apelido do shell (`alias`) ou de arquivo lido por `source` não é vista. Destino ilegível (`$RAMO`, `-`, `@{-1}`, `HEAD`) é tratado como ramo desconhecido, que recusa o push sem destino. Ramo trocado por outro meio (`git worktree add` seguido de `cd`, script) é lido do disco na hora da avaliação, antes de o comando rodar.
- T5 pela API: só a rota REST de merge do PR (`…/repos/<dono>/<repo>/pulls/<n>/merge`) com o endpoint escrito por extenso. Endpoint em variável, a mutação `mergePullRequest` do GraphQL (`gh api graphql`), outras rotas que mexem em ramo (`POST …/merges`, `PATCH …/git/refs/heads/<ramo>`) e o merge em outro servidor (`--hostname`, `GH_HOST`) passam; `GH_REPO` exportado fora da linha (no ambiente da sessão) não é visto.
- T4 e curinga: com `shopt -s dotglob` ligado fora da linha (no `.bashrc`, por exemplo), o curinga casa nomes ocultos que a trava supõe fora; ligar na própria linha é visto, salvo como opção ilegível de um shell novo (`bash -O $o -c 'rm -rf *'`).
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
- O `close` não remove worktree com submódulos: recusa antes de mexer nos tickets, e a remoção fica com quem usa (`git worktree remove --force`, que o `close` nunca usa). O `git submodule deinit` não basta, porque o git continua vendo a pasta `modules` do worktree.
- Windows e macOS: o código trata os três sistemas (caminhos, hora de início do processo, árvore de processos), mas a suíte só foi executada no Linux. O repositório não tem CI; a verificação é local (`npm run verifica`, no clone).
- A proteção efetiva é a proteção de ramo no servidor (GitHub). As travas locais evitam o erro antes que ele ocorra e indicam ao agente a ação correta, mas não substituem a proteção do servidor. O `ah init` e o `ah doctor` conferem que ela existe.

## Publicar

O trabalho entra no ramo base (`dev`) por merge local e `git push origin dev`. A publicação em teste e em produção é feita por um PR para `stage` e outro para `main`. O merge desses PRs é ato do executivo, e o agente não o executa por iniciativa própria. Quando a ordem é dada, o executivo (ou o agente, por ordem dele) mescla com `AH_GUARD=off gh pr merge <número>`. A T5 recusa o `gh pr merge` com base protegida, e o prefixo `AH_GUARD=off` registra explicitamente que a ordem foi dada.
