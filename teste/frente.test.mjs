import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  siglaValida, siglaDeLogin, nomeValido, idsNoHistorico, proximoId, novaFrente, linhaDoHistorico,
  lerFrente, listarFrentes, listarFrentesTolerante, frentesDa, migrarFrente,
} from '../nucleo/lib/frente.mjs';
import { gravarJson } from '../nucleo/lib/estado.mjs';

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
    esquema: 2, id: 'as-6', nome: 'carrinho', ramo: 'feat/carrinho', worktree: path.join(dir, 'carrinho'),
    tickets: [1], plano: null, caminhos: ['src/'], dona: null, abertaPor: 'ana-souza',
    abertaEm: '2026-03-04T12:00:00-03:00', estado: 'ativa', notas: [], reserva: null,
  });
});

test('novaFrente com fuso UTC usa +00:00', () => {
  const f = novaFrente({
    id: 'as-1', nome: 'x1', config: { git: { prefixo: '' }, fuso: 'UTC' }, dirWorktrees: 'd',
    tickets: [], plano: null, caminhos: [], dona: null, login: 'ana-souza', agora: new Date('2026-03-04T15:00:00Z'),
  });
  assert.equal(f.abertaEm, '2026-03-04T15:00:00+00:00');
});

function temp(t) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ah-fre-'));
  t.after(() => fs.rmSync(d, { recursive: true, force: true }));
  return d;
}

const v1 = (nome, extra = {}) => ({
  esquema: 1, id: 'as-1', nome, ramo: `feat/${nome}`, worktree: path.join('wt', nome), tickets: [], plano: null, caminhos: [],
  dona: 's1', abertaPor: 'ana-souza', abertaEm: '2026-03-04T12:00:00-03:00', estado: 'ativa', notas: [], ...extra,
});

test('frente do esquema 1 ganha reserva nula ao ser lida; frentesDa filtra ativas da dona', t => {
  const dir = temp(t);
  gravarJson(path.join(dir, 'frentes', 'carrinho.json'), v1('carrinho'));
  const f = lerFrente(dir, 'carrinho');
  assert.equal(f.reserva, null); assert.equal(f.esquema, 2);
  assert.equal(listarFrentes(dir)[0].esquema, 2);
  const frentes = [
    { nome: 'a', estado: 'ativa', dona: 's1' }, { nome: 'b', estado: 'passada', dona: 's1' }, { nome: 'c', estado: 'ativa', dona: 's2' },
  ];
  assert.equal(frentesDa(frentes, 's1').length, 1);
  assert.deepEqual(frentesDa(frentes, 's1').map(x => x.nome), ['a']);
});

test('frente do esquema 2 mantém a reserva; esquema maior recusa pedindo para atualizar', t => {
  const dir = temp(t);
  const reserva = { logins: ['ana-souza'], tickets: [1] };
  gravarJson(path.join(dir, 'frentes', 'carrinho.json'), { ...v1('carrinho'), esquema: 2, reserva });
  assert.deepEqual(lerFrente(dir, 'carrinho').reserva, reserva);
  gravarJson(path.join(dir, 'frentes', 'nova.json'), { ...v1('nova'), esquema: 3 });
  assert.throws(() => lerFrente(dir, 'nova'), e => e.name === 'ErroDeEstado' && /atualize o harness/.test(e.saida));
  assert.throws(() => migrarFrente({ esquema: 7 }), e => e.name === 'ErroDeEstado' && /ah init --sobrescrever/.test(e.saida));
  const arq = path.join(dir, 'frentes', 'nova.json');
  assert.throws(() => lerFrente(dir, 'nova'), e => e.arquivo === arq && e.message.includes(arq));
});

test('listarFrentesTolerante separa as ilegíveis sem lançar', t => {
  const dir = temp(t);
  assert.deepEqual(listarFrentesTolerante(dir), { frentes: [], ilegiveis: [] });
  gravarJson(path.join(dir, 'frentes', 'carrinho.json'), v1('carrinho'));
  gravarJson(path.join(dir, 'frentes', 'busca.json'), v1('busca', { abertaEm: '2026-03-03T12:00:00-03:00' }));
  fs.writeFileSync(path.join(dir, 'frentes', 'quebrada.json'), 'não é json');
  gravarJson(path.join(dir, 'frentes', 'futura.json'), { ...v1('futura'), esquema: 5 });
  const l = listarFrentesTolerante(dir);
  assert.deepEqual(l.frentes.map(f => f.nome), ['busca', 'carrinho']);
  assert.deepEqual(l.ilegiveis.sort(), ['futura', 'quebrada']);
  assert.throws(() => listarFrentes(dir), e => e.name === 'ErroDeEstado');
});
