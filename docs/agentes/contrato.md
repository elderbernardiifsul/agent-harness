# O contrato dos quatro eventos

O núcleo (`nucleo/adaptadores/contrato.mjs`, função `tratar`) recebe um evento num formato neutro e devolve uma resposta. O adaptador nunca decide nada: traduz o JSON do agente para o evento e a resposta para o que o agente entende.

## O caminho de um evento

1. O agente dispara um gancho, que roda `tools/ah gancho <agente>` com o JSON do evento na entrada padrão (até 16 MB).
2. `nucleo/comandos/gancho.mjs` acha o adaptador pelo nome no registro (`nucleo/adaptadores/registro.mjs`), faz `JSON.parse` e chama `traduzirEntrada(json)`.
3. Com o evento traduzido, acha o projeto a partir de `evento.cwd` (depois a pasta do processo, `CLAUDE_PROJECT_DIR` e o lugar onde o núcleo está instalado). Se nenhum é um projeto com `.harness/`, o evento não é com o harness: sai com código 0, sem nada.
4. Carrega `.harness/config.json`, chama `tratar(evento)` e passa a resposta por `traduzirSaida(evento, resposta)`, que devolve `{saida, erro, codigo}`: o texto da saída padrão, o da saída de erro e o código de saída do processo.

## Os quatro eventos

Todo evento traz `tipo`, `sessao` (o id da sessão do agente) e `cwd` (a pasta onde o agente está; absoluta e existente).

| Evento | Entra | O núcleo faz | Sai |
|---|---|---|---|
| Começo de sessão | `{tipo: 'inicio', sessao, agente, cwd, origem: 'novo' \| 'continuacao', modelo?}` | Registra a sessão com o pid e a hora de início do processo do agente; se é continuação do mesmo processo, a sessão nova substitui a anterior e herda a frente dela; monta o resumo (até 1200 caracteres) | `{contexto}`: o resumo, que o agente deve pôr no contexto do modelo |
| Sinal de vida | `{tipo: 'sinal', sessao, agente?, cwd}` | Atualiza a data do sinal; se a sessão não existe e veio `agente`, registra-a | `{}` |
| Antes de ferramenta | `{tipo: 'antes', sessao, cwd, acao}` | Renova o sinal e aplica as travas à ação; recusa vai para `eventos.jsonl` | `{decisao: 'permite'}` ou `{decisao: 'recusa', mensagem}` |
| Fim de sessão | `{tipo: 'fim', sessao, cwd, motivo?, continuacao?}` | Marca a sessão como encerrada; com `continuacao: true`, não encerra (ver abaixo) | `{}` |

`agente` é o nome do adaptador (`AGENTE`), o mesmo que vai em `tools/ah gancho <agente>`. `modelo` é o nome do modelo, quando o agente informa; senão `null`. `origem` é `continuacao` quando a conversa continua outra (limpa, compactada, retomada, bifurcada) e `novo` no resto, inclusive quando o agente não diz. `motivo` é texto livre do agente, só para o registro.

### A ação do "antes"

| `acao` | Quando | O que as travas olham |
|---|---|---|
| `{tipo: 'comando', comando, shell?: 'posix'}` | O agente vai rodar um comando de shell | O texto do comando. Com `shell: 'posix'`, o interpretador do harness entende encadeamento, subshell, `bash -c`, heredoc e `cd`; só marque `posix` se o agente roda o comando num shell POSIX (sh, bash, zsh) |
| `{tipo: 'edicao', arquivo, ferramenta?}` | O agente vai criar, mudar ou apagar um arquivo | O caminho (absoluto ou relativo a `cwd`); a T4 recusa a escrita no worktree de outra sessão viva. `ferramenta` é o nome da ferramenta do agente, só para o registro |
| `{tipo: 'outra'}` | Qualquer outra ferramenta que você decidiu deixar passar | Nada: sempre permite |

Ferramenta que o adaptador não reconhece deve virar erro de entrada (ver "Quando o gancho quebra"), não `outra`: na dúvida, recusa. Use `outra` só para ferramentas que você sabe que não executam comando nem escrevem arquivo; melhor ainda, não as mande para o gancho (o seletor do arquivo de gancho escolhe quais ferramentas passam por ele).

## A recusa

A mensagem de recusa tem sempre duas linhas: o motivo e o próximo passo.

```
Recusado (T5): push para o ramo protegido main
Faça: abra um PR para main e peça a ordem do executivo; para publicar o seu trabalho, empurre o ramo da frente (git push origin <ramo>)
```

Exemplos de travas (a lista completa é a do cabeçalho de `nucleo/lib/travas.mjs` e da referência de comandos, e pode crescer): T0 (texto que não dá para ler com segurança e que menciona `git` ou `gh`, ou o harness quebrado), T1 (trocar o ramo do checkout principal), T2 (`git add -A`, `git add .`, `commit -a` no checkout principal), T3 (descartar trabalho: `reset --hard`, `clean -f`, `checkout .`, `stash`, `rebase`), T4 (escrever no worktree de outra sessão viva), T5 (empurrar para ramo protegido, mesclar PR pela linha de comando). O prefixo `AH_GUARD=off` no próprio comando libera uma trava (menos a T0), só com ordem do executivo, e fica registrado.

