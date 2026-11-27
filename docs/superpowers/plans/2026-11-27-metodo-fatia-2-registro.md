# Método, fatia 2: registro de execução

Registro da execução do plano `2026-11-27-metodo-fatia-2.md`, no ramo `p2-fatia2` (worktree `~/projetos/agent-harness-p2-f2`, criado a partir do `p2-metodo` em `0c36919`), em 27/11/2026. Executora: sessão `programacao-agentica-f4` (Claude Code, Opus 5.5), sob a orquestração de `programacao-agentica-25`. Execução na própria sessão, tarefa por tarefa (o token do ensaio vencia às 06:09Z).

## Ajustes ao plano, decididos pelo orquestrador

| Data | Decisão | Evidência |
|---|---|---|
| 27/11 | O pré-requisito da Task 7 da fatia 1 entra por merge do `p2-metodo` (`b443ea7`) antes da linha do README da Task 5 | merge `14d8d7e`, sem conflito |
| 27/11 | O `metodo.md` e o guia podem citar `orquestrar`, `wiki-ingerir`, `wiki-consultar`, `wiki-conferir` e `reuniao-ingerir`, "quando a extensão estiver ligada"; o `metodo.md` ganha a seção "Extensões opcionais" | teste `as skills das extensões só aparecem como "quando a extensão estiver ligada"` |
| 27/11 | O `metodo.md` cita `tools/ah registros guardar` (fim do subagent-driven-development, antes de a skill apagar a pasta, e antes do close) e `tools/ah registros devolver`; o texto do nível de modelo aproveita o da sessão dos registros (registro das fatias 3 e 4) | teste `o metodo.md diz quando guardar e devolver os registros` |
| 27/11 | O aviso de extensão ligada sem as skills já existe (item `Skills iguais à trava`, fatia 1); nenhum item novo para isso | — |
| 27/11 | **Decisão 1 (do ensaio):** `triage`, `to-tickets` e `wayfinder` só o humano chama: na versão fixada (Matt Pocock 1.3.2), as três têm `disable-model-invocation: true`, e nenhum dos dois agentes as lista entre as que pode usar. O agente diz qual chamar e por quê e segue depois que o humano chamar (no Claude Code, `/triage`, `/to-tickets`, `/wayfinder`). A cópia de terceiros não é mexida. Vai no `metodo.md` ("Antes da trilha" e "Investigação longa") e no guia (seção 2 e exemplo da investigação) | ensaio, abaixo; commit `a9b8bdb` |
| 27/11 | **Decisão 2 (do ensaio):** a frente é aberta antes do primeiro arquivo do projeto (spec, plano, relatório ou código). A linha de partida do plano é `tools/ah open <nome>` seguida de "execute o plano <arquivo>", sem `--plano`, com `tools/ah handoff` na sessão que escreveu o plano. O `--plano` vale quando o plano já está na base | ensaio e teste do `--plano`, abaixo; commit `a9b8bdb` |

## Tarefas

| Task | Commit | O que entrou |
|---|---|---|
| 1 | `81e8563` | `modelos/metodo.md` (as seções do plano e "Extensões opcionais"), `citadas.mjs`, `trechoDe`, o tópico "Escolha a trilha antes de começar" no trecho do `AGENTS.md`; `teste/metodo-principios.test.mjs` |
| 2 | `c9e87ef` | teste das skills citadas pelas instaladas, lido do cache da máquina; nenhuma linha nova na tabela "No lugar" |
| — | `14d8d7e` | merge do `p2-metodo` com a Task 7 da fatia 1 |
| 3 | `cd8ef8c` | `documento.mjs`; campo `documentos` na trava; o `sincronizar` instala e protege o `docs/agents/metodo.md`; recusa com o texto novo; `comandos.md` |
| 4 | `fb4ef49` | itens `Documento do método igual à trava` e `Skills citadas no método instaladas`; `arquivoDasColecoes` e `extensoesLigadas` em `colecoes.mjs`; `comandos.md` |
| 5 | `564ad9b` | `docs/guia/comecar.md`, a linha do README e a linha do Mapa no `AGENTS.md` |
| 6 | `a9b8bdb` | as duas decisões do ensaio no `metodo.md`, no guia e nos testes |

Notas:

