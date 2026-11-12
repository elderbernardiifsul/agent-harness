import fs from 'node:fs';
import path from 'node:path';
import { lerJson, gravarJson, validarNomeSeguro } from './estado.mjs';

export const siglaValida = s => typeof s === 'string' && /^[a-z]{2,4}$/.test(s);
export const nomeValido = n => typeof n === 'string' && /^[a-z0-9][a-z0-9-]{1,48}$/.test(n);

// Só a proposta: quem confirma a sigla é a pessoa, no init.
export function siglaDeLogin(login) {
  const partes = String(login).toLowerCase().split(/[^a-z]+/).filter(Boolean);
  if (partes.length === 0) return '';
  if (partes.length === 1) return partes[0].slice(0, 2);
  return partes.slice(0, 4).map(p => p[0]).join('');
}

export function idsNoHistorico(texto, sigla) {
  const re = new RegExp(`(?<![a-z0-9-])${sigla}-(\\d+)(?![0-9])`, 'g');
  return [...String(texto).matchAll(re)].map(m => Number(m[1]));
}

export function proximoId({ sigla, historico, frentes }) {
  const dasFrentes = (frentes ?? []).flatMap(f => idsNoHistorico(f.id, sigla));
  const maior = Math.max(0, ...idsNoHistorico(historico ?? '', sigla), ...dasFrentes);
  return `${sigla}-${maior + 1}`;
}

// Deslocamento do fuso (ex.: "-03:00") no instante dado; "+00:00" para UTC.
function deslocamento(fuso, data) {
  const partes = new Intl.DateTimeFormat('en-US', { timeZone: fuso, timeZoneName: 'longOffset' }).formatToParts(data);
  const nome = partes.find(p => p.type === 'timeZoneName')?.value ?? 'GMT';
  const m = nome.match(/^GMT(?:([+-])(\d{2}):(\d{2}))?$/);
  if (!m) throw new Error(`Fuso sem deslocamento reconhecível: ${fuso}. Corrija "fuso" na configuração.`);
  return m[1] ? `${m[1]}${m[2]}:${m[3]}` : '+00:00';
}

// Data e hora locais ("AAAA-MM-DDTHH:MM:SS") de um instante, dado o deslocamento "+HH:MM".
function localComDeslocamento(data, desloc) {
  const sinal = desloc[0] === '-' ? -1 : 1;
  const min = sinal * (Number(desloc.slice(1, 3)) * 60 + Number(desloc.slice(4, 6)));
  return new Date(data.getTime() + min * 60000).toISOString().slice(0, 19);
}

export function novaFrente({ id, nome, config, dirWorktrees, tickets, plano, caminhos, dona, login, agora }) {
  const desloc = deslocamento(config.fuso, agora);
  return {
    esquema: 1,
    id,
    nome,
    ramo: config.git.prefixo + nome,
    worktree: path.join(dirWorktrees, nome),
    tickets: [...(tickets ?? [])],
    plano: plano ?? null,
    caminhos: [...(caminhos ?? [])],
    dona: dona ?? null,
    abertaPor: login,
    abertaEm: localComDeslocamento(agora, desloc) + desloc,
    estado: 'ativa',
    notas: [],
  };
}

export function linhaDoHistorico(frente, resumo, agora) {
  const desloc = /([+-]\d{2}:\d{2})$/.exec(frente.abertaEm ?? '')?.[1] ?? '+00:00';
  const dia = localComDeslocamento(agora, desloc).slice(0, 10);
  const tickets = frente.tickets?.length ? frente.tickets.map(n => `#${n}`).join(', ') : '—';
  return `- ${dia} · ${frente.id} · ${frente.nome} · @${frente.abertaPor} · ${tickets} · ${resumo}`;
}

const arquivoDaFrente = (dirEstado, nome) => path.join(dirEstado, 'frentes', `${validarNomeSeguro(nome, 'Nome da frente')}.json`);

export function lerFrente(dirEstado, nome) {
  return lerJson(arquivoDaFrente(dirEstado, nome), null);
}

export function gravarFrente(dirEstado, frente) {
  gravarJson(arquivoDaFrente(dirEstado, frente.nome), frente);
}

export function removerFrente(dirEstado, nome) {
  fs.rmSync(arquivoDaFrente(dirEstado, nome), { force: true });
}

// Todas as frentes em disco, da mais antiga para a mais nova.
export function listarFrentes(dirEstado) {
  let nomes;
  try {
    nomes = fs.readdirSync(path.join(dirEstado, 'frentes'));
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
  return nomes
    .filter(n => n.endsWith('.json') && !n.startsWith('.'))
    .map(n => lerFrente(dirEstado, n.slice(0, -5)))
    .filter(Boolean)
    .sort((a, b) => String(a.abertaEm).localeCompare(String(b.abertaEm)) || String(a.nome).localeCompare(String(b.nome)));
}
