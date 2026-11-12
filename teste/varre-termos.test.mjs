import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { criarRepo } from './apoio/repo.mjs';
import { varrer } from '../ferramentas/varre-termos.mjs';

const aqui = dirname(fileURLToPath(import.meta.url));
const script = join(aqui, '..', 'ferramentas', 'varre-termos.mjs');

test('acha termo em arquivo e em commit antigo, sem diferenciar maiúsculas', () => {
  const r = criarRepo({ remoto: false });
  writeFileSync(join(r.raiz, 'a.txt'), 'dono: Fulano\n');
  r.git(['add', 'a.txt']);
  r.git(['commit', '-m', 'cria a']);
  r.git(['rm', 'a.txt']);
  writeFileSync(join(r.raiz, 'b.txt'), 'o SEGREDO está aqui\n');
  r.git(['add', 'b.txt']);
  r.git(['commit', '-m', 'apaga a, cria b']);
  const achados = varrer({ raiz: r.raiz, termos: ['fulano', 'segredo'] });
  assert.deepEqual(achados.map((a) => a.termo).sort(), ['fulano', 'segredo']);
  assert.ok(achados.some((a) => a.termo === 'fulano' && a.onde === 'historico'));
  assert.ok(achados.some((a) => a.termo === 'segredo' && a.onde === 'b.txt' && a.linha === 1));
  r.limpar();
});

test('sem achados devolve lista vazia', () => {
  const r = criarRepo({ remoto: false });
  assert.deepEqual(varrer({ raiz: r.raiz, termos: ['inexistente'] }), []);
  r.limpar();
});

test('sem lista sai com código 2', () => {
  let codigo = 0;
  try {
    execFileSync(process.execPath, [script, '--lista', join(aqui, 'nao-existe.txt')], { stdio: 'pipe' });
  } catch (e) {
    codigo = e.status;
  }
  assert.equal(codigo, 2);
});
