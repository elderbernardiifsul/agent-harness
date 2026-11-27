import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { criarProjeto } from './apoio/repo.mjs';
import { criarColecao } from './apoio/colecao-falsa.mjs';
import { pluginsDuplicados } from '../nucleo/extensoes/metodo/plugins.mjs';

const ok = r => { assert.equal(r.codigo, 0, r.erro); return r; };
const caminho = (p, rel) => path.join(p.raiz, ...rel.split('/'));
const ler = (p, rel) => fs.readFileSync(caminho(p, rel), 'utf8');

// Projeto com a extensão metodo, uma coleção falsa (alfa, gama) já instalada e um HOME descartável.
function cenario(t, { agentes = ['claude-code'], extensoesDoHarness = {} } = {}) {
  const c = criarColecao({ skills: { 'skills/alfa': { 'SKILL.md': 'alfa v1\n' }, 'skills/gama': { 'SKILL.md': 'gama\n' } } });
  t.after(() => c.limpar());
  const p = criarProjeto();
  t.after(() => p.limpar());
  const pasta = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ah-metodo-doctor-')));
  t.after(() => fs.rmSync(pasta, { recursive: true, force: true }));
  fs.mkdirSync(path.join(pasta, 'skills', 'preparar-projeto'), { recursive: true });
  fs.writeFileSync(path.join(pasta, 'skills', 'preparar-projeto', 'SKILL.md'), 'preparar-projeto\n');
  const colecoes = { versaoDoFormato: 1, colecoes: { 'agent-harness': { local: 'skills', skills: { 'preparar-projeto': 'preparar-projeto' }, extensoes: extensoesDoHarness }, falsa: { origem: c.origem, commit: c.commit, versao: '1.0.0', licenca: 'LICENSE', skills: { alfa: 'skills/alfa', gama: 'skills/gama' } } } };
  const arquivo = path.join(pasta, 'colecoes.json');
  const gravarColecoes = () => fs.writeFileSync(arquivo, JSON.stringify(colecoes, null, 2));
  gravarColecoes();
  const casa = path.join(pasta, 'casa');
  fs.mkdirSync(casa);
  p.env.AH_METODO_COLECOES = arquivo;
  p.env.AH_CACHE = path.join(pasta, 'cache');
  p.env.HOME = casa;
  delete p.env.CLAUDE_CONFIG_DIR;
  const cfg = caminho(p, '.harness/config.json');
  const conf = JSON.parse(fs.readFileSync(cfg, 'utf8'));
  conf.extensoes = { metodo: { agentes } };
  fs.writeFileSync(cfg, JSON.stringify(conf, null, 2));
  assert.equal(p.git(['add', '--', '.harness/config.json']).codigo, 0);
  assert.equal(p.git(['commit', '-q', '-m', 'configura']).codigo, 0);
  ok(p.ah(['metodo', 'instalar']));
  return { p, c, casa, colecoes, gravarColecoes };
}

const itemDe = (p, nome) => {
  const r = JSON.parse(p.ah(['doctor', '--json']).saida);
  const i = r.itens.find(x => x.item === `${nome} (metodo)`);
  assert.ok(i, `item ${nome} ausente: ${r.itens.map(x => x.item).join(' | ')}`);
  return i;
};
const plugins = (casa, chaves) => {
  fs.mkdirSync(path.join(casa, '.claude', 'plugins'), { recursive: true });
  fs.writeFileSync(path.join(casa, '.claude', 'plugins', 'installed_plugins.json'), JSON.stringify({ version: 2, plugins: Object.fromEntries(chaves.map(k => [k, [{ scope: 'user' }]])) }));
};

