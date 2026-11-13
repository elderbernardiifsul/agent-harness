import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { criarProjeto, dirDoTeste, envelhecerSinal } from './apoio/repo.mjs';
import { contarPendentes, enfileirar } from '../nucleo/lib/pendentes.mjs';

const arquivoDaFrente = (p, nome) => path.join(dirDoTeste(p), 'frentes', `${nome}.json`);
const lerFrenteDoTeste = (p, nome) => JSON.parse(fs.readFileSync(arquivoDaFrente(p, nome), 'utf8'));
const gravarFrenteDoTeste = (p, f) => fs.writeFileSync(arquivoDaFrente(p, f.nome), JSON.stringify(f, null, 2));
const arquivoDaSessao = (p, id) => path.join(dirDoTeste(p), 'sessoes', `${id}.json`);
const eventos = p => fs.readFileSync(path.join(dirDoTeste(p), 'eventos.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const A = 'sessao-a-0001';
const B = 'sessao-b-0002';
const VELHA = 'sessao-velha-0004';
const OITO_DIAS_MIN = 8 * 24 * 60;

function projeto(t) {
  const p = criarProjeto();
  t.after(() => p.limpar());
  return p;
}

// Uma sessão registrada (pelo whoami) com o sinal recuado em `minutos`.
function sessaoComSinal(p, id, minutos) {
  assert.equal(p.ah(['whoami'], { env: { AH_SESSAO: id } }).codigo, 0);
  if (minutos) envelhecerSinal(p, id, minutos);
}

// O cenário do plano: frente órfã (dona com sinal vencido), frente com o worktree apagado à mão, worktree solto
// no padrão, sessão velha sem frente e um item na fila.
function cenario(t) {
  const p = projeto(t);
  assert.equal(p.ah(['open', 'orfa'], { env: { AH_SESSAO: A } }).codigo, 0);
  envelhecerSinal(p, A, 300);
  assert.equal(p.ah(['open', 'sumida'], { env: { AH_SESSAO: B } }).codigo, 0);
  fs.rmSync(lerFrenteDoTeste(p, 'sumida').worktree, { recursive: true, force: true });
  const solto = path.join(p.env.AH_WORKTREES, 'solto');
  assert.equal(p.git(['worktree', 'add', '-b', 'feat/solto', solto, 'dev']).codigo, 0);
  fs.writeFileSync(path.join(solto, 'novo.txt'), 'x\n');
  sessaoComSinal(p, VELHA, OITO_DIAS_MIN);
  enfileirar(dirDoTeste(p), { tipo: 'comentario', ticket: 1, corpo: 'comentário que ficou' });
  return { p, solto };
}

test('sweep sem nada fora do lugar', t => {
  const p = projeto(t);
  const r = p.ah(['sweep']);
  assert.equal(r.codigo, 0, r.erro);
  assert.equal(r.saida, 'Nada fora do lugar.\n');
  assert.deepEqual(JSON.parse(p.ah(['sweep', '--json']).saida), { reparos: [], achados: [] });
});

test('sweep acha frente órfã, worktree sumido, worktree sem frente, sessão morta e pendentes', t => {
  const { p, solto } = cenario(t);
  const chamadas = p.ghChamadas().length;
  const r = p.ah(['sweep'], { env: { AH_SESSAO: '' } });
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.saida, /^- frente-orfa: .*orfa.*\. Faça: ah takeover orfa \(com a ordem do executivo\)$/m);
  assert.match(r.saida, /^- worktree-sumiu: .*sumida.*\. Faça: ah close sumida$/m);
  assert.match(r.saida, new RegExp(`^- worktree-sem-frente: ${solto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} .*feat/solto.*1 arquivo sujo.*\\. Faça: ah sweep --reparar$`, 'm'));
  assert.match(r.saida, new RegExp(`^- sessao-morta: ${VELHA}.*\\. Faça: ah sweep --reparar$`, 'm'));
  assert.match(r.saida, /^- pendentes: 1 operação \(#1\)\. Faça: ah sweep --reparar \(com rede\)$/m);
  assert.doesNotMatch(r.saida, /frente-orfa: .*sumida/);
  assert.doesNotMatch(r.saida, new RegExp(`sessao-morta: ${A}`));
  assert.doesNotMatch(r.saida, /Reparos/);
  // Sem --reparar: nada muda e a rede não é chamada.
  assert.equal(p.ghChamadas().length, chamadas);
  assert.equal(contarPendentes(dirDoTeste(p)), 1);
  assert.ok(fs.existsSync(arquivoDaSessao(p, VELHA)));
  const j = JSON.parse(p.ah(['sweep', '--json']).saida);
  assert.deepEqual(j.reparos, []);
  assert.deepEqual([...new Set(j.achados.map(a => a.tipo))].sort(), ['frente-orfa', 'pendentes', 'sessao-morta', 'worktree-sem-frente', 'worktree-sumiu']);
  for (const a of j.achados) assert.ok(a.detalhe && a.saida, JSON.stringify(a));
});

test('sweep --reparar só mexe no estado', async t => {
  const { p, solto } = cenario(t);
  const r = p.ah(['sweep', '--reparar']);
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.saida, /^Reparos:\n/);
  const f = lerFrenteDoTeste(p, 'solto');
  assert.deepEqual([f.estado, f.reconstruida, f.dona, f.ramo, f.worktree, f.id], ['passada', true, null, 'feat/solto', solto, 'as-3']);
  assert.deepEqual(f.tickets, []);
  assert.equal(f.reserva, null);
  assert.ok(!fs.existsSync(arquivoDaSessao(p, VELHA)));
  assert.ok(fs.existsSync(arquivoDaSessao(p, A)), 'a dona da frente órfã fica');
  assert.ok(fs.existsSync(path.join(solto, 'novo.txt')), 'o worktree fica');
  assert.equal(p.git(['show-ref', '--verify', '--quiet', 'refs/heads/feat/solto']).codigo, 0, 'o ramo fica');
  assert.equal(lerFrenteDoTeste(p, 'orfa').dona, A);
  assert.equal(lerFrenteDoTeste(p, 'sumida').dona, B);
  assert.equal(contarPendentes(dirDoTeste(p)), 0);
  assert.equal(p.ghTicket(1).comments.at(-1).body, 'comentário que ficou');
  assert.match(r.saida, new RegExp(`apaguei a sessão ${VELHA}`));
  assert.match(r.saida, /reconstruí a frente as-3 solto/);
  assert.match(r.saida, /pendentes: 1 enviada/);
  // Depois dos reparos, ficam os achados que pedem gente.
  assert.match(r.saida, /- frente-orfa: .*orfa/);
  assert.match(r.saida, /- worktree-sumiu: .*sumida/);
  assert.doesNotMatch(r.saida, /- (worktree-sem-frente|sessao-morta|pendentes):/);
  const reparos = eventos(p).filter(e => e.tipo === 'reparo');
  assert.equal(reparos.length, 3);
  // Repetir não faz nada novo.
  const de2 = p.ah(['sweep', '--reparar', '--json']);
  assert.deepEqual(JSON.parse(de2.saida).reparos, []);
  assert.match(p.ah(['sweep', '--reparar']).saida, /^Reparos: nada a fazer\.\n/);
});

test('arquivo de frente ilegível: sweep e board avisam sem quebrar', t => {
  const p = projeto(t);
  p.ah(['open', 'carrinho']);
  fs.writeFileSync(path.join(dirDoTeste(p), 'frentes', 'x.json'), '{');
  const s = p.ah(['sweep']);
  assert.equal(s.codigo, 0, s.erro);
  assert.match(s.saida, /estado-ilegivel: .*x\.json\. Faça: apague ou conserte o arquivo \(rode ah doctor\)/);
  const b = p.ah(['board']);
  assert.equal(b.codigo, 0);
  assert.match(b.erro, /Aviso: arquivo de frente ilegível: .*x\.json \(rode ah doctor\)/);
  assert.match(b.saida, /carrinho/);
  // O reparo nunca apaga o arquivo ilegível nem reconstrói frente por cima dele.
  const x = path.join(p.env.AH_WORKTREES, 'x');
  assert.equal(p.git(['worktree', 'add', '-b', 'feat/x', x, 'dev']).codigo, 0);
  const r = p.ah(['sweep', '--reparar']);
  assert.equal(r.codigo, 0, r.erro);
  assert.equal(fs.readFileSync(path.join(dirDoTeste(p), 'frentes', 'x.json'), 'utf8'), '{');
});

test('sessão ilegível aparece como estado-ilegivel e não é apagada', t => {
  const p = projeto(t);
  const arq = arquivoDaSessao(p, 'sessao-c-0003');
  fs.mkdirSync(path.dirname(arq), { recursive: true });
  fs.writeFileSync(arq, 'não é json');
  assert.match(p.ah(['sweep']).saida, /- estado-ilegivel: .*sessao-c-0003\.json\./);
  p.ah(['sweep', '--reparar']);
  assert.ok(fs.existsSync(arq));
});

test('frente com dona ilegível não vira órfã (o takeover recusaria): só o estado-ilegivel', t => {
  const p = projeto(t);
  p.ah(['open', 'carrinho']);
  fs.writeFileSync(arquivoDaSessao(p, 'sessao-teste-0001'), '{');
  const r = p.ah(['sweep']);
  assert.match(r.saida, /- estado-ilegivel: .*sessao-teste-0001\.json/);
  assert.doesNotMatch(r.saida, /frente-orfa/);
});

test('frente ativa sem dona é órfã; frente passada não', t => {
  const p = projeto(t);
  p.ah(['open', 'carrinho']);
  p.ah(['open', 'frete'], { env: { AH_SESSAO: B } });
  gravarFrenteDoTeste(p, { ...lerFrenteDoTeste(p, 'carrinho'), dona: null });
  gravarFrenteDoTeste(p, { ...lerFrenteDoTeste(p, 'frete'), dona: null, estado: 'passada', passadaPor: B, passadaEm: new Date().toISOString() });
  const r = p.ah(['sweep']);
  assert.match(r.saida, /- frente-orfa: frente as-1 carrinho, sem dona\. Faça: ah takeover carrinho/);
  assert.doesNotMatch(r.saida, /frente-orfa: .*frete/);
});

test('abertura parada é achado, com as saídas do open', t => {
  const p = projeto(t);
  p.ah(['open', 'carrinho']);
  const f = lerFrenteDoTeste(p, 'carrinho');
  // Um pid que não existe: o open que gravou o registro morreu.
  gravarFrenteDoTeste(p, { ...f, estado: 'abrindo', processo: { pid: 2 ** 22 + 12345, inicio: null } });
  const r = p.ah(['sweep']);
  assert.match(r.saida, /- abertura-parada: frente as-1 carrinho.*\. Faça: ah open carrinho para terminar, ou ah close carrinho para desistir$/m);
  assert.doesNotMatch(r.saida, /frente-orfa|worktree-sumiu|ramo-sumiu/);
  p.ah(['sweep', '--reparar']);
  assert.equal(lerFrenteDoTeste(p, 'carrinho').estado, 'abrindo');
});

test('ramo sumido, principal fora da base e sujo', t => {
  const p = projeto(t);
  p.ah(['open', 'carrinho']);
  gravarFrenteDoTeste(p, { ...lerFrenteDoTeste(p, 'carrinho'), ramo: 'feat/nao-existe' });
  assert.equal(p.git(['switch', '-c', 'outro']).codigo, 0);
  fs.writeFileSync(path.join(p.raiz, 'README.md'), 'mudado\n');
  const r = p.ah(['sweep']);
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.saida, /^- ramo-sumiu: frente as-1 carrinho, ramo feat\/nao-existe\. Faça: confira com quem abriu; ah close carrinho$/m);
  assert.match(r.saida, /^- principal-fora-da-base: .* está no ramo outro, não em dev\. Faça: git switch dev no principal$/m);
  assert.match(r.saida, /^- principal-sujo: .*1 arquivo.*\. Faça: commit por caminho ou combine com a dona$/m);
});

test('worktree fora do padrão: achado com git worktree remove e o reparo não reconstrói', t => {
  const p = projeto(t);
  const outro = path.join(p.env.AH_WORKTREES, 'outro');
  assert.equal(p.git(['worktree', 'add', '-b', 'x/outro', outro, 'dev']).codigo, 0);
  const r = p.ah(['sweep', '--reparar']);
  assert.match(r.saida, /^Reparos: nada a fazer\.\n/);
  assert.match(r.saida, /- worktree-sem-frente: .*outro.*x\/outro.*\. Faça: confira e git worktree remove à mão$/m);
  assert.ok(!fs.existsSync(arquivoDaFrente(p, 'outro')));
});

test('sessão morta: dona de frente ativa nunca; quem passou a frente há menos de 7 dias também não', t => {
  const p = projeto(t);
  p.ah(['open', 'carrinho'], { env: { AH_SESSAO: A } });
  envelhecerSinal(p, A, OITO_DIAS_MIN);
  p.ah(['open', 'frete'], { env: { AH_SESSAO: B } });
  envelhecerSinal(p, B, OITO_DIAS_MIN);
  const passada = { ...lerFrenteDoTeste(p, 'frete'), dona: null, estado: 'passada', passadaPor: B, passadaEm: new Date().toISOString() };
  gravarFrenteDoTeste(p, passada);
  let r = p.ah(['sweep', '--reparar']);
  assert.doesNotMatch(r.saida, /sessao-morta|apaguei/);
  assert.ok(fs.existsSync(arquivoDaSessao(p, A)));
  assert.ok(fs.existsSync(arquivoDaSessao(p, B)));
  // Passada há mais de 7 dias: a sessão que a passou já pode ir.
  gravarFrenteDoTeste(p, { ...passada, passadaEm: new Date(Date.now() - OITO_DIAS_MIN * 60000).toISOString() });
  r = p.ah(['sweep', '--reparar']);
  assert.match(r.saida, new RegExp(`apaguei a sessão ${B}`));
  assert.ok(!fs.existsSync(arquivoDaSessao(p, B)));
  assert.ok(fs.existsSync(arquivoDaSessao(p, A)));
});

test('reparo limpa o foco da sessão que aponta para frente inexistente ou de outra dona', t => {
  const p = projeto(t);
  p.ah(['open', 'carrinho'], { env: { AH_SESSAO: A } });
  sessaoComSinal(p, B, 0);
  sessaoComSinal(p, 'sessao-c-0003', 0);
  const gravarFoco = (id, frente) => {
    const s = JSON.parse(fs.readFileSync(arquivoDaSessao(p, id), 'utf8'));
    fs.writeFileSync(arquivoDaSessao(p, id), JSON.stringify({ ...s, frente }));
  };
  gravarFoco(B, 'carrinho');
  gravarFoco('sessao-c-0003', 'sumiu');
  const r = p.ah(['sweep', '--reparar']);
  assert.match(r.saida, /tirei o foco da sessão sessao-b-0002 em carrinho/);
  assert.match(r.saida, /tirei o foco da sessão sessao-c-0003 em sumiu/);
  const foco = id => JSON.parse(fs.readFileSync(arquivoDaSessao(p, id), 'utf8')).frente;
  assert.equal(foco(B), null);
  assert.equal(foco('sessao-c-0003'), null);
  assert.equal(foco(A), 'carrinho');
});

test('sweep recusa opção desconhecida', t => {
  const p = projeto(t);
  const r = p.ah(['sweep', '--tudo']);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /^Recusado: Opção desconhecida: --tudo\nFaça: use ah sweep/);
});
