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
