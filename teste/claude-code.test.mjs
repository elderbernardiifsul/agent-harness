import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { criarProjeto, criarRepo, gravado, ganchoPre, gravar, dirDoTeste } from './apoio/repo.mjs';
import { traduzirEntrada, traduzirSaida, ErroDeEntrada } from '../nucleo/adaptadores/claude-code.mjs';
import { lerEventos } from '../nucleo/lib/estado.mjs';
import { processoVivo } from './apoio/processo.mjs';

const ID = '00000000-0000-4000-8000-000000000001';
const DIR_GRAVADOS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'eventos-gravados', 'claude-code');

// ---- traduzirEntrada

// Os eventos gravados têm cwd fictício; a tradução exige uma pasta que exista.
const D = path.dirname(fileURLToPath(import.meta.url));
const g = (nome, troca = {}) => gravado(nome, { cwd: D, ...troca });

test('claude-code: PreToolUse de Bash vira acao de comando', () => {
  const e = traduzirEntrada(g('pre-bash.json'));
  assert.deepEqual(e, { tipo: 'antes', agente: 'claude-code', sessao: ID, cwd: D, acao: { tipo: 'comando', comando: 'git push origin main', shell: 'posix' } });
});

test('claude-code: Edit, Write e NotebookEdit viram edição com o arquivo', () => {
  assert.deepEqual(traduzirEntrada(g('pre-edit.json')).acao, { tipo: 'edicao', arquivo: '/tmp/loja/nota.txt', ferramenta: 'Edit' });
  assert.deepEqual(traduzirEntrada(g('pre-write.json')).acao, { tipo: 'edicao', arquivo: '/tmp/loja/nota.txt', ferramenta: 'Write' });
  assert.deepEqual(traduzirEntrada(g('pre-notebookedit.json')).acao, { tipo: 'edicao', arquivo: '/tmp/loja/nb.ipynb', ferramenta: 'NotebookEdit' });
});

test('claude-code: PowerShell e Monitor são comandos', () => {
  for (const tool_name of ['PowerShell', 'Monitor']) {
    const e = traduzirEntrada(g('pre-bash.json', { tool_name, tool_input: { command: 'git push origin main' } }));
    assert.deepEqual(e.acao, { tipo: 'comando', comando: 'git push origin main' }, tool_name);
    assert.equal(e.acao.shell, undefined);
  }
});

test('claude-code: SessionStart com source compact é continuação', () => assert.equal(traduzirEntrada(g('inicio-compact.json')).origem, 'continuacao'));

test('claude-code: /clear é continuação', () => assert.equal(traduzirEntrada(g('inicio.json', { source: 'clear' })).origem, 'continuacao'));

test('claude-code: SessionStart traduz origem e modelo', () => {
  const e = traduzirEntrada(g('inicio.json'));
  assert.deepEqual(e, { tipo: 'inicio', agente: 'claude-code', sessao: ID, cwd: D, origem: 'novo', modelo: null });
  assert.equal(traduzirEntrada(g('inicio-compact.json')).modelo, 'claude-haiku-5-5');
  assert.equal(traduzirEntrada(g('inicio-resume.json')).origem, 'continuacao');
  const origens = { startup: 'novo', clear: 'continuacao', resume: 'continuacao', compact: 'continuacao', fork: 'continuacao', outra: 'novo' };
  for (const [source, origem] of Object.entries(origens)) assert.equal(traduzirEntrada(g('inicio.json', { source })).origem, origem, source);
  assert.equal(traduzirEntrada(g('inicio.json', { source: undefined })).origem, 'novo');
  assert.equal(traduzirEntrada(g('inicio.json', { model: 7 })).modelo, null);
});

