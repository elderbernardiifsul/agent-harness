import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { argumentosDaSuite, resumoDaSuite } from '../ferramentas/verifica.mjs';
import { readFileSync } from 'node:fs';

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

test('o resumo lê a saída colorida (FORCE_COLOR herdado do ambiente)', () => {
  const saida = ['\x1b[34mℹ tests 2\x1b[39m', '\x1b[34mℹ pass 1\x1b[39m', '\x1b[34mℹ fail 1\x1b[39m', '\x1b[34mℹ skipped 0\x1b[39m',
    '\x1b[31m✖ failing tests:\x1b[39m', '\x1b[31m✖ quebra (1.2ms)\x1b[39m'].join('\n');
  assert.deepEqual(resumoDaSuite(saida), { testes: 2, passaram: 1, falharam: 1, pulados: 0, falhas: ['quebra'] });
});

test('--node relativo vale a partir da pasta de onde se chama, não da raiz do repositório', { skip: process.platform === 'win32' }, t => {
  const pasta = mkdtempSync(join(tmpdir(), 'ah-verifica-'));
  t.after(() => rmSync(pasta, { recursive: true, force: true }));
  writeFileSync(join(pasta, 'node'), '#!/bin/sh\necho v20.11.0\n');
  chmodSync(join(pasta, 'node'), 0o755);
  const r = spawnSync(process.execPath, [script, '--node', './node'], { cwd: pasta, encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, new RegExp(`${join(pasta, 'node').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: v20\\.11\\.0 é mais antigo`));
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

test('a suíte do verifica usa as mesmas opções do npm test, sem prazo global nem saída forçada', () => {
  const pacote = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8'));
  const opcoes = pacote.scripts.test.match(/--test-[a-z-]+(=\S+)?/g) ?? [];
  for (const o of opcoes) assert.ok(argumentosDaSuite().includes(o), o);
  // Sem --test-timeout: no Node 22 ele vale para o arquivo inteiro, que é morto sem rodar t.after nem o exit, e
  // deixa ah pesado órfãos. Sem --test-force-exit: ele encerrava arquivos antes do fim, e a suíte perdia testes
  // sem acusar falha (27/11).
  assert.doesNotMatch(pacote.scripts.test, /--test-timeout|--test-force-exit/);
  assert.deepEqual(argumentosDaSuite({ scripts: { test: 'node --test --test-timeout=5000 "teste/*.test.mjs"' } }), ['--test', '--test-reporter=spec', '--test-timeout=5000', 'teste/*.test.mjs']);
  assert.deepEqual(argumentosDaSuite({ scripts: { test: 'node --test "teste/*.test.mjs"' } }), ['--test', '--test-reporter=spec', 'teste/*.test.mjs']);
});
