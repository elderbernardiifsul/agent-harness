// Terceira revisão do close em fases: o comentário de fechamento durável fora da trava, a fase 3 com a trava
// ocupada, a herança e o handoff no meio do fechamento, e as conferências entre as fases.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { criarProjeto, envelhecerSinal } from './apoio/repo.mjs';
import { comTrava } from '../nucleo/lib/estado.mjs';
import { continuarSessao } from '../nucleo/lib/heranca.mjs';
import { listarPendentes } from '../nucleo/lib/pendentes.mjs';
import { corpoDaMarcacao } from '../nucleo/lib/reserva.mjs';
import { gravarSessao, lerSessao, registrarSessao } from '../nucleo/lib/sessao.mjs';
import { inicioDoProcesso } from '../nucleo/lib/vida.mjs';

const dirDe = p => path.join(p.estado, 'loja');
const arquivoDaFrente = (p, nome) => path.join(dirDe(p), 'frentes', `${nome}.json`);
const lerF = (p, nome = 'carrinho') => { try { return JSON.parse(fs.readFileSync(arquivoDaFrente(p, nome), 'utf8')); } catch { return null; } };
const gravarF = (p, f) => fs.writeFileSync(arquivoDaFrente(p, f.nome), JSON.stringify(f, null, 2));
const marcaDoFechamento = (p, nome = 'carrinho') => path.join(dirDe(p), 'fechamentos', `${nome}.json`);
// Chamadas do gh que comentam o fechamento (o gh falso registra a chamada ao começar, antes de qualquer pausa).
const chamadasDeFechamento = p => p.ghChamadas().filter(c => c.argv[0] === 'issue' && c.argv[1] === 'comment' && c.entrada.includes('ah:fechamento'));
// Comentários de fechamento que chegaram ao ticket.
const fechamentosNoTicket = (p, n = 1) => p.ghTicket(n).comments.filter(c => c.body.includes('ah:fechamento')).length;
// Comentário posto no ticket do gh falso por fora do ah, na ordem do servidor (o número segue a sequência dele).
const comentarNoTicket = (p, n, autor, body) => {
  const t = JSON.parse(fs.readFileSync(p.env.GH_FALSO_TICKETS, 'utf8'));
  t._seq = (t._seq ?? 1000) + 1;
  t[n].comments.push({ author: autor, body, numero: t._seq });
  fs.writeFileSync(p.env.GH_FALSO_TICKETS, JSON.stringify(t, null, 2));
};
const linhaNoQuadro = (p, nome = 'carrinho') => p.ah(['board']).saida.split('\n').find(l => l.includes(` ${nome} `)) ?? '';
const JA_COMENTADO = /os tickets já receberam o comentário de fechamento, e o próximo ah close não comenta de novo/;

// Projeto com a frente carrinho (ticket #1) aberta, um commit nela e o ramo mesclado na base.
function comFrente(nome = 'carrinho') {
  const p = criarProjeto();
  assert.equal(p.ah(['open', nome, '--tickets', '1']).codigo, 0);
  const wt = lerF(p, nome).worktree;
  fs.writeFileSync(path.join(wt, 'a.txt'), 'a');
  p.git(['add', 'a.txt'], { cwd: wt });
  p.git(['commit', '-m', 'feat: a'], { cwd: wt });
  assert.equal(p.git(['merge', '--no-ff', `feat/${nome}`, '-m', 'merge']).codigo, 0);
  return { p, wt };
}

const esperarQue = async (cond, oque, ms = 15000) => {
  const ate = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > ate) throw new Error(`não aconteceu: ${oque}`);
    await new Promise(r => setTimeout(r, 25));
  }
};

// `ah close` ao fundo que para no comentário de fechamento (gh falso) até `soltar()`.
let pausas = 0;
function closeParado(t, p, args = ['close'], env = {}) {
  const pausa = path.join(path.dirname(p.raiz), `pausa-${++pausas}`);
  const c = p.ahAoFundo(args, { env: { GH_FALSO_PAUSA_COMENTARIO: pausa, GH_FALSO_PAUSA_TEXTO: 'ah:fechamento', ...env } });
  const soltar = () => { try { fs.writeFileSync(`${pausa}.solta`, ''); } catch { /* pasta já limpa */ } };
  t.after(() => { c.processo.kill('SIGKILL'); soltar(); });
  return {
    ...c,
    soltar,
    chegou: () => esperarQue(() => fs.existsSync(`${pausa}.chegou`), `${pausa}.chegou`),
    // pid do gh falso parado no comentário.
    pidDoGh: () => Number(fs.readFileSync(`${pausa}.chegou`, 'utf8')),
  };
}

