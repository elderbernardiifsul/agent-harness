import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { criarProjeto } from './apoio/repo.mjs';
import { criarColecao } from './apoio/colecao-falsa.mjs';
import { comTrecho } from '../nucleo/extensoes/metodo/trecho.mjs';

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

// Grava uma trava escrita à mão (para os testes de trava inválida).
function gravarTravaFalsa(p, trava) {
  fs.writeFileSync(caminho(p, '.harness/skills.lock.json'), JSON.stringify(trava));
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
  // O triage-labels.md da coleção falsa não tem a tabela: valem os nomes padrão.
  assert.deepEqual(criados.map(c => c.argv[2]), ROTULOS);
  for (const c of criados) {
    assert.ok(!c.argv.includes('--force'), c.argv.join(' '));
    assert.ok(c.argv.includes('exemplo/loja'), c.argv.join(' '));
    assert.match(c.argv[c.argv.indexOf('--color') + 1], /^[0-9A-F]{6}$/);
    assert.ok(c.argv[c.argv.indexOf('--description') + 1], c.argv.join(' '));
  }

  const fora = instalar([], { env: { GH_FALSO_FORA: '1' } });
  assert.equal(fora.codigo, 0, fora.erro);
  assert.match(fora.erro, /não criei os rótulos de triagem/);
  assert.match(fora.erro, /Faça:/);
});

test('os rótulos vêm do triage-labels.md do projeto e só os que faltam são criados', t => {
  const { p, instalar } = cenario(t, { github: 'exemplo/loja' });
  const linhas = ROTULOS.map(r => `| \`${r}\` | \`${r === 'needs-triage' ? 'triagem' : r}\` | papel |`);
  fs.mkdirSync(caminho(p, 'docs/agents'), { recursive: true });
  fs.writeFileSync(caminho(p, 'docs/agents/triage-labels.md'), ['# Rótulos', '', '| Label in mattpocock/skills | Label in our tracker | Meaning |', '| --- | --- | --- |', ...linhas, ''].join('\n'));
  fs.writeFileSync(p.env.GH_FALSO_TICKETS, JSON.stringify({ _rotulos: ['wontfix'] }));
  ok(instalar());
  const doGh = () => p.ghChamadas().filter(c => c.argv[0] === 'label').map(c => c.argv.slice(0, 3).join(' '));
  assert.deepEqual(doGh().filter(c => c.startsWith('label create')).map(c => c.split(' ')[2]), ['triagem', 'needs-info', 'ready-for-agent', 'ready-for-human']);
  const antes = doGh().length;
  ok(instalar());
  assert.deepEqual(doGh().slice(antes).map(c => c.split(' ').slice(0, 2).join(' ')), ['label list']);
});

test('instalar sem github.repo acha o repositório pelo gh e cria os rótulos nele', t => {
  const { p, instalar } = cenario(t);
  ok(instalar());
  const chamadas = p.ghChamadas();
  assert.ok(chamadas.some(c => c.argv[0] === 'repo' && c.argv[1] === 'view'), chamadas.map(c => c.argv.join(' ')).join('\n'));
  const criados = chamadas.filter(c => c.argv[0] === 'label' && c.argv[1] === 'create');
  assert.deepEqual(criados.map(c => c.argv[2]), ROTULOS);
  for (const c of criados) assert.equal(c.argv[c.argv.indexOf('--repo') + 1], 'exemplo/loja');
});

