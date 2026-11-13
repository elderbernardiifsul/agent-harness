import path from 'node:path';
import { ErroDeUso } from '../lib/caminhos.mjs';
import { listarFrentesTolerante } from '../lib/frente.mjs';
import { arquivosDaFrenteOuNulo, contaNaSobreposicao, sobreposicoes as calcularSobreposicoes } from '../lib/sobreposicao.mjs';
import { idCurto, listarSessoes } from '../lib/sessao.mjs';
import { aberturaParada, vidaDaDona } from '../lib/vida.mjs';

export const descricao = 'mostra as frentes abertas e as sessões vivas';
export const uso = 'ah board [--json]';
export const requisitos = { config: true, sessao: false };

const LIMITE_PLANO = 30;
const LIMITE_NOTA = 40;
const LIMITE_SOBREPOSICOES = 20;
// Um git que trava numa frente não pode prender o quadro.
const TEMPO_DO_GIT_POR_CHAMADA_MS = 5000;
// Prazo total do cálculo de sobreposição; estourado, o quadro sai com `?` nas frentes não conferidas.
// `amb.prazoDaSobreposicaoMs` troca o valor (testes).
const PRAZO_DA_SOBREPOSICAO_MS = 3000;

// Uma linha só: quebras e controles viram espaço; texto longo é cortado com reticências.
function linhaUnica(texto, limite) {
  const t = String(texto ?? '').replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, ' ').replace(/\s+/g, ' ').trim();
  return t.length > limite ? `${t.slice(0, limite - 1)}…` : t;
}

// Ativa sem dona viva (dona morta, ilegível ou nenhuma) é órfã: alguém pode tomá-la.
// Em abertura com o processo do open morto (ou, sem processo no registro, sem dona viva) é um open que parou
// no meio: outro `ah open <nome>` o toma.
function estadoNoQuadro(f, donaViva) {
  if (f.estado === 'ativa' && !donaViva) return 'órfã';
  if (f.estado === 'abrindo') return aberturaParada(f, donaViva) ? 'abrindo (parada)' : 'abrindo';
  return f.estado ?? '—';
}

