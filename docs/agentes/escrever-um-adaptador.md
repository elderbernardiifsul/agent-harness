# Escrita de um adaptador

Passo a passo, executado no clone do agent-harness. Requisitos: Node 22 ou mais novo e `node --test teste/` passando no clone. Leitura prévia: [contrato.md](contrato.md) e [exemplo-claude-code.md](exemplo-claude-code.md). O agente recebe um nome curto, em minúsculas (`<agente>` adiante), que aparece no nome do arquivo, no registro e em `tools/ah gancho <agente>`.

## 1. Levantamento dos ganchos do agente

Toda informação deve vir da **documentação oficial** do agente (a página de ganchos, plugins ou extensões), e não da memória nem de exemplos de terceiros; anote a URL e a data da consulta. O ponto de partida é [capacidades-por-agente.md](../referencia/capacidades-por-agente.md), que já resume Claude Code, Codex e OpenCode com as fontes.

Questões a responder para o agente:

| Questão | Motivo |
|---|---|
| Que evento ocorre **antes** da execução de um comando de shell? Ele pode impedir a execução? | Corresponde ao "antes": sem ele não há trava |
| E antes da edição ou criação de um arquivo? Com que nomes de ferramenta, e em que campo vem o caminho? | Corresponde à T4 na edição |
| Como o gancho **recusa**, e como a mensagem chega ao modelo? (código de saída, JSON na saída, exceção) | Corresponde ao `traduzirSaida` da recusa |
| Que evento ocorre no **começo** da sessão? Ele indica se a sessão é nova ou continuação (limpa, compactada, retomada)? É possível inserir texto no contexto do modelo? | Corresponde ao "inicio" e ao resumo |
| Existe evento por interação (pedido do usuário, fim de resposta)? | Corresponde ao "sinal" |
| Existe evento de **fim** de sessão? Com motivo? Ao limpar a conversa, o fim da antiga chega antes do começo da nova? | Corresponde ao "fim" e ao `continuacao` |
| Em que campos vêm o **id da sessão** e a **pasta**? Existe variável de ambiente com o id nos comandos de shell do agente? | `sessao`, `cwd` e o `ah` executado pelo agente |
| Como o gancho é chamado: comando externo com JSON na entrada padrão, ou código dentro do agente (plugin)? | Define o formato do arquivo de gancho |
| Onde fica o arquivo de ganchos **do projeto**? O carregamento exige confiança ou aprovação? | Define o que o `init` instala |
| Existe modo sem interface (um pedido pela linha de comando)? | Viabiliza o ensaio |

Situação conhecida hoje, **pela documentação e sem ensaio** (fontes e detalhes em `capacidades-por-agente.md`):

- **Codex 0.166.0:** `PreToolUse` com seletor `Bash` (comando em `tool_input.command`) e `apply_patch` (o caminho está dentro do texto do patch, em `tool_input.command`); recusa por código 2 com o motivo na saída de erro, ou por `hookSpecificOutput.permissionDecision: "deny"`; `SessionStart` com `source` (`startup`, `resume`, `clear`, `compact`, `fork`) e texto na saída padrão incorporado ao contexto; `UserPromptSubmit`, `Stop` e `SessionEnd` (`reason` sempre `other`); `session_id` e `model` no JSON; arquivo `.codex/hooks.json`, que só é carregado com a pasta marcada como confiável e cada gancho confiado em `/hooks`. No ensaio de 2026-11-12, os ganchos não dispararam por falta dessa confiança; apenas as variáveis `CODEX_THREAD_ID` e `CODEX_SESSION_ID` foram observadas nos comandos de shell.
- **OpenCode 2.2.2:** não há gancho por comando externo; o mecanismo é um plugin em `.opencode/plugins/<nome>.js`. `ctx.tool.hook("execute.before")` recebe um objeto (e não JSON na entrada padrão) com `tool` (`shell`, `edit`, `write`, `patch`), `sessionID` e `input`; a recusa é feita lançando uma exceção (documentada apenas no guia de migração e confirmada no ensaio). Não há evento de começo nem de fim de sessão com origem; o contexto entra pelo gancho `ctx.session.hook("context")`, executado antes de cada chamada ao modelo. Nos comandos de shell aparecem `OPENCODE_SESSION_ID` e `OPENCODE=1` (observados no ensaio, sem documentação).

## 2. Correspondência com os quatro eventos

A tabela abaixo, preenchida, dá origem ao `EVENTOS` do módulo e à linha do agente em `capacidades-por-agente.md`.

| Evento do contrato | Evento do agente | Campo da sessão | Campo da pasta | Formato da resposta |
|---|---|---|---|---|
| `inicio` | | | | texto no contexto do modelo |
| `sinal` | | | | nada |
| `antes` (comando) | | | | recusa: ? / permite: ? |
| `antes` (edição) | | | | recusa: ? / permite: ? |
| `fim` | | | | nada |

Para cada linha sem correspondente, ver "Quando falta um evento", no fim deste arquivo.

## 3. Gravação de eventos reais