test('instalar sem github.repo e sem repositório no GitHub avisa com o próximo passo e não cria rótulo', t => {
  const { p, instalar } = cenario(t);
  const respostas = path.join(path.dirname(p.env.GH_FALSO_TICKETS), 'respostas.json');
  fs.writeFileSync(respostas, JSON.stringify([{ prefixo: ['repo', 'view'], codigo: 1, erro: 'no git remotes found\n' }]));
  const r = instalar([], { env: { GH_FALSO_RESPOSTAS: respostas } });
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.erro, /não criei os rótulos de triagem no GitHub \(não achei o repositório do projeto no GitHub\)/);
  assert.match(r.erro, /Faça: .*github\.repo em \.harness\/config\.json.*tools\/ah metodo instalar de novo/);
  assert.deepEqual(p.ghChamadas().filter(c => c.argv[0] === 'label'), []);
  assert.ok(existe(p, '.harness/skills.lock.json'));
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
  // Só a skill escrita conta: preparar-projeto já estava igual.
  assert.match(ok(instalar()).saida, /^Instalei 1 skill\(s\) de agent-harness \(/m);
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

test('origem nova com o disco igual à trava instala sem recusa', t => {
  const { p, c, colecoes, gravarColecoes, instalar } = cenario(t);
  ok(instalar());
  colecoes.colecoes.falsa.commit = c.novoCommit({ 'skills/alfa/SKILL.md': 'alfa v2\n', 'skills/alfa/novo.md': 'novo\n', 'skills/alfa/scripts/rodar': null });
  gravarColecoes();
  const r = ok(instalar());
  assert.match(r.saida, /Instalei 1 skill\(s\) de falsa/);
  assert.equal(ler(p, '.claude/skills/alfa/SKILL.md'), 'alfa v2\n');
  assert.equal(ler(p, '.claude/skills/alfa/novo.md'), 'novo\n');
  assert.ok(!existe(p, '.claude/skills/alfa/scripts/rodar'));
  assert.equal(travaDe(p).colecoes.falsa.commit, colecoes.colecoes.falsa.commit);
});

test('instalar devolve o bit de execução perdido, mesmo com o conteúdo igual', { skip: process.platform === 'win32' }, t => {
  const { p, instalar } = cenario(t, { executaveis: ['skills/alfa/scripts/rodar'] });
  ok(instalar());
  fs.chmodSync(caminho(p, '.claude/skills/alfa/scripts/rodar'), 0o644);
  const r = ok(instalar());
  assert.match(r.saida, /Instalei 1 skill\(s\) de falsa/);
  assert.ok(fs.statSync(caminho(p, '.claude/skills/alfa/scripts/rodar')).mode & 0o100);
});

test('trava com destino fora da tabela dos agentes é ilegível, mesmo com --forcar', t => {
  const { p, instalar } = cenario(t);
  gravarTravaFalsa(p, { versaoDoFormato: 1, destinos: ['docs'], colecoes: { falsa: { origem: 'x', commit: null, versao: '1', skills: ['agents'], arquivos: {} } } });
  for (const args of [[], ['--forcar']]) {
    const r = instalar(args);
    assert.equal(r.codigo, 1);
    assert.match(r.erro, /^Recusado: a trava \.harness\/skills\.lock\.json está ilegível: destinos/);
    assert.match(r.erro, /Faça:/);
  }
  assert.ok(existe(p, 'docs/agents/sessoes-paralelas.md'));
});

test('link simbólico dentro da pasta da skill conta como mudança à mão', { skip: process.platform === 'win32' }, t => {
  const { p, instalar } = cenario(t);
  ok(instalar());
  const fora = path.join(path.dirname(p.raiz), 'meu-skill.md');
  fs.writeFileSync(fora, 'a skill da Ana\n');
  fs.rmSync(caminho(p, '.claude/skills/alfa/SKILL.md'));
  fs.symlinkSync(fora, caminho(p, '.claude/skills/alfa/SKILL.md'));
  const r = instalar();
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /\.claude\/skills: alfa\/SKILL\.md \(link simbólico\)/);
  assert.ok(fs.lstatSync(caminho(p, '.claude/skills/alfa/SKILL.md')).isSymbolicLink());
  ok(instalar(['--forcar']));
  assert.ok(fs.lstatSync(caminho(p, '.claude/skills/alfa/SKILL.md')).isFile());
  assert.equal(fs.readFileSync(fora, 'utf8'), 'a skill da Ana\n');
});

test('pasta de skill que é link simbólico conta como mudança à mão', { skip: process.platform === 'win32' }, t => {
  const { p, instalar } = cenario(t);
  ok(instalar());
  const fora = path.join(path.dirname(p.raiz), 'alfa-da-ana');
  fs.cpSync(caminho(p, '.claude/skills/alfa'), fora, { recursive: true });
  fs.rmSync(caminho(p, '.claude/skills/alfa'), { recursive: true });
  fs.symlinkSync(fora, caminho(p, '.claude/skills/alfa'));
  const r = instalar();
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /\.claude\/skills: alfa \(link simbólico\)/);
  ok(instalar(['--forcar']));
  assert.ok(fs.lstatSync(caminho(p, '.claude/skills/alfa')).isDirectory());
  assert.equal(fs.readFileSync(path.join(fora, 'SKILL.md'), 'utf8'), 'alfa v1\n');
});

