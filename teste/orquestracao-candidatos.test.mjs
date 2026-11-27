// Extensão orquestracao: ah candidatos, os tickets prontos para começar (livres, com o rótulo de pronto e sem a
// marca de decisão pendente).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { criarProjeto } from './apoio/repo.mjs';
import { carregarParaTeste } from '../nucleo/lib/extensoes-teste.mjs';

const EXTENSAO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'nucleo', 'extensoes', 'orquestracao', 'extensao.mjs');
const PRONTO = 'ready-for-agent';
const ok = r => { assert.equal(r.codigo, 0, r.erro); return r; };

// #12 e #13 prontos e livres; #14 pronto com "a decidir" num comentário; #15 pronto e bloqueado pela 12;
// #16 pronto e com frente; #17 livre e sem o rótulo.
const TICKETS = {
  12: { title: 'Total do carrinho', labels: [PRONTO] },
  13: { title: 'Carrinho vazio', labels: [PRONTO] },
  14: { title: 'Frete por região', labels: [PRONTO], comments: [{ author: 'carla', body: 'Antes de começar: a decidir se o frete grátis vale para o Norte.' }] },
  15: { title: 'Cupom no checkout', labels: [PRONTO], blockedBy: [12] },
  16: { title: 'Revisão do layout', labels: [PRONTO] },
  17: { title: 'Página de ajuda' },
};

// Projeto com a extensão ligada (`config`: true ou a seção dela) e os tickets no gh falso.
function projeto(t, { config = true, tickets = TICKETS } = {}) {
  const p = criarProjeto();
  t.after(() => p.limpar());
  fs.writeFileSync(p.env.GH_FALSO_TICKETS, JSON.stringify(tickets));
  const arquivo = path.join(p.raiz, '.harness', 'config.json');
  const c = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  c.extensoes = { orquestracao: config };
  fs.writeFileSync(arquivo, JSON.stringify(c, null, 2));
  for (const args of [['add', '--', '.harness/config.json'], ['commit', '-q', '-m', 'liga orquestracao']]) assert.equal(p.git(args).codigo, 0);
  return p;
}

test('candidatos: os prontos e livres, sem a marca; o resto em Fora com o motivo', t => {
  const p = projeto(t);
  ok(p.ah(['open', 'layout', '--tickets', '16']));
  const r = ok(p.ah(['candidatos']));
  assert.match(r.saida, /^Candidatos \(rótulo ready-for-agent, sem "A decidir"\):\n#13 Carrinho vazio\n#12 Total do carrinho\n/);
  assert.match(r.saida, /^#14 Frete por região: "A decidir" num comentário de carla$/m);
  assert.match(r.saida, /^#15 Cupom no checkout: bloqueada$/m);
  assert.match(r.saida, /^#16 Revisão do layout: com frente as-1$/m);
  assert.match(r.saida, /^#17 Página de ajuda: sem o rótulo ready-for-agent$/m);
  const j = JSON.parse(ok(p.ah(['candidatos', '--json'])).saida);
  assert.deepEqual(j.candidatos.map(c => c.numero), [13, 12]);
  assert.deepEqual(j.fora.map(f => [f.numero, f.motivo]), [
    [17, 'sem o rótulo ready-for-agent'], [16, 'com frente as-1'], [15, 'bloqueada'], [14, '"A decidir" num comentário de carla']]);
  assert.equal(j.pronto, PRONTO);
  assert.equal(j.pendencia, 'A decidir');
  assert.equal(j.deCache, false);
});

test('a marca no corpo também tira, e a marca configurada vale', t => {
  const tickets = { 12: { title: 'Total do carrinho', labels: [PRONTO], body: 'PENDENTE: o arredondamento.' }, 13: { title: 'Carrinho vazio', labels: [PRONTO] } };
  const p = projeto(t, { config: { pendencia: 'Pendente' }, tickets });
  const j = JSON.parse(ok(p.ah(['candidatos', '--json'])).saida);
  assert.deepEqual(j.candidatos.map(c => c.numero), [13]);
  assert.deepEqual(j.fora, [{ numero: 12, titulo: 'Total do carrinho', motivo: '"Pendente" no corpo' }]);
});

test('o rótulo de pronto configurado vale', t => {
  const tickets = { 12: { title: 'Total do carrinho', labels: ['pronto-para-agente'] }, 13: { title: 'Carrinho vazio', labels: [PRONTO] } };
  const p = projeto(t, { config: { pronto: 'pronto-para-agente' }, tickets });
  const j = JSON.parse(ok(p.ah(['candidatos', '--json'])).saida);
  assert.deepEqual(j.candidatos.map(c => c.numero), [12]);
});

test('nenhum candidato', t => {
  const p = projeto(t, { tickets: { 17: { title: 'Página de ajuda' } } });
  assert.match(ok(p.ah(['candidatos'])).saida, /^Nenhum candidato\.$/m);
});

test('sem GitHub recusa com o próximo passo, sem inventar candidato', t => {
  const p = projeto(t);
  const r = p.ah(['candidatos'], { env: { GH_FALSO_FORA: '1' } });
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /^Recusado: /m);
  assert.match(r.erro, /Faça: \S/);
  assert.doesNotMatch(r.saida, /#1[23]/);
});

test('configuração inválida não carrega', async () => {
  await assert.rejects(() => carregarParaTeste(EXTENSAO, { pronto: '' }), /pronto/);
  await assert.rejects(() => carregarParaTeste(EXTENSAO, { revisao: 'src/**' }), /revisao/);
  await assert.rejects(() => carregarParaTeste(EXTENSAO, { rotulo: 'x' }), /campo desconhecido/);
  await carregarParaTeste(EXTENSAO, { pronto: 'pronto', pendencia: 'Pendente', revisao: ['src/pagamento/**'] });
});
