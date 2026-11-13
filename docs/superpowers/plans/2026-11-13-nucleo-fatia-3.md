# Núcleo do agent-harness, fatia 3 (máquina): plano

**Objetivo:** trabalho pesado sem derrubar a máquina. `ah pesado -- <comando>` espera a vez numa fila da máquina, roda, repassa saída e código; a trava T6 recusa rodar comando pesado fora da fila; `board` e `doctor` mostram a fila; `init` instala classes de exemplo sem ligá-las.

**Desenho:** `docs/superpowers/specs/2026-11-12-nucleo-design.md`, seções 5 (`pesado`), 7 (T6 e "Fila de trabalho pesado"), 11 ("Fila de pesado entre projetos"), 12.4, 12.7 e 14. Restrições globais: as do plano da fatia 2 (linhas 1 a 104) valem aqui.

**Tecnologia:** Node 22+, ESM, sem dependências, `node:test`.

## Decisões (onde o desenho deixa escolha)

1. **Onde mora a fila.** Pasta da máquina, fora de qualquer projeto: `AH_FILA` se definida (testes), senão `<base do estado>/_fila` (a mesma base de `AH_ESTADO`/XDG/`Application Support`/`LOCALAPPDATA`; `_` não é nome de projeto válido, então não colide). Dois arquivos: `config.json` (da máquina) e `fila.json` (estado), mais a pasta de travas.
2. **Configuração da máquina:** `{"versao": 1, "vagas": 2, "memoriaLivreMinimaMb": 4096}`, criada com esses padrões na primeira chamada. `vagas` inteiro de 1 a 64; memória inteira de 0 a 1048576. Arquivo ilegível ou inválido para com a linha e o motivo.
3. **Classes na configuração do projeto:** `pesado.classes = {<nome>: {vagas: <1..64 | "todas">, padroes: [<texto>]}}`. Chaves de `pesado` que começam com `_` são comentário e não são lidas (é assim que o `init` instala o exemplo, em `pesado._exemplo`, com `classes` vazio). Projeto sem classes: a T6 não recusa nada, e todo comando da fila conta como "todas as vagas".
4. **Padrão de comando:** palavras separadas por espaço; casa quando as primeiras palavras do comando casam uma a uma (`*` e `?` como curinga dentro da palavra), comparando o programa pelo nome sem pasta nem `.exe`. Ex.: `npm run build*` casa `npm run build:prod --x`; `playwright` casa só `playwright ...` (quem quer `npx playwright` escreve esse padrão).
5. **Classe de um comando:** o interpretador de shell da T6 quebra o texto em comandos simples (a fila usa o mesmo). Vale a classe mais restritiva entre os que casam; se nenhum casa, a mais restritiva configurada (a de mais vagas; "todas" ganha). Empate: a primeira na ordem do arquivo.
6. **Como o comando roda:** com um argumento só depois do `--`, o texto vai para o shell (`sh -c`; no Windows `cmd /d /s /c`); com vários, roda direto, sem shell. Saída herdada (sem cópia em memória); código de saída do comando, ou 128 + número do sinal quando morre por sinal.
7. **Ordem:** fila estrita por senha (número crescente gravado em `fila.json`). Só o primeiro da espera pode começar; isso já impede que quem pede todas as vagas seja ultrapassado. Custo: um "leve" atrás de um "exclusivo" espera, mesmo havendo vaga.
8. **Lado a lado:** com alguém rodando, só começa se cabe nas vagas, se a memória livre (`os.freemem()`) é pelo menos a mínima e se ninguém rodando é do mesmo worktree (topo do git do cwd). Para os testes, `AH_FILA_MEMORIA_LIVRE_MB` substitui a medida.
9. **Senha morta:** cada entrada guarda pid e hora de início do processo do `ah pesado` (`vida.mjs`); toda passagem pela fila descarta as entradas cujo processo não existe ou cuja hora de início mudou.
10. **Exclusão mútua:** `comTrava` de `estado.mjs` na pasta da fila (trava `fila`); a espera relê a cada 100 ms (`AH_FILA_PAUSA_MS` para os testes).
11. **Matar a árvore:** POSIX: o comando nasce em grupo próprio (`detached`) e o sinal vai para o grupo (`-pid`): SIGTERM, até 3 s, depois SIGKILL. Windows: `taskkill /pid <pid> /T /F`. Só depois a entrada sai da fila. Limite declarado: neto que muda de grupo (`setsid`) escapa. SIGINT, SIGTERM e SIGHUP são tratados; o `ah` sai com 130/143/129.
12. **Aninhada:** o filho recebe `AH_PESADO_ANINHADO=<senha>`; `ah pesado` com essa variável roda direto, sem fila. A T6 também deixa passar quando a variável está no ambiente do gancho ou no prefixo do comando.
13. **Versão do estado:** `fila.json` com `versao: 1`; versão maior (ou desconhecida) faz o `pesado` e o `board` pararem com "atualize o harness".
14. **T6:** fica em `travas.mjs`, pura: lê `ctx.config.pesado.classes`. A recusa traz `Faça: tools/ah pesado -- <comando>`. `tools/ah pesado ...` não casa com padrão nenhum porque o programa é o `ah`; o que vem depois do `--` não é relido.
15. **`ah pesado` não exige sessão** (subagente e terminal à mão também usam) e exige config (as classes vêm dela).
16. **Memória livre no Windows e no macOS:** `os.freemem()`; no macOS ela não conta cache recuperável, então tende a subestimar; declarado na referência.