Antes de escrever a tradução, grave os eventos que o agente envia de fato. Num repositório descartável (`mktemp -d`, `git init`, um commit, sem remoto), instale um gancho espião que apenas grava a entrada num arquivo e sai com código 0; no "antes", o espião grava e recusa `git push`, para verificar como a recusa chega ao modelo. Execute o agente no modo sem interface com três pedidos: um comando de shell, a criação de um arquivo e `git push origin main`. Se possível, provoque também a continuação (limpar, compactar, retomar).

Cada JSON vai para `teste/eventos-gravados/<agente>/<evento>.json`, **anonimizado**: id da sessão `00000000-0000-4000-8000-000000000001`, pasta `/tmp/loja`, nenhum nome de pessoa, de máquina ou caminho real (`node ferramentas/varre-termos.mjs` confere os termos proibidos).

Em seguida, escreva `teste/eventos-gravados/<agente>/exemplos.mjs`, que exporta `exemplos(cwd)`, a partir de uma cópia de `teste/eventos-gravados/claude-code/exemplos.mjs` com os arquivos trocados. O formato está descrito no topo de `teste/contrato-do-adaptador.mjs`: `inicio.novo` (e `inicio.continuacao`, se houver), `sinal`, `antes.recusado` (`git push origin main`), `antes.permitido` (`git status`), `antes.edicao` (se o agente informa edições), `fim.encerra` (e `fim.continua`, se houver) e `invalidas` (opcional). Um exemplo derivado de um evento gravado (com um campo trocado) é aceito; um exemplo inventado do zero, não.

## 4. Módulo do adaptador

Crie `nucleo/adaptadores/<agente>.mjs` a partir de uma cópia de `nucleo/adaptadores/claude-code.mjs` e substitua:

- `AGENTE` pelo nome do agente;
- `EVENTOS_ENTREGUES` pelos eventos que o agente de fato entrega;
- as tabelas `EVENTOS`, `ORIGENS`, `FIM_QUE_CONTINUA`, `COMANDOS`, `EDICOES` pelos nomes usados pelo agente;
- os nomes dos campos (`session_id`, `cwd`, `hook_event_name`, `tool_name`, `tool_input`);
- `traduzirSaida`, conforme o mecanismo do agente para recusar e para inserir contexto.

Os elementos comuns a todos os agentes permanecem: a validação da sessão (`validarNomeSeguro`), a exigência de pasta absoluta e existente, o erro com `tipo`, o `tipoProvavel` que aceita texto bruto, o `acaoLeniente` que nunca lança exceção, e o tratamento de ferramenta desconhecida como erro (recusa), nunca como `outra`. Se o caminho do arquivo vem dentro de outro texto (como no patch do Codex), todos os caminhos devem ser extraídos; se a extração não for segura, a ação deve ser tratada como erro de entrada (recusa), ou deve-se declarar que a T4 na edição não vale para o agente.

## 5. Arquivo de gancho

O arquivo fica em `modelos/<agente>/` (o teste de contrato confere a existência da pasta). A função dele é, em cada evento, executar `tools/ah gancho <agente>` **a partir da raiz do projeto** (ou com o caminho absoluto dela), com o JSON do evento na entrada padrão, e devolver ao agente a saída padrão, a saída de erro e o código de saída.

- **Agente com ganchos por comando** (Claude Code e Codex): o arquivo de configuração chama `tools/ah gancho <agente>`, usando a variável com a raiz do projeto fornecida pelo agente, se houver.
- **Agente com plugin** (OpenCode): o plugin monta um JSON com os campos do evento, inicia `tools/ah gancho <agente>` como processo filho, escreve o JSON na entrada padrão e lê a saída. No "antes", se o código de saída indica recusa, o plugin lança a exceção (ou o mecanismo equivalente do agente) com a mensagem. Se o processo pai do filho não for o agente (quando o pid do plugin é o do servidor), o plugin passa `AH_PID_AGENTE`, com o pid do processo do agente, no ambiente do filho.
- **Tempo de resposta:** o "antes" é executado a cada ferramenta, e nada lento deve entrar nesse caminho. Se o agente impõe tempo-limite por gancho, convém deixar folga, pois o núcleo pode levar cerca de 5 s numa consulta ao `gh`.

## 6. Registro do adaptador

1. `nucleo/adaptadores/registro.mjs`: acrescente o módulo em `ADAPTADORES` (`'<agente>': meuAgente`). É por esse registro que `tools/ah gancho <agente>`, o `doctor` e os testes de contrato localizam o adaptador.
2. Se o agente define uma variável própria no ambiente dos comandos de shell e ela não consta em `INDICADORES` (mesmo arquivo), acrescente-a antes das variáveis do Claude Code, que vazam para agentes abertos a partir dele. Com isso, o `doctor` identifica o agente em uso.
3. `nucleo/lib/sessao.mjs`, `idDaSessao`: para que os comandos `tools/ah` executados pelo agente identifiquem a sessão sem `AH_SESSAO`, acrescente a variável com o id da sessão do agente antes de `CLAUDE_CODE_SESSION_ID`. Sem essa entrada, o agente precisa executar `AH_SESSAO=<id> tools/ah …`.
4. `nucleo/comandos/init.mjs`: acrescente o nome em `AGENTES_SUPORTADOS` e copie o arquivo de gancho para o local correspondente no projeto (o tratamento de `.claude/settings.json` pelo init serve de modelo: mescla sem apagar os ganchos de terceiros); acrescente o destino em `CAMINHOS_DO_COMMIT`. No `.harness/config.json` do projeto, `agentes` lista os adaptadores ativos.

