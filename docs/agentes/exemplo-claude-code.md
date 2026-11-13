# Exemplo: o adaptador do Claude Code

Leitura completa do único adaptador existente, composto de duas partes: o arquivo de gancho (`modelos/claude-code/ganchos.json`, que o `init` mescla em `.claude/settings.json` do projeto) e o módulo `nucleo/adaptadores/claude-code.mjs`. Os JSON abaixo vêm dos ensaios de 2026-11-12 e 2026-11-13 com o Claude Code 2.1.319 ([ensaio-claude-code.md](../referencia/ensaio-claude-code.md)), anonimizados; as versões completas estão em `teste/eventos-gravados/claude-code/`.

## Arquivo de gancho

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

(Em `modelos/claude-code/ganchos.json`, cada evento ocupa uma linha a mais; o conteúdo é o mesmo.)

- Cinco ganchos do Claude Code correspondem aos quatro eventos do contrato: `UserPromptSubmit` e `Stop` são ambos sinal de vida.
- O seletor do `PreToolUse` lista apenas as ferramentas que executam comando ou escrevem arquivo. As demais (`Read`, `Grep`, `WebFetch`…) não chegam ao gancho.
- `$CLAUDE_PROJECT_DIR` é a raiz do projeto, que o Claude Code define no ambiente do gancho; com essa variável, o gancho localiza o `tools/ah` mesmo quando o agente está no worktree de uma frente.
- O Claude Code executa o comando por `sh -c`, que faz `exec` no `tools/ah`, que por sua vez faz `exec` no `node`. Assim, o pai do `node` é o processo do agente, e o pid gravado é o correto (verificado no ensaio da fatia 2, com `claude -p`).

## Tabela de eventos

```js
const EVENTOS = { SessionStart: 'inicio', UserPromptSubmit: 'sinal', Stop: 'sinal', PreToolUse: 'antes', SessionEnd: 'fim' };
```

O nome do evento vem no campo `hook_event_name`, presente em todo JSON.

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

| Campo do contrato | Origem |
|---|---|
| `sessao` | `session_id`; recusado se não é texto, se excede 128 caracteres ou se não é válido como nome de arquivo |
| `cwd` | `cwd`; recusado se não é uma pasta absoluta e existente |
| `agente` | a constante `AGENTE = 'claude-code'` |
| `origem` | `source`: `startup` resulta em `novo`; `clear`, `resume`, `compact` e `fork` resultam em `continuacao`; valor ausente ou desconhecido resulta em `novo` |
| `modelo` | `model`, quando presente. No ensaio, o campo faltou no `startup` e no `resume` de `claude -p` e no `clear`, e apareceu no `compact` (`"model": "claude-haiku-5-5"`) e no `startup` interativo |

Saída: o resumo vai para a **saída padrão**, com código 0; o Claude Code insere a saída padrão do `SessionStart` no contexto do modelo.

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

Apenas `session_id` e `cwd` são usados. Saída: nenhuma, sempre com código 0. No Claude Code, o código 2 no `Stop` faria o agente continuar a resposta; por isso, fora do "antes", o adaptador sai sempre com código 0.

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

Trecho de uma edição (`pre-write.json`): `"tool_name": "Write"`, `"tool_input": {"file_path": "/tmp/loja/nota.txt", "content": "oi"}`.

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
| qualquer outra | erro de entrada: recusa T0 (só ocorreria se o seletor fosse alterado) |

`permission_mode` e `effort` não são usados, pois variam conforme o modo e a versão.

Saída da recusa: **código 2 e a mensagem na saída de erro**. O Claude Code não executa a ferramenta e entrega ao modelo `PreToolUse:Bash hook error: [<comando do gancho>]: <mensagem>`. No ensaio:

```
PreToolUse:Bash hook error: ["$CLAUDE_PROJECT_DIR"/tools/ah gancho claude-code]: Recusado (T3): git reset --hard no checkout principal descarta …
```

Como o Claude Code acrescenta um prefixo à mensagem, nada no harness depende de ela estar no início da linha. Saída da permissão: nenhuma, com código 0.

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

| Campo do contrato | Origem |
|---|---|
| `motivo` | `reason` (`clear`, `resume`, `logout`, `prompt_input_exit`, `other`) |
| `continuacao` | `true` quando `reason` é `clear` ou `resume` |

`clear` e `resume` são tratados como continuação porque, no reensaio de 2026-11-13, o `/clear` gerou, no mesmo processo, um `SessionEnd` com `"reason": "clear"` na sessão antiga e, logo depois, um `SessionStart` com `"source": "clear"` e `session_id` novo:

```
{"session_id":"<A>", …, "hook_event_name":"SessionEnd","reason":"clear"}
{"session_id":"<C>", …, "hook_event_name":"SessionStart","source":"clear"}
```

Se o fim de `<A>` encerrasse a sessão, `<C>` não teria de quem herdar a frente. O `/compact` não gera `SessionEnd`, pois a sessão continua a mesma. Saída: nenhuma, sempre com código 0.

## Entrada inválida

`traduzirEntrada` lança `ErroDeEntrada(motivo, tipo)`, com o tipo provável do evento:

```js
// session_id com '/' num PreToolUse:
new ErroDeEntrada('session_id inválido: "a/b"', 'antes')
```

`tipoProvavel` lê `hook_event_name` do objeto ou, se o JSON está incompleto, do texto bruto, por meio de uma expressão regular (`"hook_event_name"\s*:\s*"…"`); assim, um `PreToolUse` truncado ainda é reconhecido como "antes" e recusado com T0. `acaoLeniente` reutiliza a tradução da ação dentro de um `try`. A regra de quebra ([contrato.md](contrato.md), "Quando o gancho quebra") permite uma chamada a `tools/ah doctor` mesmo com a configuração danificada, para que o conserto seja possível.

## Partes reaproveitáveis em outros adaptadores

- A estrutura das tabelas (`EVENTOS`, `COMANDOS`, `EDICOES`), com os nomes trocados pelos do outro agente.
- `ErroDeEntrada`, `pastaAbsoluta`, a validação da sessão por `validarNomeSeguro` (de `nucleo/lib/estado.mjs`) e `acaoLeniente`, que são iguais para qualquer agente.
- `traduzirSaida` muda conforme o mecanismo de recusa e de inserção de contexto de cada agente.