## Mapa de arquivos

```
nucleo/lib/fila.mjs          (novo) pasta e configuração da fila, estado com versão, classes, padrões, decisão de quem roda
nucleo/lib/arvore.mjs        (novo) rodar comando em grupo próprio e matar a árvore
nucleo/lib/config.mjs        + pesado (validação das classes; `_` é comentário)
nucleo/lib/travas.mjs        + T6
nucleo/adaptadores/contrato.mjs  + `aninhado` no ctx das travas (uma linha)
nucleo/comandos/pesado.mjs   (novo)
nucleo/comandos/board.mjs    + fila no texto e no --json
nucleo/comandos/doctor.mjs   + item "Fila de pesado"
modelos/config.json          + pesado com classes vazias e _exemplo
modelos/sessoes-paralelas.md uma linha (a T6 existe)
teste/fila.test.mjs, teste/pesado.test.mjs (novos); travas, config, board, doctor, init (acréscimos)
docs/referencia/comandos.md, README.md, docs/referencia/capacidades-por-agente.md
```

## Tarefas

1. **Configuração `pesado`.** Teste (config): classes válidas passam; `vagas` 0, `"tudo"`, padrão vazio, classe sem padrões e chave desconhecida recusam com o campo; `_exemplo` é aceito e ignorado; padrão do modelo valida. Commit `feat: configuração das classes de pesado`.
2. **`fila.mjs`, parte pura.** Testes: casar padrão (curinga, nome sem pasta, prefixo de palavras); classe de um texto (encadeamento, `bash -c`, nenhum casa → mais restritiva; sem classes → todas); vagas efetivas ("todas" e acima do total viram o total); `quemPodeRodar` (fila estrita, vagas, memória, mesmo worktree, descarte de morto por pid e por hora de início); versão desconhecida recusa com a saída; configuração da máquina criada com padrões e inválida recusada. Commit `feat: regras da fila de pesado`.
3. **`arvore.mjs`.** Teste (POSIX, `skip` no Windows): filho que cria neto e grava os pids em arquivo; `matarArvore` mata os dois. Commit `feat: matar a árvore do comando`.
4. **`ah pesado`.** Testes com projeto temporário e `AH_FILA` próprio: roda e devolve saída e código; `--help`; `--classe` sem rodar; sem `--` recusa com a saída; duas chamadas com 1 vaga rodam em série e em ordem (arquivo-sinal); com 2 vagas e memória sobrando, dois worktrees rodam juntos e o mesmo worktree não; memória abaixo do mínimo serializa; senha morta não prende; aninhada roda direto; SIGTERM mata filho e neto e solta a vaga; dois projetos com o mesmo `AH_FILA` disputam a mesma vaga; `fila.json` com versão 99 recusa. Commit `feat: ah pesado`.
5. **T6.** Testes (travas): recusa `npm run build`, encadeado, em subshell, em `bash -c`, com `env`/`cd` antes; passa `tools/ah pesado -- npm run build`, `AH_GUARD=off` (liberada), aninhada, sem classes, comando que não casa; a recusa tem saída com o comando. Teste pelo gancho: evento `recusa` com `trava: 'T6'`. Commit `feat: trava T6`.
6. **`board` e `doctor`.** Testes: board mostra quem roda e quem espera (classe, há quanto tempo) e o `--json` traz `fila`; doctor acusa configuração da fila ilegível, versão desconhecida e senha morta. Commit `feat: fila no board e no doctor`.
7. **`init`.** Teste: config instalada tem `pesado.classes` vazio e `_exemplo`; projeto sem classes não muda. Commit junto com a tarefa 1 ou 6 se couber.
8. **Documentação.** `comandos.md` (comando, T6, configuração, limites), `README.md`, capacidades por agente. Commit `docs: fila de pesado e T6`.

## Pendências (depois da revisão)

- A hora de início do processo vem de `/proc/<pid>/stat` no Linux (`vida.mjs`, já da fatia 2); a seção 7 do desenho diz "sem `/proc`". Funciona nos três pelo `ps -o lstart` fora do Linux; trocar o Linux para o `ps` também é decisão a tomar.
- No macOS, cada entrada da fila custa um `ps` (até 2 s de prazo) a cada passagem, sob a trava da fila; com muitas senhas a passagem fica lenta.
- Windows e macOS não executados: os testes de grupo de processos e de shell levam `skip` no Windows; o `taskkill` e o caminho do `cmd` não rodaram. No Windows o órfão de um `kill -9` no `ah` não é morto (sem grupo).
- Não ensaiado com agente real (a T6 pelo gancho só nos testes com eventos gravados).
- O resumo do começo de sessão ainda não mostra quem está no pesado (seção 8).
- `ah board --numeros` (12.5) não existe; o evento `pesado` já grava espera e duração.
- Uma pasta de trava da fila com dono vivo mas preso (processo parado) ainda segura todo mundo até vencer (30 s); quem espera não cai, só espera.

