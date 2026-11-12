# Núcleo do agent-harness, fatia 2 (várias sessões): plano de implementação

> **Para quem executa (agente):** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendada) ou superpowers:executing-plans para implementar este plano tarefa a tarefa. Os passos usam caixas (`- [ ]`) para acompanhamento.

**Objetivo:** várias sessões e várias pessoas no mesmo repositório sem uma atrapalhar a outra: sessão viva, herança na continuação, `papel`, reserva de ticket, sobreposição de arquivos, `handoff`, retomar pelo `open` (mesma máquina e outra), `open --para`, `takeover`, `sweep`, fila de comentários pendentes e as travas T1, T3 e T4.

**Arquitetura:** o mesmo desenho da fatia 1. Lógica nova em módulos pequenos de `nucleo/lib/` (`vida`, `heranca`, `pendentes`, `reserva`, `sobreposicao`, `varredura`); um módulo por comando novo em `nucleo/comandos/`; as travas continuam puras, com o que depende de disco e de processo injetado pelo `ctx` que o contrato monta. A dona de uma frente é `frente.dona`; `sessao.frente` é só a frente em foco.

**Tecnologia:** Node 22+, módulos ES, sem dependências, `node:test`, `git`, `gh`.

**Desenho:** `docs/superpowers/specs/2026-11-12-nucleo-design.md` (ler inteiro; a seção 12 prevalece; esta fatia é a linha 2 da tabela 12.1; ler com atenção as seções 6, 7, 8, 11 e o item do "pronto quando" sobre duas sessões simuladas). Plano anterior e decisões já tomadas: `2026-11-12-nucleo-fatias-0-e-1.md` e `2026-11-12-nucleo-fatias-0-e-1-pendencias.md`.

## Restrições globais

- Node 22 ou mais novo; nenhuma dependência em `package.json`; só módulos ES (`.mjs`).
- Textos, mensagens, nomes de arquivo e de função em português; nomes de comando em inglês (`handoff`, `takeover`, `sweep`, `papel` é exceção do desenho).
- Nenhum nome real do projeto de origem em arquivo, teste, exemplo ou mensagem de commit. Exemplos: projeto `loja`, repositório `exemplo/loja`, pessoas `ana-souza` (sigla `as`) e `carla-dias` (sigla `cd`), tickets `#1` a `#9`, sessões `sessao-teste-0001`, `sessao-b-0002`, `sessao-c-0003`.
- Nada de `git push` para fora, criação de repositório remoto ou publicação. Trabalho local no ramo `dev` de `~/projetos/agent-harness`.
- Toda recusa de comando sai pelo `ErroDeUso` (`Recusado: <motivo>\nFaça: <saída>`, código 1); toda recusa de trava sai por `recusa()` de `nucleo/lib/recusa.mjs` (`Recusado (Tn): <motivo>\nFaça: <saída>`, código 2 no gancho). Recusa sem próximo passo é defeito (12.4).
- Testes passam em Linux, macOS e Windows: `node:path` e `node:os`, nunca `/tmp` fixo; `git` e `gh` por `execFile`/`spawnSync` sem shell. Teste que depende de `sh`, de `/proc`, do `ps` ou de link simbólico leva `{ skip: ... }` com a plataforma.
- Estado de teste sempre por `AH_ESTADO`; worktrees por `AH_WORKTREES`; pid do agente por `AH_PID_AGENTE`; nenhum teste toca o estado real.
- Toda tarefa termina com `node --test teste/` passando, `node ferramentas/varre-termos.mjs` com código 0 (não abrir nem copiar a lista que ele lê) e um commit com `git add` por caminho e este rodapé:

```
Co-Authored-By: Claude <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013wMsv3NVgzi8WVzXaxyeRx
```

- Auxiliares de teste citados e não descritos nas interfaces são funções curtas de `teste/apoio/repo.mjs`, criadas pela tarefa que primeiro as usa (as da fatia 1 continuam: `ler`, `gravar`, `escreverConfig`, `lerFrenteDoTeste`, `dirDoTeste`, `amb`, `gravado`, `ganchoPre`, `comFrente`, `eventos`).

## Foco da revisão

1. **pid do gancho que não é o do agente.** Se o processo pai do gancho for um shell de vida curta, a sessão parece morta logo depois de registrada, o T4 deixa de protegê-la e o `takeover` passa. Também: um `ah` rodado na mão não pode gravar o próprio pid. Testes nas tarefas 1 e 2.
2. **Caminho do worktree alheio escrito de outro jeito:** por link simbólico, com `..`, pela pasta real do macOS (`/private/var` × `/var`) ou com outra caixa no Windows. O T4 precisa recusar do mesmo jeito. Testes nas tarefas 11 (`normalizarCaminho`, `dentroDe`) e 13 (a trava).
3. **Arquivo de frente corrompido:** não pode fazer o gancho recusar toda ferramenta do agente (ele não conseguiria nem apagar o arquivo). O T4 pula o ilegível e registra; `board` e `sweep` acusam sem quebrar. Testes nas tarefas 11 e 13.
4. **Duas aberturas quase juntas com o mesmo ticket:** só uma fica com a reserva; a outra desfaz o que fez e não cria worktree. Teste na tarefa 5.
5. **Sessão antiga retomada depois de um `takeover`** (`--resume` de uma conversa de ontem): não recupera a frente, o resumo diz quem a tem, e o T4 protege a nova dona. Teste na tarefa 10.

## Levantamento do original (só comportamento)

Lido no projeto de origem, sem alterar nada. Onde diverge do desenho, vale o desenho (coluna "Aqui").

| Ponto | No original | Aqui |
|---|---|---|
| Sessão viva | pid mais hora de início lidos de `/proc`; sem pid, sinal de vida com prazo de 2 h. O pid vinha de uma variável exportada por um lançador próprio | processo existe **e** sinal não venceu (6, "Sessão viva"); hora de início onde é barato; pid do agente pelo processo pai do gancho (decisão 3) |
| Herança | no `SessionStart` de `clear`, `compact` e `resume`, herda todas as frentes ativas de sessões com o mesmo pid e a mesma hora de início, e o papel | igual, só com a hora de início conferida nos dois lados; sem vínculo, a frente fica passada e o resumo manda `ah open` (11, "Continuação") |
| Reserva | responsável, rótulo e comentário com marcador JSON; relê o ticket antes e depois de cada escrita; recusa se há responsável, rótulo ou marcador de outro; sem rede, recusa | igual na regra; marcador em `chave=valor` legível; corrida resolvida pelo marcador mais antigo (decisão 6) |
| Passagem de bastão | exige worktree limpo e no ramo da frente, sem operação em andamento; empurra o ramo mesmo sem commit novo; comentário com nota, estado deixado (ramo, últimos 3 commits, plano) e o comando para retomar; reserva continua (não fica livre); frente "passada", sem dona; o worktree fica | igual |
| Tomada | só frente ativa; passada manda para `open`; dona viva recusa; executor com frente recusa; worktree sumido recusa; comenta no ticket e registra | igual, com `--confirmado` (decisão 8) |
| `sweep` | lista worktree sem frente, ramo só no disco, principal fora da base ou sujo, frente órfã, worktree sumido, comentários pendentes; `--reparar` apaga sessão morta há 7 dias, marca worktree sumido, reconstrói frente passada sem dona para worktree órfão com ramo `<prefixo><pasta>`, reenvia pendentes; nunca apaga worktree nem ramo | igual, sem os recursos de banco e porta (projeto 2) |
| Fila de comentários | falha passageira fica na fila em ordem; erro permanente (ticket inexistente) é estacionado; reenvio em todo comando | igual, também para a edição de responsável e rótulo |
| T1 | `switch` para outro ramo, `checkout` que troca de ramo (ref local, do remoto ou etiqueta, que não é arquivo), `-b`, `--detach`, `-`, `gh pr checkout` | igual |
| T3 | `reset --hard/--keep/--merge`, `clean -f`, `checkout`/`restore` em massa, `checkout -f`, `stash` (fora `list`, `show`), `rebase` | igual; `rebase --abort` passa |
| T4 | subcomando de escrita do git cujo topo é worktree de outra sessão viva; `worktree remove/move` de worktree alheio; edição de arquivo dentro dele | igual, mais `branch -d/-D/-m/-f` do ramo alheio, os comandos comuns que escrevem arquivo e os redirecionamentos (pendência da fatia 1) |
| Papel | `papel executor` recusa com mais de uma frente | igual |

## Decisões desta fatia (o que o desenho deixou com quem constrói)

1. **Sinal de vida em arquivo próprio:** `sessoes/<id>.sinal`, cuja data de modificação é o sinal. Os ganchos tocam só esse arquivo; o JSON da sessão deixa de ser regravado a cada interação (fim da corrida em que um `Stop` desfazia o `frente` gravado pelo `open`).
2. **Prazo:** `sessoes.prazoDoSinalMin` na configuração, padrão `120`, inteiro de 1 a 10080. O sinal é tocado no começo de sessão, a cada pedido, a cada fim de resposta, **antes de cada ferramenta** e por todo comando `ah` da sessão.
3. **Processo vivo nos três sistemas:** `process.kill(pid, 0)` (vale no Windows); `EPERM` conta como vivo. Hora de início: Linux pelo campo 22 de `/proc/<pid>/stat` (leitura de arquivo, barata); macOS por `ps -o lstart= -p <pid>` (prazo de 2 s); Windows não confere (`null`). pid do agente: `AH_PID_AGENTE` se houver, senão o processo pai do gancho. Se o pid gravado morre enquanto os ganchos da sessão continuam chegando, ele é descartado (`pid: null`) e a vida passa a depender só do sinal. Comandos `ah` não gravam pid, salvo com `AH_PID_AGENTE`.
4. **Esquema 2 do estado, com migração na leitura:** sessão e frente ganham `esquema: 2`; o esquema 1 gravado pela fatia 1 é lido e convertido em memória e regravado como 2 na próxima escrita; esquema maior que 2 recusa com "atualize o harness".
5. **`/clear` é continuação** (revê a decisão 4 da execução da fatia 1, porque a seção 11 do desenho diz "conversa limpa, compactada ou retomada").
6. **Marcador nos comentários:** última linha do comentário, `<!-- ah:<tipo> id=<id> nome=<nome> ramo=<ramo> estado=<ativa|passada|livre> login=<login> sessao=<id curto> tickets=1,2 plano=<caminho> abertaPor=<login> abertaEm=<iso> v=1 -->`. Campos vazios são omitidos; valores passam por `encodeURIComponent` com `/` e `:` mantidos. Tipos: `frente` (abertura e reserva), `retomada`, `tomada`, `passagem`, `fechamento`, `desistencia`. O marcador sem `v` da fatia 1 vale como `frente` ativa. O **último** marcador de uma frente diz o estado dela no ticket. Na corrida, vence a frente cujo marcador ativo é o mais antigo; quem perde comenta `desistencia` e se tira de responsável.
7. **Rótulo de reserva:** o da configuração (`github.rotuloDeReserva`, padrão `em-andamento`), criado com `gh label create <rótulo> --force` antes da primeira reserva de cada `open`.
8. **`takeover` pede `--confirmado`.** Sem a opção, mostra dona, motivo da morte e idade do sinal, e recusa com "peça ao executivo que confirme e rode `ah takeover <nome> --confirmado`".
9. **Retomar de outra máquina:** a passagem é procurada nos tickets abertos com o rótulo de reserva (`gh issue list --label`), ou nos `--tickets` dados. Frente sem ticket só se retoma na mesma máquina.
10. **`sweep --reparar`** dá ID novo à frente que reconstrói (o original se perdeu com o estado) e marca `reconstruida: true`.
11. **`tratar` passa a ser assíncrono**, porque a herança grava sob `comTrava`.
12. **Recusa de comando também vai para os eventos** (`recusa-de-comando`, com o comando e o motivo), além das recusas das travas.

---

## Mapa de arquivos

```
nucleo/lib/
  vida.mjs            (novo) processo existe, hora de início, pid do agente, estado da sessão
  heranca.mjs         (novo) continuação de sessão: substituídas, herança, frentes soltas
  pendentes.mjs       (novo) fila de comentários e edições de ticket
  reserva.mjs         (novo) marcador, leitura do ticket, reserva, marcação, liberação, passagem
  sobreposicao.mjs    (novo) globs, arquivos por frente, sobreposições
  varredura.mjs       (novo) achados e reparos do sweep
  caminhos.mjs        + normalizarCaminho, dentroDe
  config.mjs          + sessoes.prazoDoSinalMin
  sessao.mjs          esquema 2, sinal em arquivo, listar, apagar, resolver id curto
  frente.mjs          esquema 2, listarFrentesTolerante, frentesDa
  github.mjs          + editarTicket, criarRotulo
  shell.mjs           + escritas (destinos de redirecionamento)
  travas.mjs          + T1, T3, T4
  resumo.mjs          + situacao (sem dona, sobreposição, avisos)
nucleo/comandos/
  papel.mjs handoff.mjs takeover.mjs sweep.mjs   (novos)
  open.mjs close.mjs board.mjs whoami.mjs gancho.mjs doctor.mjs
nucleo/adaptadores/   contrato.mjs (assíncrono, vida, herança, ctx das travas), claude-code.mjs (clear)
nucleo/bin/ah.mjs     recusa de comando nos eventos
modelos/              config.json, sessoes-paralelas.md
teste/apoio/          repo.mjs (+ ghTicket, ghSemear, outraMaquina, envelhecerSinal), gh-falso.mjs (com estado), processo.mjs (novo)
teste/                vida, heranca, papel, pendentes, reserva, sobreposicao, handoff, retomar, takeover, sweep, ciclo-duas-sessoes (novos) e os existentes
docs/referencia/      comandos.md, ensaio-claude-code.md, capacidades-por-agente.md
```

