import { ErroDeUso } from '../lib/caminhos.mjs';
import { listarFrentes } from '../lib/frente.mjs';
import { idCurto, listarSessoes } from '../lib/sessao.mjs';
import { vidaDaSessao } from '../lib/vida.mjs';

export const descricao = 'mostra as frentes abertas e as sessões vivas';
export const uso = 'ah board [--json]';
export const requisitos = { config: true, sessao: false };

const LIMITE_PLANO = 30;
const LIMITE_NOTA = 40;

// Uma linha só: quebras e controles viram espaço; texto longo é cortado com reticências.
function linhaUnica(texto, limite) {
  const t = String(texto ?? '').replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, ' ').replace(/\s+/g, ' ').trim();
  return t.length > limite ? `${t.slice(0, limite - 1)}…` : t;
}

// Ativa com dona que não está viva é órfã (alguém pode tomá-la); sem dona, mostra o estado gravado.
function estadoNoQuadro(f, donaViva) {
  if (f.estado === 'ativa' && f.dona && !donaViva) return 'órfã';
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
  const frentes = listarFrentes(dirEstado);
  const vidas = new Map();
  const viva = id => {
    if (!vidas.has(id)) vidas.set(id, vidaDaSessao(dirEstado, id, { config: amb.config }).estado === 'viva');
    return vidas.get(id);
  };
  const donaViva = f => Boolean(f.dona) && viva(f.dona);
  const sessoes = listarSessoes(dirEstado).sessoes.filter(s => viva(s.id))
    .map(s => ({ id: s.id, curto: idCurto(s.id), papel: s.papel, frente: s.frente ? (s.frente.nome ?? s.frente) : null }));
  if (json) {
    amb.escrever(`${JSON.stringify({ frentes: frentes.map(f => ({ ...f, donaViva: donaViva(f) })), sessoes })}\n`);
    return 0;
  }
  const linhaDasSessoes = () => {
    const lista = sessoes.map(s => `${s.curto} (${linhaUnica(s.papel, 20)}, ${s.frente ? linhaUnica(s.frente, 49) : '—'})`);
    amb.escrever(`Sessões vivas: ${lista.length ? lista.join('; ') : 'nenhuma'}\n`);
  };
  if (frentes.length === 0) {
    amb.escrever('Nenhuma frente aberta.\n');
    linhaDasSessoes();
    return 0;
  }
  const linhas = [['ID', 'NOME', 'DONA', 'ESTADO', 'TICKETS', 'PLANO', 'ÚLTIMA NOTA']];
  for (const f of frentes) {
    const ultima = (f.notas ?? []).at(-1)?.texto;
    linhas.push([
      linhaUnica(f.id, 20),
      linhaUnica(f.nome, 49),
      f.dona ? `${linhaUnica(idCurto(f.dona), 8)}${donaViva(f) ? '' : ' (morta)'}` : '—',
      linhaUnica(estadoNoQuadro(f, donaViva(f)), 20),
      f.tickets?.length ? f.tickets.map(n => `#${n}`).join(',') : '—',
      f.plano ? linhaUnica(f.plano, LIMITE_PLANO) : '—',
      ultima ? linhaUnica(ultima, LIMITE_NOTA) : '—',
    ]);
  }
  const larguras = linhas[0].map((_, i) => Math.max(...linhas.map(l => [...l[i]].length)));
  for (const l of linhas) {
    amb.escrever(`${l.map((c, i) => (i === l.length - 1 ? c : c + ' '.repeat(larguras[i] - [...c].length))).join('  ')}\n`);
  }
  linhaDasSessoes();
  return 0;
}
