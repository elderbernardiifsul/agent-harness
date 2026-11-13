# Pendências das fatias 0 a 5: execução da linha A

Registro da linha A (itens 1 a 6) de `2026-11-13-pendencias.md`, no ramo `pend-a`, a partir de `dev` em `e4c621d`. Cada item teve o teste escrito antes do conserto e visto falhando; a suíte inteira e `node ferramentas/varre-termos.mjs` passaram antes de cada commit.

## Situação de partida

Nenhum dos seis itens estava resolvido de passagem. Conferência feita antes de cada um:

- item 1: o caminho `abrindo` do `close` não chamava nenhuma reação;
- itens 2 e 3: o `close` inteiro rodava sob a trava `frentes`, com o comentário de fechamento antes da remoção do worktree;
- item 4: o quadro não lia `deps.json`;
- item 5: `montarResumo` não recebia a fila de pesado;
- item 6: o `open` de outra frente recusava com `O arquivo de estado não é JSON válido`; o `close` de outra frente já passava (usava a listagem tolerante), mas sem aviso.

## Commits

| Commit | Item | Título |
|---|---|---|
| `f546c9a` | 1 | fix: close da abertura desfeita chama antesDeFechar e depoisDeFechar |
| `73a506d` | 3 | feat: close em fases, com a rede fora da trava das frentes |
| `6e8a149` | 2 | fix: close recusado na remoção do worktree deixa a frente visível e sem comentário repetido |
| `75e8a10` | 4 | feat: coluna BLOQUEIOS no quadro, pela leitura guardada do ah deps |
| `809734d` | 5 | feat: resumo do começo de sessão diz quem está no pesado |
| `e06ea4d` | 6 | fix: arquivo de frente ilegível não para open e close de outras frentes |
| `df00253` | 3 | feat: close da abertura parada desfaz a reserva fora da trava |

## Item 1: reações das extensões na abertura desfeita

**Feito.** No caminho `abrindo` do `close`, `antesDeFechar` roda depois da conferência de abertura parada e antes de qualquer mudança nos tickets; a recusa usa a mesma mensagem do fechamento comum (função `recusaDaExtensao`, agora compartilhada). `depoisDeFechar` roda depois de o registro sair. As duas recebem `ctx.aberturaDesfeita: true`, para a extensão distinguir este caminho; `docs/extensoes/interface.md` registra o campo. A extensão de teste `eco` passou a anotar `(abertura desfeita)` no `depoisDeFechar`.

Teste: `teste/extensoes.test.mjs`, "close da abertura desfeita: antesDeFechar pode recusar sem mexer em nada; depoisDeFechar roda".

## Item 3: rede fora da trava no `close`

**Feito**, inclusive no caminho da abertura parada (commit `df00253`), que o plano não citava, mas também falava com o GitHub sob a trava.

Desenho adotado, no molde do `open`:

1. **Primeira fase, sob a trava:** todas as recusas de antes (checkout, ramo base, histórico sujo, perda de trabalho, `antesDeFechar`, operações na fila para frente passada) e, por último, a marca `fechando: {pid, inicio}` gravada no registro da frente, com o processo deste `close`.
2. **Fora da trava:** `quemTemAFrente` e `confirmarRetomada` (frente passada com tickets), o resumo e `liberarTickets` (comentário de fechamento e edição do ticket).
3. **Última fase, sob a trava:** confere que o registro é o mesmo (mesmo id, mesmo estado, marca deste processo); grava `fechamentoComentado`; confere de novo o ramo base, relê as referências (o `handoff` pode ter empurrado o ramo no meio) e repete as conferências de perda de trabalho; remove worktree e ramo, grava o histórico, tira o registro, solta o foco, grava o evento e roda `depoisDeFechar` (ainda com `dentroDaTrava: true`, como antes).
4. **Depois da trava:** o `push --delete` do ramo remoto, com a decisão (contido na base remota, só na base local) tomada na última fase com as referências locais.

Escolhas:

