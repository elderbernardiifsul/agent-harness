// O texto do método (modelos/metodo.md), o trecho do AGENTS.md (modelos/agents-metodo.md) e as skills que eles citam.
// Convenção de escrita: código inline de uma palavra só, em minúsculas, é nome de skill (citadas.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { skillsCitadas, skillsConhecidas, skillsNoLugar } from '../nucleo/extensoes/metodo/citadas.mjs';
import { lerColecoes } from '../nucleo/extensoes/metodo/colecoes.mjs';
import { dirDoCache } from '../nucleo/extensoes/metodo/origem.mjs';
import { spawnSync } from 'node:child_process';
import { MARCA_FIM, MARCA_INICIO, trechoDe } from '../nucleo/extensoes/metodo/trecho.mjs';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXT = path.join(RAIZ, 'nucleo', 'extensoes', 'metodo');
const ler = rel => fs.readFileSync(path.join(RAIZ, ...rel.split('/')), 'utf8');
const METODO = 'nucleo/extensoes/metodo/modelos/metodo.md';
const TRECHO = 'nucleo/extensoes/metodo/modelos/agents-metodo.md';

const TITULOS = [
  '# Método de trabalho',
  '## Escolha a trilha',
  '### Antes da trilha: triar',
  '## As trilhas',
  '### Um commit',
  '### Plano de partida',
  '### Spec e plano',
  '### Investigação longa',
  '## Um dono por etapa',
  '## Atritos resolvidos',
  '## Paralelismo em dois níveis',
  '## Nível de modelo',
  '## Registros da execução por subagentes',
  '## Extensões opcionais',
  '## Segredos',
  '## Por que cada etapa existe',
];

const titulosDe = texto => texto.split('\n').filter(l => l.startsWith('#'));
// A subseção de um título: do título até o próximo título de qualquer nível.
function secao(texto, titulo) {
  const linhas = texto.split('\n');
  const i = linhas.indexOf(titulo);
  assert.ok(i >= 0, `falta a seção ${titulo}`);
  const fim = linhas.findIndex((l, j) => j > i && l.startsWith('#'));
  return linhas.slice(i + 1, fim < 0 ? undefined : fim).join('\n');
}

function permitidas() {
  const { colecoes } = lerColecoes(path.join(EXT, 'colecoes.json'));
  return new Set([...skillsConhecidas(colecoes), ...skillsNoLugar(ler(TRECHO))]);
}
const AVISO_DA_CONVENCAO = 'cita skill que o método não instala. Código inline de uma palavra minúscula é nome de skill; escreva o resto sem código ou com barra, ponto ou espaço.';

test('skillsCitadas pega só código inline de uma palavra minúscula, fora de bloco cercado', () => {
  const texto = 'Use `writing-plans`, `tools/ah open`, `Nível: alto`, `GLOSSARY.md`, `--forcar`.\n```\n`grilling`\n```\nDepois `brainstorming` e `writing-plans`.';
  assert.deepEqual(skillsCitadas(texto), ['brainstorming', 'writing-plans']);
});

test('skillsNoLugar lê a primeira coluna da tabela das skills citadas', () => {
  const t = '| Skill citada | Quem cita | No lugar |\n|---|---|---|\n| `using-git-worktrees` | writing-plans | o worktree da frente |\n| `using-git-worktrees` | outra | de novo |\n';
  assert.deepEqual(skillsNoLugar(t), ['using-git-worktrees']);
});

test('skillsConhecidas junta as skills de todas as coleções, a do harness inclusive', () => {
  const s = skillsConhecidas({ a: { skills: { alfa: 'x' } }, 'agent-harness': { skills: { 'wiki-ingerir': 'wiki-ingerir' } } });
  assert.deepEqual([...s].sort(), ['alfa', 'wiki-ingerir']);
});

test('toda skill citada no metodo.md e no trecho do AGENTS.md existe em colecoes.json ou na tabela "No lugar"', () => {
  const ok = permitidas();
  for (const arquivo of [METODO, TRECHO]) {
    assert.deepEqual(skillsCitadas(ler(arquivo)).filter(s => !ok.has(s)), [], `${arquivo} ${AVISO_DA_CONVENCAO}`);
  }
});

test('o metodo.md tem as seções na ordem', () => {
  assert.deepEqual(titulosDe(ler(METODO)), TITULOS);
});

test('cada trilha diz as skills que entram nela', () => {
  const texto = ler(METODO);
  const esperadas = {
    '### Antes da trilha: triar': ['to-tickets', 'triage'],
    '### Um commit': ['systematic-debugging', 'test-driven-development', 'verification-before-completion'],
    '### Plano de partida': ['executing-plans', 'requesting-code-review', 'subagent-driven-development', 'systematic-debugging', 'test-driven-development', 'verification-before-completion', 'writing-plans'],
    '### Spec e plano': ['brainstorming', 'domain-modeling', 'grilling', 'writing-plans'],
    '### Investigação longa': ['grilling', 'prototype', 'research', 'wayfinder'],
  };
  for (const [titulo, skills] of Object.entries(esperadas)) {
    const linha = secao(texto, titulo).split('\n').find(l => l.trim().startsWith('**Skills:**') || l.trim().startsWith('- **Skills:**'));
    assert.ok(linha, `${titulo} sem a linha **Skills:**`);
    assert.deepEqual(skillsCitadas(linha), skills, titulo);
  }
});