test('comTrecho com marcas do método quebradas acrescenta no fim e avisa', () => {
  const trecho = '<!-- agent-harness/metodo: início (x) -->\nnovo\n<!-- agent-harness/metodo: fim -->\n';
  const r = comTrecho('antes\n<!-- agent-harness/metodo: início (x) -->\nvelho\n', trecho);
  assert.ok(r.texto.startsWith('antes\n<!-- agent-harness/metodo: início (x) -->\nvelho\n'));
  assert.ok(r.texto.endsWith(trecho));
  assert.match(r.aviso, /^AGENTS\.md tem as marcas do método incompletas ou repetidas/);
  assert.match(r.aviso, /rode tools\/ah metodo instalar de novo/);
  assert.deepEqual(comTrecho('a\r\n', trecho).texto, `a\r\n\r\n${trecho.replace(/\n/g, '\r\n')}`);
});

test('o commit que o instalar indica leva também o .harness/config.json com as extensões ligadas', t => {
  const { p, instalar } = cenario(t);
  const r = ok(instalar());
  assert.match(r.saida, /^ {2}git add -- .*\.harness\/config\.json/m);
  commitar(p, r.saida);
  assert.equal(p.git(['status', '--porcelain', '--', '.harness/config.json']).saida, '');
});

// ---------------------------------------------------------------- docs/agents/metodo.md (fatia 2)
const METODO = fs.readFileSync(new URL('../nucleo/extensoes/metodo/modelos/metodo.md', import.meta.url), 'utf8');
const DOC = 'docs/agents/metodo.md';
const regravarTrava = (p, mudar) => { const t = travaDe(p); mudar(t); fs.writeFileSync(caminho(p, '.harness/skills.lock.json'), `${JSON.stringify(t, null, 2)}\n`); };

test('instalar escreve o docs/agents/metodo.md e grava o hash na trava', t => {
  const { p, instalar } = cenario(t);
  const r = ok(instalar());
  assert.equal(ler(p, DOC), METODO);
  assert.equal(travaDe(p).documentos[DOC], sha(METODO));
  assert.match(r.saida, /Escrevi docs\/agents\/metodo\.md\.\n/);
  assert.ok(r.saida.indexOf('Escrevi docs/agents/metodo.md.') < r.saida.indexOf('Escrevi o trecho do método'));
  assert.match(r.saida, /git add -- .*AGENTS\.md docs\/agents\/metodo\.md/);
});

test('instalar reescreve o metodo.md que não foi mexido quando o texto do harness muda', t => {
  const { p, instalar } = cenario(t);
  ok(instalar());
  fs.writeFileSync(caminho(p, DOC), 'versão antiga\n');
  regravarTrava(p, tr => { tr.documentos[DOC] = sha('versão antiga\n'); });
  ok(instalar());
  assert.equal(ler(p, DOC), METODO);
  assert.equal(travaDe(p).documentos[DOC], sha(METODO));
});

