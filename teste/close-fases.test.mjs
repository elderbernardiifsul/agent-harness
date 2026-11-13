// Terceira revisão do close em fases: o comentário de fechamento durável fora da trava, a fase 3 com a trava
// ocupada, a herança e o handoff no meio do fechamento, e as conferências entre as fases.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { criarProjeto } from './apoio/repo.mjs';
import { comTrava } from '../nucleo/lib/estado.mjs';

const dirDe = p => path.join(p.estado, 'loja');
const arquivoDaFrente = (p, nome) => path.join(dirDe(p), 'frentes', `${nome}.json`);
const lerF = (p, nome = 'carrinho') => { try { return JSON.parse(fs.readFileSync(arquivoDaFrente(p, nome), 'utf8')); } catch { return null; } };
const gravarF = (p, f) => fs.writeFileSync(arquivoDaFrente(p, f.nome), JSON.stringify(f, null, 2));
const marcaDoFechamento = (p, nome = 'carrinho') => path.join(dirDe(p), 'fechamentos', `${nome}.json`);
// Chamadas do gh que comentam o fechamento (o gh falso registra a chamada ao começar, antes de qualquer pausa).
const chamadasDeFechamento = p => p.ghChamadas().filter(c => c.argv[0] === 'issue' && c.argv[1] === 'comment' && c.entrada.includes('ah:fechamento'));
// Comentários de fechamento que chegaram ao ticket.
const fechamentosNoTicket = (p, n = 1) => p.ghTicket(n).comments.filter(c => c.body.includes('ah:fechamento')).length;
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
