import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { amb as ambDoTeste, criarProjeto, dirDoTeste, envelhecerSinal, outraMaquina } from './apoio/repo.mjs';
import { tratar } from '../nucleo/adaptadores/contrato.mjs';
import { esquecerExtensoes } from '../nucleo/lib/extensoes.mjs';
import { corpoDoDiario, devolverDiario, lerMarcador } from '../nucleo/extensoes/registros/diario.mjs';

const PLANO = 'docs/superpowers/plans/2026-11-20-carrinho.md';
const DIARIO = `# SDD ledger — plan: ${PLANO}
Task 1: complete (commits a1b2c3d..e4f5a6b, review clean)
Task 2: fix round 1/5 (1 addressed, 0 open — nome; commits e4f5a6b..0c1d2e3)
`;
const B = { env: { AH_SESSAO: 'sessao-b-0002' } };
const ok = r => { assert.equal(r.codigo, 0, r.erro); return r; };
const lerFrente = (p, nome) => JSON.parse(fs.readFileSync(path.join(dirDoTeste(p), 'frentes', `${nome}.json`), 'utf8'));
const copia = (p, id, pasta) => path.join(dirDoTeste(p), 'registros', id, pasta);
const comentariosDoRegistro = (p, n) => p.ghTicket(n).comments.filter(c => lerMarcador(c.body));

// Projeto com a extensão registros ligada e o ticket 7 no gh falso.
function projeto(t) {
  const p = criarProjeto();
  t.after(() => p.limpar());
  const arquivo = path.join(p.raiz, '.harness', 'config.json');
  const c = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  c.extensoes = { registros: true };
  fs.writeFileSync(arquivo, JSON.stringify(c, null, 2));
  for (const args of [['add', '--', '.harness/config.json'], ['commit', '-q', '-m', 'liga registros']]) assert.equal(p.git(args).codigo, 0);
  p.ghSemear(7, {});
  return p;
}
// Frente aberta com um commit e mesclada na dev, pronta para o close; o diário escrito como o sdd-workspace faria.
function frenteComDiario(p, { nome = 'carrinho', tickets = ['--tickets', '7'], planos = { carrinho: DIARIO }, opcoes = {} } = {}) {
  ok(p.ah(['open', nome, ...tickets], opcoes));
  const wt = lerFrente(p, nome).worktree;
  fs.writeFileSync(path.join(wt, 'a.txt'), 'a');
  p.git(['add', 'a.txt'], { cwd: wt });
  p.git(['commit', '-q', '-m', 'feat: a'], { cwd: wt });
  ok({ ...p.git(['merge', '-q', '--no-ff', `feat/${nome}`, '-m', 'merge']), erro: 'merge' });
  for (const [pasta, texto] of Object.entries(planos)) {
    devolverDiario(wt, { pasta, plano: texto.split('\n')[0].replace('# SDD ledger — plan: ', ''), texto });
  }
  return wt;
}

test('guardar comenta o diário no ticket, guarda a cópia, tira a pasta, e o close passa sem --descartar-ignorados', t => {
  const p = projeto(t);
  const wt = frenteComDiario(p);
  const r = ok(p.ah(['registros', 'guardar']));
  assert.match(r.saida, /^Diário de 1 plano guardado em .*registros\/as-1; comentado em #7\.$/m);
  const [c] = comentariosDoRegistro(p, 7);
  assert.deepEqual({ ...lerMarcador(c.body), commit: 'x' }, { id: 'as-1', nome: 'carrinho', pasta: 'carrinho', plano: PLANO, commit: 'x', cortado: false });
  assert.ok(c.body.includes('Task 1: complete (commits a1b2c3d..e4f5a6b, review clean)'));
  assert.equal(fs.readFileSync(path.join(copia(p, 'as-1', 'carrinho'), 'progress.md'), 'utf8'), DIARIO);
  const meta = JSON.parse(fs.readFileSync(path.join(copia(p, 'as-1', 'carrinho'), 'meta.json'), 'utf8'));
  assert.deepEqual([meta.id, meta.pasta, meta.plano, meta.tickets], ['as-1', 'carrinho', PLANO, { 7: 'comentado' }]);
  assert.ok(!fs.existsSync(path.join(wt, '.superpowers')));
  // Rodar de novo sem diário não comenta de novo.
  assert.match(ok(p.ah(['registros', 'guardar'])).saida, /^Nenhum diário em .*\.superpowers\/sdd\/\.$/m);
  assert.equal(comentariosDoRegistro(p, 7).length, 1);
  ok(p.ah(['close']));
});

test('sem o guardar, o close recusa apontando o comando da extensão', t => {
  const p = projeto(t);
  frenteComDiario(p);
  const r = p.ah(['close']);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /itens ignorados que a extensão registros guarda \(\d+\); saída: tools\/ah registros guardar --frente carrinho e repita ah close/);
  assert.doesNotMatch(r.erro, /itens ignorados no worktree/);
});

