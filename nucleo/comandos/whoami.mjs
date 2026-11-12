import { registrarSessao, lerSessao, idCurto, VARIAVEL_SESSAO_CLAUDE } from '../lib/sessao.mjs';

export const descricao = 'mostra quem sou eu: a sessão, o papel e a frente';
export const requisitos = { config: true, sessao: true };

export async function executar(args, amb) {
  let sessao = lerSessao(amb.dirEstado, amb.sessaoId);
  if (!sessao) {
    const doAgente = !amb.env.AH_SESSAO && amb.env[VARIAVEL_SESSAO_CLAUDE];
    sessao = registrarSessao(amb.dirEstado, { id: amb.sessaoId, agente: doAgente ? 'claude' : 'desconhecido', pid: process.pid });
  }
  if (args.includes('--json')) {
    amb.escrever(`${JSON.stringify({ sessao: sessao.id, papel: sessao.papel, frente: sessao.frente })}\n`);
    return 0;
  }
  const frente = sessao.frente ? `${sessao.frente.id ?? sessao.frente} ${sessao.frente.nome ?? ''}`.trim() : 'nenhuma';
  amb.escrever(`Sessão ${idCurto(sessao.id)} (${sessao.papel}) · frente: ${frente}\n`);
  return 0;
}
