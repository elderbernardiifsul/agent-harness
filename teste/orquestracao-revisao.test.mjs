// Extensão orquestracao: ah pede-revisao, os arquivos do diff de um ramo que casam com os caminhos marcados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { projetoDeTeste } from '../nucleo/lib/extensoes-teste.mjs';
import { casaGlob } from '../nucleo/extensoes/orquestracao/extensao.mjs';

const B = { env: { AH_SESSAO: 'sessao-b-0002' } };
const ok = r => { assert.equal(r.codigo, 0, r.erro); return r; };

function novoProjeto(t, config = { revisao: ['src/pagamento/**', 'db/*.sql'] }) {
  const p = projetoDeTeste({ extensoes: { orquestracao: config } });
  t.after(() => p.limpar());
  return p;
}
// Abre a frente e commita os arquivos dados no worktree dela.
function frenteCom(p, nome, arquivos, opcoes = {}) {
  ok(p.ah(['open', nome], opcoes));
  const wt = p.frente(nome).worktree;
  for (const a of arquivos) {
    fs.mkdirSync(path.dirname(path.join(wt, a)), { recursive: true });
    fs.writeFileSync(path.join(wt, a), `${a}\n`);
  }
  assert.equal(p.git(['add', '-A'], { cwd: wt }).codigo, 0);
  assert.equal(p.git(['commit', '-q', '-m', nome], { cwd: wt }).codigo, 0);
}

test('casaGlob: ** atravessa pastas; * e ? não', () => {
  assert.equal(casaGlob('src/pagamento/a/b.js', 'src/pagamento/**'), true);
  assert.equal(casaGlob('src/pagamentos.js', 'src/pagamento/**'), false);
  assert.equal(casaGlob('db/x.sql', '*.sql'), false);
  assert.equal(casaGlob('db/x.sql', 'db/*.sql'), true);
  assert.equal(casaGlob('db/a/x.sql', 'db/*.sql'), false);
  assert.equal(casaGlob('src/a.js', 'src/?.js'), true);
  assert.equal(casaGlob('src/ab.js', 'src/?.js'), false);
  assert.equal(casaGlob('docs/a+b(1).md', 'docs/a+b(1).md'), true);
});

test('ramo que toca caminho marcado pede revisão e diz quais arquivos', t => {
  const p = novoProjeto(t);
  frenteCom(p, 'cartao', ['src/pagamento/cartao.js', 'docs/cartao.md', 'db/0003_cartao.sql']);
  const r = ok(p.ah(['pede-revisao', 'feat/cartao']));
  assert.equal(r.saida, 'feat/cartao pede revisão: toca db/0003_cartao.sql, src/pagamento/cartao.js (extensoes.orquestracao.revisao).\n');
  assert.deepEqual(JSON.parse(ok(p.ah(['pede-revisao', 'feat/cartao', '--json'])).saida),
    { ramo: 'feat/cartao', base: 'dev', pede: true, arquivos: ['db/0003_cartao.sql', 'src/pagamento/cartao.js'] });
});

test('ramo só de docs não pede; sem caminhos configurados, nunca pede', t => {
  const p = novoProjeto(t);
  frenteCom(p, 'ajuda', ['docs/ajuda.md']);
  assert.equal(ok(p.ah(['pede-revisao', 'feat/ajuda'])).saida, 'feat/ajuda não pede revisão: nenhum arquivo do diff casa com extensoes.orquestracao.revisao.\n');
  const q = novoProjeto(t, true);
  frenteCom(q, 'cartao', ['src/pagamento/cartao.js']);
  assert.match(ok(q.ah(['pede-revisao', 'feat/cartao'])).saida, /não pede revisão \(extensoes\.orquestracao\.revisao está vazia\)/);
});

test('ramo inexistente ou sem argumento recusa', t => {
  const p = novoProjeto(t);
  const r = p.ah(['pede-revisao', 'feat/nada']);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /Faça: confira o nome com git branch/);
  assert.equal(p.ah(['pede-revisao']).codigo, 1);
});

test('nome com acento, arquivo movido para fora e padrão com barra final ainda pedem revisão', t => {
  const p = novoProjeto(t, { revisao: ['src/pagamento/'] });
  frenteCom(p, 'acento', ['src/pagamento/cartão.js']);
  assert.deepEqual(JSON.parse(ok(p.ah(['pede-revisao', 'feat/acento', '--json'])).saida).arquivos, ['src/pagamento/cartão.js']);
  const q = novoProjeto(t);
  fs.mkdirSync(path.join(q.raiz, 'src', 'pagamento'), { recursive: true });
  fs.writeFileSync(path.join(q.raiz, 'src', 'pagamento', 'boleto.js'), 'boleto\n');
  assert.equal(q.git(['add', '-A']).codigo, 0);
  assert.equal(q.git(['commit', '-q', '-m', 'boleto']).codigo, 0);
  ok(q.ah(['open', 'mover']));
  const wt = q.frente('mover').worktree;
  assert.equal(q.git(['mv', 'src/pagamento/boleto.js', 'src/boleto.js'], { cwd: wt }).codigo, 0);
  assert.equal(q.git(['commit', '-q', '-m', 'move'], { cwd: wt }).codigo, 0);
  assert.deepEqual(JSON.parse(ok(q.ah(['pede-revisao', 'feat/mover', '--json'])).saida).arquivos, ['src/pagamento/boleto.js']);
});

test('padrão com ./ ou / no começo não carrega', async () => {
  const { carregarParaTeste } = await import('../nucleo/lib/extensoes-teste.mjs');
  const arquivo = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'nucleo', 'extensoes', 'orquestracao', 'extensao.mjs');
  await assert.rejects(() => carregarParaTeste(arquivo, { revisao: ['./src/**'] }), /relativo à raiz/);
  await assert.rejects(() => carregarParaTeste(arquivo, { revisao: ['/src/**'] }), /relativo à raiz/);
});
