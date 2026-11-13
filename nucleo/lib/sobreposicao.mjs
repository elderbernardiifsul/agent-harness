// Sobreposição de arquivos entre frentes: o harness avisa (nunca recusa) quando duas frentes mexem nos
// mesmos arquivos. Os arquivos de uma frente são os do ramo (desde a base) mais os não commitados no worktree.
import fs from 'node:fs';
import path from 'node:path';
import { git } from './git.mjs';

const ESPECIAIS = /[.*+?^${}()|[\]\\]/g;

// Converte o glob em expressão regular, caractere a caractere: `**` casa qualquer coisa (inclusive `/`),
// `**/` casa zero ou mais pastas, `*` e `?` não casam `/`, glob terminado em `/` casa tudo abaixo da pasta;
// o resto é literal.
function regexDoGlob(glob) {
  let r = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      if (glob[i + 2] === '/') {
        r += '(?:.*/)?';
        i += 2;
      } else {
        r += '.*';
        i += 1;
      }
    } else if (c === '*') r += '[^/]*';
    else if (c === '?') r += '[^/]';
    else r += c.replace(ESPECIAIS, '\\$&');
  }
  if (glob.endsWith('/')) r += '.*';
  return new RegExp(`^${r}$`, 'u');
}

const cacheDeRegex = new Map();

export function casaGlob(caminho, glob) {
  let re = cacheDeRegex.get(glob);
  if (!re) {
    re = regexDoGlob(glob);
    cacheDeRegex.set(glob, re);
  }
  return re.test(caminho);
}

// Os arquivos da lista que casam algum dos globs, na ordem da lista.
export function tocaOsCaminhos(arquivos, globs) {
  if (!globs?.length) return [];
  return arquivos.filter(a => globs.some(g => casaGlob(a, g)));
}

// Pasta literal do glob: a parte antes do primeiro curinga, cortada na última `/` (sem curinga, o próprio
// caminho, sem a `/` final). Vazia quando o curinga vem antes de qualquer pasta (`*.md`).
function pastaLiteral(g) {
  const i = g.search(/[*?]/);
  if (i < 0) return g.replace(/\/+$/, '');
  const antes = g.slice(0, i);
  const j = antes.lastIndexOf('/');
  return j < 0 ? '' : antes.slice(0, j);
}

// Uma pasta é a outra ou ancestral dela, comparando pasta por pasta.
const mesmaLinha = (a, b) => a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);

// Os globs de `deles` iguais a um dos `meus`, ou cuja pasta literal é a mesma, ancestral ou descendente da de
// um dos `meus`. Pasta vazia só colide com glob igual ou com outro de pasta vazia.
export function caminhosEmComum(deles, meus) {
  if (!deles?.length || !meus?.length) return [];
  return deles.filter(d => meus.some(m => {
    if (d === m) return true;
    const a = pastaLiteral(d);
    const b = pastaLiteral(m);
    if (a === '' || b === '') return a === b;
    return mesmaLinha(a, b);
  }));
}

const separar = saida => saida.split('\0').filter(Boolean);

// Caminhos de `git status --porcelain -z`: "XY caminho", e na renomeação ou cópia o nome antigo vem no item seguinte.
function caminhosDoStatus(saida) {
  const itens = saida.split('\0');
  const lista = [];
  for (let i = 0; i < itens.length; i++) {
    const item = itens[i];
    if (item.length < 4) continue;
    lista.push(item.slice(3));
    if (/[RC]/.test(item.slice(0, 2)) && itens[i + 1]) lista.push(itens[++i]);
  }
  return lista;
}

// Arquivos da frente, ou null se o git falhou ou demorou (ramo ausente e worktree sumido contam como nada).
// `prazo` (opcional) é o instante, em ms, depois do qual o git não roda mais.
// `rodarGit` (opcional, para os testes) troca o executor do git.
export function arquivosDaFrenteOuNulo(frente, { raiz, base, env, prazo = null, tempoPorChamadaMs = null, rodarGit = git }) {
  if (!frente || frente.estado === 'abrindo' || typeof frente.ramo !== 'string' || !frente.ramo) return [];
  const rodar = (args, cwd) => {
    let timeoutMs = tempoPorChamadaMs;
    if (prazo !== null) {
      const resta = prazo - Date.now();
      if (resta <= 0) return null;
      timeoutMs = timeoutMs === null ? resta : Math.min(timeoutMs, resta);
    }
    return rodarGit(args, { cwd, env, timeoutMs: timeoutMs ?? undefined });
  };
  const todos = new Set();
  const d = rodar(['diff', '--name-only', '--no-renames', '-z', `refs/heads/${base}...refs/heads/${frente.ramo}`, '--'], raiz);
  if (d === null) return null;
  if (d.codigo === 0) {
    for (const a of separar(d.saida)) todos.add(a);
  } else {
    // Ramo ausente conta como nada; outra falha (base ausente, git quebrado) é falha.
    const ramo = rodar(['show-ref', '--verify', '--quiet', `refs/heads/${frente.ramo}`], raiz);
    if (ramo === null || ramo.codigo !== 1) return null;
  }
  // Só um worktree de verdade (com o arquivo .git): uma pasta comum cairia no repositório de cima.
  if (typeof frente.worktree === 'string' && frente.worktree && fs.existsSync(path.join(frente.worktree, '.git'))) {
    // Worktree de outra sessão: sem o lock opcional do índice, para não fazer falhar um add/commit da dona.
    const s = rodar(['--no-optional-locks', 'status', '--porcelain', '-z', '--untracked-files=all'], frente.worktree);
    if (s === null || s.codigo !== 0) return null;
    for (const a of caminhosDoStatus(s.saida)) todos.add(a);
  }
  return [...todos].sort();
}

// União, sem repetição e ordenada, dos arquivos do ramo e do worktree. Qualquer falha conta como lista vazia.
export function arquivosDaFrente(frente, opcoes) {
  try {
    return arquivosDaFrenteOuNulo(frente, opcoes) ?? [];
  } catch {
    return [];
  }
}

// Arquivos de duas frentes ou mais (as chaves do mapa são IDs), ordenados por arquivo.
export function sobreposicoes(arquivosPorFrente) {
  const porArquivo = new Map();
  for (const [id, arquivos] of arquivosPorFrente) {
    for (const a of new Set(arquivos)) {
      if (!porArquivo.has(a)) porArquivo.set(a, []);
      porArquivo.get(a).push(id);
    }
  }
  return [...porArquivo]
    .filter(([, ids]) => ids.length > 1)
    .map(([arquivo, ids]) => ({ arquivo, frentes: [...ids].sort() }))
    .sort((a, b) => (a.arquivo < b.arquivo ? -1 : a.arquivo > b.arquivo ? 1 : 0));
}

// As frentes que entram na conta: as que têm ramo (ativas e passadas); `abrindo` ainda não tem.
export const contaNaSobreposicao = f => f && (f.estado === 'ativa' || f.estado === 'passada');
