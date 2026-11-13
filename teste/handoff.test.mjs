import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { criarProjeto, dirDoTeste, envelhecerSinal, outraMaquina } from './apoio/repo.mjs';
import { contarPendentes, enfileirar } from '../nucleo/lib/pendentes.mjs';

const arquivoDaFrente = (p, nome) => path.join(dirDoTeste(p), 'frentes', `${nome}.json`);
const lerFrenteDoTeste = (p, nome) => JSON.parse(fs.readFileSync(arquivoDaFrente(p, nome), 'utf8'));
const eventos = p => fs.readFileSync(path.join(dirDoTeste(p), 'eventos.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const B = { env: { AH_SESSAO: 'sessao-b-0002' } };

// Projeto com a frente carrinho aberta (ticket #1) e um commit nela.
function comFrente(t, opcoes = {}, { tickets = '1' } = {}) {
  const p = criarProjeto(opcoes);
  t.after(() => p.limpar());
  const r = p.ah(['open', 'carrinho', ...(tickets ? ['--tickets', tickets] : [])]);
  assert.equal(r.codigo, 0, r.erro);
  const wt = lerFrenteDoTeste(p, 'carrinho').worktree;
  fs.writeFileSync(path.join(wt, 'a.txt'), 'a');
  p.git(['add', 'a.txt'], { cwd: wt });
  p.git(['commit', '-m', 'feat: a'], { cwd: wt });
  return { p, wt };
}

test('handoff empurra o ramo, comenta a passagem e solta a frente; a reserva fica', t => {
  const { p } = comFrente(t);
  const r = p.ah(['handoff', '--nota', 'falta o frete']);
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.saida, /Frente as-1 carrinho passada\./);
  assert.match(r.saida, /Para retomar: tools\/ah open carrinho/);
  const f = lerFrenteDoTeste(p, 'carrinho');
  assert.deepEqual([f.estado, f.dona, f.notas.at(-1).texto, f.passadaPor], ['passada', null, 'falta o frete', 'sessao-teste-0001']);
  assert.ok(f.passadaEm);
  assert.match(p.git(['ls-remote', 'origin', 'feat/carrinho']).saida, /refs\/heads\/feat\/carrinho/);
  const tk = p.ghTicket(1);
  const corpo = tk.comments.at(-1).body;
  assert.match(corpo, /^Passagem de bastão: frente as-1 \(carrinho\), por @ana-souza\.\n\nfalta o frete\n\nEstado deixado: ramo feat\/carrinho no remoto origin\. Últimos commits:\n- [0-9a-f]+ feat: a\n\nPara retomar: tools\/ah open carrinho\n/);
  assert.match(corpo, /falta o frete[\s\S]*tools\/ah open carrinho[\s\S]*<!-- ah:passagem id=as-1 nome=carrinho ramo=feat\/carrinho estado=passada/);
  assert.deepEqual(tk.assignees, ['ana-souza']);
  assert.equal(JSON.parse(p.ah(['whoami', '--json']).saida).frente, null);
  assert.ok(eventos(p).some(e => e.tipo === 'passagem' && e.id === 'as-1' && e.frente === 'carrinho' && e.sessao === 'sessao-teste-0001'));
});

test('handoff sem nota e com plano: "(sem nota)" e a linha do plano', t => {
  const { p } = comFrente(t, {}, { tickets: '' });
  const f = lerFrenteDoTeste(p, 'carrinho');
  fs.writeFileSync(arquivoDaFrente(p, 'carrinho'), JSON.stringify({ ...f, tickets: [2], reserva: { logins: ['ana-souza'], tickets: [2] }, plano: 'README.md' }));
  assert.equal(p.ah(['handoff', 'carrinho']).codigo, 0);
  assert.match(p.ghTicket(2).comments.at(-1).body, /\(sem nota\)\n\nEstado deixado: [\s\S]*\nPlano: README\.md\n\nPara retomar/);
});

test('a frente passada continua segurando o ticket: outra frente não o reserva', t => {
  const { p } = comFrente(t);
  assert.equal(p.ah(['handoff']).codigo, 0);
  const r = p.ah(['open', 'frete', '--tickets', '1'], B);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /#1 já está reservado pela frente as-1/);
  assert.match(r.erro, /Faça: .*ah open carrinho/);
});

test('handoff recusa worktree sujo e HEAD fora do ramo, sem mudar nada', t => {
  const { p, wt } = comFrente(t);
  fs.writeFileSync(path.join(wt, 'b.txt'), 'b');
  let r = p.ah(['handoff']);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /alterações[\s\S]*Faça: .*wip:/);
  assert.equal(lerFrenteDoTeste(p, 'carrinho').estado, 'ativa');
  fs.rmSync(path.join(wt, 'b.txt'));
  p.git(['switch', '--detach'], { cwd: wt });
  r = p.ah(['handoff']);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /fora do ramo feat\/carrinho/);
  assert.equal(lerFrenteDoTeste(p, 'carrinho').estado, 'ativa');
  assert.doesNotMatch(p.git(['ls-remote', 'origin', 'feat/carrinho']).saida, /feat\/carrinho/);
  assert.doesNotMatch(p.ghTicket(1).comments.at(-1).body, /Passagem/);
});

