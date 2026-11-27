// Skill orquestrar: a estrutura que o agente precisa achar (frontmatter, os sete passos, o texto de quem executa) e
// nenhum comando citado que não exista. O conteúdo é conferido no ensaio, não aqui.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PASTA = path.join(RAIZ, 'nucleo', 'extensoes', 'metodo', 'skills', 'orquestrar');
const ler = nome => fs.readFileSync(path.join(PASTA, nome), 'utf8');
// Comandos de extensões que ainda não estão neste ramo (vêm de outra frente na integração).
const DE_OUTRAS_FRENTES = new Set(['registros']);

async function comandosConhecidos() {
  const doNucleo = fs.readdirSync(path.join(RAIZ, 'nucleo', 'comandos')).filter(a => a.endsWith('.mjs')).map(a => a.slice(0, -4));
  const deExtensoes = [];
  const dir = path.join(RAIZ, 'nucleo', 'extensoes');
  for (const nome of fs.readdirSync(dir)) {
    const arquivo = path.join(dir, nome, 'extensao.mjs');
    if (!fs.existsSync(arquivo)) continue;
    const def = (await import(pathToFileURL(arquivo).href)).default;
    deExtensoes.push(...Object.keys(def.comandos ?? {}));
  }
  return new Set([...doNucleo, ...deExtensoes, ...DE_OUTRAS_FRENTES]);
}

test('SKILL.md tem o frontmatter, os sete passos e aponta o texto de quem executa', () => {
  const skill = ler('SKILL.md');
  assert.match(skill, /^---\nname: orquestrar\ndescription: \S.{20,}\n---\n/);
  for (let n = 1; n <= 7; n++) assert.match(skill, new RegExp(`^## ${n}\\. \\S`, 'm'), `falta o passo ${n}`);
  assert.match(skill, /executor\.md/);
  assert.ok(fs.existsSync(path.join(PASTA, 'executor.md')));
  assert.match(skill, /^## Como fazer em cada agente$/m);
});

test('todo tools/ah citado na skill e no texto de quem executa existe', async () => {
  const conhecidos = await comandosConhecidos();
  for (const nome of ['SKILL.md', 'executor.md']) {
    const citados = [...ler(nome).matchAll(/tools\/ah ([a-z][a-z0-9-]*)/g)].map(m => m[1]);
    assert.ok(citados.length > 0, `${nome} não cita comando nenhum`);
    for (const c of citados) assert.ok(conhecidos.has(c), `${nome} cita tools/ah ${c}, que não existe`);
  }
});

test('executor.md tem os campos que o orquestrador preenche', () => {
  const texto = ler('executor.md');
  for (const campo of ['<frente>', '<worktree>', '<tickets ou plano>']) assert.ok(texto.includes(campo), `falta ${campo}`);
});

test('o texto cobre o que a revisão achou: sessão entrega com handoff, subagente fica no worktree, ponte do --para, retomada', () => {
  const skill = ler('SKILL.md');
  const executor = ler('executor.md');
  assert.match(executor, /cd <worktree> &&/, 'o subagente começa cada comando no worktree');
  assert.match(executor, /tools\/ah handoff <frente> --nota "entregue/, 'a sessão passa a frente ao entregar');
  assert.match(skill, /frente de outra sessão[^\n]*só depois do handoff/i, 'o fechamento espera o handoff da sessão');
  assert.match(skill, /tools\/ah whoami/, 'a ponte entre a sessão listada e o id do --para');
  assert.match(skill, /passada ou órfã/, 'a retomada de uma orquestração parada');
  assert.match(skill, /não descarte/i, 'checkout principal sujo não se limpa por conta própria');
});

test('o fechamento envia a base antes de fechar a frente e o ticket', () => {
  const skill = ler('SKILL.md');
  const passo6 = skill.slice(skill.indexOf('## 6.'), skill.indexOf('## 7.'));
  const push = passo6.indexOf('git push origin <base>:<base>');
  assert.ok(push > 0, 'o passo 6 envia a base');
  assert.ok(push < passo6.indexOf('tools/ah close <nome>'), 'o envio vem antes do close');
  assert.match(passo6, /commit do merge, que já está no remoto/);
  assert.doesNotMatch(skill, /isso é publicar/, 'enviar a base não é publicar');
});
