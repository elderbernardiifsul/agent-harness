# O contrato dos quatro eventos

O núcleo (`nucleo/adaptadores/contrato.mjs`, função `tratar`) recebe um evento num formato neutro e devolve uma resposta. O adaptador não toma decisões: traduz o JSON do agente para o evento e a resposta para o formato que o agente reconhece.

## Percurso de um evento

1. O agente dispara um gancho, que executa `tools/ah gancho <agente>` com o JSON do evento na entrada padrão (até 16 MB).
2. `nucleo/comandos/gancho.mjs` localiza o adaptador pelo nome no registro (`nucleo/adaptadores/registro.mjs`), faz `JSON.parse` e chama `traduzirEntrada(json)`.
3. Com o evento traduzido, o gancho procura o projeto a partir de `evento.cwd` e, em seguida, da pasta do processo, de `CLAUDE_PROJECT_DIR` e do local de instalação do núcleo. Se nenhum desses caminhos pertence a um projeto com `.harness/`, o evento não diz respeito ao harness, e o gancho termina com código 0, sem saída.
4. O gancho carrega `.harness/config.json`, chama `tratar(evento)` e passa a resposta por `traduzirSaida(evento, resposta)`, que devolve `{saida, erro, codigo}`: o texto da saída padrão, o da saída de erro e o código de saída do processo.

## Os quatro eventos

Todo evento traz `tipo`, `sessao` (o id da sessão do agente) e `cwd` (a pasta de trabalho do agente, absoluta e existente).

| Evento | Entrada | Tratamento no núcleo | Saída |
|---|---|---|---|
| Começo de sessão | `{tipo: 'inicio', sessao, agente, cwd, origem: 'novo' \| 'continuacao', modelo?}` | Registra a sessão com o pid e a hora de início do processo do agente; na continuação do mesmo processo, a sessão nova substitui a anterior e herda a frente dela; monta o resumo (até 1200 caracteres) | `{contexto}`: o resumo, que o agente deve inserir no contexto do modelo |
| Sinal de vida | `{tipo: 'sinal', sessao, agente?, cwd}` | Atualiza a data do sinal; se a sessão não existe e o evento traz `agente`, registra a sessão | `{}` |
| Antes de ferramenta | `{tipo: 'antes', sessao, cwd, acao}` | Renova o sinal e aplica as travas à ação; cada recusa é gravada em `eventos.jsonl` | `{decisao: 'permite'}` ou `{decisao: 'recusa', mensagem}` |
| Fim de sessão | `{tipo: 'fim', sessao, cwd, motivo?, continuacao?}` | Marca a sessão como encerrada; com `continuacao: true`, não a encerra (ver adiante) | `{}` |

`agente` é o nome do adaptador (`AGENTE`), o mesmo usado em `tools/ah gancho <agente>`. `modelo` é o nome do modelo, quando o agente o informa; caso contrário, `null`. `origem` vale `continuacao` quando a conversa continua outra (limpa, compactada, retomada ou bifurcada) e `novo` nos demais casos, inclusive quando o agente não informa a origem. `motivo` é texto livre do agente, usado apenas no registro.

### A ação do "antes"

| `acao` | Situação | Objeto de análise das travas |
|---|---|---|
| `{tipo: 'comando', comando, shell?: 'posix'}` | O agente vai executar um comando de shell | O texto do comando. Com `shell: 'posix'`, o interpretador do harness reconhece encadeamento, subshell, `bash -c`, heredoc e `cd`; marque `posix` somente se o agente executa o comando num shell POSIX (sh, bash, zsh) |
| `{tipo: 'edicao', arquivo, ferramenta?}` | O agente vai criar, alterar ou apagar um arquivo | O caminho (absoluto ou relativo a `cwd`); a T4 recusa a escrita no worktree de outra sessão viva. `ferramenta` é o nome da ferramenta do agente, usado apenas no registro |
| `{tipo: 'outra'}` | Qualquer outra ferramenta que o adaptador decide deixar passar | Nenhum: a ação é sempre permitida |

Ferramenta que o adaptador não reconhece deve resultar em erro de entrada (ver "Quando o gancho quebra"), e não em `outra`; na dúvida, a regra é recusar. `outra` serve apenas para ferramentas que comprovadamente não executam comando nem escrevem arquivo. A opção preferível é não enviar essas ferramentas ao gancho, já que o seletor do arquivo de gancho define quais ferramentas passam por ele.

## A recusa

A mensagem de recusa tem sempre duas linhas: o motivo e o próximo passo.

```
Recusado (T5): push para o ramo protegido main
Faça: abra um PR para main e peça a ordem do executivo; para publicar o seu trabalho, empurre o ramo da frente (git push origin <ramo>)
```

Exemplos de travas (a lista completa está no cabeçalho de `nucleo/lib/travas.mjs` e na referência de comandos, e pode crescer): T0 (texto que menciona `git` ou `gh` e não pode ser lido com segurança, ou harness com defeito), T1 (troca do ramo do checkout principal), T2 (`git add -A`, `git add .`, `commit -a` no checkout principal), T3 (descarte de trabalho: `reset --hard`, `clean -f`, `checkout .`, `stash`, `rebase`), T4 (escrita no worktree de outra sessão viva), T5 (push para ramo protegido, merge de PR pela linha de comando). O prefixo `AH_GUARD=off` no próprio comando libera uma trava (exceto a T0), somente com ordem do executivo, e a liberação fica registrada.

