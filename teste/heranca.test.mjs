import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { criarProjeto, amb, dirDoTeste, envelhecerSinal } from './apoio/repo.mjs';
import { frenteOrfa, vidaDaDona } from '../nucleo/lib/vida.mjs';
import { processoVivo } from './apoio/processo.mjs';
import { tratar } from '../nucleo/adaptadores/contrato.mjs';
import { continuarSessao } from '../nucleo/lib/heranca.mjs';
import { lerSessao, gravarSessao, registrarSessao, idadeDoSinalMs } from '../nucleo/lib/sessao.mjs';
import { lerFrente, gravarFrente } from '../nucleo/lib/frente.mjs';
import { lerEventos } from '../nucleo/lib/estado.mjs';
import { listarPendentes } from '../nucleo/lib/pendentes.mjs';
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

test('hora de início desconhecida: a continuação no mesmo pid edita no worktree da frente da anterior (T4 não barra)', async () => {
  const a = { ...amb(p), pid: proc.pid, inicioDoProcesso: () => null };
  await tratar(inicio('sessao-a-0001', 'novo'), a); gravarFrente(dir, frenteDe('sessao-a-0001'));
  await tratar(inicio('sessao-a-0002', 'continuacao'), a);
  const arquivo = path.join(frenteDe('x').worktree, 'a.txt');
  const e = await tratar({ tipo: 'antes', sessao: 'sessao-a-0002', cwd: p.raiz, acao: { tipo: 'edicao', arquivo } }, a);
  assert.equal(e.decisao, 'permite', e.mensagem);
  // Outro processo (pid diferente) continua barrado.
  const outro = await tratar({ tipo: 'antes', sessao: 'sessao-c-0003', cwd: p.raiz, acao: { tipo: 'edicao', arquivo } }, { ...a, pid: process.pid });
  assert.equal(outro.decisao, 'recusa');
  // Com a hora de início conhecida na dona, o mesmo pid não basta (seria a continuação já herdada, ou pid reaproveitado).
  gravarSessao(dir, { ...lerSessao(dir, 'sessao-a-0001'), pidInicio: '100' });
  const comHoraNaDona = await tratar({ tipo: 'antes', sessao: 'sessao-a-0002', cwd: p.raiz, acao: { tipo: 'edicao', arquivo } }, a);
  assert.equal(comHoraNaDona.decisao, 'recusa');
});

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
  assert.equal(lerFrente(dir, 'carrinho').passadaDe, 's-a');
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
    { substituidas: [], herdadas: [], soltas: [], passadas: [] });
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

// ---- /clear real do Claude Code: o SessionEnd (reason clear) chega antes do SessionStart (source clear)
const fimDe = (id, motivo, continuacao) => ({ tipo: 'fim', sessao: id, motivo, continuacao });

test('/clear na ordem real (fim antes do início, mesmo pid) herda a frente com vínculo', async () => {
  const a = { ...amb(p), pid: proc.pid, ...comHora };
  await tratar(inicio('s-a', 'novo'), a);
  gravarFrente(dir, frenteDe('s-a')); gravarSessao(dir, { ...lerSessao(dir, 's-a'), frente: 'carrinho' });
  await tratar(fimDe('s-a', 'clear', true), a);
  const velha = lerSessao(dir, 's-a');
  assert.equal(velha.fim, null);
  assert.ok(!Number.isNaN(Date.parse(velha.aguardandoContinuacao)));
  const r = await tratar(inicio('s-b', 'continuacao'), a);
  const f = lerFrente(dir, 'carrinho');
  assert.equal(f.dona, 's-b');
  assert.deepEqual(f.sessoesAnteriores, ['s-a']);
  assert.equal(lerSessao(dir, 's-b').frente, 'carrinho');
  assert.equal(lerSessao(dir, 's-a').motivoFim, 'substituida');
  assert.equal(lerSessao(dir, 's-a').aguardandoContinuacao, undefined);
  assert.match(r.contexto, /Sua frente: as-1 carrinho/);
  const h = lerEventos(dir).filter(e => e.tipo === 'heranca').at(-1);
  assert.deepEqual([h.de, h.sessao, h.frentes], ['s-a', 's-b', ['carrinho']]);
  assert.ok(lerEventos(dir).some(e => e.tipo === 'sessao-fim' && e.sessao === 's-a' && e.motivo === 'clear'));
});

