import { ErroDeUso } from '../lib/caminhos.mjs';
import { comTrava, registrarEvento } from '../lib/estado.mjs';
import { frentesDa, listarFrentes } from '../lib/frente.mjs';
import { gravarSessao, idCurto, lerSessao, registrarSessao, tocarSinal, VARIAVEL_SESSAO_CLAUDE } from '../lib/sessao.mjs';
import { inicioDoProcesso, pidDeComando } from '../lib/vida.mjs';

export const descricao = 'mostra ou troca o papel da sessão (orquestrador ou executor)';
export const uso = 'ah papel [orquestrador|executor]';
export const requisitos = { config: true, sessao: true };

const PAPEIS = ['orquestrador', 'executor'];
const SAIDA_DO_VALOR = 'ah papel orquestrador ou ah papel executor';

const nomeDoFoco = s => (s?.frente ? (s.frente.nome ?? s.frente) : null);

export async function executar(args, amb) {
  if (args.length > 1) throw new ErroDeUso(`Argumento a mais: ${String(args[1]).slice(0, 40)}\nPróximo passo: ${SAIDA_DO_VALOR}`);
  const novo = args[0] ?? null;
  if (novo !== null && !PAPEIS.includes(novo)) {
    throw new ErroDeUso(`Papel desconhecido: ${String(novo).slice(0, 40) || '(vazio)'}\nPróximo passo: ${SAIDA_DO_VALOR}`);
  }
  const dirEstado = amb.dirEstado;

  return comTrava(dirEstado, 'frentes', async () => {
    let sessao = lerSessao(dirEstado, amb.sessaoId);
    if (!sessao || sessao.fim) {
      const pid = pidDeComando(amb.env);
      const doAgente = !amb.env.AH_SESSAO && amb.env[VARIAVEL_SESSAO_CLAUDE];
      sessao = registrarSessao(dirEstado, {
        id: amb.sessaoId, agente: sessao?.agente ?? (doAgente ? 'claude' : 'desconhecido'),
        pid, pidInicio: pid === null ? null : inicioDoProcesso(pid),
      });
    } else {
      tocarSinal(dirEstado, amb.sessaoId);
    }
    if (novo === null || novo === sessao.papel) {
      amb.escrever(`Sessão ${idCurto(sessao.id)}: ${sessao.papel}.\n`);
      return 0;
    }
    if (novo === 'executor') {
      const minhas = frentesDa(listarFrentes(dirEstado), amb.sessaoId, { comAbrindo: true });
      if (minhas.length > 1) {
        // Fica a frente em foco (ou a mais nova); as outras precisam sair desta sessão.
        const foco = nomeDoFoco(sessao);
        const fica = minhas.find(f => f.nome === foco) ?? minhas.at(-1);
        const outras = minhas.filter(f => f !== fica).map(f => f.nome);
        throw new ErroDeUso(`Executor tem uma frente só, e esta sessão tem ${minhas.length}: ${minhas.map(f => f.nome).join(', ')}.\n`
          + `Próximo passo: fique com ${fica.nome} e, nas outras, rode ${outras.map(n => `ah handoff ${n} ou ah close ${n}`).join('; ')}; depois ah papel executor`);
      }
    }
    const anterior = sessao.papel;
    sessao.papel = novo;
    gravarSessao(dirEstado, sessao);
    registrarEvento(dirEstado, { tipo: 'papel', sessao: amb.sessaoId, papel: novo, anterior });
    amb.escrever(`Sessão ${idCurto(sessao.id)}: ${novo}.\n`);
    return 0;
  });
}
