import { executarDeps, USO_DEPS } from '../lib/deps.mjs';

export const descricao = 'mostra os bloqueios entre tickets e o que está livre para começar';
export const uso = USO_DEPS;
export const requisitos = { config: true, sessao: false };

export const executar = (args, amb) => executarDeps(args, amb);