test('as skills das extensões só aparecem como "quando a extensão estiver ligada"', () => {
  const { colecoes } = lerColecoes(path.join(EXT, 'colecoes.json'));
  const daExtensao = colecoes['agent-harness'].extensoes;
  const texto = ler(METODO);
  for (const [skill, ext] of Object.entries(daExtensao)) {
    for (const linha of texto.split('\n').filter(l => skillsCitadas(l).includes(skill))) {
      assert.match(linha, new RegExp(`extensão ${ext}`), `a linha que cita ${skill} não diz que depende da extensão ${ext}: ${linha}`);
    }
  }
  const opcionais = secao(texto, '## Extensões opcionais');
  for (const ext of ['wiki', 'orquestracao', 'ambiente', 'migracao', 'prova']) assert.match(opcionais, new RegExp(`\\b${ext}\\b`), `Extensões opcionais sem ${ext}`);
});

test('o metodo.md diz quando guardar e devolver os registros', () => {
  const s = secao(ler(METODO), '## Registros da execução por subagentes');
  assert.match(s, /`tools\/ah registros guardar`/);
  assert.match(s, /`tools\/ah registros devolver`/);
  assert.match(s, /antes/i);
  assert.match(s, /`tools\/ah close`/);
});

test('o metodo.md usa GLOSSARY.md, aponta em vez de repetir e é curto', () => {
  const texto = ler(METODO);
  assert.ok(texto.includes('GLOSSARY.md'));
  assert.ok(!texto.includes('CONTEXT.md'));
  assert.doesNotMatch(texto, /superpowers:|mattpocock-skills:/);
  assert.ok(texto.includes('docs/agents/sessoes-paralelas.md'));
  assert.ok(texto.includes('`tools/ah modelo <nível>`'));
  assert.match(texto, /Antes do primeiro arquivo do projeto .* abra a frente/);
  assert.match(texto, /só o humano chama/);
  assert.ok(texto.split('\n').length <= 160, `metodo.md com ${texto.split('\n').length} linhas`);
});

test('o trecho do AGENTS.md aponta para o metodo.md, pede a trilha e continua curto', () => {
  const t = ler(TRECHO);
  assert.ok(t.includes('`docs/agents/metodo.md`'));
  assert.match(t, /escolha a trilha antes de começar/i);
  assert.ok(t.split('\n').length <= 30, `trecho com ${t.split('\n').length} linhas`);
});

test('trechoDe devolve o trecho entre as marcas do método, ou null', () => {
  const trecho = `${MARCA_INICIO}\ncorpo\n${MARCA_FIM}`;
  assert.equal(trechoDe(`# Projeto\n\n${trecho}\n\nfim\n`), trecho);
  assert.equal(trechoDe('# Projeto sem marcas\n'), null);
  assert.equal(trechoDe(`${MARCA_INICIO}\nsem fim\n`), null);
  assert.equal(trechoDe(null), null);
});

// Arquivos comuns de uma pasta, em qualquer nível, sem .git: caminhos relativos com '/'.
function arquivosDe(dir, rel = '') {
  return fs.readdirSync(path.join(dir, rel), { withFileTypes: true }).flatMap(e => {
    const filho = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) return e.name === '.git' ? [] : arquivosDe(dir, filho);
    return e.isFile() ? [filho] : [];
  });
}

test('toda skill citada por uma skill instalada está instalada ou na tabela "No lugar"', t => {
  const { colecoes } = lerColecoes(path.join(EXT, 'colecoes.json'));
  const ok = new Set([...skillsConhecidas(colecoes), ...skillsNoLugar(ler(TRECHO))]);
  const foraDaLista = [];
  for (const [nome, c] of Object.entries(colecoes)) {
    if (nome === 'agent-harness') continue;
    const dir = path.join(dirDoCache(process.env), nome);
    const cabeca = fs.existsSync(dir) ? spawnSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim() : '';
    if (cabeca !== c.commit) {
      t.skip(`sem a coleção ${nome} no commit fixado em ${dir}; rode tools/ah metodo instalar num projeto descartável`);
      return;
    }
    // Nome solto entre crases ou depois de barra só conta quando é skill da própria coleção ("implement" aparece em prosa).
    const daColecao = new Set(arquivosDe(dir).filter(a => a.endsWith('/SKILL.md')).map(a => a.split('/').at(-2)));
    for (const pasta of Object.values(c.skills)) {
      for (const arquivo of arquivosDe(path.join(dir, pasta))) {
        const texto = fs.readFileSync(path.join(dir, pasta, arquivo), 'utf8');
        if (texto.includes('\0')) continue;
        const citadas = new Set([...texto.matchAll(/(?:superpowers|mattpocock-skills):([a-z0-9-]+)/g)].map(m => m[1]));
        for (const re of [/`\/?([a-z0-9-]+)`/g, /(?:^|\s)\/([a-z0-9-]+)\b/gm]) {
          for (const m of texto.matchAll(re)) if (daColecao.has(m[1])) citadas.add(m[1]);
        }
        for (const s of citadas) if (!ok.has(s)) foraDaLista.push(`${s} em ${nome}/${pasta}/${arquivo}`);
      }
    }
  }
  assert.deepEqual(foraDaLista, [], 'acrescente a linha na tabela "No lugar" do agents-metodo.md ou a skill em colecoes.json');
});