test('Trava das skills: ok, aviso quando falta e falha quando ilegível', t => {
  const { p } = cenario(t);
  assert.equal(itemDe(p, 'Trava das skills').estado, 'ok');
  fs.writeFileSync(caminho(p, '.harness/skills.lock.json'), '{ quebrada');
  const ruim = itemDe(p, 'Trava das skills');
  assert.equal(ruim.estado, 'falha');
  assert.match(ruim.fazer, /não é JSON válido; .*git checkout -- \.harness\/skills\.lock\.json.*metodo instalar/);
  fs.rmSync(caminho(p, '.harness/skills.lock.json'));
  const falta = itemDe(p, 'Trava das skills');
  assert.equal(falta.estado, 'aviso');
  assert.match(falta.fazer, /rode tools\/ah metodo instalar/);
});

test('Skills iguais à trava: ok, e aviso com alterados e ausentes por destino', t => {
  const { p } = cenario(t);
  assert.equal(itemDe(p, 'Skills iguais à trava').estado, 'ok');
  fs.writeFileSync(caminho(p, '.claude/skills/alfa/SKILL.md'), 'mexi\n');
  fs.rmSync(caminho(p, '.claude/skills/gama'), { recursive: true });
  const i = itemDe(p, 'Skills iguais à trava');
  assert.equal(i.estado, 'aviso');
  assert.match(i.fazer, /alterados em \.claude\/skills: alfa\/SKILL\.md/);
  assert.match(i.fazer, /ausentes em \.claude\/skills: gama\/LICENSE, gama\/SKILL\.md/);
  assert.match(i.fazer, /tools\/ah metodo instalar/);
});

test('Skills iguais à trava: skill de extensão desligada instalada, e de extensão ligada faltando', t => {
  const { p, colecoes, gravarColecoes } = cenario(t);
  // A extensão `recursos` está desligada e a skill preparar-projeto passa a depender dela.
  colecoes.colecoes['agent-harness'].extensoes = { 'preparar-projeto': 'recursos' };
  gravarColecoes();
  const sobra = itemDe(p, 'Skills iguais à trava');
  assert.equal(sobra.estado, 'aviso');
  assert.match(sobra.fazer, /preparar-projeto.*extensão recursos desligada/);
  // Agora a extensão está ligada, mas a trava não tem a skill.
  const cfg = caminho(p, '.harness/config.json');
  const conf = JSON.parse(fs.readFileSync(cfg, 'utf8'));
  conf.extensoes.recursos = true;
  fs.writeFileSync(cfg, JSON.stringify(conf, null, 2));
  const trava = JSON.parse(ler(p, '.harness/skills.lock.json'));
  trava.colecoes['agent-harness'].skills = [];
  trava.colecoes['agent-harness'].arquivos = {};
  fs.writeFileSync(caminho(p, '.harness/skills.lock.json'), JSON.stringify(trava));
  fs.rmSync(caminho(p, '.claude/skills/preparar-projeto'), { recursive: true });
  const falta = itemDe(p, 'Skills iguais à trava');
  assert.equal(falta.estado, 'aviso');
  assert.match(falta.fazer, /preparar-projeto.*extensão recursos ligada/);
});

test('Coleções na versão recomendada: ok, e aviso por coleção com commit diferente (agent-harness fica de fora)', t => {
  const { p, c, colecoes, gravarColecoes } = cenario(t);
  assert.equal(itemDe(p, 'Coleções na versão recomendada').estado, 'ok');
  const novo = c.novoCommit({ 'skills/alfa/SKILL.md': 'alfa v2\n' });
  colecoes.colecoes.falsa.commit = novo;
  gravarColecoes();
  const i = itemDe(p, 'Coleções na versão recomendada');
  assert.equal(i.estado, 'aviso');
  assert.match(i.fazer, new RegExp(`falsa: instalado ${c.commit.slice(0, 7)}, recomendado ${novo.slice(0, 7)}`));
  assert.match(i.fazer, /tools\/ah metodo atualizar/);
  assert.doesNotMatch(i.fazer, /agent-harness/);
});