test('claude-code: UserPromptSubmit e Stop são sinal; SessionEnd é fim', () => {
  assert.deepEqual(traduzirEntrada(g('prompt.json')), { tipo: 'sinal', agente: 'claude-code', sessao: ID, cwd: D });
  assert.equal(traduzirEntrada(g('stop.json')).tipo, 'sinal');
  assert.equal(traduzirEntrada(g('fim.json')).tipo, 'fim');
});

test('claude-code: entrada inválida lança dizendo o tipo provável do evento', () => {
  const casos = [
    [g('pre-bash.json', { session_id: '../x' }), 'antes'],
    [g('pre-bash.json', { session_id: 'a/b' }), 'antes'],
    [g('pre-bash.json', { session_id: 'x'.repeat(300) }), 'antes'],
    [g('pre-bash.json', { session_id: 7 }), 'antes'],
    [g('pre-bash.json', { cwd: 3 }), 'antes'],
    [g('pre-bash.json', { cwd: 'relativo/pasta' }), 'antes'],
    [g('pre-bash.json', { cwd: path.join(D, 'nao-existe') }), 'antes'],
    [g('pre-bash.json', { cwd: path.join(D, 'claude-code.test.mjs') }), 'antes'],
    [g('pre-bash.json', { tool_input: { command: 1 } }), 'antes'],
    [g('pre-bash.json', { tool_input: 'git push' }), 'antes'],
    [g('pre-bash.json', { tool_name: 'WebFetch' }), 'antes'],
    [g('pre-edit.json', { tool_input: { file_path: null } }), 'antes'],
    [g('stop.json', { session_id: '..' }), 'sinal'],
    [g('inicio.json', { session_id: '' }), 'inicio'],
    [g('fim.json', { hook_event_name: 'Notification' }), 'desconhecido'],
    [{ session_id: ID }, 'desconhecido'],
  ];
  for (const [json, tipo] of casos) {
    assert.throws(() => traduzirEntrada(json), e => e instanceof ErroDeEntrada && e.tipo === tipo, JSON.stringify(json).slice(0, 120));
  }
  for (const nada of [null, 3, 'texto', []]) assert.equal(traduzirEntrada(nada), null);
});

test('claude-code: os eventos gravados não têm caminho, id nem nome reais', () => {
  for (const f of fs.readdirSync(DIR_GRAVADOS)) {
    const texto = fs.readFileSync(path.join(DIR_GRAVADOS, f), 'utf8');
    const j = JSON.parse(texto);
    assert.equal(j.session_id, ID, f);
    assert.equal(j.cwd, '/tmp/loja', f);
    assert.doesNotMatch(texto, /\/home\/|\/Users\/|C:\\\\/, f);
  }
});

// ---- traduzirSaida

test('claude-code: recusa sai com código 2 e a mensagem na saída de erro', () => {
  assert.deepEqual(traduzirSaida({ tipo: 'antes' }, { decisao: 'recusa', mensagem: 'm' }), { saida: '', erro: 'm', codigo: 2 });
  assert.deepEqual(traduzirSaida({ tipo: 'antes' }, { decisao: 'permite' }), { saida: '', erro: '', codigo: 0 });
  assert.deepEqual(traduzirSaida({ tipo: 'inicio' }, { contexto: 'c' }), { saida: 'c', erro: '', codigo: 0 });
  assert.deepEqual(traduzirSaida({ tipo: 'sinal' }, {}), { saida: '', erro: '', codigo: 0 });
  assert.deepEqual(traduzirSaida({ tipo: 'fim' }, {}), { saida: '', erro: '', codigo: 0 });
  assert.deepEqual(traduzirSaida({ tipo: 'sinal' }, { aviso: 'a' }), { saida: '', erro: 'a', codigo: 0 });
  assert.deepEqual(traduzirSaida({ tipo: 'inicio' }, { aviso: 'a' }), { saida: '', erro: 'a', codigo: 0 });
});

// ---- ponta a ponta

const p = criarProjeto();
const gancho = (json, opcoes) => p.ah(['gancho', 'claude-code'], { entrada: typeof json === 'string' ? json : JSON.stringify(json), ...opcoes });

