# Fatias 3 e 4 do método: registro da execução

Plano: `docs/superpowers/plans/2026-11-26-metodo-fatias-3-e-4.md`. Ramo `p2-registros-modelo`, worktree `~/projetos/agent-harness-p2-rm`, a partir de `p2-metodo`. Executado na própria sessão (sem subagentes de implementação), tarefa por tarefa, com testes primeiro.

## Commits

| Tarefa | Commit | O quê |
|---|---|---|
| Plano | `044e674` | plano aprovado pelo orquestrador em 26/11 |
| 1 | `f47f937` | P2: `ctx.sessao(id)` e a opção `sessoes` do `ctxFalso` |
| 2 | `88e1bdf` | P5: `ignorados(ctx)` (descartável ou guardado) e o `close` |
| 2 (revisão) | `b41db9b` | pasta-mãe ignorada inteira pelo projeto (`.superpowers/` no `.gitignore`) listada item a item; documentação da revisão |
| 2 (re-revisão) | `dc5ffe5` | a pasta-mãe vai ao git como caminho literal (`--literal-pathspecs`) |
| 3 | `5d20b57` | extensão `modelo` e os padrões datados |
| 4 | `773c57f` | `registros/diario.mjs`: leitura e formato do diário |
| 5 | `9b8fbf2` | `ah registros guardar`, `ignorados` e `aoPassar` |
| 6 | `839bb42` | retomada, resumo no fechamento e lembrete do começo de sessão |
| 3 a 6 (revisão) | `6841764` | consertos locais da revisão: validação do marcador, cópia cortada mantida, `ignorados` só das pastas de plano, parada na primeira falha de rede, `\r\n`, avisos honestos; `origem: null` na `modelo` |
| 3 a 6 (decisões) | `ce3cfd7` | marcador v=2 (`em`, `fase`), retomada pelo diário de passagem mais novo, `registros devolver`, só autor com marcador do núcleo |
| 3 a 6 (segunda revisão) | `833a755` | fonte que junta ticket e cópia pelo `em`, cópia pendente nunca trocada, tickets iguais marcados, fase e data do pendente no close, `.gitignore` que sobra, arquivos versionados preservados, mensagens do `devolver`, marcador antigo do núcleo |

## Ensaio do git (Tarefa 2)

Com git 2.56.0, num repositório descartável com só `.superpowers/sdd/plano-a/progress.md` e o `.gitignore` com `*` que o `sdd-workspace` grava, `git ls-files -z -o -i --exclude-standard --directory` lista `.superpowers/`, `.superpowers/sdd/`, `.superpowers/sdd/.gitignore` e `.superpowers/sdd/plano-a/`. Com outro ignorado em `.superpowers/` (`x.log` excluído por `.git/info/exclude`), ele também aparece na lista. Com um arquivo não ignorado em `.superpowers/` (`brainstorm/x`), a pasta-mãe sai da lista de ignorados (vira `?? .superpowers/` no `status`). Daí a regra: a pasta-mãe de um declarado casa só quando há itens dela na lista e todos casam.

## Ensaio do pathspec (re-revisão da Tarefa 2)

Com git 2.56.0: `git ls-files -o -i --exclude-standard -- 'a[1]/'` e `-- 'b*/'` devolvem só o conteúdo da pasta de nome literal, mesmo com `a1/` e `bx/` ao lado (o git casa primeiro o caminho literal que existe). Já `-- ':x/'` não devolve nada: o `:` no começo é lido como pathspec mágico. Com `--literal-pathspecs`, os três casos dão o conteúdo da pasta. O teste do close cobre `a[1]/` (com `a1/` ao lado) e `:dados/`; só o segundo falhava antes do conserto.

## Padrões de modelo (Tarefa 3)

Conferidos em 27/11/2026 (madrugada, UTC 03h), na documentação oficial de cada agente, lida por um subagente de busca; nos trechos em que a página foi cortada, a leitura veio do resumo da ferramenta, e isso vai marcado. Versões instaladas nesta máquina: Claude Code 2.1.332, codex-cli 0.172.0, OpenCode v2.4.2.

### Claude Code