## 7. Testes de contrato

```sh
AH_ADAPTADOR=<agente> node --test teste/contrato-adaptadores.test.mjs
```

Cada falha indica o que falta, por exemplo `o adaptador <agente> não informa o diretório (campo cwd) no evento antes-da-ferramenta`. O ciclo de correção se repete até os testes passarem; depois, roda-se a suíte inteira, `node --test teste/`. Detalhes em [provar.md](provar.md).

## 8. Ensaio com o agente real

Os testes verificam a tradução; o ensaio verifica que o agente chama o gancho e respeita a recusa. Roteiro e lista de verificação em [provar.md](provar.md), seção "Ensaio com o agente real".

## 9. Registro do ensaio

Crie `docs/referencia/ensaio-<agente>.md` no formato de `ensaio-claude-code.md`: data, versão do agente (`<agente> --version`), preparação, comandos exatos, resposta do agente, eventos de `eventos.jsonl` e o que não funcionou. Atualize a coluna do agente em `capacidades-por-agente.md`, substituindo "não ensaiado" pelo resultado do ensaio, e a seção "O que não fica coberto em cada agente".

## Quando falta um evento

`EVENTOS_ENTREGUES` declara apenas os eventos que o agente entrega. A ausência dos demais é a **degradação declarada**: os testes de contrato pulam o evento e mostram `não entrega o evento <evento>`, e o `tools/ah doctor` avisa o que deixa de valer (o texto vem de `O_QUE_SE_PERDE`, em `registro.mjs`).

| Evento ausente | Consequência | Alternativa |
|---|---|---|
| `inicio` | Não há resumo no começo; a sessão só é registrada no primeiro sinal ou no `ah open`; a herança da frente na continuação não ocorre (é o começo que a realiza) | Incluir no `AGENTS.md` do projeto a instrução de executar `AH_SESSAO=<id> tools/ah whoami` no começo. Se o agente tem um gancho executado antes de cada chamada ao modelo (o `context` do OpenCode), o plugin pode enviar o `inicio` na primeira chamada de cada sessão; sem ensaio |
| `sinal` | O sinal só se renova a cada ferramenta (o "antes" o renova); uma sessão que conversa sem usar ferramenta por mais de `sessoes.prazoDoSinalMin` (padrão de 120 min) parece morta: a frente dela aparece como órfã (outra sessão pode assumi-la com `ah takeover`) e a T4 deixa de proteger o worktree dela | Usar como sinal qualquer evento por interação que o agente ofereça, mesmo sem capacidade de recusa |
| `antes` | **Nenhuma trava automática** vale: o agente pode trocar o ramo do checkout principal, executar `git add -A`, descartar trabalho, escrever no worktree de outra sessão e enviar a ramo protegido | Restam apenas a proteção de ramo no servidor (GitHub) e as regras escritas no `AGENTS.md`. Essa limitação deve constar no ensaio e na tabela de capacidades |
| `antes` só para comando, sem edição | A T4 não detecta a edição de arquivo feita pela ferramenta de edição do agente (apenas a escrita por comando de shell) | Declarar na tabela de capacidades |
| `fim` | A sessão não é encerrada quando o agente fecha; ela morre quando o processo termina (ou o sinal vence), e a frente fica órfã, disponível para `ah takeover` ou `ah open` de outra sessão. Sem o fim seguido de continuação, a herança ainda ocorre se o começo seguinte vier do mesmo processo com `origem: 'continuacao'` | Nenhuma ação no adaptador; é o comportamento padrão |
| Capacidade de recusa (o gancho só observa) | Equivale à ausência do `antes` | Enviar o "antes" assim mesmo registra a recusa em `eventos.jsonl` sem impedir nada; nesse caso, `antes` não deve ser declarado |
| Id da sessão no gancho | O adaptador não é viável, pois todo o núcleo é organizado por sessão | Usar o `ah` sem adaptador, com `AH_SESSAO` |

**Atenção a processos que abrigam várias sessões.** O núcleo trata as sessões do mesmo processo (mesmo pid e hora de início) como uma única conversa: um começo novo nesse processo encerra as outras sessões dele e libera as frentes delas, e um começo de continuação as substitui e herda as frentes. Num agente que executa várias sessões simultâneas num único processo (um servidor com plugin, por exemplo), esse comportamento derrubaria sessões vivas. Enquanto o núcleo não tiver como distinguir esse caso, a recomendação é executar uma sessão por processo do agente e registrar a limitação no ensaio.
