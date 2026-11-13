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

test('sessoes.prazoDoSinalMin: padrão 120, inteiro de 1 a 10080', () => {
  assert.equal(aplicarPadroes({ projeto: 'loja' }).sessoes.prazoDoSinalMin, 120);
  for (const v of [0, 10081, 1.5, '60']) assert.deepEqual(validarConfig({ projeto: 'loja', sessoes: { prazoDoSinalMin: v } }).erros.map(e => e.campo), ['sessoes.prazoDoSinalMin']);
  for (const v of [1, 60, 10080]) assert.equal(validarConfig({ projeto: 'loja', sessoes: { prazoDoSinalMin: v } }).ok, true);
  assert.equal(aplicarPadroes({ projeto: 'loja', sessoes: { prazoDoSinalMin: 30 } }).sessoes.prazoDoSinalMin, 30);
});

test('o modelo de configuração traz a seção sessoes e passa na validação', () => {
  const modelo = JSON.parse(fs.readFileSync(new URL('../modelos/config.json', import.meta.url), 'utf8'));
  assert.deepEqual(modelo.sessoes, { prazoDoSinalMin: 120 });
  assert.equal(modelo.versaoDoEsquema, 1);
  assert.equal(validarConfig({ ...modelo, projeto: 'loja' }).ok, true);
});

test('pesado.classes: vagas de 1 a 64 ou "todas", padrões não vazios; `_` em pesado é comentário', () => {
  assert.deepEqual(aplicarPadroes({ projeto: 'loja' }).pesado, { classes: {} });
  const ok = { exclusivo: { vagas: 'todas', padroes: ['npm run e2e*'] }, grande: { vagas: 1, padroes: ['npm run build*', 'tsc'] } };
  assert.equal(validarConfig({ projeto: 'loja', pesado: { classes: ok, _exemplo: { qualquer: 'coisa' }, _leia: 'x' } }).ok, true);
  const campos = pesado => validarConfig({ projeto: 'loja', pesado }).erros.map(e => e.campo);
  assert.deepEqual(campos({ classes: { g: { vagas: 0, padroes: ['x'] } } }), ['pesado.classes.g.vagas']);
  assert.deepEqual(campos({ classes: { g: { vagas: 'tudo', padroes: ['x'] } } }), ['pesado.classes.g.vagas']);
  assert.deepEqual(campos({ classes: { g: { vagas: 65, padroes: ['x'] } } }), ['pesado.classes.g.vagas']);
  assert.deepEqual(campos({ classes: { g: { vagas: 1, padroes: [] } } }), ['pesado.classes.g.padroes']);
  assert.deepEqual(campos({ classes: { g: { vagas: 1, padroes: ['  '] } } }), ['pesado.classes.g.padroes']);
  assert.deepEqual(campos({ classes: { g: { vagas: 1 } } }), ['pesado.classes.g.padroes']);
  assert.deepEqual(campos({ classes: { g: { vagas: 1, padroes: ['x'], cor: 1 } } }), ['pesado.classes.g.cor']);
  assert.deepEqual(campos({ classes: { 'G R': { vagas: 1, padroes: ['x'] } } }), ['pesado.classes.G R']);
  assert.deepEqual(campos({ classes: [] }), ['pesado.classes']);
  assert.deepEqual(campos({ vagas: 2 }), ['pesado.vagas']);
  const c = aplicarPadroes({ projeto: 'loja', pesado: { classes: ok, _exemplo: {} } });
  assert.deepEqual(Object.keys(c.pesado.classes), ['exclusivo', 'grande']);
});

test('o modelo de configuração traz pesado com classes vazias e um exemplo que valida', () => {
  const modelo = JSON.parse(fs.readFileSync(new URL('../modelos/config.json', import.meta.url), 'utf8'));
  assert.deepEqual(modelo.pesado.classes, {});
  assert.ok(Object.keys(modelo.pesado._exemplo).length >= 2);
  assert.equal(validarConfig({ ...modelo, projeto: 'loja', pesado: { classes: modelo.pesado._exemplo } }).ok, true);
});

test('fuso: só o que o Intl reconhece; o motivo diz o valor e dá um exemplo', () => {
  assert.equal(validarConfig({ projeto: 'loja', fuso: 'America/Sao_Paulo' }).ok, true);
  assert.equal(validarConfig({ projeto: 'loja', fuso: 'UTC' }).ok, true);
  const v = validarConfig({ projeto: 'loja', fuso: 'Lua/Base_Alfa' });
  assert.deepEqual(v.erros.map(e => e.campo), ['fuso']);
  assert.match(v.erros[0].motivo, /Lua\/Base_Alfa/);
  assert.match(v.erros[0].motivo, /America\/Sao_Paulo/);
  assert.equal(validarConfig({ projeto: 'loja', fuso: 3 }).ok, false);
});

test('fuso inválido: deps e board --numeros recusam pela configuração, não com "Erro inesperado"', async t => {
  const { criarProjeto, gravar } = await import('./apoio/repo.mjs');
  const p = criarProjeto();
  t.after(() => p.limpar());
  const cfg = JSON.parse(fs.readFileSync(path.join(p.raiz, '.harness', 'config.json'), 'utf8'));
  gravar(p, '.harness/config.json', JSON.stringify({ ...cfg, fuso: 'Lua/Base_Alfa' }));
  for (const args of [['deps'], ['board', '--numeros']]) {
    const r = p.ah(args);
    assert.equal(r.codigo, 1, args.join(' '));
    assert.doesNotMatch(r.erro, /Erro inesperado/);
    assert.match(r.erro, /fuso \(/);
    assert.match(r.erro, /Faça: corrija \.harness\/config\.json/);
  }
});
