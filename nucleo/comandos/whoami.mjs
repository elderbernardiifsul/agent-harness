import { lerFrente } from '../lib/frente.mjs';
import { registrarSessao, lerSessao, tocarSinal, idCurto, VARIAVEL_SESSAO_CLAUDE } from '../lib/sessao.mjs';
import { pidDeComando, inicioDoProcesso } from '../lib/vida.mjs';

export const descricao = 'mostra quem sou eu: a sessão, o papel e a frente';
export const uso = 'ah whoami [--json]';
export const requisitos = { config: true, sessao: true };

export async function executar(args, amb) {
  let sessao = lerSessao(amb.dirEstado, amb.sessaoId);
  // O `ah` morre logo: só grava pid quando o agente declara o dele em AH_PID_AGENTE.
  const pid = pidDeComando(amb.env);
  if (!sessao || pid !== null) {
    const doAgente = !amb.env.AH_SESSAO && amb.env[VARIAVEL_SESSAO_CLAUDE];
    const agente = sessao?.agente ?? (doAgente ? 'claude' : 'desconhecido');
    sessao = registrarSessao(amb.dirEstado, { id: amb.sessaoId, agente, pid, pidInicio: pid === null ? null : inicioDoProcesso(pid) });
  } else {
    tocarSinal(amb.dirEstado, amb.sessaoId);
  }
  if (args.includes('--json')) {
    amb.escrever(`${JSON.stringify({ sessao: sessao.id, papel: sessao.papel, frente: sessao.frente })}\n`);
    return 0;
  }
  let frente = 'nenhuma';
  if (sessao.frente) {
    const nome = sessao.frente.nome ?? sessao.frente;
    const dados = typeof nome === 'string' ? lerFrente(amb.dirEstado, nome) : null;
    frente = dados ? `${dados.id} ${dados.nome}` : String(nome);
  }
  amb.escrever(`Sessão ${idCurto(sessao.id)} (${sessao.papel}) · frente: ${frente}\n`);
  return 0;
}
