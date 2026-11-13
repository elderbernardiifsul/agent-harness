# Roteiro do professor · aula de 13/11/2026

Vários agentes no mesmo repositório. Slides: `2026-11-13-apresentacao.html` (44 slides; N mostra as notas, T troca o tema, número + Enter pula para o slide). Tópicos detalhados: `2026-11-13-topicos.md`.

## Cronograma (180 min)

| Min | Duração | Slides | O quê |
|---|---|---|---|
| 0–5 | 5 | 1–2 | Abertura; combinar o formato das rodadas; desenhar no quadro a balança: Proposta · Custa adotar · Custa não ter · Quebra quando |
| 5–25 | 20 | 3–6 | Nivelamento: fluxo de Ana do ticket ao merge, ordenar os passos (duplas, 3 min), conflito de merge, `dev`/`stage`/`main`, "um ramo por pasta"; vocabulário do agente (conversa, contexto, limpar, ferramenta) |
| 25–35 | 10 | 7–9 | História dos três terminais; duplas listam problemas (2 min); ligar a lista ao mapa das cinco perguntas |
| 35–50 | 15 | 10–13 | Questão 1, identidade |
| 50–68 | 18 | 14–17 | Questão 2, cada um no seu lugar |
| 68–83 | 15 | 18–21 | Questão 3, onde anotar quem faz o quê |
| 83–93 | 10 | — | Intervalo. Antes de sair, deixe o terminal da demonstração pronto (abaixo, passos 1 e 2) |
| 93–110 | 17 | 22–25 | Questão 4, reserva e corrida |
| 110–133 | 23 | 26–30 | Questão 5, regra escrita × regra que recusa, com a demonstração das recusas (passo 3) |
| 133–148 | 15 | 36–37 | Visão geral do harness como uma alternativa (3 min); turma dita a sequência de passos (2 min); demonstração do ciclo (passos 4 a 7) |
| 148–153 | 5 | 38–40 | O que existe hoje; como aplicar; OpenCode e Codex |
| 153–172 | 19 | 41–43 | Trabalho final: as duas tabelas "decisão do harness × cenário × o que aproveitar" (10 min, uma linha por vez, perguntando qual grupo pensa num cenário parecido); cada grupo escreve curiosidade, cenário e uma decisão que tomaria diferente (3 min); duas leituras em voz alta e recolher (6 min) |
| 172–180 | 8 | 44 | Próximos passos e tarefa |

Soma: 5 + 20 + 10 + 15 + 18 + 15 + 10 + 17 + 23 + 15 + 5 + 19 + 8 = 180 min.

Os slides 31 a 35 (questão 6 e as perguntas da aula 2) ficam para a aula 2: depois do 30, digite `36` e Enter. Se atrasar, corte nesta ordem: slides 39–40 (estão no material de apoio), depois a demonstração do ciclo (vira o começo da aula 2; o slide 36, da visão geral, fica). Não corte os slides 41 a 44.

## Como conduzir cada rodada (questões 1 a 5)

1. **História** (2 min). Leia o slide e não use termo novo. Se alguém já propuser solução, anote num canto e diga "já chegamos lá".
2. **Pergunta e proposta** (5 min). Sozinho, 1 min, no papel; duplas, 3 a 4 min; cada dupla escreve **uma** linha no quadro. Não comente as propostas enquanto elas surgem.
3. **Balança** (5 min). Para cada linha do quadro, pergunte à turma: "o que custa adotar?", "o que custa não ter?", "quando quebra?". Os slides de balança trazem as propostas típicas; use-os para completar o que a turma não disse, nunca antes de ela falar. Feche com a linha "Não resolver custa" do slide: pergunte antes à turma quanto custa deixar o problema como está.
4. **Solução existente** (3 a 5 min). Apresente o harness como mais uma linha da balança, não como a resposta: "de qual proposta de vocês ele está mais perto, e o que ele paga por isso?". Cada slide de solução traz uma linha "Das propostas: … Paga: …".

Não antecipe mecanismo: antes da rodada de uma questão, não fale de worktree (questão 2), estado fora do git (3), reserva (4), gancho e trava (5). A primeira vez que o harness aparece (slide 13), apresente-o só como "um conjunto de comandos feito pelo professor a partir de um projeto real"; a visão geral fica para o slide 36.

