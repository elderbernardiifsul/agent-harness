import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { criarRepo, criarProjeto, escreverConfig, ganchoPre, dirDoTeste } from './apoio/repo.mjs';
import { lerEventos } from '../nucleo/lib/estado.mjs';
import { SCRIPT_PAI_E_NETO } from './apoio/processo.mjs';
import { processoExiste } from '../nucleo/lib/vida.mjs';

const POSIX = process.platform === 'win32' ? 'grupo de processos e sh são do POSIX' : false;
const CLASSES = {
  exclusivo: { vagas: 'todas', padroes: ['npm run e2e*'] },
  grande: { vagas: 1, padroes: ['npm run build*'] },
};
const NODE = process.execPath;

const dormir = ms => new Promise(r => setTimeout(r, ms));
async function esperar(cond, ms = 8000) {
  const fim = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > fim) throw new Error('esperei demais');
    await dormir(20);
  }
}

// Projeto com classes e uma fila própria (pasta `fila` no projeto de teste); `maquina` vai para o config da fila.
function projeto(t, { maquina, fila } = {}) {
  const p = criarRepo();
  t.after(() => p.limpar());
  escreverConfig(p, { pesado: { classes: CLASSES } });
  const dirFila = fila ?? path.join(path.dirname(p.raiz), 'fila');
  fs.mkdirSync(dirFila, { recursive: true });
  if (maquina) fs.writeFileSync(path.join(dirFila, 'config.json'), JSON.stringify({ versao: 1, vagas: 2, memoriaLivreMinimaMb: 0, ...maquina }));
  Object.assign(p.env, { AH_FILA: dirFila, AH_FILA_PAUSA_MS: '20', AH_FILA_MEMORIA_LIVRE_MB: '100000' });
  delete p.env.AH_PESADO_ANINHADO;
  p.fila = dirFila;
  p.sinal = nome => path.join(path.dirname(p.raiz), nome);
  return p;
}

const estadoDaFila = dir => {
  try { return JSON.parse(fs.readFileSync(path.join(dir, 'fila.json'), 'utf8')); } catch { return { entradas: [] }; }
};

// Comando que marca o começo (arquivo `comecou`) e só termina quando `solta` existir.
const SEGURA = `
const fs = require('node:fs');
fs.writeFileSync(process.argv[1], String(Date.now()));
const fim = Date.now() + 10000;
const t = setInterval(() => { if (fs.existsSync(process.argv[2]) || Date.now() > fim) { clearInterval(t); process.exit(fs.existsSync(process.argv[2]) ? 0 : 9); } }, 20);
`;
const segura = (p, nome, opcoes = {}) => p.ahAoFundo(['pesado', '--', NODE, '-e', SEGURA, p.sinal(`${nome}-comecou`), p.sinal(`${nome}-solta`)], opcoes);
const comecou = (p, nome) => fs.existsSync(p.sinal(`${nome}-comecou`));
const soltar = (p, nome) => fs.writeFileSync(p.sinal(`${nome}-solta`), '');
const esperando = (dir, n) => estadoDaFila(dir).entradas.filter(e => !e.rodandoDesde).length >= n;

test('pesado roda o comando, repassa a saída e o código; cria a configuração da fila com os padrões', t => {
  const p = projeto(t);
  const r = p.ah(['pesado', '--', NODE, '-e', 'console.log("oi"); console.error("e"); process.exit(3)']);
  assert.equal(r.codigo, 3);
  assert.equal(r.saida, 'oi\n');
  assert.match(r.erro, /^e$/m);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(p.fila, 'config.json'), 'utf8')), { versao: 1, vagas: 2, memoriaLivreMinimaMb: 4096 });
  assert.deepEqual(estadoDaFila(p.fila).entradas, []);
  const ev = lerEventos(dirDoTeste(p)).filter(e => e.tipo === 'pesado');
  assert.deepEqual(ev.map(e => [e.senha, e.classe, e.codigo]), [[1, 'exclusivo', 3]]);
  assert.ok(ev[0].esperaMs >= 0 && ev[0].duracaoMs >= 0);
});

test('pesado com um argumento só passa pelo shell', { skip: POSIX }, t => {
  const p = projeto(t);
  const r = p.ah(['pesado', '--', 'echo a && echo b; exit 4']);
  assert.equal(r.codigo, 4);
  assert.equal(r.saida, 'a\nb\n');
});

