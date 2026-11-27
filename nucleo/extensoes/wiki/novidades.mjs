// Fontes novas desde a última ingestão, tiradas do git, sem guardar estado.
//
// Dor: a wiki que ninguém lembra de alimentar envelhece calada. A "última ingestão" é o último commit que tocou o
// log da wiki (toda ingestão acrescenta uma entrada nele); fonte nova é a que mudou entre esse commit e a ponta.
// Assim, a frente que ingeriu o que trouxe não recebe lembrete, e nada precisa ser gravado para saber.

import path from 'node:path';
import { CONFERIVEIS, ehFonte } from './fontes.mjs';

// `git(args)` devolve {codigo, saida}. Devolve null quando nenhum commit até `ref` tocou o log (ingestão ainda não
// registrada no git) e lança quando o git falha, para quem chama decidir o que dizer.
export function fontesNovas(git, ref, cfg) {
  const ultimo = git(['log', '-1', '--format=%H', ref, '--', `${cfg.pasta}/log.md`]);
  if (ultimo.codigo !== 0) throw new Error(`git log: código ${ultimo.codigo}`);
  const commit = ultimo.saida.trim();
  if (!commit) return null;
  const d = git(['-c', 'core.quotePath=false', 'diff', '--name-only', commit, ref]);
  if (d.codigo !== 0) throw new Error(`git diff: código ${d.codigo}`);
  return d.saida.split('\n').filter(rel => rel && ehFonte(rel, cfg) && CONFERIVEIS.has(path.extname(rel).toLowerCase())).sort();
}

// Até três caminhos; o resto vira reticências.
export const listaCurta = caminhos => caminhos.slice(0, 3).join(', ') + (caminhos.length > 3 ? ', …' : '');