test('Coleções sem plugin duplicado: ok sem plugin, aviso com plugin no Claude Code', t => {
  const { p, casa } = cenario(t);
  assert.equal(itemDe(p, 'Coleções sem plugin duplicado').estado, 'ok');
  plugins(casa, ['superpowers@claude-plugins-official', 'outro@x']);
  const i = itemDe(p, 'Coleções sem plugin duplicado');
  assert.equal(i.estado, 'aviso');
  assert.match(i.fazer, /superpowers no Claude Code/);
  assert.doesNotMatch(i.fazer, /outro/);
});

test('Coleções sem plugin duplicado: respeita CLAUDE_CONFIG_DIR e ignora agente fora de metodo.agentes', t => {
  const { p, casa } = cenario(t);
  const outra = path.join(casa, 'cfg');
  fs.mkdirSync(path.join(outra, 'plugins'), { recursive: true });
  fs.writeFileSync(path.join(outra, 'plugins', 'installed_plugins.json'), JSON.stringify({ plugins: { 'mattpocock-skills@loja': [] } }));
  p.env.CLAUDE_CONFIG_DIR = outra;
  assert.match(itemDe(p, 'Coleções sem plugin duplicado').fazer, /mattpocock-skills no Claude Code/);
  // Sem claude-code nos agentes, o plugin do Claude não interessa.
  const cfg = caminho(p, '.harness/config.json');
  const conf = JSON.parse(fs.readFileSync(cfg, 'utf8'));
  conf.extensoes.metodo.agentes = ['codex'];
  fs.writeFileSync(cfg, JSON.stringify(conf, null, 2));
  assert.equal(itemDe(p, 'Coleções sem plugin duplicado').estado, 'ok');
});

test('pluginsDuplicados: arquivo ausente ou ilegível não acusa nada', t => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'ah-plugins-'));
  t.after(() => fs.rmSync(pasta, { recursive: true, force: true }));
  assert.deepEqual(pluginsDuplicados({ env: { HOME: pasta }, agentes: ['claude-code'] }), []);
  plugins(pasta, ['superpowers@a', 'mattpocock-skills@b']);
  assert.deepEqual(pluginsDuplicados({ env: { HOME: pasta }, agentes: ['claude-code'] }), ['superpowers no Claude Code', 'mattpocock-skills no Claude Code']);
  fs.writeFileSync(path.join(pasta, '.claude', 'plugins', 'installed_plugins.json'), 'xx');
  assert.deepEqual(pluginsDuplicados({ env: { HOME: pasta }, agentes: ['claude-code'] }), []);
  assert.match(pluginsDuplicados({ env: { HOME: pasta }, agentes: ['claude-code'], detalhado: true }).ilegivel, /installed_plugins\.json$/);
});

test('Skills sem nome repetido: cópias idênticas e agente sem opencode não avisam', t => {
  const { p } = cenario(t, { agentes: ['claude-code', 'opencode'] });
  // instalar copia igual para .claude/skills e .agents/skills
  assert.equal(itemDe(p, 'Skills sem nome repetido').estado, 'ok');
});

test('Skills sem nome repetido: aviso com opencode e conteúdo diferente; sem opencode, ok', t => {
  const { p } = cenario(t, { agentes: ['claude-code', 'opencode'] });
  fs.writeFileSync(caminho(p, '.agents/skills/alfa/SKILL.md'), 'alfa do aluno\n');
  const i = itemDe(p, 'Skills sem nome repetido');
  assert.equal(i.estado, 'aviso');
  assert.match(i.fazer, /alfa \(\.claude\/skills, \.agents\/skills\)/);
  assert.match(i.fazer, /OpenCode/);
  const cfg = caminho(p, '.harness/config.json');
  const conf = JSON.parse(fs.readFileSync(cfg, 'utf8'));
  conf.extensoes.metodo.agentes = ['claude-code', 'codex'];
  fs.writeFileSync(cfg, JSON.stringify(conf, null, 2));
  assert.equal(itemDe(p, 'Skills sem nome repetido').estado, 'ok');
});

