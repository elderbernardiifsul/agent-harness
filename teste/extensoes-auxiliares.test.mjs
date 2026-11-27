import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { carregarParaTeste, ctxFalso, projetoDeTeste } from '../nucleo/lib/extensoes-teste.mjs';

const RECURSOS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'nucleo', 'extensoes', 'recursos', 'extensao.mjs');

test('carregarParaTeste confere forma e configuração como o núcleo', async () => {
  const def = await carregarParaTeste(RECURSOS, { tipos: ['porta'] });
  assert.equal(def.versaoDaInterface, 1);
  await assert.rejects(carregarParaTeste(RECURSOS, { tipos: 'porta' }), /o núcleo recusaria a configuração: tipos deve ser uma lista/);
});

test('ctxFalso guarda o que a extensão escreveu e gravou, sem disco', async () => {
  const def = await carregarParaTeste(RECURSOS);
  const carrinho = { id: 'as-1', nome: 'carrinho', estado: 'ativa' };
  const frete = { id: 'as-2', nome: 'frete', estado: 'ativa', extensoes: { recursos: { itens: [{ tipo: 'porta', valor: '3002' }] } } };
  const ctx = ctxFalso({ extensao: 'recursos', frente: carrinho, frentes: [frete] });
  await def.comandos.recursos.executar(['reservar', 'porta', '3001'], ctx);
  assert.deepEqual(ctx.saida, ['Reservado: porta 3001 para a frente as-1 carrinho.\n']);
  assert.deepEqual(ctx.gravados.map(g => [g.frente, g.secao.itens.map(i => i.valor)]), [['carrinho', ['3001']]]);
  await assert.rejects(def.comandos.recursos.executar(['reservar', 'porta', '3002'], ctx), e => e instanceof ctx.ErroDeUso && /frente as-2 frete/.test(e.saida));
  assert.equal(ctx.gravados.length, 1);
  assert.throws(() => { ctx.frente.nome = 'x'; }, TypeError);
});

test('ctxFalso responde ctx.sessao pela opção sessoes', () => {
  const ctx = ctxFalso({ sessoes: { 'sessao-b-0002': { id: 'sessao-b-0002', modelo: 'leve-1' } } });
  assert.equal(ctx.sessao('sessao-b-0002').modelo, 'leve-1');
  assert.ok(Object.isFrozen(ctx.sessao('sessao-b-0002')));
  assert.equal(ctx.sessao('outra'), null);
  assert.equal(ctxFalso().sessao('sessao-teste-0001'), null);
});

test('projetoDeTeste: projeto descartável com o núcleo, a extensão ligada, o despacho e o gancho', t => {
  const p = projetoDeTeste({ extensoes: { recursos: true } });
  t.after(() => p.limpar());
  assert.equal(p.ah(['open', 'carrinho']).codigo, 0);
  const r = p.ah(['recursos', 'reservar', 'porta', '3001']);
  assert.equal(r.codigo, 0, r.erro);
  assert.deepEqual(p.frente('carrinho').extensoes.recursos.itens.map(i => i.valor), ['3001']);
  const g = p.gancho('git push origin main');
  assert.equal(g.recusada, true);
  assert.match(g.mensagem, /^Recusado \(T5\)/);
  assert.equal(p.gancho('ls').recusada, false);
  assert.equal(p.git(['status', '--porcelain']).saida, '');
  const raiz = p.raiz;
  p.limpar();
  assert.equal(fs.existsSync(raiz), false);
});
