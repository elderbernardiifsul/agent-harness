// Trava das skills (.harness/skills.lock.json): de que coleção e commit veio cada skill, para quais pastas foi
// copiada e o sha256 de cada arquivo. Resolve a dor de "a skill do projeto ainda é a que foi instalada?": comparar
// o disco com a trava responde, e é o que impede a instalação de apagar uma mudança feita à mão.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { NOME, caminhoSeguro } from './colecoes.mjs';

export const ARQUIVO_TRAVA = '.harness/skills.lock.json';

const eObjeto = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const emOrdem = lista => [...lista].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
export const sha256 = conteudo => crypto.createHash('sha256').update(conteudo).digest('hex');

// Arquivos comuns dentro de `dir`, em qualquer nível, sem seguir link simbólico (nem o próprio `dir`):
// [{caminho, absoluto}], com `caminho` relativo a `dir`, separado por `/` e em ordem.
export function listarArquivos(dir) {
  const lista = [];
  const visitar = (abs, rel) => {
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      const caminho = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) visitar(path.join(abs, e.name), caminho);
      else if (e.isFile()) lista.push({ caminho, absoluto: path.join(abs, e.name) });
    }
  };
  let st = null;
  try { st = fs.lstatSync(dir); } catch { /* não existe */ }
  if (st?.isDirectory()) visitar(dir, '');
  return lista.sort((a, b) => (a.caminho < b.caminho ? -1 : 1));
}

// {caminho: sha256} dos arquivos de uma pasta de skill; pasta ausente dá {}.
export function hashesDe(dirSkill) {
  return Object.fromEntries(listarArquivos(dirSkill).map(f => [f.caminho, sha256(fs.readFileSync(f.absoluto))]));
}

// Confere a forma da trava. Os nomes e caminhos dela viram caminhos no disco (inclusive para apagar), então nada
// pode sair da pasta de destino. Devolve o motivo, ou null.
function errosDaTrava(t) {
  if (!eObjeto(t) || t.versaoDoFormato !== 1) return 'versaoDoFormato precisa ser 1';
  if (!Array.isArray(t.destinos) || !t.destinos.every(caminhoSeguro)) return 'destinos precisa ser uma lista de pastas relativas';
  if (!eObjeto(t.colecoes)) return 'colecoes precisa ser um objeto';
  for (const [nome, c] of Object.entries(t.colecoes)) {
    if (!eObjeto(c) || !Array.isArray(c.skills) || !c.skills.every(s => typeof s === 'string' && NOME.test(s))) return `colecoes.${nome}.skills precisa ser uma lista de nomes simples`;
    if (!eObjeto(c.arquivos)) return `colecoes.${nome}.arquivos precisa ser {caminho: sha256}`;
    for (const [arquivo, hash] of Object.entries(c.arquivos)) {
      if (!caminhoSeguro(arquivo) || !c.skills.includes(arquivo.split('/')[0]) || !/^[0-9a-f]{64}$/.test(hash)) return `colecoes.${nome}.arquivos tem uma entrada inválida: ${arquivo.slice(0, 60)}`;
    }
  }
  return null;
}

// {trava, erro}: sem arquivo, {trava: null, erro: null}; ilegível ou fora da forma, {trava: null, erro: motivo}.
export function lerTrava(raiz) {
  let texto;
  try {
    texto = fs.readFileSync(path.join(raiz, ...ARQUIVO_TRAVA.split('/')), 'utf8');
  } catch (e) {
    return e.code === 'ENOENT' ? { trava: null, erro: null } : { trava: null, erro: `não consegui ler (${e.code ?? e.message})` };
  }
  let trava;
  try { trava = JSON.parse(texto); } catch { return { trava: null, erro: 'não é JSON válido' }; }
  const erro = errosDaTrava(trava);
  return erro ? { trava: null, erro } : { trava, erro: null };
}

// O texto da trava, sempre na mesma ordem: a mesma instalação dá o mesmo arquivo (e nada a commitar).
export function textoDaTrava(trava) {
  const colecoes = {};
  for (const nome of emOrdem(Object.keys(trava.colecoes))) {
    const c = trava.colecoes[nome];
    colecoes[nome] = {
      origem: c.origem, commit: c.commit, versao: c.versao,
      skills: emOrdem(c.skills),
      arquivos: Object.fromEntries(emOrdem(Object.keys(c.arquivos)).map(k => [k, c.arquivos[k]])),
    };
  }
  return `${JSON.stringify({ versaoDoFormato: 1, destinos: emOrdem(trava.destinos), colecoes }, null, 2)}\n`;
}

export function gravarTrava(raiz, trava) {
  const arquivo = path.join(raiz, ...ARQUIVO_TRAVA.split('/'));
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  fs.writeFileSync(arquivo, textoDaTrava(trava));
}

// O disco contra a trava, em cada destino: `alterados` (conteúdo diferente, ou arquivo a mais na pasta da skill,
// que se perderia ao recopiá-la) e `ausentes`. `arquivo` no formato '<skill>/<caminho>'.
export function conferir(raiz, trava) {
  const alterados = [];
  const ausentes = [];
  for (const destino of trava.destinos) {
    for (const c of Object.values(trava.colecoes)) {
      for (const skill of c.skills) {
        const noDisco = hashesDe(path.join(raiz, ...destino.split('/'), skill));
        const prefixo = `${skill}/`;
        const esperados = Object.keys(c.arquivos).filter(k => k.startsWith(prefixo));
        for (const arquivo of esperados) {
          const hash = noDisco[arquivo.slice(prefixo.length)];
          if (hash === undefined) ausentes.push({ destino, arquivo });
          else if (hash !== c.arquivos[arquivo]) alterados.push({ destino, arquivo });
        }
        for (const rel of Object.keys(noDisco)) {
          if (!Object.hasOwn(c.arquivos, prefixo + rel)) alterados.push({ destino, arquivo: prefixo + rel });
        }
      }
    }
  }
  return { alterados, ausentes };
}
