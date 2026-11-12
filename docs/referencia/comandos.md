# Comandos do harness

Referência dos comandos da fatia 1. Todos rodam como `tools/ah <comando>` dentro do projeto (o `init` roda a partir do clone do agent-harness). Os exemplos usam o projeto fictício `loja`, a pessoa `ana-souza` (sigla `as`) e os tickets `#1` a `#9`.

Toda recusa tem a mesma forma: o motivo em uma linha e o próximo passo concreto. Recusa de comando de linha de comando sai com código 1 (`Recusado: motivo` / `Faça: …`); recusa de trava, no gancho do agente, sai com código 2 (`Recusado (Tn): motivo` / `Faça: …`).

Variáveis de ambiente que valem para todos: `AH_ESTADO` (pasta do estado local, em vez do padrão da máquina), `AH_WORKTREES` (pasta dos worktrees das frentes), `AH_SESSAO` (id da sessão, quando o agente não o fornece) e `AH_GH` (caminho do `gh`, para ensaio).

## init

```
ah init [--projeto <nome>] [--sigla <sigla>] [--agentes claude-code] [--teste "<comando>"] [--sem-protecao] [--sobrescrever]
```

Instala o harness no projeto atual a partir do clone do agent-harness: copia o núcleo para `.harness/nucleo/` (inclusive o modelo dos ganchos, em `.harness/nucleo/modelos/claude-code/`), grava `.harness/config.json`, cria `tools/ah` e `tools/ah.cmd`, os documentos de `docs/agents/`, os ganchos do agente em `.claude/settings.json` (acrescentando aos que já existem, sem apagar nada) e a CI em `.github/workflows/ah-ci.yml`. Sem `--projeto`, o nome vem da pasta; sem `--sigla`, o `init` propõe uma a partir do login do `gh`.

- `--teste "<comando>"` liga a CI: o comando entra no arquivo entre aspas simples. Só vale quando a configuração ainda não existe; depois, edite `ci.comandoDeTeste` em `.harness/config.json` e rode `ah init` de novo. Sem a opção, a CI nasce desligada.
- Antes de proteger um ramo, o `init` consulta a proteção no servidor e não altera ramo que já está protegido ("já está protegido no servidor; não alterei"). `--sem-protecao` pula essa etapa.
- Repetir o `init` é seguro: o que existe fica como está ("Mantive como estavam"); `--sobrescrever` troca os arquivos do harness pelos do clone.

Recusas e o que fazer:

| Recusa | Faça |
|---|---|
| `Opção desconhecida: <opção>` | use `ah init [--projeto …]` com as opções acima |
| `A opção <opção> precisa de um valor.` | escreva `<opção> <valor>` |
| `Sigla inválida: <sigla>` | use de 2 a 4 letras minúsculas, como `--sigla as` |
| `Não consegui decidir a sigla` | rode `ah init --sigla <sigla>` |
| `Agente não suportado: <nome>` | use `--agentes claude-code` |
| `Este é o próprio clone do agent-harness, não um projeto de destino.` | entre na pasta do projeto e rode o `init` de lá |
| `Este núcleo é a cópia instalada no projeto, não o clone do agent-harness.` | rode `node <clone>/nucleo/bin/ah.mjs init` |
| `.claude/settings.json … não mexi nele` | conserte (ou apague) o arquivo e rode o `init` de novo |
| `Valor inválido para ci.comandoDeTeste` | escreva o comando numa linha só, sem `${{ }}` |

Exemplo:

```
$ node ~/agent-harness/nucleo/bin/ah.mjs init --projeto loja --sigla as --sem-protecao
CI criada desligada: defina ci.comandoDeTeste em .harness/config.json e rode ah init de novo
Criei:
  .harness/nucleo/ (25 arquivos)
  .harness/config.json
  tools/ah
  …
Agora rode: tools/ah doctor
```

Depois do `init`, faça o commit do resultado (`git add` por caminho: `.harness`, `tools`, `docs/agents`, `.claude`, `.github`).

## doctor

```
ah doctor [--json]
```

