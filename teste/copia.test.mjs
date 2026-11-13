import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { criarRepo } from './apoio/repo.mjs';
import { arquivosDaCopia, citar, eClone, lerManifesto, listaInstalada, versaoDoClone } from '../nucleo/lib/copia.mjs';
import { VERSAO } from '../nucleo/versao.mjs';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha = b => createHash('sha256').update(b).digest('hex');

test('a lista da cópia tem o núcleo, os documentos e os modelos, sem testes', () => {
  const { arquivos } = arquivosDaCopia(RAIZ);
  const rels = arquivos.map(a => a.rel);
  for (const r of ['bin/ah.mjs', 'versao.mjs', 'docs/agentes/README.md', 'modelos/agents-trecho.md', 'modelos/claude-code/ganchos.json']) assert.ok(rels.includes(r), r);
  assert.ok(!rels.some(r => /\.test\.mjs$/.test(r) || r.startsWith('teste/')));
  assert.ok(!rels.includes('MANIFEST.json'));
  assert.deepEqual(rels, [...rels].sort());
  const a = arquivos.find(x => x.rel === 'versao.mjs');
  assert.equal(a.sha256, sha(fs.readFileSync(path.join(RAIZ, 'nucleo', 'versao.mjs'))));
});

test('reconhece o clone e lê a versão sem importar o arquivo', () => {
  assert.equal(eClone(RAIZ), true);
  assert.equal(eClone(path.join(RAIZ, 'nucleo')), false);
  assert.equal(versaoDoClone(RAIZ), VERSAO);
});

test('o init grava no manifesto a lista dos arquivos e registra o clone de origem', t => {
  const p = criarRepo();
  t.after(() => p.limpar());
  assert.equal(p.ah(['init', '--projeto', 'loja', '--sigla', 'as', '--sem-protecao']).codigo, 0);
  const nucleo = path.join(p.raiz, '.harness', 'nucleo');
  const m = lerManifesto(nucleo);
  assert.equal(m.versao, VERSAO);
  assert.deepEqual(m.arquivos, listaInstalada(nucleo).lista);
  assert.equal(m.arquivos['bin/ah.mjs'], sha(fs.readFileSync(path.join(nucleo, 'bin', 'ah.mjs'))));
  const origem = JSON.parse(fs.readFileSync(path.join(p.estado, 'loja', 'origem.json'), 'utf8'));
  assert.equal(origem.clone, fs.realpathSync(RAIZ));
});

test('citar põe aspas simples só no caminho que precisa', () => {
  assert.equal(citar('/tmp/agent-harness'), '/tmp/agent-harness');
  assert.equal(citar('/tmp/meu clone'), "'/tmp/meu clone'");
  assert.equal(citar("/tmp/d'ana"), "'/tmp/d'\\''ana'");
});