test('dois planos: dois comentários e duas cópias', t => {
  const p = projeto(t);
  frenteComDiario(p, { planos: { carrinho: DIARIO, frete: '# SDD ledger — plan: docs/frete.md\nTask 1: complete (commits 1111111..2222222, review clean)\n' } });
  assert.match(ok(p.ah(['registros', 'guardar'])).saida, /Diário de 2 planos guardado/);
  assert.deepEqual(comentariosDoRegistro(p, 7).map(c => lerMarcador(c.body).pasta), ['carrinho', 'frete']);
  for (const pasta of ['carrinho', 'frete']) assert.ok(fs.existsSync(path.join(copia(p, 'as-1', pasta), 'progress.md')));
});

test('frente sem ticket: só a cópia, com o aviso', t => {
  const p = projeto(t);
  frenteComDiario(p, { tickets: [] });
  const r = ok(p.ah(['registros', 'guardar']));
  assert.match(r.erro, /Aviso: a frente as-1 não tem ticket: o diário ficou só nesta máquina \(.*registros\/as-1\)\./);
  assert.ok(fs.existsSync(path.join(copia(p, 'as-1', 'carrinho'), 'progress.md')));
});

test('sem rede: a cópia vale como guarda, a pasta sai e o ticket fica pendente', t => {
  const p = projeto(t);
  const wt = frenteComDiario(p);
  const r = ok(p.ah(['registros', 'guardar'], { env: { GH_FALSO_FORA: '1' } }));
  assert.match(r.erro, /Aviso: não consegui comentar em #7 \(.*\); a cópia está em .*registros\/as-1, e o ah close comenta antes de fechar\./);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(copia(p, 'as-1', 'carrinho'), 'meta.json'), 'utf8')).tickets, { 7: 'pendente' });
  assert.ok(!fs.existsSync(path.join(wt, '.superpowers')));
});

test('arquivo do aluno em .superpowers/sdd/: fica, com o aviso, e o close recusa como sempre', t => {
  const p = projeto(t);
  const wt = frenteComDiario(p);
  fs.writeFileSync(path.join(wt, '.superpowers', 'sdd', 'minhas-notas.txt'), 'notas');
  const r = ok(p.ah(['registros', 'guardar']));
  assert.match(r.erro, /Aviso: deixei no worktree o que não é do subagent-driven-development: \.superpowers\/sdd\/minhas-notas\.txt/);
  assert.ok(fs.existsSync(path.join(wt, '.superpowers', 'sdd', 'minhas-notas.txt')));
  assert.ok(!fs.existsSync(path.join(wt, '.superpowers', 'sdd', 'carrinho')));
  assert.equal(p.ah(['close']).codigo, 1);
});

test('--frente: recusa a frente ativa de outra sessão viva; guarda a passada', t => {
  const p = projeto(t);
  ok(p.ah(['open', 'carrinho']));
  frenteComDiario(p, { nome: 'frete', tickets: [], opcoes: B });
  const r = p.ah(['registros', 'guardar', '--frente', 'frete']);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /^Recusado: A frente as-2 frete é da sessão sessao-b-0002, que está viva\.\nFaça: peça à sessão dona \(sessao-b-0002\) que rode tools\/ah registros guardar; com a sessão morta \(frente órfã\) ou a frente passada, o --frente vale\n$/);
  envelhecerSinal(p, 'sessao-b-0002', 24 * 60);
  ok(p.ah(['registros', 'guardar', '--frente', 'frete']));
  assert.ok(fs.existsSync(path.join(copia(p, 'as-2', 'carrinho'), 'progress.md')));
});

test('sem frente e sem --frente, e subcomando errado: recusa com o próximo passo', t => {
  const p = projeto(t);
  const r = p.ah(['registros', 'guardar']);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /^Recusado: Esta sessão não tem frente\.\nFaça: abra uma com ah open <nome>, ou diga qual com --frente <nome>\n$/);
  for (const args of [[], ['mostrar'], ['guardar', '--x'], ['guardar', '--frente']]) {
    const e = p.ah(['registros', ...args]);
    assert.equal(e.codigo, 1, args.join(' '));
    assert.match(e.erro, /Faça: .*ah registros guardar/, args.join(' '));
  }
  assert.equal(p.ah(['registros', 'guardar', '--frente', 'sumida']).codigo, 1);
});

