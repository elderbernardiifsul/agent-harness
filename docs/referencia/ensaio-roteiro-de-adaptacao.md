# Ensaio do roteiro de adaptação

Data: 2026-11-26. Agente: Codex CLI 0.172.0, modelo `gpt-6.2-astra`, esforço `high`, no modo sem interface (`codex exec`), com a caixa de areia `workspace-write` e aprovação `on-request`.

Objetivo: verificar o item do "pronto quando" da seção 15 do [desenho](../superpowers/specs/2026-11-12-nucleo-design.md): um agente sem contexto, seguindo só o roteiro de [`docs/agentes/`](../agentes/README.md), consegue dizer o que falta para o adaptador dele e rodar os testes de contrato.

## Preparo

Cada rodada usou um clone descartável do agent-harness em `<tmp>/clone`, com `TMPDIR` em `<tmp>/tmp`, sem as variáveis da sessão de agente que lançou o ensaio (`CLAUDECODE`, `CLAUDE_CODE_*`):

```sh
codex exec --ephemeral --sandbox workspace-write --add-dir "$TMPDIR" -C . -o ../resposta-final.txt "<pedido>"
```

O pedido, o mesmo nas duas rodadas:

> Você está num clone do agent-harness, um harness para várias sessões de agente no mesmo repositório. Você é o agente codex e chegou aqui sem nenhum contexto.
>
> Tarefa: siga só o roteiro em docs/agentes/README.md (e os documentos que ele manda ler, na ordem que ele indica) para:
> 1. dizer, com base no roteiro e na tabela de capacidades, o que falta para existir um adaptador do codex;
> 2. rodar os testes de contrato exatamente como o roteiro manda, para o codex, e mostrar a saída.
>
> Não escreva o adaptador nem altere arquivos do repositório; esta é só a etapa de diagnóstico. Se algum passo do roteiro estiver confuso, ambíguo ou errado, anote.
>
> Termine com três seções: "O que falta para o adaptador", "Saída dos testes de contrato" (comando exato e resultado) e "Dificuldades com o roteiro".

Nas duas rodadas, o `git status --short` do clone terminou vazio: o agente não alterou nada.

## Primeira rodada (`dev` em `9d36c5d`)

**O que falta.** O agente listou os quatro passos do roteiro com os dados do Codex tirados da tabela de capacidades: gravar eventos reais (os ganchos de `.codex/hooks.json` só disparam com a pasta e cada gancho confiados), escrever `nucleo/adaptadores/codex.mjs` com a correspondência `SessionStart` → `inicio`, `UserPromptSubmit` e `Stop` → `sinal`, `PreToolUse` → `antes`, `SessionEnd` → `fim`, ligar o gancho no `init` e fazer a prova com o agente real.

**Testes de contrato.** O comando do roteiro, `AH_ADAPTADOR=codex node --test teste/contrato-adaptadores.test.mjs`, saiu com código 1 e só isto:

```
✖ teste/contrato-adaptadores.test.mjs (56.142658ms)
ℹ tests 1
ℹ pass 0
ℹ fail 1
…
test at teste/contrato-adaptadores.test.mjs:1:1
✖ teste/contrato-adaptadores.test.mjs (56.142658ms)
  'test failed'
```

Fora da caixa de areia, o mesmo comando mostra `o adaptador codex não está no registro: acrescente-o em ADAPTADORES, em nucleo/adaptadores/registro.mjs (registrados: claude-code)`. A causa foi reproduzida com `codex sandbox -c sandbox_mode=workspace-write -- …`: na caixa de areia, `spawnSync` falha com `EPERM` e o `git init` não cria o repositório descartável, e o executor de testes do Node mostra só `'test failed'` para cada arquivo, sem nenhum teste dentro. Qualquer arquivo da suíte falha assim ali dentro.

**Dificuldades apontadas pelo agente** e o que foi feito com cada uma:

