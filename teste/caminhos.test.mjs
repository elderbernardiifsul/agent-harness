import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { criarRepo } from './apoio/repo.mjs';
import { raizPrincipal, dirEstado, arquivoDaMaquina, dirWorktrees, dentroDe, normalizarCaminho } from '../nucleo/lib/caminhos.mjs';

test('raizPrincipal devolve o checkout principal a partir de um worktree', () => {
  const r = criarRepo(); const wt = path.join(r.estado, 'wt-x');
  r.git(['worktree', 'add', '-b', 'feat/x', wt, 'dev']);
  assert.equal(fs.realpathSync(raizPrincipal(wt)), fs.realpathSync(r.raiz));
  r.limpar();
});
test('raizPrincipal fora de repositório recusa com saída', () => {
  assert.throws(() => raizPrincipal(os.tmpdir()), e => e.name === 'ErroDeUso' && e.saida.length > 0);
});
test('dirEstado por sistema', () => {
  assert.equal(dirEstado('loja', {}, 'linux', '/h/ana'), path.join('/h/ana', '.local', 'state', 'agent-harness', 'loja'));
  assert.equal(dirEstado('loja', { AH_ESTADO: '/e' }, 'linux', '/h/ana'), path.join('/e', 'loja'));
  assert.equal(dirEstado('loja', { LOCALAPPDATA: 'C:\\L' }, 'win32', 'C:\\U'), path.join('C:\\L', 'agent-harness', 'estado', 'loja'));
});
test('estado no macOS e arquivo da máquina', () => {
  assert.equal(dirEstado('loja', {}, 'darwin', '/h/ana'), path.join('/h/ana', 'Library', 'Application Support', 'agent-harness', 'loja'));
  assert.equal(dirEstado('loja', { XDG_STATE_HOME: '/x' }, 'linux', '/h/ana'), path.join('/x', 'agent-harness', 'loja'));
  assert.equal(arquivoDaMaquina({ AH_ESTADO: '/e' }, 'linux', '/h/ana'), path.join('/e', 'maquina.json'));
});
test('dirWorktrees: config, ambiente e padrão por sistema', () => {
  const cfg = { projeto: 'loja', worktrees: { dir: null } };
  assert.equal(dirWorktrees({ ...cfg, worktrees: { dir: '/c' } }, { AH_WORKTREES: '/w' }, 'linux', '/h/ana'), '/c');
  assert.equal(dirWorktrees(cfg, { AH_WORKTREES: '/w' }, 'linux', '/h/ana'), '/w');
  assert.equal(dirWorktrees(cfg, {}, 'linux', '/h/ana'), path.join('/h/ana', '.cache', 'agent-harness', 'loja', 'wt'));
  assert.equal(dirWorktrees(cfg, { XDG_CACHE_HOME: '/k' }, 'linux', '/h/ana'), path.join('/k', 'agent-harness', 'loja', 'wt'));
  assert.equal(dirWorktrees(cfg, {}, 'darwin', '/h/ana'), path.join('/h/ana', 'Library', 'Caches', 'agent-harness', 'loja', 'wt'));
  assert.equal(dirWorktrees(cfg, { LOCALAPPDATA: 'C:\\L' }, 'win32', 'C:\\U'), path.join('C:\\L', 'agent-harness', 'loja', 'wt'));
});

// ---- fatia 2: normalizarCaminho e dentroDe (foco 2)
test('dentroDe no Windows ignora a caixa; fora da pasta e pasta vizinha não contam', () => {
  assert.ok(dentroDe('C:\\Wt\\Frete\\a.js', 'c:\\wt\\frete', 'win32'));
  assert.ok(!dentroDe('/wt/frete2/a.js', '/wt/frete', 'linux'));
  assert.ok(!dentroDe('/wt', '/wt/frete', 'linux'));
  assert.ok(dentroDe('/wt/frete', '/wt/frete', 'linux'));
  assert.ok(dentroDe('/wt/frete/..a/b.js', '/wt/frete', 'linux'));
  assert.ok(!dentroDe('D:\\wt\\frete\\a.js', 'c:\\wt\\frete', 'win32'));
});

test('normalizarCaminho resolve link e .. de arquivo que ainda não existe', { skip: process.platform === 'win32' }, t => {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ah-teste-caminho-')));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  fs.mkdirSync(path.join(tmp, 'wt', 'frete'), { recursive: true });
  fs.symlinkSync(path.join(tmp, 'wt'), path.join(tmp, 'atalho'));
  const real = path.join(tmp, 'wt', 'frete', 'novo', 'b.js');
  assert.equal(normalizarCaminho(path.join(tmp, 'atalho', 'frete', 'novo', 'b.js')), real);
  assert.equal(normalizarCaminho(`${tmp}/atalho/outra/../frete/novo/b.js`), real);
  assert.equal(normalizarCaminho(`${tmp}/atalho/frete/novo/../novo/./b.js`), real);
  assert.equal(normalizarCaminho(path.join(tmp, 'atalho')), path.join(tmp, 'wt'));
});

test('normalizarCaminho no Windows põe em minúsculas', () => {
  assert.equal(normalizarCaminho('Q:\\Nao\\Existe\\A.JS', 'win32'), 'q:\\nao\\existe\\a.js');
});
