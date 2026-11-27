import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { criarProjeto } from './apoio/repo.mjs';
import { criarColecao } from './apoio/colecao-falsa.mjs';

const ok = r => { assert.equal(r.codigo, 0, r.erro); return r; };
const caminho = (p, rel) => path.join(p.raiz, ...rel.split('/'));
const ler = (p, rel) => fs.readFileSync(caminho(p, rel), 'utf8');
const travaDe = p => JSON.parse(ler(p, '.harness/skills.lock.json'));

// Projeto com a extensão metodo ligada e uma coleção falsa (alfa), já instalada no commit inicial.
function cenario(t, { outra = false, executavel = false, instalar = true } = {}) {
  const c = criarColecao({ skills: { 'skills/alfa': { 'SKILL.md': 'alfa v1\n', 'rodar.sh': '#!/bin/sh\n' }, 'skills/gama': { 'SKILL.md': 'gama\n' } }, executaveis: executavel ? ['skills/alfa/rodar.sh'] : [] });
  t.after(() => c.limpar());
  const o = outra ? criarColecao({ skills: { 'skills/delta': { 'SKILL.md': 'delta\n' }, 'skills/eta': { 'SKILL.md': 'eta\n' } } }) : null;
  if (o) t.after(() => o.limpar());
  const p = criarProjeto();
  t.after(() => p.limpar());
  const pasta = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ah-metodo-atualizar-')));
  t.after(() => fs.rmSync(pasta, { recursive: true, force: true }));
  fs.mkdirSync(path.join(pasta, 'skills', 'preparar-projeto'), { recursive: true });
  fs.writeFileSync(path.join(pasta, 'skills', 'preparar-projeto', 'SKILL.md'), 'preparar-projeto\n');
  const colecoes = { versaoDoFormato: 1, colecoes: { 'agent-harness': { local: 'skills', skills: { 'preparar-projeto': 'preparar-projeto' }, extensoes: {} }, falsa: { origem: c.origem, commit: c.commit, versao: '1.0.0', licenca: 'LICENSE', skills: { alfa: 'skills/alfa', gama: 'skills/gama' } } } };
  if (o) colecoes.colecoes.outra = { origem: o.origem, commit: o.commit, versao: '2.0.0', licenca: 'LICENSE', skills: { delta: 'skills/delta', eta: 'skills/eta' } };
  const arquivo = path.join(pasta, 'colecoes.json');
  const gravarColecoes = () => fs.writeFileSync(arquivo, JSON.stringify(colecoes, null, 2));
  gravarColecoes();
  p.env.AH_METODO_COLECOES = arquivo;
  p.env.AH_CACHE = path.join(pasta, 'cache');
  const cfg = caminho(p, '.harness/config.json');
  const conf = JSON.parse(fs.readFileSync(cfg, 'utf8'));
  conf.extensoes = { metodo: { agentes: ['claude-code'] } };
  fs.writeFileSync(cfg, JSON.stringify(conf, null, 2));
  assert.equal(p.git(['add', '--', '.harness/config.json']).codigo, 0);
  assert.equal(p.git(['commit', '-q', '-m', 'configura']).codigo, 0);
  if (instalar) ok(p.ah(['metodo', 'instalar']));
  return { p, c, o, colecoes, gravarColecoes };
}

test('atualizar --simular mostra o que muda e não grava', t => {
  const { p, c, colecoes, gravarColecoes } = cenario(t);
  colecoes.colecoes.falsa.commit = c.novoCommit({ 'skills/alfa/SKILL.md': 'alfa v2\n', 'skills/beta/SKILL.md': 'beta\n' });
  colecoes.colecoes.falsa.skills.beta = 'skills/beta';
  gravarColecoes();
  const antes = ler(p, '.harness/skills.lock.json');
  const agentsAntes = ler(p, 'AGENTS.md');
  const r = ok(p.ah(['metodo', 'atualizar', '--simular']));
  assert.equal(ler(p, 'AGENTS.md'), agentsAntes);
  assert.match(r.saida, /Alterados:\n.*alfa\/SKILL\.md/);
  assert.match(r.saida, /Novas skills: beta/);
  assert.match(r.saida, /Simulação: nada foi gravado\./);
  assert.equal(ler(p, '.claude/skills/alfa/SKILL.md'), 'alfa v1\n');
  assert.equal(fs.existsSync(caminho(p, '.claude/skills/beta')), false);
  assert.equal(ler(p, '.harness/skills.lock.json'), antes);
});

