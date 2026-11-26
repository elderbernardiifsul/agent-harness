# Pendências das fatias 0 a 5: execução da linha C

Plano: [2026-11-13-pendencias.md](2026-11-13-pendencias.md), itens 13 a 20. Ramo `pend-c`, a partir de `e4c621d`. Cada item foi conferido antes (a pendência ainda existia em todos), reproduzido por um teste visto falhando e corrigido em commit próprio. Antes de cada commit, a suíte inteira e a varredura de termos rodaram.

## Estado no fim

- Suíte: 937 testes, 935 passam, 1 pulado, 1 falha. A falha é a esperada e anterior a este trabalho: `a cópia instalada sem --de recusa e diz o clone registrado; com --de entrega ao clone` (`teste/atualizar.test.mjs`) espera um caminho de clone que contenha `agent-harness`, o que não vale num worktree em `~/.cache/ah-wt/pend-c`. Não foi alterada.
- `node ferramentas/varre-termos.mjs`: código 0.
- Base: 926 testes (924 passam, 1 pulado, a mesma falha). Os 11 testes novos estão listados por item.

## Itens

### 13. `fuso` inválido (`fix: fuso inválido recusado na validação da configuração`)

O esquema de `nucleo/lib/config.mjs` confere o fuso com `new Intl.DateTimeFormat('en-US', {timeZone})`. Valor desconhecido gera o erro `fuso (fuso desconhecido: <valor> (use um nome IANA como America/Sao_Paulo ou UTC))`, e o despacho recusa como nos demais campos (`Faça: corrija .harness/config.json`). Antes, `ah board --numeros` caía em "Erro inesperado"; `ah deps` sem leitura guardada passava, porque só formata data quando usa o cache. O `doctor` acusa pelo item da configuração. A conferência de `deslocamento` em `nucleo/lib/frente.mjs` ficou como está (defesa redundante).

Testes: `teste/config.test.mjs`, dois novos (validação direta; `deps` e `board --numeros` recusam pela configuração).

### 14. Dois `atualizar` ao mesmo tempo (`fix: atualizar sob a trava "atualizar" do estado`)

Depois da escolha da origem e da recusa de link simbólico, todo o restante (sobras, conferências, troca, `AGENTS.md`, evento) roda sob `comTrava(dirEstado, 'atualizar')`, com espera de 30 s e prazo de 120 s (o teto do `comTrava`). O trecho precisa abranger também a limpeza das sobras: sem isso, o segundo `atualizar` apagaria como sobra a pasta `nucleo.novo-*` que o primeiro ainda está montando.

Escolha: a simulação também espera a trava, para não ler a troca pela metade (sem `.harness/nucleo/`, ela recusaria com "parou no meio"). A trava é uma pasta temporária no estado da máquina, removida no fim; o projeto não é tocado.

Teste: `teste/atualizar.test.mjs`, "dois atualizar ao mesmo tempo": o teste prende a trava, inicia um `atualizar`, confirma que nada mudou durante 800 ms e que o comando termina depois da liberação, com o núcleo trocado.

Fica: a janela sem `.harness/nucleo/` entre as duas renomeações continua sem trava em relação aos ganchos e ao `tools/ah` das sessões vivas (pendência da fatia 5, fora deste item).

### 15. CRLF no `atualizar` (`fix: CRLF dos arquivos de texto do núcleo não conta como alteração à mão`)

Nova função `sha256DoNucleo` em `nucleo/lib/copia.mjs`. Em arquivo sem byte nulo (o critério de texto do git), CRLF conta como LF. Em arquivo com byte nulo (binário), vale o sha256 exato. A função é usada nos três pontos em que a lista é montada: `arquivosDaCopia` (manifesto e `doctor`), `listaInstalada` (conferência) e `listaDoCommit` (manifesto antigo). Arquivo só com LF dá o mesmo sha256 de antes; por isso, os manifestos já gravados continuam válidos, porque todos os arquivos do núcleo estão em LF no repositório (`git ls-files --eol`).

Testes: em `teste/atualizar.test.mjs`, (a) checkout real com `core.autocrlf=true` (o git reescreve o núcleo com CRLF): o `atualizar` passa; (b) mudança à mão de verdade no mesmo checkout: recusada, com só o arquivo mudado na lista; (c) binário com `\r\n` cujo conteúdo no disco perde o CR: recusado como alterado. Em `teste/copia.test.mjs`, um teste unitário da função (CR solto não é fim de linha).

Limites: um clone com CRLF cujo manifesto foi gravado antes desta mudança (com o sha256 exato) acusa uma vez a diferença; a saída continua sendo `--forcar`. O caso de "clone com mudança não commitada na hora do `init`", citado na mesma pendência da fatia 5, não é de fim de linha e não foi tratado.

### 16. `--simular` que termina em recusa (`fix: atualizar --simular não grava a recusa nos eventos`)

O `executar` do `atualizar` marca a `ErroDeUso` com `semRegistro = true` quando há `--simular`, e o despacho (`nucleo/bin/ah.mjs`) deixa de gravar `recusa-de-comando` nesse caso. A marca é genérica: outro comando com simulação pode usá-la.

Teste: `teste/atualizar.test.mjs`, "--simular que termina em recusa não grava nada": o `eventos.jsonl` não muda com `--simular`, e a mesma recusa sem `--simular` continua registrada.

### 17. `ah nota corrigir o -h do parser` (`fix: ah nota com -h ou --help no meio do texto grava a nota`)

Escolha: o módulo do comando declara `export const ajudaSoComoUnicoArgumento = true`. Nesse caso, o despacho só mostra a ajuda quando `-h` ou `--help` é o único argumento. A ajuda continua impressa pelo despacho, igual à dos demais comandos; o comando não precisou de código próprio de ajuda. O `nota` é o único comando que declara.

