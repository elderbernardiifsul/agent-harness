// O que é a cópia do núcleo: a lista de arquivos que o init e o atualizar põem em .harness/nucleo/,
// com o sha256 de cada um, e o manifesto que a guarda. Usado pelo init, pelo atualizar e pelo doctor.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

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