// Close que comentou e parou na fase 3 com a trava das frentes ocupada (espera curta pelo ponto de troca).
async function closeQueParouNaFase3(t, p, env = {}) {
  const c = closeParado(t, p, ['close'], { AH_CLOSE_ESPERA_DA_TRAVA_MS: '300', ...env });
  await c.chegou();
  return comTrava(dirDe(p), 'frentes', async () => {
    c.soltar();
    return c.fim;
  }, { venceMs: 120000 });
}

// ---- Achado 1: o fato "comentado" durável assim que o comentário sai, sem depender da trava das frentes

test('fase 3 com a trava das frentes ocupada além da espera: a recusa diz que os tickets já têm o comentário e o close seguinte não comenta de novo', async t => {
  const { p, wt } = comFrente();
  t.after(() => p.limpar());
  const r = await closeQueParouNaFase3(t, p);
  assert.equal(r.codigo, 1, r.saida);
  assert.match(r.erro, /pela trava "frentes"/);
  assert.match(r.erro, /Faça: .*rode ah close carrinho de novo/);
  assert.match(r.erro, JA_COMENTADO);
  assert.equal(chamadasDeFechamento(p).length, 1);
  assert.match(linhaNoQuadro(p), /fechamento parado/);
  // Comentado em todos os tickets: o close seguinte nem precisa do GitHub.
  const r2 = p.ah(['close'], { env: { GH_FALSO_FORA: '1' } });
  assert.equal(r2.codigo, 0, r2.erro);
  assert.equal(chamadasDeFechamento(p).length, 1);
  assert.ok(!fs.existsSync(wt));
  assert.ok(!fs.existsSync(marcaDoFechamento(p)), 'a marca do fechamento sai com a frente');
});

test('close morto (SIGKILL) com o comentário a caminho: o quadro mostra fechamento parado e o close seguinte não comenta de novo', async t => {
  const { p } = comFrente();
  t.after(() => p.limpar());
  const c = closeParado(t, p);
  await c.chegou();
  c.processo.kill('SIGKILL');
  await c.fim;
  c.soltar();
  // O gh falso termina o comentário depois de o close morrer.
  await esperarQue(() => fechamentosNoTicket(p) === 1, 'o comentário de fechamento no ticket');
  assert.match(linhaNoQuadro(p), /fechamento parado/);
  // Sem rede não se sabe se o comentário saiu: recusa sem comentar.
  const semRede = p.ah(['close'], { env: { GH_FALSO_FORA: '1' } });
  assert.equal(semRede.codigo, 1, semRede.saida);
  assert.match(semRede.erro, /preciso do GitHub para saber em que tickets ele saiu.*\nFaça: tente de novo com rede: ah close carrinho; nada foi apagado/);
  const r2 = p.ah(['close']);
  assert.equal(r2.codigo, 0, r2.erro);
  assert.equal(chamadasDeFechamento(p).length, 1);
  assert.equal(fechamentosNoTicket(p), 1);
  assert.ok(!fs.existsSync(marcaDoFechamento(p)));
});

test('close morto antes de o comentário chegar ao ticket: o close seguinte comenta (uma vez)', async t => {
  const { p } = comFrente();
  t.after(() => p.limpar());
  const c = closeParado(t, p);
  await c.chegou();
  const gh = c.pidDoGh();
  c.processo.kill('SIGKILL');
  process.kill(gh, 'SIGKILL');
  await c.fim;
  assert.equal(fechamentosNoTicket(p), 0);
  const r2 = p.ah(['close']);
  assert.equal(r2.codigo, 0, r2.erro);
  assert.equal(fechamentosNoTicket(p), 1);
});

// ---- Achado 2: a herança (continuação de sessão no mesmo processo) no meio do fechamento

// A sessão dona da frente passa a ter processo conhecido, para a continuação no mesmo processo a substituir.
const comProcesso = p => gravarSessao(dirDe(p), { ...lerSessao(dirDe(p), 'sessao-teste-0001'), pid: process.pid, pidInicio: '100' });
const continuar = (p, sessao, origem) => continuarSessao(dirDe(p), { sessao, pid: process.pid, pidInicio: '100', origem });
const passagensNaFila = p => listarPendentes(dirDe(p)).filter(op => op.tipo === 'comentario' && op.corpo.includes('ah:passagem'));

