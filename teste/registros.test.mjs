import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { criarProjeto, dirDoTeste, envelhecerSinal } from './apoio/repo.mjs';
import { devolverDiario, lerMarcador } from '../nucleo/extensoes/registros/diario.mjs';

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
