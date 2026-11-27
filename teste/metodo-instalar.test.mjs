import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { criarProjeto } from './apoio/repo.mjs';
import { criarColecao } from './apoio/colecao-falsa.mjs';

const sha = t => crypto.createHash('sha256').update(t).digest('hex');
const ok = r => { assert.equal(r.codigo, 0, r.erro); return r; };
const caminho = (p, rel) => path.join(p.raiz, ...rel.split('/'));
const ler = (p, rel) => fs.readFileSync(caminho(p, rel), 'utf8');
const existe = (p, rel) => fs.existsSync(caminho(p, rel));
const travaDe = p => JSON.parse(ler(p, '.harness/skills.lock.json'));
const ROTULOS = ['needs-triage', 'needs-info', 'ready-for-agent', 'ready-for-human', 'wontfix'];

// Muda .harness/config.json do projeto e commita, para o teste partir de uma árvore limpa.
function configurar(p, mudanca) {
  const arquivo = caminho(p, '.harness/config.json');
  const c = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  mudanca(c);
  fs.writeFileSync(arquivo, JSON.stringify(c, null, 2));
  for (const args of [['add', '--', '.harness/config.json'], ['commit', '-q', '-m', 'configura']]) assert.equal(p.git(args).codigo, 0);
}

// Projeto com a extensão metodo ligada e um colecoes.json de teste (AH_METODO_COLECOES) com a coleção falsa e
// duas skills do harness (uma delas só com a extensão recursos ligada). O cache fica numa pasta do teste.
function cenario(t, { agentes = ['claude-code'], executaveis = [], github = null } = {}) {
  const c = criarColecao({
    skills: {
      'skills/alfa': { 'SKILL.md': 'alfa v1\n', 'scripts/rodar': '#!/bin/sh\necho oi\n' },
      'skills/fora': { 'SKILL.md': 'fora\n' },
      setup: { 'issue-tracker.md': 'rastreador\n', 'triage-labels.md': 'rótulos\n', 'domain.md': 'domínio\n' },
    },
    executaveis,
  });
  t.after(() => c.limpar());
  const p = criarProjeto();
  t.after(() => p.limpar());
  const pasta = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ah-metodo-instalar-')));
  t.after(() => fs.rmSync(pasta, { recursive: true, force: true }));
  for (const skill of ['preparar-projeto', 'so-com-recursos']) {
    fs.mkdirSync(path.join(pasta, 'skills', skill), { recursive: true });
    fs.writeFileSync(path.join(pasta, 'skills', skill, 'SKILL.md'), `${skill}\n`);
  }
  const colecoes = {
    versaoDoFormato: 1,
    colecoes: {
      falsa: {
        origem: c.origem, commit: c.commit, versao: '1.0.0', licenca: 'LICENSE',
        skills: { alfa: 'skills/alfa' },
        arquivosDoProjeto: {
          'docs/agents/issue-tracker.md': 'setup/issue-tracker.md',
          'docs/agents/triage-labels.md': 'setup/triage-labels.md',
          'docs/agents/domain.md': 'setup/domain.md',
        },
      },
      'agent-harness': {
        local: 'skills',
        skills: { 'preparar-projeto': 'preparar-projeto', 'so-com-recursos': 'so-com-recursos' },
        extensoes: { 'so-com-recursos': 'recursos' },
      },
    },
  };
  const arquivo = path.join(pasta, 'colecoes.json');
  const gravarColecoes = () => fs.writeFileSync(arquivo, JSON.stringify(colecoes, null, 2));
  gravarColecoes();
  p.env.AH_METODO_COLECOES = arquivo;
  p.env.AH_CACHE = path.join(pasta, 'cache');
  configurar(p, cfg => {
    cfg.extensoes = { metodo: { agentes } };
    if (github) cfg.github.repo = github;
  });
  return { p, c, colecoes, gravarColecoes, instalar: (args = [], o) => p.ah(['metodo', 'instalar', ...args], o) };
}

// Roda os passos do commit que o instalar imprimiu.
function commitar(p, saida) {
  const add = saida.match(/^ {2}(git add -- .*)$/m);
  assert.ok(add, saida);
  assert.equal(p.git(add[1].split(' ').slice(1)).codigo, 0);
  assert.equal(p.git(['commit', '-q', '-m', 'chore: instala o método do agent-harness']).codigo, 0);
}

