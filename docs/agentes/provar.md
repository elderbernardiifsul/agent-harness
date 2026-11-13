# Provar que o adaptador funciona

Duas provas, nesta ordem: os testes de contrato (automáticos, rodam na CI) e o ensaio com o agente de verdade (manual, na sua máquina, com as credenciais do agente).

## 1. Testes de contrato

No clone do agent-harness, com o adaptador registrado (`nucleo/adaptadores/registro.mjs`) e os exemplos em `teste/eventos-gravados/<agente>/exemplos.mjs`:

```sh
AH_ADAPTADOR=<agente> node --test teste/contrato-adaptadores.test.mjs
```

Sem `AH_ADAPTADOR`, roda para todos os adaptadores do registro. Se o `/tmp` da máquina é pequeno, aponte `TMPDIR` para outra pasta (o teste ponta a ponta cria um projeto descartável em `TMPDIR`).

O que os testes conferem (`teste/contrato-do-adaptador.mjs`):

| Teste | Confere |
|---|---|
| exporta o que o gancho usa | `AGENTE` igual ao nome no registro; as quatro funções; `EVENTOS_ENTREGUES` só com eventos do contrato; arquivo de gancho em `modelos/<agente>/` |
| começo de sessão | tipo `inicio`, sessão, pasta, agente, origem `novo` (e `continuacao` no exemplo de continuação), modelo texto ou nulo; o resumo sai na saída padrão, com código 0 |
| sinal de vida | tipo `sinal`, sessão, pasta; código 0 |
| antes da ferramenta: comando | tipo `antes`, `acao.tipo` `comando`, o texto exato do comando, `shell` só `posix` ou nada; `acaoLeniente` tira a mesma ação |
| antes da ferramenta: recusa e permissão | permissão com código 0; recusa com saída diferente da permissão, levando a mensagem |
| antes da ferramenta: edição | `acao.tipo` `edicao` com o arquivo certo (só se os exemplos trazem edição) |
| gancho quebrado recusa no antes | `tipoProvavel` reconhece um "antes" num JSON cortado; a resposta da regra de quebra sai como recusa T0 |
| fim de sessão | tipo `fim`, sem `continuacao` no fim que encerra, com `continuacao: true` no exemplo que continua; código 0 |
| entrada que não serve | `traduzirEntrada` lança com o `tipo` provável; o aviso sai com código 0 |
| ponta a ponta pelo `ah gancho <agente>` | num projeto descartável com o harness instalado: o começo registra a sessão com o seu agente e devolve o resumo; `git push origin main` é recusado e a recusa vai para `eventos.jsonl`; `git status` passa; um JSON cortado é recusado com T0; o fim encerra a sessão |

Cada evento fora de `EVENTOS_ENTREGUES` aparece como `não entrega o evento <evento> (degradação declarada)`, que passa: é o que você declarou.

Toda falha diz o que falta, em português:

```
o adaptador <agente> não informa o diretório (campo cwd) no evento antes-da-ferramenta
o adaptador <agente> não leva a mensagem da recusa ao agente (nem na saída nem no erro)
o adaptador <agente> não tem exemplos: crie teste/eventos-gravados/<agente>/exemplos.mjs exportando exemplos(cwd)
```

Depois, a suíte inteira: `node --test teste/`, e a varredura de termos: `node ferramentas/varre-termos.mjs` (código 0).

## 2. Ensaio com o agente de verdade

Os testes usam JSON gravados; o ensaio confere que o agente instalado chama o gancho, que respeita a recusa e que a mensagem chega ao modelo.

### Preparo

Num repositório descartável, fora da sua pasta de projetos, com o estado também fora de `~`:

```sh
tmp=$(mktemp -d)
export AH_ESTADO=$tmp/estado AH_WORKTREES=$tmp/wt
git init -b main $tmp/loja && cd $tmp/loja
echo "loja" > README.md && git add README.md && git commit -m "commit inicial"
git branch dev && git branch stage && git switch dev
node <clone>/nucleo/bin/ah.mjs init --projeto loja --sigla as --sem-protecao --agentes <agente>
# rode o git add e o git commit que o init imprimiu (os caminhos incluem o arquivo de gancho do seu agente)
tools/ah doctor
```

