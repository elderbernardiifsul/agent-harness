import fs from 'node:fs';
import { ErroDeUso } from '../lib/caminhos.mjs';
import { comTrava, registrarEvento } from '../lib/estado.mjs';
import { frentesDa, gravarFrente, lerFrente, listarFrentes, nomeValido } from '../lib/frente.mjs';
import { loginDeQuemAge } from '../lib/github.mjs';
import { pendentesDoTicket, reenviarComAviso, temDoTicket } from '../lib/pendentes.mjs';
import { avisarDaMarcacao, marcarTickets, quemTemAFrente, sessoesDaquiDaFrente } from '../lib/reserva.mjs';
import { gravarSessao, idCurto, lerSessao, registrarSessao, tocarSinal, VARIAVEL_SESSAO_CLAUDE } from '../lib/sessao.mjs';
import { aberturaEmCurso, inicioDoProcesso, pidDeComando, prazoMs, vidaDaSessao } from '../lib/vida.mjs';

export const descricao = 'assume a frente de uma sessão que morreu (com a confirmação do executivo)';
export const uso = 'ah takeover <nome> [--confirmado]';
export const requisitos = { config: true, sessao: true };

const recusa = (motivo, saida) => new ErroDeUso(`${motivo}\nPróximo passo: ${saida}`);

function lerOpcoes(args) {
  const o = { nome: null, confirmado: false };
  for (const arg of args) {
    if (arg === '--confirmado') { o.confirmado = true; continue; }
    if (arg.startsWith('--')) throw recusa(`Opção desconhecida: ${arg.slice(0, 40)}`, `use ${uso}`);
    if (o.nome !== null) throw recusa(`Argumento a mais: ${arg.slice(0, 40)}`, `use ${uso}`);
    o.nome = arg;
  }
  return o;
}

// Vida da sessão dona; registro ilegível conta como não viva.
function vidaDa(dirEstado, id, config) {
  try {
    return vidaDaSessao(dirEstado, id, { config });
  } catch {
    return { estado: 'desconhecida', motivo: 'registro ilegível', idadeDoSinalMs: null };
  }
}

// Recusas locais, sob a trava `frentes`, sem mudar nada. Devolve a vida da dona (null na frente sem dona).
function conferir({ f, nome, amb, sessao }) {
  const { dirEstado, config: cfg } = amb;
  if (!f) throw recusa(`Não achei a frente ${nome} no estado.`, 'confira o nome das frentes em ah board');
  const qual = `${f.id} ${f.nome}`;
  if (f.estado === 'abrindo') {
    // As mesmas saídas do open e do close: abertura em curso espera; parada se retoma pelo open ou se desfaz.
    const outraViva = Boolean(f.dona) && f.dona !== amb.sessaoId && vidaDa(dirEstado, f.dona, cfg).estado === 'viva';
    if (aberturaEmCurso(f.processo) ?? outraViva) {
      throw recusa(`Há uma abertura da frente ${nome} em curso (sessão ${f.dona ?? 'sem dona'}${f.processo ? `, processo ${f.processo.pid}` : ''}).`,
        `espere esse ah open terminar (ah board mostra a frente) ou escolha outro nome; se ele parou, rode ah open ${nome} de novo`);
    }
    throw recusa(`A frente ${qual} parou no meio da abertura; não há frente ativa para assumir.`,
      `ah open ${nome} para retomar a abertura parada, ou ah close ${nome} para desistir dela`);
  }
  if (f.estado === 'passada') throw recusa(`A frente ${qual} está passada, sem dona: retome-a em vez de assumir.`, `ah open ${nome}`);
  if (f.estado !== 'ativa') throw recusa(`A frente ${qual} não está ativa (estado ${f.estado}).`, 'confira a frente em ah board');
  if (f.dona === amb.sessaoId) throw recusa(`A frente ${qual} é desta sessão.`, `a frente já é sua: trabalhe em ${f.worktree}`);
  const vida = f.dona ? vidaDa(dirEstado, f.dona, cfg) : null;
  if (vida?.estado === 'viva') {
    throw recusa(`A frente ${qual} é da sessão ${idCurto(f.dona)}, que está viva.`,
      `peça à sessão ${idCurto(f.dona)} que rode ah handoff; ou espere o sinal dela vencer (${Math.round(prazoMs(cfg) / 60000)} min)`);
  }
  // A dona da frente é a fonte: o executor com frente ativa (ou em abertura) não assume outra.
  if (sessao?.papel !== 'orquestrador') {
    const minhas = frentesDa(listarFrentes(dirEstado), amb.sessaoId, { comAbrindo: true });
    if (minhas.length) {
      const nomes = minhas.map(m => m.nome);
      throw recusa(`Esta sessão já tem a frente ${nomes.join(', ').slice(0, 60)}.`,
        `antes de assumir ${nome}, passe ou feche a sua: ${nomes.map(n => `ah handoff ${n} ou ah close ${n}`).join('; ')} (o orquestrador assume várias: ah papel orquestrador)`);
    }
  }
  if (typeof f.worktree !== 'string' || !fs.existsSync(f.worktree)) {
    throw recusa(`O worktree da frente ${qual} não existe (${f.worktree}).`,
      `encerre o registro com ah close ${nome} e abra de novo com ah open ${nome}`);
  }
  return vida;
}

