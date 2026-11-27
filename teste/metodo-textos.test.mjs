// Textos da instalação pelo agente: a seção do README (o único lugar do procedimento) e a skill preparar-projeto,
// que aponta para ela sem repetir os passos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import metodo from '../nucleo/extensoes/metodo/extensao.mjs';
import { CAMINHOS_DO_METODO } from '../nucleo/extensoes/metodo/sincronizar.mjs';
import { uso as usoDoInit } from '../nucleo/comandos/init.mjs';

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

const passo = (secao, n) => secao.slice(secao.indexOf(`\n${n}. `), secao.indexOf(`\n${n + 1}. `) < 0 ? undefined : secao.indexOf(`\n${n + 1}. `));

test('o passo 3 acha a tag mais nova sem sufixo, confere o commit, reaproveita a cache só limpa e pede a confirmação', () => {
  const passo3 = passo(secaoDoReadme().secao, 3);
  assert.match(passo3, /git ls-remote --tags --sort=-v:refname/);
  assert.match(passo3, /-rc1/);
  assert.match(passo3, /use a `main`/);
  assert.match(passo3, /rev-parse HEAD/);
  assert.match(passo3, /status --porcelain/);
  assert.match(passo3, /\$\{XDG_CACHE_HOME:-\$HOME\/\.cache\}\/agent-harness\/<versão>/);
  assert.match(passo3, /main-<.*rev-parse/s);
  assert.match(passo3, /confirm/i);
});

test('os passos 1 e 2: gh repo create só com o gh autenticado; identidade do git antes do primeiro commit', () => {
  const { secao } = secaoDoReadme();
  assert.match(passo(secao, 1), /gh repo create[^.]*gh auth status|gh auth status[^.]*gh repo create|autenticado/);
  assert.match(passo(secao, 2), /git config user\.name/);
  assert.match(passo(secao, 2), /user\.email/);
});

test('o passo 4 usa uma opção que o init tem', () => {
  assert.match(passo(secaoDoReadme().secao, 4), /--sigla/);
  assert.ok(usoDoInit.includes('--sigla'), 'o uso do init tem --sigla');
});

test('o passo 5: o JSON é válido e o metodo passa na validação da extensão; avisa das coleções de terceiros e do agente sem suporte', () => {
  const passo5 = passo(secaoDoReadme().secao, 5);
  const bloco = passo5.match(/```json\n\s*(.*?)\n\s*```/s);
  assert.ok(bloco, 'o passo 5 tem um bloco JSON');
  const json = JSON.parse(`{${bloco[1]}}`);
  assert.equal(metodo.validarConfig(json.extensoes.metodo), null);
  assert.equal(json.extensoes.registros, true);
  assert.equal(json.extensoes.modelo, true);
  assert.match(passo5, /terceiros/);
  assert.match(passo5, /docs\/agentes\//);
});

test('todo arquivo que o passo 5 manda editar entra no commit que o metodo instalar indica', () => {
  const passo5 = passo(secaoDoReadme().secao, 5);
  const editados = [...passo5.matchAll(/Em `([^`]+)`/g)].map(m => m[1]);
  assert.ok(editados.length > 0);
  for (const arquivo of editados) assert.ok(CAMINHOS_DO_METODO.includes(arquivo), `${arquivo} não entra no commit do metodo instalar`);
});

test('a atualização é por uma cache nova (sem git pull no clone raso), e a tag não é assunto do agente', () => {
  const { readme, secao } = secaoDoReadme();
  const iniciar = readme.slice(readme.indexOf('\n## Iniciar um projeto com o harness'), readme.indexOf('\n## Laboratório'));
  assert.doesNotMatch(iniciar, /git pull/);
  assert.match(iniciar, /tools\/ah atualizar --de <nova cache>/);
  assert.doesNotMatch(secao, /tag de versão/);
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
