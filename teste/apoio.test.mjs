import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarRepo } from './apoio/repo.mjs';
import { gh } from '../nucleo/lib/github.mjs';

test('criarRepo entrega ramos e remoto', () => {
  const r = criarRepo();
  assert.equal(r.git(['branch', '--show-current']).saida.trim(), 'dev');
  assert.match(r.git(['branch', '--list']).saida, /stage/);
  assert.match(r.git(['remote']).saida, /origin/);
  assert.ok(r.env.AH_ESTADO && r.env.AH_ESTADO !== r.raiz);
  assert.equal(r.env.AH_SESSAO, 'sessao-teste-0001');
  r.limpar();
});

test('gh falso guarda comentário, responsável e rótulo por ticket', () => {
  const p = criarRepo();
  gh(['issue', 'comment', '3', '--body-file', '-'], { cwd: p.raiz, env: p.env, entrada: 'oi' });
  gh(['issue', 'edit', '3', '--add-assignee', '@me', '--add-label', 'em-andamento'], { cwd: p.raiz, env: p.env });
  assert.deepEqual(p.ghTicket(3), { state: 'OPEN', assignees: ['ana-souza'], labels: ['em-andamento'], comments: [{ author: 'ana-souza', body: 'oi' }] });
  const v = JSON.parse(gh(['issue', 'view', '3', '--json', 'assignees,comments'], { cwd: p.raiz, env: { ...p.env, GH_FALSO_LOGIN: 'carla-dias' } }).saida);
  assert.equal(v.comments[0].author.login, 'ana-souza');
  assert.deepEqual(v.assignees, [{ login: 'ana-souza' }]);
  assert.deepEqual(Object.keys(v).sort(), ['assignees', 'comments']);
  gh(['issue', 'edit', '3', '--remove-assignee', 'ana-souza', '--remove-label', 'em-andamento'], { cwd: p.raiz, env: p.env });
  assert.deepEqual(p.ghTicket(3).assignees, []);
  assert.deepEqual(p.ghTicket(3).labels, []);
  p.limpar();
});

test('gh falso: login trocável, rótulo, lista por rótulo, ticket apagado e sem rede', () => {
  const p = criarRepo();
  const o = extra => ({ cwd: p.raiz, env: { ...p.env, ...extra } });
  assert.equal(JSON.parse(gh(['api', 'user'], o({ GH_FALSO_LOGIN: 'carla-dias' })).saida).login, 'carla-dias');
  assert.equal(gh(['label', 'create', 'em-andamento', '--color', 'FBCA04', '--force'], o()).codigo, 0);
  p.ghSemear(2, { labels: ['em-andamento'], comments: [{ author: 'carla-dias', body: 'b' }] });
  p.ghSemear(4, { labels: ['em-andamento'], state: 'CLOSED' });
  p.ghSemear(5, { labels: ['outro'] });
  const lista = JSON.parse(gh(['issue', 'list', '--label', 'em-andamento', '--state', 'open', '--json', 'number,comments', '--limit', '50'], o()).saida);
  assert.deepEqual(lista, [{ number: 2, comments: [{ author: { login: 'carla-dias' }, body: 'b' }] }]);
  p.ghSemear(8, { apagado: true });
  for (const args of [['issue', 'view', '8', '--json', 'state'], ['issue', 'comment', '8', '--body-file', '-'], ['issue', 'edit', '8', '--add-label', 'x']]) {
    const r = gh(args, o());
    assert.equal(r.codigo, 1);
    assert.match(r.erro, /Could not resolve to an issue/);
  }
  assert.equal(gh(['issue', 'comment', '1', '--body-file', '-'], { ...o({ GH_FALSO_FORA: '1' }), entrada: 'x' }).codigo, 1);
  assert.deepEqual(p.ghTicket(1).comments, []);
  // As respostas programadas continuam com prioridade.
  p.ghResponder([{ prefixo: ['issue', 'view', '2'], codigo: 0, saida: '{"state":"CLOSED"}' }]);
  assert.equal(JSON.parse(gh(['issue', 'view', '2', '--json', 'state'], o()).saida).state, 'CLOSED');
  p.limpar();
});

test('gh falso simula a corrida: outro comenta e se põe de responsável antes do primeiro comentário', () => {
  const p = criarRepo();
  const env = { ...p.env, GH_FALSO_CORRIDA: JSON.stringify({ ticket: 1, autor: 'carla-dias', body: 'dela' }) };
  gh(['issue', 'comment', '1', '--body-file', '-'], { cwd: p.raiz, env, entrada: 'minha' });
  gh(['issue', 'comment', '1', '--body-file', '-'], { cwd: p.raiz, env, entrada: 'outra' });
  const t = p.ghTicket(1);
  assert.deepEqual(t.comments.map(c => [c.author, c.body]), [['carla-dias', 'dela'], ['ana-souza', 'minha'], ['ana-souza', 'outra']]);
  assert.deepEqual(t.assignees, ['carla-dias']);
  p.limpar();
});