function descrever(f, vida) {
  const qual = `${f.id} ${f.nome}`;
  if (!f.dona) return `A frente ${qual} está sem dona.`;
  const sinal = vida.idadeDoSinalMs == null ? 'sem sinal de vida' : `último sinal há ${Math.round(vida.idadeDoSinalMs / 60000)} min`;
  return `A frente ${qual} é da sessão ${idCurto(f.dona)} (${vida.estado}: ${vida.motivo}; ${sinal}).`;
}

export async function executar(args, amb) {
  const o = lerOpcoes(args);
  if (o.nome === null) throw recusa('Falta o nome da frente a assumir.', 'rode ah takeover <nome>, com o nome que ah board mostra');
  if (!nomeValido(o.nome)) throw recusa(`Nome de frente inválido: ${o.nome.slice(0, 40) || '(vazio)'}`, 'use o nome que ah board mostra (ex.: ah takeover carrinho)');
  const { dirEstado, env, config: cfg } = amb;
  const nome = o.nome;

  // Fase 1, sob a trava: registra a sessão (se for o primeiro comando dela) e as recusas locais.
  const { frente, vida } = await comTrava(dirEstado, 'frentes', async () => {
    let sessao = lerSessao(dirEstado, amb.sessaoId);
    if (!sessao) {
      const doAgente = !env.AH_SESSAO && env[VARIAVEL_SESSAO_CLAUDE];
      const pid = pidDeComando(env);
      sessao = registrarSessao(dirEstado, { id: amb.sessaoId, agente: doAgente ? 'claude' : 'desconhecido', pid, pidInicio: pid === null ? null : inicioDoProcesso(pid) });
    } else {
      tocarSinal(dirEstado, amb.sessaoId);
    }
    const f = lerFrente(dirEstado, nome);
    return { frente: f, vida: conferir({ f, nome, amb, sessao }) };
  }, { venceMs: 120000 });
  if (!o.confirmado) throw recusa(descrever(frente, vida), `peça ao executivo que confirme e rode ah takeover ${nome} --confirmado`);

  // Fora da trava (rede): a fila desta máquina sai antes; operação dela ainda presa num ticket da frente recusa
  // (o GitHub ainda não mostra o que esta máquina fez). Com rede, o GitHub diz se outra máquina está com a frente.
  const tickets = frente.tickets ?? [];
  const oGh = { cwd: amb.raiz, env, avisar: amb.avisar };
  const login = loginDeQuemAge(amb, frente);
  const rotulo = cfg.github.rotuloDeReserva;
  if (tickets.length) {
    await reenviarComAviso(dirEstado, { cwd: amb.raiz, env }, amb.avisar);
    const presos = tickets.filter(n => temDoTicket(dirEstado, n));
    if (presos.length) {
      throw recusa(`Não assumi a frente ${frente.id} ${nome}: há operações desta máquina na fila para ${presos.map(n => `#${n}`).join(', ')} que precisam sair antes.`,
        `tente de novo com rede: ah takeover ${nome} --confirmado`);
    }
    const sessoesDaqui = sessoesDaquiDaFrente(dirEstado, frente, [frente.dona]);
    const q = quemTemAFrente({ frente, login, sessao: amb.sessaoId, rotulo, sessoesDaqui }, oGh);
    const velho = `confira os tickets (${tickets.map(n => `#${n}`).join(', ')}); se o registro desta máquina ficou velho, encerre-o com ah close ${nome}`;
    switch (q.situacao) {
      case 'daqui':
      case 'propria':
        break;
      case 'sem-rede':
        amb.avisar(`Aviso: não consegui conferir no GitHub quem está com a frente ${nome} (${q.motivo}); assumo pelo registro desta máquina.\n`);
        break;
      case 'outra':
        throw recusa(`Não assumi ${nome}: a frente ${q.id} está ativa com @${q.login} em outra máquina.`, `combine com @${q.login}, que está com a frente ${q.id}`);
      case 'nao-achei':
        throw recusa(`Não assumi ${nome}: não achei o ticket #${q.ticket} da frente ${frente.id}.`, `confira o ticket #${q.ticket}; se ele foi apagado, encerre com ah close ${nome}`);
      case 'passada':
        throw recusa(`Não assumi ${nome}: nos tickets a frente ${frente.id} está passada, não ativa com esta máquina.`, velho);
      default:
        throw recusa(`Não assumi ${nome}: nos tickets a frente ${frente.id} não está ativa (foi fechada, ou o marcador não está lá).`, velho);
    }
  }

  // Fase 2, sob a trava: confere que nada mudou e assume. Os comentários só entram na fila (saem depois da trava),
  // atrás do que já houver para os tickets: quem mexer na frente depois daqui comenta atrás deles.
  const { f, corpo, args: edicao } = await comTrava(dirEstado, 'frentes', async () => {
    const sessao = lerSessao(dirEstado, amb.sessaoId);
    if (sessao) tocarSinal(dirEstado, amb.sessaoId);
    const atual = lerFrente(dirEstado, nome);
    if (!atual || atual.id !== frente.id || atual.estado !== frente.estado || (atual.dona ?? null) !== (frente.dona ?? null)
      || tickets.some(n => temDoTicket(dirEstado, n))) {
      throw recusa(`A frente ${nome} mudou enquanto eu conferia o GitHub.`, `rode ah takeover ${nome} --confirmado de novo`);
    }
    const vidaAgora = conferir({ f: atual, nome, amb, sessao });
    const de = atual.dona ?? null;
    const anterior = de ? `a anterior, ${idCurto(de)}, ${vidaAgora.motivo}` : 'antes sem dona';
    const texto = `Frente ${atual.id} (${atual.nome}) assumida pela sessão ${idCurto(amb.sessaoId)} (${anterior}).`;
    const m = marcarTickets({ frente: atual, tipo: 'tomada', texto, login, sessao: amb.sessaoId, rotulo, dirEstado, reatribuir: true, soNaFila: true }, oGh);
    atual.dona = amb.sessaoId;
    atual.tomadaDe = de;
    atual.tomadaEm = new Date().toISOString();
    delete atual.atribuidaPor;
    if (atual.reserva) atual.reserva = { ...atual.reserva, logins: m.logins };
    gravarFrente(dirEstado, atual);
    if (de) {
      let velha = null;
      try { velha = lerSessao(dirEstado, de); } catch { velha = null; }
      if (velha && (velha.frente?.nome ?? velha.frente) === nome) gravarSessao(dirEstado, { ...velha, frente: null });
    }
    const minha = lerSessao(dirEstado, amb.sessaoId);
    if (minha) gravarSessao(dirEstado, { ...minha, frente: nome });
    registrarEvento(dirEstado, { tipo: 'tomada', sessao: amb.sessaoId, de, frente: nome, id: atual.id });
    return { f: atual, corpo: m.corpo, args: m.args };
  }, { venceMs: 120000 });

  // Fora da trava: a fila sai (a tomada com ela); sem rede, fica para o próximo comando.
  if (tickets.length) {
    await reenviarComAviso(dirEstado, { cwd: amb.raiz, env }, amb.avisar);
    const naFila = tipo => tickets.filter(n => pendentesDoTicket(dirEstado, n).some(op => op.tipo === tipo
      && (tipo === 'comentario' ? op.corpo === corpo : JSON.stringify(op.args) === JSON.stringify(edicao))));
    avisarDaMarcacao({ comentariosNaFila: naFila('comentario'), edicoesNaFila: edicao ? naFila('edicao') : [] }, amb.avisar);
  }
  amb.escrever(`Frente ${f.id} ${f.nome} assumida.\nTrabalhe em: ${f.worktree}\n`);
  return 0;
}