// ---------------------------------------------------------------- guia "Como começar" (docs/guia/comecar.md)
const GUIA = 'docs/guia/comecar.md';
const TITULOS_DO_GUIA = [
  '# Como começar',
  '## 1. Instalar',
  '## 2. A primeira sessão',
  '## 3. Um exemplo por trilha',
  '### Um commit: o frete arredondado errado',
  '### Plano de partida: cupom de desconto',
  '### Spec e plano: pagamento parcelado',
  '### Investigação longa: vender também num marketplace',
  '## 4. Ligar as extensões opcionais',
  '## 5. Quando algo falha',
];

test('o guia tem as seções na ordem e aponta em vez de repetir', () => {
  const g = ler(GUIA);
  assert.deepEqual(titulosDe(g), TITULOS_DO_GUIA);
  const instalar = secao(g, '## 1. Instalar');
  assert.ok(instalar.includes('Instalar num projeto (instruções para o agente)'));
  assert.ok(!instalar.includes('metodo instalar'), 'o procedimento de instalação é do README');
  assert.ok(g.includes('docs/agents/metodo.md'));
  assert.ok(g.includes('`tools/ah doctor`'));
  for (const titulo of TITULOS_DO_GUIA.slice(4, 8)) {
    const s = secao(g, titulo);
    assert.ok(s.includes('`tools/ah open'), `${titulo} sem tools/ah open`);
    assert.ok(s.includes('`tools/ah close`'), `${titulo} sem tools/ah close`);
  }
  // A frente abre antes do primeiro arquivo (decisão do ensaio da fatia 2); a linha de partida não usa --plano.
  assert.ok(!g.includes('--plano'), 'o guia não usa --plano: o plano escrito na frente não está na base');
});

test('toda skill citada no guia existe em colecoes.json ou na tabela "No lugar"', () => {
  const ok = permitidas();
  assert.deepEqual(skillsCitadas(ler(GUIA)).filter(s => !ok.has(s)), [], `${GUIA} ${AVISO_DA_CONVENCAO}`);
});

test('o README aponta para o guia logo no começo', () => {
  const readme = ler('README.md');
  const i = readme.indexOf('docs/guia/comecar.md');
  assert.ok(i >= 0 && i < readme.indexOf('\n## '), 'a linha do guia vem antes da primeira seção do README');
});

// ---------------------------------------------------------------- quem aponta para o metodo.md (revisão final, C3 e I7)
test('o que aponta para uma seção do metodo.md aponta para uma seção que existe', () => {
  const titulos = titulosDe(ler(METODO)).map(t => t.replace(/^#+\s*/, '').toLowerCase());
  const achados = [];
  const andar = rel => {
    for (const e of fs.readdirSync(path.join(RAIZ, rel), { withFileTypes: true })) {
      const filho = `${rel}/${e.name}`;
      if (e.isDirectory()) andar(filho);
      else if (/\.(mjs|md)$/.test(e.name) && filho !== METODO) {
        for (const m of ler(filho).matchAll(/docs\/agents\/metodo\.md \(([^)]+)\)/g)) achados.push([filho, m[1]]);
      }
    }
  };
  andar('nucleo');
  assert.ok(achados.length > 0, 'esperava ao menos a linha de critérios do ah modelo');
  for (const [arquivo, s] of achados) assert.ok(titulos.includes(s.toLowerCase()), `${arquivo} aponta para a seção "${s}", que o metodo.md não tem`);
  // O texto para quem executa (skill orquestrar) manda escolher a trilha pelo metodo.md.
  assert.match(ler('nucleo/extensoes/metodo/skills/orquestrar/executor.md'), /docs\/agents\/metodo\.md, escolha a trilha/);
  assert.ok(titulos.includes('escolha a trilha'));
});

test('o trecho do AGENTS.md lembra o registros guardar antes de a skill apagar o diário', () => {
  assert.match(ler(TRECHO), /`tools\/ah registros guardar`.*antes de a skill de execução apagar o diário/);
});

test('o metodo.md e o guia dizem como ligar uma extensão depois da instalação', () => {
  for (const s of [secao(ler(METODO), '## Extensões opcionais'), secao(ler(GUIA), '## 4. Ligar as extensões opcionais')]) {
    assert.match(s, /`\.harness\/config\.json`.*`tools\/ah metodo instalar`.*commit.*`tools\/ah doctor`/s);
  }
});