---

### Tarefa 1: Sessão viva e esquema 2 do estado

**Arquivos:**
- Criar: `nucleo/lib/vida.mjs`, `teste/vida.test.mjs`, `teste/apoio/processo.mjs`
- Modificar: `nucleo/lib/sessao.mjs`, `nucleo/lib/frente.mjs`, `nucleo/lib/config.mjs`, `modelos/config.json`, `nucleo/comandos/whoami.mjs`, `nucleo/comandos/open.mjs` (só a chamada de `registrarSessao`), `teste/sessao.test.mjs`, `teste/config.test.mjs`, `teste/frente.test.mjs`, `teste/whoami.test.mjs`

**Interfaces:**
- Produz, em `vida.mjs`:
  - `processoExiste(pid) -> boolean`: `false` para pid que não é inteiro positivo.
  - `inicioDoProcesso(pid, plataforma = process.platform) -> string|null`: decisão 3; qualquer erro devolve `null`.
  - `pidDoAgente(env, ppid) -> number|null`: `env.AH_PID_AGENTE` (inteiro positivo), senão `ppid`.
  - `pidDeComando(env) -> number|null`: `env.AH_PID_AGENTE` ou `null`.
  - `prazoMs(config) -> number`: `config.sessoes.prazoDoSinalMin * 60000`.
  - `estadoDaSessao(sessao, {idadeDoSinalMs, prazoMs, existe = processoExiste, inicio = inicioDoProcesso}) -> {estado: 'viva'|'morta'|'encerrada'|'desconhecida', motivo: string}`. Ordem: sem registro → `desconhecida`; `fim` → `encerrada`; sinal ausente ou mais velho que o prazo → `morta` ("sinal vencido"); `pid` e processo inexistente → `morta` ("processo não existe"); `pid`, `pidInicio` e hora atual não nula e diferente → `morta` ("pid reaproveitado"); senão `viva`.
  - `vidaDaSessao(dirEstado, id, {config, agora = Date.now(), existe, inicio}) -> {estado, motivo, idadeDoSinalMs}`.
- Produz, em `sessao.mjs`:
  - Forma esquema 2: `{esquema: 2, id, agente, papel, frente, modelo, pid, pidInicio, inicio, fim, motivoFim}` (sem o campo `sinal`).
  - `migrarSessao(obj) -> Sessao`: esquema 1 ganha `pidInicio: null`, `motivoFim: null` e perde `sinal`; esquema > 2 lança `ErroDeEstado` com a saída "atualize o harness (ah init --sobrescrever a partir do clone novo)". `lerSessao` passa por ela.
  - `registrarSessao(dirEstado, {id, agente, pid = null, pidInicio = null, modelo = null}) -> Sessao`: `pid` nulo mantém `pid` e `pidInicio` gravados; sempre zera `fim` e `motivoFim`; toca o sinal.
  - `tocarSinal(dirEstado, id) -> Sessao|null`: cria ou atualiza a data de `sessoes/<id>.sinal`; não regrava o JSON.
  - `idadeDoSinalMs(dirEstado, id, agora = Date.now()) -> number|null`: pela data do arquivo; sem arquivo, pelo campo `sinal` de uma sessão esquema 1; senão `null`.
  - `encerrarSessao(dirEstado, id, motivo = null)`: grava `fim` e `motivoFim`.
  - `listarSessoes(dirEstado) -> {sessoes: Sessao[], ilegiveis: string[]}` e `apagarSessao(dirEstado, id)` (JSON e `.sinal`).
- Produz, em `frente.mjs`:
  - Forma esquema 2: a da fatia 1 mais `reserva: {logins: string[], tickets: number[]} | null` e os campos opcionais `passadaEm`, `passadaPor`, `retomadaEm`, `tomadaEm`, `tomadaDe`, `atribuidaPor`, `reconstruida`. `estado` é `'ativa'` ou `'passada'`. `novaFrente` grava esquema 2 com `reserva: null`.
  - `migrarFrente(obj) -> Frente` (1 → 2 com `reserva: null`; > 2 lança como na sessão); `lerFrente` e `listarFrentes` passam por ela.
  - `listarFrentesTolerante(dirEstado) -> {frentes: Frente[], ilegiveis: string[]}`.
  - `frentesDa(frentes, sessaoId) -> Frente[]`: ativas com `dona === sessaoId`.
- Produz, em `config.mjs`: seção `sessoes: { prazoDoSinalMin: 120 }` em `PADROES`, no esquema (inteiro de 1 a 10080) e em `modelos/config.json`. `versaoDoEsquema` continua 1 (campo novo e opcional).
- Produz, em `teste/apoio/processo.mjs`: `processoVivo() -> {pid, matar(): Promise<void>}` (filho `process.execPath -e "setInterval(()=>{}, 1e6)"`; `matar` espera o `exit`).

- [ ] **Passo 1:** Escrever os testes.

```js
// teste/vida.test.mjs
test('processoExiste: o próprio processo sim; um encerrado não; pid inválido não', async () => {
  assert.equal(processoExiste(process.pid), true);
  const p = processoVivo(); const pid = p.pid; await p.matar();
  assert.equal(processoExiste(pid), false);
  for (const x of [0, -1, 1.5, null, 'abc']) assert.equal(processoExiste(x), false);
});
test('inicioDoProcesso no Linux é estável', { skip: process.platform !== 'linux' }, () => {
  const a = inicioDoProcesso(process.pid); assert.match(a, /^\d+$/); assert.equal(inicioDoProcesso(process.pid), a);
});
test('inicioDoProcesso no macOS vem do ps', { skip: process.platform !== 'darwin' }, () => assert.ok(inicioDoProcesso(process.pid)));
test('inicioDoProcesso no Windows é nulo', () => assert.equal(inicioDoProcesso(process.pid, 'win32'), null));
const s = { id: 's1', pid: 10, pidInicio: 'x', fim: null };
const vida = (sessao, o = {}) => estadoDaSessao(sessao, { idadeDoSinalMs: 1000, prazoMs: 60000, existe: () => true, inicio: () => 'x', ...o }).estado;
test('estadoDaSessao', () => {
  assert.equal(vida(s), 'viva');
  assert.equal(vida(null), 'desconhecida');
  assert.equal(vida({ ...s, fim: '2026-11-13T10:00:00Z' }), 'encerrada');
  assert.equal(vida(s, { idadeDoSinalMs: 60001 }), 'morta');
  assert.equal(vida(s, { idadeDoSinalMs: null }), 'morta');
  assert.equal(vida(s, { existe: () => false }), 'morta');
  assert.equal(vida(s, { inicio: () => 'y' }), 'morta');
  assert.equal(vida(s, { inicio: () => null }), 'viva');
  assert.equal(vida({ ...s, pid: null, pidInicio: null }), 'viva');
});
// teste/sessao.test.mjs (substitui 'registrarSessao cria a sessão com a forma esperada' e 'tocarSinal atualiza o sinal ...')
test('registrarSessao grava o esquema 2 e o sinal em arquivo à parte', t => {
  const r = registrarSessao(dir, { id: 's1', agente: 'claude-code', pid: 7, pidInicio: 'x' });
  assert.deepEqual(Object.keys(r).sort(), ['agente', 'esquema', 'fim', 'frente', 'id', 'inicio', 'modelo', 'motivoFim', 'papel', 'pid', 'pidInicio']);
  assert.equal(r.esquema, 2); assert.ok(fs.existsSync(path.join(dir, 'sessoes', 's1.sinal')));
});
test('tocarSinal não regrava o JSON da sessão', () => {
  registrarSessao(dir, { id: 's1', agente: 'x' }); gravarSessao(dir, { ...lerSessao(dir, 's1'), frente: 'carrinho' });
  const antes = fs.readFileSync(path.join(dir, 'sessoes', 's1.json'), 'utf8');
  tocarSinal(dir, 's1');
  assert.equal(fs.readFileSync(path.join(dir, 'sessoes', 's1.json'), 'utf8'), antes);
  assert.ok(idadeDoSinalMs(dir, 's1') < 5000);
});
test('registrarSessao sem pid mantém o pid gravado pelo gancho e reabre a sessão encerrada', () => {
  registrarSessao(dir, { id: 's1', agente: 'x', pid: 7, pidInicio: 'x' }); encerrarSessao(dir, 's1', 'fim');
  const r = registrarSessao(dir, { id: 's1', agente: 'x' });
  assert.deepEqual([r.pid, r.pidInicio, r.fim, r.motivoFim], [7, 'x', null, null]);
});
test('sessão do esquema 1 é lida como 2, com a idade do sinal pelo campo antigo', () => {
  gravarJson(path.join(dir, 'sessoes', 'v1.json'), { esquema: 1, id: 'v1', agente: 'x', papel: 'executor', frente: null, modelo: null, pid: 3, inicio: '2026-11-12T10:00:00Z', sinal: '2026-11-12T10:00:00Z', fim: null });
  assert.equal(lerSessao(dir, 'v1').esquema, 2);
  assert.ok(idadeDoSinalMs(dir, 'v1', Date.parse('2026-11-12T10:01:00Z')) === 60000);
});
test('esquema desconhecido recusa pedindo para atualizar', () => {
  gravarJson(path.join(dir, 'sessoes', 'v9.json'), { esquema: 9, id: 'v9' });
  assert.throws(() => lerSessao(dir, 'v9'), e => e.name === 'ErroDeEstado' && /atualize o harness/.test(e.saida));
});
// teste/frente.test.mjs
test('frente do esquema 1 ganha reserva nula ao ser lida; frentesDa filtra ativas da dona', () => { /* gravarJson esquema 1; lerFrente(...).reserva === null, .esquema === 2; frentesDa([ativa de s1, passada de s1, ativa de s2], 's1').length === 1 */ });
// teste/config.test.mjs
test('sessoes.prazoDoSinalMin: padrão 120, inteiro de 1 a 10080', () => {
  assert.equal(aplicarPadroes({ projeto: 'loja' }).sessoes.prazoDoSinalMin, 120);
  for (const v of [0, 10081, 1.5, '60']) assert.deepEqual(validarConfig({ projeto: 'loja', sessoes: { prazoDoSinalMin: v } }).erros.map(e => e.campo), ['sessoes.prazoDoSinalMin']);
});
// teste/whoami.test.mjs  (foco 1)
test('ah whoami não grava o pid do próprio processo; com AH_PID_AGENTE grava', () => {
  const p = criarProjeto(); p.ah(['whoami']);
  assert.equal(lerSessao(dirDoTeste(p), 'sessao-teste-0001').pid, null);
  p.ah(['whoami'], { env: { AH_PID_AGENTE: String(process.pid) } });
  assert.equal(lerSessao(dirDoTeste(p), 'sessao-teste-0001').pid, process.pid);
});
```

- [ ] **Passo 2:** Rodar `node --test teste/` e ver falhar.
- [ ] **Passo 3:** Implementar. `whoami` e `open` passam `pid: pidDeComando(amb.env)` e `pidInicio` correspondente; todo comando que lê a sessão da chamada (`whoami`, `open`, `nota`, `close`) também chama `tocarSinal`. Leitura do `ps` por `execFileSync` com `timeout: 2000`.
- [ ] **Passo 4:** Rodar `node --test teste/`. Esperado: passam.
- [ ] **Passo 5:** `node ferramentas/varre-termos.mjs` (código 0) e commit: `feat: sessão viva e esquema 2 do estado`.

### Tarefa 2: Herança na continuação e sinal nos ganchos

**Arquivos:**
- Criar: `nucleo/lib/heranca.mjs`, `teste/heranca.test.mjs`
- Modificar: `nucleo/adaptadores/contrato.mjs`, `nucleo/adaptadores/claude-code.mjs`, `nucleo/comandos/gancho.mjs`, `nucleo/lib/resumo.mjs`, `teste/contrato.test.mjs` (as chamadas a `tratar` passam a usar `await`), `teste/claude-code.test.mjs`, `teste/apoio/repo.mjs`

