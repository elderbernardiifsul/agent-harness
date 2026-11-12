import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  siglaValida, siglaDeLogin, nomeValido, idsNoHistorico, proximoId, novaFrente, linhaDoHistorico,
} from '../nucleo/lib/frente.mjs';

test('siglaDeLogin', () => {
  assert.equal(siglaDeLogin('ana-souza'), 'as');
  assert.equal(siglaDeLogin('ana_maria.souza-lima-x'), 'amsl');
  assert.equal(siglaDeLogin('anasouza'), 'an');
});

test('siglaValida e nomeValido', () => {
  assert.ok(siglaValida('as')); assert.ok(!siglaValida('a')); assert.ok(!siglaValida('a1'));
  assert.ok(!siglaValida('abcde')); assert.ok(!siglaValida('AS'));
  assert.ok(nomeValido('carrinho-2')); assert.ok(!nomeValido('Carrinho')); assert.ok(!nomeValido('a b')); assert.ok(!nomeValido('-x'));
});

test('idsNoHistorico lê só os números da sigla pedida', () => {
  const historico = '- 2026-01-02 · as-3 · a · @ana-souza · — · x\n- 2026-01-03 · bc-9 · b · @bia-costa · — · y\n';
  assert.deepEqual(idsNoHistorico(historico, 'as'), [3]);
  assert.deepEqual(idsNoHistorico(historico, 'bc'), [9]);
  assert.deepEqual(idsNoHistorico('', 'as'), []);
});

test('proximoId considera histórico e frentes locais, só da própria sigla', () => {
  const historico = '- 2026-01-02 · as-3 · a · @ana-souza · — · x\n- 2026-01-03 · bc-9 · b · @bia-costa · — · y\n';
  assert.equal(proximoId({ sigla: 'as', historico, frentes: [{ id: 'as-5' }] }), 'as-6');
  assert.equal(proximoId({ sigla: 'zz', historico, frentes: [] }), 'zz-1');
});

test('linhaDoHistorico', () => {
  const f = { id: 'as-6', nome: 'carrinho', abertaPor: 'ana-souza', tickets: [1, 2] };
  assert.equal(linhaDoHistorico(f, 'soma do carrinho', new Date('2026-03-04T12:00:00Z')),
    '- 2026-03-04 · as-6 · carrinho · @ana-souza · #1, #2 · soma do carrinho');
  assert.match(linhaDoHistorico({ ...f, tickets: [] }, 'x', new Date('2026-03-04T12:00:00Z')), / · — · x$/);
});

test('linhaDoHistorico usa o fuso da frente para o dia', () => {
  const f = { id: 'as-6', nome: 'carrinho', abertaPor: 'ana-souza', tickets: [], abertaEm: '2026-03-01T10:00:00-03:00' };
  assert.match(linhaDoHistorico(f, 'x', new Date('2026-03-05T01:00:00Z')), /^- 2026-03-04 · /);
});

test('novaFrente monta ramo e worktree', () => {
  const dir = path.join('base', 'wt');
  const config = { git: { prefixo: 'feat/' }, fuso: 'America/Sao_Paulo' };
  const f = novaFrente({
    id: 'as-6', nome: 'carrinho', config, dirWorktrees: dir, tickets: [1], plano: null,
    caminhos: ['src/'], dona: null, login: 'ana-souza', agora: new Date('2026-03-04T15:00:00Z'),
  });
  assert.deepEqual(f, {
    esquema: 1, id: 'as-6', nome: 'carrinho', ramo: 'feat/carrinho', worktree: path.join(dir, 'carrinho'),
    tickets: [1], plano: null, caminhos: ['src/'], dona: null, abertaPor: 'ana-souza',
    abertaEm: '2026-03-04T12:00:00-03:00', estado: 'ativa', notas: [],
  });
});

test('novaFrente com fuso UTC usa +00:00', () => {
  const f = novaFrente({
    id: 'as-1', nome: 'x1', config: { git: { prefixo: '' }, fuso: 'UTC' }, dirWorktrees: 'd',
    tickets: [], plano: null, caminhos: [], dona: null, login: 'ana-souza', agora: new Date('2026-03-04T15:00:00Z'),
  });
  assert.equal(f.abertaEm, '2026-03-04T15:00:00+00:00');
});
