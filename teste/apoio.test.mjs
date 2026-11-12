import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarRepo } from './apoio/repo.mjs';

test('criarRepo entrega ramos e remoto', () => {
  const r = criarRepo();
  assert.equal(r.git(['branch', '--show-current']).saida.trim(), 'dev');
  assert.match(r.git(['branch', '--list']).saida, /stage/);
  assert.match(r.git(['remote']).saida, /origin/);
  assert.ok(r.env.AH_ESTADO && r.env.AH_ESTADO !== r.raiz);
  assert.equal(r.env.AH_SESSAO, 'sessao-teste-0001');
  r.limpar();
});
