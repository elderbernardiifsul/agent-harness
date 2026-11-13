// Continuação de sessão (desenho, seção 11, "Continuação"): a sessão nova substitui as
// anteriores do mesmo processo do agente (mesmo pid e mesma hora de início, conhecida nos dois
// lados); herda frente e papel quando é continuação. Começo novo no mesmo processo solta a frente.
// A sessão velha do /clear chega aqui sem `fim`, com `aguardandoContinuacao` (o contrato não a encerra).
import { comTrava, registrarEvento } from './estado.mjs';
import { lerSessao, gravarSessao, listarSessoes } from './sessao.mjs';
import { listarFrentesTolerante, gravarFrente, frentesDa } from './frente.mjs';
import { enfileirar } from './pendentes.mjs';
import { corpoDaMarcacao } from './reserva.mjs';

// Mesmo processo só com a hora de início conhecida e igual nos dois lados: sem ela, um pid
// reaproveitado (Windows, ps que falhou) encerraria uma sessão viva. Na dúvida, não (seção 11).
const comAnterior = (f, id) => [...new Set([...(Array.isArray(f.sessoesAnteriores) ? f.sessoesAnteriores : []), id])];
const mesmoProcesso = (s, pid, pidInicio) => s.pid === pid && pidInicio != null && s.pidInicio === pidInicio;

export function continuarSessao(dirEstado, { sessao, pid, pidInicio = null, origem }) {
  return comTrava(dirEstado, 'frentes', async () => {
    const resultado = { substituidas: [], herdadas: [], soltas: [], passadas: [] };
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
      // Destino executor que já tem frente ativa (o /resume de uma conversa com frente): não herda as da velha, que
      // ficam passadas como no handoff (a passagem vai para os tickets pela fila); papel e foco do destino ficam.
      const destinoOcupado = vinculo && nova && nova.papel !== 'orquestrador'
        && frentesDa(listarFrentesTolerante(dirEstado).frentes, sessao).length > 0;
      if (destinoOcupado) {
        for (const f of daVelha) {
          const passada = { ...f, estado: 'passada', dona: null, passadaEm: agora, passadaPor: velha.id, passadaDe: velha.id, sessoesAnteriores: comAnterior(f, velha.id) };
          delete passada.tomadaDe;
          delete passada.tomadaEm;
          gravarFrente(dirEstado, passada);
          if ((passada.tickets ?? []).length) {
            const texto = `Frente ${passada.id} (${passada.nome}) passada: a sessão continuou numa conversa que já tem frente.\n\nPara retomar: tools/ah open ${passada.nome}`;
            const corpo = corpoDaMarcacao({ frente: passada, tipo: 'passagem', texto, login: passada.abertaPor ?? 'local', sessao: velha.id });
            for (const n of passada.tickets) enfileirar(dirEstado, { tipo: 'comentario', ticket: n, corpo });
          }
          resultado.soltas.push(f.nome);
          resultado.passadas.push({ id: f.id, nome: f.nome });
          registrarEvento(dirEstado, { tipo: 'frente-solta', sessao: velha.id, frente: f.nome, por: sessao, motivo: 'destino-ja-tem-frente' });
        }
        encerrarVelha();
      } else if (vinculo) {
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
