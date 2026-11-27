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
