# Fatias 6 e 7 (wiki e ingestão de reunião): registro de execução

Registro da execução do plano `2026-11-26-metodo-fatias-6-e-7.md`, no ramo `p2-wiki` (worktree `~/projetos/agent-harness-p2-wk`), de 26 a 27/11/2026. Executora: sessão `programacao-agentica-f4` (Claude Code, Opus 5.5), sob a orquestração de `programacao-agentica-25`.

## Decisões

| Data | Decisão | Quem | Evidência |
|---|---|---|---|
| 26/11 | As cinco decisões do plano (formato na extensão, `ah wiki fontes`, sugestão no `antesDeFechar`, fonte nova pelo git, mapa das quatro skills para `wiki`) | orquestrador aprovou | mensagem de aprovação do plano |
| 26/11 | `GLOSSARY.md` entra nas fontes padrão (a domain-modeling 1.3.2 grava `GLOSSARY.md`); a pasta da wiki fica fora das fontes sempre | orquestrador | idem; teste `o padrão inclui o glossário…` e `ehFonte: … a pasta da wiki, que fica fora sempre` |
| 27/11 | Execução na própria sessão, tarefa por tarefa, sem subagentes: o token do ensaio vencia às 06:09Z, e as tarefas são pequenas e encadeadas | executora | — |
| 27/11 | "Última ingestão" passa a ser o último commit cujo diff tem uma entrada `## [...] ingestão` no log (`git log -G`), não o último que tocou o log | executora (conserto de defeito achado no ensaio; não muda o desenho aprovado, só o critério interno) | ensaio da wiki, sessão (c); commit `7ab0059` |

## Tarefas

| Task | Commit | Testes |
|---|---|---|
| 1. `evidencia.mjs` | `1e2036e` | `teste/wiki-evidencia.test.mjs`, 8 |
| 2 e 3. `fontes.mjs`, `ah wiki conferir`, `ah wiki fontes`, doctor, seção do `comandos.md` | `dc8295a` | `teste/wiki-fontes.test.mjs`, 5; `teste/wiki-conferir.test.mjs`, 10 |
| 4. Resumo e sugestão no fechamento | `597e1ea` | `teste/wiki-ciclo.test.mjs`, 4 |
| 5. `formato.md` e as três skills de wiki | `c13c001` | `teste/wiki-skills.test.mjs`, 6 |
| 6. `reuniao-ingerir` | `c9090d0` | `teste/wiki-skills.test.mjs`, mais 2 |
| Conserto da última ingestão (do ensaio) | `7ab0059` | `teste/wiki-ciclo.test.mjs`, asserção nova no teste do resumo |

Notas honestas sobre o processo:

- Na Task 2, o teste e o código foram escritos juntos, sem ver o teste falhar antes. Nas Tasks 1, 3, 4, 5, 6 e no conserto, o teste falhou antes (no conserto, conferido também contra o código antigo, com `git stash`).
- O commit `c13c001` já traz os dois testes da `reuniao-ingerir`, que só passam no commit seguinte (`c9090d0`): os dois commits foram feitos juntos depois da suíte verde, mas `c13c001` isolado tem 2 testes vermelhos.
- No commit `597e1ea`, a suíte inteira teve uma falha em `teste/shell.test.mjs` ("cadeia de eval tem orçamento global", limite de 2 s), que não é da wiki: passou sozinha três vezes seguidas e na suíte inteira rodada de novo sobre o mesmo commit (1021 testes, código 0). É teste de tempo sensível à carga da máquina, com outras sessões rodando suítes em paralelo. O commit passou porque o código de saída do `npm test` foi mascarado por um `grep` na mesma linha; a partir dali, o código foi conferido à parte.

## Ensaio da wiki (Task 7)

**Pronto (spec, seção 17):** um agente ingere um documento de exemplo, consulta e confere.

### Isolamento