| Questão | O que a turma costuma propor | Como ligar à balança | Não resolver custa | A que o harness se parece |
|---|---|---|---|---|
| 1 Identidade | anotar num arquivo; perguntar à pessoa; dar um nome a cada conversa; ler o git | arquivo vira disputa (adiante a questão 3); a pessoa também esquece; nome exige disciplina. Insista: herdar errado ou soltar errado, qual erro custa mais? | trabalho sem dono, ou com dois donos | nome por conversa (id do agente), herança só com prova, soltar na dúvida |
| 2 Isolamento | "combinar no grupo"; um ramo por pessoa; uma cópia da pasta por pessoa; trava de arquivo; um de cada vez | o agente não estava na combinação; numa pasta só há um ramo; cópia pesa e junta tarde; trava esquecida bloqueia | commit com o trabalho do outro; horas no ramo errado | ramo + pasta por trabalho (worktree); a proteção da pasta principal fica para a questão 5 |
| 3 Quadro | arquivo `QUADRO.md`; grupo de mensagens; planilha; tickets; um servidor | histórico × estado de agora; o agente não vê o chat; servidor custa manter | ninguém sabe quem faz o quê | estado local fora do git + tickets entre máquinas + resumo curto |
| 4 Reserva | combinar no chat; nome no ticket; "quem chegar primeiro"; dividir por área | "primeiro" pelo relógio de quem? conferir e pegar são dois passos | duas metades de solução | nome no ticket automático, e "primeiro" pelo servidor |
| 5 Regra escrita basta? | instrução mais clara; confirmação para tudo; tirar a permissão; conferir o comando antes; proteger o ramo no GitHub | instrução falha em silêncio; confirmação vira carimbo; conferência por texto sempre tem brecha | envio para produção que ninguém revisou | conferir o comando antes + proteção no servidor; gancho que quebra recusa |

Se a turma travar numa pergunta, troque por uma versão sem computador: "três pessoas escrevendo o mesmo trabalho no mesmo documento compartilhado".

## Demonstração ao vivo

Num terminal com fonte grande, longe do projeto real. Sem `gh` (`AH_GH=/bin/false`) não há rede nem ticket: a reserva fica só no slide 25.

**1. Repositório descartável** (no intervalo):

```
D=$(mktemp -d); mkdir $D/loja && cd $D/loja && git init -q -b main
mkdir src && echo 'export const total = itens => itens.reduce((s, i) => s + i.preco, 0);' > src/total.js
git add src && git commit -qm "loja inicial"
export AH_ESTADO=$D/estado AH_WORKTREES=$D/wt AH_GH=/bin/false
```

**2. Instalar** (no intervalo):

```
node ~/projetos/agent-harness/nucleo/bin/ah.mjs init --projeto loja --sigla as --sem-protecao
git switch dev
git add -- .harness tools/ah tools/ah.cmd docs/agents/sessoes-paralelas.md docs/agents/historico-das-frentes.md .claude/settings.json .github/workflows/ah-ci.yml
git commit -qm "chore: instala o agent-harness"
tools/ah doctor        # espere: 0 falha(s), 4 aviso(s) (sem gh e sem CI)
```

**3. Recusas** (slide 30):

```
ev() { printf '{"session_id":"abc","hook_event_name":"PreToolUse","cwd":"%s","tool_name":"Bash","tool_input":{"command":"%s"}}' "$PWD" "$1" | tools/ah gancho claude-code; echo "código $?"; }
ev "git add -A"                      # Recusado (T2) … código 2
ev "git push origin main"            # Recusado (T5): push para o ramo protegido main … código 2
ev "git checkout main && git push"   # Recusado (T5): push sem destino explícito com o ramo protegido main em uso
ev 'G=git; $G push'                  # Recusado (T0): o nome do comando vem de uma variável …
ev "git switch main"                 # código 0: passa hoje (T1 em construção). Diga isso.
```

**4. Abrir e trabalhar:**

