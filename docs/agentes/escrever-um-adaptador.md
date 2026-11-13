# Escrever um adaptador

Passo a passo, no clone do agent-harness. Antes de começar: Node 22 ou mais novo, e `node --test teste/` passando no clone. Leia [contrato.md](contrato.md) e [exemplo-claude-code.md](exemplo-claude-code.md) primeiro. Use um nome curto, em minúsculas, para o seu agente (`<agente>` abaixo); ele vai no nome do arquivo, no registro e em `tools/ah gancho <agente>`.

## 1. Descobrir os ganchos do seu agente

Tire tudo da **documentação oficial** do agente (a página de ganchos, plugins ou extensões), não de memória nem de exemplos de terceiros; anote a URL e a data. Comece por [capacidades-por-agente.md](../referencia/capacidades-por-agente.md), que já resume Claude Code, Codex e OpenCode com as fontes.

Responda, para o seu agente:

| Pergunta | Por quê |
|---|---|
| Que evento roda **antes** de executar um comando de shell? Ele pode impedir a execução? | É o "antes": sem ele não há trava |
| E antes de editar ou criar um arquivo? Com que nomes de ferramenta, e em que campo vem o caminho? | É a T4 na edição |
| Como o gancho **recusa**, e como a mensagem chega ao modelo? (código de saída, JSON na saída, exceção) | É o `traduzirSaida` da recusa |
| Que evento roda no **começo** da sessão? Diz se é nova ou continuação (limpa, compactada, retomada)? Dá para pôr texto no contexto do modelo? | É o "inicio" e o resumo |
| Há evento por interação (pedido do usuário, fim de resposta)? | É o "sinal" |
| Há evento de **fim** de sessão? Com motivo? No "limpar a conversa", o fim da velha chega antes do começo da nova? | É o "fim" e o `continuacao` |
| Em que campo vêm o **id da sessão** e a **pasta**? Há variável de ambiente com o id nos comandos de shell do agente? | `sessao`, `cwd`, e o `ah` rodado pelo agente |
| Como o gancho é chamado: um comando externo com JSON na entrada padrão, ou código dentro do agente (plugin)? | Decide o arquivo de gancho |
| Onde fica o arquivo de ganchos **do projeto**? Precisa de confiança ou aprovação para carregar? | É o que o `init` instala |
| Há modo sem interface (um pedido na linha de comando)? | É o ensaio |

O que se sabe hoje, **da documentação, não ensaiado** (a fonte e os detalhes estão em `capacidades-por-agente.md`):

- **Codex 0.166.0:** `PreToolUse` com seletor `Bash` (comando em `tool_input.command`) e `apply_patch` (o caminho está dentro do texto do patch, em `tool_input.command`); recusa por código 2 com o motivo na saída de erro, ou `hookSpecificOutput.permissionDecision: "deny"`; `SessionStart` com `source` (`startup`, `resume`, `clear`, `compact`, `fork`) e texto na saída padrão que vira contexto; `UserPromptSubmit`, `Stop` e `SessionEnd` (`reason` sempre `other`); `session_id` e `model` no JSON; arquivo `.codex/hooks.json`, que só carrega com a pasta confiável e cada gancho confiado em `/hooks`. No ensaio de 2026-11-12 os ganchos não dispararam por falta dessa confiança; só as variáveis `CODEX_THREAD_ID` e `CODEX_SESSION_ID` nos comandos de shell foram vistas.
- **OpenCode 2.2.2:** não há gancho por comando externo; é um plugin em `.opencode/plugins/<nome>.js`. `ctx.tool.hook("execute.before")` recebe um objeto (não JSON na entrada padrão) com `tool` (`shell`, `edit`, `write`, `patch`), `sessionID` e `input`; recusa lançando uma exceção (só no guia de migração; confirmado no ensaio). Não há evento de começo nem de fim de sessão com origem; o contexto entra pelo gancho `ctx.session.hook("context")`, que roda antes de cada chamada ao modelo. Nos comandos de shell, `OPENCODE_SESSION_ID` e `OPENCODE=1` (vistos no ensaio, não documentados).

## 2. Mapear para os quatro eventos

Preencha a tabela; ela vira o `EVENTOS` do seu módulo e a linha do seu agente em `capacidades-por-agente.md`.

| Evento do contrato | Evento do seu agente | Campo da sessão | Campo da pasta | Como sai a resposta |
|---|---|---|---|---|
| `inicio` | | | | texto no contexto do modelo |
| `sinal` | | | | nada |
| `antes` (comando) | | | | recusa: ? / permite: ? |
| `antes` (edição) | | | | recusa: ? / permite: ? |
| `fim` | | | | nada |

Para cada linha vazia, veja "Quando falta um evento", no fim deste arquivo.

## 3. Gravar eventos reais

