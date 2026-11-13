# Núcleo do agent-harness, fatia 5 (atualização do harness instalado): plano

**Objetivo:** trocar a cópia do núcleo de um projeto já preparado (`.harness/nucleo/`) pela de um clone mais novo do agent-harness, sem perder o que o projeto escreveu, e avisar no `doctor` quando a cópia ficou para trás.

**Desenho:** `docs/superpowers/specs/2026-11-12-nucleo-design.md`, seções 4 ("`ah atualizar --de <clone>` troca `.harness/nucleo/` por uma versão mais nova e mostra o que mudou. `config.json` e `extensoes/` nunca são sobrescritos"), 6 (tabela de comandos), 12.1 (fatia 5), 12.4 (toda recusa diz a saída). Este plano cobre só o `atualizar` da fatia 5; extensões, `deps` e `board --numeros` ficam para depois.

**Tecnologia:** Node 22+, ESM, sem dependências, `node:test`.

## Decisões (onde o desenho deixa escolha)

1. **Nome e forma.** `ah atualizar [--de <clone>] [--simular] [--forcar]`, o nome que o desenho dá. Sem `--de`, a origem é o próprio clone quando o comando roda dele (`node <clone>/nucleo/bin/ah.mjs atualizar`, como o `init`); rodado da cópia instalada (`tools/ah atualizar`) sem `--de`, recusa e diz o clone registrado, se houver.
2. **Quem executa.** Com `--de` apontando para outro clone, a cópia instalada não faz a troca: chama `node <clone>/nucleo/bin/ah.mjs atualizar` no mesmo diretório e repassa saída e código. Assim quem decide o que copiar é sempre o código novo.
3. **O que é o núcleo.** O mesmo conjunto que o `init` copia: `nucleo/` (sem teste nem link simbólico), `docs/agentes/` e `docs/referencia/` em `.harness/nucleo/docs/`, e os modelos `agents-trecho.md` e `claude-code/ganchos.json` em `.harness/nucleo/modelos/`. A lista sai de uma função só (`nucleo/lib/copia.mjs`), usada pelo `init`, pelo `atualizar` e pelo `doctor`.
4. **Manifesto com a lista.** `MANIFEST.json` passa a ter `arquivos: {caminho: sha256}` (caminho relativo a `.harness/nucleo/`, sem o próprio manifesto). O `init` grava; o `atualizar` grava. Manifesto antigo (sem a lista) continua válido.
5. **Alterado à mão.** Um arquivo do núcleo cujo conteúdo difere da lista do manifesto, que falta ou que sobra é "alterado à mão": o `atualizar` recusa e lista, com `Faça:` mandando levar a mudança para o clone (ou para `.harness/extensoes/`) ou repetir com `--forcar`. Com manifesto antigo, sem lista, a conferência cai para o git: mudança não commitada em `.harness/nucleo/` recusa do mesmo jeito.
6. **Versão.** Clone com versão menor que a instalada recusa (`--forcar` passa); menor que `harnessMinimo` da configuração recusa sempre. Mesma versão com conteúdo diferente atualiza (o número só muda em lançamento).
7. **Troca atômica.** A cópia nova é montada em `.harness/nucleo.novo-<pid>`; depois `nucleo` vira `nucleo.velho-<pid>`, a nova vira `nucleo` e a velha é apagada. Se a segunda renomeação falha, a velha volta. Sobra de uma troca interrompida: `nucleo.novo-*` é apagada na próxima chamada; `nucleo.velho-*` com `nucleo` presente também; sem `nucleo`, recusa com o `mv` que o devolve.
8. **O que não toca.** `config.json`, `extensoes/`, o estado (frentes, sessões, fila, eventos, exceto a linha do evento), `tools/ah`, `tools/ah.cmd`, `docs/agents/`, `.claude/settings.json` e a CI. Os três primeiros arquivos fora do núcleo que mudam de versão para versão (`tools/ah`, `tools/ah.cmd` e os ganchos do `.claude/settings.json`) são conferidos: se diferem do que o `init` novo gravaria, o `atualizar` lista e manda rodar o `init` do clone.
9. **`AGENTS.md`.** O trecho entre marcas é reaplicado pela mesma função do `init` (`agentsComTrecho`): mesmas garantias (marcas incompletas ou repetidas não reescrevem o que existe; link simbólico não é tocado; fim de linha mantido).
10. **`--simular`.** Faz todas as conferências e diz o que mudaria (novos, alterados, removidos, `AGENTS.md`, versões); não grava nada, nem o evento. Se houver bloqueio, mostra e sai com 1, como a execução faria.
11. **Clone de origem.** O `init` e o `atualizar` gravam `origem.json` (`{clone}`) na pasta de estado do projeto, que é da máquina: caminho de máquina não entra no git do projeto.
12. **Item do `doctor`.** "Núcleo igual ao clone de origem", logo depois de "Cópia do núcleo": sem `origem.json`, sai `ok` com "(sem clone registrado nesta máquina; não conferido)"; clone sumido ou núcleo diferente do clone, `aviso` com `tools/ah atualizar --de <clone>`. A comparação é pelo conteúdo (lista de sha256), não pelo commit, para que mexer só nos testes do clone não acuse nada.
13. **Evento.** `atualizacao` com `sessao`, `de`, `para` (versões), `deCommit`, `paraCommit`, `novos`, `alterados`, `removidos` (contagens) e `forcado`.
14. **Requisitos.** Exige configuração (projeto preparado), não exige sessão (roda no terminal).
15. **Commit.** Como o `init`, não faz commit; termina com os comandos exatos, mensagem `chore: atualiza o agent-harness`.