| Dificuldade | Conserto |
|---|---|
| A falha do teste não diz o que corrigir | `provar.md`: parágrafo "Caixa de areia do agente", com o sintoma, a causa e as duas saídas (rodar fora da caixa de areia; rodar o arquivo sem `--test` para ler a mensagem) |
| O patch do Codex toca vários arquivos, e o contrato só tinha `acao.arquivo` | Contrato: `{tipo: 'edicao', arquivos: [...]}`; cada arquivo passa pelas travas como uma edição sozinha, e a primeira recusa vale (`nucleo/lib/travas.mjs`, `avaliarEdicoes`; testes em `teste/extensoes.test.mjs` e `teste/contrato.test.mjs`) |
| O `Stop` do Codex exige JSON na saída, e o roteiro diz "nada" para o `sinal` | `escrever-um-adaptador.md`: "nada" é a resposta do núcleo; o adaptador escreve o que o agente exige (`{}`) |
| O `reason` do `SessionEnd` é sempre `other` e não permite marcar continuação | `escrever-um-adaptador.md`: as duas escolhas (entregar o `fim` ou deixá-lo fora de `EVENTOS_ENTREGUES`), decididas pela ordem real dos eventos no ensaio |

## Segunda rodada (ramo `fecha-p1` em `f90c604`, com os consertos acima)

**Testes de contrato.** O agente rodou o comando do roteiro, viu `'test failed'`, seguiu o parágrafo novo de `provar.md` e repetiu o comando pedindo para rodar fora da caixa de areia. O `codex exec` executou o pedido; o registro da sessão não mostra como a aprovação foi dada. Saída:

```
✖ adaptador codex registrado (0.429582ms)
ℹ tests 1
ℹ pass 0
ℹ fail 1
…
✖ failing tests:

test at teste/contrato-adaptadores.test.mjs:14:3
✖ adaptador codex registrado (0.429582ms)
  Error: o adaptador codex não está no registro: acrescente-o em ADAPTADORES, em nucleo/adaptadores/registro.mjs (registrados: claude-code)
```

A alternativa sem `--test` (`AH_ADAPTADOR=codex node teste/contrato-adaptadores.test.mjs`) mostrou a mesma mensagem dentro da caixa de areia.

**O que falta.** A mesma lista da primeira rodada, agora com `acao.arquivos` para o `apply_patch` e o `{}` na saída do `Stop`.

**Dificuldades apontadas** e o que foi feito:

| Dificuldade | Conserto |
|---|---|
| A ordem de leitura do README não cita a tabela de capacidades | `README.md` do roteiro: a ordem diz onde a tabela entra (passo 1 de `escrever-um-adaptador.md`) |
| O teste revela só a primeira pendência | `provar.md`: os testes conferem as partes na ordem da construção; o resto vem do roteiro |
| Herança depois do `SessionEnd`: o texto novo dizia que a herança vinha do começo de continuação mesmo com o fim entregue, e o `contrato.md` diz o contrário | O texto novo estava errado: sessão com `fim` gravado não é herdada (`nucleo/lib/heranca.mjs`, filtro `!s.fim`). `escrever-um-adaptador.md` foi corrigido |

## Conclusão

Com o roteiro corrigido, o agente sem contexto disse o que falta para o adaptador do Codex e rodou os testes de contrato, inclusive dentro da caixa de areia, que é o modo padrão do Codex. O item do "pronto quando" vale para o Codex.

## Limites

- **OpenCode não ensaiado.** O OpenCode 2.4.2 está instalado, mas as duas chaves de API dele nesta máquina (OpenCode Go e OpenRouter) estavam vencidas no dia (`API key expired`). Para repetir: renovar uma chave e rodar o mesmo pedido com `opencode run` num clone descartável.
- O ensaio parou no diagnóstico, como pede o item do "pronto quando". O adaptador do Codex não foi escrito (seção 15 do desenho), e a ordem real dos eventos `SessionEnd` e `SessionStart` do Codex continua sem observação.
