# Pendências das fatias 0 a 5: execução da linha B (travas e leitor de shell)

Registro técnico dos itens 7 a 12 de `2026-11-13-pendencias.md`, no ramo `pend-b` a partir de `e4c621d`. Cada item foi conferido antes (a pendência existia nos seis), ganhou teste de recusa e de passagem visto falhando antes do conserto, e tem commit próprio. Suíte inteira verde antes de cada commit, salvo o teste de `teste/atualizar.test.mjs` que depende de o caminho do worktree conter "agent-harness" (falha esperada neste worktree, a única).

| Item | Estado | Commit |
|---|---|---|
| 7. Ramo anterior na T5 | feito | `32449bc` |
| 8. `$` ou crase entre aspas simples na T2 | feito | `4fac8bc` |
| 9. Curinga e pasta oculta na T4 | feito | `788d317` |
| 10. `cd` que falha no meio | feito (era passagem, não só teste faltando) | `5a3f88b` |
| 11. `gh api …/pulls/<n>/merge` na T5 | feito | `3229158` |
| 12. `xargs git add` na T2 | feito | `1c02c65` |

A seção das travas e dos limites de `docs/referencia/comandos.md` foi atualizada no commit deste registro.

## 7. Ramo anterior na T5

**Antes:** cada troca de ramo (`git checkout`/`git switch`) somava destinos a uma lista que sempre começava pelo ramo de antes; `git switch main && git pull && git switch dev && git push` era recusado (no worktree da frente, ou com a troca liberada no checkout principal), porque `main` nunca saía da lista.

**O que mudou:**
- `shell.mjs`: cada comando emitido leva `aposSucesso`, os comandos anteriores que certamente deram certo para ele rodar; `deuCerto(cmd, indice)` responde. Só `&&` encadeia. Representação em nós compartilhados (folha `{i}`, união `{a, b}`) para não copiar a lista a cada operando de uma cadeia longa.
- O que dá status 0 sem garantir que o comando rodou e deu certo não conta: `;`, `||` (depois do primeiro `||`, só vale o que vinha de fora da lista), `&` no fim, `!`, pipeline (vale só a última parte), `coproc`, corpo de função e texto de `trap` (rodam em outro momento), `xargs` (com `-r` pode não rodar) e `setsid` (pode voltar antes), e lista com `exit`, `return`, `logout` ou `exec` (contador `terminadores`: o último comando pode nem ter rodado). Subshell, chaves, `bash -c`, `eval` e `su -c` devolvem o da última lista.
- `travas.mjs`: a troca que certamente deu certo antes do push e cujo destino é ramo com certeza substitui os ramos possíveis; as outras somam, como antes. "Ramo com certeza": `switch`, `checkout -b/-B/--orphan`, `--track`, `checkout <nome>` quando `ctx.ehRef` diz que o nome é referência (o git prefere o ramo ao arquivo; `ehRef` só é chamado se algum push depois precisar). `HEAD` e `@` como destino passam a ser ramo desconhecido.

**Escolha:** o teste antigo "troca não afrouxa o ramo protegido que já estava em uso" afirmava que `git switch dev && git push`, com `main` em uso, recusava. Pelo item 7 o push roda na `dev`; o teste virou passagem, e o caso da troca que pode ter falhado (`git switch dev; git push`) ficou como recusa, com mais 16 vizinhos (`||`, `&`, `!`, pipeline, função, `bash -c` com `exit` ou `||`, `setsid`, `xargs -r`, `coproc`, `case`, chaves com outro comando no fim, checkout de nome que não é referência, destino `HEAD`).

## 8. `$` ou crase entre aspas simples na T2

**Antes:** `git add 'docs/$ver.md'` no checkout principal caía na T2 como caminho ilegível; o argv perdia a informação de aspas.

**O que mudou:** `shell.mjs` emite `literais`, os argumentos com `$` ou crase que vieram de palavra sem expansão (aspas simples, `\$`, `$'…'`). O mesmo texto vindo também de uma palavra que expande fica de fora (`git add 'a$b' a$b` continua ilegível). A T2 ignora esses argumentos na conta de "ilegível"; um literal ao lado de `.` continua recusando por "tudo".

**Não feito:** T3 (`git checkout -- 'a$b'`), T4 e o destino da T5 seguem tratando `$` literal como desconhecido (recusa ou não avalia); o item pedia só a T2.

## 9. Curinga e pasta oculta na T4

