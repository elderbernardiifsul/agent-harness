import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { aplicarPadroes, validarConfig, carregarConfig } from '../nucleo/lib/config.mjs';

test('config só com o nome recebe os padrões', () => {
  const c = aplicarPadroes({ projeto: 'loja' });
  assert.equal(c.git.base, 'dev'); assert.deepEqual(c.git.protegidos, ['stage', 'main']);
});
test('config inválida diz campo e motivo', () => {
  const v = validarConfig({ projeto: 'Loja!', git: { base: 3 }, sobrando: 1 });
  assert.deepEqual(v.erros.map(e => e.campo).sort(), ['git.base', 'projeto', 'sobrando']);
});
test('base não pode estar entre os protegidos', () => {
  assert.equal(validarConfig({ projeto: 'loja', git: { base: 'main' } }).ok, false);
});
test('chave desconhecida em subnível é erro', () => {
  const v = validarConfig({ projeto: 'loja', github: { rotulo: 'x' } });
  assert.deepEqual(v.erros.map(e => e.campo), ['github.rotulo']);
});
test('carregarConfig lê o arquivo, aplica padrões e recusa o inválido', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ah-cfg-'));
  fs.mkdirSync(path.join(d, '.harness'));
  fs.writeFileSync(path.join(d, '.harness', 'config.json'), JSON.stringify({ projeto: 'loja' }));
  assert.equal(carregarConfig(d).git.remoto, 'origin');
  fs.writeFileSync(path.join(d, '.harness', 'config.json'), JSON.stringify({ projeto: 'X' }));
  assert.throws(() => carregarConfig(d), e => e.name === 'ErroDeConfig' && e.erros.length === 1);
  fs.rmSync(d, { recursive: true, force: true });
});

test('M4: config ausente pelo código ENOENT, não pelo texto', async () => {
  const { criarRepo, gravar } = await import('./apoio/repo.mjs');
  const p = criarRepo();
  try {
    gravar(p, '.harness/config.json', 'ENOENT');
    const r = p.ah(['board']);
    assert.equal(r.codigo, 1);
    assert.doesNotMatch(r.erro, /ainda não tem/);
    assert.match(r.erro, /Configuração inválida/);
    const d = p.ah(['doctor']);
    assert.match(d.saida, /^FALHOU\s+\.harness\/config\.json válido: .*não consegui ler/m);
    assert.doesNotMatch(d.saida, /não há \.harness\/config\.json/);
    fs.rmSync(path.join(p.raiz, '.harness', 'config.json'));
    assert.match(p.ah(['board']).erro, /ainda não tem \.harness\/config\.json/);
    assert.match(p.ah(['doctor']).saida, /não há \.harness\/config\.json; rode ah init/);
  } finally {
    p.limpar();
  }
});