- Fontes: <https://code.claude.com/docs/en/model-config>, <https://code.claude.com/docs/en/sub-agents>.
- Aliases do campo `model` e de `--model`: `default`, `best`, `fable`, `sonnet`, `opus`, `haiku`, `sonnet[1m]`, `opus[1m]`, `opusplan` (literal). "The `opus`, `sonnet`, and `haiku` aliases resolve to the newest version on the Anthropic API" (literal); na API da Anthropic, Opus 5.5, Sonnet 5.5 e Haiku 5.5.
- Esforço: `--effort`, chave `effortLevel`, variável `CLAUDE_CODE_EFFORT_LEVEL`; valores `low`, `medium`, `high`, `xhigh`, `max`; a chave `effortLevel` não aceita `max` (resumo da ferramenta).
- Subagente: `model` aceita `sonnet`, `opus`, `haiku`, `fable`, id completo ou `inherit`; `effort` com `low`, `medium`, `high`, `xhigh`, `max`, conforme o modelo (literal).
- Escolha: `alto` = `opus`/`high`; `medio` = `sonnet`/`medium`; `leve` = `haiku`/`low`. Os aliases acompanham a versão nova sem o padrão envelhecer.

### Codex

- Fontes: <https://learn.chatgpt.com/docs/models>, <https://learn.chatgpt.com/docs/config-file/config-reference>, <https://learn.chatgpt.com/docs/developer-commands?surface=cli> (as páginas de `developers.openai.com/codex/` redirecionam para elas com 308).
- Modelo: `-m, --model` e a chave `model` do `config.toml`; esforço: a chave `model_reasoning_effort`, que o `-c chave=valor` sobrepõe na linha de comando (resumo da ferramenta).
- Conferência local, porque a lista de modelos veio do resumo: o `~/.codex/models_cache.json` do codex-cli 0.172.0 (lido em 27/11, `fetched_at` 2026-11-27T03:07Z) descreve `gpt-6.2-astra` como "Our most capable model for complex coding and professional work", `gpt-6.2-sol` como "Fast, go-to model for coding and everyday work" e `gpt-6-luna` como "Fast and affordable model for easier tasks", com os esforços `low`, `medium`, `high`, `xhigh`, `max` nos três (e `ultra` nos dois primeiros).
- Escolha: `alto` = `gpt-6.2-astra`/`high`; `medio` = `gpt-6.2-sol`/`medium`; `leve` = `gpt-6-luna`/`low`.

### OpenCode

- Fontes: <https://opencode.ai/docs/models/>, <https://opencode.ai/docs/agents/>, <https://opencode.ai/docs/config/>.
- Modelo: `provider/model` com `#variant` opcional; `opencode run --model …`; a chave `model` da configuração; num agente, o campo `model` (literal). Exemplos da documentação: `anthropic/claude-sonnet-5-5`, `openai/gpt-6.1-sol#high`.
- Esforço: só pela variante. "Variant names come from the selected model's current catalog metadata. Names such as `low`, `high`, and `max` are not available for every model, and an unknown variant produces a model-resolution error" (literal). A raiz `model` não guarda a variante.
- Esta máquina não tem o provedor `anthropic` configurado (o `opencode models` lista `opencode-go/…`), e as chaves estavam vencidas em 26/11: não deu para conferir as variantes no catálogo.
- Escolha: `alto` = `anthropic/claude-opus-5-5`; `medio` = `anthropic/claude-sonnet-5-5`; `leve` = `anthropic/claude-haiku-5-5`, todos sem variante (esforço `null`, "padrão do agente"). Decisão de quem constrói: um padrão com uma variante que o catálogo do aluno não tenha quebraria a execução, e o projeto acrescenta a variante na configuração depois de conferir o catálogo dele.

## Revisão das Tarefas 3 a 6 e decisões (27/11)

Um revisor novo (opus) leu os commits `5d20b57` a `839bb42` e reproduziu, num teste descartável, cinco defeitos importantes da `registros`: a retomada devolvia o diário velho do próprio worktree depois de uma ida e volta entre máquinas; o diário tirado de propósito pelo `guardar` voltava na retomada; a retomada pelo ticket seguida de handoff comentava o mesmo diário de novo; qualquer comentário com o id da frente virava `progress.md` (canal de injeção num repositório público); e o `guardar` de um plano com tarefa parada apagava o diário sem aviso, fazendo o plano recomeçar do zero. O orquestrador decidiu (27/11):

