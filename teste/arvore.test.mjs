import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { iniciar, matarArvore } from '../nucleo/lib/arvore.mjs';
import { processoExiste } from '../nucleo/lib/vida.mjs';
import { SCRIPT_PAI_E_NETO } from './apoio/processo.mjs';

const dormir = ms => new Promise(r => setTimeout(r, ms));
async function esperar(cond, ms = 5000) {
  const fim = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > fim) throw new Error('esperei demais');
    await dormir(20);
  }
}


test('matarArvore mata o filho e o neto', { skip: process.platform === 'win32' ? 'grupo de processos é do POSIX' : false }, async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ah-teste-arvore-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const pids = path.join(dir, 'pids.json');
  const filho = iniciar([process.execPath, '-e', SCRIPT_PAI_E_NETO, pids], { stdio: 'ignore' });
  await esperar(() => fs.existsSync(pids) && fs.readFileSync(pids, 'utf8').length > 0);
  const { filho: f, neto } = JSON.parse(fs.readFileSync(pids, 'utf8'));
  assert.ok(processoExiste(f) && processoExiste(neto));
  await matarArvore(filho, { gracaMs: 2000 });
  await esperar(() => !processoExiste(f) && !processoExiste(neto), 3000);
});

test('iniciar com texto vai para o shell e devolve o código', { skip: process.platform === 'win32' ? 'sh' : false }, async () => {
  const filho = iniciar('exit 7', { stdio: 'ignore' });
  const codigo = await new Promise(r => filho.on('exit', c => r(c)));
  assert.equal(codigo, 7);
});