test('começo novo no mesmo processo durante o fechamento: a frente vai para a sessão nova sem passar, e o close termina', async t => {
  const { p } = comFrente();
  t.after(() => p.limpar());
  comProcesso(p);
  const c = closeParado(t, p);
  await c.chegou();
  const r = await continuar(p, 'sessao-nova-0009', 'novo');
  assert.deepEqual(r.soltas, []);
  assert.deepEqual([lerF(p).estado, lerF(p).dona], ['ativa', 'sessao-nova-0009']);
  assert.ok(lerF(p).fechando, 'a marca do close fica');
  c.soltar();
  const fim = await c.fim;
  assert.equal(fim.codigo, 0, fim.erro);
  assert.equal(lerF(p), null);
  assert.equal(chamadasDeFechamento(p).length, 1);
});

test('continuação num destino que já tem frente, durante o fechamento: a frente não é passada nem ganha passagem na fila', async t => {
  const { p } = comFrente();
  t.after(() => p.limpar());
  assert.equal(p.ah(['open', 'frete'], { env: { AH_SESSAO: 'sessao-nova-0009' } }).codigo, 0);
  comProcesso(p);
  const c = closeParado(t, p);
  await c.chegou();
  await continuar(p, 'sessao-nova-0009', 'continuacao');
  assert.deepEqual([lerF(p).estado, lerF(p).dona], ['ativa', 'sessao-nova-0009']);
  assert.deepEqual(passagensNaFila(p), []);
  c.soltar();
  const fim = await c.fim;
  assert.equal(fim.codigo, 0, fim.erro);
  assert.equal(lerF(p), null);
  assert.equal(lerF(p, 'frete').estado, 'ativa');
});

test('fechamento parado (close já morto) e começo novo no mesmo processo: a frente não é passada e o close seguinte não comenta de novo', async t => {
  const { p } = comFrente();
  t.after(() => p.limpar());
  comProcesso(p);
  const r = await closeQueParouNaFase3(t, p);
  assert.equal(r.codigo, 1, r.saida);
  await continuar(p, 'sessao-nova-0009', 'novo');
  assert.deepEqual([lerF(p).estado, lerF(p).dona], ['ativa', 'sessao-nova-0009']);
  assert.match(linhaNoQuadro(p), /fechamento parado/);
  const r2 = p.ah(['close', 'carrinho'], { env: { AH_SESSAO: 'sessao-nova-0009' } });
  assert.equal(r2.codigo, 0, r2.erro);
  assert.equal(chamadasDeFechamento(p).length, 1);
});

test('frente que ficou passada depois do comentário de fechamento: o close seguinte confere quem a tem e comenta o fechamento de novo', async t => {
  const { p } = comFrente();
  t.after(() => p.limpar());
  const r = await closeQueParouNaFase3(t, p);
  assert.equal(r.codigo, 1, r.saida);
  // Como uma passagem feita por um caminho que não respeitava a marca: registro passado e passagem no ticket.
  const f = lerF(p);
  gravarF(p, { ...f, estado: 'passada', dona: null, passadaEm: new Date().toISOString(), passadaPor: 'sessao-teste-0001' });
  const corpo = corpoDaMarcacao({ frente: f, tipo: 'passagem', texto: 'Passagem.', login: 'ana-souza', sessao: 'sessao-teste-0001' });
  comentarNoTicket(p, 1, 'ana-souza', corpo);
  assert.doesNotMatch(linhaNoQuadro(p), /fechamento parado/);
  const r2 = p.ah(['close', 'carrinho'], { env: { AH_SESSAO: 'sessao-outra-0007' } });
  assert.equal(r2.codigo, 0, r2.erro);
  assert.match(r2.saida, /Frente as-1 carrinho fechada\./);
  const ultimo = p.ghTicket(1).comments.at(-1).body;
  assert.match(ultimo, /ah:fechamento id=as-1 /);
  assert.equal(fechamentosNoTicket(p), 2);
});

// ---- Achado 3: handoff de frente com o fechamento parado

