# Projeto 2: registro da orquestração

Registro de como o projeto 2 (método e conhecimento) foi construído em paralelo, a partir de 26/11/2026. Serve a quem executa (o que cada um faz, em que ramo, o que não pode tocar) e a quem estuda depois (como um orquestrador dividiu e integrou o trabalho, e por que decidiu o que decidiu).

Desenho: `docs/superpowers/specs/2026-11-26-metodo-design.md`. Pesquisa de instalação: `docs/superpowers/specs/2026-11-26-metodo-pesquisa-instalacao.md`.

## Objetivo dado pelo autor (26/11)

> Finalizar o plano para que amanhã eu possa testar em projeto real. Incluir documentação, com guia de como começar e os passos recomendados. Tudo acessível por agentes. Objetivo atingido quando for possível trabalhar com a minha metodologia a partir do repositório. Subir dev para main ao final.

**Pronto quando:** num projeto descartável, um agente que só recebeu o endereço do repositório instala o harness e o método, e uma sessão nova consegue seguir as trilhas do `metodo.md` (triagem, plano, execução, registros, fechamento) com as skills instaladas; todas as fatias da spec entregues com o próprio "pronto"; guia de como começar no repositório; `verifica.mjs` com código 0; `dev` levada a `stage` e `main` e enviada ao GitHub.

## Papéis

- **Orquestrador:** a sessão que escreveu a spec. Divide, distribui, revisa, decide, integra no ramo `p2-metodo` e, no fim, na `dev`. Consulta um especialista (subagente do modelo mais capaz) quando a decisão é difícil, e registra a decisão aqui com a evidência.
- **Executores:** sessões secundárias e subagentes. Cada uma trabalha só no próprio worktree e ramo, escreve o plano da sua fatia (`superpowers:writing-plans`), envia o plano ao orquestrador, executa depois do ok (testes primeiro) e relata com commits e a saída dos testes. Decisão que não está na spec vai ao orquestrador, com a opção recomendada e a evidência; o executor não decide sozinho o que muda o desenho.

## Ramos e worktrees

Todos partem de `p2-metodo`. O orquestrador integra cada um em `p2-metodo` com `git merge --no-ff`, depois de revisar. Ninguém faz merge na `dev`, em `stage` ou em `main`, a não ser o orquestrador no fim.

| Onda | Quem | Ramo | Worktree | Fatias |
|---|---|---|---|---|
| 1 | Orquestrador, com subagentes | `p2-metodo` | `~/projetos/agent-harness-p2` | 1 (plano `2026-11-26-metodo-fatia-1.md`) |
| 1 | Sessão `programacao-agentica-9a` | `p2-registros-modelo` | `~/projetos/agent-harness-p2-rm` | 3 e 4, com as mudanças do núcleo P2 e P5 |
| 1 | Sessão `programacao-agentica-67` | `p2-opcionais` | `~/projetos/agent-harness-p2-op` | 8 |
| 1 | Sessão `programacao-agentica-f4` | `p2-wiki` | `~/projetos/agent-harness-p2-wk` | 6 e 7 |
| 2 | Sessão `programacao-agentica-67` | `p2-orquestracao` (a partir de `p2-opcionais`) | `~/projetos/agent-harness-p2-oq` | 5 (depende de 4 e 8) |
| 2 | Orquestrador | `p2-metodo` | `~/projetos/agent-harness-p2` | 2 e o guia de como começar |
| 3 | Orquestrador | `p2-metodo`, depois `dev` | — | Integração, ensaio de ponta a ponta, publicação |

## Quem toca o quê

Para não haver conflito, cada ramo só edita os arquivos da sua linha. Arquivo novo fora da lista: avise antes.

