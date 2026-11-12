import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { lerJson, gravarJson, comTrava, registrarEvento, lerEventos } from '../nucleo/lib/estado.mjs';

function temp(t) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ah-est-'));
  t.after(() => fs.rmSync(d, { recursive: true, force: true }));
  return d;
}
const espera = ms => new Promise(r => setTimeout(r, ms));

test('gravarJson e lerJson ida e volta; arquivo ausente devolve o padrão', t => {
  const d = temp(t);
  const arq = path.join(d, 'sub', 'a.json');
  assert.equal(lerJson(arq), null);
  assert.deepEqual(lerJson(arq, { x: 1 }), { x: 1 });
  gravarJson(arq, { id: 'loja', n: [1, 2] });
  assert.deepEqual(lerJson(arq), { id: 'loja', n: [1, 2] });
  assert.deepEqual(fs.readdirSync(path.dirname(arq)), ['a.json']);
});

test('JSON pela metade lança ErroDeEstado com o arquivo e a saída', t => {
  const d = temp(t);
  const arq = path.join(d, 'a.json');
  fs.writeFileSync(arq, '{"id": ');
  assert.throws(() => lerJson(arq), e => e.name === 'ErroDeEstado' && e.arquivo === arq && /ah doctor/.test(e.saida));
});

test('comTrava exclui: a segunda entrada espera a primeira soltar', async t => {
  const d = temp(t);
  const ordem = [];
  const a = comTrava(d, 'x', async () => { ordem.push('a-entra'); await espera(150); ordem.push('a-sai'); });
  await espera(20);
  const b = comTrava(d, 'x', async () => { ordem.push('b-entra'); });
  await Promise.all([a, b]);
  assert.deepEqual(ordem, ['a-entra', 'a-sai', 'b-entra']);
  assert.equal(fs.existsSync(path.join(d, 'travas', 'x')), false);
});

test('trava vencida é tomada', async t => {
  const d = temp(t);
  const pasta = path.join(d, 'travas', 'x');
  fs.mkdirSync(pasta, { recursive: true });
  fs.writeFileSync(path.join(pasta, 'dono.json'), JSON.stringify({ pid: 1, em: new Date(Date.now() - 60000).toISOString() }));
  const antiga = new Date(Date.now() - 60000);
  fs.utimesSync(pasta, antiga, antiga);
  const r = await comTrava(d, 'x', () => 'entrou', { venceMs: 10, esperaMs: 500 });
  assert.equal(r, 'entrou');
});

test('comTrava solta mesmo quando fn lança', async t => {
  const d = temp(t);
  await assert.rejects(comTrava(d, 'x', () => { throw new Error('falhou'); }), /falhou/);
  assert.equal(fs.existsSync(path.join(d, 'travas', 'x')), false);
  assert.equal(await comTrava(d, 'x', () => 1), 1);
});

test('comTrava desiste depois de esperaMs com ErroDeEstado', async t => {
  const d = temp(t);
  fs.mkdirSync(path.join(d, 'travas', 'x'), { recursive: true });
  await assert.rejects(
    comTrava(d, 'x', () => 1, { esperaMs: 80, venceMs: 60000 }),
    e => e.name === 'ErroDeEstado' && /ah doctor/.test(e.saida),
  );
});

test('registrarEvento acrescenta linha com data', t => {
  const d = temp(t);
  assert.deepEqual(lerEventos(d), []);
  registrarEvento(d, { tipo: 'abertura', frente: 'as-1' });
  registrarEvento(d, { tipo: 'fechamento', frente: 'as-1' });
  const [e, f] = lerEventos(d);
  assert.equal(e.tipo, 'abertura'); assert.ok(Date.parse(e.em));
  assert.equal(f.tipo, 'fechamento');
});
