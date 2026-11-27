# Método, fatia 5: orquestração — registro de execução

Execução do plano `2026-11-27-metodo-fatia-5.md` no ramo `p2-orquestracao` (worktree `~/projetos/agent-harness-p2-oq`), em 27/11/2026, por uma sessão secundária do Claude Code (Opus 5.5), com execução na própria conversa (`executing-plans`) e um revisor novo (subagente) sobre o ramo inteiro no fim.

## Decisões do orquestrador (27/11)

| # | Decisão |
|---|---|
| E1 | `tools/ah pede-revisao <ramo> [--json]`, determinístico e com teste |
| E2 | Invólucro do `gh` só do ensaio (`teste/orquestracao-ensaio-gh.mjs`), sem mexer no apoio comum |
| E3 | Ensaio com `claude -p --permission-mode acceptEdits` e `--allowedTools` restrito, sem `bypassPermissions`; laboratório em `/tmp/ah-lab-orquestrar`; token lido na hora |
| Texto | Relatório como comentário no ticket de decisões e, quando longo, em `docs/orquestracao/<data>-<assunto>.md` com a confirmação do humano; `registros guardar` e `prova` citados "com a extensão ligada" |
| `--frente` | `ah prova <rótulo> --frente <nome>`, feito no `p2-opcionais` (09097e5) e trazido por merge: a orquestradora não troca o foco entre frentes próprias (`ah open` de frente própria recusa), e a prova gravava só na frente em foco. Registrado também no registro da fatia 8 |

## Commits

| Commit | Conteúdo |
|---|---|
| 2c850ec | Merge das pendências da fatia 8 (p2-opcionais) |
| 9fc0317 | Plano |
| 4c3150f | Task 1: `ah candidatos` |
| ed1f9a5 | Task 2: `ah pede-revisao` |
| cc2f4bc | Task 3: skill `orquestrar`, `executor.md` e o teste estrutural |
| 05df171 | Merge do `--frente` do `ah prova` (p2-opcionais, 09097e5) |
| 90015a5 | Task 4: laboratório do ensaio (o `gh` do ensaio e a montagem) |
| c838247 | Consertos da revisão final |
| (este) | Registro |

## Desvios do plano

- `motivoDeFora(daDeps, doGh, config)`, não a assinatura do plano: o `deps` traz frente e bloqueio; o `gh`, corpo e comentários.
- O invólucro do `gh` do ensaio também formata `issue view` e `issue list` sem `--json`, porque o `gh` falso devolve só o número e o estado nesse caso, e um agente real lê o texto.
- `--frente` no `ah prova` (acima), achado ao escrever o passo 6 da skill.

## Ensaio: pendente de autorização do professor

A rodada do agente **não foi feita**. O classificador de permissões da sessão executora negou o comando que lê o token de acesso do professor (`.claude/.credentials.json` na pasta pessoal dele, campo `claudeAiOauth.accessToken`) e o passa ao `claude` isolado (`CLAUDE_CODE_OAUTH_TOKEN`), por acesso não autorizado. A negação não foi contornada, e nenhuma outra sessão rodou o comando no lugar desta.

O laboratório foi montado e conferido sem agente, em 27/11, com o Claude Code 2.1.332 instalado na máquina:

```
$ node teste/orquestracao-ensaio-montar.mjs /tmp/ah-lab-orquestrar
$ cd /tmp/ah-lab-orquestrar/loja && . ../ambiente.sh && AH_SESSAO=ensaio-conferencia tools/ah candidatos
Candidatos (rótulo ready-for-agent, sem "A decidir"):
#13 Carrinho vazio mostra mensagem
#12 Total do carrinho com desconto
Fora:
#16 Página de ajuda: sem o rótulo ready-for-agent
#15 Cupom no checkout: bloqueada
#14 Frete por região: "A decidir" num comentário de carla
```

O que a montagem faz: uma loja de mentira (`src/carrinho.mjs`, dois testes `node --test`) com remoto local; o harness instalado deste clone (`init --sigla as --sem-protecao`); as extensões `orquestracao`, `modelo` e `prova` (`unit` = `npm test`) ligadas; a skill `orquestrar` copiada à mão para `.claude/skills/`; cinco tickets no arquivo do `gh` falso; `HOME`, `CLAUDE_CONFIG_DIR`, estado, worktrees e fila dentro do laboratório; um `gh` no `PATH` que chama o invólucro do ensaio. O `ambiente.sh` gerado não tem token.

### Para rodar (o professor, com a credencial dele, ou autorizando a sessão)

Laboratório novo (a pasta não pode existir), na raiz deste clone:

```sh
rm -rf /tmp/ah-lab-orquestrar
node teste/orquestracao-ensaio-montar.mjs /tmp/ah-lab-orquestrar
```

Rodada (o token é lido na hora e não vai para arquivo; o arquivo de credenciais é renovado pela sessão do professor, então cada rodada lê de novo):

```sh
CREDENCIAIS="$HOME/.claude/.credentials.json"   # o HOME de verdade, antes de o ambiente.sh trocá-lo
cd /tmp/ah-lab-orquestrar/loja && . ../ambiente.sh && \
CLAUDE_CODE_OAUTH_TOKEN="$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).claudeAiOauth.accessToken)' "$CREDENCIAIS")" \
timeout 2700 claude -p "Orquestre os tickets prontos deste projeto com a skill orquestrar, distribuindo a subagentes; não publique nada." \
  --permission-mode acceptEdits \
  --allowedTools "Bash(tools/ah:*)" "Bash(git:*)" "Bash(node:*)" "Bash(npm test:*)" "Bash(gh:*)" Agent Read Edit Write Glob Grep \
  --output-format stream-json --verbose > ../saida.jsonl 2> ../erro.txt
```