Confere se o projeto está bem preparado, com 14 itens: Node 22 ou mais novo; git presente; shell POSIX; `.harness/config.json` válido; cópia do núcleo (`MANIFEST.json`); arquivos de estado legíveis; sigla sem choque; `gh` presente e autenticado; ramo base e ramos protegidos; ganchos do Claude Code instalados; gancho responde (o `doctor` ensaia uma recusa de verdade); proteção no servidor (uma linha por ramo protegido); CI com comando de teste; frentes com worktree. Cada item sai como `ok`, `aviso` (algo a melhorar, com o que fazer) ou `FALHOU` (algo que impede o uso). Código 0 se não houver falha; avisos não mudam o código. `--json` imprime `{"itens":[{"item","estado","fazer"}],"falhas","avisos"}`.

```
$ tools/ah doctor
ok      Node 22 ou mais novo
ok      git presente
…
aviso   CI com comando de teste: defina ci.comandoDeTeste em .harness/config.json e rode ah init
ok      Frentes com worktree
0 falha(s), 1 aviso(s).
```

Exemplo de falha: `FALHOU  .harness/config.json válido: não há .harness/config.json; rode ah init`.

## open

```
ah open <nome> [--tickets 1,2] [--plano <arquivo>] [--caminhos <globs>]
```

Abre uma frente de trabalho: cria o ramo `feat/<nome>` a partir do ramo base, um worktree próprio, o registro no estado (ID `as-1`, `as-2`…) e um comentário em cada ticket informado. O nome tem de 2 a 49 caracteres: minúsculas, números e hífen. `--plano` é um arquivo dentro do projeto; `--caminhos` lista os globs que a frente vai tocar.

| Recusa | Faça |
|---|---|
| `Nome de frente inválido: …` | use de 2 a 49 caracteres: minúsculas, números e hífen |
| `Esta máquina ainda não tem sigla.` | rode `ah init --sigla <sigla>` |
| `Esta sessão já tem a frente carrinho.` | continue nela ou encerre com `ah close` antes de abrir outra |
| `Já existe frente com o nome carrinho.` (ou ramo local, ramo remoto) | escolha outro nome |
| `--tickets só aceita números inteiros positivos…` | escreva, por exemplo, `--tickets 1,2` |
| `O plano não existe: …` | confira o caminho ou crie o arquivo antes |

Se o comentário no ticket falhar, a frente abre mesmo assim e o comando avisa para comentar à mão.

```
$ tools/ah open carrinho --tickets 1
Frente as-1 carrinho aberta.
Trabalhe em: <worktrees>/carrinho
```

## nota

```
ah nota "<texto>"
```

Acrescenta uma nota à frente da sessão (aparece na última coluna do `board`).

| Recusa | Faça |
|---|---|
| `A nota está vazia.` | escreva o texto, como `ah nota "mexendo no total"` |
| `Esta sessão não tem frente ativa.` | rode `ah open <nome>` |

```
$ tools/ah nota "mexendo no total"
Nota registrada na frente as-1 carrinho.
```

## board

```
ah board [--json]
```

Mostra as frentes abertas em tabela (ID, nome, dona, estado, tickets, plano, última nota) ou `Nenhuma frente aberta.`. `--json` imprime `{"frentes":[…]}`. Não tem recusa além de opção desconhecida.

```
$ tools/ah board
ID    NOME      DONA      ESTADO  TICKETS  PLANO  ÚLTIMA NOTA
as-1  carrinho  sessao-t  ativa   #1       —      mexendo no total
```

## whoami

```
ah whoami [--json]
```

Diz quem é a sessão, o papel e a frente: `Sessão sessao-t (executor) · frente: as-1 carrinho`. Com `--json`: `{"sessao","papel","frente"}`; `frente` é `null` sem frente.

## close

```
ah close [<nome>] [--resumo "<texto>"]
```

Fecha a frente da sessão sem perder trabalho: confere que o ramo foi mesclado e que não há nada solto no worktree, remove o worktree e o ramo, grava a linha em `docs/agents/historico-das-frentes.md` (com um commit `docs(frentes): fecha …` no ramo base) e comenta nos tickets. Sem `--resumo`, o resumo é o título do último commit do ramo. Rode no checkout principal, no ramo base, depois do merge.

