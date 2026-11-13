import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { lerJson, gravarJson, comTrava, registrarEvento, lerEventos, identidadeDaMaquina, ganchosDeTeste } from '../nucleo/lib/estado.mjs';

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

test('trava de dono morto vence na hora; de dono vivo, não', async t => {
  const d = temp(t);
  const pasta = path.join(d, 'travas', 'x');
  fs.mkdirSync(pasta, { recursive: true });
  fs.writeFileSync(path.join(pasta, 'dono.json'), JSON.stringify({ pid: 999999, em: new Date().toISOString(), marca: 'morta', ...identidadeDaMaquina() }));
  assert.equal(await comTrava(d, 'x', () => 'entrou', { venceMs: 60000, esperaMs: 500 }), 'entrou');
  fs.mkdirSync(pasta, { recursive: true });
  fs.writeFileSync(path.join(pasta, 'dono.json'), JSON.stringify({ pid: process.pid, em: new Date().toISOString(), marca: 'viva' }));
  await assert.rejects(comTrava(d, 'x', () => 1, { venceMs: 60000, esperaMs: 80 }), e => e.name === 'ErroDeEstado' && e.travaPresa === true);
  // sem dono legível, vale a data da pasta (como antes)
  fs.rmSync(path.join(pasta, 'dono.json'));
  await assert.rejects(comTrava(d, 'x', () => 1, { venceMs: 60000, esperaMs: 80 }), e => e.travaPresa === true);
});

test('dono morto só vence na hora quando é desta máquina; sem identidade ou de outra, vale o prazo', async t => {
  const d = temp(t);
  const pasta = path.join(d, 'travas', 'x');
  const eu = identidadeDaMaquina();
  assert.equal(eu.maquina, os.hostname());
  const travar = extra => {
    fs.mkdirSync(pasta, { recursive: true });
    fs.writeFileSync(path.join(pasta, 'dono.json'), JSON.stringify({ pid: 999999, em: new Date().toISOString(), marca: 'm', ...extra }));
  };
  const presa = () => assert.rejects(comTrava(d, 'x', () => 1, { venceMs: 60000, esperaMs: 80 }), e => e.travaPresa === true);
  travar({});
  await presa();
  travar({ ...eu, maquina: `outra-${eu.maquina}` });
  await presa();
  if (eu.boot != null) { travar({ ...eu, boot: 'outro-boot' }); await presa(); }
  travar(eu);
  assert.equal(await comTrava(d, 'x', () => 'entrou', { venceMs: 60000, esperaMs: 500 }), 'entrou');
  // e quem pega a trava grava a identidade no dono.json
  await comTrava(d, 'y', () => {
    const dono = JSON.parse(fs.readFileSync(path.join(d, 'travas', 'y', 'dono.json'), 'utf8'));
    assert.equal(dono.maquina, eu.maquina);
    assert.equal(dono.boot ?? null, eu.boot ?? null);
  });
});

test('decisão 20: a tomada confere a marca; trava trocada entre a leitura e o rename volta ao lugar', async t => {
  const d = temp(t);
  const pasta = path.join(d, 'travas', 'x');
  const eu = identidadeDaMaquina();
  const travar = dono => {
    fs.rmSync(pasta, { recursive: true, force: true });
    fs.mkdirSync(pasta, { recursive: true });
    fs.writeFileSync(path.join(pasta, 'dono.json'), JSON.stringify({ em: new Date().toISOString(), ...eu, ...dono }));
  };
  // a vista vencida: dono morto desta máquina
  travar({ pid: 999999, marca: 'velha' });
  // Entre a leitura e o rename, outro processo tomou a velha e pôs a dele (também de dono morto, mas não foi a
  // vista). Na segunda volta, essa já passou a ser de um dono vivo.
  const trocas = [];
  ganchosDeTeste.antesDeTomar = () => {
    trocas.push(trocas.length);
    if (trocas.length === 1) travar({ pid: 999999, marca: 'nova' });
    else if (trocas.length === 2) travar({ pid: process.pid, marca: 'viva' });
  };
  t.after(() => { ganchosDeTeste.antesDeTomar = null; });
  await assert.rejects(comTrava(d, 'x', () => 'entrou', { venceMs: 60000, esperaMs: 80 }), e => e.travaPresa === true);
  assert.equal(JSON.parse(fs.readFileSync(path.join(pasta, 'dono.json'), 'utf8')).marca, 'viva');
  assert.equal(trocas.length >= 2, true);
});