test('instalar copia só as skills da lista para cada destino, com a licença, e grava a trava', t => {
  const { p, c, instalar } = cenario(t, { agentes: ['claude-code', 'codex'] });
  const r = ok(instalar());
  for (const destino of ['.claude/skills', '.agents/skills']) {
    assert.equal(ler(p, `${destino}/alfa/SKILL.md`), 'alfa v1\n');
    assert.equal(ler(p, `${destino}/alfa/LICENSE`), 'Licença de mentira (MIT)\n');
    assert.ok(!existe(p, `${destino}/fora`), destino);
    assert.equal(ler(p, `${destino}/preparar-projeto/SKILL.md`), 'preparar-projeto\n');
    assert.ok(!existe(p, `${destino}/so-com-recursos`), destino);
  }
  const trava = travaDe(p);
  assert.equal(trava.versaoDoFormato, 1);
  assert.deepEqual(trava.destinos.slice().sort(), ['.agents/skills', '.claude/skills']);
  assert.equal(trava.colecoes.falsa.commit, c.commit);
  assert.equal(trava.colecoes.falsa.origem, c.origem);
  assert.equal(trava.colecoes.falsa.versao, '1.0.0');
  assert.deepEqual(trava.colecoes.falsa.skills, ['alfa']);
  assert.equal(trava.colecoes.falsa.arquivos['alfa/SKILL.md'], sha('alfa v1\n'));
  assert.equal(trava.colecoes.falsa.arquivos['alfa/LICENSE'], sha('Licença de mentira (MIT)\n'));
  assert.deepEqual(Object.keys(trava.colecoes.falsa.arquivos), ['alfa/LICENSE', 'alfa/SKILL.md', 'alfa/scripts/rodar']);
  assert.equal(trava.colecoes['agent-harness'].origem, 'agent-harness');
  assert.deepEqual(trava.colecoes['agent-harness'].skills, ['preparar-projeto']);
  assert.match(r.saida, /Instalei 1 skill\(s\) de falsa \(1\.0\.0, [0-9a-f]{7}\) em \.claude\/skills, \.agents\/skills\./);
  assert.match(r.saida, /git add -- .*\.harness\/skills\.lock\.json/);
  assert.match(r.saida, /chore: instala o método do agent-harness/);
  assert.equal(r.erro, '');
});

test('instalar mantém o bit de execução dos scripts das skills', { skip: process.platform === 'win32' }, t => {
  const { p, instalar } = cenario(t, { executaveis: ['skills/alfa/scripts/rodar'] });
  ok(instalar());
  assert.ok(fs.statSync(caminho(p, '.claude/skills/alfa/scripts/rodar')).mode & 0o100);
  assert.equal(fs.statSync(caminho(p, '.claude/skills/alfa/SKILL.md')).mode & 0o111, 0);
});

test('instalar escreve o trecho do método no AGENTS.md sem tocar no trecho do núcleo', t => {
  const { p, instalar } = cenario(t);
  const doNucleo = texto => texto.slice(texto.indexOf('<!-- agent-harness: início'), texto.indexOf('<!-- agent-harness: fim -->'));
  const antes = ler(p, 'AGENTS.md');
  ok(instalar());
  const depois = ler(p, 'AGENTS.md');
  assert.ok(depois.includes('<!-- agent-harness: início'));
  assert.ok(depois.includes('<!-- agent-harness/metodo: início (o tools/ah metodo instalar reescreve este trecho; escreva fora das marcas) -->'));
  assert.ok(depois.includes('<!-- agent-harness/metodo: fim -->'));
  assert.equal(doNucleo(depois), doNucleo(antes));
  assert.ok(depois.startsWith(antes));
  assert.match(depois, /`superpowers:<nome>`/);
  assert.match(depois, /`mattpocock-skills:<nome>`/);
  assert.match(depois, /use a skill `<nome>` do projeto/);
});

test('instalar copia os arquivos do projeto da coleção só quando faltam', t => {
  const { p, instalar } = cenario(t);
  ok(instalar());
  assert.equal(ler(p, 'docs/agents/issue-tracker.md'), 'rastreador\n');
  assert.equal(ler(p, 'docs/agents/domain.md'), 'domínio\n');
  fs.writeFileSync(caminho(p, 'docs/agents/issue-tracker.md'), 'o rastreador da loja\n');
  ok(instalar());
  assert.equal(ler(p, 'docs/agents/issue-tracker.md'), 'o rastreador da loja\n');
});

test('instalar cria os rótulos de triagem pelo gh; sem gh, avisa e termina', t => {
  const { p, instalar } = cenario(t, { github: 'exemplo/loja' });
  ok(instalar());
  const criados = p.ghChamadas().filter(c => c.argv[0] === 'label' && c.argv[1] === 'create');
  assert.deepEqual(criados.map(c => c.argv[2]), ROTULOS);
  for (const c of criados) assert.ok(c.argv.includes('--force') && c.argv.includes('exemplo/loja'), c.argv.join(' '));

  const fora = instalar([], { env: { GH_FALSO_FORA: '1' } });
  assert.equal(fora.codigo, 0, fora.erro);
  assert.match(fora.erro, /não criei os rótulos de triagem/);
  assert.match(fora.erro, /Faça:/);
});

