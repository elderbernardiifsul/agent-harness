# Exemplo: o adaptador do Claude Code

O único adaptador que existe, lido de ponta a ponta. São duas peças: o arquivo de gancho (`modelos/claude-code/ganchos.json`, que o `init` mescla em `.claude/settings.json` do projeto) e o módulo `nucleo/adaptadores/claude-code.mjs`. Os JSON abaixo são os do ensaio de 2026-11-12 e 2026-11-13 com o Claude Code 2.1.319 ([ensaio-claude-code.md](../referencia/ensaio-claude-code.md)), anonimizados; estão inteiros em `teste/eventos-gravados/claude-code/`.

## O arquivo de gancho

```json
{
  "hooks": {
    "SessionStart":     [{ "hooks": [{ "type": "command", "command": "\"$CLAUDE_PROJECT_DIR\"/tools/ah gancho claude-code" }] }],
    "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "\"$CLAUDE_PROJECT_DIR\"/tools/ah gancho claude-code" }] }],
    "PreToolUse":       [{ "matcher": "Bash|PowerShell|Edit|Write|NotebookEdit",
                           "hooks": [{ "type": "command", "command": "\"$CLAUDE_PROJECT_DIR\"/tools/ah gancho claude-code" }] }],
    "Stop":             [{ "hooks": [{ "type": "command", "command": "\"$CLAUDE_PROJECT_DIR\"/tools/ah gancho claude-code" }] }],
    "SessionEnd":       [{ "hooks": [{ "type": "command", "command": "\"$CLAUDE_PROJECT_DIR\"/tools/ah gancho claude-code" }] }]
  }
}
```

(Em `modelos/claude-code/ganchos.json` cada evento ocupa uma linha a mais; o conteúdo é este.)

- Cinco ganchos do Claude Code para quatro eventos do contrato: `UserPromptSubmit` e `Stop` são os dois sinal de vida.
- O seletor do `PreToolUse` lista só as ferramentas que executam comando ou escrevem arquivo. As outras (`Read`, `Grep`, `WebFetch`…) nem chegam ao gancho.
- `$CLAUDE_PROJECT_DIR` é a raiz do projeto, que o Claude Code põe no ambiente do gancho; com ela, o gancho acha o `tools/ah` mesmo quando o agente está num worktree de frente.
- O Claude Code roda o comando por `sh -c`, que faz `exec` no `tools/ah`, que faz `exec` no `node`: o pai do `node` é o processo do agente, e o pid gravado é o certo (conferido no ensaio da fatia 2, em `claude -p`).

## A tabela de eventos

```js
const EVENTOS = { SessionStart: 'inicio', UserPromptSubmit: 'sinal', Stop: 'sinal', PreToolUse: 'antes', SessionEnd: 'fim' };
```

O nome do evento vem no campo `hook_event_name`, em todo JSON.

## Começo de sessão: `SessionStart`

JSON real (`inicio.json`, `claude -p` novo):

```json
{
  "session_id": "00000000-0000-4000-8000-000000000001",
  "transcript_path": "/tmp/loja/.transcricao/00000000-0000-4000-8000-000000000001.jsonl",
  "cwd": "/tmp/loja",
  "hook_event_name": "SessionStart",
  "source": "startup"
}
```

| Campo do contrato | De onde vem |
|---|---|
| `sessao` | `session_id`; recusado se não é texto, se passa de 128 caracteres ou se não serve de nome de arquivo |
| `cwd` | `cwd`; recusado se não é uma pasta absoluta que existe |
| `agente` | a constante `AGENTE = 'claude-code'` |
| `origem` | `source`: `startup` vira `novo`; `clear`, `resume`, `compact` e `fork` viram `continuacao`; ausente ou desconhecido vira `novo` |
| `modelo` | `model`, quando vem. No ensaio, faltou no `startup` e no `resume` de `claude -p` e no `clear`; veio no `compact` (`"model": "claude-haiku-5-5"`) e no `startup` interativo |

Saída: o resumo vai para a **saída padrão** com código 0; o Claude Code põe a saída padrão do `SessionStart` no contexto do modelo.

## Sinal de vida: `UserPromptSubmit` e `Stop`

JSON real (`prompt.json`):

```json
{
  "session_id": "00000000-0000-4000-8000-000000000001",
  "transcript_path": "/tmp/loja/.transcricao/00000000-0000-4000-8000-000000000001.jsonl",
  "cwd": "/tmp/loja",
  "prompt_id": "00000000-0000-4000-8000-0000000000a1",
  "permission_mode": "auto",
  "hook_event_name": "UserPromptSubmit",
  "prompt": "Rode git push origin main."
}
```

Só `session_id` e `cwd` interessam. Saída: nada, código 0 sempre. Cuidado do Claude Code: no `Stop`, código 2 faria o agente continuar a responder; por isso, fora do "antes", o adaptador nunca sai com código diferente de 0.

## Antes de ferramenta: `PreToolUse`

JSON real (`pre-bash.json`):