test('decisão 20: a trava vista vencida e tomada sem troca é apagada e a chamada entra', async t => {
  const d = temp(t);
  const pasta = path.join(d, 'travas', 'x');
  fs.mkdirSync(pasta, { recursive: true });
  fs.writeFileSync(path.join(pasta, 'dono.json'), JSON.stringify({ pid: 999999, em: new Date().toISOString(), marca: 'velha', ...identidadeDaMaquina() }));
  let chamadas = 0;
  ganchosDeTeste.antesDeTomar = () => { chamadas++; };
  t.after(() => { ganchosDeTeste.antesDeTomar = null; });
  assert.equal(await comTrava(d, 'x', () => 'entrou', { venceMs: 60000, esperaMs: 500 }), 'entrou');
  assert.equal(chamadas, 1);
  assert.deepEqual(fs.readdirSync(path.join(d, 'travas')), []);
});

// Achado da revisão: três participantes. V vencida (dono morto); B a vê vencida; A a toma e entra; B tira do
// lugar o que está lá (agora a de A) e C, nessa hora, tenta entrar. A trava viva de A nunca pode sair do lugar.
test('revisão: a tomada nunca tira do lugar uma trava viva (três participantes)', async t => {
  const d = temp(t);
  const travas = path.join(d, 'travas');
  const pasta = path.join(travas, 'x');
  const eu = identidadeDaMaquina();
  const travar = dono => {
    fs.rmSync(pasta, { recursive: true, force: true });
    fs.mkdirSync(pasta, { recursive: true });
    fs.writeFileSync(path.join(pasta, 'dono.json'), JSON.stringify({ em: new Date().toISOString(), ...eu, ...dono }));
  };
  travar({ pid: 999999, marca: 'V' });
  let n = 0;
  ganchosDeTeste.antesDeTomar = () => { if (n++ === 0) travar({ pid: process.pid, marca: 'A' }); };
  // Logo depois do primeiro rename de B que mexe na trava, C tenta entrar como entraria: mkdir.
  const original = fs.renameSync;
  let cEntrou = null;
  fs.renameSync = (de, para) => {
    original(de, para);
    if (cEntrou === null && (de === pasta || de.startsWith(pasta + path.sep))) {
      try {
        fs.mkdirSync(pasta);
        fs.writeFileSync(path.join(pasta, 'dono.json'), JSON.stringify({ pid: process.pid, em: new Date().toISOString(), marca: 'C', ...eu }));
        cEntrou = true;
      } catch { cEntrou = false; }
    }
  };
  t.after(() => { fs.renameSync = original; ganchosDeTeste.antesDeTomar = null; });
  await assert.rejects(comTrava(d, 'x', () => 'B entrou', { venceMs: 60000, esperaMs: 100 }), e => e.travaPresa === true);
  fs.renameSync = original;
  assert.equal(cEntrou, false, 'C entrou com A dentro');
  assert.equal(JSON.parse(fs.readFileSync(path.join(pasta, 'dono.json'), 'utf8')).marca, 'A');
  assert.deepEqual(fs.readdirSync(travas), ['x']);
});

