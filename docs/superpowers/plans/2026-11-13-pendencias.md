# Pendências das fatias 0 a 5: plano

**Objetivo:** resolver as pendências registradas nos planos das fatias (`2026-11-12-nucleo-fatias-0-e-1-pendencias.md`, `2026-11-13-nucleo-fatia-2-pendencias.md`, seções "Pendências" de `2026-11-13-nucleo-fatia-3.md`, `2026-11-13-nucleo-fatia-5.md` e `2026-11-13-nucleo-fatia-5b.md`) que têm conserto no código e cabem sem mudar o desenho.

**Base:** `dev` em `5396958` (0.2.0). Cada linha trabalha num ramo próprio a partir dela; quem constrói confere, antes de cada item, que a pendência ainda existe (algumas foram resolvidas de passagem) e registra no fim deste plano as já resolvidas.

## Critério de escolha

- **Entram:** defeitos e recusas indevidas com cenário reproduzível em teste local.
- **Ficam como limite documentado** (não se consertam aqui):
  - o que depende de outro sistema operacional ou de agente real;
  - os casos que a seção "Limites das travas" da fatia 2 declara de propósito ("as travas pegam engano, não má-fé": `find -delete`, `xargs rm`, `python -c`, `push --delete` etc.);
  - as premissas da trava do estado (sistema de arquivos local, relógio comparável).
- **Windows e macOS:** a CI já tem a matriz com os três sistemas (`.github/workflows/ci.yml`), mas só roda com push, que depende de ordem do autor.

## Linha A: ciclo da frente (`open`, `close`, `board`, resumo)

1. **`close` da abertura desfeita (`abrindo`) sem reações das extensões** (fatia 5b): chamar `antesDeFechar` (que pode recusar) e `depoisDeFechar` também nesse caminho.
2. **`close` recusado na remoção do worktree** (fatia 2): hoje o ticket já recebeu o comentário de fechamento e perdeu responsável e rótulo quando a remoção é recusada. Conferir a remoção possível antes de mexer nos tickets (ou, quando a recusa só aparece na remoção, deixar a frente num estado que o segundo `close` termine sem comentar de novo e que o quadro mostre).
3. **Rede dentro da trava no `close`** (fatia 2): a consulta ao servidor e o `push` que apaga o ramo remoto rodam com a trava de frentes presa (até 120 s). Usar duas fases, como o `open`: estado intermediário sob a trava, rede fora dela, conclusão sob a trava.
4. **Coluna de bloqueios no quadro** (fatia 5b, decisão 19): coluna `BLOQUEIOS` lida só da leitura guardada do `deps` (`deps.json`), sem rede; sem leitura guardada, a coluna não aparece; com leitura guardada, o rodapé diz de quando ela é.
5. **Resumo sem a fila de pesado** (fatia 3, seção 8 do desenho): uma linha no resumo do começo de sessão quando há alguém rodando ou esperando no pesado, dentro do `LIMITE_RESUMO`.
6. **Arquivo de frente corrompido derruba `open` e `close`** (fatias 0 e 1): o `board` já tolera; `open` e `close` de outras frentes devem seguir, com aviso que aponta o `doctor`; a frente ilegível continua intocável.

## Linha B: travas e leitor de shell (`travas.mjs`, `shell.mjs`)

Recusas indevidas (falsos positivos), com teste de recusa e de passagem para cada uma:

7. **Ramo anterior na T5:** em `git switch main && git pull && git switch dev && git push`, o push roda na `dev` e é recusado, porque o ramo de antes da troca nunca sai da lista. O ramo efetivo depois de trocas conhecidas é o último destino; a lista só soma possibilidades quando um destino é incerto.
8. **`$` ou crase entre aspas simples na T2:** em `git add` ou `git commit` no checkout principal, um caminho literal entre aspas simples não é expansão e não deve cair na T2.
9. **Curinga e pasta oculta na T4:** `*` e `?` não casam componente que começa com ponto (regra do shell). `rm -rf *` numa pasta acima de um diretório oculto que guarda worktree de outra sessão não é recusado à toa.
10. **`cd` que falha no meio:** `cd x && a; b` com `cd` que pode falhar já gera cwds alternativos; conferir que `a` e `b` são avaliados nos cwds certos e acrescentar o teste que falta.