O `doctor` não pode ter falha. Abra o agente neste mesmo terminal (ele herda `AH_ESTADO` e `AH_WORKTREES`). Rode o agente sem as configurações pessoais da máquina (ganchos e plugins do usuário), se ele tiver opção para isso, e num ambiente sem as variáveis de sessão de outro agente (`CLAUDECODE`, `CLAUDE_CODE_SESSION_ID` e afins vazam para agentes filhos). Peça uma ação por vez, mandando o agente chamar a ferramenta com o comando exato, por exemplo: "Chame a ferramenta de shell uma vez com o comando exato: git reset --hard ; depois copie a mensagem de erro ou a saída. Não rode nada antes nem depois." Pedido vago faz o agente responder sem chamar a ferramenta, e aí o gancho nem roda.

### O que conferir

Para cada recusa: (1) o comando **não rodou** (confira com `git status`, `git branch` ou o arquivo); (2) o modelo **citou a mensagem** (`Recusado (Tn): …` e o `Faça:`); (3) `$AH_ESTADO/loja/eventos.jsonl` tem `{"tipo":"recusa", …, "trava":"Tn"}` com a sessão do agente.

| Trava | Peça ao agente | Espere |
|---|---|---|
| T1 | `git switch main` | recusa T1; continua na `dev` |
| T2 | `git add -A` | recusa T2; nada no índice |
| T3 | `git reset --hard` (com um arquivo modificado antes) | recusa T3; a modificação continua lá |
| T4 | Antes, de um terminal: `AH_SESSAO=outra-sessao tools/ah open carrinho` e crie `src/total.js` no worktree dela (`$AH_WORKTREES/carrinho`). Peça ao agente: editar esse arquivo com a ferramenta de edição; depois, `echo x >> <caminho>` | recusa T4 nos dois (na edição, só se o adaptador informa edição); o arquivo intacto |
| T5 | `git push origin main` | recusa T5 |
| T0 | Grave `{` em `.harness/config.json` e peça `git status` | recusa T0 com `Faça: rode tools/ah doctor`; em seguida peça `tools/ah doctor`: passa (é a exceção da regra de quebra). Restaure a configuração (`git checkout -- .harness/config.json`, de um terminal) |

**Começo de sessão:** o modelo recebeu o resumo? Pergunte "o que o harness disse no começo da sessão?"; ele deve citar a linha `Sessão <id curto> (executor)`. Em `eventos.jsonl`, `sessao-inicio` com `agente` igual ao seu e `origem` certa.

**Herança:** peça `tools/ah open frete` (se `idDaSessao` não conhece a variável do seu agente, `AH_SESSAO=<id> tools/ah open frete`). Provoque a continuação do jeito do seu agente (limpar, compactar, retomar). Na sessão nova, peça `tools/ah whoami`: deve mostrar `frente: as-<n> frete`. Em `eventos.jsonl`: `sessao-inicio` com `origem: continuacao` e, se o id mudou, `substituida` e `heranca` com `frentes: ["frete"]`. Se o seu agente manda o fim da velha antes do começo da nova, deve aparecer antes um `sessao-fim` com `aguardandoContinuacao: true`.

**Quadro:** de um terminal fora do agente, com a sessão de pé, `tools/ah board`: a frente `frete` ativa com a dona igual à sessão do agente e `Sessões vivas: <id> (executor, frete)`, sem `sem processo` (se aparecer, o pid gravado não é o do agente; veja `AH_PID_AGENTE` em [contrato.md](contrato.md)). Depois que o agente fecha: com o evento `fim`, a sessão encerrada e a frente órfã; sem ele, a frente fica órfã quando o processo some.

**Doctor:** dentro do agente, `tools/ah doctor`: o item `Adaptador do agente em uso (<agente>)` com `ok` (ou o aviso da degradação que você declarou).

### Registro

Guarde tudo em `docs/referencia/ensaio-<agente>.md` (data, versão do agente, comandos exatos, a resposta do agente, os eventos), como em [ensaio-claude-code.md](../referencia/ensaio-claude-code.md), e atualize [capacidades-por-agente.md](../referencia/capacidades-por-agente.md). Troque os ids e caminhos reais por `<sessão>`, `<tmp>` e afins antes de commitar, e rode `node ferramentas/varre-termos.mjs`.
