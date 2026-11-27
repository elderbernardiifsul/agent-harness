// O que a wiki pode citar como fonte, pela seção `wiki` da configuração.
//
// Dor: no projeto em que este método foi praticado, a lista de fontes estava escrita na skill e no script de
// conferência, e as duas divergiam. Aqui ela mora só em `extensoes.wiki` do `.harness/config.json`, e este módulo
// é o único que a interpreta: o `ah wiki fontes` mostra o resultado, e as skills mandam rodá-lo.

import fs from 'node:fs';
import path from 'node:path';

export const PADRAO = Object.freeze({
  pasta: 'docs/wiki',
  fontes: Object.freeze(['CONTEXT.md', 'GLOSSARY.md', 'docs/**']),
  foraDasFontes: Object.freeze(['docs/agents/**']),
});

// Arquivos de texto, que dá para conferir literalmente. A cobertura conta só os .md.
export const CONFERIVEIS = new Set(['.md', '.txt', '.srt', '.vtt', '.json', '.csv', '.yaml', '.yml']);

const CAMPOS = ['pasta', 'fontes', 'foraDasFontes'];
const textoNaoVazio = v => typeof v === 'string' && v.trim() !== '';
const listaDePadroes = v => Array.isArray(v) && v.length > 0 && v.every(textoNaoVazio);
const relativoDentro = v => textoNaoVazio(v) && !path.isAbsolute(v) && !v.split('/').includes('..');

export function validarConfig(config) {
  for (const k of Object.keys(config)) if (!CAMPOS.includes(k)) return `campo desconhecido: ${k} (valem pasta, fontes e foraDasFontes)`;
  if ('pasta' in config && !relativoDentro(config.pasta)) return 'pasta deve ser um caminho relativo não vazio, dentro do projeto, como "docs/wiki"';
  for (const k of ['fontes', 'foraDasFontes']) {
    if (k in config && !listaDePadroes(config[k])) return `${k} deve ser uma lista não vazia de padrões, como ["docs/**"]`;
  }
  return null;
}

export const configDaWiki = config => ({ ...PADRAO, ...config });

// Padrão relativo à raiz, com "/": ** casa qualquer sequência (inclusive "/"), * casa qualquer sequência sem "/".
export function casa(rel, padrao) {
  const re = padrao.split('**').map(parte => parte.split('*').map(t => t.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')).join('.*');
  return new RegExp(`^${re}$`).test(rel);
}

const dentroDe = (rel, pasta) => rel === pasta || rel.startsWith(`${pasta.replace(/\/+$/, '')}/`);

// A pasta da própria wiki nunca é fonte, esteja ou não em foraDasFontes.
export function ehFonte(rel, cfg) {
  if (dentroDe(rel, cfg.pasta)) return false;
  return cfg.fontes.some(p => casa(rel, p)) && !cfg.foraDasFontes.some(p => casa(rel, p));
}

// Os arquivos que são fonte, relativos à raiz e ordenados. Não entra em .git nem segue link simbólico.
export function listarFontes(raiz, cfg) {
  const achados = [];
  const andar = rel => {
    for (const e of fs.readdirSync(path.join(raiz, rel), { withFileTypes: true })) {
      const filho = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory() && e.name !== '.git') andar(filho);
      else if (e.isFile() && ehFonte(filho, cfg)) achados.push(filho);
    }
  };
  andar('');
  return achados.sort();
}
