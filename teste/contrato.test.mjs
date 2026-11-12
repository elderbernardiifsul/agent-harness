import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { criarProjeto, amb, dirDoTeste } from './apoio/repo.mjs';
import { tratar, passaNaQuebra, respostaNaQuebra } from '../nucleo/adaptadores/contrato.mjs';
import { montarResumo } from '../nucleo/lib/resumo.mjs';
import { lerSessao } from '../nucleo/lib/sessao.mjs';
import { lerEventos } from '../nucleo/lib/estado.mjs';
import { gravarFrente } from '../nucleo/lib/frente.mjs';
import { aplicarPadroes } from '../nucleo/lib/config.mjs';

const p = criarProjeto();
const config = aplicarPadroes({ projeto: 'loja' });
const antes = (comando, extra = {}) => tratar({ tipo: 'antes', sessao: 's1', cwd: p.raiz, acao: { tipo: 'comando', comando }, ...extra }, amb(p));

const frente = (i, dona = `sessao-${i}`) => ({
  id: `as-${i}`, nome: `frente-${i}`, ramo: `feat/frente-${i}`, worktree: path.join('wt', `frente-${i}`), tickets: [], plano: null,
  dona, abertaEm: `2026-11-12T10:${String(i % 60).padStart(2, '0')}:00-03:00`, estado: 'ativa', notas: [],
});
const quarentaFrentes = [{ ...frente(0, 's1'), nome: 'f0', plano: 'docs/plano.md' }, ...Array.from({ length: 39 }, (_, i) => frente(i + 1))];