```json
{
  "session_id": "00000000-0000-4000-8000-000000000001",
  "transcript_path": "/tmp/loja/.transcricao/00000000-0000-4000-8000-000000000001.jsonl",
  "cwd": "/tmp/loja",
  "prompt_id": "00000000-0000-4000-8000-0000000000a1",
  "permission_mode": "auto",
  "effort": { "level": "high" },
  "hook_event_name": "PreToolUse",
  "tool_name": "Bash",
  "tool_input": { "command": "git push origin main", "description": "Envia a branch main para o remoto origin" },
  "tool_use_id": "toolu_00000000000000000000000001"
}
```

E uma edição (`pre-write.json`, trecho): `"tool_name": "Write"`, `"tool_input": {"file_path": "/tmp/loja/nota.txt", "content": "oi"}`.

```js
const COMANDOS = { Bash: 'command', PowerShell: 'command', Monitor: 'command' };
const EDICOES = { Edit: 'file_path', Write: 'file_path', NotebookEdit: 'notebook_path' };
```

| `tool_name` | Ação no contrato |
|---|---|
| `Bash` | `{tipo: 'comando', comando: tool_input.command, shell: 'posix'}` |
| `PowerShell`, `Monitor` | `{tipo: 'comando', comando: tool_input.command}`, sem `shell` (não é POSIX; o `Monitor` chega pelo seletor `Bash`) |
| `Edit`, `Write` | `{tipo: 'edicao', arquivo: tool_input.file_path, ferramenta}` |
| `NotebookEdit` | `{tipo: 'edicao', arquivo: tool_input.notebook_path, ferramenta}` |
| qualquer outra | erro de entrada: recusa T0 (só chegaria aqui se alguém mudasse o seletor) |

`permission_mode` e `effort` não se usam: variam por modo e por versão.

Saída da recusa: **código 2 e a mensagem na saída de erro**. O Claude Code não roda a ferramenta e entrega ao modelo `PreToolUse:Bash hook error: [<comando do gancho>]: <mensagem>`. No ensaio:

```
PreToolUse:Bash hook error: ["$CLAUDE_PROJECT_DIR"/tools/ah gancho claude-code]: Recusado (T3): git reset --hard no checkout principal descarta …
```

Como o Claude Code prefixa a mensagem, nada no harness depende de ela começar a linha. Saída da permissão: nada, código 0.

## Fim de sessão: `SessionEnd`

JSON real (`fim.json`):

```json
{
  "session_id": "00000000-0000-4000-8000-000000000001",
  "transcript_path": "/tmp/loja/.transcricao/00000000-0000-4000-8000-000000000001.jsonl",
  "cwd": "/tmp/loja",
  "prompt_id": "00000000-0000-4000-8000-0000000000a1",
  "hook_event_name": "SessionEnd",
  "reason": "other"
}
```

| Campo do contrato | De onde vem |
|---|---|
| `motivo` | `reason` (`clear`, `resume`, `logout`, `prompt_input_exit`, `other`) |
| `continuacao` | `true` quando `reason` é `clear` ou `resume` |

Por que `clear` e `resume` são continuação: no reensaio de 2026-11-13, o `/clear` gerou, no mesmo processo, `SessionEnd` com `"reason": "clear"` na sessão velha e logo depois `SessionStart` com `"source": "clear"` e `session_id` novo:

```
{"session_id":"<A>", …, "hook_event_name":"SessionEnd","reason":"clear"}
{"session_id":"<C>", …, "hook_event_name":"SessionStart","source":"clear"}
```

Se o fim de `<A>` a encerrasse, `<C>` não teria de quem herdar a frente. O `/compact` não gera `SessionEnd` (a sessão é a mesma). Saída: nada, código 0 sempre.

## Quando a entrada não serve

`traduzirEntrada` lança `ErroDeEntrada(motivo, tipo)`, com o tipo provável do evento:

```js
// session_id com '/' num PreToolUse:
new ErroDeEntrada('session_id inválido: "a/b"', 'antes')
```

`tipoProvavel` lê `hook_event_name` do objeto ou, se o JSON não fechou, do texto cru com uma expressão regular (`"hook_event_name"\s*:\s*"…"`): um `PreToolUse` cortado ao meio ainda é reconhecido como "antes" e recusado com T0. `acaoLeniente` reaproveita a tradução da ação dentro de um `try`. A regra de quebra ([contrato.md](contrato.md), "Quando o gancho quebra") deixa passar uma chamada a `tools/ah doctor` mesmo com a configuração quebrada, para o conserto ser possível.

## O que dá para copiar para o seu adaptador

- A estrutura das tabelas (`EVENTOS`, `COMANDOS`, `EDICOES`): troque os nomes pelos do seu agente.
- `ErroDeEntrada`, `pastaAbsoluta`, a validação da sessão por `validarNomeSeguro` (de `nucleo/lib/estado.mjs`) e `acaoLeniente`: são iguais para qualquer agente.
- `traduzirSaida` muda de acordo com o jeito do seu agente de recusar e de injetar contexto.