- Laboratório em `/tmp/ah-lab-wiki`, fora da pasta de rascunho da sessão (o Claude Code não carrega `CLAUDE.md` nem `AGENTS.md` de dentro dela, segundo a sondagem do orquestrador).
- Projeto `loja` com o harness deste worktree (`node <worktree>/nucleo/bin/ah.mjs init --sigla as --sem-protecao`), `"wiki": true` em `extensoes` e as três skills de wiki **copiadas à mão** para `.claude/skills/` (o `metodo instalar` é da fatia 1, em outro ramo). Script: `monta-lab.sh`, guardado fora do repositório.
- Cada sessão: `env -i` com `HOME` e `CLAUDE_CONFIG_DIR` dentro do laboratório, `AH_ESTADO`, `AH_WORKTREES` e `AH_FILA` dentro dele, e só o token de acesso em `CLAUDE_CODE_OAUTH_TOKEN` (lido de `~/.claude/.credentials.json` no momento da chamada; o token de renovação não foi copiado, nenhum arquivo de credencial foi gravado no laboratório). O token vencia às 06:09Z de 27/11; os ensaios rodaram entre 03:00Z e 04:00Z.
- `claude -p "<pedido>" --permission-mode acceptEdits --allowedTools "Bash Read Write Edit Glob Grep"`, Claude Code 2.1.332 (binário de `mise which claude`, chamado direto, porque o invólucro do mise depende do `HOME`).
- **Sondagem do isolamento:** pedida a lista de skills, a sessão listou `wiki-conferir`, `wiki-consultar`, `wiki-ingerir` e só as embutidas do Claude Code (`dataviz`, `update-config`, `code-review`, `simplify`, `loop`, `schedule`, `claude-api`, `init`, `security-review` e outras); nenhuma do Superpowers nem do Matt Pocock, que a máquina tem como plugin.

### Fontes de exemplo (inventadas)

`docs/adr/0001-frete-gratis.md` (Ana Souza decide frete grátis acima de R$ 200,00 a partir de 01/12/2026, só Sul e Sudeste, "Frete grátis para o Norte fica para depois do Natal.") e `docs/reunioes/2026-11-18-cupom/ata.md` (Carla propõe cupom de 10% e frete de R$ 15,90 para o Norte; Ana Souza "vai pensar no Norte até sexta").

### Sessões

| Sessão | Pedido | Resultado |
|---|---|---|
| (a) | "Ingira na wiki do projeto estas duas fontes: … Siga o AGENTS.md do projeto. Ao terminar, deixe tudo integrado na dev e a frente fechada, e me diga o que ficou na wiki." | Passou. Abriu a frente `as-1`, criou `index.md`, `log.md` e quatro artigos em três temas (`frete/frete-gratis.md`, `frete/frete-para-o-norte.md`, `promocoes/cupom-primeira-compra.md`, `carrinho/desistencias-do-carrinho.md`), no formato; rodou `tools/ah wiki conferir` (0 suspeitos, 0 erros, 2 de 2 fontes citadas), integrou com `merge --no-ff` e fechou a frente. Sobre o Norte, escolheu **não** marcar Contestado, com o argumento de que adiar o frete grátis não contradiz um frete pago de R$ 15,90, e disse isso na resposta, citando o exemplo do `formato.md` que trata um caso parecido como contestado. É julgamento defensável; fica registrado. |
| (b) | "O que a wiki diz sobre frete para o Norte?" | Passou. Respondeu pela wiki, com links a partir da raiz (`docs/wiki/frete/frete-gratis.md`, `docs/wiki/frete/frete-para-o-norte.md`), disse o que não está decidido e não escreveu arquivo (`git status` limpo). |
| (c) | Antes: a ADR passou de R$ 200,00 para R$ 180,00, em commit; o `doctor` passou a avisar `1 suspeito(s) de fidelidade`. Pedido: "Confira a wiki." | Passou. Achou o suspeito, julgou contra a fonte, **não corrigiu o fato sozinha** e propôs reingerir a ADR com bloco Superado; relatou página órfã e uma entrada de log incompleta; acrescentou a entrada `lint` ao log, numa frente (`as-2`), integrada e fechada. |

### Defeito achado pelo ensaio

Na sessão (c), o próprio agente avisou: o commit da entrada `lint` no log passava a contar como "última ingestão", e o lembrete de fonte nova sumiria com a ADR ainda não ingerida. Era defeito do critério da Task 4 (último commit que tocou o log). Conserto em `7ab0059`: só conta o commit cujo diff tem uma entrada de ingestão (`git log -G'^## \[.*\] ingestão'`), com teste de regressão (conferência e consulta acrescentadas ao log não calam o lembrete), que falhou com o código antigo e passa com o novo. `formato.md`, `wiki-ingerir` e `comandos.md` acompanharam.

