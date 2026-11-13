// `ah board --numeros` (desenho, 12.5; decisões 14 e 15 da fatia 5b): o que eventos.jsonl diz sobre o uso do
// harness num período. Fica na máquina; não é telemetria.
import fs from 'node:fs';
import path from 'node:path';
import { ErroDeUso } from './caminhos.mjs';

export const USO_NUMEROS = 'ah board --numeros [--desde AAAA-MM-DD] [--ate AAAA-MM-DD] [--json]';

// Lê o registro sem cair numa linha ruim: ela conta em `ilegiveis` e o resto segue.
export function lerEventosTolerante(arquivo) {
  let texto;
  try {
    texto = fs.readFileSync(arquivo, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return { eventos: [], ilegiveis: 0 };
    throw e;
  }
  const eventos = [];
  let ilegiveis = 0;
  for (const linha of texto.split('\n')) {
    if (!linha.trim()) continue;
    try {
      const e = JSON.parse(linha);
      if (e && typeof e === 'object' && !Array.isArray(e)) eventos.push(e);
      else ilegiveis++;
    } catch {
      ilegiveis++;
    }
  }
  return { eventos, ilegiveis };
}

// Dia (AAAA-MM-DD) de um instante no fuso dado; null se a data não se lê.
function diaNoFuso(instante, fuso) {
  const ms = Date.parse(instante);
  if (!Number.isFinite(ms)) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}

const contar = (mapa, chave) => { mapa[chave] = (mapa[chave] ?? 0) + 1; };
const media = xs => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
function mediana(xs) {
  if (!xs.length) return null;
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : Math.round((o[m - 1] + o[m]) / 2);
}
const numero = v => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
const rotulo = v => (typeof v === 'string' && v.trim() ? v : '?');

// Agrega os eventos do período [desde, ate] (dias no fuso, fechado nos dois lados; null = sem limite).
// Com período, evento sem data legível fica fora; sem período, entra.
export function calcularNumeros(eventos, { desde = null, ate = null, fuso, ilegiveis = 0 }) {
  const comPeriodo = desde != null || ate != null;
  const noPeriodo = e => {
    if (!comPeriodo) return true;
    const dia = diaNoFuso(e.em, fuso);
    return dia != null && (desde == null || dia >= desde) && (ate == null || dia <= ate);
  };
  const n = {
    periodo: { desde, ate, fuso },
    frentes: { abertas: 0, fechadas: 0, fechadasSoLocal: 0, comTempo: 0, tempoMedioMs: null, tempoMedianoMs: null },
    passagens: 0,
    tomadas: 0,
    retomadas: 0,
    sessoes: { iniciadas: 0, continuacoes: 0, porModelo: {} },
    recusas: { porTrava: {}, liberacoesPorTrava: {}, deComando: {} },
    pesado: { execucoes: 0, esperaMediaMs: null, esperaMaximaMs: null, duracaoMediaMs: null },
    linhasIlegiveis: ilegiveis,
  };
  const tempos = [];
  const esperas = [];
  const duracoes = [];
  const sessoes = new Map(); // id → modelo, das sessões com início 'novo' no período
  for (const e of eventos) {
    if (!noPeriodo(e)) continue;
    switch (e.tipo) {
      case 'abertura': n.frentes.abertas++; break;
      case 'fechamento':
      case 'fechamento-local': {
        n.frentes.fechadas++;
        if (e.tipo === 'fechamento-local') n.frentes.fechadasSoLocal++;
        // A frente entra no tempo pelo fechamento no período, mesmo aberta antes dele.
        const ms = Date.parse(e.fechada ?? e.em) - Date.parse(e.aberta);
        if (Number.isFinite(ms) && ms >= 0) tempos.push(ms);
        break;
      }
      case 'passagem': n.passagens++; break;
      case 'tomada': n.tomadas++; break;
      case 'retomada': n.retomadas++; break;
      case 'sessao-inicio': {
        // O começo registra também as continuações (clear, resume, compact; `origem`), que contam à parte. Sessão
        // é o id distinto com origem 'novo' (ou sem origem, de registro antigo); o início repetido conta uma vez.
        if (e.origem != null && e.origem !== 'novo') { n.sessoes.continuacoes++; break; }
        const id = typeof e.sessao === 'string' ? e.sessao : Symbol('sem id');
        const modelo = typeof e.modelo === 'string' && e.modelo.trim() ? e.modelo : null;
        if (!sessoes.has(id) || (sessoes.get(id) == null && modelo)) sessoes.set(id, modelo);
        break;
      }
      case 'recusa': contar(n.recusas.porTrava, rotulo(e.trava)); break;
      case 'liberacao': contar(n.recusas.liberacoesPorTrava, rotulo(e.trava)); break;
      case 'recusa-de-comando': contar(n.recusas.deComando, rotulo(e.comando)); break;
      case 'pesado': {
        n.pesado.execucoes++;
        if (numero(e.esperaMs) != null) esperas.push(e.esperaMs);
        if (numero(e.duracaoMs) != null) duracoes.push(e.duracaoMs);
        break;
      }
      default: break;
    }
  }
  n.sessoes.iniciadas = sessoes.size;
  for (const modelo of sessoes.values()) contar(n.sessoes.porModelo, modelo ?? 'não informado');
  Object.assign(n.frentes, { comTempo: tempos.length, tempoMedioMs: media(tempos), tempoMedianoMs: mediana(tempos) });
  Object.assign(n.pesado, { esperaMediaMs: media(esperas), esperaMaximaMs: esperas.length ? Math.max(...esperas) : null, duracaoMediaMs: media(duracoes) });
  return n;
}

function duracao(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ''}`;
  return `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`;
}

// "a 2, b 1" pela contagem, do maior para o menor (empate: ordem alfabética).
const lista = mapa => Object.entries(mapa).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k, v]) => `${k} ${v}`).join(', ');

export function textoDosNumeros(n) {
  const { desde, ate, fuso } = n.periodo;
  const periodo = desde && ate ? `de ${desde} a ${ate}` : desde ? `de ${desde} em diante` : ate ? `até ${ate}` : 'de todo o registro';
  const f = n.frentes;
  const linhas = [
    `Números ${periodo} (fuso ${fuso})`,
    `Frentes: ${f.abertas} abertas, ${f.fechadas} fechadas${f.fechadasSoLocal ? ` (${f.fechadasSoLocal} só local)` : ''}`,
    f.comTempo
      ? `Tempo por frente fechada: médio ${duracao(f.tempoMedioMs)}, mediano ${duracao(f.tempoMedianoMs)} (${f.comTempo} frente${f.comTempo > 1 ? 's' : ''})`
      : 'Tempo por frente fechada: sem frente fechada no período',
    `Passagens de bastão: ${n.passagens}; tomadas: ${n.tomadas}; retomadas: ${n.retomadas}`,
    `Sessões iniciadas: ${n.sessoes.iniciadas}${n.sessoes.iniciadas ? ` (${lista(n.sessoes.porModelo)})` : ''}; continuações: ${n.sessoes.continuacoes}`,
    `Recusas por trava: ${lista(n.recusas.porTrava) || 'nenhuma'}`,
    `Liberações por trava: ${lista(n.recusas.liberacoesPorTrava) || 'nenhuma'}`,
    `Recusas de comando: ${lista(n.recusas.deComando) || 'nenhuma'}`,
    n.pesado.execucoes
      ? `Pesado: ${n.pesado.execucoes} execuções; espera média ${n.pesado.esperaMediaMs == null ? '?' : duracao(n.pesado.esperaMediaMs)}, máxima ${n.pesado.esperaMaximaMs == null ? '?' : duracao(n.pesado.esperaMaximaMs)}; duração média ${n.pesado.duracaoMediaMs == null ? '?' : duracao(n.pesado.duracaoMediaMs)}`
      : 'Pesado: nenhuma execução',
  ];
  // A linha ilegível não tem data: conta com qualquer período.
  if (n.linhasIlegiveis) linhas.push(`Linhas ilegíveis em eventos.jsonl: ${n.linhasIlegiveis} (fora da conta)`);
  return `${linhas.join('\n')}\n`;
}

// AAAA-MM-DD que existe no calendário.
function dataValida(texto) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const d = new Date(`${texto}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === texto;
}

