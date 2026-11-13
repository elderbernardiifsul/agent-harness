// Terceira revisão do close em fases: o comentário de fechamento durável fora da trava, a fase 3 com a trava
// ocupada, a herança e o handoff no meio do fechamento, e as conferências entre as fases.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { criarProjeto } from './apoio/repo.mjs';
import { comTrava } from '../nucleo/lib/estado.mjs';
import { continuarSessao } from '../nucleo/lib/heranca.mjs';
import { listarPendentes } from '../nucleo/lib/pendentes.mjs';
import { corpoDaMarcacao } from '../nucleo/lib/reserva.mjs';
import { gravarSessao, lerSessao } from '../nucleo/lib/sessao.mjs';

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
  const r2 = p.ah(['close']);
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