- **Convenção de escrita em uso.** Na primeira versão do `metodo.md`, o teste da Task 1 pegou `ah`, `extensoes`, `guardar` e `modelo` em código inline de uma palavra. Também pegou `ah` no tópico "Worktree e encerramento são do `ah`", que veio da fatia 1, no trecho do `AGENTS.md`; virou "do harness (`tools/ah`)".
- **Task 2.** O teste passou de primeira, porque a tabela já cobria tudo. Para ver que ele acusa, a linha de `using-git-worktrees` saiu da tabela num teste à mão: ele listou as três skills do Superpowers que a citam. Com `AH_CACHE=/nao/existe`, ele é pulado com a mensagem. O domain-modeling 1.3.2 do cache grava `GLOSSARY.md`, como o texto diz.
- **Task 4.** Duas mudanças em relação ao plano. A lista longa de skills citadas sai como `<n> citada(s) e fora da trava: <as 5 primeiras> e mais N`, porque o `doctor` corta a linha e a skill do exemplo do plano (`writing-plans`) sumia no corte. E sem trava os dois itens dão `ok` sem detalhe, porque o detalhe entra no nome do item.
- **Testes de texto.** Os da decisão 2 (asserções novas em `metodo-principios`) foram escritos junto com o texto, sem ver falhar antes.

## Ensaio de leitura (Task 6)

### Isolamento

- Laboratório em `/tmp/ah-lab-fatia2`, fora da pasta de rascunho da sessão. Projeto `loja` com o harness deste worktree (`init --projeto loja --sigla as --sem-protecao`), `metodo` com `agentes: ["claude-code", "codex"]`, `registros` e `modelo` ligadas, `tools/ah metodo instalar` sobre o cache da máquina, que já estava nos commits fixados, e commit. O `doctor` do projeto deu `ok` nos dois itens novos.
- **Claude Code 2.1.332.** `env -i` com `HOME` e `CLAUDE_CONFIG_DIR` dentro do laboratório e só `CLAUDE_CODE_OAUTH_TOKEN`, lido de `~/.claude/.credentials.json` na hora de cada chamada; nenhum arquivo de credencial foi gravado. `claude -p … --allowedTools "Read Glob Grep"`.
- **Codex 0.172.0.** `CODEX_HOME` no laboratório, com cópia do `auth.json` em `0600`. O token de acesso valia até 03/12 e o último refresh foi em 23/11, então a cópia não precisava renovar. `codex exec --skip-git-repo-check --sandbox read-only`. A cópia foi apagada no fim. O Codex baixou, por conta própria, plugins de catálogo para dentro do `CODEX_HOME` descartável; eles não vêm da máquina.
- **Sondagem.** Pedida a lista de skills: o Claude Code listou as do projeto e as embutidas dele; o Codex listou as do projeto e as de sistema dele (`imagegen`, `openai-docs`, `skill-creator`, `skill-installer`). Nenhum dos dois viu Superpowers ou Matt Pocock como plugin, nem skills de usuário. Os dois **não** listaram `triage`, `to-tickets` e `wayfinder` (decisão 1).
- O OpenCode ficou de fora: as chaves de provedor da máquina continuam vencidas, segundo o orquestrador.
- Depois do ensaio, o Claude Code e o Codex da máquina responderam normalmente (`claude -p` e `codex exec`). Nenhum token ficou no laboratório.

### Pedidos

Pergunta fixa: "Leia o AGENTS.md e diga a trilha, as skills que você carregaria e o primeiro comando. Não execute nada. Pedido: …", seguida do pedido do guia: frete (ticket 12), cupom (ticket 15, "o desenho do sistema não muda"), parcelado (ticket 20, "muda o contrato… e o dado do pedido") e marketplace ("Ana não sabe se vale…").