test('handoff recusa com merge em andamento no worktree', t => {
  const { p, wt } = comFrente(t);
  fs.writeFileSync(path.join(p.git(['rev-parse', '--absolute-git-dir'], { cwd: wt }).saida.trim(), 'MERGE_HEAD'), p.git(['rev-parse', 'HEAD'], { cwd: wt }).saida);
  const r = p.ah(['handoff']);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /merge em andamento/);
  assert.equal(lerFrenteDoTeste(p, 'carrinho').estado, 'ativa');
});

test('handoff: sessão sem frente, frente alheia, worktree sumido', t => {
  const { p, wt } = comFrente(t);
  let r = p.ah(['handoff'], B);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /não tem frente[\s\S]*Faça: .*ah board/);
  p.ah(['papel', 'orquestrador'], B);
  assert.equal(p.ah(['open', 'frete'], B).codigo, 0);
  r = p.ah(['handoff', 'carrinho'], B);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /não é desta sessão/);
  fs.rmSync(wt, { recursive: true, force: true });
  r = p.ah(['handoff']);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /Faça: .*ah close carrinho/);
  assert.equal(lerFrenteDoTeste(p, 'carrinho').estado, 'ativa');
});

test('handoff com push que falha recusa e não muda nada', t => {
  const { p } = comFrente(t);
  p.git(['remote', 'set-url', 'origin', path.join(dirDoTeste(p), 'nao-existe.git')]);
  const r = p.ah(['handoff']);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /push[\s\S]*nada mudou/);
  assert.deepEqual([lerFrenteDoTeste(p, 'carrinho').estado, lerFrenteDoTeste(p, 'carrinho').dona], ['ativa', 'sessao-teste-0001']);
});

test('handoff sem remoto avisa e segue', t => {
  const { p } = comFrente(t, { remoto: false });
  const r = p.ah(['handoff']);
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.erro, /sem remoto: só esta máquina retoma/);
  assert.equal(lerFrenteDoTeste(p, 'carrinho').estado, 'passada');
  assert.match(p.ghTicket(1).comments.at(-1).body, /só nesta máquina/);
});

test('handoff sem rede: o comentário vai para a fila e o handoff termina', t => {
  const { p } = comFrente(t);
  const r = p.ah(['handoff'], { env: { GH_FALSO_FORA: '1' } });
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.erro, /fila/);
  assert.equal(lerFrenteDoTeste(p, 'carrinho').estado, 'passada');
  assert.equal(p.ah(['open', 'carrinho'], B).codigo, 0); // com rede: a fila sai antes da retomada
  const corpos = p.ghTicket(1).comments.map(c => c.body);
  assert.ok(corpos.findIndex(c => /ah:passagem/.test(c)) < corpos.findIndex(c => /ah:retomada/.test(c)));
});

test('outra sessão retoma a frente passada na mesma máquina com o mesmo ID', t => {
  const { p } = comFrente(t);
  assert.equal(p.ah(['handoff']).codigo, 0);
  const r = p.ah(['open', 'carrinho'], B);
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.saida, /Frente as-1 carrinho retomada\./);
  const f = lerFrenteDoTeste(p, 'carrinho');
  assert.ok(r.saida.includes(`Trabalhe em: ${f.worktree}`));
  assert.deepEqual([f.dona, f.estado, f.id], ['sessao-b-0002', 'ativa', 'as-1']);
  assert.ok(f.retomadaEm);
  assert.equal(JSON.parse(p.ah(['whoami', '--json'], B).saida).frente, 'carrinho');
  assert.match(p.ghTicket(1).comments.at(-1).body, /ah:retomada id=as-1 .*estado=ativa/);
  assert.deepEqual(p.ghTicket(1).assignees, ['ana-souza']);
  assert.ok(eventos(p).some(e => e.tipo === 'retomada' && e.id === 'as-1' && e.sessao === 'sessao-b-0002'));
});

