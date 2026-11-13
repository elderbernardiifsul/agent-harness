// O que é a cópia do núcleo: a lista de arquivos que o init e o atualizar põem em .harness/nucleo/,
// com o sha256 de cada um, e o manifesto que a guarda. Usado pelo init, pelo atualizar e pelo doctor.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const DIRS_IGNORADOS = new Set(['node_modules', 'teste', 'test', '__tests__']);
const ARQUIVO_DE_TESTE = /\.(test|spec)\.[cm]?js$/;
// Documentos do clone copiados para .harness/nucleo/docs/: o roteiro de adaptação e a referência que ele cita.
const DOCS_COPIADOS = ['agentes', 'referencia'];
// Modelos copiados para .harness/nucleo/modelos/: o trecho do AGENTS.md e o modelo dos ganchos (o doctor confere contra ele).
const MODELOS_COPIADOS = ['agents-trecho.md', 'claude-code/ganchos.json'];
export const MANIFESTO = 'MANIFEST.json';

export const sha256 = conteudo => createHash('sha256').update(conteudo).digest('hex');
const eObjeto = v => v !== null && typeof v === 'object' && !Array.isArray(v);

// Lista os arquivos de uma pasta. Links simbólicos nunca são seguidos (ficam em `ignorados`),
// e node_modules, pastas de teste e arquivos de teste não entram.
export function listarArquivosDoNucleo(dir) {
  const arquivos = [];
  const ignorados = [];
  const percorrer = (atual, rel) => {
    const entradas = fs.readdirSync(atual, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1));
    for (const e of entradas) {
      const relativo = rel ? `${rel}/${e.name}` : e.name;
      if (e.isSymbolicLink()) ignorados.push(relativo);
      else if (e.isDirectory()) { if (!DIRS_IGNORADOS.has(e.name)) percorrer(path.join(atual, e.name), relativo); }
      else if (e.isFile() && !ARQUIVO_DE_TESTE.test(e.name)) arquivos.push(relativo);
    }
  };
  percorrer(dir, '');
  return { arquivos, ignorados };
}

// A cópia que sai de um clone: [{rel, origem, sha256}] em ordem de `rel` (relativo a .harness/nucleo/),
// mais os links simbólicos do núcleo que não são copiados.
export function arquivosDaCopia(raizDoClone) {
  const lista = [];
  const dirNucleo = path.join(raizDoClone, 'nucleo');
  const { arquivos, ignorados } = listarArquivosDoNucleo(dirNucleo);
  for (const rel of arquivos) lista.push({ rel, origem: path.join(dirNucleo, ...rel.split('/')) });
  for (const pasta of DOCS_COPIADOS) {
    const dir = path.join(raizDoClone, 'docs', pasta);
    if (!fs.existsSync(dir)) continue;
    for (const rel of listarArquivosDoNucleo(dir).arquivos) lista.push({ rel: `docs/${pasta}/${rel}`, origem: path.join(dir, ...rel.split('/')) });
  }
  for (const rel of MODELOS_COPIADOS) lista.push({ rel: `modelos/${rel}`, origem: path.join(raizDoClone, 'modelos', ...rel.split('/')) });
  const unicos = new Map();
  for (const a of lista) if (a.rel !== MANIFESTO) unicos.set(a.rel, a);
  return {
    arquivos: [...unicos.values()].sort((a, b) => (a.rel < b.rel ? -1 : 1)).map(a => ({ ...a, sha256: sha256(fs.readFileSync(a.origem)) })),
    ignorados,
  };
}

// O que está instalado numa pasta .harness/nucleo/: {lista: {rel: sha256}, links: [rel]}, sem o manifesto.
// Links simbólicos não são seguidos: entram em `links`.
export function listaInstalada(dirNucleo) {
  const lista = {};
  const links = [];
  const percorrer = (atual, rel) => {
    const entradas = fs.readdirSync(atual, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1));
    for (const e of entradas) {
      const relativo = rel ? `${rel}/${e.name}` : e.name;
      if (e.isSymbolicLink()) links.push(relativo);
      else if (e.isDirectory()) percorrer(path.join(atual, e.name), relativo);
      else if (e.isFile() && relativo !== MANIFESTO) lista[relativo] = sha256(fs.readFileSync(path.join(atual, e.name)));
    }
  };
  percorrer(dirNucleo, '');
  return { lista, links };
}

// Conteúdo do manifesto (versão, commit, data e a lista {rel: sha256}).
export function montarManifesto({ versao, commit, arquivos }) {
  return { versao, commit, copiadoEm: new Date().toISOString(), arquivos: Object.fromEntries(arquivos.map(a => [a.rel, a.sha256])) };
}

// O manifesto de uma pasta .harness/nucleo/, ou null se não existe ou não se lê.
export function lerManifesto(dirNucleo) {
  try {
    const m = JSON.parse(fs.readFileSync(path.join(dirNucleo, MANIFESTO), 'utf8'));
    return eObjeto(m) ? m : null;
  } catch {
    return null;
  }
}

// A lista do manifesto, se ele tem uma válida (os manifestos de antes da fatia 5 não têm).
export function listaDoManifesto(m) {
  if (!eObjeto(m?.arquivos)) return null;
  return Object.values(m.arquivos).every(h => typeof h === 'string' && /^[0-9a-f]{64}$/.test(h)) ? m.arquivos : null;
}