**Antes:** `rm -rf *` numa pasta acima de um diretório oculto (`<projeto>/.wt/frete`) era recusado, porque `*` casava `.wt`.

**O que mudou:** em `frenteDoCuringa`, componente do worktree que começa com ponto não casa padrão que começa com `*`, `?` ou `[!`/`[^` (regra do shell sem dotglob). Recusas mantidas: ponto escrito (`.*`, `.w*`, `.??`), lista entre colchetes (`[.]wt`, que o POSIX deixa em aberto), `**` (mantido conservador) e `rm -r` de uma pasta comum acima do oculto (`rm -rf /loja/*` com o worktree em `/loja/a/.wt/frete`). Com `dotglob`, `globdots` ou `GLOBIGNORE` no texto do comando, o curinga volta a casar o ponto.

**Limite:** dotglob ligado fora da linha (no `.bashrc`) não é visto; registrado em "Limites".

## 10. `cd` que falha no meio

**Antes:** a simulação do cwd numa lista `&&`/`||` guardava um cwd ou "vários" por status, e "vários" se perdia no fim. Em `cd /w && git status; git add -A`, o `git add -A` só era avaliado em `/w` e passava, embora rode no checkout principal se o `cd` falhar: era uma passagem, não só um teste faltando.

**O que mudou:** os status guardam conjuntos de cwds; no fim da lista, todos os cwds possíveis diferentes do sequencial viram alternativos. O operando que roda em mais de um cwd continua com cwd desconhecido (null), mas, se não muda o cwd, devolve o mesmo conjunto em que entrou (mais preciso que antes). Com o cwd de entrada desconhecido, um `cd` relativo deixava null em null e parecia não mudar nada; o contador `mudancasDeCwd` registra que mudou. `a` em `cd x && a; b` segue avaliado só em `x`.

## 11. `gh api …/pulls/<n>/merge` na T5

**O que mudou:** `travaT5Api` lê método (`-X`, `-XPUT`, `--method[=]`), campos (`-f`, `-F`, `--input`, que sem `-X` fazem o `gh` usar POST) e o endpoint (primeiro posicional; aceita `/` inicial, URL completa e `api/v3/`). Na rota de merge, método que não seja GET/HEAD (ou método em variável) passa pela conta da base do `gh pr merge` (`recusaPelaBase`, extraída de `travaT5Merge`). Dono e repositório escritos por extenso (podem ser outro repositório) ou número em variável recusam por não dar para saber a base. GET da rota (consulta se foi mesclado) e outras rotas passam.

**Limite mantido:** endpoint em variável e a mutação `mergePullRequest` do GraphQL não são avaliados (o leitor de texto não sabe o que o corpo da consulta faz sem ler GraphQL).

## 12. `xargs git add` na T2

**O que mudou:** `shell.mjs` marca `xargs: true` no comando que roda pelo `xargs`. A T2, com `git add`/`git stage`/`git commit` pelo `xargs` no checkout principal, recusa como ilegível, com o motivo "vêm da entrada do xargs" e a saída de escrever os caminhos por extenso. `xargs git add -A` segue com o motivo de "tudo". No worktree da frente, livre.

**Não feito:** `xargs git checkout --`/`git restore` (T3) e `xargs rm` (T4, limite declarado da fatia 2) seguem passando.

## Verificação

```
$ node --test teste/ 2>&1 | grep -E "ℹ (tests|pass|fail|skipped)|^✖"
✖ a cópia instalada sem --de recusa e diz o clone registrado; com --de entrega ao clone
ℹ tests 935
ℹ pass 933
ℹ fail 1
ℹ skipped 1
$ node ferramentas/varre-termos.mjs
Nenhum termo proibido encontrado.
```

A falha é a esperada (o caminho deste worktree não contém "agent-harness"). Base: 926 testes; o ramo acrescenta 9.

## Terceira revisão: consertos das travas

Achados da terceira revisão sobre os itens 7 a 10 (e dois fora deles), no ramo `rev3-travas` a partir de `bb26d99`. Para cada um: teste de recusa e de passagem visto falhando antes do conserto, commit próprio, suíte inteira verde antes de cada commit (salvo o teste de `teste/atualizar.test.mjs` que depende do caminho conter "agent-harness") e `node ferramentas/varre-termos.mjs` com código 0. A conta foi conferida com o `cmp.mjs` do revisor (base `e4c621d` contra o ramo).

