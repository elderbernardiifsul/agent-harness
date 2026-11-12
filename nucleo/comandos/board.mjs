import { ErroDeUso } from '../lib/caminhos.mjs';
import { listarFrentes } from '../lib/frente.mjs';
import { idCurto } from '../lib/sessao.mjs';

export const descricao = 'mostra as frentes abertas';
export const requisitos = { config: true, sessao: false };

const USO = 'use ah board [--json]';
const LIMITE_PLANO = 30;
const LIMITE_NOTA = 40;

// Uma linha só: quebras e controles viram espaço; texto longo é cortado com reticências.
function linhaUnica(texto, limite) {
  const t = String(texto ?? '').replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, ' ').replace(/\s+/g, ' ').trim();
  return t.length > limite ? `${t.slice(0, limite - 1)}…` : t;
}

export async function executar(args, amb) {
  let json = false;
  for (const arg of args) {
    if (arg === '--json') json = true;
    else if (arg.startsWith('--')) throw new ErroDeUso(`Opção desconhecida: ${arg.slice(0, 40)}\nPróximo passo: ${USO}`);
    else throw new ErroDeUso(`Argumento a mais: ${arg.slice(0, 40)}\nPróximo passo: ${USO}`);
  }
  const frentes = listarFrentes(amb.dirEstado);
  if (json) {
    amb.escrever(`${JSON.stringify({ frentes })}\n`);
    return 0;
  }
  if (frentes.length === 0) {
    amb.escrever('Nenhuma frente aberta.\n');
    return 0;
  }
  const linhas = [['ID', 'NOME', 'DONA', 'ESTADO', 'TICKETS', 'PLANO', 'ÚLTIMA NOTA']];
  for (const f of frentes) {
    const ultima = (f.notas ?? []).at(-1)?.texto;
    linhas.push([
      linhaUnica(f.id, 20),
      linhaUnica(f.nome, 49),
      f.dona ? idCurto(f.dona) : '—',
      linhaUnica(f.estado ?? '—', 20),
      f.tickets?.length ? f.tickets.map(n => `#${n}`).join(',') : '—',
      f.plano ? linhaUnica(f.plano, LIMITE_PLANO) : '—',
      ultima ? linhaUnica(ultima, LIMITE_NOTA) : '—',
    ]);
  }
  const larguras = linhas[0].map((_, i) => Math.max(...linhas.map(l => [...l[i]].length)));
  for (const l of linhas) {
    amb.escrever(`${l.map((c, i) => (i === l.length - 1 ? c : c + ' '.repeat(larguras[i] - [...c].length))).join('  ')}\n`);
  }
  return 0;
}
