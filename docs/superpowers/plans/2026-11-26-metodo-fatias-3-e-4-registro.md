# Fatias 3 e 4 do método: registro da execução

Plano: `docs/superpowers/plans/2026-11-26-metodo-fatias-3-e-4.md`. Ramo `p2-registros-modelo`, worktree `~/projetos/agent-harness-p2-rm`, a partir de `p2-metodo`. Executado na própria sessão (sem subagentes de implementação), tarefa por tarefa, com testes primeiro.

## Commits

| Tarefa | Commit | O quê |
|---|---|---|
| Plano | `044e674` | plano aprovado pelo orquestrador em 26/11 |
| 1 | `f47f937` | P2: `ctx.sessao(id)` e a opção `sessoes` do `ctxFalso` |
| 2 | `88e1bdf` | P5: `ignorados(ctx)` (descartável ou guardado) e o `close` |

## Ensaio do git (Tarefa 2)

Com git 2.56.0, num repositório descartável com só `.superpowers/sdd/plano-a/progress.md` e o `.gitignore` com `*` que o `sdd-workspace` grava, `git ls-files -z -o -i --exclude-standard --directory` lista `.superpowers/`, `.superpowers/sdd/`, `.superpowers/sdd/.gitignore` e `.superpowers/sdd/plano-a/`. Com outro ignorado em `.superpowers/` (`x.log` excluído por `.git/info/exclude`), ele também aparece na lista. Com um arquivo não ignorado em `.superpowers/` (`brainstorm/x`), a pasta-mãe sai da lista de ignorados (vira `?? .superpowers/` no `status`). Daí a regra: a pasta-mãe de um declarado casa só quando há itens dela na lista e todos casam.

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

## Pendências e observações

- Teste intermitente fora do ramo: `teste/shell.test.mjs:189` ("cadeia de eval tem orçamento global") falhou uma vez, com a carga média da máquina em 28, por tempo de relógio acima de 2 s; isolado, passou três vezes. O orquestrador decidiu subir o limite no `p2-metodo` (27/11); este ramo não mexe nele.
- A seção "Extensões" de `docs/referencia/comandos.md` diz que só a `recursos` acompanha o harness. Ela não é das seções deste ramo; fica para o orquestrador acrescentar `registros` e `modelo` ao integrar.