test('handoff comenta o diário e guarda a cópia, mas a pasta continua no worktree', t => {
  const p = projeto(t);
  const wt = frenteComDiario(p);
  ok(p.ah(['handoff']));
  assert.equal(comentariosDoRegistro(p, 7).length, 1);
  assert.ok(fs.existsSync(path.join(copia(p, 'as-1', 'carrinho'), 'progress.md')));
  assert.ok(fs.existsSync(path.join(wt, '.superpowers', 'sdd', 'carrinho', 'progress.md')));
});

// ---------------------------------------------------------------- retomada, fechamento e resumo (Tarefa 6)

const FRETE = '# SDD ledger — plan: docs/frete.md\nTask 1: complete (commits 1111111..2222222, review clean)\n';
const resumosNoTicket = (p, n) => p.ghTicket(n).comments.filter(c => c.body.startsWith('<!-- ah:registro-resumo '));
const diarioNoWt = (wt, pasta) => path.join(wt, '.superpowers', 'sdd', pasta);

test('retomada em outra máquina devolve o diário dos dois planos a partir do ticket', t => {
  const p = projeto(t);
  frenteComDiario(p, { planos: { carrinho: DIARIO, frete: FRETE } });
  ok(p.ah(['handoff']));
  const q = outraMaquina(p, { sessao: 'sessao-c-0003', login: 'carla-dias', sigla: 'cd' });
  t.after(() => q.limpar());
  const r = ok(q.ah(['open', 'carrinho']));
  assert.match(r.saida, /^Registros: devolvi o diário de 2 planos a .*\.superpowers\/sdd\/ \(do ticket\)\.$/m);
  const wt = JSON.parse(fs.readFileSync(path.join(dirDoTeste(q), 'frentes', 'carrinho.json'), 'utf8')).worktree;
  assert.equal(fs.readFileSync(path.join(diarioNoWt(wt, 'carrinho'), 'progress.md'), 'utf8'), DIARIO);
  assert.equal(fs.readFileSync(path.join(diarioNoWt(wt, 'carrinho'), 'plan-path'), 'utf8'), `${PLANO}\n`);
  assert.equal(fs.readFileSync(path.join(diarioNoWt(wt, 'frete'), 'progress.md'), 'utf8'), FRETE);
  assert.equal(fs.readFileSync(path.join(wt, '.superpowers', 'sdd', '.gitignore'), 'utf8'), '*\n');
  assert.equal(q.git(['status', '--porcelain'], { cwd: wt }).saida, '');
});

test('retomada com o diário ainda no worktree não mexe nele', t => {
  const p = projeto(t);
  const wt = frenteComDiario(p);
  ok(p.ah(['handoff']));
  fs.appendFileSync(path.join(diarioNoWt(wt, 'carrinho'), 'progress.md'), 'Task 3: fix round 1/5 (depois do handoff)\n');
  const r = ok(p.ah(['open', 'carrinho']));
  assert.doesNotMatch(r.saida, /Registros: devolvi/);
  assert.match(fs.readFileSync(path.join(diarioNoWt(wt, 'carrinho'), 'progress.md'), 'utf8'), /depois do handoff/);
});

