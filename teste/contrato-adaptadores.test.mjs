// Roda os testes de contrato (contrato-do-adaptador.mjs) para todo adaptador do registro.
// Só um adaptador: AH_ADAPTADOR=<nome> node --test teste/contrato-adaptadores.test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ADAPTADORES } from '../nucleo/adaptadores/registro.mjs';
import { testarAdaptador } from './contrato-do-adaptador.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const so = process.env.AH_ADAPTADOR || null;

if (so && !Object.hasOwn(ADAPTADORES, so)) {
  const { test } = await import('node:test');
  test(`adaptador ${so} registrado`, () => {
    throw new Error(`o adaptador ${so} não está no registro: acrescente-o em ADAPTADORES, em nucleo/adaptadores/registro.mjs (registrados: ${Object.keys(ADAPTADORES).join(', ')})`);
  });
}

for (const [nome, adaptador] of Object.entries(ADAPTADORES)) {
  if (so && nome !== so) continue;
  const arquivo = path.join(DIR, 'eventos-gravados', nome, 'exemplos.mjs');
  const exemplos = fs.existsSync(arquivo) ? (await import(pathToFileURL(arquivo).href)).exemplos : null;
  testarAdaptador(nome, adaptador, exemplos);
}
