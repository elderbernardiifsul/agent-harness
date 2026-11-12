import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { criarProjeto, amb, dirDoTeste, envelhecerSinal } from './apoio/repo.mjs';
import { processoVivo } from './apoio/processo.mjs';
import { tratar } from '../nucleo/adaptadores/contrato.mjs';
import { continuarSessao } from '../nucleo/lib/heranca.mjs';
import { lerSessao, gravarSessao, registrarSessao, idadeDoSinalMs } from '../nucleo/lib/sessao.mjs';
import { lerFrente, gravarFrente } from '../nucleo/lib/frente.mjs';
import { lerEventos } from '../nucleo/lib/estado.mjs';
import { vidaDaSessao, descartarPidMorto } from '../nucleo/lib/vida.mjs';

const proc = processoVivo();
const p = criarProjeto();
const dir = dirDoTeste(p);
after(async () => { await proc.matar(); p.limpar(); });
beforeEach(() => fs.rmSync(dir, { recursive: true, force: true }));

// Hora de início fixa e conhecida: a herança não depende da plataforma (no Windows ela é sempre nula).
const comHora = { inicioDoProcesso: () => '100' };
const inicio = (id, origem) => ({ tipo: 'inicio', sessao: id, agente: 'claude-code', cwd: p.raiz, origem });
const frenteDe = (dona, nome = 'carrinho', id = 'as-1') => ({
  esquema: 2, id, nome, ramo: `feat/${nome}`, worktree: path.join(path.dirname(p.raiz), 'wt', nome), tickets: [], plano: null, caminhos: [],
  dona, abertaPor: 'ana-souza', abertaEm: '2026-11-12T10:00:00-03:00', estado: 'ativa', notas: [], reserva: null,
});

test('compact na mesma sessão mantém a frente', async () => {
  await tratar(inicio('s-a', 'novo'), { ...amb(p), pid: proc.pid });
  gravarFrente(dir, frenteDe('s-a')); gravarSessao(dir, { ...lerSessao(dir, 's-a'), frente: 'carrinho' });
  const r = await tratar(inicio('s-a', 'continuacao'), { ...amb(p), pid: proc.pid });
  assert.match(r.contexto, /Sua frente: as-1 carrinho/); assert.equal(lerFrente(dir, 'carrinho').dona, 's-a');
  assert.equal(lerSessao(dir, 's-a').fim, null);
});

test('/clear no mesmo processo herda a frente e o papel', async () => {
  await tratar(inicio('s-a', 'novo'), { ...amb(p), pid: proc.pid, ...comHora });
  gravarFrente(dir, frenteDe('s-a')); gravarSessao(dir, { ...lerSessao(dir, 's-a'), frente: 'carrinho', papel: 'orquestrador' });
  const r = await tratar(inicio('s-b', 'continuacao'), { ...amb(p), pid: proc.pid, ...comHora });
  assert.equal(lerFrente(dir, 'carrinho').dona, 's-b');
  assert.deepEqual([lerSessao(dir, 's-b').papel, lerSessao(dir, 's-b').frente], ['orquestrador', 'carrinho']);
  assert.equal(lerSessao(dir, 's-a').motivoFim, 'substituida');
  assert.equal(lerSessao(dir, 's-a').frente, null);
  assert.match(r.contexto, /Sua frente: as-1 carrinho/);
  assert.deepEqual(lerEventos(dir).filter(e => e.tipo === 'heranca').at(-1).frentes, ['carrinho']);
  const sub = lerEventos(dir).filter(e => e.tipo === 'substituida').at(-1);
  assert.deepEqual([sub.de, sub.por], ['s-a', 's-b']);
});

for (const origem of ['novo', 'continuacao']) {
  test(`hora de início desconhecida: começo ${origem} com o mesmo pid não substitui nem solta a frente`, async () => {
    const a = { ...amb(p), pid: proc.pid, inicioDoProcesso: () => null };
    await tratar(inicio('s-a', 'novo'), a); gravarFrente(dir, frenteDe('s-a'));
    gravarSessao(dir, { ...lerSessao(dir, 's-a'), frente: 'carrinho' });
    await tratar(inicio('s-b', origem), a);
    assert.equal(lerSessao(dir, 's-a').fim, null);
    assert.equal(lerSessao(dir, 's-a').frente, 'carrinho');
    assert.deepEqual([lerFrente(dir, 'carrinho').estado, lerFrente(dir, 'carrinho').dona], ['ativa', 's-a']);
    assert.equal(lerSessao(dir, 's-b').frente, null);
    assert.ok(!lerEventos(dir).some(e => ['substituida', 'heranca', 'frente-solta'].includes(e.tipo)));
  });
}