**Interfaces:**
- Consome: tarefa 1.
- Produz:
  - `tratar(evento, amb) -> Promise<Resposta>`. `amb` aceita, além do que já tinha: `pid` (padrão `pidDoAgente(env, process.ppid)`), `inicioDoProcesso` e `existe` (padrões de `vida.mjs`), `agora`.
  - `continuarSessao(dirEstado, {sessao, pid, pidInicio, origem}) -> Promise<{substituidas: string[], herdadas: string[], soltas: string[]}>` em `heranca.mjs`, sob `comTrava(dirEstado, 'frentes', …)`:
    1. Substituídas: as outras sessões sem `fim` com o mesmo `pid` (e mesma `pidInicio` quando as duas são conhecidas) ganham `fim` e `motivoFim: 'substituida'`; evento `substituida` com `de` e `por`.
    2. Se `origem === 'continuacao'` e a hora de início é conhecida e igual nos dois lados: as frentes ativas das substituídas passam a ter `dona = sessao`; a nova sessão herda `papel` e `frente`; a velha fica com `frente: null`; evento `heranca` com `de`, `sessao`, `frentes`.
    3. Senão, as frentes ativas das substituídas viram `estado: 'passada'`, `dona: null`, `passadaPor: 'continuacao-sem-vinculo'`; evento `frente-solta`.
  - `descartarPidMorto(dirEstado, id, existe = processoExiste) -> boolean` em `vida.mjs`: se a sessão tem `pid` e ele não existe, grava `pid: null, pidInicio: null` e o evento `pid-instavel`.
  - Contrato:
    - `inicio`: registra com `pid` e `pidInicio`; chama `continuarSessao`; se `sessao.frente` aponta para frente cuja dona é outra, limpa e acrescenta o aviso "Sua frente <id> <nome> está com a sessão <curto>."; monta o resumo com `situacao`.
    - `sinal` e `antes`: `tocarSinal` e `descartarPidMorto`.
    - `antes` passa `cwd: evento.cwd` também na ação de edição.
  - `montarResumo({sessao, frentes, config, baseLimpa, situacao = {}})`: `situacao = {semDona: Array<{id, nome, saida}>, sobreposicoes: Array<{arquivo, frentes: string[]}>, avisos: string[]}`. Linhas novas, antes de "Outras frentes": `Avisos: …` e `Sem dona: as-2 frete (ah open frete); as-3 busca (ah takeover busca)` (frente passada → `ah open`; ativa com dona não viva → `ah takeover`). Continua com no máximo 1200 caracteres; as linhas novas são cortadas em 200 caracteres cada antes de cortar a lista das outras frentes.
  - `claude-code.mjs`: `ORIGENS.clear = 'continuacao'`.
  - `teste/apoio/repo.mjs`: `envelhecerSinal(p, sessao, minutos)` (muda a data de `sessoes/<sessao>.sinal`).

- [ ] **Passo 1:** Escrever os testes. `proc = processoVivo()` nasce no começo do arquivo e morre no `after`; `dir = dirDoTeste(p)`; `inicio(id, origem)` monta `{tipo: 'inicio', sessao: id, agente: 'claude-code', cwd: p.raiz, origem}`; `frenteDe(dona)` é a frente `carrinho` (`as-1`) ativa daquela dona.

```js
test('compact na mesma sessão mantém a frente', async () => {
  await tratar(inicio('s-a', 'novo'), { ...amb(p), pid: proc.pid });
  gravarFrente(dir, frenteDe('s-a')); gravarSessao(dir, { ...lerSessao(dir, 's-a'), frente: 'carrinho' });
  const r = await tratar(inicio('s-a', 'continuacao'), { ...amb(p), pid: proc.pid });
  assert.match(r.contexto, /Sua frente: as-1 carrinho/); assert.equal(lerFrente(dir, 'carrinho').dona, 's-a');
});
test('/clear no mesmo processo herda a frente e o papel', async () => {
  await tratar(inicio('s-a', 'novo'), { ...amb(p), pid: proc.pid });
  gravarFrente(dir, frenteDe('s-a')); gravarSessao(dir, { ...lerSessao(dir, 's-a'), frente: 'carrinho', papel: 'orquestrador' });
  const r = await tratar(inicio('s-b', 'continuacao'), { ...amb(p), pid: proc.pid });
  assert.equal(lerFrente(dir, 'carrinho').dona, 's-b');
  assert.deepEqual([lerSessao(dir, 's-b').papel, lerSessao(dir, 's-b').frente], ['orquestrador', 'carrinho']);
  assert.equal(lerSessao(dir, 's-a').motivoFim, 'substituida');
  assert.match(r.contexto, /Sua frente: as-1 carrinho/);
  assert.deepEqual(lerEventos(dir).filter(e => e.tipo === 'heranca').at(-1).frentes, ['carrinho']);
});
test('continuação sem hora de início conhecida não herda: a frente fica passada e o resumo manda ah open', async () => {
  const a = { ...amb(p), pid: proc.pid, inicioDoProcesso: () => null };
  await tratar(inicio('s-a', 'novo'), a); gravarFrente(dir, frenteDe('s-a'));
  const r = await tratar(inicio('s-b', 'continuacao'), a);
  assert.deepEqual([lerFrente(dir, 'carrinho').estado, lerFrente(dir, 'carrinho').dona], ['passada', null]);
  assert.match(r.contexto, /Sem dona: as-1 carrinho \(ah open carrinho\)/);
});
test('começo em outro processo não mexe na frente de outra sessão viva', async () => { /* s-a com proc1, s-b com proc2; dona continua s-a; s-a sem fim */ });
test('frente ativa de dona morta aparece no resumo com ah takeover', async () => { /* frente de 's-x' sem registro; resumo casa /ah takeover carrinho/ */ });
test('sinal e antes tocam o sinal de vida', async () => {
  await tratar(inicio('s1', 'novo'), amb(p)); envelhecerSinal(p, 's1', 30);
  await tratar({ tipo: 'antes', sessao: 's1', cwd: p.raiz, acao: { tipo: 'comando', comando: 'git status' } }, amb(p));
  assert.ok(idadeDoSinalMs(dir, 's1') < 5000);
});
test('pid gravado que morreu enquanto os ganchos chegam é descartado; a sessão segue viva pelo sinal', async () => {   // foco 1
  const q = processoVivo(); await tratar(inicio('s1', 'novo'), { ...amb(p), pid: q.pid }); await q.matar();
  await tratar({ tipo: 'sinal', sessao: 's1' }, amb(p));
  assert.equal(lerSessao(dir, 's1').pid, null);
  assert.equal(vidaDaSessao(dir, 's1', { config: amb(p).config }).estado, 'viva');
  assert.ok(lerEventos(dir).some(e => e.tipo === 'pid-instavel' && e.sessao === 's1'));
});
// teste/claude-code.test.mjs (ajusta 'SessionStart traduz origem e modelo')
test('claude-code: /clear é continuação', () => assert.equal(traduzirEntrada(gravado('inicio.json', { source: 'clear' })).origem, 'continuacao'));
```

- [ ] **Passo 2:** Rodar e ver falhar.
- [ ] **Passo 3:** Implementar. O `gancho.mjs` aguarda `tratar`. Para descobrir o estado de cada dona no resumo, usar `vidaDaSessao` uma vez por dona distinta.
- [ ] **Passo 4:** Rodar `node --test teste/`. Esperado: passam.
- [ ] **Passo 5:** Varredura (código 0) e commit: `feat: herança na continuação e sinal de vida nos ganchos`.

### Tarefa 3: `papel`, dona como fonte e quadro com vida

**Arquivos:**
- Criar: `nucleo/comandos/papel.mjs`, `teste/papel.test.mjs`
- Modificar: `nucleo/comandos/open.mjs`, `nucleo/comandos/close.mjs`, `nucleo/comandos/board.mjs`, `nucleo/bin/ah.mjs`, `teste/board.test.mjs`, `teste/close.test.mjs`

**Interfaces:**
- Consome: `frentesDa`, `vidaDaSessao`, `listarSessoes` (tarefa 1).
- Produz:
  - `ah papel [orquestrador|executor]`: sem argumento escreve `Sessão <curto>: <papel>.`; com argumento grava e registra o evento `papel`. Recusas: valor fora dos dois (saída: `ah papel orquestrador` ou `ah papel executor`); `executor` com mais de uma frente (saída: `ah handoff <nome>` ou `ah close <nome>` nas outras, com os nomes).
  - `open`: a regra "executor com frente ativa não abre outra" passa a usar `frentesDa(listarFrentes(dir), sessao)`; o orquestrador abre quantas quiser e a nova vira a frente em foco (`sessao.frente`).
  - `close`: a frente de outra sessão é aceita quando a dona não está `viva` (antes: quando tinha `fim`); frente `passada` (sem dona) também.
  - `board`: coluna `DONA` mostra `<curto>` ou `<curto> (morta)` ou `—`; `ESTADO` mostra `ativa`, `passada` ou `órfã` (ativa com dona não viva); depois da tabela, `Sessões vivas: <curto> (<papel>, <nome da frente em foco>|—); …` ou `Sessões vivas: nenhuma`. JSON: cada frente ganha `donaViva: boolean`; topo ganha `sessoes: Array<{id, curto, papel, frente}>` (só as vivas).
  - `despachar`: quando um comando lança `ErroDeUso` e `amb.dirEstado` é conhecido, registra `{tipo: 'recusa-de-comando', comando: <nome>, sessao, motivo}` antes de escrever a recusa.

- [ ] **Passo 1:** Escrever os testes.

```js
test('papel mostra, troca e registra', () => {
  const p = criarProjeto(); assert.match(p.ah(['papel']).saida, /Sessão sessao-t: executor\./);
  assert.equal(p.ah(['papel', 'orquestrador']).codigo, 0);
  assert.equal(JSON.parse(p.ah(['whoami', '--json']).saida).papel, 'orquestrador');
  assert.ok(eventos(p).some(e => e.tipo === 'papel' && e.papel === 'orquestrador'));
});
test('papel inválido recusa com a saída', () => assert.match(criarProjeto().ah(['papel', 'chefe']).erro, /Faça: .*ah papel (orquestrador|executor)/));
test('orquestrador abre duas frentes e não volta a executor com as duas', () => {
  const p = criarProjeto(); p.ah(['papel', 'orquestrador']);
  assert.equal(p.ah(['open', 'carrinho']).codigo, 0); assert.equal(p.ah(['open', 'frete']).codigo, 0);
  const r = p.ah(['papel', 'executor']); assert.equal(r.codigo, 1); assert.match(r.erro, /Faça: .*(handoff|close).*carrinho/);
});
test('board mostra a dona morta, a frente órfã e as sessões vivas', () => {
  const p = criarProjeto(); p.ah(['open', 'carrinho']); p.ah(['whoami'], { env: { AH_SESSAO: 'sessao-b-0002' } });
  envelhecerSinal(p, 'sessao-teste-0001', 500);
  const s = p.ah(['board']).saida;
  assert.match(s, /as-1\s+carrinho\s+sessao-t \(morta\)\s+órfã/); assert.match(s, /Sessões vivas: sessao-b \(executor, —\)/);
});
test('recusa de comando vai para os eventos', () => {
  const p = criarProjeto(); p.ah(['open', 'Errado']);
  assert.ok(eventos(p).some(e => e.tipo === 'recusa-de-comando' && e.comando === 'open'));
});
test('close aceita frente cuja dona tem o sinal vencido', () => { /* comFrente; merge; envelhecerSinal da dona; close com AH_SESSAO=sessao-b-0002 -> 0 */ });
```

- [ ] **Passo 2:** Rodar e ver falhar.
- [ ] **Passo 3:** Implementar.
- [ ] **Passo 4:** Rodar `node --test teste/`. Esperado: passam.
- [ ] **Passo 5:** Varredura e commit: `feat: papel, dona como fonte e quadro com sessões vivas`.

### Tarefa 4: `gh` falso com estado e fila de pendentes

**Arquivos:**
- Criar: `nucleo/lib/pendentes.mjs`, `teste/pendentes.test.mjs`
- Modificar: `teste/apoio/gh-falso.mjs`, `teste/apoio/repo.mjs`, `nucleo/lib/github.mjs`, `nucleo/comandos/open.mjs`, `nucleo/comandos/close.mjs`, `teste/apoio.test.mjs`

**Interfaces:**
- Produz, no `gh` falso (as respostas de `GH_FALSO_RESPOSTAS` continuam com prioridade, e `GH_FALSO_FORA=1` continua derrubando tudo):
  - `GH_FALSO_TICKETS`: arquivo JSON `{"<n>": {state: 'OPEN'|'CLOSED', assignees: string[], labels: string[], comments: Array<{author, body}>, apagado?: true}}`. Ticket ausente nasce `OPEN` e vazio. `apagado` faz qualquer chamada sobre ele sair com código 1 e `GraphQL: Could not resolve to an issue`.
  - `GH_FALSO_LOGIN`: login de `api user` e autor dos comentários (padrão `ana-souza`).
  - `issue view <n> --json <campos>`: devolve, no formato do `gh`, `state`, `assignees: [{login}]`, `labels: [{name}]`, `comments: [{author: {login}, body}]`.
  - `issue comment <n> --body-file -`, `issue edit <n> [--add-assignee X] [--remove-assignee X] [--add-label L] [--remove-label L]` (`@me` é o login), `issue list --label L --state open --json number,comments [--limit N]`, `label create L …` (sempre 0).
  - `GH_FALSO_CORRIDA`: JSON `{ticket, autor, body}`; no primeiro `issue comment` daquele ticket, o falso acrescenta antes esse comentário e põe `autor` em `assignees` (simula a outra abertura no mesmo segundo).
- Produz, em `repo.mjs`: `criarRepo` define `GH_FALSO_TICKETS` em `<base>/gh-tickets.json`; `p.ghTicket(n) -> {state, assignees, labels, comments}`; `p.ghSemear(n, parcial)`.
- Produz, em `github.mjs`: `editarTicket(ticket, args, o) -> boolean` (`gh issue edit <ticket> ...args`) e `criarRotulo(rotulo, o) -> boolean` (`gh label create <rotulo> --color FBCA04 --description "reservado por uma frente do agent-harness" --force`).
- Produz, em `pendentes.mjs` (arquivo `pendentes.jsonl` no diretório de estado; trava `pendentes`):
  - `enfileirar(dirEstado, op)`, com `op` = `{tipo: 'comentario', ticket, corpo}` ou `{tipo: 'edicao', ticket, args: string[]}`.
  - `comentarOuEnfileirar(dirEstado, ticket, corpo, o) -> boolean` e `editarOuEnfileirar(dirEstado, ticket, args, o) -> boolean`: tentam já; na falha enfileiram, registram o evento `comentario-falhou` (ou `edicao-falhou`) e devolvem `false`.
  - `reenviarPendentes(dirEstado, o) -> Promise<{enviados, restam, descartados}>`: em ordem; para no primeiro erro passageiro; erro que casa `/could not resolve to an issue|not found|HTTP 404|HTTP 410/i` vai para `pendentes-descartados.jsonl` (com o erro) e registra `pendente-descartado`.
  - `contarPendentes(dirEstado) -> number`.