| Achado | Estado | Commit |
|---|---|---|
| 1. Troca que roda depois no tempo descartada pela troca que deu certo (T5, item 7) | feito | `c177a8d` |
| 2. `$` entre aspas simples no texto relido que veio de palavra com expansão (T2, item 8) | feito | `3f711a2` |
| 3. Pasta alternativa não desfeita por `cd` absoluto nem por `git -C` absoluto (item 10) | feito | `eccccd6` |
| 4. Dotglob detectado no texto cru (T4, item 9) | feito | `bd2028c` |
| 5. `git checkout <ramo> --` sem caminhos; `GH_REPO` e `--repo` no merge pela API | feito | `1c52592` |

### 1. A troca que deu certo só descarta as que certamente rodaram antes dela

**Antes:** a troca que certamente deu certo antes do push descartava tudo o que vinha antes dela na lista, e a ordem da lista não é a do tempo: em `f() { git switch main; }; git switch dev && f && git push`, `trap "git switch main" DEBUG; git switch dev && git push`, `(sleep 1; git switch main) & git switch dev && sleep 2 && git push` e `coproc { sleep 1; git switch main; }; …`, a troca para `main` aparece antes e roda depois; o push ia para `main` e passava (a base recusava).

**O que mudou:** `novasTrocas` guarda o comando de cada troca; cada ramo possível lembra a troca de onde veio. A troca que substitui descarta o ramo de antes e só as trocas `t` com `deuCerto(<comando da troca que substitui>, t.indice)`, isto é, as que certamente rodaram antes dela (só `&&` entre as duas). Corpo de função e texto de `trap` já zeram o que deu certo (`garantidos`), e segundo plano e `coproc` não entram nele, então as trocas deles somam sempre.

**Outras formas conferidas:** `git switch dev && f() { …; } && f && git push`, a função definida por `eval`, `coproc git switch main;` e a troca dentro de `$( … )` depois da troca certa recusam. Não vistas (como na base): troca dentro de `alias` e de arquivo lido por `source` (o leitor não lê nenhum dos dois); registradas em "Limites".

**Custo:** `git switch main; git switch dev && git push` (no worktree da frente) passava no ramo e volta a recusar, como na base: o `;` não deixa o `deuCerto` garantir que a troca para `main` rodou antes da troca para `dev`. O caso do item 7 (`… && git pull && git switch dev && git push`) segue passando.

### 2. Texto relido que veio de palavra com expansão não tem literais

**Antes:** em `bash -c "git add '$(pwd)'"`, ``bash -c "git add '`pwd`'"``, `bash -c "git commit -m x -- '$PWD'"`, `eval "git add '$X'"`, `su -c "git add '$X'"` e `bash -c "bash -c \"git add '\$X'\""`, a camada de fora expande o `$` antes da releitura, mas o leitor via `'$(pwd)'` entre aspas simples e o marcava como literal; a T2 deixava passar no checkout principal (a base recusava).

**O que mudou:** `lerTexto` recebe `expandido` quando o texto veio de palavra com expansão e liga `ctx.textoExpandido`, que vale também para o que é relido dentro dele; nesse contexto, `literais` sai vazio. Vale para `bash -c`/`sh -c`, `su -c`/`--command=`, `eval`, `trap`, o texto do `echo` entregue a um shell (`echo "…" | sh`), o heredoc sem aspas no delimitador, o `<<<` com expansão e o `env -S` (cujas palavras passam a ser expansão quando a palavra de fora expande). Para o `env -S"…"` (valor junto da opção), `pularOpcoes` passa a entregar a palavra do valor junto também; com isso, `env -C$D`/`sudo -D$D` deixam de resolver `$D` como pasta literal.

**Passa como antes:** `sh -c "git add 'a\$b'"` (sem expansão na camada de fora), heredoc com delimitador entre aspas, `env -S "git add 'a\$b'"`.

### 3. `cd` absoluto e `git -C` absoluto desfazem a pasta alternativa

**Antes:** a pasta alternativa de um `cd` que pode ter falhado (item 10) só crescia: um `cd /w` posterior somava os destinos à lista em vez de trocá-la, e o `git -C /w` levava a lista junto. `cd /w && git status; cd /w && git add -A`, `cd /w && npm test; cd /w && git add -A && git commit -m x`, `cd /w && git status; git -C /w add -A`, `cd /w && git status; cd /w || exit; git add -A` e `cd /w && git status; cd /outro && git add -A` recusavam à toa (a base passava); `cd /w; cd /w && git add -A` e `cd /w; git -C /w add -A` já recusavam na base.

