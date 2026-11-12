// gh de mentira para os testes: grava cada chamada e responde conforme um arquivo JSON.
import { appendFileSync, readFileSync } from 'node:fs';

const argv = process.argv.slice(2);
let entrada = '';
try {
  entrada = readFileSync(0, 'utf8');
} catch {
  entrada = '';
}
if (process.env.GH_FALSO_LOG) appendFileSync(process.env.GH_FALSO_LOG, `${JSON.stringify({ argv, entrada })}\n`);

function responder(codigo, saida, erro = '') {
  if (saida) process.stdout.write(saida);
  if (erro) process.stderr.write(erro);
  process.exit(codigo);
}

if (process.env.GH_FALSO_FORA === '1') responder(1, '', 'sem rede\n');

let lista = [];
if (process.env.GH_FALSO_RESPOSTAS) {
  try {
    lista = JSON.parse(readFileSync(process.env.GH_FALSO_RESPOSTAS, 'utf8'));
  } catch {
    lista = [];
  }
}
const casa = lista.find(r => r.prefixo.every((p, i) => argv[i] === p));
if (casa) responder(casa.codigo ?? 0, casa.saida ?? '');
if (argv[0] === 'api' && argv[1] === 'user') responder(0, '{"login":"ana-souza"}\n');
if (argv[0] === 'repo' && argv[1] === 'view') responder(0, 'exemplo/loja\n');
responder(0, '');