test('pesado --help, --classe e recusas com a saída', t => {
  const p = projeto(t);
  const h = p.ah(['pesado', '--help']);
  assert.equal(h.codigo, 0);
  assert.match(h.saida, /ah pesado -- <comando>/);
  assert.match(h.saida, /--classe/);
  const c = p.ah(['pesado', '--classe', 'npm', 'run', 'build:prod']);
  assert.equal(c.codigo, 0);
  assert.match(c.saida, /^grande \(1 vaga/);
  assert.match(p.ah(['pesado', '--classe', '--', 'echo oi']).saida, /^exclusivo \(todas as vagas; não casou/);
  assert.equal(fs.existsSync(path.join(p.fila, 'fila.json')), false, '--classe não entra na fila');
  for (const args of [['pesado'], ['pesado', 'npm', 'test'], ['pesado', '--'], ['pesado', '--classe']]) {
    const r = p.ah(args);
    assert.equal(r.codigo, 1, args.join(' '));
    assert.match(r.erro, /^Recusado: .+\nFaça: .+/m);
  }
});

test('uma vaga: dois projetos com a mesma fila rodam em série, na ordem de chegada', async t => {
  const a = projeto(t, { maquina: { vagas: 1 } });
  const b = projeto(t, { fila: a.fila });
  const c = projeto(t, { fila: a.fila });
  const ra = segura(a, 'a');
  await esperar(() => comecou(a, 'a'));
  const rb = segura(b, 'b');
  await esperar(() => esperando(a.fila, 1));
  const rc = segura(c, 'c');
  await esperar(() => esperando(a.fila, 2));
  assert.equal(comecou(b, 'b'), false);
  soltar(a, 'a');
  await esperar(() => comecou(b, 'b'));
  assert.equal(comecou(c, 'c'), false, 'c chegou depois de b');
  soltar(b, 'b');
  await esperar(() => comecou(c, 'c'));
  soltar(c, 'c');
  const fins = await Promise.all([ra.fim, rb.fim, rc.fim]);
  assert.deepEqual(fins.map(f => f.codigo), [0, 0, 0]);
  assert.match(fins[1].erro, /esperando a vez \(senha 2, classe exclusivo\)/);
  assert.deepEqual(estadoDaFila(a.fila).entradas, []);
});

test('lado a lado só com memória livre e em outro worktree', async t => {
  const p = projeto(t, { maquina: { vagas: 2, memoriaLivreMinimaMb: 1000 } });
  const wt = path.join(path.dirname(p.raiz), 'wt-b');
  assert.equal(p.git(['worktree', 'add', '-b', 'feat/b', wt]).codigo, 0);
  // sem padrão que case o node, o comando pede todas as vagas
  const build = nome => ['pesado', '--', NODE, '-e', SEGURA, p.sinal(`${nome}-comecou`), p.sinal(`${nome}-solta`)];
  const ra = p.ahAoFundo(build('a'));
  await esperar(() => comecou(p, 'a'));
  // --classe confere
  assert.match(p.ah(['pesado', '--classe', NODE]).saida, /^exclusivo/);
  soltar(p, 'a');
  await ra.fim;
  // classe de 1 vaga que casa o node: outro worktree, com memória, roda junto
  escreverConfig(p, { pesado: { classes: { leve: { vagas: 1, padroes: [path.basename(NODE).replace(/\.exe$/i, '')] } } } });
  const r1 = p.ahAoFundo(build('b'));
  await esperar(() => comecou(p, 'b'));
  const r2 = p.ahAoFundo(build('c'), { cwd: wt });
  await esperar(() => comecou(p, 'c'));
  soltar(p, 'b'); soltar(p, 'c');
  assert.deepEqual((await Promise.all([r1.fim, r2.fim])).map(f => f.codigo), [0, 0]);
  // mesmo worktree: espera
  const r3 = p.ahAoFundo(build('d'));
  await esperar(() => comecou(p, 'd'));
  const r4 = p.ahAoFundo(build('e'));
  await esperar(() => esperando(p.fila, 1));
  await dormir(150);
  assert.equal(comecou(p, 'e'), false);
  soltar(p, 'd');
  await esperar(() => comecou(p, 'e'));
  soltar(p, 'e');
  const [f3, f4] = await Promise.all([r3.fim, r4.fim]);
  assert.equal(f3.codigo, 0);
  assert.match(f4.erro, /mesmo worktree/);
  // memória abaixo do mínimo: espera, mesmo em outro worktree
  const r5 = p.ahAoFundo(build('f'), { env: { AH_FILA_MEMORIA_LIVRE_MB: '10' } });
  await esperar(() => comecou(p, 'f'));
  const r6 = p.ahAoFundo(build('g'), { cwd: wt, env: { AH_FILA_MEMORIA_LIVRE_MB: '10' } });
  await esperar(() => esperando(p.fila, 1));
  await dormir(150);
  assert.equal(comecou(p, 'g'), false);
  soltar(p, 'f');
  await esperar(() => comecou(p, 'g'));
  soltar(p, 'g');
  const [, f6] = await Promise.all([r5.fim, r6.fim]);
  assert.match(f6.erro, /memória livre 10 MB/);
});

test('senha de processo morto não prende a fila', t => {
  const p = projeto(t, { maquina: { vagas: 1 } });
  fs.writeFileSync(path.join(p.fila, 'fila.json'), JSON.stringify({
    versao: 1, proximaSenha: 8,
    entradas: [{ senha: 7, pid: 999999, inicio: null, worktree: '/outro', vagas: 'todas', classe: 'exclusivo', comando: 'x', chegou: new Date().toISOString(), rodandoDesde: new Date().toISOString() }],
  }));
  const r = p.ah(['pesado', '--', NODE, '-e', 'process.exit(0)']);
  assert.equal(r.codigo, 0, r.erro);
  assert.deepEqual(estadoDaFila(p.fila).entradas, []);
  assert.equal(estadoDaFila(p.fila).proximaSenha, 9);
});

test('chamada aninhada roda direto; o comando recebe o marcador', t => {
  const p = projeto(t);
  fs.writeFileSync(path.join(p.fila, 'fila.json'), JSON.stringify({ versao: 99 }));
  const r = p.ah(['pesado', '--', NODE, '-e', 'console.log(process.env.AH_PESADO_ANINHADO)'], { env: { AH_PESADO_ANINHADO: '5' } });
  assert.equal(r.codigo, 0, r.erro);
  assert.equal(r.saida, '5\n');
  fs.rmSync(path.join(p.fila, 'fila.json'));
  assert.equal(p.ah(['pesado', '--', NODE, '-e', 'console.log(process.env.AH_PESADO_ANINHADO)']).saida, '1\n');
});

test('estado da fila com versão desconhecida para e pede atualização', t => {
  const p = projeto(t);
  fs.writeFileSync(path.join(p.fila, 'fila.json'), JSON.stringify({ versao: 99, proximaSenha: 1, entradas: [] }));
  const r = p.ah(['pesado', '--', NODE, '-e', 'console.log("rodou")']);
  assert.equal(r.codigo, 1);
  assert.equal(r.saida, '');
  assert.match(r.erro, /formato 99[\s\S]*Faça: atualize o harness/);
});

test('SIGTERM mata o filho e o neto e solta a vaga', { skip: POSIX }, async t => {
  const p = projeto(t);
  const pids = p.sinal('pids.json');
  const r = p.ahAoFundo(['pesado', '--', NODE, '-e', SCRIPT_PAI_E_NETO, pids]);
  await esperar(() => fs.existsSync(pids) && fs.readFileSync(pids, 'utf8').length > 0);
  const { filho, neto } = JSON.parse(fs.readFileSync(pids, 'utf8'));
  assert.equal(estadoDaFila(p.fila).entradas.length, 1);
  r.processo.kill('SIGTERM');
  const fim = await r.fim;
  assert.equal(fim.codigo, 143);
  await esperar(() => !processoExiste(filho) && !processoExiste(neto), 3000);
  assert.deepEqual(estadoDaFila(p.fila).entradas, []);
});

test('SIGINT na espera sai da fila sem rodar', { skip: POSIX }, async t => {
  const p = projeto(t, { maquina: { vagas: 1 } });
  const ra = segura(p, 'a');
  await esperar(() => comecou(p, 'a'));
  const rb = segura(p, 'b');
  await esperar(() => esperando(p.fila, 1));
  rb.processo.kill('SIGINT');
  assert.equal((await rb.fim).codigo, 130);
  assert.equal(estadoDaFila(p.fila).entradas.length, 1);
  soltar(p, 'a');
  await ra.fim;
  assert.equal(comecou(p, 'b'), false);
});

test('T6 pelo gancho: recusa com a saída e registra; pela fila e aninhada passam', t => {
  const q = criarProjeto();
  t.after(() => q.limpar());
  const arq = path.join(q.raiz, '.harness', 'config.json');
  const cfg = JSON.parse(fs.readFileSync(arq, 'utf8'));
  assert.equal(ganchoPre(q, { command: 'npm run build' }).codigo, 0, 'sem classes a T6 não recusa');
  fs.writeFileSync(arq, JSON.stringify({ ...cfg, pesado: { ...cfg.pesado, classes: CLASSES } }));
  const r = ganchoPre(q, { command: 'cd sub && npm run build' });
  assert.equal(r.codigo, 2);
  assert.match(r.erro, /Recusado \(T6\): .*classe grande.*\nFaça: tools\/ah pesado -- npm run build$/m);
  assert.equal(ganchoPre(q, { command: 'tools/ah pesado -- npm run build' }).codigo, 0);
  assert.equal(ganchoPre(q, { command: 'npm run build' }, 'Bash', { env: { AH_PESADO_ANINHADO: '4' } }).codigo, 0);
  const recusas = lerEventos(dirDoTeste(q)).filter(e => e.tipo === 'recusa' && e.trava === 'T6');
  assert.equal(recusas.length, 1);
  assert.equal(recusas[0].comando, 'cd sub && npm run build');
});