**O que mudou:** `lerAndOr` acompanha os alternativos como acompanha o cwd: em cada status (deu certo, falhou), um conjunto. O `cd` que dá certo troca os alternativos pelos destinos deles (no absoluto, todos convergem e somem); falhando, ficam os de antes; o negado e o `exit` seguem a regra do cwd. No fim da lista, os alternativos são os de todos os status. No `resolver`, `git -C`, `env -C` e `sudo -D` aplicam a mesma mudança de pasta a cada alternativo (`mapear`): com pasta absoluta somem; com relativa, vão junto, e `cd /w; git -C sub add -A` passa a ser avaliado também em `/r/sub` (recusa nova e certa: se o `cd` falhar, o `add -A` roda no checkout principal). O `bash -c` com `env -C` leva os alternativos mapeados em vez de zerá-los.

**Recusas que ficam (o `cd` pode falhar de novo):** `cd /w && git status; cd /w; git add -A`, `cd /w && git status; cd sub && git add -A`, `cd /w || true; cd /w || true; git add -A`.

### 4. Dotglob escrito de outro jeito

**Antes:** a detecção era uma expressão no texto cru com fronteira de palavra: `shopt -s dot\glob`, `shopt -s dotg''lob`, `setopt GLOB_DOTS` e `setopt glob_dots` (o zsh ignora caixa e `_` no nome da opção) passavam, e `rm -rf *` levava o worktree oculto (a base recusava tudo com `*`).

**O que mudou:** `ligaDotglob` procura `dotglob`, `globdots` ou `globignore` no texto cru e nos argumentos já lidos, sem aspas, barras invertidas, `_` e caixa (pega também `$'dot\x67lob'`, `NO_GLOB_DOTS` e `export GLOB""IGNORE=x`). Por precaução, `shopt`, `setopt`, `unsetopt` ou `set` com opção que não dá para ler (`shopt -s $o`, `shopt -s ${o}glob`, `set -o $o`) ou com o `-4` do zsh (GLOB_DOTS) também ligam; em `set`, o que vem depois de `--` (parâmetros posicionais) não conta. A detecção roda depois da leitura do comando.

**Limite:** opção ilegível passada a um shell novo (`bash -O $o -c 'rm -rf *'`) não é vista: o `bash -c` não sai como comando; registrado em "Limites".

### 5. Fora do escopo do ramo (já passavam na base)

**`git checkout <ramo> --` sem caminhos:** o `--` sem caminhos só diz que o nome é referência; `git checkout main -- && git push` mudava para `main` e passava na T5, e `git checkout main --` passava na T1. Em `destinoDaTroca`, o `--` sem caminhos depois conta como troca para o ramo com certeza (sem `ehRef`); com caminhos, segue checkout de arquivo. Em `checkoutTrocaRamo` (T1), o mesmo. `git checkout dev --` (a base), `git checkout main -- arquivo.txt` e `git checkout -- main` seguem passando.

**Repositório do `gh` vindo de fora do endpoint:** `GH_REPO=exemplo/outro gh api -X PUT repos/{owner}/{repo}/pulls/7/merge` e o mesmo com `--repo`/`-R` (antes ou depois do `api`) liam a base do PR 7 do repositório local. Agora o merge pela API recusa por não saber a base quando `GH_REPO` está no prefixo do comando, aparece na linha (`export GH_REPO=…; …`, `ctx.ghRepo`) ou há `--repo`/`-R`; `-R` deixou de ser lido como endpoint. `GH_REPO` vale também para o `gh pr merge`. O GET da rota segue passando.

**Não feito (registrado em "Limites"):** `--hostname`/`GH_HOST` (merge em outro servidor), `POST …/merges` e `PATCH …/git/refs/heads/<ramo>` pela API, e `GH_REPO` exportado fora da linha.

### Verificação

```
$ node --test teste/ 2>&1 | grep -E "ℹ (tests|pass|fail|skipped)|^✖"
✖ a cópia instalada sem --de recusa e diz o clone registrado; com --de entrega ao clone
ℹ tests 965
ℹ pass 963
ℹ fail 1
ℹ skipped 1
$ node ferramentas/varre-termos.mjs
Nenhum termo proibido encontrado.
```

A falha é a esperada (o caminho deste worktree não contém "agent-harness"). Antes desta rodada: 957 testes; ela acrescenta 8.
