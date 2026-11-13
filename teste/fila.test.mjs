import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  casaPadrao, classeQueCasa, classeDoComando, vagasEfetivas, podeComecar, entradaMorta, separarMortas,
  lerConfigDaMaquina, lerEstadoDaFila, dirDaFila, PADROES_DA_MAQUINA, entrarNaFila, tentarComecar, sairDaFila, memoriaLivreMb,
} from '../nucleo/lib/fila.mjs';
import { ErroDeUso } from '../nucleo/lib/caminhos.mjs';
import { spawn } from 'node:child_process';
import { inicioDoProcesso, processoExiste } from '../nucleo/lib/vida.mjs';

const CLASSES = {
  exclusivo: { vagas: 'todas', padroes: ['npm run e2e*', 'npx playwright*'] },
  grande: { vagas: 2, padroes: ['npm run build*'] },
  leve: { vagas: 1, padroes: ['npm test*', 'npm run build:docs'] },
};

function pasta(t) {
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'ah-teste-fila-'));
  t.after(() => fs.rmSync(p, { recursive: true, force: true }));
  return p;
}

test('casaPadrao: prefixo de palavras, curinga e nome do programa sem pasta', () => {
  assert.ok(casaPadrao('npm run build*', ['npm', 'run', 'build:prod', '--x']));
  assert.ok(casaPadrao('npm run build*', ['/usr/bin/npm', 'run', 'build']));
  assert.ok(casaPadrao('npm', ['npm.exe', 'ci']));
  assert.ok(casaPadrao('npm test', ['npm', 'test', '--watch']));
  assert.ok(!casaPadrao('npm run build', ['npm', 'run']));
  assert.ok(!casaPadrao('npm run build', ['npm', 'run', 'build2']));
  assert.ok(!casaPadrao('playwright', ['npx', 'playwright']));
  assert.ok(casaPadrao('t?c', ['tsc']));
  assert.ok(!casaPadrao('a.c', ['abc']), 'ponto é literal');
});

test('classeQueCasa: a mais restritiva entre as que casam; nenhuma, null', () => {
  assert.equal(classeQueCasa(['npm', 'run', 'build:docs'], CLASSES), 'grande');
  assert.equal(classeQueCasa(['npm', 'test'], CLASSES), 'leve');
  assert.equal(classeQueCasa(['echo', 'oi'], CLASSES), null);
  assert.equal(classeQueCasa(['npm', 'test'], {}), null);
});

test('classeDoComando: lê o shell (encadeamento, bash -c, env), não reconhecido cai na mais restritiva', () => {
  assert.deepEqual(classeDoComando('npm test', CLASSES), { nome: 'leve', vagas: 1, reconhecido: true });
  assert.equal(classeDoComando('npm test && npm run build', CLASSES).nome, 'grande');
  assert.equal(classeDoComando(`bash -c 'npm run e2e'`, CLASSES).nome, 'exclusivo');
  assert.equal(classeDoComando('env CI=1 npm run build', CLASSES).nome, 'grande');
  assert.equal(classeDoComando(['npm', 'run', 'build'], CLASSES).nome, 'grande');
  assert.equal(classeDoComando(['bash', '-c', 'npm test'], CLASSES).nome, 'leve');
  assert.deepEqual(classeDoComando('echo oi', CLASSES), { nome: 'exclusivo', vagas: 'todas', reconhecido: false });
  assert.deepEqual(classeDoComando('echo "aberto', CLASSES), { nome: 'exclusivo', vagas: 'todas', reconhecido: false });
  assert.deepEqual(classeDoComando('npm test', { a: { vagas: 1, padroes: ['x'] }, b: { vagas: 3, padroes: ['y'] } }), { nome: 'b', vagas: 3, reconhecido: false });
  assert.deepEqual(classeDoComando('npm test', {}), { nome: 'exclusivo', vagas: 'todas', reconhecido: false });
});

test('vagasEfetivas: "todas" e o que passa do total viram o total', () => {
  assert.equal(vagasEfetivas('todas', 3), 3);
  assert.equal(vagasEfetivas(5, 2), 2);
  assert.equal(vagasEfetivas(1, 2), 1);
});

const ent = (senha, troca = {}) => ({ senha, pid: 1, worktree: `/w${senha}`, vagas: 1, rodandoDesde: null, ...troca });
const MAQ = { vagas: 2, memoriaLivreMb: 8000, memoriaLivreMinimaMb: 4096 };