test('retomar com outro login põe o login de responsável e na reserva', t => {
  const { p } = comFrente(t);
  assert.equal(p.ah(['handoff']).codigo, 0);
  const r = p.ah(['open', 'carrinho'], { env: { AH_SESSAO: 'sessao-b-0002', GH_FALSO_LOGIN: 'carla-dias' } });
  assert.equal(r.codigo, 0, r.erro);
  assert.deepEqual(p.ghTicket(1).assignees, ['ana-souza', 'carla-dias']);
  assert.deepEqual(lerFrenteDoTeste(p, 'carrinho').reserva.logins, ['ana-souza', 'carla-dias']);
});

test('retomar com --tickets recusa; --plano e --caminhos substituem', t => {
  const { p } = comFrente(t);
  assert.equal(p.ah(['handoff']).codigo, 0);
  const r = p.ah(['open', 'carrinho', '--tickets', '2'], B);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /os tickets vêm da frente passada; rode ah open carrinho sem --tickets/);
  assert.equal(lerFrenteDoTeste(p, 'carrinho').estado, 'passada');
  assert.equal(p.ah(['open', 'carrinho', '--plano', 'README.md', '--caminhos', 'src/**'], B).codigo, 0);
  const f = lerFrenteDoTeste(p, 'carrinho');
  assert.deepEqual([f.plano, f.caminhos], ['README.md', ['src/**']]);
});

test('retomar respeita a regra do executor', t => {
  const { p } = comFrente(t);
  assert.equal(p.ah(['handoff']).codigo, 0);
  assert.equal(p.ah(['open', 'frete'], B).codigo, 0);
  const r = p.ah(['open', 'carrinho'], B);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /já tem a frente frete/);
  assert.equal(lerFrenteDoTeste(p, 'carrinho').estado, 'passada');
});

test('open de frente ativa: dona viva aponta handoff; dona morta aponta takeover', t => {
  const { p } = comFrente(t);
  let r = p.ah(['open', 'carrinho'], B);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /Faça: .*peça à sessão sessao-t que rode ah handoff/);
  envelhecerSinal(p, 'sessao-teste-0001', 500);
  r = p.ah(['open', 'carrinho'], B);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /Faça: .*ah takeover carrinho/);
  assert.equal(lerFrenteDoTeste(p, 'carrinho').dona, 'sessao-teste-0001');
});

test('retomar recria o worktree apagado a partir do ramo', t => {
  const { p, wt } = comFrente(t);
  assert.equal(p.ah(['handoff']).codigo, 0);
  assert.equal(p.git(['worktree', 'remove', wt]).codigo, 0);
  const r = p.ah(['open', 'carrinho'], B);
  assert.equal(r.codigo, 0, r.erro);
  assert.ok(fs.existsSync(path.join(wt, 'a.txt')));
  assert.equal(p.git(['symbolic-ref', '--short', 'HEAD'], { cwd: wt }).saida.trim(), 'feat/carrinho');
});

test('retomar sem o ramo local recria o worktree do ramo remoto', t => {
  const { p, wt } = comFrente(t);
  assert.equal(p.ah(['handoff']).codigo, 0);
  assert.equal(p.git(['worktree', 'remove', wt]).codigo, 0);
  assert.equal(p.git(['branch', '-D', 'feat/carrinho']).codigo, 0);
  const r = p.ah(['open', 'carrinho'], B);
  assert.equal(r.codigo, 0, r.erro);
  assert.ok(fs.existsSync(path.join(wt, 'a.txt')));
  assert.match(p.git(['rev-parse', '--abbrev-ref', 'feat/carrinho@{upstream}']).saida, /origin\/feat\/carrinho/);
});

test('retomar avisa sobreposição de caminhos com outra frente', t => {
  const { p } = comFrente(t);
  assert.equal(p.ah(['handoff']).codigo, 0);
  assert.equal(p.ah(['open', 'frete', '--caminhos', 'src/**'], { env: { AH_SESSAO: 'sessao-c-0003' } }).codigo, 0);
  const r = p.ah(['open', 'carrinho', '--caminhos', 'src/**'], B);
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.erro, /declarou os mesmos caminhos/);
});

test('quadro e doctor: frente passada não é órfã nem abertura parada', t => {
  const { p } = comFrente(t);
  assert.equal(p.ah(['handoff']).codigo, 0);
  envelhecerSinal(p, 'sessao-teste-0001', 500);
  assert.match(p.ah(['board']).saida, /carrinho\s+—\s+passada/);
  assert.doesNotMatch(p.ah(['doctor']).saida, /carrinho/);
});

// ---- Consertos da revisão da tarefa 7 ----

