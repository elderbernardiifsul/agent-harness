import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resumoDaSuite } from '../ferramentas/verifica.mjs';

const script = join(dirname(fileURLToPath(import.meta.url)), '..', 'ferramentas', 'verifica.mjs');
const rodar = args => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });

test('o resumo da suíte tira os números e os nomes dos testes que falharam', () => {
  const saida = [
    '✔ passa (1ms)',
    '✖ quebra no meio (2.5ms)',
    'ℹ tests 3', 'ℹ pass 1', 'ℹ fail 1', 'ℹ skipped 1',
    '✖ failing tests:',
    '✖ quebra no meio (2.5ms)',
  ].join('\n');
  assert.deepEqual(resumoDaSuite(saida), { testes: 3, passaram: 1, falharam: 1, pulados: 1, falhas: ['quebra no meio'] });
});

test('sem as linhas de número, o resumo diz que a suíte não terminou', () => {
  assert.deepEqual(resumoDaSuite('Error: Cannot find module'), { testes: null, passaram: null, falharam: null, pulados: null, falhas: [] });
});

test('--node com executável que não existe recusa antes de rodar, com o motivo e o que fazer', () => {
  const r = rodar(['--node', join(tmpdir(), 'nao-existe', 'node')]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /não consegui rodar .*nao-existe/);
  assert.match(r.stderr, /Faça: /);
});

test('--node mais antigo que o 22 recusa, porque o package.json pede o 22', { skip: process.platform === 'win32' }, t => {
  const pasta = mkdtempSync(join(tmpdir(), 'ah-verifica-'));
  t.after(() => rmSync(pasta, { recursive: true, force: true }));
  const velho = join(pasta, 'node');
  writeFileSync(velho, '#!/bin/sh\necho v20.11.0\n');
  chmodSync(velho, 0o755);
  const r = rodar(['--node', velho]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /v20\.11\.0 é mais antigo que o mínimo \(22\)/);
  assert.match(r.stderr, /Faça: /);
});

test('opção desconhecida recusa com o uso', () => {
  const r = rodar(['--qualquer']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /uso: node ferramentas\/verifica\.mjs/);
});
