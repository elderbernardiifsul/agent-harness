# Prova do adaptador

A prova tem duas etapas, nesta ordem: os testes de contrato (automáticos, executados no clone) e o ensaio com o agente real (manual, na máquina de quem escreve o adaptador, com as credenciais do agente).

## 1. Testes de contrato

No clone do agent-harness, com o adaptador registrado (`nucleo/adaptadores/registro.mjs`) e os exemplos em `teste/eventos-gravados/<agente>/exemplos.mjs`:

```sh
AH_ADAPTADOR=<agente> node --test teste/contrato-adaptadores.test.mjs
```

Sem `AH_ADAPTADOR`, os testes rodam para todos os adaptadores do registro. Se o `/tmp` da máquina for pequeno, aponte `TMPDIR` para outra pasta, pois o teste ponta a ponta cria um projeto descartável em `TMPDIR`.

**Caixa de areia do agente.** Os testes criam processos (`git`, `node`) e repositórios git descartáveis em `TMPDIR`. Uma caixa de areia que restringe isso impede a suíte de rodar, e o sintoma não diz a causa: cada arquivo aparece como `✖ teste/<arquivo>.test.mjs` com `'test failed'` e nenhum teste dentro dele. Foi o que aconteceu com o Codex 0.172.0 no modo `workspace-write` (`spawnSync` falha com `EPERM` e o `git init` não cria o repositório). Nesse caso, há duas saídas:

- rodar os testes fora da caixa de areia (no Codex, pedir a aprovação do comando, ou abrir o agente com acesso total num clone descartável), que é o caminho para a prova;
- para ler a mensagem de um teste que não depende de processo nem de git, rodar o arquivo direto, sem o `--test`: `AH_ADAPTADOR=<agente> node teste/contrato-adaptadores.test.mjs`. Assim aparece, por exemplo, `o adaptador <agente> não está no registro: acrescente-o em ADAPTADORES, em nucleo/adaptadores/registro.mjs`.

Verificações dos testes (`teste/contrato-do-adaptador.mjs`):

| Teste | Verificação |
|---|---|
| exporta o que o gancho usa | `AGENTE` igual ao nome no registro; as quatro funções; `EVENTOS_ENTREGUES` apenas com eventos do contrato; arquivo de gancho em `modelos/<agente>/` |
| começo de sessão | tipo `inicio`, sessão, pasta, agente, origem `novo` (e `continuacao` no exemplo de continuação), modelo em texto ou nulo; o resumo sai na saída padrão, com código 0 |
| sinal de vida | tipo `sinal`, sessão, pasta; código 0 |
| antes da ferramenta: comando | tipo `antes`, `acao.tipo` `comando`, o texto exato do comando, `shell` apenas `posix` ou ausente; `acaoLeniente` extrai a mesma ação |
| antes da ferramenta: recusa e permissão | permissão com código 0; recusa com saída diferente da permissão, contendo a mensagem |
| antes da ferramenta: edição | `acao.tipo` `edicao` com o arquivo correto (apenas se os exemplos incluem edição) |
| gancho quebrado recusa no antes | `tipoProvavel` reconhece um "antes" num JSON truncado; a resposta da regra de quebra sai como recusa T0 |
| fim de sessão | tipo `fim`, sem `continuacao` no fim que encerra, com `continuacao: true` no exemplo de continuação; código 0 |
| entrada que não serve | `traduzirEntrada` lança erro com o `tipo` provável; o aviso sai com código 0 |
| ponta a ponta pelo `ah gancho <agente>` | num projeto descartável com o harness instalado: o começo registra a sessão com o agente e devolve o resumo; `git push origin main` é recusado e a recusa vai para `eventos.jsonl`; `git status` passa; um JSON truncado é recusado com T0; o fim encerra a sessão |

Cada evento fora de `EVENTOS_ENTREGUES` aparece como `não entrega o evento <evento> (degradação declarada)`, resultado que conta como aprovado, porque corresponde ao que o adaptador declarou.

Cada falha indica, em português, o que falta:

```
o adaptador <agente> não informa o diretório (campo cwd) no evento antes-da-ferramenta
o adaptador <agente> não leva a mensagem da recusa ao agente (nem na saída nem no erro)
o adaptador <agente> não tem exemplos: crie teste/eventos-gravados/<agente>/exemplos.mjs exportando exemplos(cwd)
```

Em seguida, rodam-se a suíte inteira, `npm test`, e a varredura de termos, `node ferramentas/varre-termos.mjs` (código 0).

## 2. Ensaio com o agente real

Os testes usam JSON gravados; o ensaio verifica que o agente instalado chama o gancho, que respeita a recusa e que a mensagem chega ao modelo.

### Preparo