// Achado da revisão: a liberação lê o dono e apaga a pasta; se, entre as duas, outro processo tomou a trava
// (vencida pelo prazo do dono) e entrou, a liberação não pode apagar a dele.
test('revisão: a liberação não apaga a trava que outro processo pegou no meio dela', async t => {
  const d = temp(t);
  const pasta = path.join(d, 'travas', 'x');
  const sinal = path.join(d, 'sinal');
  const filho = path.join(d, 'filho.mjs');
  const estado = new URL('../nucleo/lib/estado.mjs', import.meta.url).href;
  fs.writeFileSync(filho, `import fs from 'node:fs';
import { comTrava } from ${JSON.stringify(estado)};
await comTrava(${JSON.stringify(d)}, 'x', async () => {
  const marca = JSON.parse(fs.readFileSync(${JSON.stringify(path.join(pasta, 'dono.json'))}, 'utf8')).marca;
  fs.writeFileSync(${JSON.stringify(sinal)}, marca);
  await new Promise(r => setTimeout(r, 1500));
}, { venceMs: 50, esperaMs: 5000 });
`);
  const { spawn } = await import('node:child_process');
  let proc = null;
  t.after(() => proc?.kill());
  const pausa = new Int32Array(new SharedArrayBuffer(4));
  // Na primeira remoção que a liberação faz na pasta da trava, o outro processo tenta entrar; espera-se até
  // ele entrar (ou 1,5 s) e só então a remoção segue.
  const originais = { rmSync: fs.rmSync, rmdirSync: fs.rmdirSync };
  let disparou = false;
  const antes = alvo => {
    if (disparou || alvo !== pasta) return;
    disparou = true;
    proc = spawn(process.execPath, [filho], { stdio: 'ignore' });
    const limite = Date.now() + 1500;
    while (!fs.existsSync(sinal) && Date.now() < limite) Atomics.wait(pausa, 0, 0, 10);
  };
  fs.rmSync = (alvo, ...resto) => { antes(alvo); return originais.rmSync(alvo, ...resto); };
  fs.rmdirSync = (alvo, ...resto) => { antes(alvo); return originais.rmdirSync(alvo, ...resto); };
  t.after(() => Object.assign(fs, originais));
  await comTrava(d, 'x', () => espera(120), { venceMs: 50 });
  Object.assign(fs, originais);
  assert.equal(disparou, true);
  // O outro processo está dentro (ou entra logo): a trava dele tem de estar no lugar enquanto ele está.
  const limite = Date.now() + 3000;
  while (!fs.existsSync(sinal) && Date.now() < limite) await espera(10);
  const marcaDoFilho = fs.readFileSync(sinal, 'utf8');
  assert.equal(JSON.parse(fs.readFileSync(path.join(pasta, 'dono.json'), 'utf8')).marca, marcaDoFilho);
});

// Achado 9 da revisão: o vencimento vale pelo prazo de quem segura a trava, gravado no dono.json, e não pelo
// de quem quer tomá-la.
test('revisão: a trava vence pelo prazo do dono (venceMs no dono.json); sem ele, pelo de quem toma', async t => {
  const d = temp(t);
  const pasta = path.join(d, 'travas', 'x');
  await comTrava(d, 'x', () => {
    assert.equal(JSON.parse(fs.readFileSync(path.join(pasta, 'dono.json'), 'utf8')).venceMs, 120000);
  }, { venceMs: 120000 });
  const travar = extra => {
    fs.mkdirSync(pasta, { recursive: true });
    fs.writeFileSync(path.join(pasta, 'dono.json'), JSON.stringify({ pid: process.pid, em: new Date(Date.now() - 60000).toISOString(), marca: 'longa', ...identidadeDaMaquina(), ...extra }));
  };
  // dono vivo há 60 s com prazo de 120 s: quem toma com 30 s não toma
  travar({ venceMs: 120000 });
  await assert.rejects(comTrava(d, 'x', () => 1, { venceMs: 30000, esperaMs: 80 }), e => e.travaPresa === true);
  fs.rmSync(pasta, { recursive: true, force: true });
  // dono vivo há 60 s com prazo de 30 s: quem toma com 120 s toma
  travar({ venceMs: 30000 });
  assert.equal(await comTrava(d, 'x', () => 'entrou', { venceMs: 120000, esperaMs: 500 }), 'entrou');
  // sem venceMs no dono, vale o de quem toma
  travar({});
  assert.equal(await comTrava(d, 'x', () => 'entrou', { venceMs: 30000, esperaMs: 500 }), 'entrou');
});

