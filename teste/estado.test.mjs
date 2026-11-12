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
    e => e.name === 'ErroDeEstado' && /vence sozinha em até 60 s/.test(e.saida),
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

test('dois esperadores sobre a mesma trava vencida nunca entram juntos', async t => {
  const d = temp(t);
  const pasta = path.join(d, 'travas', 'x');
  fs.mkdirSync(pasta, { recursive: true });
  const antiga = new Date(Date.now() - 60000);
  fs.utimesSync(pasta, antiga, antiga);
  let dentro = 0, max = 0;
  const entrar = async () => { dentro++; max = Math.max(max, dentro); await espera(60); dentro--; };
  await Promise.all([
    comTrava(d, 'x', entrar, { venceMs: 1000, esperaMs: 3000 }),
    comTrava(d, 'x', entrar, { venceMs: 1000, esperaMs: 3000 }),
    comTrava(d, 'x', entrar, { venceMs: 1000, esperaMs: 3000 }),
  ]);
  assert.equal(max, 1);
});

test('a liberação não apaga a trava tomada por outro depois do vencimento', async t => {
  const d = temp(t);
  const pasta = path.join(d, 'travas', 'x');
  let outro;
  await comTrava(d, 'x', async () => {
    await espera(60);
    // simula outra chamada que tomou a trava vencida
    fs.rmSync(pasta, { recursive: true, force: true });
    fs.mkdirSync(pasta);
    fs.writeFileSync(path.join(pasta, 'dono.json'), JSON.stringify({ pid: 2, em: new Date().toISOString(), marca: 'outro' }));
    outro = true;
  }, { venceMs: 30 });
  assert.ok(outro);
  assert.equal(fs.existsSync(pasta), true);
});

test('nome de trava com caminho é recusado', async t => {
  const d = temp(t);
  for (const n of ['../x', 'a/b', '.', '..', '']) {
    await assert.rejects(comTrava(d, n, () => 1), e => e.name === 'ErroDeEstado' && /Próximo passo/.test(e.saida));
  }
});

test('M1: esperar demais pela trava diz em quanto tempo ela vence e onde está', async t => {
  const d = temp(t);
  fs.mkdirSync(path.join(d, 'travas', 'frentes'), { recursive: true });
  await assert.rejects(comTrava(d, 'frentes', () => 'nunca', { esperaMs: 50, venceMs: 120000 }), e => {
    assert.match(e.saida, /Esperei 50 ms pela trava "frentes"/);
    assert.match(e.saida, /Próximo passo: .*vence sozinha em até 120 s/);
    assert.ok(e.saida.includes(path.join(d, 'travas', 'frentes')), e.saida);
    return true;
  });
});