test('podeComecar: fila estrita, vagas, memória e mesmo worktree', () => {
  const rodando = '2026-11-13T00:00:00Z';
  // vazia: começa
  assert.equal(podeComecar({ entradas: [ent(1)] }, 1, MAQ).pode, true);
  // quem chegou antes e espera vai primeiro, mesmo havendo vaga
  let r = podeComecar({ entradas: [ent(1, { vagas: 'todas', worktree: '/a' }), ent(2)] }, 2, MAQ);
  assert.equal(r.pode, false); assert.match(r.motivo, /senha 1/);
  // lado a lado com memória e outro worktree
  assert.equal(podeComecar({ entradas: [ent(1, { rodandoDesde: rodando }), ent(2)] }, 2, MAQ).pode, true);
  // sem vaga
  r = podeComecar({ entradas: [ent(1, { rodandoDesde: rodando, vagas: 2 }), ent(2)] }, 2, MAQ);
  assert.equal(r.pode, false); assert.match(r.motivo, /sem vaga/);
  // exclusivo espera quem roda
  r = podeComecar({ entradas: [ent(1, { rodandoDesde: rodando }), ent(2, { vagas: 'todas' })] }, 2, MAQ);
  assert.equal(r.pode, false); assert.match(r.motivo, /sem vaga/);
  // memória abaixo do mínimo
  r = podeComecar({ entradas: [ent(1, { rodandoDesde: rodando }), ent(2)] }, 2, { ...MAQ, memoriaLivreMb: 100 });
  assert.equal(r.pode, false); assert.match(r.motivo, /memória livre 100 MB/);
  // memória baixa não impede quem roda sozinho
  assert.equal(podeComecar({ entradas: [ent(1)] }, 1, { ...MAQ, memoriaLivreMb: 0 }).pode, true);
  // mesmo worktree
  r = podeComecar({ entradas: [ent(1, { rodandoDesde: rodando, worktree: '/a' }), ent(2, { worktree: '/a' })] }, 2, MAQ);
  assert.equal(r.pode, false); assert.match(r.motivo, /mesmo worktree/);
});

test('entrada morta: pid que não existe ou hora de início diferente', () => {
  const existe = pid => pid !== 9;
  const inicio = pid => (pid === 7 ? 'novo' : 'igual');
  assert.equal(entradaMorta({ pid: 9 }, { existe, inicio }), true);
  assert.equal(entradaMorta({ pid: 7, inicio: 'velho' }, { existe, inicio }), true);
  assert.equal(entradaMorta({ pid: 8, inicio: 'igual' }, { existe, inicio }), false);
  assert.equal(entradaMorta({ pid: 8, inicio: null }, { existe, inicio }), false);
  const { estado, mortas } = separarMortas({ entradas: [{ senha: 1, pid: 9 }, { senha: 2, pid: 8 }] }, { existe, inicio });
  assert.deepEqual(estado.entradas.map(e => e.senha), [2]);
  assert.deepEqual(mortas.map(e => e.senha), [1]);
});

test('configuração da máquina: criada com os padrões; inválida e mais nova recusam com a saída', t => {
  const dir = pasta(t);
  assert.deepEqual(lerConfigDaMaquina(dir), PADROES_DA_MAQUINA);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8')), PADROES_DA_MAQUINA);
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ versao: 1, vagas: 0, memoriaLivreMinimaMb: 1 }));
  assert.throws(() => lerConfigDaMaquina(dir), e => e instanceof ErroDeUso && /vagas/.test(e.saida) && /Próximo passo:/.test(e.saida));
  fs.writeFileSync(path.join(dir, 'config.json'), '{');
  assert.throws(() => lerConfigDaMaquina(dir), e => /não é JSON/.test(e.saida) && /Próximo passo:/.test(e.saida));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ versao: 2, vagas: 1, memoriaLivreMinimaMb: 1 }));
  assert.throws(() => lerConfigDaMaquina(dir), e => /versão 2/.test(e.saida) && /atualize o harness/.test(e.saida));
});

test('estado da fila: versão desconhecida para e pede atualização; ilegível diz o que apagar', t => {
  const dir = pasta(t);
  assert.deepEqual(lerEstadoDaFila(dir), { versao: 1, proximaSenha: 1, entradas: [] });
  fs.writeFileSync(path.join(dir, 'fila.json'), JSON.stringify({ versao: 99, proximaSenha: 1, entradas: [] }));
  assert.throws(() => lerEstadoDaFila(dir), e => /formato 99/.test(e.saida) && /atualize o harness/.test(e.saida));
  fs.writeFileSync(path.join(dir, 'fila.json'), 'x');
  assert.throws(() => lerEstadoDaFila(dir), e => /não se lê/.test(e.saida) && /apague/.test(e.saida));
});

