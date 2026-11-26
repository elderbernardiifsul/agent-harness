#!/usr/bin/env bash
# Roda o ciclo do harness num repositório descartável e grava cada comando com a saída real
# em saidas/<passo>.txt. Sem rede: o gh é trocado por um script que falha (AH_GH), o estado,
# os worktrees e a fila ficam dentro da pasta do ensaio (AH_ESTADO, AH_WORKTREES).
# Uso: bash capturar.sh <pasta do ensaio> [<pasta das saídas>]   (as duas são apagadas e recriadas)
# Sem a segunda, as saídas vão para demo/saidas/, que o vídeo usa. Para laboratório, passe outra pasta.
set -u
CLONE="$(cd "$(dirname "$0")/../../../.." && pwd)"
DEMO="${1:?passe a pasta do ensaio}"
SAIDAS="${2:-$(cd "$(dirname "$0")" && pwd)/saidas}"
rm -rf "$DEMO" "$SAIDAS"
mkdir -p "$DEMO" "$SAIDAS"

cat > "$DEMO/gh-ausente.mjs" <<'FIM'
process.stderr.write('gh indisponível neste ensaio (sem rede)\n');
process.exit(1);
FIM

export AH_ESTADO="$DEMO/estado" AH_WORKTREES="$DEMO/wt" AH_GH="$DEMO/gh-ausente.mjs"
export GIT_AUTHOR_NAME="Ana Souza" GIT_AUTHOR_EMAIL="ana@loja.invalid"
export GIT_COMMITTER_NAME="Ana Souza" GIT_COMMITTER_EMAIL="ana@loja.invalid"
unset CLAUDE_CODE_SESSION_ID CLAUDE_PROJECT_DIR AH_SESSAO AH_PID_AGENTE
LOJA="$DEMO/loja"

# passo <arquivo> <pasta> <comando…>: grava "$ comando", a saída (stdout e stderr) e o código.
passo() {
  local nome="$1" pasta="$2"; shift 2
  local texto="$*"
  {
    printf '$ %s\n' "$texto"
    (cd "$pasta" && bash -c "$texto" 2>&1)
    printf '[código %s]\n' "$?"
  } | sed -e "s#$DEMO#<demo>#g" -e "s#$CLONE#<clone>#g" > "$SAIDAS/$nome.txt"
  cat "$SAIDAS/$nome.txt"
  echo
}

# Evento PreToolUse que o Claude Code mandaria ao gancho (a forma que os testes e o material usam).
evento() { # <sessão> <ferramenta> <json do tool_input>
  printf '{"session_id":"%s","hook_event_name":"PreToolUse","cwd":"%s","tool_name":"%s","tool_input":%s}' "$1" "$LOJA" "$2" "$3"
}

mkdir -p "$LOJA/src"
cd "$LOJA"
git init -q -b main
printf '# loja\n' > README.md
printf 'export const total = itens => itens.reduce((s, i) => s + i.preco, 0);\n' > src/total.js
git add README.md src/total.js && git commit -q -m "começo da loja"

passo 01-init "$LOJA" "node $CLONE/nucleo/bin/ah.mjs init --projeto loja --sigla as --sem-protecao"
(cd "$LOJA" && git switch -q dev && git add -- .harness tools/ah tools/ah.cmd AGENTS.md docs/agents/sessoes-paralelas.md docs/agents/historico-das-frentes.md .claude/settings.json .github/workflows/ah-ci.yml && git commit -q -m "chore: instala o agent-harness")
passo 02-doctor "$LOJA" "tools/ah doctor"
passo 03-open-ana "$LOJA" "AH_SESSAO=ana-terminal tools/ah open carrinho"
passo 04-whoami-ana "$LOJA" "AH_SESSAO=ana-terminal tools/ah whoami"
passo 05-open-carla "$LOJA" "AH_SESSAO=carla-terminal tools/ah open cupom"

WT="$DEMO/wt/carrinho"
printf 'export const total = itens => itens.reduce((s, i) => s + i.preco * i.qtd, 0);\n' > "$WT/src/total.js"
passo 06-commit-ana "$WT" "git add src/total.js && git commit -q -m 'fix: total multiplica pela quantidade' && git log --oneline -1"
passo 07-nota-ana "$LOJA" "AH_SESSAO=ana-terminal tools/ah nota 'total corrigido; falta o teste'"
passo 08-board "$LOJA" "tools/ah board"

passo 09-t4 "$LOJA" "echo '$(evento carla-terminal Edit "{\"file_path\":\"$WT/src/total.js\",\"old_string\":\"a\",\"new_string\":\"b\"}")' | tools/ah gancho claude-code"
passo 10-t5 "$LOJA" "echo '$(evento carla-terminal Bash '{"command":"git push origin dev:main"}')' | tools/ah gancho claude-code"
passo 11-t2 "$LOJA" "echo '$(evento carla-terminal Bash '{"command":"git add -A"}')' | tools/ah gancho claude-code"

passo 12-handoff-ana "$LOJA" "AH_SESSAO=ana-terminal tools/ah handoff --nota 'falta o teste do total'"
passo 13-open-carla-recusa "$LOJA" "AH_SESSAO=carla-terminal tools/ah open carrinho"
passo 14-close-cupom "$LOJA" "AH_SESSAO=carla-terminal tools/ah close cupom"
passo 15-open-carla-retoma "$LOJA" "AH_SESSAO=carla-terminal tools/ah open carrinho"
passo 16-board "$LOJA" "tools/ah board"

mkdir -p "$WT/teste"
printf "import { total } from '../src/total.js';\nif (total([{ preco: 2, qtd: 3 }]) !== 6) throw new Error('total');\n" > "$WT/teste/total.test.js"
passo 17-commit-carla "$WT" "git add teste/total.test.js && git commit -q -m 'test: total com quantidade' && git log --oneline -3"
passo 18-close-antes "$LOJA" "AH_SESSAO=carla-terminal tools/ah close"
passo 19-merge "$LOJA" "git merge -q --no-ff -m 'merge: carrinho' feat/carrinho && git log --oneline -1"
passo 20-close "$LOJA" "AH_SESSAO=carla-terminal tools/ah close --resumo 'total multiplica pela quantidade'"
passo 21-board-fim "$LOJA" "tools/ah board"
passo 22-historico "$LOJA" "tail -n 3 docs/agents/historico-das-frentes.md && git log --oneline -3"