## Ensaio da reunião (Task 8)

**Pronto (spec, seção 17):** com uma gravação de exemplo inventada (só áudio e com vídeo), a pasta da reunião sai como a seção 12 pede, com os fatos ingeridos na wiki; o caminho "falta ferramenta" passa pela oferta de instalação.

### Gravação inventada

- Roteiro inventado (Ana Souza e Carla; cupom de Natal de 10% acima de R$ 150,00 a partir de 05/12/2026; prazo de troca de 30 dias; duas perguntas em aberto: o fim do cupom e quem paga o frete da troca; uma senha dita em voz alta; um intervalo de quase sete minutos em que a Carla sai para atender; um número que só aparece na tela: 1.284 pedidos com cupom). Guardado em `/tmp/ah-lab-reuniao/roteiro/`, fora do repositório; o gabarito (instantes das telas, legenda gerada) fica em `/tmp/ah-lab-reuniao/gabarito/`, fora da pasta da gravação.
- Voz: **piper-tts 1.8.0**, instalado num ambiente Python dentro de `/tmp/ah-lab-reuniao/tts/` (`uv venv` e `uv pip install piper-tts`), com as vozes `pt_BR-faber-medium` (Ana Souza) e `pt_BR-cadu-medium` (Carla), baixadas de `huggingface.co/rhasspy/piper-voices`. A máquina não tinha síntese de voz.
- Montagem com o `ffmpeg` da máquina (n9.0.2): `reuniao.m4a` (só áudio, 10 min 36 s) e `reuniao.mp4` (telas com texto, o mesmo áudio e uma faixa de legenda `mov_text` com o falante em cada linha, `Ana Souza: …`).
- Defeito da gravação, apontado pelo agente na primeira sessão: o vídeo saiu 58 s mais longo que o áudio (`-shortest` não cortou com a faixa de legenda). Refeito com `-t <duração>`; as duas ficaram com 636 s.

### Laboratório

`/tmp/ah-lab-reuniao`, montado como o da wiki, com as quatro skills copiadas à mão. O `PATH` da sessão é `/usr/local/bin:/usr/bin:/bin` e a pasta do Node: sem reconhecimento de fala (nenhum `whisper`, `faster-whisper` ou `vosk`; `/usr/bin/python3` sem `faster_whisper`), com o `ffmpeg` da máquina.

### Sessões