const esperarArquivo = async (arquivo, ms = 15000) => {
  const ate = Date.now() + ms;
  while (!fs.existsSync(arquivo)) {
    if (Date.now() > ate) throw new Error(`não apareceu: ${arquivo}`);
    await new Promise(r => setTimeout(r, 25));
  }
};
// Tipos dos marcadores dos comentários do ticket, em ordem.
const tiposNoTicket = (p, n) => p.ghTicket(n).comments.map(c => c.body.match(/<!-- ah:([a-z]+)/)?.[1]).filter(Boolean);

// Handoff parado no comentário de passagem (gh lento). Devolve o processo, a pausa e o soltar.
async function handoffParado(t, p) {
  const pausa = path.join(path.dirname(dirDoTeste(p)), 'pausa');
  const h = p.ahAoFundo(['handoff'], { env: { GH_FALSO_PAUSA_COMENTARIO: pausa } });
  t.after(() => { h.processo.kill('SIGKILL'); try { fs.writeFileSync(`${pausa}.solta`, ''); } catch { /* pasta já limpa */ } });
  await esperarArquivo(`${pausa}.chegou`);
  return { h, pausa, soltar: async () => { fs.writeFileSync(`${pausa}.solta`, ''); return h.fim; } };
}

test('gh lento na passagem: a retomada no meio comenta atrás dela', async t => {
  const { p } = comFrente(t);
  const { soltar } = await handoffParado(t, p);
  assert.equal(lerFrenteDoTeste(p, 'carrinho').estado, 'passada');
  // Com a passagem ainda na fila (e o reenvio preso no handoff), a retomada recusa (rodada 2 da tarefa 8).
  let r = p.ah(['open', 'carrinho'], B);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /na fila para #1 que precisam sair antes/);
  assert.equal(lerFrenteDoTeste(p, 'carrinho').estado, 'passada');
  const fim = await soltar();
  assert.equal(fim.codigo, 0, fim.erro);
  r = p.ah(['open', 'carrinho'], B);
  assert.equal(r.codigo, 0, r.erro);
  assert.deepEqual(tiposNoTicket(p, 1), ['frente', 'passagem', 'retomada']);
});

test('gh lento na passagem: o close no meio comenta atrás dela', async t => {
  const { p } = comFrente(t);
  const { soltar } = await handoffParado(t, p);
  // Com a passagem ainda na fila, o close de frente passada recusa sem apagar nada (rodada 2 da tarefa 8).
  let r = p.ah(['close', 'carrinho'], B);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /na fila para #1 que precisam sair antes/);
  assert.equal(lerFrenteDoTeste(p, 'carrinho').estado, 'passada');
  const fim = await soltar();
  assert.equal(fim.codigo, 0, fim.erro);
  r = p.ah(['close', 'carrinho'], B);
  assert.equal(r.codigo, 0, r.erro);
  // O close toma a frente pela corrida da retomada e então a fecha.
  assert.deepEqual(tiposNoTicket(p, 1), ['frente', 'passagem', 'retomada', 'fechamento']);
  assert.deepEqual(p.ghTicket(1).assignees, []);
});

test('handoff morto depois de gravar: a passagem está na fila e sai no próximo comando', async t => {
  const { p } = comFrente(t);
  const { h, pausa } = await handoffParado(t, p);
  process.kill(Number(fs.readFileSync(`${pausa}.chegou`, 'utf8')), 'SIGKILL');
  h.processo.kill('SIGKILL');
  await h.fim;
  assert.equal(lerFrenteDoTeste(p, 'carrinho').estado, 'passada');
  assert.equal(contarPendentes(dirDoTeste(p)), 1);
  assert.deepEqual(tiposNoTicket(p, 1), ['frente']);
  // A trava do reenvio do processo morto vence (1 min): aqui, envelhecida à mão.
  const dono = path.join(dirDoTeste(p), 'travas', 'pendentes-reenvio', 'dono.json');
  if (fs.existsSync(dono)) fs.writeFileSync(dono, JSON.stringify({ ...JSON.parse(fs.readFileSync(dono, 'utf8')), em: new Date(Date.now() - 3600000).toISOString() }));
  const r = p.ah(['open', 'carrinho'], B);
  assert.equal(r.codigo, 0, r.erro);
  assert.deepEqual(tiposNoTicket(p, 1), ['frente', 'passagem', 'retomada']);
});

