// A conferência de evidência da wiki: só lê e relata, nunca altera arquivo.
//
// Três varreduras, como no original (astro-han/karpathy-llm-wiki, MIT; ver LICENSE-karpathy-llm-wiki):
// 1. Fidelidade: cada literal de alto sinal de um artigo precisa estar, como está, numa fonte ligada pelo campo
//    Fontes dele. O que falta é suspeito: valor derivado, paráfrase ou fonte que mudou depois do artigo. Julgar
//    cada suspeito é trabalho de quem lê o relatório (a skill wiki-conferir).
// 2. Erros de evidência: artigo que não dá para conferir (sem Fontes, link que não resolve, fora das fontes, fonte
//    que não é texto).
// 3. Cobertura: por pasta de fontes, quantos .md algum artigo cita; o que o log registra como "sem material" conta
//    como coberto. É lembrete de trabalho pendente, não erro.

import fs from 'node:fs';
import path from 'node:path';
import { arquivado, candidatos, contem, linksDeFontes, normalizar } from './evidencia.mjs';
import { CONFERIVEIS, ehFonte, listarFontes } from './fontes.mjs';

const ESPECIAIS = new Set(['index.md', 'log.md']);
const SEM_MATERIAL = /^## \[[^\]]*\]\s*ingest(?:ão|ao)?\s*\|\s*sem material:\s*(\S+)/i;

const relativo = (raiz, abs) => path.relative(raiz, abs).split(path.sep).join('/');
const dentroDaRaiz = r => r !== '' && !r.startsWith('../') && r !== '..' && !path.isAbsolute(r);
const decodificar = link => { try { return decodeURIComponent(link); } catch { return link; } };

export const existeWiki = (raiz, cfg) => fs.existsSync(path.join(raiz, cfg.pasta));

// É artigo: .md dentro da pasta da wiki, fora o index.md e o log.md da raiz dela.
export function ehArtigo(rel, cfg) {
  if (!rel.endsWith('.md') || !rel.startsWith(`${cfg.pasta}/`)) return false;
  return !ESPECIAIS.has(rel.slice(cfg.pasta.length + 1));
}

export function artigosDaWiki(raiz, cfg) {
  const achados = [];
  const andar = rel => {
    for (const e of fs.readdirSync(path.join(raiz, rel), { withFileTypes: true })) {
      const filho = `${rel}/${e.name}`;
      if (e.isDirectory()) andar(filho);
      else if (e.isFile() && ehArtigo(filho, cfg)) achados.push(filho);
    }
  };
  if (existeWiki(raiz, cfg)) andar(cfg.pasta);
  return achados.sort();
}

// Os links de Fontes de um artigo, resolvidos: [{link, rel}] com rel relativo à raiz (ou null, fora dela).
function fontesDoArtigo(raiz, artigo, texto) {
  return linksDeFontes(texto).map(link => {
    const r = relativo(raiz, path.resolve(raiz, path.dirname(artigo), decodificar(link)));
    return { link, rel: dentroDaRaiz(r) ? r : null };
  });
}

function conferirArtigo(raiz, artigo, cfg, lerFonte) {
  const texto = fs.readFileSync(path.join(raiz, artigo), 'utf8');
  if (arquivado(texto)) return { valores: [], erros: [] };
  const ligadas = fontesDoArtigo(raiz, artigo, texto);
  if (!ligadas.length) return { valores: [], erros: ['artigo sem campo Fontes'] };
  const erros = [];
  const fontes = [];
  for (const { link, rel } of ligadas) {
    if (rel === null || !ehFonte(rel, cfg)) erros.push(`link fora das fontes: ${link}`);
    else if (!fs.statSync(path.join(raiz, rel), { throwIfNoEntry: false })?.isFile()) erros.push(`link que não resolve: ${link}`);
    else if (!CONFERIVEIS.has(path.extname(rel).toLowerCase())) erros.push(`fonte que não é texto conferível: ${link}`);
    else fontes.push(lerFonte(rel));
  }
  const valores = [];
  if (fontes.length) {
    for (const c of candidatos(texto)) {
      const alvo = { tipo: c.tipo, valor: normalizar(c.valor) };
      if (!fontes.some(f => contem(f, alvo))) valores.push(alvo.valor);
    }
  }
  return { valores, erros };
}