| Recusa | Faça |
|---|---|
| `O ah close não roda de dentro de um worktree de frente.` | rode no checkout principal |
| `Esta sessão não tem frente.` | rode `ah board` para ver as frentes |
| `A frente … é da sessão …, não desta.` | peça à dona que rode `ah close` |
| `O checkout principal não está no ramo base dev.` | rode `git switch dev` no checkout principal |
| `O checkout principal tem alterações em docs/agents/historico-das-frentes.md.` | faça commit ou descarte essas alterações |
| `Fechar a frente … perderia trabalho.` | lista o que se perderia (commits fora do ramo base, arquivos soltos) e o que fazer com cada um |
| `Não consegui conferir …` | resolva o que o git descreve; nada foi apagado |

```
$ tools/ah close --resumo "soma do carrinho"
Frente as-1 carrinho fechada.
Falta: git push origin dev
```

A linha `Falta: git push …` só aparece quando o projeto tem remoto. O `close` nunca empurra.

## gancho

```
ah gancho claude-code
```

Não é para uso manual: é o comando que o `.claude/settings.json` chama em cada evento do agente (início de sessão, pedido do usuário, antes de Bash/PowerShell/Edit/Write/NotebookEdit, fim). Lê o JSON do evento na entrada padrão, registra no `eventos.jsonl` do estado e, antes de um comando, aplica as travas. Código 0 deixa o comando passar; código 2 o recusa, e o agente recebe o texto da recusa.

| Trava | Recusa | Faça |
|---|---|---|
| T2 | `git add -A`, `git add .`, `git add -u` ou `git commit -a` no checkout principal | `git add <caminhos>` só com o que você mudou, ou trabalhe no worktree da frente |
| T5 | `git push` para ramo protegido (ou destino que pode atingi-lo, ou sem destino com o ramo protegido em uso) | abra um PR e peça a ordem do executivo; empurre o ramo da frente |
| T5 | `gh pr merge` cuja base é protegida, ou cuja base o gancho não consegue consultar em 5 segundos | abra o PR e peça a ordem do executivo |
| T0 | comando que menciona git ou gh e não pode ser lido (variável, crase, aspas abertas), entrada do agente que o gancho não entende, `cwd` inexistente, configuração quebrada | escreva o comando por extenso; rode `tools/ah doctor` |

`AH_GUARD=off` no começo do comando libera T2 e T5, mas nunca a T0. Com o harness quebrado, só passam `tools/ah …` (para rodar o `doctor`) e a edição de `.harness/config.json`.

```
$ echo '{"hook_event_name":"PreToolUse","cwd":"<projeto>","tool_name":"Bash","tool_input":{"command":"git add -A"}}' | tools/ah gancho claude-code
Recusado (T2): git add com tudo (-A, ., -u) no checkout principal leva junto o trabalho de outras frentes
Faça: git add <caminhos> com só os arquivos que você mudou (e git commit sem -a), ou trabalhe no worktree da frente
$ echo $?
2
```

## Limites

- As travas leem o **texto** do comando. Comando montado em tempo de execução (variável, `eval`, script que chama o git por dentro, apelido do git) pode escapar; o que o gancho não consegue ler e menciona git ou gh é recusado por T0, mas não há garantia para tudo.
- No Windows nativo as travas de comando não valem (o `doctor` avisa); use o WSL2.
- A barreira de verdade é a **proteção de ramo no servidor** (GitHub). As travas locais evitam o erro antes dele e dão ao agente a saída certa; não substituem a proteção. O `ah init` e o `ah doctor` cuidam de conferir que ela existe.

## Publicar

O trabalho entra no ramo base (`dev`) por merge local e `git push origin dev`. Para publicar em teste e em produção, abra um PR para `stage` e outro para `main`. O merge desses PRs é ato do executivo: o agente não o faz; quando a ordem vier, o executivo (ou o agente, por ordem dele) mescla com `AH_GUARD=off gh pr merge <número>` — a T5 recusa o `gh pr merge` com base protegida, e o prefixo `AH_GUARD=off` é o registro explícito de que a ordem foi dada.
