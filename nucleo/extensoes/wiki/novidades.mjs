// Fontes novas desde a última ingestão, tiradas do git, sem guardar estado.
//
// Dor: a wiki que ninguém lembra de alimentar envelhece calada. A "última ingestão" é o último commit que acrescentou
// ao log da wiki uma entrada de ingestão (`## [AAAA-MM-DD] ingestão | …`, ver formato.md); fonte nova é a que mudou
// entre esse commit e a ponta. Assim, a frente que ingeriu o que trouxe não recebe lembrete, e nada precisa ser
// gravado para saber. Só a ingestão conta: conferência, consulta arquivada e mover também escrevem no log, e um
// commit deles não pode calar o lembrete de uma fonte que ninguém ingeriu.

import path from 'node:path';
import { CONFERIVEIS, ehFonte } from './fontes.mjs';

// O diff do commit tem uma linha de entrada de ingestão (acrescentada ou tirada; o log só acrescenta).
const ENTRADA_DE_INGESTAO = '^## \\[.*\\] ingestão';

// `git(args)` devolve {codigo, saida}. Devolve null quando nenhum commit até `ref` acrescentou uma ingestão ao log
// (ingestão ainda não registrada no git) e lança quando o git falha, para quem chama decidir o que dizer.
export function fontesNovas(git, ref, cfg) {
  const ultimo = git(['log', '-1', '--format=%H', `-G${ENTRADA_DE_INGESTAO}`, ref, '--', `${cfg.pasta}/log.md`]);
  if (ultimo.codigo !== 0) throw new Error(`git log: código ${ultimo.codigo}`);
  const commit = ultimo.saida.trim();
  if (!commit) return null;
  const d = git(['-c', 'core.quotePath=false', 'diff', '--name-only', commit, ref]);
  if (d.codigo !== 0) throw new Error(`git diff: código ${d.codigo}`);
  return d.saida.split('\n').filter(rel => rel && ehFonte(rel, cfg) && CONFERIVEIS.has(path.extname(rel).toLowerCase())).sort();
}

// Até três caminhos; o resto vira reticências.
export const listaCurta = caminhos => caminhos.slice(0, 3).join(', ') + (caminhos.length > 3 ? ', …' : '');
