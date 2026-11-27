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
| 1 | Sessão secundária A | `p2-registros-modelo` | `~/projetos/agent-harness-p2-rm` | 3 e 4, com as mudanças do núcleo P2 e P5 |
| 1 | Sessão secundária B | `p2-opcionais` | `~/projetos/agent-harness-p2-op` | 8 |
| 2 | A definir ao fim da onda 1 | `p2-wiki` | — | 6 e 7 |
| 2 | A definir ao fim da onda 1 | `p2-orquestracao` | — | 5 (depende de 4 e 8) |
| 2 | Orquestrador | `p2-metodo` | `~/projetos/agent-harness-p2` | 2 e o guia de como começar |
| 3 | Orquestrador | `p2-metodo`, depois `dev` | — | Integração, ensaio de ponta a ponta, publicação |

## Quem toca o quê (onda 1)

Para não haver conflito, cada ramo só edita os arquivos da sua linha. Arquivo novo fora da lista: avise antes.

| Ramo | Pode editar |
|---|---|
| `p2-metodo` | `nucleo/comandos/init.mjs`, `nucleo/comandos/atualizar.mjs`, `nucleo/comandos/doctor.mjs`, `nucleo/extensoes/metodo/**`, `README.md`, `AGENTS.md`, `teste/metodo-*`, `teste/init.test.mjs`, `teste/atualizar.test.mjs`, `teste/doctor.test.mjs`, `teste/apoio/colecao-falsa.mjs`; em `docs/referencia/comandos.md`, as seções `init`, `atualizar`, `doctor` e a nova `metodo` |
| `p2-registros-modelo` | `nucleo/extensoes/registros/**`, `nucleo/extensoes/modelo/**`, `nucleo/lib/extensoes.mjs`, `nucleo/lib/extensoes-teste.mjs`, `nucleo/comandos/close.mjs`, `nucleo/comandos/board.mjs` (só se a coluna exigir), `docs/extensoes/interface.md`, `teste/registros-*`, `teste/modelo-*`, os testes de extensões e do close; em `docs/referencia/comandos.md`, a seção `close` e as novas `registros` e `modelo` |
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