| Sessão | Pedido | Resultado |
|---|---|---|
| r1, "falta ferramenta" | "Ingira a reunião gravada em /tmp/ah-lab-reuniao/grav/reuniao.m4a." (sem autorização para instalar) | Passou. Não transcreveu, não criou arquivo e não instalou nada (o `HOME` do laboratório ganhou só um `.cache` vazio). Disse o que tem (`ffmpeg`) e o que falta (reconhecimento de fala), propôs `faster-whisper` com o que viria do PyPI e do Hugging Face, o tamanho do modelo e onde ficaria (fora do repositório, sem `sudo`), ofereceu um modelo menor como alternativa; perguntou o consentimento dos participantes, se a gravação entra no repositório (o padrão, não), a data e o assunto para a pasta `docs/reunioes/<data>-<assunto>/`; notou o `.mp4` ao lado e a legenda dentro dele. |
| r2, só áudio | Com o "sim" e as respostas da r1 no pedido (consentimento, só o `.m4a`, instalar dentro de `/tmp/ah-lab-reuniao/ferramentas`, rodar em poucos minutos sem placa de vídeo, gravação fora do repositório, data e assunto), integrar e fechar. 16 min (03:18Z a 03:34Z). | Passou. Instalou faster-whisper 1.2.1 com os modelos `large-v3-turbo` e `medium` dentro de `ferramentas/` (3,5 GB). Pasta `docs/reunioes/2026-11-26-cupom-natal-politica-trocas/` com README (fontes com SHA-256 da gravação, duas leituras do áudio, eixo de tempo alinhado na fala "Voltei" em [0:09:03] nas duas, falantes todos inferidos, incertezas, o silêncio de [0:02:22] a [0:09:03] medido, o que não fez: capturas), `transcricao.md` com 47 marcas `(inferido)`, dois blocos cortados por assunto (cupom; trocas), cada fato com instante e origem, separando decisão, proposta e o que ficou em aberto, e `sobras.md` (senha, falantes duvidosos, trechos incertos, perguntas sem resposta). **Senha cortada**: `[trecho suprimido: senha de acesso ao painel]`, nenhuma ocorrência em nenhum commit (`git grep` em `git rev-list --all`). Wiki: dois artigos, conferência com 0 suspeitos e 0 erros. Achou um erro do roteiro inventado: 05/12/2026 é sábado, não sexta, e deixou como contradição em `sobras.md` e como contestado na wiki. Ponto fraco: ao conferir o corte, a primeira transcrição e um comando de busca mostraram a senha na saída da sessão; o próprio agente avisou. Conserto no texto da skill (não repetir o trecho em saída, comando, commit ou arquivo temporário; procurar pelo instante) no commit deste registro. |
| r3, com vídeo | Outro laboratório (`/tmp/ah-lab-video`, mesmo projeto descartável), sobre o `.mp4`, com o "sim" e a permissão de usar as ferramentas já instaladas pela r2. 6 min (03:34Z a 03:40Z). Rodou depois da r2, e não ao mesmo tempo, porque a máquina tinha cerca de 1 GB de memória livre. | Passou. Usou a faixa de legenda como base do texto, dos falantes e dos tempos (zero `(inferido)`), com os dois modelos como segunda e terceira leituras, e o mesmo alinhamento em [0:09:03]. Duas capturas nos instantes das telas que sustentam fatos (`capturas/0h00m48s-painel-vendas.png`, `capturas/0h09m13s-proposta-trocas.png`); o número que só aparece na tela ("Pedidos com cupom em novembro: 1.284", "Ticket médio com cupom: R$ 182,40") está no bloco, com a captura, e na wiki. Senha cortada, sem ocorrência no git; o agente avisou que ela continua no áudio e na legenda do `.mp4` e que apareceu nas saídas da sessão (a r3 rodou com a skill de antes do conserto). Wiki: conferência com 0 suspeitos, 0 erros, 5 de 5 fontes citadas. Não instalou nada. |

Depois dos ensaios: o login do Claude Code da máquina continuou válido (`claude -p` no ambiente normal respondeu); nenhum arquivo de credencial nem token ficou nos `HOME` dos laboratórios (procurado o prefixo do token). Os laboratórios ficam em `/tmp/ah-lab-wiki`, `/tmp/ah-lab-reuniao` e `/tmp/ah-lab-video` para inspeção (as gravações e os modelos, só ali); podem ser apagados.

Não ensaiado: Codex e OpenCode (o plano previa só o Claude Code nos ensaios destas fatias; as chaves do OpenCode da máquina estão vencidas, segundo o orquestrador).

## Pendências

- **`colecoes.json`** (do orquestrador): acrescentar o mapa `wiki-ingerir`, `wiki-consultar`, `wiki-conferir`, `reuniao-ingerir` → `wiki`. Os ensaios copiaram as skills à mão; o caminho pelo `metodo instalar` não foi ensaiado neste ramo.
- **`metodo instalar` e arquivos além do `SKILL.md`:** as três skills de wiki levam `LICENSE-karpathy-llm-wiki` na pasta; o `metodo instalar` precisa copiar a pasta inteira da skill do harness, não só o `SKILL.md`.
- **`docs/referencia/comandos.md`, seção "Extensões"** (fora das minhas seções): diz "nesta versão, só a `recursos`" entre as que acompanham o harness; com a integração, passa a ter também `wiki` (e as das outras fatias).
- **Pasta `nucleo/extensoes/metodo/`** existe neste ramo só com `skills/` (sem `extensao.mjs`); na integração com o `p2-metodo`, ela se junta à extensão do orquestrador. A suíte passa assim (pasta sem `extensao.mjs` e desligada não carrega).
- **Julgamento da ingestão:** na sessão (a), o agente não marcou Contestado a proposta do Norte que a ADR deixou para depois, contra o exemplo do `formato.md`; é leitura defensável. Se o autor quiser a regra mais firme, o lugar é a seção "Decisão prevalece" da `wiki-ingerir`.