test('instalar sem github.repo não chama o gh', t => {
  const { p, instalar } = cenario(t);
  ok(instalar());
  assert.deepEqual(p.ghChamadas().filter(c => c.argv[0] === 'label'), []);
});

test('instalar sem rede não grava nada', t => {
  const { p, colecoes, gravarColecoes, instalar } = cenario(t);
  colecoes.colecoes.quebrada = { origem: 'file:///nao/existe/colecao', commit: 'a'.repeat(40), versao: '2.0.0', licenca: 'LICENSE', skills: { beta: 'skills/beta' } };
  gravarColecoes();
  const agents = ler(p, 'AGENTS.md');
  const r = instalar();
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /^Recusado: não consegui buscar a coleção quebrada/);
  assert.match(r.erro, /Faça:/);
  for (const rel of ['.claude/skills', '.agents/skills', '.harness/skills.lock.json', 'docs/agents/issue-tracker.md']) assert.ok(!existe(p, rel), rel);
  assert.equal(ler(p, 'AGENTS.md'), agents);
});

test('skill do harness ligada a uma extensão só é instalada com a extensão ligada', t => {
  const { p, instalar } = cenario(t);
  ok(instalar());
  assert.ok(!existe(p, '.claude/skills/so-com-recursos'));
  configurar(p, cfg => { cfg.extensoes.recursos = true; });
  ok(instalar());
  assert.equal(ler(p, '.claude/skills/so-com-recursos/SKILL.md'), 'so-com-recursos\n');
  assert.deepEqual(travaDe(p).colecoes['agent-harness'].skills, ['preparar-projeto', 'so-com-recursos']);
  configurar(p, cfg => { cfg.extensoes.recursos = false; });
  const r = ok(instalar());
  assert.ok(!existe(p, '.claude/skills/so-com-recursos'));
  assert.match(r.saida, /Removi a skill so-com-recursos de \.claude\/skills/);
  assert.deepEqual(travaDe(p).colecoes['agent-harness'].skills, ['preparar-projeto']);
});

test('instalar recusa quando falta a pasta de uma skill do harness', t => {
  const { p, colecoes, gravarColecoes, instalar } = cenario(t);
  colecoes.colecoes['agent-harness'].skills.sumida = 'sumida';
  gravarColecoes();
  const r = instalar();
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /^Recusado: .*sumida/);
  assert.match(r.erro, /Faça:/);
  assert.ok(!existe(p, '.claude/skills'));
});

test('instalar de novo não muda nada e diz isso', t => {
  const { p, instalar } = cenario(t, { agentes: ['claude-code', 'codex'], github: null });
  commitar(p, ok(instalar()).saida);
  const r = ok(instalar());
  assert.equal(r.saida, 'Nada a mudar: as skills já estão como a trava.\nAgora rode: tools/ah doctor\n');
  assert.equal(r.erro, '');
  assert.equal(p.git(['status', '--porcelain']).saida, '');
});

test('instalar recusa sobrescrever skill alterada à mão, e --forcar descarta', t => {
  const { p, c, colecoes, gravarColecoes, instalar } = cenario(t);
  ok(instalar());
  fs.writeFileSync(caminho(p, '.claude/skills/alfa/SKILL.md'), 'a alfa da Ana\n');
  colecoes.colecoes.falsa.commit = c.novoCommit({ 'skills/alfa/SKILL.md': 'alfa v2\n' });
  gravarColecoes();
  const r = instalar();
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /^Recusado: .*\.claude\/skills: alfa\/SKILL\.md/);
  assert.match(r.erro, /Faça: .*--forcar/);
  assert.equal(ler(p, '.claude/skills/alfa/SKILL.md'), 'a alfa da Ana\n');
  assert.equal(travaDe(p).colecoes.falsa.commit, c.commit);

  ok(instalar(['--forcar']));
  assert.equal(ler(p, '.claude/skills/alfa/SKILL.md'), 'alfa v2\n');
  assert.equal(travaDe(p).colecoes.falsa.commit, colecoes.colecoes.falsa.commit);
});

test('instalar sem a extensão configurada com agentes recusa com o próximo passo', t => {
  const p = criarProjeto();
  t.after(() => p.limpar());
  configurar(p, cfg => { cfg.extensoes = { metodo: {} }; });
  const r = p.ah(['metodo', 'instalar']);
  assert.notEqual(r.codigo, 0);
  assert.match(r.erro, /a extensão metodo não carregou \(configuração recusada: agentes/);
  assert.match(r.erro, /Faça:/);
  const d = p.ah(['doctor']);
  assert.match(d.saida, /^FALHOU {2}Extensão metodo: configuração recusada: agentes .*; corrija extensoes\.metodo em \.harness\/config\.json$/m);
});