O que conferir depois, com o `ambiente.sh` carregado, no `loja/`:

- `git log --first-parent --oneline dev`: dois merges `--no-ff`, um por ticket (#12, #13);
- `npm test` verde na `dev`, com os testes novos dos dois tickets;
- `AH_SESSAO=conferencia tools/ah board`: nenhuma frente aberta;
- `gh issue view 12` e `gh issue view 13`: fechados com o commit; `gh issue view 14`, `15` e `16`: abertos;
- um ticket novo de decisões, com o #14 numa linha e o relatório como comentário;
- `git status` do principal limpo, e nada fora de `/tmp/ah-lab-orquestrar` alterado;
- da `saida.jsonl`: se a skill seguiu os sete passos, os subagentes ficaram no worktree da frente, o `tools/ah modelo` foi consultado, e o custo informado no fim.

Depois, apagar `/tmp/ah-lab-orquestrar`.

## Revisão final

Um subagente revisor (Opus), sem o contexto da execução, revisou `2c850ec..90015a5` e reproduziu os achados em projetos descartáveis. Ele não rodou o Claude Code e não leu `~/.claude`. Foi consertado no commit c838247, cada item com teste que falhou antes:

- **(crítico)** A frente entregue a uma sessão ociosa não fechava. A sessão continuava viva e dona, e a reintegração no worktree (trava T4), a prova e o `close` recusavam. O `close` ainda mandava pedir à dona que fechasse, o que contradiz o texto de quem executa. Agora a sessão passa a frente com `tools/ah handoff <frente> --nota "entregue: …"` ao terminar, e a orquestradora só fecha frente passada.
- O texto não dizia como o subagente fica no worktree. No Claude Code, a pasta do shell do subagente volta à da orquestradora a cada comando. Com isso, um `tools/ah pesado -- npm test` testaria o checkout principal, e nenhuma trava separa os subagentes da mesma sessão. Agora todo comando começa com `cd <worktree> &&` e os caminhos são absolutos.
- Um ticket reservado em outra máquina (com o rótulo `em-andamento`) saía como candidato, porque o `deps` só conhece as frentes desta máquina. Agora fica de fora, com o motivo.
- A lista dos prontos pedia os comentários de até 200 tickets numa chamada só, o que pode passar de 1 MiB e cair no limite do processo. A recusa ainda mandava conferir o login. Agora os comentários são lidos um ticket por vez, só dos que passaram no resto, e a falta de espaço ou de tempo tem recusa própria.
- O `pede-revisao` deixava de pedir revisão em três casos:
  - nome com acento: o git devolve o nome entre aspas;
  - arquivo movido para fora do caminho marcado: só aparecia o destino;
  - padrão com barra no fim: valia diferente do `--caminhos` do núcleo.

  Agora o nome vem sem aspas, os dois lados do movimento contam, a barra final vale "tudo abaixo" e padrão com `./` ou `/` é recusado.
- A skill não dizia como ligar a sessão listada pelo agente ao id do `--para`. Agora diz: peça à sessão que rode `tools/ah whoami`.
- A retomada de uma orquestração parada não estava coberta. Agora está: as frentes passadas ou órfãs são retomadas ou vão ao ticket de decisões.
- Reclassificados de menor para importante, porque deixariam um agente sem contexto parado ou levariam a um motivo falso:
  - o `candidatos` ignorava os avisos e o limite do `deps`; um pronto fora da lista de 200 saía como "sem o rótulo". Agora há aviso de lista incompleta;
  - não estava dito quem corrige achados e conflitos, e o teste rodava duas vezes com a prova ligada;
  - o `git push` sugerido pelo `close` é publicar;
  - checkout principal sujo não se descarta;
  - o board não mostra sobreposição entre um ticket e as frentes.

Ficaram, para o orquestrador decidir:

- a marca casa por trecho ("nada a decidir" também tira o ticket); a referência agora diz como liberar o ticket, mas a busca continua por trecho;
- a conferência da dona no `prova --frente` fica fora da trava durante o teste; frente em `abrindo` de outra sessão passa; `ah prova --frente x unit` recusa como rótulo inválido sem dizer a ordem; falta teste de frente passada ou órfã aceita;
- o teste estrutural da skill confere o nome do comando, não as opções, e a lista `registros` não falha quando o comando chegar;
- o `gh` do ensaio não aceita `-t`, `-b`, `-l` nem `--label a,b`, não tem trava, e o `ambiente.sh` usa aspas de JSON;
- o `gh issue view --json comments` pode limitar os comentários por ticket (não verificado);
- fora do julgamento do revisor: os nomes e o comportamento das ferramentas do Claude Code na tabela (`Agent` com `model`, `SendMessage` entre sessões, `ListAgents`, `ScheduleWakeup`), a confirmar no ensaio; fechar o ticket citando um commit só local, que é decisão de desenho.

## Limitações

- O ensaio com agente real não rodou (acima): o texto da skill foi conferido só pelo teste estrutural e pela revisão.
- `tools/ah registros guardar` é citado na skill e no texto de quem executa, mas vem de outra frente; o teste estrutural o aceita por uma lista explícita até a integração.
- `candidatos` lê até 200 tickets com o rótulo de pronto.
- Não ensaiado no Windows.

## Verificação

```
$ node ferramentas/verifica.mjs --node "$(mise where node@22)/bin/node" --node "$(command -v node)"   # código 0, 27/11
ok      suíte no Node v22.23.5: 1081 testes, 1080 passaram, 0 falharam, 1 pulados
ok      suíte no Node v26.13.1: 1081 testes, 1080 passaram, 0 falharam, 1 pulados
ok      varredura de termos
Sistema: linux. Windows e macOS não são verificados aqui (o repositório não tem CI).
```