test('handoff de frente com o fechamento parado recusa e diz para terminar com ah close', async t => {
  const { p } = comFrente();
  t.after(() => p.limpar());
  const r = await closeQueParouNaFase3(t, p);
  assert.equal(r.codigo, 1, r.saida);
  const antes = p.ghChamadas().length;
  const h = p.ah(['handoff']);
  assert.equal(h.codigo, 1, h.saida);
  assert.match(h.erro, /^Recusado: A frente as-1 carrinho está com o fechamento parado: os tickets já receberam \(ou estavam recebendo\) o comentário de fechamento\.\nFaça: termine com ah close carrinho \(não comenta de novo\)/);
  assert.equal(p.ghChamadas().length, antes);
  assert.equal(temRamoNoRemoto(p), false, 'o handoff empurrou o ramo');
  assert.equal(lerF(p).estado, 'ativa');
  assert.equal(passagensNaFila(p).length, 0);
  const c = p.ah(['close']);
  assert.equal(c.codigo, 0, c.erro);
  assert.equal(chamadasDeFechamento(p).length, 1);
});

// ---- Achado 4: as conferências entre as fases, cada uma com um teste que a pega

const temRamoNoRemoto = (p, ramo = 'feat/carrinho') => p.git(['ls-remote', '--heads', 'origin', ramo]).saida.trim() !== '';
// `ah handoff` ao fundo com o push parado por um gancho pre-receive no remoto de teste, até `soltar()`.
function handoffParadoNoPush(t, p) {
  const pausa = path.join(path.dirname(p.raiz), `pausa-push-${++pausas}`);
  fs.writeFileSync(path.join(p.remoto, 'hooks', 'pre-receive'),
    `#!/bin/sh\ntouch '${pausa}.chegou'\ni=0\nwhile [ ! -e '${pausa}.solta' ] && [ $i -lt 200 ]; do sleep 0.1; i=$((i+1)); done\n`, { mode: 0o755 });
  const h = p.ahAoFundo(['handoff']);
  const soltar = () => { try { fs.writeFileSync(`${pausa}.solta`, ''); } catch { /* pasta já limpa */ } };
  t.after(() => { h.processo.kill('SIGKILL'); soltar(); });
  return { ...h, soltar, chegou: () => esperarQue(() => fs.existsSync(`${pausa}.chegou`), `${pausa}.chegou`) };
}
const semGancho = process.platform === 'win32' ? 'gancho do remoto em sh' : false;

test('takeover recusa a frente órfã que está sendo fechada', async t => {
  const { p } = comFrente();
  t.after(() => p.limpar());
  envelhecerSinal(p, 'sessao-teste-0001', 500);
  const c = closeParado(t, p, ['close', 'carrinho'], { AH_SESSAO: 'sessao-teste-0002' });
  await c.chegou();
  const tk = p.ah(['takeover', 'carrinho', '--confirmado'], { env: { AH_SESSAO: 'sessao-teste-0003' } });
  assert.equal(tk.codigo, 1, tk.saida);
  assert.match(tk.erro, /^Recusado: A frente as-1 carrinho está sendo fechada agora \(processo \d+\)\./);
  assert.equal(lerF(p).dona, 'sessao-teste-0001');
  c.soltar();
  const fim = await c.fim;
  assert.equal(fim.codigo, 0, fim.erro);
});

test('handoff durante o fechamento recusa na primeira fase, antes do push', async t => {
  const { p } = comFrente();
  t.after(() => p.limpar());
  const c = closeParado(t, p);
  await c.chegou();
  const h = p.ah(['handoff']);
  assert.equal(h.codigo, 1, h.saida);
  assert.match(h.erro, /está sendo fechada agora/);
  assert.equal(temRamoNoRemoto(p), false, 'o handoff empurrou o ramo');
  c.soltar();
  assert.equal((await c.fim).codigo, 0);
});

test('close que começa durante o push do handoff: a segunda fase do handoff recusa', { skip: semGancho }, async t => {
  const { p } = comFrente();
  t.after(() => p.limpar());
  const h = handoffParadoNoPush(t, p);
  await h.chegou();
  const c = closeParado(t, p);
  await c.chegou();
  h.soltar();
  const rh = await h.fim;
  assert.equal(rh.codigo, 1, rh.saida);
  assert.match(rh.erro, /^Recusado: A frente as-1 carrinho está sendo fechada agora/);
  assert.equal(lerF(p).estado, 'ativa');
  c.soltar();
  const rc = await c.fim;
  assert.equal(rc.codigo, 0, rc.erro);
});