- **Marca em campo, não estado novo.** O estado da frente não muda durante o `close` (continua `ativa` ou `passada`); a marca é o campo `fechando`, lido por `fechamentoEmCurso` (novo em `nucleo/lib/vida.mjs`, mesma regra do processo de `aberturaEmCurso`: pid vivo e mesma hora de início). Um estado novo obrigaria a revisar gancho, `sweep`, `doctor`, `frentesDa` e as travas; a marca só precisa ser respeitada por quem muda a frente sob a trava.
- **Quem respeita a marca:** outro `close` ("está sendo fechada agora"), o `handoff` (nas duas fases), o `takeover` (na conferência das duas fases) e a retomada pelo `open` (na primeira fase). O quadro mostra `fechando`; o `--json` traz `fechamentoEmCurso`.
- **Marca de processo morto não vale:** o `close` seguinte segue normalmente; `fechamentoComentado` evita o comentário repetido. Em recusa ou erro depois da primeira fase, a marca é retirada sob a trava.
- **Abertura parada:** o registro `abrindo` passa a guardar o processo do `close` (campo `processo`, o mesmo que o `open` usa); outro `open` ou `close` vê uma "abertura em curso" enquanto o `close` desfaz a reserva fora da trava. Na última fase, o registro só sai se ainda guarda este processo.

Mudanças de comportamento visíveis, registradas em `docs/referencia/comandos.md` (seções `open`, `board`, `handoff`, `takeover`, `close`):

- recusa nova `A frente as-1 carrinho está sendo fechada agora (processo <pid>).` em `close`, `handoff`, `takeover` e `open`;
- recusa nova `A frente carrinho mudou durante o fechamento (…).` no `close`;
- estado `fechando` no quadro;
- o aviso do ramo remoto passou a sair depois do `depoisDeFechar` e da retirada do registro. Um `open` do mesmo nome que entre nesse intervalo encontra o ramo remoto e recusa com a saída que já existia (`git push origin --delete …`);
- durante o `close` de uma abertura parada, outro `open` do nome recebe `Há uma abertura da frente carrinho em curso`, embora o processo seja um `close`. A mensagem foi mantida para não criar um terceiro estado do registro `abrindo`.

Testes (todos vistos falhando antes): em `teste/close.test.mjs`, "close com o comentário no ticket demorando…" (trava livre durante o comentário, quadro com `fechando`, outro `close` e o `handoff` recusam, comentário uma vez só), "close de frente passada com a retomada no ticket demorando…" (a retomada pelo `open` recusa no meio) e "close com o push que apaga o ramo remoto demorando…" (gancho `pre-receive` lento no remoto de teste); em `teste/reserva.test.mjs`, "close de abertura parada: a leitura dos tickets roda fora da trava…". `teste/close.test.mjs`, `teste/retomar.test.mjs` e `teste/handoff.test.mjs` continuam verdes sem mudança nos testes existentes.

## Item 2: remoção do worktree recusada depois do comentário

**Feito**, com as duas saídas que o plano oferecia, porque uma só não cobre os casos:

- **Conferência antes dos tickets:** o worktree trancado (`git worktree lock`), única causa de recusa do `git worktree remove` simples que se conhece de antemão sem simular a remoção, é conferido na primeira fase pela saída de `git worktree list --porcelain`. Recusa: `O worktree <wt> está trancado no git (<motivo>); o git não o remove.`, com `git worktree unlock`.
- **Estado visível quando a recusa só aparece na remoção** (arquivo novo entre a conferência e a remoção, problema achado na reconferência, ramo base trocado durante a fase de rede): a recusa diz `os tickets já receberam o comentário de fechamento, e o próximo ah close não comenta de novo` (antes dizia "nada foi apagado"); o quadro mostra a frente como `fechamento parado` (lido de `fechamentoComentado`); o `close` seguinte termina sem comentar de novo, o que já valia.

Testes: "worktree trancado: close recusa antes de mexer nos tickets" e "remoção do worktree recusada depois do comentário: o quadro mostra e o segundo close termina sem comentar de novo".

Não coberto: worktree com submódulos inicializados, que o `git worktree remove` também recusa. Detectá-lo antes exigiria repetir a regra interna do git (`validate_no_submodules`); fica pelo segundo caminho (recusa visível e `close` seguinte sem comentário repetido). Submódulos já estavam como pendência das fatias 0 e 1.

## Item 4: coluna BLOQUEIOS no quadro

**Feito.** Com `deps.json` legível no estado, o quadro ganha a coluna `BLOQUEIOS` (depois de `ÚLTIMA NOTA`, antes das colunas de extensão): os bloqueios abertos de todos os tickets da frente, sem repetição (`#3,dono/outro#7`), ou `—`; corte em 40 caracteres. O rodapé `Bloqueios: leitura de ah deps de AAAA-MM-DD HH:MM (rode ah deps para atualizar).` sai depois das sobreposições, no fuso da configuração; com fuso que não se formata, sai o instante gravado. Sem leitura guardada (ou com o arquivo ilegível), nem coluna nem rodapé. O `--json` ganha `bloqueios` por frente e `bloqueiosLidosEm` no objeto de fora, só com leitura guardada (o formato do quadro vazio não muda).

