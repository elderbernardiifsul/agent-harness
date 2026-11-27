# Método, fatia 1: registro de execução

Plano: `2026-11-26-metodo-fatia-1.md`. Orquestração: `2026-11-26-metodo-orquestracao.md`.

## Sondagem (Task 1), 27/11/2026, 02h30–03h00 UTC

### Versões

| Agente | Versão |
|---|---|
| Claude Code | 2.1.332 |
| Codex | codex-cli 0.172.0 |
| OpenCode | 2.4.2 |

### Como o isolamento foi montado

- Pasta descartável `/tmp/ah-lab-sonda`, com `casa/` como `HOME` e `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `XDG_CACHE_HOME` e `XDG_STATE_HOME` dentro dela. Assim nenhum agente vê os plugins, as skills de usuário nem as instruções globais da máquina.
- Claude Code: `CLAUDE_CONFIG_DIR=<casa>/.claude` e `CLAUDE_CODE_OAUTH_TOKEN` com o token de acesso da máquina, lido na hora. **O arquivo de credencial não foi copiado**: sem o token de renovação, a cópia não tem como renová-lo, e o login original não corre risco.
- Codex: `CODEX_HOME=<casa>/.codex`, com uma cópia de `auth.json` (permissão `0600`, apagada com `shred` no fim). O token de acesso valia até 03/12; não houve renovação. Depois do ensaio, o Codex com o `HOME` normal continuou autenticado.
- Binários chamados pelo caminho absoluto da instalação, porque os atalhos do gerenciador de versões dependem do `HOME`.

**Achado do isolamento.** O Claude Code não carrega `CLAUDE.md` nem `AGENTS.md` de uma pasta dentro do rascunho de uma sessão (`/tmp/claude-1000/<projeto>/<sessão>/scratchpad`). O log de depuração (`--debug-file`) diz: "is in a session's scratchpad (...) To load it, move it out of that folder". A primeira rodada foi montada ali e deu a impressão falsa de que o `@AGENTS.md` não funcionava. Os ensaios agora rodam em `/tmp/ah-lab-<nome>`. O aviso foi repassado às sessões que fazem ensaios.

### O projeto de sondagem

Um repositório com:

- um `AGENTS.md` com uma senha ("girassol") e um `CLAUDE.md` só com `@AGENTS.md`;
- skills de mentira em `.claude/skills/`, `.agents/skills/` e `.opencode/skills/`;
- uma skill com o mesmo nome (`sonda-dupla`) nas três pastas, com respostas diferentes;
- uma skill `sonda-cita`, que manda seguir `superpowers:sonda-alvo` quando só existe `sonda-alvo`, sem prefixo.

Pergunta feita a cada agente, sem sessão anterior: a senha; as skills que ele vê; o que `sonda-dupla` manda; o que `sonda-cita` leva a responder.

### Resultados

| Pergunta | Claude Code | Codex | OpenCode |
|---|---|---|---|
| Senha (com `CLAUDE.md` = `@AGENTS.md`) | girassol | girassol | não ensaiado |
| Senha (sem `CLAUDE.md`) | girassol | — | não ensaiado |
| Skills vistas | `sonda-alvo`, `sonda-cita`, `sonda-claude`, `sonda-dupla` (só `.claude/skills/`) | `sonda-agents`, `sonda-alvo`, `sonda-cita`, `sonda-dupla` (só `.agents/skills/`) | não ensaiado |
| `sonda-dupla` | `dupla-da-pasta-claude` | `dupla-da-pasta-agents` | não ensaiado |
| `sonda-cita` (prefixo) | `alvo-achado-sem-prefixo`: "a `sonda-cita` pede `superpowers:sonda-alvo`, que não está na lista; usei a `sonda-alvo` local" | `alvo-achado-sem-prefixo`: "usei a skill local `sonda-alvo`, pois `superpowers:sonda-alvo` não está disponível" | não ensaiado |

**OpenCode não foi ensaiado com modelo.** As duas chaves de provedor configuradas nesta máquina (`opencode-go` e `openrouter`) estão vencidas: "This API key has expired" e "API key expired", também fora do isolamento. Sem chave válida não há resposta de modelo. `opencode api --standalone GET /api/skill` devolveu uma lista vazia, sem sessão aberta, o que não serve de evidência. Pendência para o professor: renovar uma chave e repetir a coluna do OpenCode.

### Decisões

- **(a) Agente → pasta de destino:** `claude-code → .claude/skills`, `codex → .agents/skills`, `opencode → .agents/skills`. O Claude Code e o Codex confirmaram no ensaio. O OpenCode segue a documentação, que diz que ele lê as três pastas (pesquisa, seção 3.3).
- **(b) Nome repetido:** o Claude Code e o Codex leem uma pasta só cada um, e para eles a repetição entre pastas não muda nada. Pela documentação, o OpenCode V2 resolve por precedência ("the source registered later supplies the skill") e não lista duas vezes. Uma cópia idêntica em duas pastas, como o `metodo instalar` faz para `claude-code` com `codex` ou `opencode`, é inofensiva. A regra da conferência do `doctor` (Task 6): **avisa quando o mesmo nome de skill existe em mais de uma das três pastas com conteúdo diferente e `opencode` está em `metodo.agentes`**, porque só aí o OpenCode pode usar a versão que o aluno não espera. Custo se a documentação estiver errada: um aviso a menos para o OpenCode, corrigível quando a coluna do OpenCode for ensaiada.
- **(c) Regra do prefixo:** os dois agentes resolveram `superpowers:<nome>` para a skill local sem instrução nenhuma. A regra no trecho do `AGENTS.md` continua, curta, por custar uma linha e cobrir o agente que não fizer isso sozinho.
- **`CLAUDE.md` com `@AGENTS.md`:** funciona. O Claude Code 2.1.332 também leu o `AGENTS.md` sem `CLAUDE.md`, como a documentação diz. A P1 continua necessária para o projeto que já tem `CLAUDE.md`.