O adaptador deve garantir duas coisas: que o agente **não execute** a ferramenta e que a **mensagem chegue ao modelo**, para que ele saiba qual caminho seguir. O mecanismo depende do agente (código de saída, JSON na saída padrão, exceção num plugin). Os testes de contrato conferem que a saída da recusa difere da saída da permissão e que contém a mensagem.

## A sessão e o processo

**Sessão:** o id vem do agente (`sessao`) e precisa ser válido como nome de arquivo, sem `/`, `\`, `..` nem caractere de controle. O adaptador recusa o id inválido como erro de entrada e não tenta corrigi-lo.

**Processo:** a vida de uma sessão depende do processo do agente e do sinal de vida; uma sessão sem sinal por mais de `sessoes.prazoDoSinalMin` (padrão de 120 minutos) é considerada morta. O núcleo grava o pid do agente e a hora de início desse processo (Linux: `/proc/<pid>/stat`; macOS: `ps -o lstart`; Windows: sem leitura), para detectar um pid reaproveitado. O pid gravado é:

1. o de `AH_PID_AGENTE`, se essa variável estiver no ambiente do gancho;
2. caso contrário, o do processo pai do `node` que executa o gancho.

O `tools/ah` termina em `exec node …`, de modo que o pai do `node` é o processo que chamou `tools/ah`. Se o agente executa o gancho diretamente (ou por `sh -c`, que também faz `exec` no último comando), o pai é o próprio agente, que é o resultado desejado. Se entre o agente e o `tools/ah` existe um processo que não faz `exec` e termina logo (um script intermediário, um plugin que abre um shell), o pid gravado deixa de existir antes da sessão. O núcleo detecta essa situação no sinal seguinte e descarta o pid, e a vida da sessão passa a depender apenas do sinal. Para evitar esse caso, defina `AH_PID_AGENTE=<pid do agente>` no ambiente do gancho.

## Continuação e fim seguido de continuação

Uma sessão nova **herda** a frente da anterior somente quando as duas pertencem ao **mesmo processo** (mesmo pid e mesma hora de início, conhecida dos dois lados) e o começo traz `origem: 'continuacao'`. Sem a hora de início (Windows, ou falha do `ps`), não há herança. Um começo `novo` no mesmo processo encerra a sessão anterior e libera a frente dela.

Alguns agentes avisam o fim da conversa antiga **antes** do começo da nova, no mesmo processo (caso do `/clear` do Claude Code). Se esse fim encerrasse a sessão, a sessão nova não teria de quem herdar. Por isso, nesses casos, o fim traz `continuacao: true`, e o núcleo, em vez de encerrar a sessão, marca-a como `aguardandoContinuacao`; o começo seguinte no mesmo processo a substitui. Se o começo não chegar, a sessão continua sem fim registrado, com a vida determinada pelo processo e pelo sinal. Marque `continuacao: true` somente quando o motivo do fim indica, sem ambiguidade, que uma sessão nova virá em seguida no mesmo processo.

## Quando o gancho quebra

Quando o harness não consegue avaliar o evento (entrada que não é JSON, evento ou ferramenta desconhecidos, campo de tipo errado, sessão inválida, configuração ausente ou inválida, erro interno), aplica-se a regra de quebra (`respostaNaQuebra`):

- **No "antes":** recusa com T0, `Recusado (T0): o harness não conseguiu avaliar (<motivo>).` e `Faça: rode tools/ah doctor`. Para que o conserto seja possível, passam apenas duas ações: um comando que consiste numa única chamada a `tools/ah` (com `shell: 'posix'`) e a edição de `.harness/config.json`.
- **Nos outros eventos:** a resposta é `{aviso}`, uma linha que o adaptador repassa ao agente sem bloquear nada (código 0, no caso do Claude Code).

Para que a regra funcione mesmo quando a tradução falha no meio, o adaptador exporta duas funções que nunca lançam exceção: `tipoProvavel(entrada)`, que determina o tipo do evento pelo JSON ou pelo texto bruto (um JSON truncado de um "antes" deve resultar em `'antes'`), e `acaoLeniente(json)`, que extrai a ação quando possível e devolve `null` caso contrário. O erro de entrada lançado por `traduzirEntrada` traz `tipo` (o tipo provável), para que o gancho escolha a regra.

## O módulo do adaptador

Exportações de `nucleo/adaptadores/<agente>.mjs` (o gancho e os testes de contrato usam exatamente estas):

| Exportação | Descrição |
|---|---|
| `AGENTE` | O nome, igual à chave no registro e ao argumento de `tools/ah gancho` |
| `EVENTOS_ENTREGUES` | Lista dos eventos do contrato que o agente entrega (`'inicio'`, `'sinal'`, `'antes'`, `'fim'`) |
| `traduzirEntrada(json)` | Objeto JSON do agente -> evento do contrato. Para entrada inválida, lança um erro com `tipo` (`'inicio'`, `'sinal'`, `'antes'`, `'fim'` ou `'desconhecido'`). Para entrada que não é objeto, devolve `null` |
| `traduzirSaida(evento, resposta)` | -> `{saida, erro, codigo}`. Também recebe `{aviso}` (gancho com falha fora do "antes") e um evento só com `{tipo, acao}` (quando a tradução falhou) |
| `tipoProvavel(entrada)` | Objeto ou texto -> tipo provável; nunca lança exceção |
| `acaoLeniente(json)` | -> a ação, ou `null`; nunca lança exceção |