```
AH_SESSAO=ana-terminal tools/ah open carrinho          # Frente as-1 carrinho aberta. / Trabalhe em: …/wt/carrinho
echo "// frete" >> $D/wt/carrinho/src/total.js
git -C $D/wt/carrinho commit -qam "feat: frete no total"
AH_SESSAO=ana-terminal tools/ah nota "mexendo no total"
AH_SESSAO=ana-terminal tools/ah open cupom             # Recusado: Esta sessão já tem a frente carrinho.
```

**5. Segunda sessão e sobreposição:**

```
AH_SESSAO=carla-terminal tools/ah open cupom --caminhos 'src/**'
#   … Atenção: as-1 carrinho já mudou 1 arquivo(s) de --caminhos: src/total.js
echo "// cupom" >> $D/wt/cupom/src/total.js
tools/ah board                                         # SOBREPÕE as-2 / as-1; "Sobreposições: src/total.js: as-1, as-2"
```

**6. Passagem de bastão** (opcional, se houver tempo):

```
AH_SESSAO=carla-terminal tools/ah handoff --nota "falta validar a data"   # recusa: worktree com alteração não commitada
git -C $D/wt/cupom commit -qam "feat: cupom no total"
AH_SESSAO=carla-terminal tools/ah handoff --nota "falta validar a data"   # Aviso: sem remoto … / Frente as-2 cupom passada.
AH_SESSAO=ana-segunda tools/ah open cupom                                 # Frente as-2 cupom retomada.
```

**7. Fechar sem perder:**

```
AH_SESSAO=ana-terminal tools/ah close                  # Recusado: Fechar a frente as-1 carrinho perderia trabalho. (mostra o commit)
git merge -q --no-ff feat/carrinho -m "Merge feat/carrinho"
AH_SESSAO=ana-terminal tools/ah close --resumo "frete no total"   # Frente as-1 carrinho fechada.
git log --oneline | head -3                            # docs(frentes): fecha as-1 carrinho
```

Ensaiado em 12/11/2026 à noite, primeiro com o commit `5f146ed` e de novo com o `bcfd668` (ramo `dev` do harness), nesta mesma sequência: as saídas acima são as que apareceram nas duas vezes. Naquela noite ainda entravam `sweep` e as travas T1, T3 e T4; **ensaie de novo de manhã** e confira as linhas. Se a T1 já estiver pronta, `git switch main` no passo 3 passa a ser recusado: troque a fala por "acabou de ficar pronta".

## Plano B

- **Comando falhou ou a saída mudou:** não conserte ao vivo. Use o slide 30 (recusas) e as saídas da seção 4 do material de apoio, que vieram de uma execução real. Diga à turma o que falhou: é um bom exemplo de "pronto com prova".
- **Node antigo na máquina da sala:** `node --version` antes da aula; precisa ser 22 ou mais novo. Sem ele, só slides e material.
- **Projetor ilegível:** T troca o tema; o slide 30 tem as recusas em texto grande.
- **Rodadas demoraram mais:** corte a demonstração do ciclo (passos 4 a 7) e mostre só as recusas (passo 3). Não corte as tabelas do trabalho final (slides 41 e 42).

## Para a aula seguinte

- Ler a seção 1 do material de apoio ("O mínimo de git e GitHub") e fazer os exercícios 1 a 3.
- Escolher uma das sete perguntas do slide 35 e trazer uma proposta escrita (três linhas: proposta, custo, onde quebra).
- Trazer o OpenCode instalado e um repositório descartável no GitHub, para a prática do roteiro da seção 5 do material.
- Grupos: a curiosidade escrita no slide 43 entra na conversa da proposta do trabalho final; a tabela completa de decisões × cenários está na seção 6 do material de apoio.

## Conferir antes da aula

- `tools/ah --help` (no clone do harness: `node ~/projetos/agent-harness/nucleo/bin/ah.mjs --help`): confira se `sweep` apareceu e se as travas T1, T3 e T4 ficaram prontas; se sim, troque "em construção" por "pronto" nos slides 29, 34 e 38 (e nas questões 2, 5 e 6 dos tópicos e do material).

Conferir antes da aula: `tools/ah --help`.