Testes: `teste/whoami.test.mjs`. O teste da I3 sobre `nota` ganhou os casos `nota corrigir o -h do parser`, `nota documentar --help` (gravam) e `nota -h` (ajuda, nada gravado). O teste geral de `--help` deixou de exigir ajuda em `<comando> x --help` para quem declara a opção.

Não feito: os comandos de extensão não repassam essa declaração (`moduloDaExtensao`). Isso exigiria mudar a interface das extensões (`docs/agentes/`, guia de extensão), fora da linha.

### 18. `--teste` no `init` com configuração existente (`fix: init recusa --teste que a configuração existente não tem`)

Escolha: recusar, e não aplicar. O desenho mantém `.harness/config.json` "nunca sobrescrita" pelo `init`, e reescrever o JSON para mudar um campo perderia a formatação de quem o editou. A recusa acontece antes de qualquer gravação, quando o valor de `--teste` difere de `ci.comandoDeTeste` gravado: `a configuração já existe e o init não a reescreve: --teste "<x>" não seria aplicado (ci.comandoDeTeste atual: …)`, com `Faça: ponha o comando em ci.comandoDeTeste no .harness/config.json e rode ah init de novo; o init reescreve a CI com ele`. Com o mesmo valor, o `init` segue.

Testes: `teste/init.test.mjs`, novo (recusa sem mudar configuração nem CI; com o comando posto na configuração, o mesmo `--teste` passa e a CI sai com ele). Em `teste/protecao.test.mjs`, o teste "CI editada à mão…" usava `--teste` só de passagem e passou a rodar sem ele (o objetivo dele é o conflito da CI, que continua provado).

Observado e não tratado: `--projeto` e `--agentes` também são ignorados em silêncio quando a configuração existe. Fica para registro, fora do item 18.

Tratado em 26/11/2026 (`fix: init recusa --projeto e --agentes que a configuração existente não tem`): a mesma escolha do item 18. Valor diferente do gravado recusa antes de gravar, e o mesmo valor passa; em `--agentes`, a ordem e os espaços da lista não contam. Teste novo em `teste/init.test.mjs`.

### 19. `.harness` que é link simbólico (`fix: gancho e doctor recusam .harness que é link simbólico`)

- Gancho (`nucleo/comandos/gancho.mjs`): achada a raiz, `lstat` em `.harness`; se for link, o evento cai na regra de quebra (`respostaNaQuebra`). No evento "antes", isso dá `Recusado (T0): o harness não conseguiu avaliar (.harness é um link simbólico; o harness não segue o link)` com `Faça: rode tools/ah doctor`, e o `tools/ah doctor` continua liberado (`passaNaQuebra`). Nos demais eventos, sai um aviso.
- `doctor`: item novo `.harness é uma pasta do projeto`, logo antes de `.harness/config.json válido`. Ele falha com o destino do link e a orientação de trocar o link pela pasta; sem `.harness`, o item não aparece (o da configuração acusa). O `doctor` passa a ter 24 itens.

Testes: `teste/doctor.test.mjs`, dois novos (link: recusa do gancho, passagem do `tools/ah doctor` e falha do item; pasta comum: item ok). O teste C1 passou de 23 para 24 itens e confere a posição do item novo.

Não feito: `docs/aula/2026-11-13-material-de-apoio.md` ainda cita "23 itens". O pedido restringia a documentação às seções de `docs/referencia/comandos.md`.

### 20. Datas sem fuso nas telas (`fix: a hora mostrada pelo deps diz o fuso`)

Antes de mexer, o levantamento das telas mostrou que só o `deps` exibe hora de relógio: o cabeçalho com a leitura guardada e, pela mesma função, o aviso de bloqueio do `open`. O quadro, o `whoami` e o `sweep` só mostram durações ("há 5 min", "último sinal há 2 dias"), e o `board --numeros` já traz "(fuso …)" no título. Escolha: `quando()` em `nucleo/lib/deps.mjs` passa a acrescentar o nome do fuso depois da hora (`2026-11-13 14:05 America/Sao_Paulo`). Os registros continuam em UTC.

O `board` não foi editado. A coluna de bloqueios da linha A (item 4), se usar `quando()` para o rodapé, já recebe o sufixo.

Testes: `teste/deps.test.mjs`, as duas expressões de data passaram a exigir o fuso.

## Documentação

`docs/referencia/comandos.md`, só nas seções tocadas: ajuda geral (a declaração `ajudaSoComoUnicoArgumento`), `init` (`--teste` e a recusa nova), `atualizar` (CRLF, trava, `--simular` sem evento), `doctor` (24 itens, `.harness` simbólico, `fuso` validado), `nota` (`-h` no texto) e `deps` (hora com o nome do fuso). `whoami` e `sweep` não mudaram, porque não mostram hora; o documento não tem seção própria de configuração.

## Arquivos de outras linhas

Nenhum arquivo das linhas A (`open.mjs`, `close.mjs`, `board.mjs`, `resumo.mjs`) ou B (`travas.mjs`, `shell.mjs`) foi editado. O texto do aviso de bloqueio do `open` muda por meio de `nucleo/lib/deps.mjs` (item 20); o teste dele está em `teste/deps.test.mjs`.

## Observação de execução

Numa das rodadas da suíte, o teste `revisão 2, achado 7: a tomada de trava vencida limpa os restos com mais de 10 min, e só eles` (`teste/estado.test.mjs`) falhou uma vez e passou ao ser repetido sozinho e nas rodadas seguintes. Ele não toca código desta linha. Parece sensível a tempo e fica para registro.