- `open` e `close` trocam `comentar` por `comentarOuEnfileirar` (o aviso passa a dizer "ficou na fila; sai no próximo comando com rede") e chamam `reenviarPendentes` no começo, sem deixar a falha dele virar recusa.

- [ ] **Passo 1:** Escrever os testes.

```js
test('gh falso guarda comentário, responsável e rótulo por ticket', () => {
  const p = criarRepo();
  gh(['issue', 'comment', '3', '--body-file', '-'], { cwd: p.raiz, env: p.env, entrada: 'oi' });
  gh(['issue', 'edit', '3', '--add-assignee', '@me', '--add-label', 'em-andamento'], { cwd: p.raiz, env: p.env });
  assert.deepEqual(p.ghTicket(3), { state: 'OPEN', assignees: ['ana-souza'], labels: ['em-andamento'], comments: [{ author: 'ana-souza', body: 'oi' }] });
  const v = JSON.parse(gh(['issue', 'view', '3', '--json', 'assignees,comments'], { cwd: p.raiz, env: { ...p.env, GH_FALSO_LOGIN: 'carla-dias' } }).saida);
  assert.equal(v.comments[0].author.login, 'ana-souza');
});
test('comentário sem rede vai para a fila e sai no reenvio', async () => {
  assert.equal(comentarOuEnfileirar(dir, 1, 'a', { cwd: p.raiz, env: { ...p.env, GH_FALSO_FORA: '1' } }), false);
  assert.equal(contarPendentes(dir), 1);
  assert.deepEqual(await reenviarPendentes(dir, { cwd: p.raiz, env: p.env }), { enviados: 1, restam: 0, descartados: 0 });
  assert.equal(p.ghTicket(1).comments[0].body, 'a');
});
test('reenvio para no primeiro erro passageiro e mantém a ordem', async () => { /* duas na fila; reenvio sem rede -> restam 2; com rede -> corpos na ordem */ });
test('erro permanente vai para os descartados e não trava a fila', async () => {
  p.ghSemear(8, { apagado: true }); enfileirar(dir, { tipo: 'comentario', ticket: 8, corpo: 'x' }); enfileirar(dir, { tipo: 'comentario', ticket: 1, corpo: 'y' });
  assert.deepEqual(await reenviarPendentes(dir, o), { enviados: 1, restam: 0, descartados: 1 });
  assert.ok(fs.existsSync(path.join(dir, 'pendentes-descartados.jsonl')));
});
test('close sem rede deixa o comentário na fila; o próximo comando com rede envia', () => { /* comFrente, merge, close com GH_FALSO_FORA -> 0 e /fila/; whoami não reenvia; p.ah(['board']) não reenvia; p.ah(['open','x']) reenvia: ghTicket(1).comments.at(-1) casa /fechada/ */ });
```

- [ ] **Passo 2:** Rodar e ver falhar.
- [ ] **Passo 3:** Implementar. O falso grava o arquivo de tickets inteiro a cada escrita (os testes não rodam `gh` em paralelo no mesmo repositório).
- [ ] **Passo 4:** Rodar `node --test teste/`. Esperado: passam.
- [ ] **Passo 5:** Varredura e commit: `feat: fila de comentários pendentes e gh falso com tickets`.

### Tarefa 5: Reserva de ticket

**Arquivos:**
- Criar: `nucleo/lib/reserva.mjs`, `teste/reserva.test.mjs`
- Modificar: `nucleo/comandos/open.mjs`, `nucleo/comandos/close.mjs`, `teste/open.test.mjs`, `teste/close.test.mjs`

**Interfaces:**
- Consome: tarefa 4 (`editarTicket`, `criarRotulo`, `comentarOuEnfileirar`, `editarOuEnfileirar`, o `gh` falso).
- Produz, em `reserva.mjs` (todas recebem `o = {cwd, env}` como as de `github.mjs`):
  - `montarMarcador(tipo, campos) -> string` e `lerMarcadores(texto) -> Array<{tipo, campos}>` (decisão 6).
  - `lerTicket(numero, o) -> {ok: true, ticket: {numero, aberto, responsaveis: string[], rotulos: string[], marcadores: Array<{tipo, campos, autor}>}} | {ok: false, motivo}`: uma chamada, `gh issue view <n> --json state,assignees,labels,comments`. Conferir na documentação oficial do `gh` se `comments` traz todos os comentários; se não trouxer, ler pela API com `--paginate`.
  - `situacaoDoTicket(ticket, {rotulo, frenteId}) -> {livre: true, propria?: true} | {livre: false, id, nome, login, estado}`: pelo último marcador de cada frente; um responsável que não é dono de marcador ativo, ou o rótulo sem marcador ativo, também reservam (`id: null`, `login` do responsável ou `'desconhecido'`).
  - `reservar({tickets, frente, login, sessao, rotulo}, o) -> {ok: true, reservados: number[], fechados: number[]} | {ok: false, motivo, saida}`, nesta ordem: lê todos (falha → `ok: false`, "não consegui falar com o GitHub para reservar #…", saída "tente de novo com rede, ou abra sem --tickets (sem reserva)"); qualquer ticket aberto reservado por outra frente → `ok: false` com o `id` e o `@login` (saída "combine com @<login>, dona da frente <id>, ou escolha outro ticket; se a reserva ficou velha, peça a quem a fez para rodar ah close ou ah handoff"); fechados são pulados; `criarRotulo`; em cada aberto, comenta `Frente <id> (<nome>) aberta por @<login>.` + marcador `frente` ativo, e `editarTicket` com `--add-assignee <login> --add-label <rótulo>`; relê cada um; se outra frente tem marcador ativo mais antigo que o desta, desiste em todos: comenta `desistencia` (estado `livre`), tira `<login>` de responsável se o vencedor tem outro login, e devolve `ok: false` com o `id` do vencedor.
  - `marcarTickets({frente, tipo, texto, login, sessao, rotulo, dirEstado, reatribuir = false}, o)`: comenta `texto` + marcador do `tipo` em cada ticket da frente por `comentarOuEnfileirar`; com `reatribuir` e `login` fora de `frente.reserva.logins`, acrescenta o responsável por `editarOuEnfileirar` e devolve a lista de logins nova.
  - `liberarTickets({frente, resumo, login, rotulo, dirEstado}, o)`: em cada ticket, comenta `Frente <id> (<nome>) fechada.\n\n<resumo>` + marcador `fechamento` (estado `livre`); se `frente.reserva`, `editarOuEnfileirar` com `--remove-assignee` para cada login de `reserva.logins` e `--remove-label <rótulo>`.
- `open`: com tickets, `reservar` dentro da trava `frentes`, depois das recusas locais e antes do `git worktree add`; `ok: false` vira `ErroDeUso`; grava `frente.reserva = {logins: [login], tickets: reservados}`; evento `reserva` (ou `reserva-desistida`). O comentário de abertura da fatia 1 deixa de existir à parte: é o da reserva. Sem tickets, nada muda.
- `close`: o passo 3 chama `liberarTickets` no lugar dos comentários (continua uma vez só, por `fechamentoComentado`).

- [ ] **Passo 1:** Escrever os testes. Ajustar em `open.test.mjs`: em 'open cria ramo, worktree, estado e comenta nos tickets' o marcador esperado passa a ser `/<!-- ah:frente id=as-1 nome=carrinho ramo=feat\/carrinho estado=ativa login=ana-souza/`; 'sem rede o open segue com aviso' passa a 'open com tickets e sem rede recusa sem criar nada' (código 1, `Faça: `, nenhum worktree, nenhum ramo `feat/carrinho`).

```js
test('marcador ida e volta, com espaço no valor', () => {
  const campos = { id: 'as-1', nome: 'carrinho', ramo: 'feat/carrinho', estado: 'ativa', login: 'ana-souza', plano: 'docs/meu plano.md' };
  const m = montarMarcador('frente', campos);
  assert.match(m, /^<!-- ah:frente id=as-1 nome=carrinho ramo=feat\/carrinho estado=ativa login=ana-souza plano=docs\/meu%20plano\.md v=1 -->$/);
  assert.deepEqual(lerMarcadores(`texto\n\n${m}\n`), [{ tipo: 'frente', campos: { ...campos, v: '1' } }]);
});
test('marcador da fatia 1 é lido como frente ativa', () =>
  assert.equal(lerMarcadores('<!-- ah:frente id=as-1 nome=carrinho ramo=feat/carrinho -->')[0].campos.estado, 'ativa'));
test('situação: o último marcador decide; responsável posto à mão também reserva', () => { /* frente ativa -> fechamento => livre; responsavel 'carla-dias' sem marcador => livre false, login 'carla-dias' */ });
test('open reserva com responsável, rótulo e marcador', () => {
  const p = criarProjeto(); assert.equal(p.ah(['open', 'carrinho', '--tickets', '1']).codigo, 0);
  const t = p.ghTicket(1);
  assert.deepEqual([t.assignees, t.labels], [['ana-souza'], ['em-andamento']]);
  assert.match(t.comments.at(-1).body, /<!-- ah:frente id=as-1 nome=carrinho ramo=feat\/carrinho estado=ativa login=ana-souza/);
  assert.deepEqual(lerFrenteDoTeste(p, 'carrinho').reserva, { logins: ['ana-souza'], tickets: [1] });
});
test('open recusa ticket reservado por outra frente e não cria nada', () => {
  const p = criarProjeto();
  p.ghSemear(2, { assignees: ['carla-dias'], labels: ['em-andamento'], comments: [{ author: 'carla-dias', body: montarMarcador('frente', { id: 'cd-4', nome: 'frete', ramo: 'feat/frete', estado: 'ativa', login: 'carla-dias' }) }] });
  const r = p.ah(['open', 'carrinho', '--tickets', '2']);
  assert.equal(r.codigo, 1); assert.match(r.erro, /cd-4/); assert.match(r.erro, /Faça: .*@carla-dias/);
  assert.doesNotMatch(p.git(['branch', '--list']).saida, /feat\/carrinho/);
});
test('corrida: quem reservou depois desiste, sai de responsável e não cria worktree', () => {   // foco 4
  const p = criarProjeto();
  const corrida = { ticket: 1, autor: 'carla-dias', body: montarMarcador('frente', { id: 'cd-1', nome: 'frete', ramo: 'feat/frete', estado: 'ativa', login: 'carla-dias' }) };
  const r = p.ah(['open', 'carrinho', '--tickets', '1'], { env: { GH_FALSO_CORRIDA: JSON.stringify(corrida) } });
  assert.equal(r.codigo, 1); assert.match(r.erro, /cd-1/);
  const t = p.ghTicket(1);
  assert.match(t.comments.at(-1).body, /ah:desistencia id=as-1 .*estado=livre/);
  assert.ok(!t.assignees.includes('ana-souza'));
  assert.equal(lerFrenteDoTeste(p, 'carrinho'), null);
  assert.ok(eventos(p).some(e => e.tipo === 'reserva-desistida'));
});
test('ticket fechado não é reservado; o open avisa e segue', () => { /* ghSemear(3,{state:'CLOSED'}); codigo 0; erro /#3.*fechado/; assignees [] */ });
test('close libera: tira responsável e rótulo e comenta o fechamento como livre', () => {
  const { p } = comFrente(); p.git(['merge', '--no-ff', 'feat/carrinho', '-m', 'm']); p.ah(['close', '--resumo', 'soma']);
  const t = p.ghTicket(1);
  assert.deepEqual([t.assignees, t.labels], [[], []]);
  assert.match(t.comments.at(-1).body, /fechada\.[\s\S]*soma[\s\S]*ah:fechamento id=as-1 .*estado=livre/);
});
```

- [ ] **Passo 2:** Rodar e ver falhar.
- [ ] **Passo 3:** Implementar.
- [ ] **Passo 4:** Rodar `node --test teste/`. Esperado: passam.
- [ ] **Passo 5:** Varredura e commit: `feat: reserva de ticket no open e liberação no close`.

### Tarefa 6: Sobreposição de arquivos

**Arquivos:**
- Criar: `nucleo/lib/sobreposicao.mjs`, `teste/sobreposicao.test.mjs`
- Modificar: `nucleo/comandos/open.mjs`, `nucleo/comandos/board.mjs`, `nucleo/adaptadores/contrato.mjs`, `nucleo/lib/resumo.mjs`

