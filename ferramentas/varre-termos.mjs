#!/usr/bin/env node
// Varre os arquivos versionados e o histórico atrás de termos proibidos.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const LISTA_PADRAO = join(homedir(), '.config', 'agent-harness', 'termos-proibidos.txt');
const GRANDE = 256 * 1024 * 1024;

export class FalhaDoGit extends Error {
  constructor(motivo, proximo) {
    super(motivo);
    this.name = 'FalhaDoGit';
    this.motivo = motivo;
    this.proximo = proximo;
  }
}

function git(raiz, args) {
  try {
    return execFileSync('git', args, { cwd: raiz, encoding: 'utf8', maxBuffer: GRANDE, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    const detalhe = String(e.stderr ?? '').trim().split(/\r?\n/)[0] || e.code || e.message;
    throw new FalhaDoGit(
      `o git falhou em "git ${args.join(' ')}" (${detalhe})`,
      'confira que o git está no PATH e que a raiz é um repositório íntegro, e rode de novo',
    );
  }
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
  // Sem nenhum ref não há histórico (git log falharia); qualquer falha do git propaga.
  const temRefs = git(raiz, ['for-each-ref', '--count=1', 'refs/']).trim() !== '';
  const log = temRefs ? git(raiz, ['log', '-p', '--all']) : '';
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
  let achados;
  try {
    achados = varrer({ raiz, termos: lerLista(lista) });
  } catch (e) {
    if (!(e instanceof FalhaDoGit)) throw e;
    console.error(`Recusado: ${e.motivo}`);
    console.error(`Faça: ${e.proximo}`);
    return 2;
  }
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