test('inicio registra a sessão e devolve o resumo', () => {
  const r = tratar({ tipo: 'inicio', sessao: 's1', agente: 'claude-code', cwd: p.raiz, origem: 'novo', modelo: 'm-x' }, amb(p));
  assert.match(r.contexto, /Sessão s1 \(executor\)/);
  assert.match(r.contexto, /nenhuma: `?ah open/);
  assert.ok(r.contexto.length <= 1200);
  const s = lerSessao(dirDoTeste(p), 's1');
  assert.equal(s.modelo, 'm-x');
  assert.equal(s.agente, 'claude-code');
  const ev = lerEventos(dirDoTeste(p)).at(-1);
  assert.deepEqual([ev.tipo, ev.sessao, ev.origem, ev.modelo], ['sessao-inicio', 's1', 'novo', 'm-x']);
});

test('inicio sem modelo grava nulo', () => {
  tratar({ tipo: 'inicio', sessao: 's2', agente: 'claude-code', cwd: p.raiz, origem: 'novo' }, amb(p));
  assert.equal(lerSessao(dirDoTeste(p), 's2').modelo, null);
});

test('o resumo de uma continuação mostra a frente herdada', async () => {
  const { gravarSessao } = await import('../nucleo/lib/sessao.mjs');
  gravarFrente(dirDoTeste(p), { ...frente(6, 's4'), nome: 'busca', id: 'as-6', plano: 'docs/busca.md' });
  tratar({ tipo: 'inicio', sessao: 's4', agente: 'claude-code', cwd: p.raiz, origem: 'novo', modelo: 'm-z' }, amb(p));
  gravarSessao(dirDoTeste(p), { ...lerSessao(dirDoTeste(p), 's4'), frente: 'busca' });
  const r = tratar({ tipo: 'inicio', sessao: 's4', agente: 'claude-code', cwd: p.raiz, origem: 'continuacao' }, amb(p));
  assert.match(r.contexto, /Sua frente: as-6 busca/);
  assert.match(r.contexto, /plano: docs\/busca\.md/);
  const s = lerSessao(dirDoTeste(p), 's4');
  assert.equal(s.frente, 'busca');
  assert.equal(s.modelo, 'm-z');
});

test('o resumo mostra a frente da sessão e corta a lista longa', () => {
  const t = montarResumo({ sessao: { id: 's1', papel: 'executor', frente: 'f0' }, frentes: quarentaFrentes, config, baseLimpa: true });
  assert.ok(t.length <= 1200, String(t.length));
  assert.match(t, /e mais \d+ frentes/);
  assert.match(t, /Sua frente: as-0 f0 · worktree: wt[\\/]frente-0 · plano: docs\/plano\.md/);
  assert.match(t, /as-1 frente-1 \(dona sessao-1\)/);
  const fora = Number(/e mais (\d+) frentes/.exec(t)[1]);
  const mostradas = (t.match(/as-\d+ frente-\d+ \(/g) ?? []).length;
  assert.equal(mostradas + fora, 39);
});

test('o resumo diz o estado da base, as regras e onde ler mais', () => {
  const s = { id: 'abcdef0123456789', papel: 'executor', frente: null };
  const limpo = montarResumo({ sessao: s, frentes: [], config, baseLimpa: true });
  assert.match(limpo, /Sessão abcdef01 \(executor\)/);
  assert.match(limpo, /Outras frentes: nenhuma/);
  assert.match(limpo, /Base dev: checkout principal limpo/);
  assert.match(limpo, /Regras: .*stage e main só com ordem do executivo/);
  assert.match(limpo, /Mais: docs\/agents\/sessoes-paralelas\.md · tools\/ah board$/);
  assert.match(montarResumo({ sessao: s, frentes: [], config, baseLimpa: false }), /Base dev: checkout principal com mudanças/);
  assert.match(montarResumo({ sessao: s, frentes: [], config, baseLimpa: null }), /Base dev: não consegui conferir/);
  const semDona = montarResumo({ sessao: s, frentes: [frente(1, null)], config, baseLimpa: true });
  assert.match(semDona, /as-1 frente-1 \(sem dona\)/);
});

test('o resumo não passa do limite nem com nomes e caminhos enormes', () => {
  const enorme = { ...frente(0, 's1'), nome: 'f0', worktree: 'x'.repeat(5000), plano: 'y\n'.repeat(3000) };
  const t = montarResumo({ sessao: { id: 's1', papel: 'executor', frente: 'f0' }, frentes: [enorme, ...quarentaFrentes.slice(1)], config, baseLimpa: true });
  assert.ok(t.length <= 1200, String(t.length));
  assert.match(t, /Mais: docs\/agents\/sessoes-paralelas\.md · tools\/ah board$/);
});

test('antes: push em ramo protegido é recusado e registrado', () => {
  const r = antes('git push origin main');
  assert.equal(r.decisao, 'recusa');
  assert.match(r.mensagem, /^Recusado \(T5\)/);
  const ev = lerEventos(dirDoTeste(p)).at(-1);
  assert.deepEqual([ev.tipo, ev.trava, ev.sessao, ev.comando], ['recusa', 'T5', 's1', 'git push origin main']);
});

test('antes: AH_GUARD=off permite e registra a liberação', () => {
  const r = antes('AH_GUARD=off git push origin main');
  assert.deepEqual(r, { decisao: 'permite' });
  const ev = lerEventos(dirDoTeste(p)).at(-1);
  assert.deepEqual([ev.tipo, ev.trava, ev.comando], ['liberacao', 'T5', 'AH_GUARD=off git push origin main']);
});

test('antes: comando comum permite sem registrar evento', () => {
  const n = lerEventos(dirDoTeste(p)).length;
  assert.deepEqual(antes('git status'), { decisao: 'permite' });
  assert.equal(lerEventos(dirDoTeste(p)).length, n);
});

test('antes: o evento guarda o comando cortado', () => {
  antes(`git push origin main # ${'a'.repeat(10000)}`);
  const ev = lerEventos(dirDoTeste(p)).at(-1);
  assert.equal(ev.tipo, 'recusa');
  assert.ok(ev.comando.length <= 500, String(ev.comando.length));
  assert.match(ev.comando, /^git push origin main/);
});

test('antes: outra ferramenta e edição permitem', () => {
  assert.deepEqual(tratar({ tipo: 'antes', sessao: 's1', cwd: p.raiz, acao: { tipo: 'outra' } }, amb(p)), { decisao: 'permite' });
  assert.deepEqual(tratar({ tipo: 'antes', sessao: 's1', cwd: p.raiz, acao: { tipo: 'edicao', arquivo: path.join(p.raiz, 'README.md') } }, amb(p)), { decisao: 'permite' });
});

test('antes: gh que demora vira recusa do T5, não liberação', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ah-gh-lento-'));
  try {
    const lento = path.join(dir, 'gh-lento.mjs');
    fs.writeFileSync(lento, 'setTimeout(() => process.stdout.write("dev\\n"), 5000);\n');
    const inicio = Date.now();
    const r = tratar({ tipo: 'antes', sessao: 's1', cwd: p.raiz, acao: { tipo: 'comando', comando: 'gh pr merge 7' } },
      { ...amb(p), env: { ...p.env, AH_GH: lento }, tempoDoGhMs: 300 });
    assert.equal(r.decisao, 'recusa');
    assert.match(r.mensagem, /^Recusado \(T5\): não consegui descobrir/);
    assert.ok(Date.now() - inicio < 3000, String(Date.now() - inicio));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('antes: gh pr merge pergunta ao gh o ramo de destino do PR', () => {
  p.ghResponder([{ prefixo: ['pr', 'view', '7'], saida: 'dev\n' }, { prefixo: ['pr', 'view', '8'], saida: 'main\n' }, { prefixo: ['pr', 'view'], codigo: 1 }]);
  assert.deepEqual(antes('gh pr merge 7 --squash'), { decisao: 'permite' });
  assert.match(antes('gh pr merge 8').mensagem, /^Recusado \(T5\): gh pr merge mescla em main/);
  assert.match(antes('gh pr merge').mensagem, /^Recusado \(T5\): não consegui descobrir/);
  assert.ok(p.ghChamadas().some(c => c.argv.join(' ') === 'pr view 7 --json baseRefName --jq .baseRefName'));
});

test('antes: o T2 usa o cwd do evento, não o do processo', () => {
  const wt = path.join(path.dirname(p.raiz), 'wt-contrato');
  assert.equal(p.git(['worktree', 'add', wt, '-b', 'feat/contrato']).codigo, 0);
  const evento = cwd => ({ tipo: 'antes', sessao: 's1', cwd, acao: { tipo: 'comando', comando: 'git add -A' } });
  assert.equal(tratar(evento(wt), { ...amb(p), cwd: p.raiz }).decisao, 'permite');
  assert.equal(tratar(evento(p.raiz), { ...amb(p), cwd: wt }).decisao, 'recusa');
});

test('sinal toca o sinal de vida e fim encerra a sessão', async () => {
  tratar({ tipo: 'inicio', sessao: 's5', agente: 'claude-code', cwd: p.raiz, origem: 'novo' }, amb(p));
  const antesDoSinal = lerSessao(dirDoTeste(p), 's5').sinal;
  await new Promise(r => setTimeout(r, 5));
  assert.deepEqual(tratar({ tipo: 'sinal', sessao: 's5' }, amb(p)), {});
  assert.notEqual(lerSessao(dirDoTeste(p), 's5').sinal, antesDoSinal);
  assert.deepEqual(tratar({ tipo: 'fim', sessao: 's5' }, amb(p)), {});
  assert.ok(lerSessao(dirDoTeste(p), 's5').fim);
  assert.equal(lerEventos(dirDoTeste(p)).at(-1).tipo, 'sessao-fim');
});

test('sinal de uma sessão desconhecida a registra', () => {
  tratar({ tipo: 'sinal', sessao: 's6', agente: 'claude-code' }, amb(p));
  assert.equal(lerSessao(dirDoTeste(p), 's6').agente, 'claude-code');
});

test('tipo de evento desconhecido lança', () => {
  assert.throws(() => tratar({ tipo: 'outro', sessao: 's1' }, amb(p)));
});

// ---- quando o gancho quebra

const R = path.join(path.sep === '/' ? '/' : 'C:\\', 'proj');
const cmd = comando => ({ tipo: 'comando', comando, shell: 'posix' });
const ed = arquivo => ({ tipo: 'edicao', arquivo });

for (const c of ['tools/ah doctor', './tools/ah doctor', 'ah board', `${path.join(R, 'tools', 'ah')} doctor`])
  test(`na quebra passa: ${c}`, () => assert.ok(passaNaQuebra(cmd(c), { raiz: R, cwd: R })));
for (const c of ['AH_SESSAO=x tools/ah whoami', 'tools/ah doctor > f', 'tools/ah doctor 2>&1', 'tools/ah board < x', 'tools/ah doctor; git push origin main', 'tools/ah $(git push origin main)', 'ah x | sh', 'tools/ah doctor && rm -rf .', 'git status',
  'cd tools && ./ah doctor', 'node tools/ah doctor', 'tools/ah "doctor', 'outro/tools/ah doctor', '`tools/ah`', 'tools/ahx', ''])
  test(`na quebra não passa: ${JSON.stringify(c)}`, () => assert.ok(!passaNaQuebra(cmd(c), { raiz: R, cwd: R })));

test('na quebra passa a edição de .harness/config.json pelo caminho resolvido', () => {
  const ctx = { raiz: R, cwd: R };
  assert.ok(passaNaQuebra(ed(path.join(R, '.harness', 'config.json')), ctx));
  assert.ok(passaNaQuebra(ed(path.join('.harness', 'config.json')), ctx));
  assert.ok(passaNaQuebra(ed(path.join(R, 'docs', '..', '.harness', 'config.json')), ctx));
  assert.ok(passaNaQuebra(ed('config.json'), { raiz: R, cwd: path.join(R, '.harness') }));
  for (const a of [path.join(R, '.harness', 'config.json.bak'), path.join(R, '.harness', '..', 'config.json'), path.join(R, 'x', '.harness', 'config.json'),
    path.join(R, '.harness', 'nucleo', 'bin', 'ah.mjs'), '', 42]) {
    assert.ok(!passaNaQuebra(ed(a), ctx), String(a));
  }
  assert.ok(!passaNaQuebra(ed(path.join(R, '.harness', 'config.json')), { raiz: null, cwd: R }));
  assert.ok(!passaNaQuebra({ tipo: 'outra' }, ctx));
});

test('na quebra a exceção do ah vale só para o shell do Bash', () => {
  assert.ok(!passaNaQuebra({ tipo: 'comando', comando: 'tools/ah doctor' }, { raiz: R, cwd: R }));
  assert.ok(!passaNaQuebra({ tipo: 'comando', comando: 'tools/ah doctor', shell: 'powershell' }, { raiz: R, cwd: R }));
});

test('resposta na quebra: recusa T0 no antes, aviso nos outros', () => {
  const r = respostaNaQuebra({ tipo: 'antes', acao: cmd('git status') }, 'config.json quebrado\nsegunda linha', { raiz: R, cwd: R });
  assert.deepEqual(r, { decisao: 'recusa', mensagem: 'Recusado (T0): o harness não conseguiu avaliar (config.json quebrado segunda linha).\nFaça: rode tools/ah doctor' });
  assert.deepEqual(respostaNaQuebra({ tipo: 'antes', acao: cmd('tools/ah doctor') }, 'x', { raiz: R, cwd: R }), { decisao: 'permite' });
  const s = respostaNaQuebra({ tipo: 'sinal' }, 'x', { raiz: R, cwd: R });
  assert.match(s.aviso, /^Aviso: o harness não conseguiu tratar o evento \(x\)\. Rode tools\/ah doctor\.$/);
});