1. marcador v=2 com `em` e `fase`; a retomada usa o comentário de passagem mais novo entre todos os tickets; o diário do worktree só é trocado quando é igual à cópia desta máquina; a cópia é reserva; ao devolver do ticket, a cópia sabe que ele já está lá;
2. `tools/ah registros devolver`; o `guardar` com tarefa parada avisa esse próximo passo; o lembrete só pede o `guardar` antes do `close`;
3. só vale o diário de quem tem marcador do núcleo na frente naquele ticket (a mesma regra de autor do núcleo); pasta e plano do marcador validados.

Os consertos locais foram aprovados como propostos. Ficaram com o orquestrador: a seção 8 da spec (que ainda diz que o `guardar` remove `.superpowers/sdd/` inteira) e a criação de `docs/agents/metodo.md` (fatia 2), para onde a `modelo` aponta os critérios.

## Travamento do `teste/pesado.test.mjs` (27/11, pedido do orquestrador)

**Sintoma.** Três vezes no dia, com duas ou mais suítes ao mesmo tempo e carga de 13 a 30, um `npm test` ficou parado por mais de 25 minutos. Os processos presos no worktree `p2-metodo` (não mexidos, por decisão do professor) mostraram a cadeia `npm test` → `node --test` → arquivo `pesado.test.mjs` → um `ah pesado` sem filho, esperando a vez da tarefa `w` do teste "trava da fila com dono morto não derruba quem espera", com a pasta do teste já apagada (`cwd` marcado `(deleted)`).

**Causa, em três peças.**
1. Sob carga, um `esperar` de 8 s do teste estourou, e o teste falhou no meio, com o `ah pesado` de `w` ainda esperando, iniciado ao fundo.
2. O `limpar` do projeto de teste (`teste/apoio/repo.mjs`) apagava a pasta, com a fila dentro, mas não encerrava os processos iniciados ao fundo. O `ah pesado` seguiu vivo, e o processo do arquivo de teste não termina enquanto um filho dele vive: a suíte inteira ficou presa.
3. Defeito do produto: com a pasta da fila apagada, o `ah pesado` recria a pasta, lê um estado vazio e recebe "a senha não está na fila" a cada passada, para sempre. O mesmo vale fora dos testes, quando alguém apaga o `fila.json` (como a recusa de estado ilegível manda) com um pesado esperando.

As outras suspeitas não se sustentaram: a memória livre vem de `AH_FILA_MEMORIA_LIVRE_MB=100000` em todo projeto do teste; o sinal de vida da fila é o pid com a hora de início lida em `/proc`, que não vence com a carga. Sob carga artificial (32 laços ocupados em 16 núcleos, três rodadas do arquivo em paralelo) o travamento não se repetiu, por isso cada peça foi provada por teste determinístico.

