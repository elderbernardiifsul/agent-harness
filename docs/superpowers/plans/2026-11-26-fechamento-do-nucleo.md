# Fechamento do núcleo (projeto 1): plano e registro

**Objetivo:** fechar o projeto 1 conferindo cada item do "pronto quando" (seções 14 e 15 do [desenho](../specs/2026-11-12-nucleo-design.md)) e tratando o que faltava. Pedido do autor em 26/11/2026, com a decisão de que o repositório não tem CI no GitHub e tudo roda nesta máquina (seção 16 do desenho).

**Base:** `dev` em `9d36c5d`. Ramo `fecha-p1`, num worktree próprio, porque o projeto 2 corre em paralelo noutra sessão. Merge local na `dev`, sem push.

## O que faltava no começo

Dois itens do "pronto quando" não valiam:

1. **`init` + `doctor` nos três sistemas pela CI.** O fluxo `.github/workflows/ci.yml` estava ativo no GitHub, mas não tinha nenhuma execução registrada. Com a decisão de não ter CI, o item passou a ser a verificação local (seção 16).
2. **Um agente sem contexto, só com o roteiro, diz o que falta para o adaptador dele e roda os testes de contrato.** Não tinha sido ensaiado.

E alguns resíduos registrados nos planos de pendências: o intervalo sem `.harness/nucleo/` na troca do `atualizar`, worktree com submódulos no `close`, a contagem do `doctor` no material da aula e a frase da herança em "Vida da sessão".

## Execução

### Verificação local e Node 22

`ferramentas/verifica.mjs` (`npm run verifica`, teste em `teste/verifica.test.mjs`) roda a suíte em cada Node passado em `--node` e depois a varredura de termos. Sai com 0, 1 (algo falhou) ou 2 (não deu para verificar, com o motivo e o `Faça:`). Recusa Node mais antigo que o `engines` do `package.json`. Força `--test-reporter=spec`, porque com a saída num cano o Node 22 usa TAP.

Na primeira rodada com o Node 22.23.5 (o mínimo do `package.json`), a suíte não rodou: `node --test teste/` com uma pasta como argumento é tratado como arquivo e falha com `MODULE_NOT_FOUND`. O mesmo valia para o comando do guia de extensão (`node --test .harness/extensoes/`). Os dois passaram a usar um padrão de arquivos entre aspas, expandido pelo próprio Node (`"teste/*.test.mjs"` e `".harness/extensoes/*/*.test.mjs"`), e os documentos que citavam `node --test teste/` passaram a citar `npm test`. O teste do guia de extensão também passou a pedir `--test-reporter=spec` ao `node --test` de dentro (commit `812b65c`).

Resultado final:

```
$ node ferramentas/verifica.mjs --node "$(mise where node@22)/bin/node" --node "$(command -v node)"
ok      suíte no Node v22.23.5: 993 testes, 992 passaram, 0 falharam, 1 pulados
ok      suíte no Node v26.13.1: 993 testes, 992 passaram, 0 falharam, 1 pulados
ok      varredura de termos
Sistema: linux. Windows e macOS não são verificados aqui (o repositório não tem CI).
```



### Ensaio do roteiro de adaptação

Registro completo em [`docs/referencia/ensaio-roteiro-de-adaptacao.md`](../../referencia/ensaio-roteiro-de-adaptacao.md). Duas rodadas com o Codex 0.172.0 (`codex exec`, caixa de areia `workspace-write`), cada uma num clone descartável, com o mesmo pedido.

- **Primeira rodada:** o agente disse o que faltava, mas o teste de contrato saiu só com `'test failed'`. A causa: na caixa de areia do Codex, `spawnSync` falha com `EPERM` e o `git init` não cria repositório, então nenhum arquivo da suíte roda ali dentro. O agente apontou também três ambiguidades no roteiro.
- **Consertos:** o parágrafo "Caixa de areia do agente" em `provar.md`; a edição de vários arquivos no contrato (`acao.arquivos`, commit `f39b0d8`), para o `apply_patch` do Codex; a resposta do `sinal` (o `{}` que o `Stop` do Codex exige) e o `fim` sem motivo útil em `escrever-um-adaptador.md` (commit `f90c604`).
- **Segunda rodada:** o agente seguiu o parágrafo novo e chegou à mensagem `o adaptador codex não está no registro…`, dentro e fora da caixa de areia. Ele apontou que o texto novo sobre a herança depois do `SessionEnd` contradizia o `contrato.md`. O texto estava errado, porque sessão com `fim` gravado não é herdada (`nucleo/lib/heranca.mjs`), e foi corrigido junto com as duas observações menores (commit `1c6c5d3`).

