// Exemplos de entrada do Claude Code para os testes de contrato (teste/contrato-do-adaptador.mjs).
// Os JSON são os do ensaio (docs/referencia/ensaio-claude-code.md), anonimizados; aqui só se troca
// a pasta gravada (`/tmp/loja`) pela pasta do teste e, nos derivados, um campo.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));

function ler(nome, cwd, troca = {}) {
  return { ...JSON.parse(fs.readFileSync(path.join(DIR, nome), 'utf8')), cwd, ...troca };
}

export function exemplos(cwd) {
  const preBash = comando => ler('pre-bash.json', cwd, { tool_input: { command: comando, description: 'exemplo' } });
  return {
    inicio: { novo: ler('inicio.json', cwd), continuacao: ler('inicio-compact.json', cwd) },
    sinal: [ler('prompt.json', cwd), ler('stop.json', cwd)],
    antes: {
      recusado: { entrada: ler('pre-bash.json', cwd), comando: 'git push origin main' },
      permitido: { entrada: preBash('git status'), comando: 'git status' },
      edicao: { entrada: ler('pre-write.json', cwd, { tool_input: { file_path: path.join(cwd, 'nota.txt'), content: 'oi' } }), arquivo: path.join(cwd, 'nota.txt') },
    },
    fim: { encerra: ler('fim.json', cwd), continua: ler('fim.json', cwd, { reason: 'clear' }) },
    invalidas: [
      { entrada: ler('pre-bash.json', cwd, { session_id: '../x' }), tipo: 'antes' },
      { entrada: ler('pre-bash.json', cwd, { tool_name: 'FerramentaQueNaoExiste' }), tipo: 'antes' },
    ],
  };
}