test('ah gancho de ponta a ponta recusa o push', () => {
  const r = gancho(gravado('pre-bash.json', { cwd: p.raiz }));
  assert.equal(r.codigo, 2);
  assert.match(r.erro, /^Recusado \(T5\): push para o ramo protegido main\nFaça: /);
  assert.equal(r.saida, '');
  const ev = lerEventos(dirDoTeste(p)).at(-1);
  assert.deepEqual([ev.tipo, ev.trava, ev.sessao], ['recusa', 'T5', ID]);
});

test('ah gancho permite git status, a edição e a liberação', () => {
  const r = ganchoPre(p, { command: 'git status' });
  assert.deepEqual([r.codigo, r.erro, r.saida], [0, '', '']);
  assert.equal(ganchoPre(p, { file_path: path.join(p.raiz, 'README.md'), old_string: 'a', new_string: 'b' }, 'Edit').codigo, 0);
  assert.equal(ganchoPre(p, { command: 'AH_GUARD=off git push origin main' }).codigo, 0);
  assert.equal(lerEventos(dirDoTeste(p)).at(-1).tipo, 'liberacao');
});

test('ah gancho num worktree de frente usa a raiz principal', () => {
  const wt = path.join(path.dirname(p.raiz), 'wt-gancho');
  assert.equal(p.git(['worktree', 'add', wt, '-b', 'feat/gancho']).codigo, 0);
  assert.equal(ganchoPre(p, { command: 'git add -A' }, 'Bash', { cwd: wt }).codigo, 0);
  assert.equal(ganchoPre(p, { command: 'git push origin main' }, 'Bash', { cwd: wt }).codigo, 2);
  assert.equal(ganchoPre(p, { command: 'git add -A' }).codigo, 2);
});

test('ah gancho no SessionStart escreve o resumo na saída', () => {
  const r = gancho(gravado('inicio.json', { cwd: p.raiz }));
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.saida, /^Sessão 00000000 \(executor\)/);
  assert.match(r.saida, /nenhuma: `ah open <nome>`/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dirDoTeste(p), 'sessoes', `${ID}.json`), 'utf8')).agente, 'claude-code');
});

test('ah gancho no Stop, no prompt e no fim sai com 0 e sem texto', () => {
  for (const f of ['prompt.json', 'stop.json', 'fim.json']) {
    const r = gancho(gravado(f, { cwd: p.raiz }));
    assert.deepEqual([r.codigo, r.saida, r.erro], [0, '', ''], f);
  }
});

test('entrada inválida no antes recusa com T0; no Stop avisa e sai com 0', () => {
  const r = gancho(gravado('pre-bash.json', { cwd: p.raiz, session_id: '../x', tool_input: { command: 'git status' } }));
  assert.equal(r.codigo, 2);
  assert.match(r.erro, /^Recusado \(T0\): o harness não conseguiu avaliar \(.+\)\.\nFaça: rode tools\/ah doctor\n?$/);
  const s = gancho(gravado('stop.json', { cwd: p.raiz, session_id: '../x' }));
  assert.equal(s.codigo, 0);
  assert.match(s.erro, /^Aviso: o harness não conseguiu tratar o evento/);
  assert.doesNotMatch(r.erro + s.erro, /\bat .+\.mjs:\d+/);
});

test('entrada que não é JSON: PreToolUse recusa, o resto avisa', () => {
  const a = gancho('{"hook_event_name": "PreToolUse", "tool_input": {"command": "git st');
  assert.equal(a.codigo, 2);
  assert.match(a.erro, /Recusado \(T0\)/);
  for (const texto of ['não é json', '', '{"hook_event_name": "Stop", ']) {
    const r = gancho(texto);
    assert.equal(r.codigo, 0, texto);
    assert.match(r.erro, /^Aviso: /, texto);
  }
  const t = gancho(gravado('pre-bash.json', { cwd: p.raiz, tool_name: 'WebFetch' }));
  assert.equal(t.codigo, 2);
});

