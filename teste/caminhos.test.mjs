import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { criarRepo } from './apoio/repo.mjs';
import { raizPrincipal, dirEstado, arquivoDaMaquina, dirWorktrees } from '../nucleo/lib/caminhos.mjs';

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