## Mapa de arquivos

```
nucleo/lib/copia.mjs          (novo) lista do núcleo, sha256, manifesto, versão e reconhecimento de clone
nucleo/comandos/atualizar.mjs (novo)
nucleo/comandos/init.mjs      usa copia.mjs; manifesto com a lista; grava origem.json; passosDoCommit com mensagem
nucleo/comandos/doctor.mjs    + item "Núcleo igual ao clone de origem"
teste/apoio/repo.mjs          + copiarHarness() (clone descartável para os testes)
teste/atualizar.test.mjs      (novo); doctor e init (acréscimos)
docs/referencia/comandos.md, README.md, docs/aula/*
```

## Tarefas

1. **`copia.mjs` e manifesto com lista.** Testes: a lista do clone tem `bin/ah.mjs`, `docs/agentes/README.md` e `modelos/agents-trecho.md` e não tem teste; o `init` grava `arquivos` com o sha256 de cada arquivo e grava `origem.json`. Commit `feat: manifesto do núcleo com a lista dos arquivos`.
2. **`ah atualizar`.** Testes com um clone descartável alterado: troca o núcleo (arquivo novo, alterado e removido), grava manifesto e evento, não toca configuração, extensões nem estado; reaplica o trecho do `AGENTS.md` e mantém o resto; `--simular` não grava; recusa arquivo alterado à mão e passa com `--forcar`; recusa clone mais velho; recusa sem `--de` na cópia instalada; `--de` delega ao clone; nada a fazer sai com 0; sobra de troca interrompida. Commit `feat: ah atualizar`.
3. **`doctor`.** Testes: ok logo depois do `init`; aviso com o clone alterado; aviso com o clone sumido; ok sem origem registrada. Commit `feat: doctor confere o núcleo contra o clone de origem`.
4. **Documentação.** `comandos.md` (seção `atualizar`, item do `doctor`, evento), `README.md`, `docs/aula/` (só as menções à atualização e os números). Commit `docs: ah atualizar`.

## Fica fora

- Extensões (`.harness/extensoes/`, interface e exemplo), `deps` e `board --numeros`, da mesma fatia.
- Atualizar `tools/ah`, `tools/ah.cmd`, `.claude/settings.json`, a CI e `docs/agents/`: o `atualizar` só aponta a diferença; quem troca é o `init`.
- Migrar o esquema de `config.json` de uma versão para outra.
- Ensaio com agente real e em Windows e macOS.