test('dirDaFila: AH_FILA, senão _fila na base do estado (a mesma para todos os projetos)', () => {
  assert.equal(dirDaFila({ AH_FILA: '/f' }, 'linux', '/casa'), '/f');
  assert.equal(dirDaFila({ AH_ESTADO: '/e' }, 'linux', '/casa'), path.join('/e', '_fila'));
  assert.equal(dirDaFila({}, 'linux', '/casa'), path.join('/casa', '.local', 'state', 'agent-harness', '_fila'));
});

test('memoriaLivreMb: AH_FILA_MEMORIA_LIVRE_MB substitui a medida', () => {
  assert.equal(memoriaLivreMb({ AH_FILA_MEMORIA_LIVRE_MB: '123' }), 123);
  assert.ok(memoriaLivreMb({}) > 0);
});

test('entrar, começar e sair: senhas crescentes, morta descartada', async t => {
  const dir = pasta(t);
  const vivo = { existe: pid => pid !== 999999, inicio: () => null };
  const s1 = await entrarNaFila(dir, { pid: process.pid, worktree: '/a', vagas: 1 }, vivo);
  const s2 = await entrarNaFila(dir, { pid: 999999, worktree: '/b', vagas: 'todas' }, vivo);
  const s3 = await entrarNaFila(dir, { pid: process.pid, worktree: '/c', vagas: 1 }, vivo);
  assert.deepEqual([s1, s2, s3], [1, 2, 3]);
  // ao entrar a 3, a 2 (morta) já saiu
  assert.deepEqual(lerEstadoDaFila(dir).entradas.map(e => e.senha), [1, 3]);
  const maq = { vagas: 2, memoriaLivreMb: 9999, memoriaLivreMinimaMb: 1 };
  assert.equal((await tentarComecar(dir, s1, maq, vivo)).pode, true);
  assert.equal((await tentarComecar(dir, s3, maq, vivo)).pode, true);
  await sairDaFila(dir, s1, vivo);
  assert.deepEqual(lerEstadoDaFila(dir).entradas.map(e => e.senha), [3]);
  assert.equal(lerEstadoDaFila(dir).proximaSenha, 4);
});

test('grupo órfão só é sinalizado se o líder existe com a mesma hora de início', { skip: process.platform === 'win32' ? 'sem grupo no Windows' : false }, async t => {
  // Processo vivo, líder do próprio grupo, que não é nosso: a entrada forjada aponta para ele com outra hora.
  const alheio = spawn(process.execPath, ['-e', 'setInterval(()=>{}, 1e6)'], { stdio: 'ignore', detached: true });
  t.after(() => { try { process.kill(-alheio.pid, 'SIGKILL'); } catch { /* já saiu */ } });
  let inicio = null;
  for (let i = 0; i < 100 && inicio == null; i++) { inicio = inicioDoProcesso(alheio.pid); if (inicio == null) await new Promise(r => setTimeout(r, 10)); }
  assert.ok(inicio != null, 'hora de início do processo de teste');
  const sinais = [];
  const sinal = (g, s) => sinais.push([g, s]);
  const forjada = { senha: 1, pid: 999999, grupo: alheio.pid, grupoInicio: `outra-${inicio}`, vagas: 1, rodandoDesde: 'x' };
  let r = separarMortas({ entradas: [forjada] });
  assert.deepEqual(r.mortas.map(e => e.senha), [1]);
  assert.ok(processoExiste(alheio.pid), 'o processo alheio não foi morto');
  r = separarMortas({ entradas: [{ ...forjada, grupoInicio: undefined }] }, { sinalNoGrupo: sinal });
  assert.deepEqual([r.mortas.length, sinais.length], [1, 0], 'sem hora gravada: morta, nada sinalizado');
  r = separarMortas({ entradas: [{ ...forjada, grupoInicio: inicio }] }, { sinalNoGrupo: sinal });
  assert.deepEqual([r.orfas.length, sinais], [1, [[alheio.pid, 'SIGTERM']]], 'mesma hora: órfã de verdade, recebe SIGTERM');
});