**Interfaces:**
- Produz, em `sobreposicao.mjs`:
  - `casaGlob(caminho, glob) -> boolean`: caminhos com `/`; `**` casa qualquer coisa, inclusive `/`; `*` e `?` não casam `/`; glob terminado em `/` casa tudo abaixo da pasta; o resto é literal.
  - `arquivosDaFrente(frente, {raiz, base, env}) -> string[]`: união, sem repetição e ordenada, de `git diff --name-only refs/heads/<base>...refs/heads/<ramo>` (no principal) e dos caminhos de `git status --porcelain -z` no worktree (se existe); renomeação conta os dois nomes. Ramo ausente conta como lista vazia.
  - `sobreposicoes(arquivosPorFrente: Map<string, string[]>) -> Array<{arquivo, frentes: string[]}>`: só arquivos de duas frentes ou mais (as chaves são IDs), ordenados por arquivo.
  - `tocaOsCaminhos(arquivos, globs) -> string[]`.
- `open`: depois de abrir, para cada outra frente ativa: `Notas de <id> <nome>:` com as 3 últimas notas (uma linha cada, 120 caracteres); com `--caminhos`, `Atenção: <id> <nome> já mudou <n> arquivo(s) de --caminhos: <até 10>` e `Atenção: <id> <nome> declarou os mesmos caminhos: <globs>` quando um glob dela é igual a um seu ou um é prefixo literal do outro. Tudo na saída de erro, como aviso; nunca recusa.
- `board`: coluna `SOBREPÕE` (IDs das outras frentes que mexem nos mesmos arquivos, ou `—`) entre `TICKETS` e `PLANO`; depois da tabela, `Sobreposições:` e uma linha `  <arquivo>: <id>, <id>` por arquivo (até 20, depois `… e mais <n>`). JSON: `sobrepoe: string[]` por frente e `sobreposicoes` no topo.
- Contrato `inicio`: `situacao.sobreposicoes` com as da frente da sessão; o resumo ganha `Sobreposição: <arquivos> com <ids>` (até 200 caracteres).

- [ ] **Passo 1:** Escrever os testes. `duasFrentes()` monta um projeto com `carrinho` (sessão padrão) e `frete` (`sessao-b-0002`), cada uma com um commit que muda `src/total.js`.

```js
test('casaGlob', () => {
  assert.ok(casaGlob('src/a/b.js', 'src/**')); assert.ok(casaGlob('src/b.js', 'src/*.js'));
  assert.ok(!casaGlob('src/a/b.js', 'src/*.js')); assert.ok(casaGlob('docs/x/y.md', 'docs/'));
  assert.ok(casaGlob('a1c', 'a?c')); assert.ok(!casaGlob('a.c', 'a[.]c'));
});
test('sobreposicoes só lista arquivo de duas frentes', () =>
  assert.deepEqual(sobreposicoes(new Map([['as-1', ['a', 'b']], ['as-2', ['b', 'c']]])), [{ arquivo: 'b', frentes: ['as-1', 'as-2'] }]));
test('arquivosDaFrente junta commits do ramo e mudanças não commitadas', () => { /* commit muda a.js; b.js novo sem commit -> ['a.js','b.js'] */ });
test('board mostra a sobreposição', () => {
  const p = duasFrentes(); const s = p.ah(['board']).saida;
  assert.match(s, /as-1\s+carrinho.*\bas-2\b/); assert.match(s, /Sobreposições:\n\s+src\/total\.js: as-1, as-2/);
});
test('open --caminhos avisa da frente que já mexe e mostra as notas dela', () => {
  const p = duasFrentes(); p.ah(['nota', 'mexendo no total'], { env: { AH_SESSAO: 'sessao-b-0002' } });
  const r = p.ah(['open', 'cupom', '--caminhos', 'src/**'], { env: { AH_SESSAO: 'sessao-c-0003' } });
  assert.equal(r.codigo, 0); assert.match(r.erro, /Atenção: as-2 frete já mudou 1 arquivo\(s\) de --caminhos: src\/total\.js/); assert.match(r.erro, /mexendo no total/);
});
test('resumo traz a sobreposição da frente da sessão', async () => { /* duasFrentes; tratar inicio da sessao-b -> /Sobreposição: src\/total\.js com as-1/ */ });
```

- [ ] **Passo 2:** Rodar e ver falhar.
- [ ] **Passo 3:** Implementar `casaGlob` convertendo o glob em expressão regular, caractere a caractere (escapar o que não é `*`, `?` ou `/`).
- [ ] **Passo 4:** Rodar `node --test teste/`. Esperado: passam.
- [ ] **Passo 5:** Varredura e commit: `feat: sobreposição de arquivos no open, no quadro e no resumo`.

### Tarefa 7: `handoff` e retomar na mesma máquina

**Arquivos:**
- Criar: `nucleo/comandos/handoff.mjs`, `teste/handoff.test.mjs`
- Modificar: `nucleo/comandos/open.mjs`

**Interfaces:**
- Consome: `marcarTickets` (tarefa 5), `reenviarPendentes` (tarefa 4), `vidaDaSessao`, `frentesDa` (tarefa 1).
- Produz:
  - `ah handoff [<nome>] [--nota "<texto>"]`. Recusas, nesta ordem, sem mudar nada: sessão sem frente (saída: `ah board`); frente nomeada não é desta sessão; frente não ativa; worktree não existe (saída: `ah close <nome>`); worktree com alterações (saída: commit no worktree, `wip:` serve); worktree fora do ramo da frente ou com `rebase`/`merge`/`cherry-pick` em andamento (saída: terminar ou abortar a operação, ou trazer os commits para o ramo); push que falha (saída: o erro do git; "nada mudou").
  - Passos: `reenviarPendentes`; com remoto configurado e existente, `git push -u <remoto> refs/heads/<ramo>:refs/heads/<ramo>` no principal (sempre, mesmo sem commit novo); sem remoto, aviso "sem remoto: só esta máquina retoma"; `marcarTickets` com `tipo: 'passagem'`, estado `passada` e o texto abaixo; frente vira `estado: 'passada'`, `dona: null`, `passadaEm`, `passadaPor: <sessão>`, e a nota entra em `notas`; `sessao.frente = null`; evento `passagem` com `frente`, `id`, `sessao`.
  - Texto do comentário:

```
Passagem de bastão: frente <id> (<nome>), por @<login>.

<nota, ou "(sem nota)">

Estado deixado: ramo <ramo> no remoto <remoto>. Últimos commits:
- <hash curto> <assunto>          (até 3)
Plano: <plano>                    (se houver)

Para retomar: tools/ah open <nome>
```

  - Saída: `Frente <id> <nome> passada.` e `Para retomar: tools/ah open <nome>`.
  - `open <nome>` com frente local: `passada` → retoma (regra do executivo vale; `--tickets` recusa com "os tickets vêm da frente passada; rode ah open <nome> sem --tickets"; `--plano` e `--caminhos` substituem; worktree ausente é recriado com `git worktree add <worktree> <ramo>`, ou com `--track -b <ramo> <worktree> <remoto>/<ramo>` se só há o remoto); grava `dona`, `estado: 'ativa'`, `retomadaEm`, `sessao.frente`; `marcarTickets` com `tipo: 'retomada'`, estado `ativa`, `reatribuir: true`; evento `retomada`. Saída: `Frente <id> <nome> retomada.` e `Trabalhe em: <worktree>`. `ativa` de dona viva → recusa (saída: "peça à sessão <curto> que rode ah handoff"); `ativa` de dona não viva → recusa (saída: `ah takeover <nome>`).

- [ ] **Passo 1:** Escrever os testes.

```js
test('handoff empurra o ramo, comenta a passagem e solta a frente; a reserva fica', () => {
  const { p } = comFrente(); const r = p.ah(['handoff', '--nota', 'falta o frete']);
  assert.equal(r.codigo, 0, r.erro); assert.match(r.saida, /Para retomar: tools\/ah open carrinho/);
  const f = lerFrenteDoTeste(p, 'carrinho');
  assert.deepEqual([f.estado, f.dona, f.notas.at(-1).texto], ['passada', null, 'falta o frete']);
  assert.match(p.git(['ls-remote', 'origin', 'feat/carrinho']).saida, /refs\/heads\/feat\/carrinho/);
  const t = p.ghTicket(1);
  assert.match(t.comments.at(-1).body, /falta o frete[\s\S]*tools\/ah open carrinho[\s\S]*<!-- ah:passagem id=as-1 nome=carrinho ramo=feat\/carrinho estado=passada/);
  assert.deepEqual(t.assignees, ['ana-souza']);
  assert.equal(JSON.parse(p.ah(['whoami', '--json']).saida).frente, null);
  assert.ok(eventos(p).some(e => e.tipo === 'passagem' && e.id === 'as-1'));
});
test('handoff recusa worktree sujo e HEAD fora do ramo, sem mudar nada', () => { /* b.txt solto -> 1, estado ativa; git switch --detach no worktree -> 1 */ });
test('handoff sem remoto avisa e segue', () => { /* criarProjeto({remoto:false}); erro /só esta máquina retoma/ */ });
test('outra sessão retoma a frente passada na mesma máquina com o mesmo ID', () => {
  const { p } = comFrente(); p.ah(['handoff']);
  const r = p.ah(['open', 'carrinho'], { env: { AH_SESSAO: 'sessao-b-0002' } });
  assert.equal(r.codigo, 0, r.erro); assert.match(r.saida, /Frente as-1 carrinho retomada\./);
  assert.deepEqual([lerFrenteDoTeste(p, 'carrinho').dona, lerFrenteDoTeste(p, 'carrinho').estado], ['sessao-b-0002', 'ativa']);
  assert.match(p.ghTicket(1).comments.at(-1).body, /ah:retomada id=as-1 .*estado=ativa/);
});
test('retomar com --tickets recusa', () => { /* handoff; open carrinho --tickets 2 -> 1 com /sem --tickets/ */ });
test('open de frente ativa: dona viva aponta handoff; dona morta aponta takeover', () => { /* sessao-b tenta; depois envelhecerSinal da dona */ });
test('retomar recria o worktree apagado a partir do ramo', () => { /* handoff; git worktree remove; open por sessao-b -> worktree existe com a.txt */ });
```

- [ ] **Passo 2:** Rodar e ver falhar.
- [ ] **Passo 3:** Implementar. Operação em andamento: existe `git rev-parse --git-path <x>` para `rebase-merge`, `rebase-apply`, `MERGE_HEAD` ou `CHERRY_PICK_HEAD`, resolvido no worktree.
- [ ] **Passo 4:** Rodar `node --test teste/`. Esperado: passam.
- [ ] **Passo 5:** Varredura e commit: `feat: handoff e retomada pelo open na mesma máquina`.

### Tarefa 8: Retomar de outra máquina

**Arquivos:**
- Criar: `teste/retomar.test.mjs`
- Modificar: `nucleo/lib/reserva.mjs`, `nucleo/comandos/open.mjs`, `teste/apoio/repo.mjs`

**Interfaces:**
- Consome: tarefas 5 e 7.
- Produz:
  - `acharPassagem({nome, tickets = [], rotulo}, o) -> {ok: true, passagem: {id, nome, ramo, tickets, plano, abertaPor, abertaEm, logins: string[], login} | null, ativa?: {id, login}} | {ok: false, motivo}`: com `tickets`, lê cada um; sem, `gh issue list --label <rótulo> --state open --json number,comments --limit 200`. Considera o último marcador com `nome` igual; `passagem` → devolve; `frente`/`retomada`/`tomada` (ativa) → `passagem: null` com `ativa`; `fechamento`/`desistencia` ou nada → `passagem: null`. `logins` = autores dos marcadores ativos daquela frente (quem está em responsável).
  - `open <nome>` sem estado local e com o ramo `<prefixo><nome>` no remoto (depois de `git fetch <remoto> <ramo>`): chama `acharPassagem` (o `--tickets` dado só diz onde procurar). Com passagem: `git worktree add --track -b <ramo> <worktree> <remoto>/<ramo>`; reconstrói a frente com o `id`, `tickets`, `plano`, `abertaPor` e `abertaEm` do marcador, `reserva: {logins, tickets}`, dona esta sessão; segue como a retomada local (marcação `retomada` com `reatribuir`, evento `retomada`). Sem rede: recusa "preciso do GitHub para achar a passagem de <nome>". `ativa`: recusa "a frente <id> está ativa com @<login> em outra máquina" (saída: combinar com a pessoa). Nada achado: recusa `Já existe ramo remoto com o nome <nome>, sem passagem de bastão achada.` (saída: "se é uma frente passada, rode ah open <nome> --tickets <n> com o ticket dela; senão escolha outro nome").
  - `outraMaquina(p, {sessao, login, sigla}) -> projeto` em `repo.mjs`: empurra `dev` de `p`, clona `p.remoto` numa pasta nova, com `AH_ESTADO` e `AH_WORKTREES` próprios, `AH_SESSAO = sessao`, `GH_FALSO_LOGIN = login`, o mesmo `GH_FALSO_TICKETS` e o mesmo `GH_FALSO_LOG`, e grava `maquina.json` com `{sigla, login}`. Devolve um objeto com a mesma forma do de `criarRepo` (`raiz`, `estado`, `env`, `git`, `ah`, `ghTicket`, `limpar`).

- [ ] **Passo 1:** Escrever os testes.