test('atualizar sem --simular grava as skills e a trava no commit recomendado', t => {
  const { p, c, colecoes, gravarColecoes } = cenario(t);
  colecoes.colecoes.falsa.commit = c.novoCommit({ 'skills/alfa/SKILL.md': 'alfa v2\n' });
  gravarColecoes();
  const r = ok(p.ah(['metodo', 'atualizar']));
  assert.match(r.saida, /Alterados:\n.*alfa\/SKILL\.md/);
  assert.equal(ler(p, '.claude/skills/alfa/SKILL.md'), 'alfa v2\n');
  assert.equal(travaDe(p).colecoes.falsa.commit, colecoes.colecoes.falsa.commit);
});

test('atualizar --colecao falsa --para <tag> passa à frente da recomendada', t => {
  const { p, c, colecoes, gravarColecoes } = cenario(t);
  const novo = c.novoCommit({ 'skills/alfa/SKILL.md': 'alfa v2\n' });
  assert.equal(spawnSync('git', ['-C', c.dir, 'tag', 'v2'], { encoding: 'utf8' }).status, 0);
  c.novoCommit({ 'skills/alfa/SKILL.md': 'alfa v3\n' }); // a tag não é o último commit
  gravarColecoes();
  ok(p.ah(['metodo', 'atualizar', '--colecao', 'falsa', '--para', 'v2']));
  const f = travaDe(p).colecoes.falsa;
  assert.equal(f.commit, novo);
  assert.equal(f.versao, 'v2');
  assert.equal(ler(p, '.claude/skills/alfa/SKILL.md'), 'alfa v2\n');
});

test('atualizar --para sem --colecao recusa', t => {
  const { p } = cenario(t);
  const r = p.ah(['metodo', 'atualizar', '--para', 'v2']);
  assert.notEqual(r.codigo, 0);
  assert.match(r.erro, /Recusado: --para precisa de --colecao/);
  assert.match(r.erro, /Faça:/);
});

test('atualizar recusa opção sem valor e opção desconhecida', t => {
  const { p } = cenario(t);
  for (const args of [['--colecao'], ['--colecao', 'falsa', '--para'], ['--tudo']]) {
    const r = p.ah(['metodo', 'atualizar', ...args]);
    assert.notEqual(r.codigo, 0, args.join(' '));
    assert.match(r.erro, /Recusado: [^]*Faça:/);
  }
});

test('atualizar remove a skill que saiu da lista quando ela está igual à trava', t => {
  const { p, colecoes, gravarColecoes } = cenario(t);
  delete colecoes.colecoes.falsa.skills.gama;
  gravarColecoes();
  const r = ok(p.ah(['metodo', 'atualizar', '--simular']));
  assert.match(r.saida, /Skills removidas: gama/);
  assert.equal(fs.existsSync(caminho(p, '.claude/skills/gama')), true);
  const r2 = ok(p.ah(['metodo', 'atualizar']));
  assert.match(r2.saida, /Skills removidas: gama/);
  assert.equal(fs.existsSync(caminho(p, '.claude/skills/gama')), false);
  assert.deepEqual(travaDe(p).colecoes.falsa.skills, ['alfa']);
});

test('atualizar recusa mudança à mão, e --forcar a descarta', t => {
  const { p, c, colecoes, gravarColecoes } = cenario(t);
  fs.writeFileSync(caminho(p, '.claude/skills/alfa/SKILL.md'), 'meu jeito\n');
  colecoes.colecoes.falsa.commit = c.novoCommit({ 'skills/alfa/SKILL.md': 'alfa v2\n' });
  gravarColecoes();
  const r = p.ah(['metodo', 'atualizar']);
  assert.match(r.erro, /^Recusado: [^]*alfa\/SKILL\.md[^]*Faça:/);
  assert.equal(ler(p, '.claude/skills/alfa/SKILL.md'), 'meu jeito\n');
  ok(p.ah(['metodo', 'atualizar', '--forcar']));
  assert.equal(ler(p, '.claude/skills/alfa/SKILL.md'), 'alfa v2\n');
});