test('Coleções na versão recomendada: colecoes.json ilegível vira aviso, e coleção que saiu da lista é dita', t => {
  const { p, colecoes, gravarColecoes } = cenario(t);
  const arquivo = p.env.AH_METODO_COLECOES;
  const bom = fs.readFileSync(arquivo, 'utf8');
  fs.writeFileSync(arquivo, '{ quebrado');
  const i = itemDe(p, 'Coleções na versão recomendada');
  assert.equal(i.estado, 'aviso');
  assert.match(i.fazer, /corrija o colecoes\.json \(ou AH_METODO_COLECOES\) e rode ah doctor/);
  fs.writeFileSync(arquivo, bom);
  delete colecoes.colecoes.falsa;
  gravarColecoes();
  const j = itemDe(p, 'Coleções na versão recomendada');
  assert.equal(j.estado, 'aviso');
  assert.match(j.fazer, /a coleção falsa não está mais entre as recomendadas; .*metodo atualizar/);
});

test('Coleções sem plugin duplicado: installed_plugins.json ilegível segue ok e diz que pulou', t => {
  const { p, casa } = cenario(t);
  fs.mkdirSync(path.join(casa, '.claude', 'plugins'), { recursive: true });
  fs.writeFileSync(path.join(casa, '.claude', 'plugins', 'installed_plugins.json'), 'xx');
  const i = JSON.parse(p.ah(['doctor', '--json']).saida).itens.find(x => x.item.startsWith('Coleções sem plugin duplicado (metodo)'));
  assert.match(i.item, /não consegui ler .*installed_plugins\.json; a conferência de plugin duplicado foi pulada/);
  assert.equal(i.estado, 'ok');
});

test('arquivo de skill ilegível: aviso diz a pasta e o que fazer, nos dois itens', { skip: process.platform === 'win32' || process.getuid?.() === 0 }, t => {
  const { p } = cenario(t, { agentes: ['claude-code', 'opencode'] });
  const arq = caminho(p, '.claude/skills/alfa/SKILL.md');
  fs.chmodSync(arq, 0o000);
  t.after(() => { try { fs.chmodSync(arq, 0o644); } catch { /* a pasta já foi apagada */ } });
  const a = itemDe(p, 'Skills iguais à trava');
  assert.equal(a.estado, 'aviso');
  assert.match(a.fazer, /\.claude\/skills\/alfa \(EACCES\); .*permissão de leitura/);
  const b = itemDe(p, 'Skills sem nome repetido');
  assert.equal(b.estado, 'aviso');
  assert.match(b.fazer, /\.claude\/skills\/alfa \(EACCES\)/);
});

test('link quebrado na pasta da skill: aviso de alterado, sem derrubar o item', t => {
  const { p } = cenario(t);
  fs.symlinkSync('/nao/existe', caminho(p, '.claude/skills/alfa/quebrado'));
  const i = itemDe(p, 'Skills iguais à trava');
  assert.equal(i.estado, 'aviso');
  assert.match(i.fazer, /alfa\/quebrado/);
});

// ---------------------------------------------------------------- documento do método e skills citadas (fatia 2)
const DOC = 'docs/agents/metodo.md';
const METODO = fs.readFileSync(new URL('../nucleo/extensoes/metodo/modelos/metodo.md', import.meta.url), 'utf8');
const regravarTrava = (p, mudar) => {
  const arq = caminho(p, '.harness/skills.lock.json');
  const tr = JSON.parse(fs.readFileSync(arq, 'utf8'));
  mudar(tr);
  fs.writeFileSync(arq, JSON.stringify(tr, null, 2));
};

test('doctor: metodo.md igual à trava passa; mudado à mão avisa', t => {
  const { p } = cenario(t);
  assert.equal(itemDe(p, 'Documento do método igual à trava').estado, 'ok');
  fs.appendFileSync(caminho(p, DOC), '\nNota da Ana.\n');
  const i = itemDe(p, 'Documento do método igual à trava');
  assert.equal(i.estado, 'aviso');
  assert.match(i.fazer, /docs\/agents\/metodo\.md foi mudado à mão/);
  assert.match(i.fazer, /fora das marcas.*--forcar/);
});

