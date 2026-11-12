import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarRepo } from './apoio/repo.mjs';
import { comentar, loginAtual, repoAtual, gh } from '../nucleo/lib/github.mjs';
import { git, ramoAtual, topoDe, limpo, existeRamo } from '../nucleo/lib/git.mjs';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const p = criarRepo();
const o = () => ({ cwd: p.raiz, env: p.env });

test('comentar chama o gh com o ticket e o corpo pela entrada padrão', () => {
  assert.equal(comentar(3, 'oi', o()), true);
  const c = p.ghChamadas().at(-1);
  assert.deepEqual(c.argv.slice(0, 3), ['issue', 'comment', '3']);
  assert.equal(c.entrada, 'oi');
  assert.ok(!c.argv.includes('oi'));
});

test('login e repositório atuais', () => {
  assert.equal(loginAtual(o()), 'ana-souza');
  assert.equal(repoAtual(o()), 'exemplo/loja');
});

test('respostas programadas casam pelo prefixo', () => {
  p.ghResponder([{ prefixo: ['api', 'user'], codigo: 0, saida: '{"login":"bia-lima"}' }]);
  assert.equal(loginAtual(o()), 'bia-lima');
  p.ghResponder([]);
});

test('sem rede: loginAtual devolve null e comentar devolve false', () => {
  const env = { ...p.env, GH_FALSO_FORA: '1' };
  assert.equal(loginAtual({ cwd: p.raiz, env }), null);
  assert.equal(comentar(3, 'oi', { cwd: p.raiz, env }), false);
});

test('gh ausente devolve 127 sem lançar', () => {
  const r = gh(['api', 'user'], { cwd: p.raiz, env: { ...p.env, AH_GH: path.join(p.raiz, 'nao-existe-gh') } });
  assert.equal(r.codigo, 127);
});

test('auxiliares do git', () => {
  assert.equal(ramoAtual(p.raiz, p.env), 'dev');
  assert.equal(topoDe(p.raiz, p.env), p.raiz);
  assert.equal(limpo(p.raiz, p.env), true);
  writeFileSync(path.join(p.raiz, 'novo.txt'), 'x');
  assert.equal(limpo(p.raiz, p.env), false);
  assert.equal(existeRamo(p.raiz, 'main', { env: p.env }), true);
  assert.equal(existeRamo(p.raiz, 'nao-tem', { env: p.env }), false);
  assert.equal(existeRamo(p.raiz, 'main', { remoto: true, env: p.env }), false);
  assert.equal(git(['nada-disso'], { cwd: p.raiz, env: p.env }).codigo !== 0, true);
});
