// Textos da instalação pelo agente: a seção do README (o único lugar do procedimento) e a skill preparar-projeto,
// que aponta para ela sem repetir os passos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TITULO = 'Instalar num projeto (instruções para o agente)';
const ler = rel => fs.readFileSync(path.join(RAIZ, rel), 'utf8');

// O texto da seção do README, do título até a próxima seção de mesmo nível.
function secaoDoReadme() {
  const readme = ler('README.md');
  const inicio = readme.indexOf(`\n## ${TITULO}\n`);
  assert.ok(inicio > 0, `o README não tem a seção "${TITULO}"`);
  const fim = readme.indexOf('\n## ', inicio + 4);
  return { readme, inicio, secao: readme.slice(inicio, fim < 0 ? undefined : fim) };
}

test('o README tem a seção para o agente logo depois do primeiro parágrafo, com os passos na ordem', () => {
  const { readme, inicio, secao } = secaoDoReadme();
  assert.equal(readme.indexOf('\n## '), inicio, 'é a primeira seção do README');
  assert.match(secao, /https:\/\/github\.com\/elderbernardiifsul\/agent-harness/);
  let ultimo = -1;
  for (const marco of ['git init', 'node --version', 'git clone --depth 1', 'nucleo/bin/ah.mjs init', '"metodo"', 'tools/ah metodo instalar', 'tools/ah doctor', 'Faça']) {
    const i = secao.indexOf(marco, ultimo + 1);
    assert.ok(i > ultimo, `"${marco}" falta ou está fora de ordem`);
    ultimo = i;
  }
  for (let n = 1; n <= 7; n++) assert.match(secao, new RegExp(`^${n}\\. \\*\\*`, 'm'), `falta o passo ${n}`);
});

test('o passo 3 diz como conferir o commit e pede a confirmação do aluno antes de executar', () => {
  const { secao } = secaoDoReadme();
  const passo3 = secao.slice(secao.indexOf('\n3. '), secao.indexOf('\n4. '));
  assert.match(passo3, /git ls-remote/);
  assert.match(passo3, /main/);
  assert.match(passo3, /rev-parse HEAD/);
  assert.match(passo3, /confirm/i);
  assert.match(passo3, /\$HOME|<cache>/);
});

test('o passo 5 liga metodo (com agentes), registros e modelo', () => {
  const { secao } = secaoDoReadme();
  const passo5 = secao.slice(secao.indexOf('\n5. '), secao.indexOf('\n6. '));
  for (const k of ['"metodo"', '"agentes"', '"registros"', '"modelo"']) assert.ok(passo5.includes(k), `o passo 5 não liga ${k}`);
});

test('nenhum caminho pessoal no README nem na skill', () => {
  for (const texto of [ler('README.md'), ler('nucleo/extensoes/metodo/skills/preparar-projeto/SKILL.md')]) {
    assert.doesNotMatch(texto, /\/home\/|\/Users\/|C:\\\\Users/);
  }
});

test('a skill preparar-projeto aponta para a seção do README e não repete os passos', () => {
  const skill = ler('nucleo/extensoes/metodo/skills/preparar-projeto/SKILL.md');
  assert.match(skill, /^---\nname: preparar-projeto\ndescription: [^\n]*prepare meu projeto[^\n]*\n---\n/);
  assert.ok(skill.includes(TITULO));
  assert.doesNotMatch(skill, /metodo instalar/);
  assert.doesNotMatch(skill, /provisório/i);
  assert.match(skill, /tools\/ah doctor/);
});

test('o AGENTS.md da raiz aponta o procedimento para agentes no README', () => {
  assert.ok(ler('AGENTS.md').includes(TITULO));
});