test('hora de início conhecida só de um lado não substitui', async () => {
  await tratar(inicio('s-a', 'novo'), { ...amb(p), pid: proc.pid, inicioDoProcesso: () => null });
  gravarFrente(dir, frenteDe('s-a'));
  await tratar(inicio('s-b', 'continuacao'), { ...amb(p), pid: proc.pid, ...comHora });
  assert.equal(lerSessao(dir, 's-a').fim, null);
  assert.equal(lerFrente(dir, 'carrinho').dona, 's-a');
});

test('continuação com hora de início diferente nos dois lados não herda', async () => {
  await tratar(inicio('s-a', 'novo'), { ...amb(p), pid: proc.pid, inicioDoProcesso: () => '100' });
  gravarFrente(dir, frenteDe('s-a'));
  await tratar(inicio('s-b', 'continuacao'), { ...amb(p), pid: proc.pid, inicioDoProcesso: () => '200' });
  // Hora de início diferente: o pid foi reaproveitado; a velha não é substituída nem perde a frente por esta.
  assert.equal(lerFrente(dir, 'carrinho').dona, 's-a');
  assert.equal(lerSessao(dir, 's-a').fim, null);
});

test('começo novo no mesmo processo substitui a anterior, solta a frente e o resumo manda ah open', async () => {
  await tratar(inicio('s-a', 'novo'), { ...amb(p), pid: proc.pid, ...comHora });
  gravarFrente(dir, frenteDe('s-a'));
  const r = await tratar(inicio('s-b', 'novo'), { ...amb(p), pid: proc.pid, ...comHora });
  assert.deepEqual([lerFrente(dir, 'carrinho').estado, lerFrente(dir, 'carrinho').dona], ['passada', null]);
  assert.equal(lerFrente(dir, 'carrinho').passadaPor, 'continuacao-sem-vinculo');
  assert.equal(lerSessao(dir, 's-a').motivoFim, 'substituida');
  assert.equal(lerSessao(dir, 's-b').frente, null);
  assert.ok(lerEventos(dir).some(e => e.tipo === 'frente-solta'));
  assert.match(r.contexto, /Sem dona: as-1 carrinho \(ah open carrinho\)/);
});

test('antes com pid morto e a trava das frentes presa permite logo, sem descartar', async () => {
  const q = processoVivo(); await tratar(inicio('s1', 'novo'), { ...amb(p), pid: q.pid }); await q.matar();
  const trava = path.join(dir, 'travas', 'frentes');
  fs.mkdirSync(trava, { recursive: true });
  fs.writeFileSync(path.join(trava, 'dono.json'), JSON.stringify({ pid: process.pid, em: new Date().toISOString(), marca: 'outra' }));
  const t0 = Date.now();
  const r = await tratar({ tipo: 'antes', sessao: 's1', cwd: p.raiz, acao: { tipo: 'comando', comando: 'git status' } }, amb(p));
  assert.ok(Date.now() - t0 < 1000, String(Date.now() - t0));
  assert.deepEqual(r, { decisao: 'permite' });
  assert.equal(lerSessao(dir, 's1').pid, q.pid);
  assert.ok(idadeDoSinalMs(dir, 's1') < 5000);
});

test('começo em outro processo não mexe na frente de outra sessão viva', async () => {
  const outro = processoVivo();
  try {
    await tratar(inicio('s-a', 'novo'), { ...amb(p), pid: proc.pid });
    gravarFrente(dir, frenteDe('s-a')); gravarSessao(dir, { ...lerSessao(dir, 's-a'), frente: 'carrinho' });
    const r = await tratar(inicio('s-b', 'continuacao'), { ...amb(p), pid: outro.pid });
    assert.equal(lerFrente(dir, 'carrinho').dona, 's-a');
    assert.equal(lerSessao(dir, 's-a').fim, null);
    assert.equal(lerSessao(dir, 's-b').frente, null);
    assert.doesNotMatch(r.contexto, /Sem dona/);
  } finally {
    await outro.matar();
  }
});

test('frente ativa de dona morta aparece no resumo com ah takeover', async () => {
  gravarFrente(dir, frenteDe('s-x'));
  const r = await tratar(inicio('s-b', 'novo'), { ...amb(p), pid: proc.pid });
  assert.match(r.contexto, /Sem dona: as-1 carrinho \(ah takeover carrinho\)/);
  assert.equal(lerFrente(dir, 'carrinho').dona, 's-x');
});