test('instalar recusa sobrescrever o metodo.md mudado à mão, e --forcar descarta', t => {
  const { p, instalar } = cenario(t);
  ok(instalar());
  fs.writeFileSync(caminho(p, DOC), 'versão antiga\n');
  regravarTrava(p, tr => { tr.documentos[DOC] = sha('versão antiga\n'); });
  fs.appendFileSync(caminho(p, DOC), '\nNota da Ana.\n');
  const r = instalar();
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /^Recusado: a instalação sobrescreveria arquivos do método mudados à mão \(.*docs\/agents\/metodo\.md/);
  assert.match(r.erro, /Faça: .*fora das marcas.*--forcar/);
  assert.equal(ler(p, DOC), 'versão antiga\n\nNota da Ana.\n');
  ok(instalar(['--forcar']));
  assert.equal(ler(p, DOC), METODO);
});

test('instalar não apaga o metodo.md que o projeto já tinha antes do método', t => {
  const { p, instalar } = cenario(t);
  fs.mkdirSync(caminho(p, 'docs/agents'), { recursive: true });
  fs.writeFileSync(caminho(p, DOC), 'o método da loja\n');
  const r = instalar();
  assert.equal(r.codigo, 1);
  assert.match(r.erro, /docs\/agents\/metodo\.md/);
  assert.equal(ler(p, DOC), 'o método da loja\n');
  assert.ok(!existe(p, '.claude/skills/alfa'));
  assert.ok(!existe(p, '.harness/skills.lock.json'));
});

test('projeto instalado antes desta versão ganha o metodo.md e a trava passa a ter documentos', t => {
  const { p, instalar } = cenario(t);
  commitar(p, ok(instalar()).saida);
  fs.rmSync(caminho(p, DOC));
  regravarTrava(p, tr => { delete tr.documentos; });
  for (const args of [['add', '-A'], ['commit', '-q', '-m', 'como era antes']]) assert.equal(p.git(args).codigo, 0);
  ok(instalar());
  assert.equal(ler(p, DOC), METODO);
  assert.equal(travaDe(p).documentos[DOC], sha(METODO));
});

test('metodo.md com CRLF igual ao instalado não conta como mudança à mão', t => {
  const { p, instalar } = cenario(t);
  ok(instalar());
  fs.writeFileSync(caminho(p, DOC), METODO.replace(/\n/g, '\r\n'));
  const r = instalar();
  assert.equal(r.codigo, 0, r.erro);
  assert.doesNotMatch(r.erro, /Recusado/);
});

test('metodo.md como link simbólico não é seguido e vira aviso', { skip: process.platform === 'win32' }, t => {
  const { p, instalar } = cenario(t);
  fs.mkdirSync(caminho(p, 'docs/agents'), { recursive: true });
  fs.writeFileSync(caminho(p, 'docs/outro.md'), 'outro\n');
  fs.symlinkSync('../outro.md', caminho(p, DOC));
  const r = instalar();
  assert.equal(r.codigo, 0, r.erro);
  assert.match(r.erro, /docs\/agents\/metodo\.md é um link simbólico/);
  assert.match(r.erro, /Faça:/);
  assert.equal(ler(p, 'docs/outro.md'), 'outro\n');
  assert.ok(fs.lstatSync(caminho(p, DOC)).isSymbolicLink());
});

test('instalar de novo, com o metodo.md já instalado, não muda nada', t => {
  const { p, instalar } = cenario(t);
  commitar(p, ok(instalar()).saida);
  assert.equal(ok(instalar()).saida, 'Nada a mudar: as skills já estão como a trava.\nAgora rode: tools/ah doctor\n');
  assert.equal(p.git(['status', '--porcelain']).saida, '');
});

test('atualizar --simular não grava o metodo.md', t => {
  const { p } = cenario(t);
  const r = ok(p.ah(['metodo', 'atualizar', '--simular']));
  assert.ok(!existe(p, DOC));
  assert.match(r.saida, /Escrevi docs\/agents\/metodo\.md\./);
  assert.match(r.saida, /Simulação: nada foi gravado\./);
});
