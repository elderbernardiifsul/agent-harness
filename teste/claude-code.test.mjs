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

const ID = '00000000-0000-4000-8000-000000000001';
const DIR_GRAVADOS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'eventos-gravados', 'claude-code');

// ---- traduzirEntrada

test('claude-code: PreToolUse de Bash vira acao de comando', () => {
  const e = traduzirEntrada(gravado('pre-bash.json'));
  assert.deepEqual(e, { tipo: 'antes', agente: 'claude-code', sessao: ID, cwd: '/tmp/loja', acao: { tipo: 'comando', comando: 'git push origin main' } });
});

test('claude-code: Edit, Write e NotebookEdit viram edição com o arquivo', () => {
  assert.deepEqual(traduzirEntrada(gravado('pre-edit.json')).acao, { tipo: 'edicao', arquivo: '/tmp/loja/nota.txt' });
  assert.deepEqual(traduzirEntrada(gravado('pre-write.json')).acao, { tipo: 'edicao', arquivo: '/tmp/loja/nota.txt' });
  assert.deepEqual(traduzirEntrada(gravado('pre-notebookedit.json')).acao, { tipo: 'edicao', arquivo: '/tmp/loja/nb.ipynb' });
});

test('claude-code: PowerShell e Monitor são comandos', () => {
  for (const tool_name of ['PowerShell', 'Monitor']) {
    const e = traduzirEntrada(gravado('pre-bash.json', { tool_name, tool_input: { command: 'git push origin main' } }));
    assert.deepEqual(e.acao, { tipo: 'comando', comando: 'git push origin main' }, tool_name);
  }
});

test('claude-code: SessionStart com source compact é continuação', () => assert.equal(traduzirEntrada(gravado('inicio-compact.json')).origem, 'continuacao'));

test('claude-code: SessionStart traduz origem e modelo', () => {
  const e = traduzirEntrada(gravado('inicio.json'));
  assert.deepEqual(e, { tipo: 'inicio', agente: 'claude-code', sessao: ID, cwd: '/tmp/loja', origem: 'novo', modelo: null });
  assert.equal(traduzirEntrada(gravado('inicio-compact.json')).modelo, 'claude-haiku-5-5');
  assert.equal(traduzirEntrada(gravado('inicio-resume.json')).origem, 'continuacao');
  const origens = { startup: 'novo', clear: 'novo', resume: 'continuacao', compact: 'continuacao', fork: 'continuacao', outra: 'novo' };
  for (const [source, origem] of Object.entries(origens)) assert.equal(traduzirEntrada(gravado('inicio.json', { source })).origem, origem, source);
  assert.equal(traduzirEntrada(gravado('inicio.json', { source: undefined })).origem, 'novo');
  assert.equal(traduzirEntrada(gravado('inicio.json', { model: 7 })).modelo, null);
});

test('claude-code: UserPromptSubmit e Stop são sinal; SessionEnd é fim', () => {
  assert.deepEqual(traduzirEntrada(gravado('prompt.json')), { tipo: 'sinal', agente: 'claude-code', sessao: ID, cwd: '/tmp/loja' });
  assert.equal(traduzirEntrada(gravado('stop.json')).tipo, 'sinal');
  assert.equal(traduzirEntrada(gravado('fim.json')).tipo, 'fim');
});

test('claude-code: entrada inválida lança dizendo o tipo provável do evento', () => {
  const casos = [
    [gravado('pre-bash.json', { session_id: '../x' }), 'antes'],
    [gravado('pre-bash.json', { session_id: 'a/b' }), 'antes'],
    [gravado('pre-bash.json', { session_id: 'x'.repeat(300) }), 'antes'],
    [gravado('pre-bash.json', { session_id: 7 }), 'antes'],
    [gravado('pre-bash.json', { cwd: 3 }), 'antes'],
    [gravado('pre-bash.json', { tool_input: { command: 1 } }), 'antes'],
    [gravado('pre-bash.json', { tool_input: 'git push' }), 'antes'],
    [gravado('pre-bash.json', { tool_name: 'WebFetch' }), 'antes'],
    [gravado('pre-edit.json', { tool_input: { file_path: null } }), 'antes'],
    [gravado('stop.json', { session_id: '..' }), 'sinal'],
    [gravado('inicio.json', { session_id: '' }), 'inicio'],
    [gravado('fim.json', { hook_event_name: 'Notification' }), 'desconhecido'],
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
    const r = p.ah(['gancho', 'claude-code'], { cwd: fora, entrada: JSON.stringify(gravado('pre-bash.json', { cwd: fora })) });
    assert.deepEqual([r.codigo, r.erro], [0, '']);
    const r2 = semHarness.ah(['gancho', 'claude-code'], { entrada: JSON.stringify(gravado('pre-bash.json', { cwd: semHarness.raiz })) });
    assert.deepEqual([r2.codigo, r2.erro], [0, '']);
    const r3 = p.ah(['gancho', 'claude-code'], { cwd: fora, entrada: JSON.stringify(gravado('inicio.json', { cwd: fora })) });
    assert.deepEqual([r3.codigo, r3.saida], [0, '']);
  } finally {
    fs.rmSync(fora, { recursive: true, force: true });
    semHarness.limpar();
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
