#!/usr/bin/env node
// Varre os arquivos versionados e o histórico atrás de termos proibidos.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const LISTA_PADRAO = join(homedir(), '.config', 'agent-harness', 'termos-proibidos.txt');
const GRANDE = 256 * 1024 * 1024;

function git(raiz, args) {
  return execFileSync('git', args, { cwd: raiz, encoding: 'utf8', maxBuffer: GRANDE, stdio: ['ignore', 'pipe', 'pipe'] });
}

function achar(texto, termos, onde, achados) {
  const linhas = texto.split(/\r?\n/);
  linhas.forEach((conteudo, i) => {
    const minusculo = conteudo.toLowerCase();
    for (const termo of termos) {
      if (minusculo.includes(termo.toLowerCase())) achados.push({ onde, linha: i + 1, termo });
    }
  });
}

export function varrer({ raiz, termos }) {
  const achados = [];
  if (!termos.length) return achados;
  const arquivos = git(raiz, ['ls-files', '-z']).split('\0').filter(Boolean);
  for (const arquivo of arquivos) {
    const caminho = join(raiz, arquivo);
    if (!existsSync(caminho)) continue;
    const bruto = readFileSync(caminho);
    if (bruto.includes(0)) continue;
    achar(bruto.toString('utf8'), termos, arquivo, achados);
  }
  let log = '';
  try {
    log = git(raiz, ['log', '-p', '--all']);
  } catch {
    log = '';
  }
  // Um termo já achado num arquivo atual não é repetido pelo histórico.
  const noHistorico = [];
  achar(log, termos, 'historico', noHistorico);
  const emArquivo = new Set(achados.map((a) => a.termo));
  const vistos = new Set();
  for (const a of noHistorico) {
    if (emArquivo.has(a.termo) || vistos.has(a.termo)) continue;
    vistos.add(a.termo);
    achados.push(a);
  }
  return achados;
}

export function lerLista(arquivo) {
  return readFileSync(arquivo, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}

function principal(argv) {
  const i = argv.indexOf('--lista');
  const lista = i >= 0 ? argv[i + 1] : LISTA_PADRAO;
  if (!lista || !existsSync(lista)) {
    console.error(`A lista de termos não existe: ${lista ?? '(não informada)'}.`);
    console.error('Próximo passo: crie o arquivo (um termo por linha) ou passe --lista <arquivo>.');
    return 2;
  }
  const raiz = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const achados = varrer({ raiz, termos: lerLista(lista) });
  if (!achados.length) {
    console.log('Nenhum termo proibido encontrado.');
    return 0;
  }
  for (const a of achados) console.error(`${a.onde}:${a.linha}`);
  console.error(`${achados.length} achado(s). Próximo passo: remova os trechos (o termo não é repetido aqui) e rode de novo.`);
  return 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = principal(process.argv.slice(2));
}