test('entrada de 5 MB não derruba o gancho e o evento guarda o comando cortado', () => {
  const grande = `git push origin main # ${'a'.repeat(5 * 1024 * 1024)}`;
  const r = ganchoPre(p, { command: grande });
  assert.equal(r.codigo, 2, r.erro.slice(0, 300));
  assert.match(r.erro, /Recusado \(T5\)/);
  const ev = lerEventos(dirDoTeste(p)).at(-1);
  assert.ok(ev.comando.length <= 500);
  assert.equal(ganchoPre(p, { command: `echo ${'a'.repeat(5 * 1024 * 1024)}` }).codigo, 0);
});

test('gancho com configuração inválida recusa, mas deixa passar o ah e a edição da configuração', () => {
  const q = criarProjeto();
  gravar(q, '.harness/config.json', '{ quebrado');
  const r = ganchoPre(q, { command: 'git status' });
  assert.equal(r.codigo, 2);
  assert.match(r.erro, /^Recusado \(T0\): o harness não conseguiu avaliar \(.*config.*\)\.\nFaça: rode tools\/ah doctor/);
  assert.equal(ganchoPre(q, { command: 'tools/ah doctor' }).codigo, 0);
  assert.equal(ganchoPre(q, { command: 'ah board' }).codigo, 0);
  assert.equal(ganchoPre(q, { file_path: path.join(q.raiz, '.harness/config.json') }, 'Edit').codigo, 0);
  assert.equal(ganchoPre(q, { file_path: path.join(q.raiz, 'docs', '..', '.harness', 'config.json'), content: '{}' }, 'Write').codigo, 0);
  for (const c of ['tools/ah doctor; git push origin main', 'tools/ah $(git push origin main)', 'ah x | sh']) assert.equal(ganchoPre(q, { command: c }).codigo, 2, c);
  assert.equal(ganchoPre(q, { file_path: path.join(q.raiz, '.harness/config.json.bak') }, 'Edit').codigo, 2);
  const s = q.ah(['gancho', 'claude-code'], { entrada: JSON.stringify(gravado('stop.json', { cwd: q.raiz })) });
  assert.equal(s.codigo, 0);
  assert.match(s.erro, /^Aviso: /);
  const i = q.ah(['gancho', 'claude-code'], { entrada: JSON.stringify(gravado('inicio.json', { cwd: q.raiz })) });
  assert.equal(i.codigo, 0);
  assert.match(i.erro, /^Aviso: /);
});

test('gancho com a configuração ausente recusa', () => {
  const q = criarProjeto();
  fs.rmSync(path.join(q.raiz, '.harness/config.json'));
  assert.equal(ganchoPre(q, { command: 'git status' }).codigo, 2);
  assert.equal(ganchoPre(q, { command: 'tools/ah doctor' }).codigo, 0);
});

test('gancho com estado corrompido recusa no antes', () => {
  const q = criarProjeto();
  fs.mkdirSync(path.join(q.estado, 'loja'), { recursive: true });
  // eventos.jsonl como pasta: registrar o evento falha
  fs.mkdirSync(path.join(q.estado, 'loja', 'eventos.jsonl'));
  const r = ganchoPre(q, { command: 'git push origin main' });
  assert.equal(r.codigo, 2);
  assert.match(r.erro, /Recusado \(T0\)/);
});