export async function executar(args, amb) {
  let json = false;
  for (const arg of args) {
    if (arg === '--json') json = true;
    else if (arg.startsWith('--')) throw new ErroDeUso(`Opção desconhecida: ${arg.slice(0, 40)}\nPróximo passo: use ${uso}`);
    else throw new ErroDeUso(`Argumento a mais: ${arg.slice(0, 40)}\nPróximo passo: use ${uso}`);
  }
  const dirEstado = amb.dirEstado;
  // Arquivo de frente que não se lê não derruba o quadro: vira aviso e as outras frentes seguem.
  const { frentes, ilegiveis } = listarFrentesTolerante(dirEstado);
  for (const nome of ilegiveis) {
    amb.avisar(`Aviso: arquivo de frente ilegível: ${path.join(dirEstado, 'frentes', `${nome}.json`)} (rode ah doctor)\n`);
  }
  // Estado de vida por sessão: 'viva', 'morta' (qualquer outro estado) ou 'ilegivel' (arquivo que não se lê).
  const vidas = new Map();
  const vida = id => {
    if (!vidas.has(id)) {
      const v = vidaDaDona(dirEstado, id, { config: amb.config }).estado;
      vidas.set(id, v === 'viva' || v === 'ilegivel' ? v : 'morta');
    }
    return vidas.get(id);
  };
  const donaViva = f => Boolean(f.dona) && vida(f.dona) === 'viva';
  const donaIlegivel = f => Boolean(f.dona) && vida(f.dona) === 'ilegivel';
  const lidas = listarSessoes(dirEstado);
  const sessoes = lidas.sessoes.filter(s => vida(s.id) === 'viva')
    .map(s => ({ id: s.id, curto: idCurto(s.id), papel: s.papel, frente: s.frente ? (s.frente.nome ?? s.frente) : null }));
  const sessoesIlegiveis = lidas.ilegiveis;
  // Arquivos de cada frente (ramo desde a base e worktree); falha numa frente conta como lista vazia.
  // Passado o prazo total, as frentes que faltam ficam sem conferir (`?`).
  const prazoMs = amb.prazoDaSobreposicaoMs ?? PRAZO_DA_SOBREPOSICAO_MS;
  const prazo = Date.now() + Math.max(0, prazoMs);
  const porFrente = new Map();
  const naoConferidas = new Set();
  for (const f of frentes) {
    let arquivos = [];
    if (contaNaSobreposicao(f)) {
      if (Date.now() >= prazo) {
        naoConferidas.add(f.id);
        continue;
      }
      let r;
      try {
        r = arquivosDaFrenteOuNulo(f, { raiz: amb.raiz, base: amb.config.git.base, env: amb.env, prazo, tempoPorChamadaMs: TEMPO_DO_GIT_POR_CHAMADA_MS });
      } catch {
        r = [];
      }
      if (r === null && Date.now() >= prazo) {
        naoConferidas.add(f.id);
        continue;
      }
      arquivos = r ?? [];
    }
    porFrente.set(f.id, [...(porFrente.get(f.id) ?? []), ...arquivos]);
  }
  const sobreposicaoIncompleta = naoConferidas.size > 0;
  if (sobreposicaoIncompleta) {
    amb.avisar(`Aviso: a sobreposição ficou incompleta: o git passou de ${Math.round(prazoMs / 100) / 10} s; ${naoConferidas.size} frente(s) com ? não foram conferidas.\n`);
  }
  const sobreposicoes = calcularSobreposicoes(porFrente);
  const sobrepoe = f => [...new Set(sobreposicoes.filter(s => s.frentes.includes(f.id)).flatMap(s => s.frentes))].filter(id => id !== f.id).sort();
  const conferida = f => !naoConferidas.has(f.id);
  if (json) {
    const lista = frentes.map(f => ({
      ...f, donaViva: donaViva(f), donaIlegivel: donaIlegivel(f), sobrepoe: sobrepoe(f), sobreposicaoConferida: conferida(f),
      ...(f.estado === 'abrindo' ? { aberturaParada: aberturaParada(f, donaViva(f)) } : {}),
    }));
    amb.escrever(`${JSON.stringify({ frentes: lista, sessoes, sessoesIlegiveis, sobreposicoes, sobreposicaoIncompleta })}\n`);
    return 0;
  }
  const linhaDasSessoes = () => {
    const lista = sessoes.map(s => `${s.curto} (${linhaUnica(s.papel, 20)}, ${s.frente ? linhaUnica(s.frente, 49) : '—'})`);
    amb.escrever(`Sessões vivas: ${lista.length ? lista.join('; ') : 'nenhuma'}\n`);
    if (sessoesIlegiveis.length) {
      amb.escrever(`Sessões ilegíveis: ${sessoesIlegiveis.map(id => linhaUnica(idCurto(id), 8)).join('; ')} (rode ah doctor)\n`);
    }
  };
  const rotuloDaDona = f => {
    if (!f.dona) return '—';
    const v = vida(f.dona);
    return `${linhaUnica(idCurto(f.dona), 8)}${v === 'viva' ? '' : v === 'ilegivel' ? ' (ilegível)' : ' (morta)'}`;
  };
  if (frentes.length === 0) {
    amb.escrever('Nenhuma frente aberta.\n');
    linhaDasSessoes();
    return 0;
  }
  const linhas = [['ID', 'NOME', 'DONA', 'ESTADO', 'TICKETS', 'SOBREPÕE', 'PLANO', 'ÚLTIMA NOTA']];
  for (const f of frentes) {
    const ultima = (f.notas ?? []).at(-1)?.texto;
    linhas.push([
      linhaUnica(f.id, 20),
      linhaUnica(f.nome, 49),
      rotuloDaDona(f),
      linhaUnica(estadoNoQuadro(f, donaViva(f)), 20),
      f.tickets?.length ? f.tickets.map(n => `#${n}`).join(',') : '—',
      !conferida(f) ? '?' : (ids => (ids.length ? linhaUnica(ids.join(','), 40) : '—'))(sobrepoe(f)),
      f.plano ? linhaUnica(f.plano, LIMITE_PLANO) : '—',
      ultima ? linhaUnica(ultima, LIMITE_NOTA) : '—',
    ]);
  }
  const larguras = linhas[0].map((_, i) => Math.max(...linhas.map(l => [...l[i]].length)));
  for (const l of linhas) {
    amb.escrever(`${l.map((c, i) => (i === l.length - 1 ? c : c + ' '.repeat(larguras[i] - [...c].length))).join('  ')}\n`);
  }
  if (sobreposicoes.length) {
    const mostradas = sobreposicoes.slice(0, LIMITE_SOBREPOSICOES)
      .map(s => `  ${linhaUnica(s.arquivo, 200)}: ${s.frentes.map(id => linhaUnica(id, 20)).join(', ')}`);
    if (sobreposicoes.length > LIMITE_SOBREPOSICOES) mostradas.push(`  … e mais ${sobreposicoes.length - LIMITE_SOBREPOSICOES}`);
    amb.escrever(`Sobreposições:\n${mostradas.join('\n')}\n`);
  }
  linhaDasSessoes();
  return 0;
}
