import fs from 'node:fs';
import path from 'node:path';
import { ErroDeEstado, lerJson, gravarJson, validarNomeSeguro } from './estado.mjs';
import { conferirEsquema, ESQUEMA_DO_ESTADO } from './sessao.mjs';

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
    esquema: ESQUEMA_DO_ESTADO,
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
    reserva: null,
  };
}

export function linhaDoHistorico(frente, resumo, agora) {
  const desloc = /([+-]\d{2}:\d{2})$/.exec(frente.abertaEm ?? '')?.[1] ?? '+00:00';
  const dia = localComDeslocamento(agora, desloc).slice(0, 10);
  const tickets = frente.tickets?.length ? frente.tickets.map(n => `#${n}`).join(', ') : '—';
  return `- ${dia} · ${frente.id} · ${frente.nome} · @${frente.abertaPor} · ${tickets} · ${resumo}`;
}

const arquivoDaFrente = (dirEstado, nome) => path.join(dirEstado, 'frentes', `${validarNomeSeguro(nome, 'Nome da frente')}.json`);

// Esquema 2: `estado` é 'ativa', 'passada' ou 'abrindo' (open em andamento: registro sem worktree ainda); `reserva` é {logins, tickets} ou null; opcionais
// `passadaEm`, `passadaPor`, `passadaDe`, `sessoesAnteriores`, `retomadaEm`, `tomadaEm`, `tomadaDe`, `atribuidaPor`, `reconstruida`.
export function migrarFrente(obj, arquivo = null) {
  if (conferirEsquema(obj, 'A frente', arquivo) === ESQUEMA_DO_ESTADO) return obj;
  return { ...obj, esquema: ESQUEMA_DO_ESTADO, reserva: obj.reserva ?? null };
}

export function lerFrente(dirEstado, nome) {
  const arquivo = arquivoDaFrente(dirEstado, nome);
  const obj = lerJson(arquivo, null);
  return obj === null ? null : migrarFrente(obj, arquivo);
}

export function gravarFrente(dirEstado, frente) {
  gravarJson(arquivoDaFrente(dirEstado, frente.nome), frente);
}

export function removerFrente(dirEstado, nome) {
  fs.rmSync(arquivoDaFrente(dirEstado, nome), { force: true });
}

function nomesDasFrentes(dirEstado) {
  try {
    return fs.readdirSync(path.join(dirEstado, 'frentes')).filter(n => n.endsWith('.json') && !n.startsWith('.')).map(n => n.slice(0, -5));
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    const pasta = path.join(dirEstado, 'frentes');
    throw new ErroDeEstado(`Não consegui ler a pasta ${pasta} (${e.code ?? e.message})`, pasta, `confira as permissões da pasta ${pasta}`);
  }
}

const porAbertura = (a, b) => String(a.abertaEm).localeCompare(String(b.abertaEm)) || String(a.nome).localeCompare(String(b.nome));

// Todas as frentes em disco, da mais antiga para a mais nova. Um arquivo ilegível lança.
export function listarFrentes(dirEstado) {
  return nomesDasFrentes(dirEstado).map(n => lerFrente(dirEstado, n)).filter(Boolean).sort(porAbertura);
}

// Como listarFrentes, mas o arquivo que não se lê vai por nome em `ilegiveis` em vez de lançar.
export function listarFrentesTolerante(dirEstado) {
  const frentes = [];
  const ilegiveis = [];
  for (const nome of nomesDasFrentes(dirEstado)) {
    try {
      const f = lerFrente(dirEstado, nome);
      if (f) frentes.push(f);
    } catch (e) {
      if (e.name !== 'ErroDeEstado') throw e;
      ilegiveis.push(nome);
    }
  }
  return { frentes: frentes.sort(porAbertura), ilegiveis };
}

// Frentes ativas de que a sessão é dona. `comAbrindo` conta também as que ela está abrindo (estado
// `abrindo`, o registro do open entre a reserva e o worktree): é o que vale para a regra do executor.
export function frentesDa(frentes, sessaoId, { comAbrindo = false } = {}) {
  return frentes.filter(f => (f.estado === 'ativa' || (comAbrindo && f.estado === 'abrindo')) && f.dona === sessaoId);
}