O OpenCode 2.4.2 não foi ensaiado: as duas chaves de API dele na máquina estavam vencidas.

### Edição de vários arquivos no contrato

`{tipo: 'edicao', arquivos: [...]}`: em `avaliar` (`nucleo/lib/travas.mjs`), cada arquivo passa pelas travas como uma edição sozinha (T4 e travas de extensão), e a primeira recusa vale, com o arquivo que a causou; o `antes` grava esse caminho no evento de recusa. Lista vazia, ou com item que não é texto, recusa com T0. Na quebra do gancho, a edição passa só se todos os arquivos forem `.harness/config.json`. A interface de extensão não muda: a trava de extensão vê um arquivo por vez, sempre em `arquivo`. O teste de contrato aceita `arquivo` ou `arquivos` no exemplo de edição.

### Worktree com submódulos no `close`

O `git worktree remove` sem `--force` recusa worktree com submódulos. Antes, o `close` só descobria isso na remoção, depois de comentar o fechamento nos tickets, e a recusa mandava procurar "alteração ou arquivo novo". Agora a conferência é feita junto com a do worktree trancado, antes de mexer nos tickets, com a regra do git (pasta `modules` do worktree, ou submódulo do índice com repositório na pasta), e a recusa diz a saída (commit `51c2dab`, saída corrigida depois da revisão). Num ensaio à mão, `git submodule deinit --all` não bastou para o git remover o worktree; por isso a saída é a remoção forçada, feita por quem usa e nunca pelo `close`. Antes dela, a recusa manda listar os commits dos submódulos que não estão em nenhum remoto (`git -C <wt> submodule foreach --recursive 'git log --oneline HEAD --branches --not --remotes'`) e empurrá-los: o submódulo iniciado no worktree guarda os objetos na pasta `modules` do worktree, que a remoção forçada apaga, e o `git submodule status` não mostra o commit que só existe ali.

### Resíduos

- **Intervalo da troca no `atualizar`:** já falhava fechado (o `tools/ah` sem `.harness/nucleo/` sai com código 2, e o gancho bloqueia a ação). Ficou registrado na referência, seção `atualizar`.
- **Frase da herança em "Vida da sessão":** já estava lá (a "Exceção" da frente em fechamento); nada a fazer.
- **Contagem do `doctor` no material da aula:** corrigida para 23 itens mais o do adaptador.
- **Clone com mudança não commitada na hora do `init`:** só afeta manifestos anteriores à fatia 5, sem a lista de arquivos, cuja lista antiga sai do commit. Fica como limite; a saída continua sendo `--forcar`.

### Documentos

Seção 16 do desenho (sem CI). README ("Situação", limites, referência, "Desenvolvimento"), `AGENTS.md` (verificação local antes de integrar), histórico das fatias, seção "Limites" de `docs/referencia/comandos.md` (submódulos, Windows e macOS) e o roteiro de `docs/agentes/`. O fluxo `.github/workflows/ci.yml` saiu do repositório. A CI que o `init` instala nos projetos (`modelos/ci/`) continua.

### Revisão independente

Um agente sem as conclusões desta execução revisou o diff do código (`nucleo`, `ferramentas`, `teste`, `package.json`). Achados e o que foi feito:

| Achado | Conferido | Feito |
|---|---|---|
| A primeira saída da recusa dos submódulos (`git submodule status` e depois `--force`) podia apagar um commit que só existia no submódulo do worktree | por execução (reproduzido de novo aqui) | a saída passou a listar e mandar empurrar os commits fora dos remotos antes da remoção forçada |
| Com `FORCE_COLOR` no ambiente, o `verifica` nunca passava (o resumo não casava com as linhas coloridas), e o teste do guia também falhava | por execução | o resumo tira as cores; o `verifica` e o teste do guia rodam o `node --test` de dentro com `NO_COLOR` e sem `FORCE_COLOR` |
| `--node` com caminho relativo dava "não terminou" em vez da recusa | por execução | caminho com barra é resolvido a partir de onde se chama |
| O teste de contrato aceitava `''` em `arquivos`, que as travas recusam | por leitura | o teste de contrato passou a recusar |

Sem defeito encontrado: as travas com `arquivos` (inclusive `AH_GUARD=off`, que não vale para edição, como antes) e a detecção de submódulos, conferida contra o `git worktree remove` real em quatro cenários, com caminhos com espaço.

## O "pronto quando", item por item

| Item (seções 14 a 16) | Situação | Evidência |
|---|---|---|
| Tabela de capacidades por agente, com fonte e data | vale | `docs/referencia/capacidades-por-agente.md` |
| O `init` deixa proteção de ramo e CI do projeto, ou o `doctor` acusa | vale | `teste/init.test.mjs`, `teste/protecao.test.mjs`, `teste/doctor.test.mjs` |
| Toda recusa testada traz o próximo passo | vale | `nucleo/lib/recusa.mjs` e os testes de cada recusa |
| `ah board --numeros` a partir de um registro de exemplo | vale | `teste/numeros.test.mjs`, `teste/eventos-de-exemplo/` |
| `init` + `doctor` num repositório descartável (seção 16: Linux, Node mínimo e atual, verificação local) | vale no Linux | `teste/doctor.test.mjs` ("projeto recém-preparado: sem falhas"), na saída do `verifica` acima. Windows e macOS: limite declarado |
| Duas sessões, T4, `takeover`, `handoff` e `close` com o `gh` falso | vale | `teste/ciclo-duas-sessoes.test.mjs`, `teste/takeover.test.mjs`, `teste/handoff.test.mjs`, `teste/close.test.mjs` |
| Cada trava com teste de recusa e de passagem, com as formas disfarçadas | vale | `teste/travas.test.mjs`, `teste/shell.test.mjs` |
| Fila de pesado: vagas, classes, ordem, árvore encerrada | vale | `teste/fila.test.mjs`, `teste/pesado.test.mjs` |
| Extensão de exemplo e guia seguido por agente sem contexto | vale | `teste/recursos.test.mjs`, `teste/guia-de-extensao.test.mjs`, `docs/referencia/ensaio-guia-de-extensao.md` |
| Ensaio com o Claude Code real | vale | `docs/referencia/ensaio-claude-code.md` |
| Agente sem contexto, só com o roteiro, diz o que falta e roda os testes de contrato (seção 15) | vale para o Codex | `docs/referencia/ensaio-roteiro-de-adaptacao.md`. OpenCode: não ensaiado (chaves vencidas) |
| A varredura de anonimização não acha nada | vale | `ok varredura de termos` no `verifica` |

## Limites que ficam

- Windows e macOS não foram executados.
- O roteiro de adaptação não foi ensaiado com o OpenCode. Para repetir, basta renovar a chave e rodar o mesmo pedido com `opencode run` (ver o registro do ensaio).
- O `ah atualizar` não foi ensaiado com agente real; o caminho pelo gancho é o de qualquer comando.
- Os demais limites estão na seção "Limites" de `docs/referencia/comandos.md`.

## Conferência final

No ramo `fecha-p1`, antes do merge na `dev`, com `FORCE_COLOR=1` herdado:

```
$ FORCE_COLOR=1 node ferramentas/verifica.mjs --node "$(mise where node@22)/bin/node" --node "$(command -v node)"
ok      suíte no Node v22.23.5: 995 testes, 994 passaram, 0 falharam, 1 pulados
ok      suíte no Node v26.13.1: 995 testes, 994 passaram, 0 falharam, 1 pulados
ok      varredura de termos
Sistema: linux. Windows e macOS não são verificados aqui (o repositório não tem CI).
```

O teste pulado é `inicioDoProcesso no macOS vem do ps`, que só roda no macOS.