| Ramo | Pode editar |
|---|---|
| `p2-metodo` | `nucleo/comandos/init.mjs`, `nucleo/comandos/atualizar.mjs`, `nucleo/comandos/doctor.mjs`, `nucleo/extensoes/metodo/**`, `README.md`, `AGENTS.md`, `teste/metodo-*`, `teste/init.test.mjs`, `teste/atualizar.test.mjs`, `teste/doctor.test.mjs`, `teste/apoio/colecao-falsa.mjs`; em `docs/referencia/comandos.md`, as seções `init`, `atualizar`, `doctor` e a nova `metodo` |
| `p2-registros-modelo` | `nucleo/extensoes/registros/**`, `nucleo/extensoes/modelo/**`, `nucleo/lib/extensoes.mjs`, `nucleo/lib/extensoes-teste.mjs`, `nucleo/comandos/close.mjs`, `nucleo/comandos/board.mjs` (só se a coluna exigir), `docs/extensoes/interface.md`, `teste/registros-*`, `teste/modelo-*`, os testes de extensões e do close; em `docs/referencia/comandos.md`, a seção `close` e as novas `registros` e `modelo` |
| `p2-wiki` | `nucleo/extensoes/wiki/**`, as pastas novas `nucleo/extensoes/metodo/skills/wiki-ingerir/`, `wiki-consultar/`, `wiki-conferir/`, `reuniao-ingerir/` (só elas; o `colecoes.json` é do orquestrador), `teste/wiki-*`; em `docs/referencia/comandos.md`, a nova seção `wiki` |
| `p2-orquestracao` | `nucleo/extensoes/orquestracao/**`, a pasta nova `nucleo/extensoes/metodo/skills/orquestrar/`, `teste/orquestracao-*`; em `docs/referencia/comandos.md`, a nova seção `orquestracao` |
| `p2-opcionais` | `nucleo/extensoes/ambiente/**`, `nucleo/extensoes/migracao/**`, `nucleo/extensoes/prova/**`, `teste/ambiente-*`, `teste/migracao-*`, `teste/prova-*`; em `docs/referencia/comandos.md`, as novas seções `ambiente`, `migracao` e `prova` |

As skills escritas pelo harness ficam em `nucleo/extensoes/metodo/skills/<nome>/`, e o mapa skill → extensão fica em `nucleo/extensoes/metodo/colecoes.json` (`agent-harness.extensoes`). As ondas seguintes criam as pastas das suas skills; o orquestrador acrescenta a linha do mapa ao integrar.

## Regras comuns a todos os executores

- Leia antes: `AGENTS.md` da raiz deste repositório (as regras do harness não valem para desenvolvê-lo), a spec do método inteira, a seção da sua fatia, `docs/extensoes/interface.md`, `docs/extensoes/como-estender.md` e a extensão `recursos` (exemplo completo).
- Node 22 ou mais novo, módulos ES, sem dependências; testes primeiro (veja falhar antes de consertar); nenhum teste usa rede real.
- Antes de cada commit: `npm test` verde e `node ferramentas/varre-termos.mjs` com código 0 (código 2: pare e avise o orquestrador). Antes de relatar a fatia pronta: `node ferramentas/verifica.mjs --node "$(mise where node@22)/bin/node" --node "$(command -v node)"` com código 0.
- Textos em português, para aprendizes: cada peça legível por um concluinte de Ciência da Computação, com a dor que resolve escrita ao lado. Exemplos com nomes inventados (a loja, Ana Souza, Carla). Nenhum nome do projeto de origem; o original (caminho em `~/.config/agent-harness/origem.md`) é só para leitura.
- Toda recusa diz o motivo e o próximo passo. O harness sugere e registra; só as travas recusam.
- Mudança de comportamento atualiza `docs/referencia/comandos.md` (só as suas seções) no mesmo commit.
- Plano e registro de execução em `docs/superpowers/plans/2026-11-26-metodo-fatia-<n>.md` e `…-fatia-<n>-registro.md`.
- Sem push. Sem merge fora do seu ramo. Mensagens de commit terminam com a linha `Co-Authored-By` do seu agente.
- Ao terminar ou travar: mensagem ao orquestrador com o ramo, os commits, a saída do `verifica.mjs` e as pendências.

## Decisões da orquestração