Passagens indevidas que cabem sem leitor novo:

11. `gh api …/pulls/<n>/merge` (método PUT) avaliado pela T5 como `gh pr merge`.
12. `xargs git add` (e `xargs -0 git add`) avaliado pela T2 como `git add` com caminhos desconhecidos.

## Linha C: configuração, `init`, `atualizar`, `nota`, gancho

13. **`fuso` inválido** (fatia 5b): validar na configuração (`Intl.DateTimeFormat` com o fuso). Configuração inválida para com a linha e o motivo, como os outros campos, e `deps` e `--numeros` deixam de cair em "Erro inesperado".
14. **Dois `atualizar` ao mesmo tempo** (fatia 5): trava `atualizar` do estado (`comTrava`) em volta da troca.
15. **CRLF no `atualizar`** (fatia 5): com `core.autocrlf=true`, o arquivo no disco não tem o sha256 gravado e o `atualizar` acusa alteração à mão que não houve. Normalizar o fim de linha dos arquivos de texto do núcleo na conta do sha256 (manifesto e conferência), mantendo o sha256 exato para os demais.
16. **`--simular` que termina em recusa grava `recusa-de-comando`** (fatia 5): com `--simular`, nada é gravado, nem a recusa.
17. **`ah nota corrigir o -h do parser`** sem aspas mostra a ajuda (fatias 0 e 1): no `nota`, `-h` e `--help` só pedem ajuda como único argumento; os demais argumentos formam o texto. Vale também para o despacho, que hoje intercepta o `-h` antes do comando: o comando pode declarar que trata a própria ajuda.
18. **`--teste` no `init` ignorado quando a configuração já existe** (fatias 0 e 1): aplicar `ci.comandoDeTeste` com `--teste` mesmo na configuração existente, mostrando a mudança, ou recusar com a saída. Escolher e registrar.
19. **Pasta `.harness` que é link simbólico** passa pela conferência do gancho (fatias 0 e 1): o gancho e o `doctor` recusam `.harness` simbólico com motivo e saída.
20. **Datas sem fuso nas telas** (fatia 2): as telas que mostram hora (quadro, `whoami`, `sweep`, `deps`) dizem o fuso uma vez (cabeçalho ou sufixo), e os registros continuam em UTC.

## Linha D: ensaio com o Claude Code real (depois de A, B e C)

21. Repetir o ensaio de `docs/referencia/ensaio-claude-code.md` com o Claude Code instalado na máquina (`claude -p`, sem interação, num projeto descartável, com `AH_ESTADO`, `AH_WORKTREES`, `AH_FILA` e `AH_GH` isolados): uma trava de extensão (a `revisao/gerados` do guia) recusando uma edição pelo gancho, o `ah pesado` com a T6 e o `ah recursos`. Registrar em `docs/referencia/ensaio-claude-code.md` (seção nova, com data, versão do agente, comandos e saídas, caminhos reais trocados por `<tmp>`).

## Fica fora

- Execução em Windows e macOS (depende de push para a CI rodar).
- Codex e OpenCode (decisão do autor, seção 15 do desenho).
- Contêineres com o mesmo hostname, a pasta de trava presa por processo parado (só espera) e a janela entre iniciar o comando do pesado e gravar o grupo (limites da fatia 3).
- Retomadas cruzadas, frentes antigas sem lista de sessões, sessão sem processo e sessão que aguarda continuação (comportamentos aceitos na fatia 2).
- `caminhosEmComum` (`a/xb` contra `a/**/b`), conservador de propósito.
- Custo do gancho com muitas frentes (cerca de 50 ms com 20); só com medição que mostre necessidade.

## Forma de trabalho

- **Ramos:** um por linha, em worktree próprio.
- **Testes:** primeiro, vistos falhando antes do conserto.
- **Antes de cada commit:** suíte inteira verde e `node ferramentas/varre-termos.mjs` com código 0.
- **Revisão e integração:** revisão independente do conjunto e merge na `dev`, sem push.
- **Registro:** as decisões e as pendências encontradas já resolvidas vão para uma seção "Execução" no fim deste plano.