**Conserto.**
- `nucleo/comandos/pesado.mjs`: senha que some da fila vira recusa (`A senha <n> sumiu da fila de pesados (…); não rodei o comando.` / `Faça: rode o comando de novo`), em vez de espera sem fim. Teste: o `fila.json` apagado com um pesado esperando; antes do conserto, o processo ainda esperava depois de 15 s.
- `teste/apoio/repo.mjs`: o `limpar` (e a saída do processo de teste) encerram os processos iniciados por `ahAoFundo`: SIGTERM, para o `ah pesado` matar a árvore do comando e soltar a vaga, e SIGKILL para quem não sai em 3 s. Teste: um pesado segurando a única vaga e outro esperando; antes do conserto, os dois seguiam vivos depois do `limpar`. Todo teste que usa `ahAoFundo` chama o `limpar` por `t.after` (direto ou pelo auxiliar `projeto(t)`), que roda mesmo quando o teste falha ou estoura o prazo.
- `teste/pesado.test.mjs`: o `esperar` passa de 8 s para 30 s.
- Prazo global descartado, depois da revisão do orquestrador (27/11). O `--test-timeout=120000` do primeiro conserto saiu: no Node 22.23.5, o mínimo do `engines`, ele vale para o arquivo de teste inteiro, e não para cada teste (com dois testes de 2 s e prazo de 3 s, o segundo nem roda e o arquivo sai cancelado; o `close.test.mjs` sozinho leva 65 s no Node 22), e o arquivo é morto sem rodar `t.after` nem `process.on('exit')`, o que deixa `ah pesado` órfãos com PPID 1. O ensaio do primeiro conserto foi feito com um arquivo de um teste só, e por isso não mostrou a diferença. O `--test-force-exit` também ficou de fora: numa rodada da suíte inteira ele encerrou arquivos antes do fim e a suíte perdeu 20 testes (1048 em vez de 1068), sem acusar falha; noutra, os 7 últimos do `travas.test.mjs`. O travamento não volta pela causa real, que está consertada acima.
- `ferramentas/verifica.mjs` montava a própria linha de comando; passa a repassar as opções `--test-*` do `package.json` (`argumentosDaSuite`), com teste de que as duas linhas coincidem e de que nem o prazo nem a saída forçada estão lá.
- Revisão do `limpar` (27/11): a primeira versão esperava 3 s num laço síncrono perguntando ao sistema se o pid existia. O filho que já morreu fica zumbi até o Node o recolher, então todo encerramento virava SIGKILL aos 3 s, e o `ah pesado` levava SIGKILL antes de terminar de matar a árvore (3 s de SIGTERM no grupo e mais 2 s de SIGKILL, em `matarArvore`): um comando que ignora SIGTERM sobrevivia e prendia o pai pelo pipe. Agora o `limpar` devolve uma promessa, espera o evento `exit` de cada processo com folga de 8 s antes do SIGKILL e, antes de apagar a pasta, manda SIGKILL aos grupos de comando registrados nos `fila.json` do teste (com a hora de início do líder conferida). Sem processo ao fundo vivo, apaga na hora, como antes. Testes: o `limpar` com dois pesados que saem no SIGTERM leva menos de 2,5 s; o comando que ignora SIGTERM sai; o grupo órfão de um `ah pesado` morto com SIGKILL é morto (falha sem o conserto). Os três são do POSIX: no Windows, o SIGTERM termina o processo na hora e o pesado não mata a árvore.

**Outro teste sensível à carga, fora deste ramo:** `teste/estado.test.mjs:250` ("revisão: a liberação não apaga a trava que outro processo pegou no meio dela") falhou uma vez na suíte inteira, com carga 10 a 15; sozinho, passou 6 vezes em 6. Fica para o orquestrador.

## Revisão final de ponta a ponta: C1, I1 e I2 (27/11)

Itens da revisão `docs/superpowers/plans/2026-11-27-metodo-revisao-final.md` (ramo `p2-metodo`, commit 3c79fe8), passados pelo orquestrador a este ramo.

- **C1, crítico: id forjado apagava pasta fora do estado.** Um `ah:passagem` com `id=../../../vitima`, comentado depois da passagem verdadeira, era aceito pela retomada, e a `registros` usava o id como pasta e a apagava no `close`. Duas camadas: (1) no núcleo, `idValido` (`^[a-z]{2,4}-\d+$`, em `nucleo/lib/frente.mjs`) e `nomeValido` passam a valer para todo marcador lido dos comentários (`marcadoresDosComentarios`, `nucleo/lib/reserva.mjs`): marcador fora do formato não vale, como o de terceiro; (2) na `registros`, todo caminho montado com o id da frente ou a pasta do plano passa por `dentroDe` (`path.relative` contra `<estado>/registros/`) e, fora dela, a extensão não grava nem apaga. Testes: o caso reproduzido no `retomar.test.mjs` (os forjados com número de comentário maior que os verdadeiros; antes do conserto, a retomada tomava `../../../vitima`), e a extensão chamada direto com o id forjado, sem tocar na pasta vítima.
- **I1: o `guardar` apagava o que não guardou.** A cópia de cada plano passa a levar, em `arquivos/`, todos os arquivos da pasta do plano que o git não versiona, e o worktree perde só o que foi copiado. Pasta de plano sem diário (só `plan-path` e instruções) não é copiada: fica, com aviso, e o `close` recusa por ela na linha de sempre (a extensão só declara ao `close` as pastas com `progress.md`).
- **I2: diário ao ticket sem filtro.** `mascararSegredos` troca por `[removido]` chave privada PEM, tokens do GitHub, `sk-…`, `AKIA…`, `NOME=valor` com nome de variável de segredo e a senha de `usuário:senha@` em URL, antes do corte, no diário e no resumo do fechamento; o `guardar`, o handoff e o `close` avisam quantos trechos tiraram. O limite está escrito em `comandos.md`: é uma rede, não garantia; caminhos absolutos da máquina não são tirados. Os valores de teste são montados por partes, para nenhum parecer um segredo de verdade no repositório.