A regra de "bloqueio aberto" saiu de `avisosDeBloqueio` para `bloqueiosAbertos` (exportada de `nucleo/lib/deps.mjs`), usada pelo aviso do `open` e pelo quadro.

Teste: `teste/board.test.mjs`, "coluna BLOQUEIOS…", que confere também que o quadro não chama o `gh`.

## Item 5: fila de pesado no resumo

**Feito.** `linhaDoPesado` (em `nucleo/lib/resumo.mjs`) monta uma linha de até 200 caracteres a partir do retrato da fila: `Pesado: rodando senha 2 (loja, carrinho, há 5 min); 1 esperando (tools/ah board).`, até três que rodam e `e mais N`; `ninguém rodando` quando só há quem espera; nada com a fila vazia ou ilegível (o quadro e o `doctor` mostram o erro). A linha entra na parte fixa do resumo, depois da situação, e conta no `LIMITE_RESUMO` como as demais (o corte continua tirando primeiro as outras frentes).

Mudança fora dos arquivos da linha A: a chamada em `nucleo/adaptadores/contrato.mjs` (começo de sessão) passou a ler `retratoDaFila(dirDaFila(amb.env))`, dentro de `try`, e a entregar a linha a `montarResumo`. São duas linhas e uma importação; a linha C mexe no gancho e pode encontrar conflito pequeno nesse arquivo ou na seção "gancho" de `docs/referencia/comandos.md`, onde a frase do resumo do início de sessão ganhou a menção ao pesado.

Testes: `teste/contrato.test.mjs`, "o resumo diz quem está no pesado…" (formato, corte, posição e limite com 40 frentes) e "inicio: o resumo mostra a fila de pesado da máquina".

## Item 6: arquivo de frente ilegível no `open` e no `close`

**Feito.** O `open` passou a usar a listagem tolerante em todos os pontos (regra do executor, próximo id, `--para`, conferência da passagem) e emite, na primeira fase, `Aviso: arquivo de frente ilegível: <arquivo> (rode ah doctor)`, o mesmo texto do quadro. O `close` emite o mesmo aviso. O arquivo ilegível não é lido nem gravado; `open` ou `close` com o nome dele continuam recusando com `O arquivo de estado não é JSON válido: …` e `Faça: rode ah doctor`.

Limite aceito: a frente ilegível fica fora da regra do executor e da conta do próximo id. Se o arquivo guardava uma frente desta máquina com o id mais alto, o `open` pode repetir esse id; a linha do histórico e as frentes legíveis continuam evitando a repetição nos demais casos. A alternativa (recusar o `open` enquanto houver arquivo ilegível) era o comportamento que a pendência pedia para mudar.

Teste: `teste/open.test.mjs`, "arquivo de frente ilegível: open e close de outras frentes seguem com aviso; a ilegível fica intocada".

## Verificação final

```
$ node --test teste/ 2>&1 | grep -E "^ℹ (tests|pass|fail|skipped)"
ℹ tests 937
ℹ pass 935
ℹ fail 1
ℹ skipped 1
$ node ferramentas/varre-termos.mjs
Nenhum termo proibido encontrado.
```

A falha é a esperada neste worktree: `teste/atualizar.test.mjs`, "a cópia instalada sem --de recusa e diz o clone registrado…", que exige "agent-harness" no caminho do clone.

## Observações para a revisão

- **Teste instável fora da linha A:** `teste/estado.test.mjs`, "revisão 2, achado 7: a tomada de trava vencida limpa os restos com mais de 10 min, e só eles", falhou uma vez em cerca de dez rodadas da suíte com `ENOENT` em `y.vencida.1.<ms>.ab12cd34/dono.json`. O teste chama `ha(20)` (que lê `Date.now()`) duas vezes para montar o mesmo nome de pasta; quando o milissegundo vira entre as duas linhas, os caminhos diferem. Conserto: calcular o nome uma vez. Não foi feito aqui (arquivo de teste das travas do estado, fora da linha A).
- **Arquivos de outras linhas:** nenhum de `nucleo/lib/travas.mjs`, `nucleo/lib/shell.mjs`, configuração, `init`, `atualizar`, `nota`, `nucleo/bin/ah.mjs` foi tocado. `nucleo/adaptadores/contrato.mjs` recebeu a chamada do item 5 (ver acima).
- **Campo novo no registro da frente:** `fechando` (`{pid, inicio}`), presente só durante um `close`; frentes de versões anteriores não o têm, e a leitura trata a ausência como "nenhum close em curso".
