// O que é fonte da wiki, pela seção wiki da configuração (nucleo/extensoes/wiki/fontes.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { casa, configDaWiki, ehFonte, listarFontes, validarConfig, PADRAO } from '../nucleo/extensoes/wiki/fontes.mjs';

test('casa: ** atravessa pastas, * não', () => {
  assert.equal(casa('docs/adr/0001.md', 'docs/**'), true);
  assert.equal(casa('docs/a/b/c.md', 'docs/*/c.md'), false);
  assert.equal(casa('docs/a/c.md', 'docs/*/c.md'), true);
  assert.equal(casa('CONTEXT.md', 'CONTEXT.md'), true);
  assert.equal(casa('CONTEXTxmd', 'CONTEXT.md'), false);
  assert.equal(casa('docs/research/extrato-1.md', 'docs/research/extrato-*.md'), true);
});

test('o padrão inclui o glossário nas duas grafias e docs/', () => {
  assert.deepEqual(PADRAO.fontes, ['CONTEXT.md', 'GLOSSARY.md', 'docs/**']);
  const cfg = configDaWiki({});
  assert.equal(ehFonte('GLOSSARY.md', cfg), true);
  assert.equal(ehFonte('CONTEXT.md', cfg), true);
});

test('ehFonte: inclusão, exclusão e a pasta da wiki, que fica fora sempre', () => {
  const cfg = configDaWiki({ foraDasFontes: ['docs/**/rascunho-*.md'] });
  assert.equal(ehFonte('docs/adr/0001.md', cfg), true);
  assert.equal(ehFonte('docs/agents/metodo.md', cfg), true); // foraDasFontes trocado: docs/agents volta a ser fonte
  assert.equal(ehFonte('docs/wiki/frete/gratis.md', cfg), false);
  assert.equal(ehFonte('docs/specs/rascunho-x.md', cfg), false);
  assert.equal(ehFonte('README.md', cfg), false);
  assert.equal(ehFonte('base/wiki/a.md', configDaWiki({ pasta: 'base/wiki', fontes: ['base/**'] })), false);
});

test('validarConfig recusa campo desconhecido e forma errada', () => {
  assert.equal(validarConfig({}), null);
  assert.equal(validarConfig({ pasta: 'base/wiki', fontes: ['base/**'], foraDasFontes: ['base/x/**'] }), null);
  assert.match(validarConfig({ fonte: [] }), /campo desconhecido: fonte/);
  assert.match(validarConfig({ fontes: [] }), /fontes deve ser uma lista não vazia/);
  assert.match(validarConfig({ foraDasFontes: ['ok', ''] }), /foraDasFontes deve ser uma lista não vazia/);
  assert.match(validarConfig({ pasta: '' }), /pasta deve ser/);
  assert.match(validarConfig({ pasta: '/abs' }), /pasta deve ser/);
  assert.match(validarConfig({ pasta: '../fora' }), /pasta deve ser/);
});

test('listarFontes percorre a raiz e devolve só as fontes, ordenadas', t => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'wiki-fontes-'));
  t.after(() => fs.rmSync(raiz, { recursive: true, force: true }));
  for (const rel of ['CONTEXT.md', 'docs/adr/0001.md', 'docs/agents/x.md', 'docs/wiki/index.md', 'README.md', '.git/x.md', 'docs/b.txt']) {
    fs.mkdirSync(path.dirname(path.join(raiz, rel)), { recursive: true });
    fs.writeFileSync(path.join(raiz, rel), 'x');
  }
  fs.symlinkSync(path.join(raiz, 'docs', 'adr'), path.join(raiz, 'docs', 'atalho'));
  assert.deepEqual(listarFontes(raiz, configDaWiki({})), ['CONTEXT.md', 'docs/adr/0001.md', 'docs/b.txt']);
});