## Revisão de segurança do 57ceb4c (27/11)

- **I1 de novo:** a cópia levava a pasta do plano inteira, mas o `close` apaga `<estado>/registros/<id>/` depois de comentar, e um arquivo do aluno na pasta do plano sumia com a cópia (o revisor reproduziu com `notas-do-aluno.md` e `log.txt`: `guardar`, `close` com código 0, notas apagadas). Decisão do orquestrador, opção (b): o `guardar` copia e tira só o que o subagent-driven-development 7.0.2 grava na pasta do plano, conferido no cache da skill (`progress.md` e o leitor dele; `plan-path`, do `scripts/sdd-workspace`; `task-<N>-brief.md`, do `scripts/task-brief`; `task-<N>-report.md`, que o SKILL.md manda o implementador escrever; `review-<base7>..<head7>.diff`, do `scripts/review-package`). O resto fica no worktree, com aviso, e o `close` recusa por ele na linha de sempre. Teste: `guardar` e `close`, e o arquivo do aluno continua lá.
- **Filtro:** nomes simples (`PASSWORD=`, `SECRET=`, `TOKEN=`, `APIKEY=`, `PASSWD=`), `Bearer <token>` e `password=`, `api_key:` em minúsculas passam a ser mascarados.
- **Menores:** a cópia local nasce com 0700 nas pastas e 0600 nos arquivos; arquivo acima de 5 MB e link simbólico (lido com `lstat`, nunca seguido, inclusive o `progress.md`) ficam no worktree, com aviso.
- **Pendência do orquestrador para o professor, resíduo do C1 no núcleo:** um terceiro sem acesso ao repositório comenta um marcador bem formado com o próprio login (por exemplo `<!-- ah:passagem id=as-1 nome=carrinho ramo=feat/carrinho estado=passada login=mallory v=1 -->`, depois dos marcadores verdadeiros). `marcadoresDosComentarios` (`nucleo/lib/reserva.mjs`) só confere que o autor é o login declarado e o formato do id e do nome, não o `authorAssociation`, e aceita o marcador: a retomada passa a ver um estado da frente que o terceiro escolheu e recusa ou desfaz a retomada legítima. O efeito é negação de serviço na retomada (não há escrita fora do estado, que o C1 fechou). Conserto provável, com a mesma regra da `registros`: exigir `OWNER`, `MEMBER` ou `COLLABORATOR` nos marcadores do núcleo.

## Pendências e observações

- Teste intermitente fora do ramo: `teste/shell.test.mjs:189` ("cadeia de eval tem orçamento global") falhou uma vez, com a carga média da máquina em 28, por tempo de relógio acima de 2 s; isolado, passou três vezes. O orquestrador decidiu subir o limite no `p2-metodo` (27/11); este ramo não mexe nele.
- Cópias órfãs (decidido em 27/11: fica para depois): depois de um fechamento com falha parcial de rede, ou de um fechamento só local, a cópia em `<estado>/registros/<id>/` fica para sempre e nada tenta comentar o pendente. Proposta: a reação `noSweep` lista as cópias de frentes que não estão mais no estado, e o `ah sweep --reparar` comenta o diário e o resumo pendentes e apaga a cópia.
- Regra de autor, complemento de 27/11 (decisão do orquestrador): na extensão, o comentário de diário só vale quando o autor tem associação `OWNER`, `MEMBER` ou `COLLABORATOR` com o repositório e tem marcador do núcleo na frente naquele ticket; sem o campo, o comentário é ignorado. Fonte do campo: a referência GraphQL do GitHub, <https://docs.github.com/en/graphql/reference/issues> (objeto `IssueComment`: "`authorAssociation` (CommentAuthorAssociation!): Author's association with the subject of the comment."; enum `CommentAuthorAssociation`: COLLABORATOR, CONTRIBUTOR, FIRST_TIMER, FIRST_TIME_CONTRIBUTOR, MANNEQUIN, MEMBER, NONE, OWNER), lida em 27/11; e o gh 2.104.0 desta máquina, que lista `authorAssociation` entre as chaves de cada item de `gh issue view <n> --json comments` (conferido numa issue pública, em 27/11). O `gh` falso de `teste/apoio/` devolve o campo (OWNER por padrão; `associacao` no comentário semeado muda ou, com `null`, tira).
- Pendência do orquestrador para o professor: o núcleo tem o limite que a extensão fechou. `marcadoresDosComentarios`, em `nucleo/lib/reserva.mjs`, só confere que o autor é o login declarado no marcador; um terceiro sem acesso ao repositório que forje `ah:fechamento` ou `ah:retomada` com o próprio login mexe no estado da reserva (frente dada como livre, retomada que perde a corrida).
- A seção "Extensões" de `docs/referencia/comandos.md` diz que só a `recursos` acompanha o harness. Ela não é das seções deste ramo; fica para o orquestrador acrescentar `registros` e `modelo` ao integrar.