// O `board` entrega aqui quando vê --numeros; os argumentos chegam inteiros.
export function executarNumeros(args, amb) {
  let json = false;
  const periodo = { desde: null, ate: null };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--numeros') continue;
    if (arg === '--json') { json = true; continue; }
    if (arg === '--desde' || arg === '--ate') {
      const valor = args[i + 1];
      if (valor == null || valor.startsWith('--')) throw new ErroDeUso(`${arg} pede uma data AAAA-MM-DD\nPróximo passo: use ${USO_NUMEROS}`);
      if (!dataValida(valor)) throw new ErroDeUso(`data inválida em ${arg}: ${valor.slice(0, 40)}\nPróximo passo: escreva a data como AAAA-MM-DD, por exemplo 2026-11-01`);
      periodo[arg.slice(2)] = valor;
      i++;
      continue;
    }
    if (arg.startsWith('--')) throw new ErroDeUso(`Opção desconhecida: ${arg.slice(0, 40)}\nPróximo passo: use ${USO_NUMEROS}`);
    throw new ErroDeUso(`Argumento a mais: ${arg.slice(0, 40)}\nPróximo passo: use ${USO_NUMEROS}`);
  }
  if (periodo.desde && periodo.ate && periodo.desde > periodo.ate) {
    throw new ErroDeUso(`período invertido: --desde ${periodo.desde} vem depois de --ate ${periodo.ate}\nPróximo passo: troque as datas de lugar`);
  }
  const { eventos, ilegiveis } = lerEventosTolerante(path.join(amb.dirEstado, 'eventos.jsonl'));
  const n = calcularNumeros(eventos, { ...periodo, fuso: amb.config.fuso, ilegiveis });
  amb.escrever(json ? `${JSON.stringify(n)}\n` : textoDosNumeros(n));
  return 0;
}