test('/clear sem o início seguinte e com o processo morto: a frente fica órfã e o takeover passa', async t => {
  const morto = processoVivo();
  t.after(() => morto.matar());
  const o = p.ah(['open', 'clear-orfa'], { env: { AH_SESSAO: 's-x', AH_PID_AGENTE: String(morto.pid) } });
  assert.equal(o.codigo, 0, o.erro);
  await tratar(fimDe('s-x', 'clear', true), { ...amb(p), pid: morto.pid });
  assert.equal(lerSessao(dir, 's-x').fim, null);
  await morto.matar();
  const f = lerFrente(dir, 'clear-orfa');
  assert.ok(frenteOrfa(f, vidaDaDona(dir, 's-x', { config: amb(p).config })));
  const tk = p.ah(['takeover', 'clear-orfa', '--confirmado'], { env: { AH_SESSAO: 's-y' } });
  assert.equal(tk.codigo, 0, tk.erro);
  assert.equal(lerFrente(dir, 'clear-orfa').dona, 's-y');
});

test('fim com outro motivo continua encerrando a sessão', async () => {
  const a = { ...amb(p), pid: proc.pid, ...comHora };
  for (const [motivo, continuacao] of [['logout', false], ['other', false], [undefined, undefined]]) {
    await tratar(inicio('s-a', 'novo'), a);
    await tratar(fimDe('s-a', motivo, continuacao), a);
    const s = lerSessao(dir, 's-a');
    assert.deepEqual([Boolean(s.fim), s.motivoFim, s.aguardandoContinuacao], [true, 'fim', undefined], String(motivo));
  }
});

// ---- Segunda onda: a frente muda de dona antes de a sessão velha ser encerrada (a T4 nunca vê dona encerrada)
for (const origem of ['continuacao', 'novo']) {
  test(`continuarSessao (${origem}) grava a frente antes da sessão velha`, async t => {
    registrarSessao(dir, { id: 's-a', agente: 'claude', pid: proc.pid, pidInicio: '100' });
    registrarSessao(dir, { id: 's-b', agente: 'claude', pid: proc.pid, pidInicio: '100' });
    gravarFrente(dir, frenteDe('s-a'));
    const ordem = [];
    const original = fs.renameSync;
    fs.renameSync = (de, para) => { ordem.push(path.relative(dir, String(para))); return original(de, para); };
    t.after(() => { fs.renameSync = original; });
    await continuarSessao(dir, { sessao: 's-b', pid: proc.pid, pidInicio: '100', origem });
    fs.renameSync = original;
    const iFrente = ordem.indexOf(path.join('frentes', 'carrinho.json'));
    const iVelha = ordem.indexOf(path.join('sessoes', 's-a.json'));
    assert.ok(iFrente >= 0 && iVelha >= 0, ordem.join(', '));
    assert.ok(iFrente < iVelha, ordem.join(', '));
  });
}

test('frente ativa com o registro da dona ilegível não é "sem dona": o resumo avisa o registro ilegível', async () => {
  gravarFrente(dir, frenteDe('s-x'));
  fs.mkdirSync(path.join(dir, 'sessoes'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'sessoes', 's-x.json'), '{ quebrado');
  const r = await tratar(inicio('s-b', 'novo'), { ...amb(p), pid: proc.pid });
  assert.doesNotMatch(r.contexto, /Sem dona/);
  assert.doesNotMatch(r.contexto, /ah takeover carrinho/);
  assert.match(r.contexto, /Avisos: .*A frente as-1 carrinho: registro da dona ilegível \(ah doctor\)\./);
});

// ---- Reensaio: /resume de uma conversa que já tem frente (sessão executora não fica com duas)

async function resumeDeConversaComFrente({ papelDeX = 'executor' } = {}) {
  const a = { ...amb(p), pid: proc.pid, ...comHora };
  // A conversa X abre cupom (ticket #1) e termina.
  await tratar(inicio('s-x', 'novo'), a);
  gravarFrente(dir, { ...frenteDe('s-x', 'cupom', 'as-1'), tickets: [1] });
  gravarSessao(dir, { ...lerSessao(dir, 's-x'), frente: 'cupom', papel: papelDeX });
  await tratar(fimDe('s-x', 'other', false), a);
  // Sessão nova Y no mesmo processo abre frete; /clear (Y -> Z).
  await tratar(inicio('s-y', 'novo'), a);
  gravarFrente(dir, frenteDe('s-y', 'frete', 'as-2'));
  gravarSessao(dir, { ...lerSessao(dir, 's-y'), frente: 'frete' });
  await tratar(fimDe('s-y', 'clear', true), a);
  await tratar(inicio('s-z', 'continuacao'), a);
  assert.equal(lerFrente(dir, 'frete').dona, 's-z');
  // /resume X: fim de Z com resume, início com o id de X, que já existe.
  await tratar(fimDe('s-z', 'resume', true), a);
  return tratar(inicio('s-x', 'continuacao'), a);
}

