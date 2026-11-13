// Continuação de sessão (desenho, seção 11, "Continuação"): a sessão nova substitui as
// anteriores do mesmo processo do agente (mesmo pid e mesma hora de início, conhecida nos dois
// lados); herda frente e papel quando é continuação. Começo novo no mesmo processo solta a frente.
// A sessão velha do /clear chega aqui sem `fim`, com `aguardandoContinuacao` (o contrato não a encerra).
import { comTrava, registrarEvento } from './estado.mjs';
import { lerSessao, gravarSessao, listarSessoes } from './sessao.mjs';
import { listarFrentesTolerante, gravarFrente, frentesDa } from './frente.mjs';

// Mesmo processo só com a hora de início conhecida e igual nos dois lados: sem ela, um pid
// reaproveitado (Windows, ps que falhou) encerraria uma sessão viva. Na dúvida, não (seção 11).
const comAnterior = (f, id) => [...new Set([...(Array.isArray(f.sessoesAnteriores) ? f.sessoesAnteriores : []), id])];
const mesmoProcesso = (s, pid, pidInicio) => s.pid === pid && pidInicio != null && s.pidInicio === pidInicio;

export function continuarSessao(dirEstado, { sessao, pid, pidInicio = null, origem }) {
  return comTrava(dirEstado, 'frentes', async () => {
    const resultado = { substituidas: [], herdadas: [], soltas: [] };
    if (pid === null || pid === undefined || pidInicio === null || pidInicio === undefined) return resultado;
    const velhas = listarSessoes(dirEstado).sessoes.filter(s => s.id !== sessao && !s.fim && mesmoProcesso(s, pid, pidInicio));
    if (!velhas.length) return resultado;
    // Frente ilegível não entra (nem herdada, nem solta): o doctor e o sweep a acusam.
    const frentes = listarFrentesTolerante(dirEstado).frentes;
    const nova = lerSessao(dirEstado, sessao);
    let novaMudou = false;
    const agora = new Date().toISOString();
    for (const velha of velhas) {
      const daVelha = frentesDa(frentes, velha.id);
      // As frentes mudam de dona (ou ficam soltas) antes de a sessão velha ser encerrada: a T4 não vê, nem por um
      // instante, frente ativa com dona encerrada.
      const encerrarVelha = () => {
        gravarSessao(dirEstado, { ...velha, fim: agora, motivoFim: 'substituida', frente: null, aguardandoContinuacao: undefined });
        registrarEvento(dirEstado, { tipo: 'substituida', de: velha.id, por: sessao });
        resultado.substituidas.push(velha.id);
      };
      const vinculo = origem === 'continuacao';
      if (vinculo) {
        // `sessoesAnteriores`: as sessões substituídas que foram donas (os marcadores nos tickets podem ser delas).
        for (const f of daVelha) gravarFrente(dirEstado, { ...f, dona: sessao, sessoesAnteriores: comAnterior(f, velha.id) });
        if (nova) {
          nova.papel = velha.papel ?? nova.papel;
          nova.frente = velha.frente ?? nova.frente;
          novaMudou = true;
        }
        encerrarVelha();
        const nomes = daVelha.map(f => f.nome);
        resultado.herdadas.push(...nomes);
        registrarEvento(dirEstado, { tipo: 'heranca', de: velha.id, sessao, frentes: nomes });
      } else {
        for (const f of daVelha) {
          // `passadaDe`: a sessão de quem a frente ficou solta (a retomada a reconhece como desta máquina).
          gravarFrente(dirEstado, { ...f, estado: 'passada', dona: null, passadaEm: agora, passadaPor: 'continuacao-sem-vinculo', passadaDe: velha.id, sessoesAnteriores: comAnterior(f, velha.id) });
          resultado.soltas.push(f.nome);
          registrarEvento(dirEstado, { tipo: 'frente-solta', sessao: velha.id, frente: f.nome, por: sessao, motivo: 'continuacao-sem-vinculo' });
        }
        encerrarVelha();
      }
    }
    if (novaMudou) gravarSessao(dirEstado, nova);
    return resultado;
  });
}
