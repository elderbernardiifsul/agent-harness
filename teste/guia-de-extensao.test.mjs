// O guia docs/extensoes/como-estender.md funciona como está escrito: os arquivos completos dele, gravados num
// projeto descartável, carregam, aparecem no doctor e na ajuda, e os testes deles passam.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { projetoDeTeste } from '../nucleo/lib/extensoes-teste.mjs';

const GUIA = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'extensoes', 'como-estender.md');

// Os blocos de código precedidos de "Arquivo completo: `<caminho>`": {caminho: conteúdo}.
function arquivosCompletos(texto) {
  const arquivos = {};
  for (const m of texto.matchAll(/^Arquivo completo: `([^`]+)`\n\n```[a-z]*\n([\s\S]*?)\n```$/gm)) arquivos[m[1]] = `${m[2]}\n`;
  return arquivos;
}

test('o guia de extensão funciona como está escrito', t => {
  const arquivos = arquivosCompletos(fs.readFileSync(GUIA, 'utf8'));
  assert.deepEqual(Object.keys(arquivos).sort(), ['.harness/extensoes/revisao/extensao.mjs', '.harness/extensoes/revisao/extensao.test.mjs']);
  const p = projetoDeTeste({ extensoes: { revisao: true } });
  t.after(() => p.limpar());
  for (const [rel, conteudo] of Object.entries(arquivos)) {
    fs.mkdirSync(path.dirname(path.join(p.raiz, rel)), { recursive: true });
    fs.writeFileSync(path.join(p.raiz, rel), conteudo);
  }
  assert.match(p.ah(['doctor']).saida, /^ok {6}Extensão revisao \(projeto\)$/m);
  assert.match(p.ah(['--help']).saida, /^Comandos de extensões:\n {2}revisao +mostra, pede ou dá por feita a revisão da frente \(extensão revisao\)$/m);
  // Sem NODE_TEST_CONTEXT: o node --test de dentro fala com o terminal, não com este executor.
  const env = { ...p.env };
  delete env.NODE_TEST_CONTEXT;
  const r = spawnSync(process.execPath, ['--test', '.harness/extensoes/'], { cwd: p.raiz, env, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^ℹ tests 3$/m);
  assert.match(r.stdout, /^ℹ pass 3$/m);
});