// Caminhos que o log registra como ingeridos sem material (a entrada do formato.md).
function semMaterial(raiz, cfg) {
  const log = path.join(raiz, cfg.pasta, 'log.md');
  if (!fs.existsSync(log)) return [];
  const caminhos = [];
  for (const linha of fs.readFileSync(log, 'utf8').split(/\r?\n/)) {
    const m = SEM_MATERIAL.exec(linha);
    if (m) caminhos.push(m[1].replace(/[,;.]+$/, '').replace(/^`+|`+$/g, ''));
  }
  return caminhos;
}

// Grupo da cobertura: as duas primeiras partes do caminho (docs/adr), ou o próprio arquivo (CONTEXT.md).
const grupoDe = rel => { const partes = rel.split('/'); return partes.length >= 3 ? partes.slice(0, 2).join('/') : rel; };

function cobertura(raiz, cfg) {
  const citadas = new Set(semMaterial(raiz, cfg));
  for (const artigo of artigosDaWiki(raiz, cfg)) {
    for (const { rel } of fontesDoArtigo(raiz, artigo, fs.readFileSync(path.join(raiz, artigo), 'utf8'))) if (rel) citadas.add(rel);
  }
  const grupos = new Map();
  const pendentes = [];
  for (const rel of listarFontes(raiz, cfg).filter(r => r.endsWith('.md'))) {
    const g = grupos.get(grupoDe(rel)) ?? { citados: 0, total: 0 };
    g.total += 1;
    if (citadas.has(rel)) g.citados += 1; else pendentes.push(rel);
    grupos.set(grupoDe(rel), g);
  }
  return { cobertura: [...grupos].sort(([a], [b]) => (a < b ? -1 : 1)).map(([grupo, g]) => ({ grupo, ...g })), pendentes };
}

// O relatório inteiro. `artigos` (relativos à raiz) limita a fidelidade e os erros; a cobertura é sempre do todo.
export function conferir(raiz, cfg, artigos = artigosDaWiki(raiz, cfg)) {
  const lidas = new Map();
  const lerFonte = rel => {
    if (!lidas.has(rel)) lidas.set(rel, normalizar(fs.readFileSync(path.join(raiz, rel), 'utf8')));
    return lidas.get(rel);
  };
  const suspeitos = [];
  const erros = [];
  for (const artigo of artigos) {
    const r = conferirArtigo(raiz, artigo, cfg, lerFonte);
    if (r.valores.length) suspeitos.push({ artigo, valores: r.valores });
    if (r.erros.length) erros.push({ artigo, erros: r.erros });
  }
  return { suspeitos, erros, ...cobertura(raiz, cfg), artigos: artigos.length };
}

// O relatório em texto, para o agente e para quem lê no terminal.
export function relatorio(r, { pendentes = false } = {}) {
  const l = ['# Conferência de evidência', '', '## Suspeitos de fidelidade'];
  for (const s of r.suspeitos) l.push('', s.artigo, ...s.valores.map(v => `- ${v}`));
  if (!r.suspeitos.length) l.push('', '(nenhum)');
  l.push('', '## Erros de evidência');
  for (const e of r.erros) l.push('', e.artigo, ...e.erros.map(x => `- ${x}`));
  if (!r.erros.length) l.push('(nenhum)');
  l.push('', '## Cobertura das fontes', '', '| Fonte | Citados | Total |', '|---|---|---|');
  for (const c of r.cobertura) l.push(`| ${c.grupo} | ${c.citados} | ${c.total} |`);
  if (pendentes) {
    l.push('', '## Fontes ainda não citadas', ...r.pendentes.map(p => `- ${p}`));
    if (!r.pendentes.length) l.push('(nenhuma)');
  }
  const { suspeitos: nSuspeitos, erros: nErros } = contagem(r);
  const citados = r.cobertura.reduce((n, c) => n + c.citados, 0);
  const total = r.cobertura.reduce((n, c) => n + c.total, 0);
  l.push('', '## Resumo', `${nSuspeitos} suspeito(s) de fidelidade, ${nErros} erro(s) de evidência, ${citados} de ${total} arquivo(s)-fonte citados`);
  return `${l.join('\n')}\n`;
}

export const contagem = r => ({
  suspeitos: r.suspeitos.reduce((n, s) => n + s.valores.length, 0),
  erros: r.erros.reduce((n, e) => n + e.erros.length, 0),
});