```js
test('outra máquina retoma pelo ramo remoto e pela passagem no ticket, com o mesmo ID', () => {
  const { p } = comFrente(); p.ah(['handoff', '--nota', 'falta o frete']);
  const q = outraMaquina(p, { sessao: 'sessao-c-0003', login: 'carla-dias', sigla: 'cd' });
  const r = q.ah(['open', 'carrinho']);
  assert.equal(r.codigo, 0, r.erro); assert.match(r.saida, /Frente as-1 carrinho retomada\./);
  const f = JSON.parse(fs.readFileSync(path.join(q.estado, 'loja', 'frentes', 'carrinho.json'), 'utf8'));
  assert.deepEqual([f.id, f.tickets, f.abertaPor, f.dona], ['as-1', [1], 'ana-souza', 'sessao-c-0003']);
  assert.ok(fs.existsSync(path.join(f.worktree, 'a.txt')));
  assert.deepEqual(p.ghTicket(1).assignees.sort(), ['ana-souza', 'carla-dias']);
});
test('ramo remoto sem passagem recusa sem criar worktree', () => { /* q: git push origin dev:feat/solto à mão; q.ah(['open','solto']) -> 1, /sem passagem de bastão/, /Faça: .*--tickets/ */ });
test('passagem já retomada em outra máquina: recusa dizendo quem está com ela', () => { /* handoff; q retoma; terceira máquina tenta -> /ativa com @carla-dias/ */ });
test('--tickets aponta onde procurar quando o ticket perdeu o rótulo', () => { /* handoff; tira o rótulo pelo ghSemear; open sem --tickets recusa; com --tickets 1 retoma */ });
test('sem rede, com o ramo remoto, recusa pedindo o GitHub', () => { /* GH_FALSO_FORA -> /preciso do GitHub/ */ });
```

- [ ] **Passo 2:** Rodar e ver falhar.
- [ ] **Passo 3:** Implementar. O teste da fatia 1 'nome repetido como ramo local, ramo remoto ou frente é recusado' continua passando porque a mensagem sem passagem mantém "Já existe ramo remoto".
- [ ] **Passo 4:** Rodar `node --test teste/`. Esperado: passam.
- [ ] **Passo 5:** Varredura e commit: `feat: retomar frente passada em outra máquina pela passagem no ticket`.

### Tarefa 9: `open --para`

**Arquivos:**
- Modificar: `nucleo/comandos/open.mjs`, `nucleo/lib/sessao.mjs`, `teste/papel.test.mjs`

**Interfaces:**
- Consome: tarefas 1, 3, 5 e 7.
- Produz:
  - `resolverSessao(dirEstado, curto) -> Sessao` em `sessao.mjs`: as sessões cujo id começa por `curto`; nenhuma → `ErroDeUso` (saída: "confira o id em tools/ah board"); mais de uma → `ErroDeUso` listando os ids inteiros (saída: "use mais letras do id").
  - `ah open <nome> --para <id curto>`: recusas: quem chama não é orquestrador (saída: `ah papel orquestrador`); destino não `viva` (saída: "confira as sessões vivas em tools/ah board"); destino executor com frente ativa (saída: "escolha outra sessão ou peça a ela ah handoff"). Vale para frente nova e para retomada de passada. Efeito: `frente.dona = destino`, `frente.atribuidaPor = quem chama`; `sessao.frente` do destino é a nova; a de quem chama não muda; o comentário de reserva diz `aberta por @<login> para a sessão <curto>` e o marcador leva `sessao=<curto do destino>`; evento `atribuicao` com `sessao`, `para`, `frente`.

- [ ] **Passo 1:** Escrever os testes.

```js
test('orquestrador abre frente para outra sessão viva pelo id curto', () => {
  const p = criarProjeto(); p.ah(['whoami'], { env: { AH_SESSAO: 'sessao-b-0002' } }); p.ah(['papel', 'orquestrador']);
  const r = p.ah(['open', 'carrinho', '--para', 'sessao-b']);
  assert.equal(r.codigo, 0, r.erro);
  const f = lerFrenteDoTeste(p, 'carrinho');
  assert.deepEqual([f.dona, f.atribuidaPor], ['sessao-b-0002', 'sessao-teste-0001']);
  assert.equal(JSON.parse(p.ah(['whoami', '--json'], { env: { AH_SESSAO: 'sessao-b-0002' } }).saida).frente, 'carrinho');
  assert.equal(JSON.parse(p.ah(['whoami', '--json']).saida).frente, null);
  assert.ok(eventos(p).some(e => e.tipo === 'atribuicao' && e.para === 'sessao-b-0002'));
});
test('--para recusa: executor, id desconhecido, id ambíguo, destino morto, destino executor com frente', () => {
  /* cada caso: codigo 1 e /Faça: / ; ambíguo com sessões 'sessao-b-0002' e 'sessao-b-0009' e --para sessao-b */
});
test('a sessão destino vê a frente no resumo do próximo começo', async () => { /* tratar inicio da sessao-b-0002 -> /Sua frente: as-1 carrinho/ */ });
```

- [ ] **Passo 2:** Rodar e ver falhar.
- [ ] **Passo 3:** Implementar.
- [ ] **Passo 4:** Rodar `node --test teste/`. Esperado: passam.
- [ ] **Passo 5:** Varredura e commit: `feat: open --para do orquestrador`.

### Tarefa 10: `takeover`

**Arquivos:**
- Criar: `nucleo/comandos/takeover.mjs`, `teste/takeover.test.mjs`

**Interfaces:**
- Consome: tarefas 1, 2, 3, 4 e 5.
- Produz: `ah takeover <nome> [--confirmado]`. Recusas, sem mudar nada: sem nome; frente inexistente (saída: `ah board`); frente `passada` (saída: `ah open <nome>`); dona é esta sessão (saída: "a frente já é sua"); dona `viva` (saída: "peça à sessão <curto> que rode ah handoff; ou espere o sinal dela vencer (<prazo> min)"); executor com frente ativa (saída: `ah handoff` ou `ah close` antes); worktree não existe (saída: `ah close <nome>` e abrir de novo); sem `--confirmado`: `A frente <id> <nome> é da sessão <curto> (<estado>: <motivo>; último sinal há <n> min).` com a saída `peça ao executivo que confirme e rode ah takeover <nome> --confirmado`.
- Efeito com `--confirmado`, sob a trava `frentes`: `reenviarPendentes`; `dona = esta sessão`, `tomadaDe`, `tomadaEm`; a sessão antiga perde `frente` se apontava para esta; `sessao.frente = nome`; `marcarTickets` com `tipo: 'tomada'`, estado `ativa`, texto `Frente <id> (<nome>) assumida pela sessão <curto> (a anterior, <curto antigo>, <motivo>).`, `reatribuir: true`; evento `tomada` com `sessao`, `de`, `frente`, `id`. Saída: `Frente <id> <nome> assumida.` e `Trabalhe em: <worktree>`.

- [ ] **Passo 1:** Escrever os testes. `frenteDeOutra()` abre `carrinho` com `AH_SESSAO=sessao-a-0001` e `AH_PID_AGENTE` de um `processoVivo()`, e devolve `{p, proc}`.

```js
test('takeover sem --confirmado descreve e não muda nada', async () => {
  const { p, proc } = frenteDeOutra(); await proc.matar();
  const r = p.ah(['takeover', 'carrinho']);
  assert.equal(r.codigo, 1); assert.match(r.erro, /sessao-a .*morta: processo não existe/); assert.match(r.erro, /Faça: .*--confirmado/);
  assert.equal(lerFrenteDoTeste(p, 'carrinho').dona, 'sessao-a-0001');
});
test('takeover de dona morta assume, comenta e registra', async () => {
  const { p, proc } = frenteDeOutra(); await proc.matar();
  assert.equal(p.ah(['takeover', 'carrinho', '--confirmado']).codigo, 0);
  const f = lerFrenteDoTeste(p, 'carrinho');
  assert.deepEqual([f.dona, f.tomadaDe], ['sessao-teste-0001', 'sessao-a-0001']);
  assert.match(p.ghTicket(1).comments.at(-1).body, /assumida pela sessão sessao-t[\s\S]*ah:tomada id=as-1 .*estado=ativa/);
  assert.ok(eventos(p).some(e => e.tipo === 'tomada' && e.de === 'sessao-a-0001'));
});
test('takeover recusa: dona viva, frente passada, frente própria, executor com frente, worktree sumido', () => { /* um por caso, cada um com /Faça: / */ });
test('sessão antiga retomada depois do takeover não recupera a frente', async () => {   // foco 5
  const { p, proc } = frenteDeOutra(); await proc.matar(); p.ah(['takeover', 'carrinho', '--confirmado']);
  const novo = processoVivo();
  const r = await tratar({ tipo: 'inicio', sessao: 'sessao-a-0001', agente: 'claude-code', cwd: p.raiz, origem: 'continuacao' }, { ...amb(p), pid: novo.pid });
  assert.match(r.contexto, /Sua frente as-1 carrinho está com a sessão sessao-t/);
  assert.equal(lerSessao(dirDoTeste(p), 'sessao-a-0001').frente, null);
  assert.equal(lerFrenteDoTeste(p, 'carrinho').dona, 'sessao-teste-0001');
  const wt = lerFrenteDoTeste(p, 'carrinho').worktree;
  const e = await tratar({ tipo: 'antes', sessao: 'sessao-a-0001', cwd: p.raiz, acao: { tipo: 'edicao', arquivo: path.join(wt, 'a.txt') } }, { ...amb(p), pid: novo.pid });
  assert.equal(e.decisao, 'recusa');   // passa a valer quando a tarefa 13 entrar; até lá o teste fica com { todo: 'T4 na tarefa 13' }
  await novo.matar();
});
```

- [ ] **Passo 2:** Rodar e ver falhar.
- [ ] **Passo 3:** Implementar.
- [ ] **Passo 4:** Rodar `node --test teste/`. Esperado: passam (o último com a asserção do T4 marcada `todo`).
- [ ] **Passo 5:** Varredura e commit: `feat: takeover com confirmação`.

### Tarefa 11: `sweep`

**Arquivos:**
- Criar: `nucleo/lib/varredura.mjs`, `nucleo/comandos/sweep.mjs`, `teste/sweep.test.mjs`
- Modificar: `nucleo/comandos/board.mjs` (lista tolerante), `nucleo/lib/caminhos.mjs`, `teste/caminhos.test.mjs`

**Interfaces:**
- Consome: tarefas 1, 4 e 6.
- Produz:
  - `normalizarCaminho(p, plataforma = process.platform) -> string` em `caminhos.mjs`: resolve o caminho real do maior ancestral que existe e junta o resto; no Windows, em minúsculas. A tarefa 13 também usa.
  - `dentroDe(p, pasta, plataforma = process.platform) -> boolean`: puro, por `path.relative` da plataforma dada (no Windows sem diferenciar caixa).
  - `achados(amb) -> Array<{tipo, detalhe, saida}>` em `varredura.mjs`. Tipos e saídas:

| tipo | quando | saída |
|---|---|---|
| `estado-ilegivel` | arquivo de sessão ou frente que não lê | apague ou conserte o arquivo (rode ah doctor) |
| `frente-orfa` | frente ativa com dona não `viva` | `ah takeover <nome>` (com a ordem do executivo) |
| `worktree-sumiu` | frente cujo worktree não existe | `ah close <nome>` |
| `ramo-sumiu` | frente sem o ramo local nem no remoto | confira com quem abriu; `ah close <nome>` |
| `worktree-sem-frente` | worktree (fora o principal) sem frente no estado, com o número de commits fora da base e do remoto e de arquivos sujos | `ah sweep --reparar` se é `<dirWorktrees>/<nome>` com ramo `<prefixo><nome>`; senão confira e `git worktree remove` à mão |
| `sessao-morta` | sessão não viva, sem frente, com sinal há mais de 7 dias | `ah sweep --reparar` |
| `principal-fora-da-base` | checkout principal fora de `git.base` | `git switch <base>` no principal |
| `principal-sujo` | checkout principal com alterações | commit por caminho ou combine com a dona |
| `pendentes` | fila de pendentes não vazia | `ah sweep --reparar` (com rede) |

  - `reparar(amb) -> Promise<string[]>`: (1) apaga as sessões do tipo `sessao-morta`; (2) limpa `sessao.frente` que aponta para frente inexistente ou de outra dona; (3) reconstrói frente `passada`, sem dona, `reconstruida: true`, com ID novo (`proximoId` com a sigla da máquina), para cada `worktree-sem-frente` que siga o padrão; (4) `reenviarPendentes`. Cada reparo vira uma linha e um evento `reparo`. Nunca apaga worktree, ramo nem arquivo ilegível.
  - `ah sweep [--reparar] [--json]` (`requisitos`: sem sessão). Texto: com `--reparar`, `Reparos:` e uma linha por reparo (ou `Reparos: nada a fazer.`); depois `- <tipo>: <detalhe>. Faça: <saída>` por achado, ou `Nada fora do lugar.`. Sempre código 0. JSON: `{reparos, achados}`.
  - `board` usa `listarFrentesTolerante` e escreve `Aviso: arquivo de frente ilegível: <caminho> (rode ah doctor)` em vez de quebrar.

- [ ] **Passo 1:** Escrever os testes.