test('sessão que aponta para frente de outra dona perde o foco e é avisada', async () => {
  await tratar(inicio('s-x', 'novo'), { ...amb(p), pid: proc.pid });
  gravarFrente(dir, frenteDe('s-x'));
  registrarSessao(dir, { id: 's-velha', agente: 'claude-code' });
  gravarSessao(dir, { ...lerSessao(dir, 's-velha'), frente: 'carrinho' });
  const r = await tratar(inicio('s-velha', 'continuacao'), { ...amb(p), pid: null });
  assert.equal(lerSessao(dir, 's-velha').frente, null);
  assert.match(r.contexto, /Avisos: Sua frente as-1 carrinho está com a sessão s-x\./);
  assert.match(r.contexto, /Sua frente: nenhuma/);
});

test('continuarSessao sem pid não substitui ninguém', async () => {
  registrarSessao(dir, { id: 's-a', agente: 'claude-code' });
  registrarSessao(dir, { id: 's-b', agente: 'claude-code' });
  assert.deepEqual(await continuarSessao(dir, { sessao: 's-b', pid: null, pidInicio: null, origem: 'continuacao' }),
    { substituidas: [], herdadas: [], soltas: [] });
  assert.equal(lerSessao(dir, 's-a').fim, null);
});

test('sinal e antes tocam o sinal de vida', async () => {
  await tratar(inicio('s1', 'novo'), amb(p)); envelhecerSinal(p, 's1', 30);
  await tratar({ tipo: 'antes', sessao: 's1', cwd: p.raiz, acao: { tipo: 'comando', comando: 'git status' } }, amb(p));
  assert.ok(idadeDoSinalMs(dir, 's1') < 5000);
  envelhecerSinal(p, 's1', 30);
  await tratar({ tipo: 'sinal', sessao: 's1' }, amb(p));
  assert.ok(idadeDoSinalMs(dir, 's1') < 5000);
});

test('antes com sessão ilegível ainda decide pela trava', async () => {
  fs.mkdirSync(path.join(dir, 'sessoes'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'sessoes', 's1.json'), '{quebrado');
  const r = await tratar({ tipo: 'antes', sessao: 's1', cwd: p.raiz, acao: { tipo: 'comando', comando: 'git status' } }, amb(p));
  assert.deepEqual(r, { decisao: 'permite' });
});

test('pid gravado que morreu enquanto os ganchos chegam é descartado; a sessão segue viva pelo sinal', async () => {
  const q = processoVivo(); await tratar(inicio('s1', 'novo'), { ...amb(p), pid: q.pid }); await q.matar();
  await tratar({ tipo: 'sinal', sessao: 's1' }, amb(p));
  assert.equal(lerSessao(dir, 's1').pid, null);
  assert.equal(lerSessao(dir, 's1').pidInicio, null);
  assert.equal(vidaDaSessao(dir, 's1', { config: amb(p).config }).estado, 'viva');
  assert.ok(lerEventos(dir).some(e => e.tipo === 'pid-instavel' && e.sessao === 's1'));
});

test('descartarPidMorto não mexe em pid vivo nem em sessão sem pid', () => {
  registrarSessao(dir, { id: 's1', agente: 'claude-code', pid: proc.pid });
  assert.equal(descartarPidMorto(dir, 's1'), false);
  assert.equal(lerSessao(dir, 's1').pid, proc.pid);
  registrarSessao(dir, { id: 's2', agente: 'claude-code' });
  assert.equal(descartarPidMorto(dir, 's2', () => false), false);
  assert.equal(descartarPidMorto(dir, 's3'), false);
});

test('inicio sem pid dado usa AH_PID_AGENTE do ambiente', async () => {
  const { pid, ...semPid } = amb(p);
  await tratar(inicio('s1', 'novo'), { ...semPid, env: { ...p.env, AH_PID_AGENTE: String(proc.pid) } });
  assert.equal(lerSessao(dir, 's1').pid, proc.pid);
});

test('compact com o pai do gancho diferente não troca um pid vivo declarado', async () => {
  const { pid, ...semPid } = amb(p);
  await tratar(inicio('s1', 'novo'), { ...semPid, env: { ...p.env, AH_PID_AGENTE: String(proc.pid) } });
  // Sem AH_PID_AGENTE no ambiente do gancho, o pid viria do processo pai (este processo de teste).
  await tratar(inicio('s1', 'continuacao'), semPid);
  assert.equal(lerSessao(dir, 's1').pid, proc.pid);
});