test('doctor: metodo.md com CRLF igual ao instalado passa', t => {
  const { p } = cenario(t);
  fs.writeFileSync(caminho(p, DOC), METODO.replace(/\n/g, '\r\n'));
  assert.equal(itemDe(p, 'Documento do método igual à trava').estado, 'ok');
});

test('doctor: trava sem documentos, arquivo ausente e link avisam com o conserto', { skip: process.platform === 'win32' }, t => {
  const { p } = cenario(t);
  regravarTrava(p, tr => { delete tr.documentos; });
  const semCampo = itemDe(p, 'Documento do método igual à trava');
  assert.equal(semCampo.estado, 'aviso');
  assert.match(semCampo.fazer, /ainda não foi instalado.*tools\/ah metodo instalar/);
  regravarTrava(p, tr => { tr.documentos = { [DOC]: 'a'.repeat(64) }; });
  fs.rmSync(caminho(p, DOC));
  assert.match(itemDe(p, 'Documento do método igual à trava').fazer, /docs\/agents\/metodo\.md não existe.*tools\/ah metodo instalar/);
  fs.symlinkSync('../../AGENTS.md', caminho(p, DOC));
  assert.match(itemDe(p, 'Documento do método igual à trava').fazer, /não é um arquivo comum.*apague-o/);
});

test('doctor: skill citada no metodo.md e fora da trava avisa', t => {
  const { p } = cenario(t);
  // O colecoes.json de teste não tem as skills reais que o texto do método cita.
  const i = itemDe(p, 'Skills citadas no método instaladas');
  assert.equal(i.estado, 'aviso');
  assert.match(i.fazer, /\d+ citada\(s\) e fora da trava: brainstorming, .* e mais \d+/);
  assert.match(i.fazer, /tools\/ah metodo instalar/);
  fs.writeFileSync(caminho(p, DOC), 'Use `alfa` e `gama`.\n');
  assert.equal(itemDe(p, 'Skills citadas no método instaladas').estado, 'ok');
});

test('doctor: skill da tabela No lugar e skill de extensão desligada não avisam', t => {
  const { p, colecoes, gravarColecoes } = cenario(t);
  const local = path.join(path.dirname(p.env.AH_METODO_COLECOES), 'skills', 'so-com-recursos');
  fs.mkdirSync(local, { recursive: true });
  fs.writeFileSync(path.join(local, 'SKILL.md'), 'so-com-recursos\n');
  colecoes.colecoes['agent-harness'].skills['so-com-recursos'] = 'so-com-recursos';
  colecoes.colecoes['agent-harness'].extensoes['so-com-recursos'] = 'recursos';
  gravarColecoes();
  fs.writeFileSync(caminho(p, DOC), 'Use `using-git-worktrees` e `so-com-recursos`.\n');
  assert.equal(itemDe(p, 'Skills citadas no método instaladas').estado, 'ok');
  const cfg = caminho(p, '.harness/config.json');
  const conf = JSON.parse(fs.readFileSync(cfg, 'utf8'));
  conf.extensoes.recursos = true;
  fs.writeFileSync(cfg, JSON.stringify(conf, null, 2));
  const i = itemDe(p, 'Skills citadas no método instaladas');
  assert.equal(i.estado, 'aviso');
  assert.match(i.fazer, /so-com-recursos/);
});

test('doctor sem trava: os dois itens novos ficam ok', t => {
  const { p } = cenario(t);
  fs.rmSync(caminho(p, '.harness/skills.lock.json'));
  assert.equal(itemDe(p, 'Documento do método igual à trava').estado, 'ok');
  assert.equal(itemDe(p, 'Skills citadas no método instaladas').estado, 'ok');
});