test('fora de repositório do harness o gancho permite e sai com 0', () => {
  const fora = fs.mkdtempSync(path.join(os.tmpdir(), 'ah-fora-'));
  const semHarness = criarRepo();
  try {
    const r = p.ah(['gancho', 'claude-code'], { cwd: fora, entrada: JSON.stringify(gravado('pre-bash.json', { cwd: fora })), env: { CLAUDE_PROJECT_DIR: '' } });
    assert.deepEqual([r.codigo, r.erro], [0, '']);
    const r2 = semHarness.ah(['gancho', 'claude-code'], { entrada: JSON.stringify(gravado('pre-bash.json', { cwd: semHarness.raiz })) });
    assert.deepEqual([r2.codigo, r2.erro], [0, '']);
    const r3 = p.ah(['gancho', 'claude-code'], { cwd: fora, entrada: JSON.stringify(gravado('inicio.json', { cwd: fora })), env: { CLAUDE_PROJECT_DIR: '' } });
    assert.deepEqual([r3.codigo, r3.saida], [0, '']);
  } finally {
    fs.rmSync(fora, { recursive: true, force: true });
    semHarness.limpar();
  }
});

test('cwd relativo ou inexistente no antes recusa com T0', () => {
  for (const cwd of ['relativo', path.join(p.raiz, 'nao-existe')]) {
    const r = gancho(gravado('pre-bash.json', { cwd, tool_input: { command: 'git status' } }));
    assert.equal(r.codigo, 2, cwd);
    assert.match(r.erro, /Recusado \(T0\)/);
  }
});

test('evento de fora do projeto ainda acha o projeto por CLAUDE_PROJECT_DIR e pela instalação', () => {
  const fora = fs.mkdtempSync(path.join(os.tmpdir(), 'ah-fora-'));
  const entrada = JSON.stringify(gravado('pre-bash.json', { cwd: fora, tool_input: { command: `git -C ${p.raiz} push origin main` } }));
  try {
    const r = p.ah(['gancho', 'claude-code'], { cwd: fora, entrada, env: { CLAUDE_PROJECT_DIR: p.raiz } });
    assert.equal(r.codigo, 2, r.erro);
    assert.match(r.erro, /Recusado \(T5\)/);
    const semNada = p.ah(['gancho', 'claude-code'], { cwd: fora, entrada, env: { CLAUDE_PROJECT_DIR: '' } });
    assert.equal(semNada.codigo, 0, 'o clone não é instalação de projeto nenhum');
    if (process.platform !== 'win32') {
      const i = spawnSync(path.join(p.raiz, 'tools/ah'), ['gancho', 'claude-code'], { cwd: fora, env: { ...p.env, CLAUDE_PROJECT_DIR: '' }, encoding: 'utf8', input: entrada });
      assert.equal(i.status, 2, i.stderr);
      assert.match(i.stderr, /Recusado \(T5\)/);
    }
  } finally {
    fs.rmSync(fora, { recursive: true, force: true });
  }
});

test('com a configuração quebrada, a exceção do ah é estreita e o link para a configuração não passa', () => {
  const q = criarProjeto();
  gravar(q, '.harness/config.json', '{ quebrado');
  for (const c of ['AH_GUARD=off tools/ah doctor', 'tools/ah doctor > .harness/config.json', 'tools/ah board < /dev/null']) {
    assert.equal(ganchoPre(q, { command: c }).codigo, 2, c);
  }
  assert.equal(ganchoPre(q, { command: 'tools/ah doctor' }, 'PowerShell').codigo, 2);
  assert.equal(ganchoPre(q, { command: 'tools/ah doctor' }).codigo, 0);
  if (process.platform !== 'win32') {
    const alvo = path.join(q.raiz, 'alvo.txt');
    fs.writeFileSync(alvo, 'x');
    fs.rmSync(path.join(q.raiz, '.harness/config.json'));
    fs.symlinkSync(alvo, path.join(q.raiz, '.harness/config.json'));
    assert.equal(ganchoPre(q, { file_path: path.join(q.raiz, '.harness/config.json'), content: '{}' }, 'Write').codigo, 2);
  }
});