test('/resume de conversa executora que já tem frente: a frente da sessão corrente fica passada, sem herança', async () => {
  const r = await resumeDeConversaComFrente();
  const cupom = lerFrente(dir, 'cupom');
  const frete = lerFrente(dir, 'frete');
  assert.deepEqual([cupom.estado, cupom.dona], ['ativa', 's-x']);
  assert.deepEqual([frete.estado, frete.dona, frete.passadaPor, frete.passadaDe], ['passada', null, 's-z', 's-z']);
  assert.ok(frete.passadaEm);
  const x = lerSessao(dir, 's-x');
  assert.deepEqual([x.frente, x.papel], ['cupom', 'executor']);
  assert.equal(lerSessao(dir, 's-z').motivoFim, 'substituida');
  const ev = lerEventos(dir).filter(e => e.tipo === 'frente-solta').at(-1);
  assert.deepEqual([ev.sessao, ev.frente, ev.por, ev.motivo], ['s-z', 'frete', 's-x', 'destino-ja-tem-frente']);
  assert.ok(!lerEventos(dir).some(e => e.tipo === 'heranca' && e.sessao === 's-x' && e.frentes.includes('frete')));
  assert.match(r.contexto, /A frente as-2 frete ficou passada; para retomar, tools\/ah open frete\./);
});

test('/resume: frente com tickets fica passada com o comentário de passagem na fila', async () => {
  const a = { ...amb(p), pid: proc.pid, ...comHora };
  await tratar(inicio('s-x', 'novo'), a);
  gravarFrente(dir, frenteDe('s-x', 'cupom', 'as-1'));
  gravarSessao(dir, { ...lerSessao(dir, 's-x'), frente: 'cupom' });
  await tratar(fimDe('s-x', 'other', false), a);
  await tratar(inicio('s-y', 'novo'), a);
  gravarFrente(dir, { ...frenteDe('s-y', 'frete', 'as-2'), tickets: [3] });
  gravarSessao(dir, { ...lerSessao(dir, 's-y'), frente: 'frete' });
  await tratar(fimDe('s-y', 'resume', true), a);
  await tratar(inicio('s-x', 'continuacao'), a);
  assert.equal(lerFrente(dir, 'frete').estado, 'passada');
  const ops = listarPendentes(dir).filter(op => op.ticket === 3);
  assert.equal(ops.length, 1);
  assert.match(ops[0].corpo, /ah:passagem id=as-2 .*estado=passada/);
});

test('/resume de conversa orquestradora com frente herda tudo, como antes', async () => {
  await resumeDeConversaComFrente({ papelDeX: 'orquestrador' });
  assert.deepEqual([lerFrente(dir, 'cupom').dona, lerFrente(dir, 'frete').dona], ['s-x', 's-x']);
  assert.equal(lerFrente(dir, 'frete').estado, 'ativa');
});

test('continuação em que o destino já é dona da frente em foco da velha: não duplica nem solta', async () => {
  const a = { ...amb(p), pid: proc.pid, ...comHora };
  await tratar(inicio('s-x', 'novo'), a);
  gravarFrente(dir, frenteDe('s-x', 'cupom', 'as-1'));
  gravarSessao(dir, { ...lerSessao(dir, 's-x'), frente: 'cupom' });
  await tratar(fimDe('s-x', 'other', false), a);
  await tratar(inicio('s-y', 'novo'), a);
  gravarSessao(dir, { ...lerSessao(dir, 's-y'), frente: 'cupom' }); // foco na mesma frente, sem ser dona
  await tratar(fimDe('s-y', 'resume', true), a);
  const r = await tratar(inicio('s-x', 'continuacao'), a);
  const cupom = lerFrente(dir, 'cupom');
  assert.deepEqual([cupom.estado, cupom.dona], ['ativa', 's-x']);
  assert.equal(lerSessao(dir, 's-x').frente, 'cupom');
  assert.ok(!lerEventos(dir).some(e => e.tipo === 'frente-solta' && e.motivo === 'destino-ja-tem-frente'));
  assert.doesNotMatch(r.contexto, /ficou passada/);
});