test('atualizar --simular antes de instalar não grava nada', t => {
  const { p } = cenario(t, { instalar: false });
  const agentsAntes = ler(p, 'AGENTS.md');
  const r = ok(p.ah(['metodo', 'atualizar', '--simular']));
  assert.match(r.saida, /Simulação: nada foi gravado\./);
  assert.equal(fs.existsSync(caminho(p, '.harness/skills.lock.json')), false);
  assert.equal(fs.existsSync(caminho(p, '.claude/skills')), false);
  assert.equal(ler(p, 'AGENTS.md'), agentsAntes);
});

test('atualizar --colecao falsa não mexe nas outras coleções', t => {
  const { p, c, o, colecoes, gravarColecoes } = cenario(t, { outra: true });
  const antes = travaDe(p).colecoes.outra;
  colecoes.colecoes.falsa.commit = c.novoCommit({ 'skills/alfa/SKILL.md': 'alfa v2\n' });
  colecoes.colecoes.outra.commit = o.novoCommit({ 'skills/delta/SKILL.md': 'delta v2\n' }); // recomendado mudou, mas não foi pedido
  delete colecoes.colecoes.outra.skills.eta; // saiu da lista, mas não foi pedido
  gravarColecoes();
  ok(p.ah(['metodo', 'atualizar', '--colecao', 'falsa']));
  assert.equal(ler(p, '.claude/skills/alfa/SKILL.md'), 'alfa v2\n');
  assert.equal(ler(p, '.claude/skills/delta/SKILL.md'), 'delta\n');
  assert.equal(ler(p, '.claude/skills/eta/SKILL.md'), 'eta\n');
  assert.deepEqual(travaDe(p).colecoes.outra, antes);
});

test('atualizar --para com ref inexistente recusa e não muda nada', t => {
  const { p } = cenario(t);
  const trava = ler(p, '.harness/skills.lock.json');
  const r = p.ah(['metodo', 'atualizar', '--colecao', 'falsa', '--para', 'v99']);
  assert.notEqual(r.codigo, 0);
  assert.match(r.erro, /^Recusado: não achei a referência v99 em file:\/\/[^]*Faça: confira a tag ou o commit \(git ls-remote --tags [^]*--colecao falsa --para v99/);
  assert.doesNotMatch(r.erro, /internet/);
  assert.equal(ler(p, '.harness/skills.lock.json'), trava);
  assert.equal(ler(p, '.claude/skills/alfa/SKILL.md'), 'alfa v1\n');
});

test('atualizar lista como Alterados o script que só mudou o bit de execução', t => {
  const { p, c, colecoes, gravarColecoes } = cenario(t);
  fs.chmodSync(path.join(c.dir, 'skills/alfa/rodar.sh'), 0o755);
  assert.equal(spawnSync('git', ['-C', c.dir, '-c', 'user.name=a', '-c', 'user.email=a@b.test', 'commit', '-qam', 'bit'], { encoding: 'utf8' }).status, 0);
  colecoes.colecoes.falsa.commit = spawnSync('git', ['-C', c.dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
  gravarColecoes();
  const r = ok(p.ah(['metodo', 'atualizar', '--simular']));
  assert.match(r.saida, /Alterados:\n.*alfa\/rodar\.sh \(modo\)/);
});

test('atualizar recusa --colecao ou --para repetidos', t => {
  const { p } = cenario(t);
  for (const args of [['--colecao', 'falsa', '--colecao', 'outra'], ['--colecao', 'falsa', '--para', 'a', '--para', 'b']]) {
    const r = p.ah(['metodo', 'atualizar', ...args]);
    assert.notEqual(r.codigo, 0);
    assert.match(r.erro, /^Recusado: informe --(colecao|para) uma vez só[^]*Faça:/);
  }
});