test('adaptador desconhecido recusa no antes', () => {
  const r = p.ah(['gancho', 'outro'], { entrada: JSON.stringify(gravado('pre-bash.json', { cwd: p.raiz, tool_input: { command: 'git status' } })) });
  assert.equal(r.codigo, 2);
  assert.match(r.erro, /Recusado \(T0\)/);
});

test('tools/ah gancho claude-code roda pela cópia instalada', { skip: process.platform === 'win32' }, () => {
  const r = spawnSync(path.join(p.raiz, 'tools/ah'), ['gancho', 'claude-code'], {
    cwd: p.raiz, env: { ...p.env, AH_SESSAO: '' }, encoding: 'utf8', input: JSON.stringify(gravado('pre-bash.json', { cwd: p.raiz })),
  });
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /Recusado \(T5\)/);
});

test('onda final: o gancho recusa a troca para ramo protegido seguida de push e os pega-tudo de I4', () => {
  for (const c of ['git checkout main && git push', 'git switch main && git merge dev && git push', 'git checkout stage && git merge dev && git push origin HEAD'])
    assert.equal(ganchoPre(p, { command: c }).codigo, 2, c);
  for (const c of ['git add *', 'cd .harness && git add ..', `git add ${p.raiz}`, 'git add "$(pwd)"', 'git commit . -m x', 'git add $(git ls-files -m)', 'cd nao-existe; git add -A'])
    assert.equal(ganchoPre(p, { command: c }).codigo, 2, c);
  for (const c of ['git switch dev && git merge --no-ff feat/x && git push origin dev', 'git add README.md', 'git commit -m x'])
    assert.equal(ganchoPre(p, { command: c }).codigo, 0, c);
  const r = ganchoPre(p, { command: 'git checkout -b x && git push -u origin x' });
  assert.equal(r.codigo, 2);
  assert.match(r.erro, /Recusado \(T1\)/);
});

test('ah gancho recusa git switch no checkout principal', () => { const r = ganchoPre(p, { command: 'git switch main' }); assert.equal(r.codigo, 2); assert.match(r.erro, /Recusado \(T1\)/); });

test('ah gancho: checkout de ramo existente recusa, de arquivo existente passa (ehRef e existe do contrato)', () => {
  assert.match(ganchoPre(p, { command: 'git checkout main' }).erro, /Recusado \(T1\)/);
  assert.equal(ganchoPre(p, { command: 'git checkout README.md' }).codigo, 0);
  assert.equal(ganchoPre(p, { command: 'git checkout nao-existe-nem-ramo' }).codigo, 0);
  assert.match(ganchoPre(p, { command: 'git stash' }).erro, /Recusado \(T3\)/);
});

test('ah gancho: ramo que só existe no remoto também conta como troca de ramo (T1)', (t) => {
  const q = criarProjeto();
  t.after(() => q.limpar());
  for (const args of [['branch', 'so-no-remoto'], ['push', '-q', 'origin', 'so-no-remoto'], ['branch', '-D', 'so-no-remoto'], ['fetch', '-q', 'origin']]) {
    assert.equal(q.git(args).codigo, 0, args.join(' '));
  }
  assert.match(ganchoPre(q, { command: 'git checkout so-no-remoto' }).erro, /Recusado \(T1\)/);
  assert.equal(ganchoPre(q, { command: 'git checkout -- -x' }).codigo, 0);
});