// Uma pasta é clone do agent-harness quando tem o ponto de entrada do núcleo e o modelo do tools/ah.
export function eClone(raiz) {
  try {
    return fs.statSync(path.join(raiz, 'nucleo', 'bin', 'ah.mjs')).isFile() && fs.statSync(path.join(raiz, 'modelos', 'ah')).isFile();
  } catch {
    return false;
  }
}

// A versão de um clone, lida do texto de nucleo/versao.mjs (sem importar o arquivo), ou null.
export function versaoDoClone(raiz) {
  try {
    const m = /VERSAO\s*=\s*['"](\d+\.\d+\.\d+)['"]/.exec(fs.readFileSync(path.join(raiz, 'nucleo', 'versao.mjs'), 'utf8'));
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

// Compara versões "a.b.c": negativo, zero ou positivo.
export function compararVersoes(a, b) {
  const x = String(a).split('.').map(Number);
  const y = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

// Diferença entre duas listas {rel: sha256}: {novos, alterados, removidos}, cada uma em ordem.
export function diferenca(antes, depois) {
  const novos = [];
  const alterados = [];
  const removidos = [];
  for (const rel of Object.keys(depois).sort()) {
    if (!Object.hasOwn(antes, rel)) novos.push(rel);
    else if (antes[rel] !== depois[rel]) alterados.push(rel);
  }
  for (const rel of Object.keys(antes).sort()) if (!Object.hasOwn(depois, rel)) removidos.push(rel);
  return { novos, alterados, removidos };
}

// Caminho pronto para colar num comando de shell: entre aspas simples quando tem espaço, aspas ou
// caractere especial do shell.
export function citar(caminho) {
  const t = String(caminho);
  return /^[\w@%+=:,./~-]+$/.test(t) ? t : `'${t.replaceAll("'", "'\\''")}'`;
}

const gitNoClone = (raiz, args, env, opcoes = {}) => spawnSync('git', args, { cwd: raiz, env, maxBuffer: 256 * 1024 * 1024, ...opcoes });

// O clone é a raiz de um repositório git? (Uma pasta solta dentro de outro repositório não conta.)
function eRepositorio(raiz, env) {
  const r = gitNoClone(raiz, ['rev-parse', '--show-toplevel'], env, { encoding: 'utf8' });
  if (r.status !== 0) return false;
  try { return fs.realpathSync(r.stdout.trim()) === fs.realpathSync(raiz); } catch { return false; }
}

// O commit em que o clone está, ou null (clone sem git).
export function commitDoClone(raiz, env) {
  if (!eRepositorio(raiz, env)) return null;
  const r = gitNoClone(raiz, ['rev-parse', 'HEAD'], env, { encoding: 'utf8' });
  const c = r.status === 0 ? r.stdout.trim() : '';
  return /^[0-9a-f]{40}$/.test(c) ? c : null;
}

// O commit existe no clone?
export function commitNoClone(raiz, commit, env) {
  return typeof commit === 'string' && /^[0-9a-f]{40}$/.test(commit) && eRepositorio(raiz, env)
    && gitNoClone(raiz, ['cat-file', '-e', `${commit}^{commit}`], env).status === 0;
}

// `a` é ancestral estrito de `b` no clone? (Os dois têm de existir nele.)
export function ancestralEstrito(raiz, a, b, env) {
  return a !== b && commitNoClone(raiz, a, env) && commitNoClone(raiz, b, env)
    && gitNoClone(raiz, ['merge-base', '--is-ancestor', a, b], env).status === 0;
}

// A lista {rel: sha256} que o init ou o atualizar teriam copiado do clone no commit dado, com as mesmas
// regras de `arquivosDaCopia`; null quando o commit não está no clone ou o git falha.
export function listaDoCommit(raiz, commit, env) {
  if (!commitNoClone(raiz, commit, env)) return null;
  const ls = gitNoClone(raiz, ['ls-tree', '-r', '-z', commit, '--', 'nucleo', ...DOCS_COPIADOS.map(d => `docs/${d}`), ...MODELOS_COPIADOS.map(m => `modelos/${m}`)], env, { encoding: 'utf8' });
  if (ls.status !== 0) return null;
  const entradas = [];
  for (const linha of ls.stdout.split('\0').filter(Boolean)) {
    const tab = linha.indexOf('\t');
    const [modo, tipo, objeto] = linha.slice(0, tab).split(' ');
    const caminho = linha.slice(tab + 1);
    if (tipo !== 'blob' || modo === '120000') continue;
    const partes = caminho.split('/');
    if (partes.slice(0, -1).some(p => DIRS_IGNORADOS.has(p)) || ARQUIVO_DE_TESTE.test(partes.at(-1))) continue;
    const rel = caminho.startsWith('nucleo/') ? caminho.slice('nucleo/'.length) : caminho;
    if (rel !== MANIFESTO) entradas.push({ rel, objeto });
  }
  const lote = gitNoClone(raiz, ['cat-file', '--batch'], env, { input: entradas.map(e => `${e.objeto}\n`).join('') });
  if (lote.status !== 0) return null;
  const saida = lote.stdout;
  const lista = {};
  let pos = 0;
  for (const e of entradas) {
    const fim = saida.indexOf(0x0a, pos);
    const tamanho = Number(saida.subarray(pos, fim).toString('utf8').split(' ')[2]);
    if (fim < 0 || !Number.isInteger(tamanho)) return null;
    lista[e.rel] = sha256(saida.subarray(fim + 1, fim + 1 + tamanho));
    pos = fim + 1 + tamanho + 1;
  }
  return lista;
}