test('handoff com cherry-pick em conflito aponta a operação, não o commit wip', t => {
  const { p, wt } = comFrente(t);
  fs.writeFileSync(path.join(wt, 'a.txt'), 'b');
  p.git(['commit', '-am', 'feat: b'], { cwd: wt });
  const b = p.git(['rev-parse', 'HEAD'], { cwd: wt }).saida.trim();
  p.git(['reset', '--hard', 'HEAD~1'], { cwd: wt });
  fs.writeFileSync(path.join(wt, 'a.txt'), 'c');
  p.git(['commit', '-am', 'feat: c'], { cwd: wt });
  assert.notEqual(p.git(['cherry-pick', b], { cwd: wt }).codigo, 0);
  const r = p.ah(['handoff']);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /cherry-pick em andamento[\s\S]*Faça: .*git cherry-pick --abort/);
  assert.doesNotMatch(r.erro, /wip/);
  assert.equal(lerFrenteDoTeste(p, 'carrinho').estado, 'ativa');
});

test('retomar recusa worktree fora do ramo; alterações soltas só avisam', t => {
  const { p, wt } = comFrente(t);
  assert.equal(p.ah(['handoff']).codigo, 0);
  p.git(['switch', '--detach'], { cwd: wt });
  let r = p.ah(['open', 'carrinho'], B);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /fora do ramo feat\/carrinho[\s\S]*Faça: .*ah open carrinho/);
  assert.equal(lerFrenteDoTeste(p, 'carrinho').estado, 'passada');
  p.git(['switch', 'feat/carrinho'], { cwd: wt });
  fs.writeFileSync(path.join(wt, 'b.txt'), 'b');
  r = p.ah(['open', 'carrinho'], B);
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.erro, /alterações não commitadas[\s\S]*b\.txt/);
});

test('retomar recusa worktree com merge em andamento', t => {
  const { p, wt } = comFrente(t);
  assert.equal(p.ah(['handoff']).codigo, 0);
  fs.writeFileSync(path.join(p.git(['rev-parse', '--absolute-git-dir'], { cwd: wt }).saida.trim(), 'MERGE_HEAD'), p.git(['rev-parse', 'HEAD'], { cwd: wt }).saida);
  const r = p.ah(['open', 'carrinho'], B);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /merge em andamento/);
  assert.equal(lerFrenteDoTeste(p, 'carrinho').estado, 'passada');
});

test('retomar de outra máquina com operação desta máquina na fila do ticket recusa e desfaz', t => {
  const { p } = comFrente(t);
  assert.equal(p.ah(['handoff']).codigo, 0);
  const q = outraMaquina(p, { sessao: 'sessao-c-0003', login: 'carla-dias', sigla: 'cd' });
  t.after(() => q.limpar());
  const dirQ = dirDoTeste(q);
  enfileirar(dirQ, { tipo: 'comentario', ticket: 1, corpo: 'antes' });
  // Outro reenvio em andamento nesta máquina: a fila não sai agora.
  fs.mkdirSync(path.join(dirQ, 'travas', 'pendentes-reenvio'), { recursive: true });
  fs.writeFileSync(path.join(dirQ, 'travas', 'pendentes-reenvio', 'dono.json'), JSON.stringify({ pid: 1, em: new Date().toISOString(), marca: 'outra' }));
  const r = q.ah(['open', 'carrinho']);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /na fila para #1/);
  assert.equal(fs.existsSync(path.join(dirQ, 'frentes', 'carrinho.json')), false);
  assert.ok(!tiposNoTicket(p, 1).includes('retomada'));
});

test('close de frente passada diz por quem foi passada', t => {
  const { p } = comFrente(t);
  assert.equal(p.ah(['handoff']).codigo, 0);
  const r = p.ah(['close', 'carrinho'], B);
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.saida, /A frente estava passada pela sessão sessao-t, sem dona; esta sessão a fechou\./);
});

test('push que falha porque outro handoff passou a frente: "mudou durante o handoff"', { skip: process.platform === 'win32' ? 'gancho do git em node sem extensão' : false }, t => {
  const { p } = comFrente(t);
  const arq = arquivoDaFrente(p, 'carrinho');
  const gancho = path.join(p.raiz, '.git', 'hooks', 'pre-push');
  fs.writeFileSync(gancho, `#!/usr/bin/env node
const fs = require('fs');
const arq = ${JSON.stringify(arq)};
const f = JSON.parse(fs.readFileSync(arq, 'utf8'));
fs.writeFileSync(arq, JSON.stringify({ ...f, estado: 'passada', dona: null, passadaPor: 'sessao-b-0002' }));
process.stderr.write('error: cannot lock ref\\n');
process.exit(1);
`);
  fs.chmodSync(gancho, 0o755);
  const r = p.ah(['handoff']);
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /mudou durante o handoff/);
  assert.doesNotMatch(r.erro, /cannot lock ref/);
});