Num repositório descartável, fora da pasta de projetos, com o estado também fora de `~`:

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

O `doctor` não pode apresentar falha. O agente deve ser aberto no mesmo terminal, para herdar `AH_ESTADO` e `AH_WORKTREES`. Se o agente tiver opção para isso, ele deve rodar sem as configurações pessoais da máquina (ganchos e plugins do usuário) e num ambiente sem as variáveis de sessão de outro agente (`CLAUDECODE`, `CLAUDE_CODE_SESSION_ID` e semelhantes vazam para agentes filhos). Os pedidos devem ser feitos um de cada vez, instruindo o agente a chamar a ferramenta com o comando exato, por exemplo: "Chame a ferramenta de shell uma vez com o comando exato: git reset --hard ; depois copie a mensagem de erro ou a saída. Não rode nada antes nem depois." Com um pedido vago, o agente responde sem chamar a ferramenta, e o gancho não chega a ser executado.

### Itens a conferir

Para cada recusa: (1) o comando **não foi executado** (conferir com `git status`, `git branch` ou o arquivo); (2) o modelo **citou a mensagem** (`Recusado (Tn): …` e o `Faça:`); (3) `$AH_ESTADO/loja/eventos.jsonl` contém `{"tipo":"recusa", …, "trava":"Tn"}` com a sessão do agente.

Devem ser conferidas pelo menos as travas abaixo, além das demais que a versão do harness tiver (cabeçalho de `nucleo/lib/travas.mjs`):

| Trava | Pedido ao agente | Resultado esperado |
|---|---|---|
| T1 | `git switch main` | recusa T1; o checkout permanece na `dev` |
| T2 | `git add -A` | recusa T2; nada no índice |
| T3 | `git reset --hard` (com um arquivo modificado antes) | recusa T3; a modificação permanece |
| T4 | Antes, num terminal: `AH_SESSAO=outra-sessao tools/ah open carrinho` e criação de `src/total.js` no worktree dessa sessão (`$AH_WORKTREES/carrinho`). Ao agente: editar esse arquivo com a ferramenta de edição; depois, `echo x >> <caminho>` | recusa T4 nos dois casos (na edição, apenas se o adaptador informa edições); o arquivo intacto |
| T5 | `git push origin main` | recusa T5 |
| T0 | Gravar `{` em `.harness/config.json` e pedir `git status` | recusa T0 com `Faça: rode tools/ah doctor`; em seguida, pedir `tools/ah doctor`, que passa (exceção da regra de quebra). Restaurar a configuração (`git checkout -- .harness/config.json`, num terminal) |

**Começo de sessão:** o modelo recebeu o resumo? Diante da pergunta "o que o harness disse no começo da sessão?", ele deve citar a linha `Sessão <id curto> (executor)`. Em `eventos.jsonl`, deve constar `sessao-inicio` com `agente` igual ao do adaptador e `origem` correta.

**Herança:** peça `tools/ah open frete` (se `idDaSessao` não reconhece a variável do agente, `AH_SESSAO=<id> tools/ah open frete`). Provoque a continuação pelo mecanismo do agente (limpar, compactar, retomar). Na sessão nova, `tools/ah whoami` deve mostrar `frente: as-<n> frete`. Em `eventos.jsonl`, devem constar `sessao-inicio` com `origem: continuacao` e, se o id mudou, `substituida` e `heranca` com `frentes: ["frete"]`. Se o agente envia o fim da sessão antiga antes do começo da nova, deve aparecer antes um `sessao-fim` com `aguardandoContinuacao: true`.

**Quadro:** num terminal fora do agente, com a sessão ativa, `tools/ah board` deve mostrar a frente `frete` ativa, com a dona igual à sessão do agente, e `Sessões vivas: <id> (executor, frete)`, sem `sem processo` (essa marca indica que o pid gravado não é o do agente; ver `AH_PID_AGENTE` em [contrato.md](contrato.md)). Depois que o agente fecha: com o evento `fim`, a sessão aparece encerrada e a frente órfã; sem ele, a frente fica órfã quando o processo termina.

**Doctor:** dentro do agente, `tools/ah doctor` deve mostrar o item `Adaptador do agente em uso (<agente>)` com `ok` (ou o aviso da degradação declarada).

### Registro

Todo o material vai para `docs/referencia/ensaio-<agente>.md` (data, versão do agente, comandos exatos, resposta do agente, eventos), no formato de [ensaio-claude-code.md](../referencia/ensaio-claude-code.md), e [capacidades-por-agente.md](../referencia/capacidades-por-agente.md) deve ser atualizado. Antes do commit, ids e caminhos reais devem ser trocados por `<sessão>`, `<tmp>` e semelhantes, e `node ferramentas/varre-termos.mjs` deve ser executado.
