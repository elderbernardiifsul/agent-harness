// Extensão prova: grava a árvore testada depois que o teste passa e confere a árvore de um ramo (0 ou 3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { projetoDeTeste } from '../nucleo/lib/extensoes-teste.mjs';

const PASSA = ['node', '-e', 'process.exit(0)'];

function novoProjeto(t, config = { comandos: { unit: PASSA } }) {
  const p = projetoDeTeste({ extensoes: { prova: config } });
  t.after(() => p.limpar());
  return p;
}
const ok = r => { assert.equal(r.codigo, 0, r.erro); return r; };
const provasDuraveis = p => {
  const arq = path.join(p.dirEstado, 'extensoes', 'prova', 'provas.jsonl');
  return fs.existsSync(arq) ? fs.readFileSync(arq, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
};

// Abre a frente carrinho com um commit no worktree; devolve o caminho do worktree.
function frenteComCommit(p) {
  ok(p.ah(['open', 'carrinho']));
  const wt = p.frente('carrinho').worktree;
  fs.writeFileSync(path.join(wt, 'carrinho.txt'), 'itens\n');
  assert.equal(p.git(['add', 'carrinho.txt'], { cwd: wt }).codigo, 0);
  assert.equal(p.git(['commit', '-q', '-m', 'carrinho'], { cwd: wt }).codigo, 0);
  return wt;
}

test('grava a árvore do worktree depois do teste que passa', t => {
  const p = novoProjeto(t);
  const wt = frenteComCommit(p);
  const r = ok(p.ah(['prova', 'unit']));
  assert.match(r.saida, /^Prova gravada: unit na frente as-1 carrinho, árvore [0-9a-f]{7}/m);
  const arvore = p.git(['rev-parse', 'HEAD^{tree}'], { cwd: wt }).saida.trim();
  const [prova] = p.frente('carrinho').extensoes.prova.provas;
  assert.equal(prova.arvore, arvore);
  assert.equal(prova.rotulo, 'unit');
  assert.deepEqual(prova.comando, PASSA);
  const duraveis = provasDuraveis(p);
  assert.equal(duraveis.length, 1);
  assert.equal(duraveis[0].frente, 'carrinho');
  assert.equal(duraveis[0].arvore, arvore);
});

test('teste que falha não grava e devolve o código do teste', t => {
  const p = novoProjeto(t);
  frenteComCommit(p);
  const r = p.ah(['prova', 'unit', '--', 'node', '-e', 'process.exit(4)']);
  assert.equal(r.codigo, 4);
  assert.match(r.saida, /O teste unit falhou \(código 4\): nada gravado\./);
  assert.equal(p.frente('carrinho').extensoes?.prova, undefined);
  assert.equal(provasDuraveis(p).length, 0);
});

test('worktree sujo recusa antes de rodar o teste', t => {
  const p = novoProjeto(t);
  const wt = frenteComCommit(p);
  fs.writeFileSync(path.join(wt, 'carrinho.txt'), 'mudou\n');
  const marca = path.join(wt, 'rodou');
  const r = p.ah(['prova', 'unit', '--', 'node', '-e', `require('fs').writeFileSync(${JSON.stringify(marca)}, '')`]);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /mudança fora do commit \(carrinho\.txt\)/);
  assert.equal(fs.existsSync(marca), false);
});

test('arquivo não rastreado recusa: o teste usaria o que a árvore não tem', t => {
  const p = novoProjeto(t);
  const wt = frenteComCommit(p);
  fs.writeFileSync(path.join(wt, 'modulo.js'), 'export default 1;\n');
  const r = p.ah(['prova', 'unit']);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /mudança fora do commit \(modulo\.js\)/);
  assert.match(r.erro, /Faça: commite, ponha no \.gitignore o que é gerado, ou desfaça/);
  assert.equal(p.frente('carrinho').extensoes?.prova, undefined);
});

test('o comando da configuração roda sem shell, mesmo com um elemento só', t => {
  const p = novoProjeto(t, { comandos: { unit: ['exit 0'] } });
  frenteComCommit(p);
  const r = p.ah(['prova', 'unit']);
  assert.notEqual(r.codigo, 0);
  assert.match(r.saida, /O teste unit falhou/);
});

test('teste que muda arquivo rastreado não grava', t => {
  const p = novoProjeto(t);
  const wt = frenteComCommit(p);
  const alvo = path.join(wt, 'carrinho.txt');
  const r = p.ah(['prova', 'unit', '--', 'node', '-e', `require('fs').writeFileSync(${JSON.stringify(alvo)}, 'outro\\n')`]);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /a árvore mudou durante o teste/);
  assert.equal(p.frente('carrinho').extensoes?.prova, undefined);
});

test('confere: 0 no ramo e no merge --no-ff na base parada, 3 com a base andada, 1 com ref inválida; sobrevive ao close', t => {
  const p = novoProjeto(t);
  frenteComCommit(p);
  ok(p.ah(['prova', 'unit']));
  const c1 = ok(p.ah(['prova', '--confere', 'feat/carrinho']));
  assert.match(c1.saida, /provada pela frente as-1 carrinho \(unit/);
  assert.equal(p.git(['merge', '--no-ff', '-q', '-m', 'merge carrinho', 'feat/carrinho']).codigo, 0);
  ok(p.ah(['prova', '--confere', 'dev']));
  assert.equal(ok(p.ah(['prova', '--confere', 'dev', 'unit'])).codigo, 0);
  assert.equal(p.ah(['prova', '--confere', 'dev', 'e2e']).codigo, 3, 'outro rótulo não conta');
  const merge = p.git(['rev-parse', 'dev']).saida.trim();
  ok(p.ah(['close']));
  ok(p.ah(['prova', '--confere', merge]));
  fs.writeFileSync(path.join(p.raiz, 'outro.txt'), 'x\n');
  assert.equal(p.git(['add', 'outro.txt']).codigo, 0);
  assert.equal(p.git(['commit', '-q', '-m', 'outro']).codigo, 0);
  const c3 = p.ah(['prova', '--confere', 'dev']);
  assert.equal(c3.codigo, 3);
  assert.match(c3.saida, /nenhuma prova/);
  assert.equal(p.ah(['prova', '--confere', 'nada-disso']).codigo, 1);
});

test('sem comando para o rótulo recusa e aponta prova.comandos', t => {
  const p = novoProjeto(t, true);
  frenteComCommit(p);
  const r = p.ah(['prova', 'e2e']);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /Faça: .*extensoes\.prova\.comandos/);
});

test('coluna PROVA no quadro', t => {
  const p = novoProjeto(t);
  frenteComCommit(p);
  ok(p.ah(['prova', 'unit']));
  assert.match(ok(p.ah(['board'])).saida, /unit [0-9a-f]{7}/);
});