Antes de escrever a tradução, grave o que o agente manda de verdade. Num repositório descartável (`mktemp -d`, `git init`, um commit, sem remoto), ponha um gancho espião que só grava a entrada num arquivo e sai com 0 (para o "antes", grave e recuse `git push`, para ver a recusa chegar ao modelo). Rode o agente no modo sem interface pedindo: um comando de shell, a criação de um arquivo, e `git push origin main`. Se dá, provoque também a continuação (limpar, compactar, retomar).

Guarde cada JSON em `teste/eventos-gravados/<agente>/<evento>.json`, **anonimizado**: id da sessão `00000000-0000-4000-8000-000000000001`, pasta `/tmp/loja`, nenhum nome de pessoa, máquina ou caminho real (`node ferramentas/varre-termos.mjs` confere os termos proibidos).

Depois escreva `teste/eventos-gravados/<agente>/exemplos.mjs`, exportando `exemplos(cwd)`; copie `teste/eventos-gravados/claude-code/exemplos.mjs` e troque os arquivos. O formato está no topo de `teste/contrato-do-adaptador.mjs`: `inicio.novo` (e `inicio.continuacao`, se houver), `sinal`, `antes.recusado` (`git push origin main`), `antes.permitido` (`git status`), `antes.edicao` (se o agente informa), `fim.encerra` (e `fim.continua`, se houver), e `invalidas` (opcional). Exemplo derivado de um gravado (trocar um campo) vale; inventado do zero, não.

## 4. Escrever o módulo

Crie `nucleo/adaptadores/<agente>.mjs` copiando `nucleo/adaptadores/claude-code.mjs` e troque:

- `AGENTE` pelo nome;
- `EVENTOS_ENTREGUES` pelos eventos que o seu agente entrega (só os que existem de verdade);
- as tabelas `EVENTOS`, `ORIGENS`, `FIM_QUE_CONTINUA`, `COMANDOS`, `EDICOES` pelos nomes do seu agente;
- os nomes dos campos (`session_id`, `cwd`, `hook_event_name`, `tool_name`, `tool_input`);
- `traduzirSaida`, para o jeito do seu agente de recusar e de injetar contexto.

Mantenha o que vale para todos: a validação da sessão (`validarNomeSeguro`), a pasta absoluta que existe, o erro com `tipo`, `tipoProvavel` que entende texto cru, `acaoLeniente` que nunca lança, e ferramenta desconhecida como erro (recusa), nunca como `outra`. Se o caminho do arquivo vem dentro de outro texto (como no patch do Codex), extraia todos os caminhos; se não dá para extrair com segurança, trate a ação como erro de entrada (recusa) ou declare que a T4 na edição não vale para o seu agente.

## 5. Escrever o arquivo de gancho

Ponha-o em `modelos/<agente>/` (o teste de contrato confere que a pasta existe). Ele tem uma função: em cada evento, rodar `tools/ah gancho <agente>` **a partir da raiz do projeto** (ou com o caminho absoluto dela), com o JSON do evento na entrada padrão, e devolver ao agente a saída padrão, a saída de erro e o código.

- **Agente com ganchos por comando** (como Claude Code e Codex): o arquivo de configuração chama `tools/ah gancho <agente>`; use a variável que o agente dá com a raiz do projeto, se houver.
- **Agente com plugin** (como o OpenCode): o plugin monta um JSON com os campos do evento, abre `tools/ah gancho <agente>` como processo filho, escreve o JSON na entrada padrão e lê a saída. No "antes", se o código de saída diz recusa, lança a exceção (ou o que o agente usa) com a mensagem. Se o processo filho não pode ser o agente (o pid do plugin é o do servidor), passe `AH_PID_AGENTE` com o pid do processo do agente no ambiente do filho.
- **Tempo:** o "antes" roda a cada ferramenta; não ponha nada lento no caminho. Se o agente tem tempo-limite por gancho, deixe folga (o núcleo pode levar até uns 5 s numa consulta ao `gh`).

## 6. Registrar

1. `nucleo/adaptadores/registro.mjs`: acrescente o módulo em `ADAPTADORES` (`'<agente>': meuAgente`). É daqui que `tools/ah gancho <agente>`, o `doctor` e os testes de contrato o acham.
2. Se o seu agente põe uma variável própria no ambiente dos comandos de shell e ela não está em `INDICADORES` (mesmo arquivo), acrescente-a, antes das do Claude Code (elas vazam para agentes abertos de dentro dele). Com isso o `doctor` sabe qual agente está em uso.
3. `nucleo/lib/sessao.mjs`, `idDaSessao`: para os comandos `tools/ah` rodados pelo agente saberem a sessão sem `AH_SESSAO`, acrescente a variável com o id da sessão do seu agente, antes de `CLAUDE_CODE_SESSION_ID`. Sem isso, o agente precisa rodar `AH_SESSAO=<id> tools/ah …`.
4. `nucleo/comandos/init.mjs`: acrescente o nome em `AGENTES_SUPORTADOS` e copie o arquivo de gancho para o lugar dele no projeto (veja como o init trata `.claude/settings.json`: mescla sem apagar os ganchos de terceiros); acrescente o destino em `CAMINHOS_DO_COMMIT`. Em `.harness/config.json` do projeto, `agentes` lista os adaptadores ligados.