test('close que comenta e para durante o push do handoff: a segunda fase do handoff recusa pelo fechamento parado', { skip: semGancho }, async t => {
  const { p } = comFrente();
  t.after(() => p.limpar());
  const h = handoffParadoNoPush(t, p);
  await h.chegou();
  const r = await closeQueParouNaFase3(t, p);
  assert.equal(r.codigo, 1, r.saida);
  h.soltar();
  const rh = await h.fim;
  assert.equal(rh.codigo, 1, rh.saida);
  assert.match(rh.erro, /^Recusado: A frente as-1 carrinho está com o fechamento parado/);
  assert.equal(lerF(p).estado, 'ativa');
  assert.deepEqual(passagensNaFila(p), []);
});

test('marca de outro close no registro durante a fase de rede: a fase 3 recusa sem apagar e o close seguinte não comenta de novo', async t => {
  const { p, wt } = comFrente();
  t.after(() => p.limpar());
  const c = closeParado(t, p);
  await c.chegou();
  // Como se outro close (vivo: o processo deste teste) tivesse tomado a frente no meio.
  gravarF(p, { ...lerF(p), fechando: { pid: process.pid, inicio: inicioDoProcesso(process.pid) } });
  c.soltar();
  const r = await c.fim;
  assert.equal(r.codigo, 1, r.saida);
  assert.match(r.erro, /^Recusado: A frente carrinho mudou durante o fechamento \(agora: as-1, ativa\)\.\nFaça: rode ah board para ver como ela está; os tickets já receberam o comentário de fechamento, e o próximo ah close não comenta de novo/);
  assert.ok(fs.existsSync(wt));
  assert.equal(lerF(p).fechando.pid, process.pid, 'a marca do outro fica');
  const f = lerF(p);
  delete f.fechando;
  gravarF(p, f);
  const r2 = p.ah(['close']);
  assert.equal(r2.codigo, 0, r2.erro);
  assert.equal(chamadasDeFechamento(p).length, 1);
});

test('recusa na fase de rede (sem GitHub para a frente passada) tira a marca do registro', t => {
  const { p } = comFrente();
  t.after(() => p.limpar());
  assert.equal(p.ah(['handoff']).codigo, 0);
  const r = p.ah(['close', 'carrinho'], { env: { AH_SESSAO: 'sessao-teste-0002', GH_FALSO_FORA: '1' } });
  assert.equal(r.codigo, 1, r.saida);
  assert.match(r.erro, /preciso do GitHub para confirmar que ninguém retomou carrinho/);
  assert.equal(lerF(p).fechando, undefined);
});

test('ramo base trocado durante a fase de rede: a fase 3 recusa, tira a marca, e o close seguinte termina sem comentar de novo', async t => {
  const { p } = comFrente();
  t.after(() => p.limpar());
  const c = closeParado(t, p);
  await c.chegou();
  assert.equal(p.git(['switch', '-c', 'outro']).codigo, 0);
  c.soltar();
  const r = await c.fim;
  assert.equal(r.codigo, 1, r.saida);
  assert.match(r.erro, /^Recusado: O checkout principal não está no ramo base dev\.\nFaça: .*git switch dev; os tickets já receberam o comentário de fechamento, e o próximo ah close não comenta de novo/);
  assert.equal(lerF(p).fechando, undefined);
  assert.doesNotMatch(p.git(['log', '-1', '--format=%s']).saida, /fecha as-1/);
  assert.equal(p.git(['switch', 'dev']).codigo, 0);
  const r2 = p.ah(['close']);
  assert.equal(r2.codigo, 0, r2.erro);
  assert.equal(chamadasDeFechamento(p).length, 1);
});

test('continuação de sessão durante o fechamento: a fase 3 vale pelo registro relido e solta o foco da sessão nova', async t => {
  const { p } = comFrente();
  t.after(() => p.limpar());
  comProcesso(p);
  registrarSessao(dirDe(p), { id: 'sessao-nova-0009', agente: 'claude-code' });
  const c = closeParado(t, p);
  await c.chegou();
  await continuar(p, 'sessao-nova-0009', 'continuacao');
  assert.deepEqual([lerF(p).dona, lerSessao(dirDe(p), 'sessao-nova-0009').frente], ['sessao-nova-0009', 'carrinho']);
  c.soltar();
  const r = await c.fim;
  assert.equal(r.codigo, 0, r.erro);
  assert.equal(lerSessao(dirDe(p), 'sessao-nova-0009').frente, null);
});
