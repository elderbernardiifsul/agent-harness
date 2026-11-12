import { comTrava } from '../lib/estado.mjs';
import { lerFrente } from '../lib/frente.mjs';
import { registrarSessao, lerSessao, tocarSinal, idCurto, VARIAVEL_SESSAO_CLAUDE } from '../lib/sessao.mjs';
import { pidDeComando, inicioDoProcesso } from '../lib/vida.mjs';

export const descricao = 'mostra quem sou eu: a sessão, o papel e a frente';
export const uso = 'ah whoami [--json]';
export const requisitos = { config: true, sessao: true };

export async function executar(args, amb) {
  // O `ah` morre logo: só grava pid quando o agente declara o dele em AH_PID_AGENTE.
  const pid = pidDeComando(amb.env);
  const pidInicio = pid === null ? null : inicioDoProcesso(pid);
  const precisaGravar = s => !s || s.fim || (pid !== null && (s.pid !== pid || s.pidInicio !== pidInicio));
  let sessao = lerSessao(amb.dirEstado, amb.sessaoId);
  if (precisaGravar(sessao)) {
    // Sob a trava das frentes: o open grava `frente` na sessão sob a mesma trava, e esta regravação não pode desfazê-lo.
    sessao = await comTrava(amb.dirEstado, 'frentes', async () => {
      const atual = lerSessao(amb.dirEstado, amb.sessaoId);
      if (!precisaGravar(atual)) {
        tocarSinal(amb.dirEstado, amb.sessaoId);
        return atual;
      }
      const doAgente = !amb.env.AH_SESSAO && amb.env[VARIAVEL_SESSAO_CLAUDE];
      const agente = atual?.agente ?? (doAgente ? 'claude' : 'desconhecido');
      return registrarSessao(amb.dirEstado, { id: amb.sessaoId, agente, pid, pidInicio });
    });
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
