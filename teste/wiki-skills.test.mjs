// As skills da wiki e da reunião (nucleo/extensoes/metodo/skills/) e o formato num lugar só
// (nucleo/extensoes/wiki/formato.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PADRAO, configDaWiki } from '../nucleo/extensoes/wiki/fontes.mjs';
import { conferir } from '../nucleo/extensoes/wiki/conferir.mjs';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKILLS = path.join(RAIZ, 'nucleo', 'extensoes', 'metodo', 'skills');
const WIKI = path.join(RAIZ, 'nucleo', 'extensoes', 'wiki');
const DA_WIKI = ['wiki-ingerir', 'wiki-consultar', 'wiki-conferir'];
const ler = nome => fs.readFileSync(path.join(SKILLS, nome, 'SKILL.md'), 'utf8');
const FORMATO = '.harness/nucleo/extensoes/wiki/formato.md';

function frontmatter(texto) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(texto);
  assert.ok(m, 'falta o frontmatter');
  return Object.fromEntries(m[1].split('\n').map(l => /^(\w+):\s*(.*)$/.exec(l)).filter(Boolean).map(([, k, v]) => [k, v.replace(/^"|"$/g, '')]));
}

test('cada skill tem frontmatter com o nome da pasta e descrição', () => {
  for (const nome of [...DA_WIKI, 'reuniao-ingerir']) {
    const f = frontmatter(ler(nome));
    assert.equal(f.name, nome);
    assert.ok((f.description ?? '').length >= 40, `${nome}: descrição curta`);
  }
});

test('as três apontam para o formato, que existe, e nenhuma repete o formato', () => {
  assert.ok(fs.existsSync(path.join(WIKI, 'formato.md')));
  for (const nome of DA_WIKI) {
    const t = ler(nome);
    assert.ok(t.includes(FORMATO), `${nome} não aponta para o formato`);
    assert.ok(!t.includes('| Artigo | Resumo | Atualizado |'), `${nome} repete o modelo do índice`);
    assert.ok(!/^> Fontes: \[/m.test(t), `${nome} repete o modelo do artigo`);
  }
});

test('nenhuma skill repete a lista de fontes', () => {
  for (const nome of [...DA_WIKI, 'reuniao-ingerir']) {
    const t = ler(nome);
    for (const padrao of [...PADRAO.fontes.filter(p => p.includes('*')), ...PADRAO.foraDasFontes]) assert.ok(!t.includes(padrao), `${nome} repete ${padrao}`);
  }
  for (const nome of DA_WIKI) assert.ok(ler(nome).includes('tools/ah wiki fontes'), `${nome} não manda rodar tools/ah wiki fontes`);
});

test('crédito e licença do original MIT em cada skill de wiki e na extensão', () => {
  for (const pasta of [...DA_WIKI.map(n => path.join(SKILLS, n)), WIKI]) {
    assert.match(fs.readFileSync(path.join(pasta, 'LICENSE-karpathy-llm-wiki'), 'utf8'), /^MIT License\n/);
  }
  for (const nome of DA_WIKI) assert.ok(ler(nome).includes('astro-han/karpathy-llm-wiki'), `${nome} sem crédito`);
});

test('a entrada sem material do formato é a que o conferir lê', t => {
  const formato = fs.readFileSync(path.join(WIKI, 'formato.md'), 'utf8');
  const entrada = formato.split('\n').find(l => l.startsWith('## [') && l.includes('sem material:'));
  assert.ok(entrada, 'formato.md sem exemplo de entrada sem material');
  const caminho = /sem material:\s*`?([^`\s]+)/.exec(entrada)[1];
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'wiki-formato-'));
  t.after(() => fs.rmSync(raiz, { recursive: true, force: true }));
  for (const [rel, texto] of [[caminho, 'x\n'], ['docs/wiki/index.md', '# Índice da wiki\n'], ['docs/wiki/log.md', `# Log da wiki\n\n${entrada}\n`]]) {
    fs.mkdirSync(path.dirname(path.join(raiz, rel)), { recursive: true });
    fs.writeFileSync(path.join(raiz, rel), texto);
  }
  assert.deepEqual(conferir(raiz, configDaWiki({})).pendentes, []);
});

test('o modelo de artigo do formato passa pelo conferir com a fonte de exemplo', t => {
  // O exemplo de artigo do formato.md (entre as marcas <!-- exemplo:artigo --> e <!-- /exemplo -->) cita uma fonte
  // de exemplo (entre <!-- exemplo:fonte <caminho> --> e <!-- /exemplo -->); juntos, não dão suspeito nem erro.
  const formato = fs.readFileSync(path.join(WIKI, 'formato.md'), 'utf8');
  const bloco = re => { const m = re.exec(formato); assert.ok(m, `formato.md sem ${re}`); return m; };
  const artigo = bloco(/<!-- exemplo:artigo (\S+) -->\n```markdown\n([\s\S]*?)```\n<!-- \/exemplo -->/);
  const fonte = bloco(/<!-- exemplo:fonte (\S+) -->\n```markdown\n([\s\S]*?)```\n<!-- \/exemplo -->/);
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'wiki-formato-'));
  t.after(() => fs.rmSync(raiz, { recursive: true, force: true }));
  for (const [rel, texto] of [[artigo[1], artigo[2]], [fonte[1], fonte[2]], ['docs/wiki/index.md', '# Índice da wiki\n'], ['docs/wiki/log.md', '# Log da wiki\n']]) {
    fs.mkdirSync(path.dirname(path.join(raiz, rel)), { recursive: true });
    fs.writeFileSync(path.join(raiz, rel), texto);
  }
  const r = conferir(raiz, configDaWiki({}));
  assert.deepEqual([r.suspeitos, r.erros], [[], []]);
});

test('reuniao-ingerir: saídas, eixo de tempo e a passagem para a wiki', () => {
  const t = ler('reuniao-ingerir');
  for (const trecho of ['sobras.md', '[H:MM:SS]', 'wiki-ingerir', '(inferido)', 'docs/reunioes/', 'README.md', 'tools/ah wiki conferir', 'consentimento']) {
    assert.ok(t.includes(trecho), `falta ${trecho}`);
  }
});

test('reuniao-ingerir diz o resultado, não a ferramenta', () => {
  const t = ler('reuniao-ingerir');
  assert.doesNotMatch(t, /ffmpeg|whisper|piper|vosk|yt-dlp|\bapt\b|\bbrew\b|pip install|npm install/i);
  assert.match(t, /"sim" do aluno/);
});
