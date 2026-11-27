#!/usr/bin/env node
// Verificação local antes de publicar. O repositório não tem CI: o que a CI faria roda aqui.
// Roda a suíte inteira com cada Node pedido (por padrão, só o que executa este script) e depois
// a varredura de termos. Sai com 0 se tudo passou, 1 se algo falhou e 2 se não deu para verificar.
//
//   node ferramentas/verifica.mjs [--node <executável>]...
//
// Para conferir também a versão mínima do package.json (Node 22), com o mise:
//   node ferramentas/verifica.mjs --node "$(mise where node@22)/bin/node" --node "$(command -v node)"
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const MINIMO = Number(/\d+/.exec(JSON.parse(readFileSync(join(RAIZ, 'package.json'), 'utf8')).engines.node)[0]);
const USO = 'uso: node ferramentas/verifica.mjs [--node <executável>]...';
const GRANDE = 256 * 1024 * 1024;

// Tira da saída do `node --test` os números do fim e os nomes dos testes que falharam.
export function resumoDaSuite(saida) {
  const numero = nome => {
    const m = new RegExp(`^ℹ ${nome} (\\d+)$`, 'm').exec(saida);
    return m ? Number(m[1]) : null;
  };
  const depois = saida.split(/^✖ failing tests:$/m)[1] ?? '';
  const falhas = [...depois.matchAll(/^✖ (.+?) \([\d.]+ms\)$/gm)].map(m => m[1]);
  return { testes: numero('tests'), passaram: numero('pass'), falharam: numero('fail'), pulados: numero('skipped'), falhas };
}

function recusar(motivo, faca) {
  process.stderr.write(`${motivo}\nFaça: ${faca}\n`);
  process.exit(2);
}

function lerArgs(args) {
  const nodes = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--node' && args[i + 1]) nodes.push(args[++i]);
    else recusar(`opção desconhecida: ${args[i]}`, USO);
  }
  return nodes.length ? nodes : [process.execPath];
}

// A versão de cada Node é conferida antes de rodar qualquer suíte.
function versaoDe(node) {
  const r = spawnSync(node, ['--version'], { encoding: 'utf8' });
  const versao = r.status === 0 ? String(r.stdout).trim() : '';
  if (!/^v\d+\./.test(versao)) recusar(`não consegui rodar ${node} --version (${r.error?.code ?? `código ${r.status}`})`, 'passe em --node o caminho de um executável do Node');
  if (Number(versao.slice(1).split('.')[0]) < MINIMO) recusar(`${node}: ${versao} é mais antigo que o mínimo (${MINIMO}) do package.json`, `passe um Node ${MINIMO} ou mais novo (com o mise: mise where node@${MINIMO})`);
  return versao;
}

function rodarSuite(node, versao) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const r = spawnSync(node, ['--test', '--test-reporter=spec', 'teste/*.test.mjs'], { cwd: RAIZ, env, encoding: 'utf8', maxBuffer: GRANDE });
  const s = resumoDaSuite(`${r.stdout}\n${r.stderr}`);
  const passou = r.status === 0 && s.falharam === 0;
  if (s.testes == null) console.log(`FALHOU  suíte no Node ${versao}: não terminou (código ${r.status})\n${String(r.stderr).trim().split('\n').slice(-5).join('\n')}`);
  else console.log(`${passou ? 'ok    ' : 'FALHOU'}  suíte no Node ${versao}: ${s.testes} testes, ${s.passaram} passaram, ${s.falharam} falharam, ${s.pulados} pulados`);
  for (const f of s.falhas) console.log(`          ✖ ${f}`);
  return passou;
}

function rodarVarredura() {
  const r = spawnSync(process.execPath, [join(RAIZ, 'ferramentas', 'varre-termos.mjs')], { cwd: RAIZ, encoding: 'utf8', maxBuffer: GRANDE });
  if (r.status === 2) recusar(`a varredura de termos não rodou: ${String(r.stderr).trim().split('\n')[0]}`, 'confira a lista de termos em ~/.config/agent-harness/ (fora do repositório) ou peça ao autor');
  console.log(`${r.status === 0 ? 'ok    ' : 'FALHOU'}  varredura de termos${r.status === 0 ? '' : `\n${String(r.stdout).trim()}`}`);
  return r.status === 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const nodes = lerArgs(process.argv.slice(2)).map(node => [node, versaoDe(node)]);
  const resultados = nodes.map(([node, versao]) => rodarSuite(node, versao));
  resultados.push(rodarVarredura());
  console.log(`Sistema: ${process.platform}. Windows e macOS não são verificados aqui (o repositório não tem CI).`);
  process.exit(resultados.every(Boolean) ? 0 : 1);
}