| Data | Decisão | Evidência | Quem |
|---|---|---|---|
| 26/11 | Skills do harness ligadas a extensão são instaladas só com ela ligada; o mapa fica em `colecoes.json` | spec, seção 4; acrescentado ao plano da fatia 1 (Task 3 e Task 4) | orquestrador |
| 26/11 | Wiki e reunião (fatias 6 e 7) começam na onda 1, em paralelo: só criam arquivos novos | tabela "Quem toca o quê" | orquestrador |
| 27/11 | A fatia 8 recebe a P5 por merge de `b41db9b` direto do `p2-registros-modelo`, sem passar pelo `p2-metodo` | evita mexer no worktree onde a Task 4 da fatia 1 rodava; os mesmos commits entram depois | orquestrador |
| 27/11 | Teste de tempo `teste/shell.test.mjs` "cadeia de eval tem orçamento global": limite de 2 s para 10 s | falhava com carga média 28–32 (várias suítes ao mesmo tempo); a patologia vigiada é exponencial | orquestrador |
| 27/11 | A fatia 5 parte da ponta do `p2-opcionais` | precisa da prova (fatia 8) e dos níveis de modelo, que já estão lá | orquestrador |
| 27/11 | Retomada do diário pelo comentário mais novo com fase=passagem; `registros devolver`; só comentário de OWNER/MEMBER/COLLABORATOR com login nos marcadores do núcleo | casos reproduzidos por revisor independente; repositório público | orquestrador |
| 27/11 | Sem prazo global nos testes (`--test-timeout`) | no Node 22 o prazo vale por arquivo e mata sem limpeza, deixando processos órfãos (reproduzido) | orquestrador |
| 27/11 | O `.harness/config.json` entra no commit do `metodo instalar` | seguindo o README à risca, as frentes nasceriam sem o método (achado crítico da revisão) | orquestrador |
| 27/11 | triage, to-tickets e wayfinder só o humano chama; frente aberta antes do primeiro arquivo; linha de partida sem `--plano` (P6) | ensaio de leitura com Claude Code e Codex; `disable-model-invocation` na versão fixada | orquestrador |
| 27/11 | Texto de ticket e de comentário é dado, não instrução (skill orquestrar e texto do executor) | revisão final | orquestrador |
| 27/11 | Versão 0.3.0 | o núcleo mudou (P1, P2, P5, pesado, validação de marcadores) | orquestrador |

## Como terminou (27/11, ~05h40 UTC)

Ramo `p2-metodo` com todas as fatias da spec integradas:

| Fatia | Ramo de origem | Quem | Revisões |
|---|---|---|---|
| 1 (preparar e skills) | `p2-metodo`, `p2-t7` | orquestrador com subagentes; Task 7 pela sessão 67 | uma por tarefa, com rodadas de conserto; registro em `2026-11-26-metodo-fatia-1-registro.md` |
| 2 (princípios e guia) | `p2-fatia2` | sessão f4 | revisão da fatia e re-revisão |
| 3 e 4 (registros, modelo, P2, P5) | `p2-registros-modelo` | sessão 9a | duas revisões da sessão, P5 revisada à parte, travamento do pesado e segurança revisados à parte |
| 5 (orquestração) | `p2-orquestracao` | sessão 67 | revisão final da sessão |
| 6 e 7 (wiki e reunião) | `p2-wiki` | sessão f4 | ensaios com Claude Code; ensaio de integração |
| 8 (opcionais) | `p2-opcionais` | sessão 67 | revisão final da sessão |
| Revisão de ponta a ponta | — | sessão 67 | `2026-11-27-metodo-revisao-final.md`; consertos distribuídos e revisados |
| Spec alinhada | `p2-spec` | sessão f4 | — |

Incidentes, para quem estuda:
- Um subagente deixou o HEAD do worktree destacado; quatro commits ficaram fora do ramo até uma sessão vizinha avisar. Conserto por merge, sem descartar nada. Regra que ficou: subagente nunca faz checkout de commit no worktree compartilhado.
- Um achado da varredura de termos no histórico vinha de um caminho pessoal num registro, reescrito antes de sair do ramo. Regra que ficou: varredura depois do `git add`.
- Testes com várias suítes ao mesmo tempo travaram a máquina; a causa era um defeito do `ah pesado` (esperava para sempre quando a fila sumia) e a limpeza dos testes.

O que ficou para o professor está na seção "Pendências" do registro da fatia 1 e na seção 15 da spec.