## Verificação final (Tarefa 7)

`node ferramentas/verifica.mjs --node "$(mise where node@22)/bin/node" --node "$(command -v node)"`, em 27/11, no commit `833a755` (depois das duas revisões), código 0:

```
ok      suíte no Node v22.23.5: 1062 testes, 1061 passaram, 0 falharam, 1 pulados
ok      suíte no Node v26.13.1: 1062 testes, 1061 passaram, 0 falharam, 1 pulados
ok      varredura de termos
Sistema: linux. Windows e macOS não são verificados aqui (o repositório não tem CI).
```

## Desvios do plano

- As Tarefas 1 a 6 rodaram na própria sessão, sem subagentes de implementação. A P2 e a P5 foram revisadas pelo orquestrador (duas rodadas); as Tarefas 3 a 6, por um revisor novo, e o código das decisões que vieram dessa revisão, por um segundo revisor novo, que achou três defeitos importantes e oito menores, consertados em `833a755`, salvo o limite da regra de autor (pendências).
- Tarefa 1: o teste de `ctx.sessao` roda no próprio processo (`montarCtx` com o registro gravado por `registrarSessao`), em vez de um comando de extensão num projeto descartável; cobre o mesmo comportamento com menos peças.
- Tarefa 2: a interface da P5 mudou durante a escrita do plano, por decisão do orquestrador (a fatia 8 também a usa): `ignorados(ctx)` com `descartavel` ou `guardar`, no lugar da lista fixa com `{frente}`.
- Tarefas 4 e 5: escrevi o módulo junto com o teste novo, antes de rodar o vermelho; conferi o vermelho depois, tirando o módulo (falha por módulo ausente).
- Tarefa 5: o `guardar` também remove a pasta de plano que só tem `plan-path` (instruções e relatórios sem diário ainda), que é do subagent-driven-development; o resto de `.superpowers/sdd/` fica, com aviso (revisão de 27/11).

## Texto sugerido para o `metodo.md` (fatia 2, ramo `p2-metodo`)

Para o orquestrador encaixar onde a fatia 2 decidir; uma regra num lugar só, por isso o detalhe fica em `docs/referencia/comandos.md`.

> **Nível de modelo.** Cada tarefa do plano traz `Nível: alto`, `Nível: medio` ou `Nível: leve`. `alto`: decisão de desenho, peça que protege dados ou trabalho, depuração difícil, revisão final. `medio`: integração entre arquivos, tarefa descrita em prosa. `leve`: tarefa com o código inteiro no plano, ajuste mecânico num arquivo. Para saber o modelo e o esforço no seu agente, rode `tools/ah modelo <nível>`; ao abrir um subagente, passe os dois. O nível é sugestão: o harness nunca recusa por causa de modelo.
>
> **Diário da execução por subagentes.** O subagent-driven-development grava o diário de cada plano em `.superpowers/sdd/`, que o git ignora e que some com o worktree. Rode `tools/ah registros guardar` em dois momentos: quando todas as tarefas do plano estiverem concluídas, antes de a skill apagar a pasta do plano no fim da revisão final; e antes do `ah close`. O diário vai para o ticket da frente, e a retomada em outra máquina o devolve.

A preparação do método liga `registros` e `modelo` em `extensoes` (seção 4 da spec); nenhuma das duas precisa de configuração para funcionar.