| Agente e rodada | Frete | Cupom | Parcelado | Marketplace |
|---|---|---|---|---|
| Claude Code, 1 | Um commit; `systematic-debugging`, `test-driven-development`, `verification-before-completion`; `tools/ah open frete-arredondamento --tickets 12` | Plano de partida; as skills da trilha; `tools/ah open cupons-carrinho --tickets 15`, e notou: "O método não diz claramente se a frente deve ser aberta antes de escrever o plano" | Spec e plano; `brainstorming`, `grilling`, `domain-modeling`, `writing-plans`; `tools/ah open pagamento-parcelado --tickets 20`, e notou: "A sequência de Spec e plano não cita esse comando" | Investigação longa; `wayfinder`, `research`, `grilling`, `prototype` quando couber; `/wayfinder …` para o humano digitar, porque "`wayfinder` não aparece na lista de skills que posso chamar" |
| Codex, 1 ("não execute nada") | "trilha de correção de bug"; primeiro comando `cat docs/agents/metodo.md` | "trilha de feature sem mudança de desenho", com `brainstorming` | "Trilha grande" | "descoberta, provisoriamente", com `brainstorming` |
| Codex, 2 ("pode ler arquivos; não mude nada") | Um commit; as três skills; `AH_SESSAO=<id-da-sessão> tools/ah open arredondamento-frete --tickets 12` | Plano de partida; as skills da trilha; `tools/ah open … --plano …` depois de salvar o plano | Spec e plano; as quatro skills; primeiro `gh issue view 20`, depois `tools/ah open` | Investigação longa; `triage` (sem ticket), `wayfinder`, `research`, `grilling`; primeiro `gh repo view` para o ticket de triagem |
| Claude Code, 2 (depois das decisões) | — | Plano de partida; `tools/ah open cupons --tickets 15`; "Depois do plano, esta sessão faz o commit dele e roda `tools/ah handoff`. Uma sessão nova começa com `tools/ah open cupons` e a instrução 'execute o plano <arquivo do plano>'" | Spec e plano; `tools/ah open pagamento-parcelado --tickets 20` "antes de criar a spec ou qualquer outro arquivo"; "você precisa chamar `/triage`" se o ticket estiver vago | Investigação longa; `/wayfinder …` digitado pelo humano; "Só continuo depois dessa chamada"; a frente "só é necessária antes de criar o primeiro arquivo, como o relatório do `research`" |

Leitura:

- O Claude Code acertou as quatro trilhas nas duas rodadas, com as skills dentro da linha **Skills:** de cada trilha.
- O Codex lê arquivo rodando comando (`cat`). Com "não execute nada" e sandbox só de leitura, ele não leu o `metodo.md` e respondeu só pelo `AGENTS.md`. Com permissão de ler, acertou as quatro trilhas. O problema era o pedido, não o texto, que não mudou por isso. Sozinho, o Codex achou nos documentos que precisa de `AH_SESSAO`, porque o harness não tem adaptador para ele.
- Os dois agentes levantaram a mesma dúvida (frente antes do plano) e, no marketplace, a mesma falta (`wayfinder` fora da lista). Daí saíram as decisões 1 e 2.

### Teste do `--plano` na retomada (para a decisão 2)

Num projeto descartável com o harness deste worktree:

1. `ah open cupom` na sessão A;
2. plano commitado no worktree, em `docs/planos/cupom.md`;
3. `ah handoff`;
4. `ah open cupom --plano docs/planos/cupom.md` na sessão B.

Resultados:

- O passo 4 recusou: `Recusado: O plano não existe: docs/planos/cupom.md`.
- Com o caminho absoluto no worktree: `O plano precisa ser um arquivo dentro do repositório`.
- Rodando de dentro do worktree: a mesma recusa do passo 4.
- Com o arquivo presente no checkout principal, a retomada funcionou: frente `ativa`, dona a sessão B, `plano: docs/planos/cupom.md`.

Causa: `nucleo/comandos/open.mjs:61` resolve o `--plano` no checkout principal (`path.resolve(raiz, plano)`).

## Pendências

- **P6, do núcleo, para o professor decidir.** Na retomada de uma frente (`ah open <nome> --plano <arquivo>`), o `open` procura o plano só no checkout principal (`nucleo/comandos/open.mjs:61`), e o plano escrito na própria frente só está no ramo dela. Proposta: na retomada, procurar também no worktree da frente retomada. Enquanto isso, o método usa a linha de partida sem `--plano` (decisão 2). Evidência: o teste acima.
- **A spec, seção 7, tabela "Um dono por etapa"** (do orquestrador): a linha "Plano" ainda diz `ah open --tickets --plano` como o harness da etapa. O `metodo.md` diz agora `tools/ah open --tickets` antes do plano, e `tools/ah handoff` com a linha de partida na sessão nova.
- **Já conhecida no plano:** as skills copiadas comparam hash sem normalizar CRLF; só o `metodo.md` normaliza.
- **Revisão do autor:** o texto do `metodo.md` é item do "pronto" da fatia 2 (spec, seção 17) e espera o professor.
