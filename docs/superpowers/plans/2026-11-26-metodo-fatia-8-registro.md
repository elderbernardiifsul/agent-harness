# Método, fatia 8: opcionais — registro de execução

Execução do plano `2026-11-26-metodo-fatia-8.md` no ramo `p2-opcionais` (worktree `~/projetos/agent-harness-p2-op`), de 26 a 27/11/2026, por uma sessão secundária do Claude Code (Opus 5.5), com execução na própria conversa (`executing-plans`) e um revisor novo (subagente) sobre o ramo inteiro no fim.

## Decisões do orquestrador (26/11)

| # | Decisão |
|---|---|
| D1 | (A): a P5 aceita `ignorados(ctx) → [{caminho, descartavel: true} \| {caminho, guardar}]`; a `ambiente` declara o arquivo de ambiente como descartável. Até a P5 entrar, `ignorados` ficou como export nomeado (o núcleo de então recusava campo desconhecido no `export default`); depois do merge da P5 (b41db9b), passou para o `export default`. `ah ambiente desfazer` continua, e também apaga o banco |
| D2 | O `ah prova` roda o teste e grava só com código 0 e a árvore inalterada |
| D3 | A prova fica na frente e em `<estado>/extensoes/prova/provas.jsonl`, só de acréscimo |
| D4 | `renumerar` faz `git mv` e roda o comando opcional da configuração com `{de}` e `{para}` |

Também aprovadas, decididas pelo executor: comandos externos como listas argv sem shell; o `sweep` só lista; uma coluna no quadro por extensão; a `ambiente` evita as portas da `recursos`.

## Commits

| Commit | Conteúdo |
|---|---|
| 3f616d0 | Plano |
| 59112a4 | Task 1: extensão `prova` |
| 7698d96 | Task 2: `migracao` reservar, liberar, listar |
| 68d6008 | Task 3: `migracao renumerar` |
| ba14ecf | Task 4: extensão `ambiente` |
| ae1a80d | Task 5: `ambiente` no `sweep` |
| 7176649 | Merge da P5 e da extensão `modelo` (p2-registros-modelo até b41db9b), a pedido do orquestrador; conflito de texto em `comandos.md` resolvido mantendo as duas seções |
| 74de4e5 | Consertos da revisão final |
| (este) | Registro |

## Desvios do plano

- `ultimaDaBase` recusa quando o ramo base não existe (o plano só previa 0 sem a pasta): contar 0 daria número repetido.
- `ah ambiente preparar` sai com 1 quando sobra aviso: quem roda vê que algo ficou por fazer.
- Testes a mais: merge parado em conflito e ferramenta que falha (Task 3); `ignorados` (Task 4).
- Os testes de porta conferem propriedades (dentro da faixa, fora das fixas e das em uso, sem porta repetida), não números exatos: na suíte completa, um processo de outra sessão ocupou uma porta da faixa do teste, e a extensão fez certo ao pulá-la.

## Revisão final

Um subagente revisor (Opus), sem o contexto da execução, revisou `3f616d0..ae1a80d`, reproduzindo cada achado em projetos descartáveis. Consertados no commit 74de4e5, cada um com teste que falhou antes:

1. **(crítico)** A `prova` certificava uma árvore sem um arquivo não rastreado de que o teste dependeu: o `git status` ignorava os não rastreados. Agora contam (os do `.gitignore`, não).
2. **(crítico)** O `renumerar` podia dar à frente um número já reservado por outra frente viva. Agora o primeiro número novo é o próximo livre depois da base e das outras reservas, calculado e gravado sob a trava antes dos renomes; a frente acima da base e fora das outras reservas está em dia, mesmo com buraco.
3. A sondagem de porta não via servidor em `::1` (`localhost` em IPv6). Agora sonda os dois; máquina sem IPv6 não conta como porta em uso.
4. O arquivo de ambiente sobrescrevia e apagava um arquivo de outra origem no mesmo caminho (um `.env` do aluno). Agora só mexe no arquivo com o cabeçalho dele.
5. O nome da frente podia gerar um banco fixo (`test` com `loja_{frente}` e o fixo `loja_test`). Agora a frente fica sem banco, com aviso.
6. O arquivo de ambiente fora do `.gitignore` trava o `close` como alteração não commitada, e a saída do `close` sugeriria commitá-lo. A doc manda pôr no `.gitignore`, e a abertura avisa quando não está.
7. A reserva cobria um número só: a frente com duas migrações colidia com a reserva seguinte. Agora o `renumerar` grava o último número da frente, e a doc diz quando rodá-lo.
8. A 15. Reclassificados de menor para importante, porque dão ao aluno saída errada: o comando da configuração com um elemento ia para o shell, ao contrário da doc; o próximo passo `git restore --staged --worktree` sem caminho não funciona; o `sweep` acusava porta reservada pela `recursos`; o `desfazer` dizia "banco apagado" sem banco; arquivo em subpasta inexistente derrubava a reação.

Ficaram, para o orquestrador decidir:

- `renumerar` com migração ainda não adicionada ao git dá recusa genérica ("confira com git status").
- `listar` marca "renumerar" na frente que já entrou na base e ainda não fechou.
- Validação do `padrao`: grupo opcional passa e dá `NaN`; grupo nomeado é recusado.
- A sondagem percorre a faixa inteira em cada abertura e cada `sweep`; uma faixa muito larga deixa o `open` lento.
- `{frente}` vale o nome cru nos argv de `criar` e `apagar`, e com `_` no molde do banco; a doc não diz.
- Exemplos com ferramenta real (`createdb`, `dropdb`, `psql`) na doc e na mensagem de validação, vindos do plano aprovado.
- Windows: `spawnSync` sem shell não roda `.cmd` (`npx`, `npm`) nem scripts sh (`tools/ah`); uma nota na doc bastaria.
- Sem teste de concorrência real das aberturas (o revisor a conferiu à parte, com três `open` em paralelo); a base sem a pasta só é testada com `git` falso.
- `renumerar` longo; separar em funções ajudaria a leitura.
- Fora do escopo do plano (o revisor não julgou): reservas, portas e provas valem só no estado desta máquina; `provas.jsonl` cresce sem limite e grava o comando como veio (um segredo passado como argumento ficaria lá); a `recursos` não respeita as portas da `ambiente`.

## Limitações

- Na retomada em outra máquina, `preparar` não recria um banco já marcado `criado`.
- A sondagem de porta é um instante: um processo que sobe depois dela, antes de a frente usar a porta, ainda pode disputá-la.
- Nenhum ensaio com agente real nesta fatia (a spec pede só testes, seção 17).

## Verificação

`npm test` antes de cada commit; uma falha intermitente em `teste/shell.test.mjs:189` (limite de 2 s de relógio com a carga da máquina em 32) passou sozinha três vezes e não é deste ramo. Saída final do `verifica.mjs` na seção abaixo.

```
$ node ferramentas/verifica.mjs --node "$(mise where node@22)/bin/node" --node "$(command -v node)"   # código 0, 27/11
ok      suíte no Node v22.23.5: 1059 testes, 1058 passaram, 0 falharam, 1 pulados
ok      suíte no Node v26.13.1: 1059 testes, 1058 passaram, 0 falharam, 1 pulados
ok      varredura de termos
Sistema: linux. Windows e macOS não são verificados aqui (o repositório não tem CI).
```