```js
// teste/caminhos.test.mjs (foco 2)
test('dentroDe no Windows ignora a caixa; fora da pasta e pasta vizinha não contam', () => {
  assert.ok(dentroDe('C:\\Wt\\Frete\\a.js', 'c:\\wt\\frete', 'win32'));
  assert.ok(!dentroDe('/wt/frete2/a.js', '/wt/frete', 'linux')); assert.ok(!dentroDe('/wt', '/wt/frete', 'linux'));
});
test('normalizarCaminho resolve link e .. de arquivo que ainda não existe', { skip: process.platform === 'win32' }, () => {
  /* <tmp>/wt/frete real; link <tmp>/atalho -> <tmp>/wt; normalizarCaminho('<tmp>/atalho/frete/novo/b.js') === '<real>/wt/frete/novo/b.js' */
});
// teste/sweep.test.mjs
test('sweep sem nada fora do lugar', () => assert.match(criarProjeto().ah(['sweep']).saida, /Nada fora do lugar\./));
test('sweep acha frente órfã, worktree sumido, worktree sem frente, sessão morta e pendentes', () => {
  /* frente de dona com sinal vencido; outra frente com worktree apagado à mão;
     git worktree add <AH_WORKTREES>/solto -b feat/solto; sessão 'velha' sem frente com sinal de 8 dias;
     um item na fila; cada tipo aparece com 'Faça: ' */
});
test('sweep --reparar só mexe no estado', async () => {
  /* mesmo cenário; depois: frente 'solto' passada, reconstruida, dona null; sessão 'velha' apagada;
     o worktree e o ramo feat/solto continuam; a frente órfã continua com a dona antiga */
});
test('arquivo de frente ilegível: sweep e board avisam sem quebrar', () => {   // foco 3
  const p = criarProjeto(); p.ah(['open', 'carrinho']);
  fs.writeFileSync(path.join(dirDoTeste(p), 'frentes', 'x.json'), '{');
  assert.match(p.ah(['sweep']).saida, /estado-ilegivel: .*x\.json/);
  const b = p.ah(['board']); assert.equal(b.codigo, 0); assert.match(b.erro, /ilegível: .*x\.json/); assert.match(b.saida, /carrinho/);
});
```

- [ ] **Passo 2:** Rodar e ver falhar.
- [ ] **Passo 3:** Implementar. Worktrees pela saída de `git worktree list --porcelain`; caminhos comparados depois de `normalizarCaminho`.
- [ ] **Passo 4:** Rodar `node --test teste/`. Esperado: passam.
- [ ] **Passo 5:** Varredura e commit: `feat: sweep`.

### Tarefa 12: Travas T1 e T3

**Arquivos:**
- Modificar: `nucleo/lib/travas.mjs`, `nucleo/adaptadores/contrato.mjs`, `teste/travas.test.mjs`, `teste/claude-code.test.mjs`

**Interfaces:**
- Consome: `comandosSimples` (com `cwdsAlternativos`), `subcomandoGit`, `pathspecPegaTudo` (já em `travas.mjs`).
- Produz: `TRAVAS = [travaT1, travaT2, travaT3, travaT4, travaT5]` (T4 entra na tarefa 13); `ctx` ganha, opcionais: `ehRef(cwd, nome) -> boolean` e `existe(caminho) -> boolean`. O contrato injeta `ehRef` por `git rev-parse --verify -q <nome>^{commit}` ou `<remoto>/<nome>^{commit}`, e `existe` por `fs.existsSync`.
- Regras (só quando `topoDe(cwd) === raiz`; com `cwd` nulo, recusa como a T2):
  - **T1:** `git switch` com `-c`, `-C`, `--create`, `--force-create`, `--orphan`, `--detach`, `-d`, `-`, ou com destino diferente de `git.base`; `git checkout` com `-b`, `-B`, `--orphan`, `--detach`, ou um único posicional que é `-`, ou que é diferente da base, não existe como caminho e `ehRef` reconhece; `gh pr checkout`. Motivo: "trocar o ramo do checkout principal muda o chão das outras sessões". Saída: `trabalhe no worktree de uma frente (tools/ah open <nome>); o checkout principal fica em <base>`.
  - **T3:** `git reset` com `--hard`, `--keep` ou `--merge`; `git clean` com `-f`/`--force` (inclusive combinada, `-fd`, `-xdf`); `git checkout`/`git restore` cujo pathspec pega tudo (mesma regra da T2); `git checkout -f/--force`; `git switch -f/--force/--discard-changes`; `git stash` fora `list` e `show`; `git rebase` fora `--abort` e `--quit`. Motivo: "<forma> no checkout principal descarta ou esconde trabalho que pode ser de outra sessão". Saída: `faça isso no worktree da sua frente; no checkout principal, guarde por caminho (git add <caminhos> e git commit) ou combine com a dona das mudanças`.
  - `AH_GUARD=off` libera T1 e T3 como libera as outras. Campos ausentes do `ctx` (testes antigos) não recusam por T1.

- [ ] **Passo 1:** Escrever os testes. `ctx` como o da fatia 1, mais `ehRef = (c, n) => ['main', 'stage', 'dev', 'feat/x', 'v1'].includes(n)` e `existe = c => c.endsWith('arquivo.txt')`.

```js
for (const c of ['git switch main', 'git switch -c nova', 'git switch -', 'git switch --detach', 'git checkout main', 'git checkout -b nova',
  'git checkout -', 'git checkout --detach HEAD~1', 'git checkout v1', 'gh pr checkout 7', 'cd . && git checkout stage', `bash -c 'git switch main'`])
  test(`T1 recusa: ${c}`, () => { const r = av(c); assert.equal(r.trava, 'T1'); assert.match(textoDaRecusa(r), /Faça: .*tools\/ah open/); });
test('T1 permite voltar à base e restaurar arquivo', () => {
  for (const c of ['git switch dev', 'git checkout dev', 'git checkout arquivo.txt', 'git checkout main -- arquivo.txt', 'git checkout nao-existe']) assert.ok(av(c).permite, c);
});
test('T1 e T3 não valem no worktree da frente', () => { for (const c of ['git switch -c outra', 'git reset --hard', 'git stash', 'git rebase dev']) assert.ok(av(c, '/w').permite, c); });
for (const c of ['git reset --hard', 'git reset --hard HEAD~1', 'git reset --keep x', 'git reset --merge', 'git clean -fd', 'git clean -xdf', 'git clean --force',
  'git checkout .', 'git checkout -- .', 'git restore .', 'git restore :/', 'git checkout -f dev', 'git switch --discard-changes dev',
  'git stash', 'git stash pop', 'git stash push -m x', 'git rebase dev', 'git rebase -i HEAD~2'])
  test(`T3 recusa: ${c}`, () => assert.equal(av(c).trava, 'T3'));
test('T3 permite', () => { for (const c of ['git stash list', 'git stash show', 'git rebase --abort', 'git reset', 'git reset HEAD arquivo.txt', 'git clean -n', 'git restore arquivo.txt']) assert.ok(av(c).permite, c); });
test('T1 e T3 recusam com cwd desconhecido', () => { assert.equal(av('cd "$X" && git stash').trava, 'T3'); });
test('AH_GUARD=off libera T1 e T3 no próprio comando', () => { assert.equal(av('AH_GUARD=off git switch main').liberada, 'T1'); assert.equal(av('AH_GUARD=off git reset --hard').liberada, 'T3'); });
test('troca de ramo seguida de push no principal agora cai na T1', () => assert.equal(av('git switch main && git pull && git switch dev && git push').trava, 'T1'));
// teste/claude-code.test.mjs
test('ah gancho recusa git switch no checkout principal', () => { const r = ganchoPre(p, { command: 'git switch main' }); assert.equal(r.codigo, 2); assert.match(r.erro, /Recusado \(T1\)/); });
```

  Em 'onda final: o gancho recusa a troca para ramo protegido seguida de push…', `git checkout -b x && git push -u origin x` sai da lista dos que passam e entra na dos recusados (agora T1).

- [ ] **Passo 2:** Rodar e ver falhar.
- [ ] **Passo 3:** Implementar uma função por trava, no estilo das existentes.
- [ ] **Passo 4:** Rodar `node --test teste/`. Esperado: passam.
- [ ] **Passo 5:** Varredura e commit: `feat: travas T1 e T3 no checkout principal`.

### Tarefa 13: Trava T4 (comando e edição de arquivo)

**Arquivos:**
- Modificar: `nucleo/lib/shell.mjs`, `nucleo/lib/travas.mjs`, `nucleo/adaptadores/contrato.mjs`, `teste/shell.test.mjs`, `teste/travas.test.mjs`, `teste/claude-code.test.mjs`, `teste/takeover.test.mjs` (tira o `todo`)

**Interfaces:**
- Consome: `vidaDaSessao`, `listarFrentesTolerante` (tarefa 1); `normalizarCaminho`, `dentroDe` (tarefa 11).
- Produz:
  - `comandosSimples`: cada comando simples ganha `escritas?: string[]`, os destinos de `>`, `>>`, `>|`, `<>`, `&>`, `&>>` e de `>&` quando o destino não é número nem `-`. Um comando só de redirecionamento (`> f`) sai com `argv: []` e `escritas`.
  - `ctx` das travas ganha, opcionais: `sessao` (id da sessão do evento), `frentes` (as ativas com `dona` diferente de `sessao`, cada uma `{id, nome, ramo, worktree (normalizado), dona}`), `viva(id) -> boolean`, `normalizar(p) -> string`.
  - **T4** recusa quando o alvo está dentro do worktree de uma frente de `ctx.frentes` cuja dona é `viva`:
    - git: subcomando de escrita (`add stage commit reset checkout switch restore rebase merge pull push stash clean cherry-pick revert am apply mv rm tag notes`) com `cwd` (já com `-C`) dentro do worktree; `git worktree remove|move <alvo>` com o alvo dentro; `git branch` com `-d`, `-D`, `--delete`, `-m`, `-M`, `-f`, `--force` sobre o `ramo` da frente (de qualquer pasta).
    - comandos que escrevem arquivo: `rm rmdir mv touch mkdir tee truncate chmod chown` (todo posicional), `cp install ln` (só o último posicional), `sed` e `perl` com `-i`/`--in-place` (posicionais depois do script), `dd` (`of=`).
    - qualquer comando: cada item de `escritas`.
    - edição (`acao.tipo === 'edicao'`): `arquivo` resolvido contra `acao.cwd` (ou a raiz). **Sem liberação** por `AH_GUARD=off`.
    - Caminho relativo com `cwd` nulo, ou com `$`/crase, não é avaliado pela T4 (limite declarado).
    - Motivo: `<caminho> está no worktree da frente <id> <nome>, da sessão <curto>, que está viva`. Saída: `escreva só no worktree da sua frente; para mexer em <nome>, peça à sessão <curto> (ah handoff) ou, se ela morrer, ah takeover <nome>`.
  - Contrato: monta `frentes` com `listarFrentesTolerante`; ilegíveis registram o evento `estado-ilegivel` (com os caminhos) e são pulados; `viva` usa `vidaDaSessao` com memória por id dentro do evento; `normalizar` = `normalizarCaminho`.

- [ ] **Passo 1:** Escrever os testes. `ctx4` = `ctx` da tarefa 12 mais `sessao: 'eu'`, `frentes: [{id: 'cd-1', nome: 'frete', ramo: 'feat/frete', worktree: '/wt/frete', dona: 'outra'}]`, `viva: id => id === 'outra'`, `normalizar: x => x`; `av4(comando, cwd = '/r/x')`.

```js
// teste/shell.test.mjs
test('escritas traz os destinos de redirecionamento', () => {
  assert.deepEqual(comandosSimples('echo a > x.txt 2>&1 >> y.txt', '/r')[0].escritas, ['x.txt', 'y.txt']);
  const [s] = comandosSimples('> z.txt', '/r'); assert.deepEqual([s.argv, s.escritas], [[], ['z.txt']]);
  assert.equal(comandosSimples('cat < a.txt', '/r')[0].escritas, undefined);
});
// teste/travas.test.mjs
for (const c of ['git -C /wt/frete commit -m x', 'cd /wt/frete && git add a.js', 'git worktree remove --force /wt/frete', 'git branch -D feat/frete',
  'rm -rf /wt/frete', 'rm /wt/frete/src/a.js', 'cp a.js /wt/frete/a.js', 'mv /wt/frete/a.js b.js', 'echo x > /wt/frete/a.js',
  'cat <<EOF > /wt/frete/a.js\nx\nEOF', 'sed -i s/a/b/ /wt/frete/a.js', 'tee /wt/frete/a.js', 'touch ../../wt/frete/a.js'])
  test(`T4 recusa: ${JSON.stringify(c)}`, () => { const r = av4(c); assert.equal(r.trava, 'T4'); assert.match(textoDaRecusa(r), /cd-1 frete[\s\S]*Faça: .*ah handoff/); });
test('T4 permite ler o alheio, copiar dele e escrever nele quando a dona morreu', () => {
  for (const c of ['cat /wt/frete/a.js', 'cp /wt/frete/a.js meu.js', 'git -C /wt/frete log', 'git -C /wt/frete status', 'grep x -r /wt/frete']) assert.ok(av4(c).permite, c);
  assert.ok(avaliar({ tipo: 'comando', comando: 'rm -rf /wt/frete', cwd: '/r' }, { ...ctx4, viva: () => false }).permite);
});
test('T4 na edição: recusa no alheio, permite no principal; AH_GUARD não libera', () => {
  assert.equal(avaliar({ tipo: 'edicao', arquivo: '/wt/frete/a.js', cwd: '/r' }, ctx4).trava, 'T4');
  assert.ok(avaliar({ tipo: 'edicao', arquivo: 'src/a.js', cwd: '/r' }, ctx4).permite);
  assert.equal(av4('AH_GUARD=off rm /wt/frete/a.js').liberada, 'T4');
});
// teste/travas.test.mjs (foco 2)
test('T4 pega o worktree alheio por link simbólico e por ..', { skip: process.platform === 'win32' }, () => {
  /* pasta real <tmp>/wt/frete; link <tmp>/atalho -> <tmp>/wt; ctx com normalizar = normalizarCaminho e worktree normalizado;
     edição de <tmp>/atalho/frete/a.js -> T4; comando `touch <tmp>/wt/x/../frete/b.js` -> T4 */
});
// teste/claude-code.test.mjs
test('gancho: a sessão B não edita no worktree da sessão A, viva; edita no próprio', () => {
  /* A abre carrinho com AH_PID_AGENTE de processoVivo; B abre frete;
     ganchoPre(p, {file_path: <wt carrinho>/a.txt}, 'Edit', {env: {AH_SESSAO B}}) -> 2 e /Recusado \(T4\)/;
     no worktree de frete -> 0; evento 'recusa' com trava 'T4' */
});
test('arquivo de frente ilegível não trava o gancho: a edição comum passa e o evento registra', () => {   // foco 3
  const p = criarProjeto(); fs.mkdirSync(path.join(dirDoTeste(p), 'frentes'), { recursive: true });
  fs.writeFileSync(path.join(dirDoTeste(p), 'frentes', 'x.json'), '{');
  assert.equal(ganchoPre(p, { file_path: path.join(p.raiz, 'a.txt') }, 'Edit').codigo, 0);
  assert.equal(ganchoPre(p, { command: 'rm -f a.txt' }).codigo, 0);
  assert.ok(eventos(p).some(e => e.tipo === 'estado-ilegivel'));
});
```

