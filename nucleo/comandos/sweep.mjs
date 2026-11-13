import { ErroDeUso } from '../lib/caminhos.mjs';
import { achados, reparar } from '../lib/varredura.mjs';

export const descricao = 'acha o que está fora do lugar no estado (frente órfã, worktree sumido, sessão morta) e repara o estado';
export const uso = 'ah sweep [--reparar] [--json]';
export const requisitos = { config: true, sessao: false };

export async function executar(args, amb) {
  let json = false;
  let consertar = false;
  for (const arg of args) {
    if (arg === '--json') json = true;
    else if (arg === '--reparar') consertar = true;
    else if (arg.startsWith('--')) throw new ErroDeUso(`Opção desconhecida: ${arg.slice(0, 40)}\nPróximo passo: use ${uso}`);
    else throw new ErroDeUso(`Argumento a mais: ${arg.slice(0, 40)}\nPróximo passo: use ${uso}`);
  }
  const reparos = consertar ? await reparar(amb) : [];
  const lista = achados(amb);
  if (json) {
    amb.escrever(`${JSON.stringify({ reparos, achados: lista })}\n`);
    return 0;
  }
  if (consertar) amb.escrever(reparos.length ? `Reparos:\n${reparos.map(l => `  ${l}\n`).join('')}` : 'Reparos: nada a fazer.\n');
  amb.escrever(lista.length ? lista.map(a => `- ${a.tipo}: ${a.detalhe}. Faça: ${a.saida}\n`).join('') : 'Nada fora do lugar.\n');
  return 0;
}
