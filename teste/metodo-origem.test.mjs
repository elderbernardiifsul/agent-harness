import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { git } from '../nucleo/lib/git.mjs';
import { carregarParaTeste, ctxFalso } from '../nucleo/lib/extensoes-teste.mjs';
import { lerColecoes, destinosDe } from '../nucleo/extensoes/metodo/colecoes.mjs';
import { dirDoCache, buscar } from '../nucleo/extensoes/metodo/origem.mjs';
import { criarColecao } from './apoio/colecao-falsa.mjs';

const DIR_METODO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'nucleo', 'extensoes', 'metodo');
const colecoesJson = path.join(DIR_METODO, 'colecoes.json');

function descartavel(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ah-metodo-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function colecao(t, opcoes) {
  const c = criarColecao(opcoes);
  t.after(() => c.limpar());
  return c;
}
// Um colecoes.json válido com `mudanca` aplicada, gravado numa pasta descartável.
function jsonCom(t, mudanca) {
  const base = JSON.parse(fs.readFileSync(colecoesJson, 'utf8'));
  mudanca(base);
  const arquivo = path.join(descartavel(t), 'colecoes.json');
  fs.writeFileSync(arquivo, JSON.stringify(base));
  return arquivo;
}

test('colecoes.json do harness é válido e fixa as duas coleções', () => {
  const { colecoes } = lerColecoes(colecoesJson);
  assert.equal(colecoes.superpowers.commit, '22f0b463e7a5e579904dd6211a520321035526f7');
  assert.equal(colecoes.superpowers.versao, '7.0.2');
  assert.deepEqual(Object.keys(colecoes.superpowers.skills).sort(), ['brainstorming', 'executing-plans', 'requesting-code-review', 'subagent-driven-development', 'systematic-debugging', 'test-driven-development', 'verification-before-completion', 'writing-plans']);
  assert.equal(colecoes['mattpocock-skills'].commit, 'd1478fcb140db0b93c0c8df17bcfd311844749d0');
  assert.equal(colecoes['mattpocock-skills'].versao, '1.3.2');
  assert.deepEqual(Object.keys(colecoes['mattpocock-skills'].skills).sort(), ['domain-modeling', 'grilling', 'prototype', 'research', 'to-tickets', 'triage', 'wayfinder']);
  assert.deepEqual(Object.keys(colecoes['agent-harness'].skills), ['preparar-projeto']);
  assert.deepEqual(colecoes['agent-harness'].extensoes, {});
  assert.deepEqual(Object.keys(colecoes['mattpocock-skills'].arquivosDoProjeto).sort(), ['docs/agents/domain.md', 'docs/agents/issue-tracker.md', 'docs/agents/triage-labels.md']);
  // As skills do harness vivem numa pasta da extensão; a pasta de cada uma existe.
  for (const pasta of Object.values(colecoes['agent-harness'].skills)) {
    assert.ok(fs.existsSync(path.join(DIR_METODO, colecoes['agent-harness'].local, pasta, 'SKILL.md')), pasta);
  }
});

test('lerColecoes recusa formato inválido dizendo o motivo', t => {
  const casos = [
    [b => { b.versaoDoFormato = 2; }, /versaoDoFormato/],
    [b => { b.colecoes.superpowers.commit = 'main'; }, /commit/],
    [b => { b.colecoes.superpowers.origem = ''; }, /origem/],
    [b => { b.colecoes.superpowers.skills = {}; }, /skills/],
    [b => { b.colecoes.superpowers.skills.brainstorming = '../fora'; }, /pasta/],
    [b => { b.colecoes['agent-harness'].extensoes = { orquestrar: 1 }; }, /extensoes/],
    [b => { delete b.colecoes['agent-harness']; }, /agent-harness/],
  ];
  for (const [mudanca, motivo] of casos) assert.throws(() => lerColecoes(jsonCom(t, mudanca)), motivo);
  assert.throws(() => lerColecoes(path.join(descartavel(t), 'nao-existe.json')), /colecoes\.json/);
});

test('destinosDe junta as pastas sem repetir', () => {
  assert.deepEqual(destinosDe(['claude-code']), ['.claude/skills']);
  assert.deepEqual(destinosDe(['codex', 'opencode']), ['.agents/skills']);
  assert.deepEqual(destinosDe(['codex', 'claude-code', 'opencode']), ['.agents/skills', '.claude/skills']);
});

test('dirDoCache respeita AH_CACHE e o cache da máquina', () => {
  assert.equal(dirDoCache({ AH_CACHE: '/x/cache' }, 'linux', '/home/ana'), '/x/cache');
  assert.equal(dirDoCache({ XDG_CACHE_HOME: '/x/xdg' }, 'linux', '/home/ana'), path.join('/x/xdg', 'agent-harness', 'colecoes'));
  assert.equal(dirDoCache({}, 'linux', '/home/ana'), path.join('/home/ana', '.cache', 'agent-harness', 'colecoes'));
  assert.equal(dirDoCache({}, 'darwin', '/Users/ana'), path.join('/Users/ana', 'Library', 'Caches', 'agent-harness', 'colecoes'));
  assert.equal(dirDoCache({ LOCALAPPDATA: 'C:\\Dados' }, 'win32', 'C:\\Users\\ana'), path.join('C:\\Dados', 'agent-harness', 'colecoes'));
  // Variável vazia vale como ausente; AH_CACHE relativo vira absoluto.
  assert.equal(dirDoCache({ LOCALAPPDATA: '' }, 'win32', 'C:\\Users\\ana'), path.join('C:\\Users\\ana', 'AppData', 'Local', 'agent-harness', 'colecoes'));
  assert.equal(dirDoCache({ AH_CACHE: 'cache-local' }, 'linux', '/home/ana'), path.resolve('cache-local'));
});

test('buscar nunca espera credencial: o git roda sem pergunta no terminal e com tempo limite', t => {
  const c = colecao(t, { skills: { grilling: { 'SKILL.md': 'a\n' } } });
  const opcoesVistas = [];
  const g = (args, opcoes) => { opcoesVistas.push(opcoes); return git(args, opcoes); };
  buscar({ nome: 'ex', origem: c.origem, ref: c.commit, dirCache: descartavel(t), git: g, env: { ...process.env, ANA: '1' } });
  assert.ok(opcoesVistas.length > 0);
  for (const o of opcoesVistas) {
    assert.equal(o.env.GIT_TERMINAL_PROMPT, '0');
    assert.equal(o.env.ANA, '1');
    assert.ok(o.timeoutMs >= 60000);
  }
});

// O `git` que a extensão recebe no ctx, com contagem dos fetches.
function gitContado() {
  const fetches = [];
  const f = (args, opcoes) => {
    if (args.includes('fetch')) fetches.push(args);
    return git(args, opcoes);
  };
  f.fetches = fetches;
  return f;
}

test('buscar traz a coleção numa tag e num commit, e reaproveita o cache', t => {
  const c = colecao(t, { skills: { grilling: { 'SKILL.md': 'a\n' } }, tag: 'v1.0.0' });
  const dirCache = descartavel(t);
  const g = gitContado();
  const porTag = buscar({ nome: 'ex', origem: c.origem, ref: 'v1.0.0', dirCache, git: g });
  assert.equal(porTag.commit, c.commit);
  assert.equal(porTag.dir, path.join(dirCache, 'ex'));
  assert.ok(fs.existsSync(path.join(porTag.dir, 'grilling', 'SKILL.md')));
  assert.equal(g.fetches.length, 1);

  // Segunda busca do mesmo ref: nada de rede.
  assert.equal(buscar({ nome: 'ex', origem: c.origem, ref: 'v1.0.0', dirCache, git: g }).commit, c.commit);
  assert.equal(g.fetches.length, 1);

  // Pelo commit, depois de a origem andar: busca o commit pedido, não o novo.
  const novo = c.novoCommit({ 'grilling/SKILL.md': 'b\n' });
  const porCommit = buscar({ nome: 'ex', origem: c.origem, ref: novo, dirCache, git: g });
  assert.equal(porCommit.commit, novo);
  assert.equal(fs.readFileSync(path.join(porCommit.dir, 'grilling', 'SKILL.md'), 'utf8'), 'b\n');
  assert.equal(buscar({ nome: 'ex', origem: c.origem, ref: novo, dirCache, git: g }).commit, novo);
  assert.equal(g.fetches.length, 2);
  // E volta ao primeiro commit pelo número.
  assert.equal(buscar({ nome: 'ex', origem: c.origem, ref: c.commit, dirCache, git: g }).commit, c.commit);
});

test('buscar de origem inexistente lança com a mensagem do git', t => {
  const dirCache = descartavel(t);
  assert.throws(
    () => buscar({ nome: 'ex', origem: 'file:///nao/existe', ref: 'v1.0.0', dirCache, git }),
    /does not appear to be a git repository|não parece ser um repositório|nao\/existe/i,
  );
});

test('buscar recusa ref que pareceria opção do git', t => {
  assert.throws(() => buscar({ nome: 'ex', origem: 'file:///x', ref: '--upload-pack=x', dirCache: descartavel(t), git }), /ref/);
});

test('validarConfig recusa agente desconhecido, lista vazia e repetição', async () => {
  const ext = await carregarParaTeste(path.join(DIR_METODO, 'extensao.mjs'), { agentes: ['claude-code'] });
  assert.match(ext.validarConfig({ agentes: ['vim'] }), /agentes/);
  assert.match(ext.validarConfig({ agentes: [] }), /agentes/);
  assert.match(ext.validarConfig({ agentes: ['codex', 'codex'] }), /agentes/);
  assert.match(ext.validarConfig({}), /agentes/);
  assert.match(ext.validarConfig({ agentes: ['codex'], outro: 1 }), /outro/);
  assert.equal(ext.validarConfig({ agentes: ['claude-code'] }), null);
});

test('metodo atualizar ainda recusa, e subcomando faltando recusa, com próximo passo', async () => {
  const ext = await carregarParaTeste(path.join(DIR_METODO, 'extensao.mjs'), { agentes: ['codex'] });
  const ctx = ctxFalso({ extensao: 'metodo', config: { agentes: ['codex'] } });
  await assert.rejects(async () => ext.comandos.metodo.executar(['atualizar'], ctx), e => /ainda não implementado[^]*Próximo passo/.test(e.saida));
  await assert.rejects(async () => ext.comandos.metodo.executar([], ctx), e => /Falta o subcomando[^]*Próximo passo/.test(e.saida));
});