test('retomada com o diário cortado no ticket não devolve e avisa', t => {
  const p = projeto(t);
  frenteComDiario(p, { planos: {} });
  ok(p.ah(['handoff']));
  const grande = `# SDD ledger — plan: ${PLANO}\n${'Task 1: fix round 1/5 (texto)\n'.repeat(3000)}`;
  const { corpo } = corpoDoDiario({ frente: { id: 'as-1', nome: 'carrinho' }, diario: { pasta: 'carrinho', plano: PLANO, texto: grande }, commit: 'abc1234' });
  p.ghSemear(7, { comments: [...p.ghTicket(7).comments, { author: 'ana-souza', body: corpo }] });
  const q = outraMaquina(p, { sessao: 'sessao-c-0003', login: 'carla-dias', sigla: 'cd' });
  t.after(() => q.limpar());
  const r = ok(q.ah(['open', 'carrinho']));
  assert.match(r.erro, /Aviso: o diário do plano carrinho no ticket #7 está cortado; não o devolvi \(o inteiro ficou na máquina que guardou\)\./);
  const wt = JSON.parse(fs.readFileSync(path.join(dirDoTeste(q), 'frentes', 'carrinho.json'), 'utf8')).worktree;
  assert.ok(!fs.existsSync(diarioNoWt(wt, 'carrinho')));
});

test('fechamento: o close comenta o resumo a partir da cópia e a apaga', t => {
  const p = projeto(t);
  frenteComDiario(p);
  ok(p.ah(['registros', 'guardar']));
  const r = ok(p.ah(['close']));
  assert.match(r.saida, /^Registros: resumo da execução comentado em #7\.$/m);
  const [resumo] = resumosNoTicket(p, 7);
  assert.match(resumo.body, /1 tarefa concluída \(Task 1 a1b2c3d\.\.e4f5a6b, review clean\), 1 parada \(Task 2: fix round 1\/5/);
  assert.ok(!fs.existsSync(path.join(dirDoTeste(p), 'registros', 'as-1')));
});

test('fechamento com ticket pendente: o close comenta o diário antes do resumo', t => {
  const p = projeto(t);
  frenteComDiario(p);
  ok(p.ah(['registros', 'guardar'], { env: { GH_FALSO_FORA: '1' } }));
  assert.equal(comentariosDoRegistro(p, 7).length, 0);
  ok(p.ah(['close']));
  const corpos = p.ghTicket(7).comments.map(c => c.body);
  const iDiario = corpos.findIndex(b => lerMarcador(b));
  const iResumo = corpos.findIndex(b => b.startsWith('<!-- ah:registro-resumo '));
  assert.ok(iDiario >= 0 && iResumo > iDiario, JSON.stringify([iDiario, iResumo]));
});

test('fechamento sem ticket: o resumo sai na saída do close e a cópia fica', t => {
  const p = projeto(t);
  frenteComDiario(p, { tickets: [] });
  ok(p.ah(['registros', 'guardar']));
  const r = ok(p.ah(['close']));
  assert.match(r.saida, /Resumo da execução por subagentes\*\* da frente as-1 carrinho/);
  assert.match(r.saida, /^Registros: a cópia do diário fica em .*registros\/as-1\.$/m);
  assert.ok(fs.existsSync(path.join(dirDoTeste(p), 'registros', 'as-1', 'carrinho', 'progress.md')));
});

test('fechamento sem cópia: diz que não há registro e não comenta', t => {
  const p = projeto(t);
  frenteComDiario(p, { planos: {} });
  const r = ok(p.ah(['close']));
  assert.match(r.saida, /^Registros: nenhum diário guardado para a frente as-1\.$/m);
  assert.equal(resumosNoTicket(p, 7).length, 0);
});

test('fechamento com o gh fora do ar: o close termina, mostra o resumo e mantém a cópia', t => {
  const p = projeto(t);
  frenteComDiario(p);
  ok(p.ah(['registros', 'guardar']));
  // Sem rede, o núcleo põe o comentário de fechamento na fila e fecha; a extensão só avisa.
  const r = ok(p.ah(['close'], { env: { GH_FALSO_FORA: '1' } }));
  assert.match(r.erro, /Aviso: não consegui comentar o resumo em #7 \(sem rede\); a cópia fica em .*registros\/as-1\./);
  assert.match(r.saida, /Resumo da execução por subagentes\*\* da frente as-1 carrinho/);
  assert.ok(fs.existsSync(path.join(dirDoTeste(p), 'registros', 'as-1', 'carrinho', 'progress.md')));
  assert.equal(resumosNoTicket(p, 7).length, 0);
});

test('começo de sessão: lembra o guardar quando o worktree tem diário não guardado', async t => {
  const p = projeto(t);
  frenteComDiario(p);
  const inicio = async () => {
    esquecerExtensoes();
    return (await tratar({ tipo: 'inicio', sessao: 'sessao-teste-0001', agente: 'claude-code', cwd: p.raiz, origem: 'novo' }, ambDoTeste(p))).contexto;
  };
  assert.match(await inicio(), /^Registros: o worktree da frente tem diário não guardado \(1 plano\); rode tools\/ah registros guardar antes do ah close\.$/m);
  ok(p.ah(['handoff']));
  ok(p.ah(['open', 'carrinho']));
  // Guardado pelo handoff e igual à cópia: sem linha.
  assert.doesNotMatch(await inicio(), /^Registros:/m);
});