## 7. Rodar os testes de contrato

```sh
AH_ADAPTADOR=<agente> node --test teste/contrato-adaptadores.test.mjs
```

Cada falha diz o que falta, por exemplo `o adaptador <agente> não informa o diretório (campo cwd) no evento antes-da-ferramenta`. Corrija e rode de novo até passar; depois rode a suíte inteira, `node --test teste/`. Detalhes em [provar.md](provar.md).

## 8. Ensaiar com o agente de verdade

Os testes provam a tradução; o ensaio prova que o agente chama o gancho e respeita a recusa. Roteiro e lista do que conferir em [provar.md](provar.md), "Ensaio com o agente de verdade".

## 9. Registrar o ensaio

Crie `docs/referencia/ensaio-<agente>.md` como `ensaio-claude-code.md`: data, versão do agente (`<agente> --version`), preparo, comandos exatos, a resposta do agente, os eventos de `eventos.jsonl` e o que não deu certo. Atualize a coluna do seu agente em `capacidades-por-agente.md`, trocando "não ensaiado" pelo que o ensaio mostrou, e a seção "O que não fica coberto em cada agente".

## Quando falta um evento

Declare em `EVENTOS_ENTREGUES` só o que o agente entrega. O que falta é a **degradação declarada**: os testes de contrato pulam o evento e mostram `não entrega o evento <evento>`, e o `tools/ah doctor` avisa o que deixa de valer (o texto vem de `O_QUE_SE_PERDE`, em `registro.mjs`).

| Sem o evento | O que deixa de valer | O que dá para fazer |
|---|---|---|
| `inicio` | Não há resumo no começo; a sessão não é registrada até o primeiro sinal ou o `ah open`; a herança da frente na continuação não acontece (é o começo que a faz) | Pôr no `AGENTS.md` do projeto a instrução de rodar `AH_SESSAO=<id> tools/ah whoami` no começo. Se o agente tem um gancho que roda antes de cada chamada ao modelo (o `context` do OpenCode), o plugin pode mandar o `inicio` na primeira chamada de cada sessão; não ensaiado |
| `sinal` | O sinal só se renova a cada ferramenta (o "antes" o renova); sessão que conversa sem usar ferramenta por mais de `sessoes.prazoDoSinalMin` (padrão 120 min) parece morta: a frente dela aparece órfã (outra sessão pode tomá-la com `ah takeover`) e a T4 deixa de proteger o worktree dela | Usar como sinal qualquer evento por interação que o agente tenha, mesmo que não recuse nada |
| `antes` | **Nenhuma trava automática** (nenhuma das travas vale): o agente pode trocar o ramo do checkout principal, `git add -A`, descartar trabalho, escrever no worktree de outra sessão e empurrar para ramo protegido | Só sobram a proteção de ramo no servidor (GitHub) e as regras escritas no `AGENTS.md`. Diga isso no ensaio e na tabela de capacidades |
| `antes` só para comando, não para edição | A T4 não vê a edição de arquivo pela ferramenta de edição do agente (só a escrita por comando de shell) | Declarar na tabela de capacidades |
| `fim` | A sessão não se encerra quando o agente fecha; ela morre quando o processo some (ou o sinal vence) e a frente fica órfã, para `ah takeover` ou `ah open` de outra sessão. Sem o fim que é continuação, a herança ainda acontece se o começo seguinte vier do mesmo processo com `origem: 'continuacao'` | Nada a fazer no adaptador; é o comportamento padrão |
| Recusar (o gancho só observa) | É como não ter o `antes` | Mandar o "antes" mesmo assim registra a recusa em `eventos.jsonl` sem impedir nada; não declare `antes` nesse caso |
| Id da sessão no gancho | O adaptador não tem como existir: tudo no núcleo é por sessão | Usar o `ah` sem adaptador, com `AH_SESSAO` |

**Cuidado com um processo que abriga várias sessões.** O núcleo trata as sessões do mesmo processo (mesmo pid e hora de início) como uma conversa só: um começo novo nesse processo encerra as outras sessões dele e solta as frentes delas; um começo de continuação as substitui e herda. Se o seu agente roda várias sessões ao mesmo tempo num processo só (um servidor com plugin, por exemplo), isso derrubaria sessões vivas. Até o núcleo ter um jeito de dizer isso, rode uma sessão por processo do agente e registre a limitação no ensaio.