- [ ] **Passo 2:** Rodar e ver falhar.
- [ ] **Passo 3:** Implementar. Em `avaliar`, o laço já pula `argv` vazio: avaliar `escritas` antes de pular. No `takeover.test.mjs`, tirar o `todo` do teste do foco 5.
- [ ] **Passo 4:** Rodar `node --test teste/`. Esperado: passam.
- [ ] **Passo 5:** Varredura e commit: `feat: trava T4 por comando e por edição de arquivo`.

### Tarefa 14: `doctor` da fatia 2 e ensaio com o Claude Code

**Arquivos:**
- Modificar: `nucleo/comandos/doctor.mjs`, `teste/doctor.test.mjs`, `docs/referencia/ensaio-claude-code.md`, `docs/referencia/capacidades-por-agente.md`

**Interfaces:**
- Consome: tudo o que veio antes.
- Produz: itens novos em `VERIFICACOES`, depois de "Gancho responde":

| Item | Estado |
|---|---|
| `Hora de início do processo` | ok quando `inicioDoProcesso(process.pid)` não é nulo; no Windows, aviso: "no Windows a hora de início não é conferida; um pid reaproveitado conta como vivo até o sinal vencer" |
| `Gancho recusa troca de ramo` | executa o gancho com `git switch <primeiro protegido>` no principal; ok com código 2 e `Recusado (T1)`; senão falha, "rode ah init --sobrescrever e confira tools/ah" |
| `Ganchos vigiam a edição` | o seletor do `PreToolUse` contém `Edit`, `Write` e `NotebookEdit`; senão falha, "rode ah init" |
| `Comentários pendentes` | aviso com o número, "rode ah sweep --reparar com rede" |
| `Frente <nome> órfã` | aviso por frente ativa com dona não viva, "ah takeover <nome> com a ordem do executivo" |

- [ ] **Passo 1:** Escrever os testes.

```js
test('projeto recém-preparado: os itens novos passam', () => {
  const r = criarProjeto().ah(['doctor']); assert.equal(r.codigo, 0);
  assert.match(r.saida, /^ok\s+Gancho recusa troca de ramo/m); assert.match(r.saida, /^ok\s+Ganchos vigiam a edição/m);
});
test('comentário pendente e frente órfã viram aviso com o que fazer', () => {
  /* enfileirar um item; frente de dona com sinal vencido; /^aviso\s+Comentários pendentes: .*sweep --reparar/m e /^aviso\s+Frente carrinho órfã: .*takeover/m */
});
test('seletor sem Edit falha apontando o init', () => { /* troca o matcher em .claude/settings.json para "Bash"; /^FALHOU\s+Ganchos vigiam a edição: .*ah init/m */ });
```

- [ ] **Passo 2:** Rodar e ver falhar.
- [ ] **Passo 3:** Implementar.
- [ ] **Passo 4:** Rodar `node --test teste/`. Esperado: passam.
- [ ] **Passo 5:** Ensaio com o Claude Code de verdade, na máquina do autor, num repositório descartável em diretório temporário, com `--setting-sources project` (lição do ensaio da fatia 1): (a) `claude -p "responda ok"` e conferir que o `pid` gravado no estado de teste continua vivo depois que o agente termina a resposta, ou que virou `null` com o evento `pid-instavel`; anotar qual dos dois; (b) gravar no estado uma frente alheia cuja dona tem `AH_PID_AGENTE` de um processo que dorme, e pedir "use Edit para escrever x em <worktree alheio>/a.txt"; conferir a recusa T4 no `eventos.jsonl`; (c) `claude -p "/clear"` com `--resume` e conferir o evento `heranca` ou `frente-solta`. Guardar em `ensaio-claude-code.md`, seção "Fatia 2", a versão do agente, a data, os comandos, as respostas e as linhas dos eventos, sem caminho pessoal. Na tabela de `capacidades-por-agente.md`, acrescentar à linha (f) do Claude Code o que (a) mostrou sobre o pid do processo pai do gancho. Se (a) mostrar o pid sempre descartado, registrar como limite: a herança pelo processo não acontece e toda continuação deixa a frente passada.
- [ ] **Passo 6:** Varredura e commit: `feat: doctor da fatia 2 e ensaio com o Claude Code`.

### Tarefa 15: Ciclo com duas sessões simuladas

**Arquivos:**
- Criar: `teste/ciclo-duas-sessoes.test.mjs`

**Interfaces:**
- Consome: tudo o que veio antes; nada novo de produto.

- [ ] **Passo 1:** Escrever o teste de ponta a ponta (o item do "pronto quando" do desenho), em sequência, cada passo com a asserção do código de saída e do estado:
  1. `criarProjeto`; duas sessões, A (`sessao-a-0001`, `AH_PID_AGENTE` de um `processoVivo()`) e B (`sessao-b-0002`, outro `processoVivo()`); cada uma passa pelo gancho `SessionStart`.
  2. A abre `carrinho --tickets 1`; B abre `frete --tickets 2`. No `gh` falso, `#1` tem `ana-souza` e o rótulo, `#2` também.
  3. B tenta `Edit` em `<worktree de carrinho>/a.txt` pelo gancho: código 2, `Recusado (T4)`; e `git -C <worktree de carrinho> commit -m x` pelo `Bash`: código 2.
  4. B tenta `git switch main` no principal: código 2, `Recusado (T1)`.
  5. B faz commit em `frete`, `git merge --no-ff feat/frete` no principal e `ah close`: `#2` sem responsável nem rótulo, marcador `fechamento` com `estado=livre`.
  6. A morre (`matar()`). B roda `ah takeover carrinho` (código 1, pede `--confirmado`) e `ah takeover carrinho --confirmado` (código 0); `#1` recebe o marcador `tomada`.
  7. B edita `<worktree de carrinho>/a.txt` pelo gancho: código 0.
  8. B faz commit e `ah handoff --nota "falta o cupom"`: frente `passada`, sem dona; ramo no remoto; `#1` com o marcador `passagem` e ainda com responsável.
  9. Sessão C (`sessao-c-0003`) roda `ah open carrinho`: retomada com o ID `as-1`; marcador `retomada`.
  10. C faz merge e `ah close`: `#1` livre; `ah board` diz `Nenhuma frente aberta.`; `eventos.jsonl` contém, nesta ordem relativa, `abertura` (2), `recusa` com T4 e T1, `fechamento`, `tomada`, `passagem`, `retomada`, `fechamento`.
- [ ] **Passo 2:** Rodar `node --test teste/ciclo-duas-sessoes.test.mjs`. Esperado: passa. Se falhar, a correção vai na tarefa dona do comportamento, com teste unitário junto.
- [ ] **Passo 3:** Rodar `node --test teste/`. Esperado: passam.
- [ ] **Passo 4:** Varredura e commit: `test: ciclo com duas sessões simuladas`.

### Tarefa 16: Referência e modelos

**Arquivos:**
- Modificar: `docs/referencia/comandos.md`, `modelos/sessoes-paralelas.md`, `README.md`

- [ ] **Passo 1:** Em `comandos.md`: seções novas para `papel`, `handoff`, `takeover` e `sweep` (uso, o que faz, cada recusa com a saída, exemplo com o projeto `loja`); na de `open`, a reserva, a retomada (mesma máquina e outra), `--para`, `--caminhos` e as notas; na de `close`, a liberação dos tickets e a fila; na de `board`, as colunas e as sessões vivas; na de `gancho`, a herança na continuação, o sinal de vida e as travas T1, T3 e T4 com exemplos de recusa e de passagem. Em "Limites", acrescentar: a reserva é aviso e não trava atômica (dois `open` no mesmo segundo podem passar; o segundo descobre ao conferir e desiste); o T4 não avalia caminho relativo com pasta desconhecida nem caminho com variável; no Windows a hora de início do processo não é conferida; frente sem ticket só se retoma na mesma máquina; o `sweep --reparar` dá ID novo à frente reconstruída. Uma seção "Vida da sessão" com o prazo `sessoes.prazoDoSinalMin`.
- [ ] **Passo 2:** Em `modelos/sessoes-paralelas.md`, o ciclo com `handoff`, retomar pelo `open`, `takeover` com a ordem do executivo, `papel`, `sweep`, e as seis travas desta versão (T0 a T5, menos a T6, que é da fatia 3), ainda em até uma página.
- [ ] **Passo 3:** No `README.md`, o que a fatia 2 entrega e o que vem nas próximas.
- [ ] **Passo 4:** Rodar `node --test teste/` e `node ferramentas/varre-termos.mjs`. Esperado: passam; código 0.
- [ ] **Passo 5:** Commit: `docs: referência e modelos da fatia 2`. Não empurrar.

---

## Fora deste plano

`pesado` e T6 (fatia 3); adaptadores do Codex e do OpenCode, inclusive o caminho do arquivo dentro do patch do Codex para a T4 (fatia 4); extensões, `atualizar`, `deps`, `board --numeros` (fatia 5). Pendências da fatia 1 que esta fatia não toca: leitor de shell (`xargs git add`, apelidos, `push.default`, `sh -c` com posicionais), `nota` sem aspas, `--teste` do `init`, `.harness` como link, submódulos no `close`, `lerOpcoes` repetido.

## Autorrevisão

- **Cobertura da tabela 12.1, linha 2:** `handoff` (7), retomar pelo `open` (7 e 8), `takeover` (10), `sweep` (11), `papel` (3), `open --para` (9), sessão viva (1 e 2), herança na continuação (2), T1 e T3 (12), T4 (13), sobreposição (6), reserva (5). Da seção 6: fila de comentários pendentes (4), eventos de passagem e tomada (7, 10), recusas nos eventos (já na fatia 1; recusas de comando na 3). Da seção 11: retomar de outra máquina pelo marcador (8), reserva como aviso escrita na referência (16), escopo das travas (12 e 13), sem liberação para T4 de edição (13), continuação com vínculo (2), `--para` pelo id curto (9), sobreposição pelo diff e `--caminhos` (6). Da seção 14: duas sessões simuladas (15); recusa e passagem por trava, com formas disfarçadas (12 e 13).
- **Nomes entre tarefas:** `vidaDaSessao`, `estadoDaSessao`, `processoExiste`, `inicioDoProcesso`, `pidDoAgente`, `pidDeComando`, `descartarPidMorto`, `continuarSessao`, `listarFrentesTolerante`, `frentesDa`, `comentarOuEnfileirar`, `editarOuEnfileirar`, `reenviarPendentes`, `montarMarcador`, `lerMarcadores`, `reservar`, `marcarTickets`, `liberarTickets`, `acharPassagem`, `casaGlob`, `arquivosDaFrente`, `sobreposicoes`, `normalizarCaminho`, `dentroDe`, `resolverSessao` são definidos uma vez (tarefas 1, 2, 4, 5, 6, 8, 9, 11) e usados com a mesma assinatura depois. A única asserção que espera uma tarefa posterior (T4 no teste do foco 5, tarefa 10) fica marcada `todo` até a tarefa 13 e usados com a mesma assinatura depois.
- **Proporção:** dezesseis tarefas, a maior parte em interfaces e asserções; nenhum corpo de função transcrito.

## Comando de partida

Para colar numa sessão nova, aberta em `~/projetos/agent-harness`:

```
Execute o plano docs/superpowers/plans/2026-11-13-nucleo-fatia-2.md com a skill
superpowers:subagent-driven-development. Leia antes o desenho em
docs/superpowers/specs/2026-11-12-nucleo-design.md (a seção 12 prevalece) e as pendências da
fatia 1 em docs/superpowers/plans/2026-11-12-nucleo-fatias-0-e-1-pendencias.md. Trabalhe no ramo
dev, sem push e sem criar repositório remoto. Nenhum nome real do projeto de origem entra neste
repositório; rode node ferramentas/varre-termos.mjs antes de cada commit. A tarefa 14 tem um ensaio
com o Claude Code de verdade: pare e relate se ele mostrar que o pid do processo pai do gancho
nunca sobrevive à resposta.
```