// Segunda revisão. Os casos que antes giravam sem fim (laço síncrono) rodam num processo à parte, com prazo:
// uma regressão falha o teste em vez de parar a suíte.
const ESTADO = new URL('../nucleo/lib/estado.mjs', import.meta.url).href;
function isolado(d, codigo) {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', `import fs from 'node:fs';
import path from 'node:path';
import * as estado from ${JSON.stringify(ESTADO)};
const { comTrava, comTravaSinc } = estado;
const D = ${JSON.stringify(d)};
const velha = alvo => { const v = new Date(Date.now() - 600000); fs.utimesSync(alvo, v, v); };
const presa = (fn, o) => { const t0 = Date.now(); try { return { entrou: fn === undefined ? null : comTravaSinc(D, 'x', fn, o) }; } catch (e) { return { ms: Date.now() - t0, presa: e.travaPresa === true, saida: e.saida ?? String(e) }; } };
${codigo}`], { encoding: 'utf8', timeout: 5000 });
  assert.equal(r.signal, null, `o processo não terminou em 5 s (laço?): ${r.stderr}`);
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout.trim().split('\n').at(-1));
}

test('revisão 2, achado 1: arquivo estranho na pasta deixa a trava presa, sem laço; a recusa diz o que há e como limpar', t => {
  const d = temp(t);
  const pasta = path.join(d, 'travas', 'x');
  const r = isolado(d, `
const pasta = path.join(D, 'travas', 'x');
comTravaSinc(D, 'x', () => fs.writeFileSync(path.join(pasta, '.dono.json.swp'), 'vim'), { venceMs: 50 });
velha(pasta);
console.log(JSON.stringify(presa(() => 'entrou', { venceMs: 50, esperaMs: 200 })));`);
  assert.equal(r.presa, true, JSON.stringify(r));
  assert.ok(r.ms < 2000, `esperou ${r.ms} ms`);
  assert.match(r.saida, /\.dono\.json\.swp/);
  assert.match(r.saida, /apague a pasta/);
  assert.ok(r.saida.includes(pasta), r.saida);
  assert.deepEqual(fs.readdirSync(pasta), ['.dono.json.swp']);
});

test('revisão 2, achado 1: dono.json que não é arquivo deixa a trava presa, sem laço', t => {
  const d = temp(t);
  const r = isolado(d, `
const pasta = path.join(D, 'travas', 'x');
fs.mkdirSync(path.join(pasta, 'dono.json'), { recursive: true });
velha(path.join(pasta, 'dono.json')); velha(pasta);
console.log(JSON.stringify(presa(() => 'entrou', { esperaMs: 200 })));`);
  assert.equal(r.presa, true, JSON.stringify(r));
  assert.match(r.saida, /dono\.json/);
  assert.match(r.saida, /apague a pasta/);
});

test('revisão 2, achado 1: dono.json sem permissão de leitura conta como ilegível e vence pela data', { skip: process.getuid?.() === 0 && 'root lê sem permissão' }, t => {
  const d = temp(t);
  const r = isolado(d, `
const pasta = path.join(D, 'travas', 'x');
fs.mkdirSync(pasta, { recursive: true });
fs.writeFileSync(path.join(pasta, 'dono.json'), '{}');
fs.chmodSync(path.join(pasta, 'dono.json'), 0);
velha(path.join(pasta, 'dono.json')); velha(pasta);
console.log(JSON.stringify(presa(() => 'entrou', { esperaMs: 500 })));`);
  assert.equal(r.entrou, 'entrou', JSON.stringify(r));
});