// ---- T4 pelo gancho
const eventosDe = q => fs.readFileSync(path.join(dirDoTeste(q), 'eventos.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));

test('gancho: a sessão B não edita no worktree da sessão A, viva; edita no próprio', t => {
  const q = criarProjeto();
  t.after(() => q.limpar());
  const proc = processoVivo();
  t.after(() => proc.matar());
  assert.equal(q.ah(['open', 'carrinho'], { env: { AH_SESSAO: 'sessao-a-0001', AH_PID_AGENTE: String(proc.pid) } }).codigo, 0);
  assert.equal(q.ah(['open', 'frete'], { env: { AH_SESSAO: ID } }).codigo, 0);
  const wt = nome => JSON.parse(fs.readFileSync(path.join(dirDoTeste(q), 'frentes', `${nome}.json`), 'utf8')).worktree;
  const r = ganchoPre(q, { file_path: path.join(wt('carrinho'), 'a.txt') }, 'Edit', { env: { AH_SESSAO: ID } });
  assert.equal(r.codigo, 2);
  assert.match(r.erro, /Recusado \(T4\): .*carrinho.*sessao-a/);
  assert.equal(ganchoPre(q, { command: `rm -f ${path.join(wt('carrinho'), 'a.txt')}` }).codigo, 2);
  assert.match(ganchoPre(q, { command: `rm -rf ${path.dirname(wt('carrinho'))}` }).erro, /Recusado \(T4\)/);
  assert.equal(ganchoPre(q, { file_path: path.join(wt('frete'), 'a.txt') }, 'Edit', { env: { AH_SESSAO: ID } }).codigo, 0);
  assert.equal(ganchoPre(q, { file_path: path.join(q.raiz, 'a.txt') }, 'Edit').codigo, 0);
  const recusa = eventosDe(q).find(e => e.tipo === 'recusa' && e.trava === 'T4');
  assert.deepEqual([recusa.ferramenta, recusa.caminho, recusa.comando], ['Edit', path.join(wt('carrinho'), 'a.txt'), undefined]);
});

test('arquivo de frente ilegível não trava o gancho: a edição comum passa e o evento registra', t => {
  const q = criarProjeto();
  t.after(() => q.limpar());
  fs.mkdirSync(path.join(dirDoTeste(q), 'frentes'), { recursive: true });
  fs.writeFileSync(path.join(dirDoTeste(q), 'frentes', 'x.json'), '{');
  assert.equal(ganchoPre(q, { file_path: path.join(q.raiz, 'a.txt') }, 'Edit').codigo, 0);
  assert.equal(ganchoPre(q, { command: 'rm -f a.txt' }).codigo, 0);
  const ilegiveis = () => eventosDe(q).filter(e => e.tipo === 'estado-ilegivel');
  assert.equal(ilegiveis().length, 1, 'o mesmo conjunto de ilegíveis registra uma vez só');
  assert.deepEqual(ilegiveis()[0].caminhos, [path.join(dirDoTeste(q), 'frentes', 'x.json')]);
  fs.writeFileSync(path.join(dirDoTeste(q), 'frentes', 'y.json'), '[');
  ganchoPre(q, { command: 'true' });
  assert.equal(ilegiveis().length, 2, 'conjunto novo registra de novo');
  fs.rmSync(path.join(dirDoTeste(q), 'frentes', 'x.json')); fs.rmSync(path.join(dirDoTeste(q), 'frentes', 'y.json'));
  ganchoPre(q, { command: 'true' });
  fs.writeFileSync(path.join(dirDoTeste(q), 'frentes', 'x.json'), '{');
  ganchoPre(q, { command: 'true' });
  assert.equal(ilegiveis().length, 3, 'consertado e quebrado de novo registra de novo');
});

test('registro ilegível da dona conta como viva para a T4 (na dúvida, protege)', t => {
  const q = criarProjeto();
  t.after(() => q.limpar());
  assert.equal(q.ah(['open', 'carrinho'], { env: { AH_SESSAO: 'sessao-a-0001' } }).codigo, 0);
  fs.writeFileSync(path.join(dirDoTeste(q), 'sessoes', 'sessao-a-0001.json'), '{');
  const wt = JSON.parse(fs.readFileSync(path.join(dirDoTeste(q), 'frentes', 'carrinho.json'), 'utf8')).worktree;
  assert.match(ganchoPre(q, { file_path: path.join(wt, 'a.txt') }, 'Edit').erro, /Recusado \(T4\)/);
});