O adaptador tem de fazer o agente **não executar** a ferramenta e **levar a mensagem ao modelo**, para ele saber o que fazer no lugar. Como, depende do agente: código de saída, JSON na saída padrão, exceção num plugin. Os testes de contrato conferem que a saída da recusa é diferente da saída da permissão e que a mensagem aparece nela.

## A sessão e o processo

**Sessão:** o id vem do agente (`sessao`). Tem de servir de nome de arquivo: sem `/`, sem `\`, sem `..`, sem caractere de controle. O adaptador recusa o id que não serve (erro de entrada), nunca o conserta.

**Processo:** a vida de uma sessão é a do processo do agente mais o sinal de vida (sessão sem sinal por mais de `sessoes.prazoDoSinalMin`, padrão 120 minutos, conta como morta). O núcleo grava o pid do agente e a hora de início desse processo (Linux: `/proc/<pid>/stat`; macOS: `ps -o lstart`; Windows: não lê), para notar um pid reaproveitado. O pid é:

1. o de `AH_PID_AGENTE`, se o ambiente do gancho a tiver;
2. senão, o processo pai do `node` que roda o gancho.

O `tools/ah` termina em `exec node …`, então o pai do `node` é quem chamou `tools/ah`. Se o agente roda o gancho direto (ou por `sh -c`, que também faz `exec` no último comando), o pai é o próprio agente, que é o que se quer. Se entre o agente e o `tools/ah` há um processo que não faz `exec` e morre logo (um script intermediário, um plugin que abre um shell), o pid gravado morre antes da sessão; o núcleo nota isso no sinal seguinte, descarta o pid, e a vida passa a depender só do sinal. Para evitar, ponha `AH_PID_AGENTE=<pid do agente>` no ambiente do gancho.

## Continuação e o fim que é continuação

Uma sessão nova **herda** a frente da anterior só quando as duas são do **mesmo processo** (mesmo pid e mesma hora de início, conhecida nos dois lados) e o começo traz `origem: 'continuacao'`. Sem a hora de início (Windows, `ps` que falhou), não há herança. Começo `novo` no mesmo processo encerra a anterior e solta a frente dela.

Alguns agentes avisam o fim da conversa velha **antes** do começo da nova, no mesmo processo (o `/clear` do Claude Code). Se o fim encerrasse a sessão, a herança não teria de quem herdar. Por isso o fim traz `continuacao: true` nesses casos: o núcleo não encerra a sessão, só a marca `aguardandoContinuacao`, e o começo seguinte do mesmo processo a substitui. Se o começo não vier, a sessão segue sem fim, com a vida do processo e do sinal. Marque `continuacao: true` só quando o motivo do fim diz, sem dúvida, que uma sessão nova vem logo no mesmo processo.

## Quando o gancho quebra

Se o harness não consegue avaliar (entrada que não é JSON, evento ou ferramenta desconhecidos, campo de tipo errado, sessão inválida, configuração ausente ou inválida, erro interno), vale a regra de quebra (`respostaNaQuebra`):

- **No "antes":** recusa com T0, `Recusado (T0): o harness não conseguiu avaliar (<motivo>).` e `Faça: rode tools/ah doctor`. Passam só duas coisas, para o conserto ser possível: um comando que é uma única chamada a `tools/ah` (com `shell: 'posix'`) e a edição de `.harness/config.json`.
- **Nos outros eventos:** a resposta é `{aviso}`, uma linha que o adaptador leva ao agente sem bloquear nada (código 0, no caso do Claude Code).

Para isso funcionar mesmo quando a tradução falha no meio, o adaptador exporta duas funções que nunca lançam: `tipoProvavel(entrada)`, que diz o tipo do evento pelo JSON ou pelo texto cru (um JSON cortado tem de dar `'antes'` se era um "antes"), e `acaoLeniente(json)`, que tira a ação quando dá, ou `null`. O erro de entrada que `traduzirEntrada` lança leva `tipo` (o tipo provável), para o gancho escolher a regra.

## O módulo do adaptador

O que `nucleo/adaptadores/<agente>.mjs` exporta (o gancho e os testes de contrato usam exatamente isto):

| Exporta | O quê |
|---|---|
| `AGENTE` | O nome, igual à chave no registro e ao argumento de `tools/ah gancho` |
| `EVENTOS_ENTREGUES` | Lista dos eventos do contrato que o agente entrega (`'inicio'`, `'sinal'`, `'antes'`, `'fim'`) |
| `traduzirEntrada(json)` | Objeto JSON do agente -> evento do contrato. Entrada que não serve: lança um erro com `tipo` (`'inicio'`, `'sinal'`, `'antes'`, `'fim'` ou `'desconhecido'`). Não-objeto: `null` |
| `traduzirSaida(evento, resposta)` | -> `{saida, erro, codigo}`. Também recebe `{aviso}` (gancho quebrado fora do "antes") e um evento só com `{tipo, acao}` (quando a tradução falhou) |
| `tipoProvavel(entrada)` | Objeto ou texto -> tipo provável; nunca lança |
| `acaoLeniente(json)` | -> a ação, ou `null`; nunca lança |
