// Reserva de ticket: marcador nos comentários, leitura do ticket, reserva no open, marcação e liberação.
// Todas as funções com rede recebem `o = {cwd, env}` como as de github.mjs.
// Marcador (decisão 6 da fatia 2): última linha do comentário,
//   <!-- ah:<tipo> id=<id> nome=<nome> ramo=<ramo> estado=<ativa|passada|livre> login=<login> ... v=1 -->
// O último marcador de uma frente diz o estado dela no ticket; na corrida vence o menor número de comentário.
import { comentar, criarRotulo, editarTicket, gh } from './github.mjs';
import { ENVIADO, NA_FILA, PERDIDO, comentarOuEnfileirar, editarOuEnfileirar } from './pendentes.mjs';
import { idCurto } from './sessao.mjs';

const ORDEM = ['id', 'nome', 'ramo', 'estado', 'login', 'sessao', 'tickets', 'plano', 'abertaPor', 'abertaEm'];
export const ESTADO_DO_TIPO = { frente: 'ativa', retomada: 'ativa', tomada: 'ativa', passagem: 'passada', fechamento: 'livre', desistencia: 'livre' };

// encodeURIComponent, com `/`, `:` e `,` mantidos (legíveis e sem ambiguidade no marcador).
const codificar = v => encodeURIComponent(String(v)).replace(/%2F/gi, '/').replace(/%3A/gi, ':').replace(/%2C/gi, ',');
const decodificar = v => {
  try { return decodeURIComponent(v); } catch { return v; }
};

export function montarMarcador(tipo, campos) {
  const chaves = [...ORDEM.filter(k => k in campos), ...Object.keys(campos).filter(k => !ORDEM.includes(k) && k !== 'v')];
  const pares = chaves.filter(k => campos[k] !== undefined && campos[k] !== null && String(campos[k]) !== '')
    .map(k => `${k}=${codificar(campos[k])}`);
  return `<!-- ah:${tipo} ${[...pares, 'v=1'].join(' ')} -->`;
}

// O marcador só vale como a última linha não vazia do comentário, e inteira (decisão 6): citar o formato
// no meio de um texto não cria frente.
const MARCADOR = /^<!--\s*ah:([a-z]+)((?:\s+[A-Za-z]+=\S*)*)\s*-->$/;

export function lerMarcadores(texto) {
  const ultima = String(texto ?? '').split('\n').map(l => l.trim()).filter(Boolean).at(-1);
  const m = ultima?.match(MARCADOR);
  if (!m) return [];
  const campos = {};
  for (const par of m[2].trim().split(/\s+/).filter(Boolean)) {
    const i = par.indexOf('=');
    campos[par.slice(0, i)] = decodificar(par.slice(i + 1));
  }
  // Marcador da fatia 1 (sem v): vale como frente ativa.
  if (campos.v === undefined && m[1] === 'frente' && campos.estado === undefined) campos.estado = 'ativa';
  return [{ tipo: m[1], campos }];
}

function motivoCurto(r) {
  return (`${r.erro}\n${r.saida}`.trim().split('\n')[0] || `o gh saiu com código ${r.codigo}`).slice(0, 200);
}

// Número do comentário no servidor (o `issuecomment-<n>` do url): cresce no repositório inteiro.
const numeroDoComentario = url => {
  const m = String(url ?? '').match(/issuecomment-(\d+)/);
  return m ? Number(m[1]) : null;
};

// Uma chamada: `comments` do gh issue view traz todos os comentários (o gh pagina sozinho) com o `url`.
// Marcador de terceiro (autor diferente do `login` que o marcador declara) não vale: nem reserva nem libera.
export function lerTicket(numero, o = {}) {
  const r = gh(['issue', 'view', String(numero), '--json', 'state,assignees,labels,comments'], o);
  if (r.codigo !== 0) return { ok: false, motivo: motivoCurto(r) };
  let j;
  try {
    j = JSON.parse(r.saida);
  } catch {
    return { ok: false, motivo: 'resposta do gh ilegível' };
  }
  const marcadores = [];
  (j.comments ?? []).forEach((c, i) => {
    const autor = c?.author?.login ?? null;
    for (const m of lerMarcadores(c?.body)) {
      if (!autor || (m.campos.login !== undefined && m.campos.login !== autor)) continue;
      marcadores.push({ ...m, autor, ordem: numeroDoComentario(c?.url) ?? i });
    }
  });
  return {
    ok: true,
    ticket: {
      numero: Number(numero),
      aberto: String(j.state ?? '').toUpperCase() === 'OPEN',
      responsaveis: (j.assignees ?? []).map(a => a?.login).filter(Boolean),
      rotulos: (j.labels ?? []).map(l => l?.name).filter(Boolean),
      marcadores,
    },
  };
}

// Frentes com reserva no ticket: pelo último marcador de cada uma. `desde` é o número do comentário do primeiro
// marcador do trecho ativo atual (depois do último `livre`): é por ele que se decide quem chegou antes.
function frentesAtivas(ticket) {
  const porId = new Map();
  ticket.marcadores.forEach((m, i) => {
    const id = m.campos.id;
    if (!id) return;
    const estado = m.campos.estado ?? ESTADO_DO_TIPO[m.tipo] ?? 'ativa';
    const atual = porId.get(id);
    const desde = !atual || atual.estado === 'livre' ? (m.ordem ?? i) : atual.desde;
    porId.set(id, { id, nome: m.campos.nome ?? null, login: m.campos.login ?? m.autor ?? 'desconhecido', estado, desde });
  });
  return [...porId.values()].filter(f => f.estado !== 'livre').sort((a, b) => a.desde - b.desde || a.id.localeCompare(b.id));
}

// `login` é quem abre: estar de responsável no ticket não o recusa no próprio ticket.
export function situacaoDoTicket(ticket, { rotulo, frenteId, login = null }) {
  const ativas = frentesAtivas(ticket);
  const outra = ativas.find(f => f.id !== frenteId);
  if (outra) return { livre: false, id: outra.id, nome: outra.nome, login: outra.login, estado: outra.estado };
  const donos = new Set([...ativas.map(f => f.login), ...(login ? [login] : [])]);
  const solto = ticket.responsaveis.find(l => !donos.has(l));
  if (solto) return { livre: false, id: null, nome: null, login: solto, estado: 'ativa' };
  if (!ativas.length && rotulo && ticket.rotulos.includes(rotulo) && !(login && ticket.responsaveis.includes(login))) {
    return { livre: false, id: null, nome: null, login: 'desconhecido', estado: 'ativa', soRotulo: true };
  }
  return ativas.length ? { livre: true, propria: true } : { livre: true };
}

const camposDaFrente = (frente, estado, login, sessao) => ({
  id: frente.id, nome: frente.nome, ramo: frente.ramo, estado, login, sessao: sessao ? idCurto(sessao) : null,
});

const SAIDA_SEM_REDE = 'tente de novo com rede, ou abra sem --tickets (sem reserva)';
const ESPERA_DA_RELEITURA_MS = 1500;

function esperar(ms) {
  if (ms > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// Situação de cada operação: 'enviado', 'na-fila' ou 'perdido' (como comentarOuEnfileirar).
function contar(situacoes) {
  return { naFila: situacoes.filter(s => s === NA_FILA).length, perdidos: situacoes.filter(s => s === PERDIDO).length };
}

// Desfaz a reserva desta frente nos tickets: comenta `desistencia` (livre) e tira o login de responsável
// (salvo se o vencedor tem o mesmo login) e o rótulo onde nenhuma outra frente ficou. Pela fila quando há
// `dirEstado`. Devolve quantas operações ficaram na fila e quantas se perderam.
function desistir({ tickets, frente, login, sessao, rotulo, dirEstado, motivo, vencedor = null, lidos = new Map() }, o) {
  const situacoes = [];
  for (const n of tickets) {
    const texto = `Frente ${frente.id} (${frente.nome}) desistiu da reserva: ${motivo}.`;
    const corpo = `${texto}\n\n${montarMarcador('desistencia', camposDaFrente(frente, 'livre', login, sessao))}\n`;
    const outras = lidos.has(n) ? frentesAtivas(lidos.get(n)).filter(f => f.id !== frente.id) : [];
    const args = [];
    if (!vencedor || vencedor.login !== login) args.push('--remove-assignee', login);
    if (!outras.length) args.push('--remove-label', rotulo);
    if (dirEstado) {
      situacoes.push(comentarOuEnfileirar(dirEstado, n, corpo, { ...o, evento: { sessao, frente: frente.nome } }));
      if (args.length) situacoes.push(editarOuEnfileirar(dirEstado, n, args, { ...o, evento: { sessao, frente: frente.nome } }));
    } else {
      situacoes.push(comentar(n, corpo, o) ? ENVIADO : PERDIDO);
      if (args.length) situacoes.push(editarTicket(n, args, o) ? ENVIADO : PERDIDO);
    }
  }
  return contar(situacoes);
}

// O que a desistência conseguiu, para a mensagem de recusa.
function comoDesfez({ naFila, perdidos }) {
  if (perdidos) return 'não consegui desfazer tudo: confira os tickets e tire à mão o responsável e o rótulo desta frente';
  if (naFila) return 'deixei na fila o que desfaz a reserva; sai no próximo comando com rede';
  return 'desfiz o que tinha feito';
}

export function reservar({ tickets, frente, login, sessao, rotulo, dirEstado = null, esperaMs = ESPERA_DA_RELEITURA_MS }, o = {}) {
  const lidos = new Map();
  for (const n of tickets) {
    const r = lerTicket(n, o);
    if (!r.ok) return { ok: false, motivo: `não consegui falar com o GitHub para reservar #${n} (${r.motivo})`, saida: SAIDA_SEM_REDE };
    lidos.set(n, r.ticket);
  }
  const abertos = tickets.filter(n => lidos.get(n).aberto);
  const fechados = tickets.filter(n => !lidos.get(n).aberto);
  for (const n of abertos) {
    const s = situacaoDoTicket(lidos.get(n), { rotulo, frenteId: frente.id, login });
    if (s.livre) continue;
    if (s.soRotulo) {
      return {
        ok: false, id: null, login: null,
        motivo: `o ticket #${n} tem o rótulo ${rotulo} sem frente do harness nem responsável.`,
        saida: `se ninguém o usa, tire o rótulo à mão (gh issue edit ${n} --remove-label ${rotulo}) e rode ah open de novo; se alguém o usa, combine com quem o pôs ou escolha outro ticket`,
      };
    }
    const quem = s.id ? `pela frente ${s.id}${s.nome ? ` (${s.nome})` : ''}, de @${s.login}` : `por @${s.login} (responsável sem frente do harness)`;
    const dona = s.id ? `dona da frente ${s.id}` : `que está no ticket #${n}`;
    return {
      ok: false, id: s.id, login: s.login,
      motivo: `o ticket #${n} já está reservado ${quem}.`,
      saida: `combine com @${s.login}, ${dona}, ou escolha outro ticket; se a reserva ficou velha, peça a quem a fez para rodar ah close ou ah handoff`,
    };
  }
  if (!abertos.length) return { ok: true, reservados: [], fechados };
  if (!criarRotulo(rotulo, o)) {
    return { ok: false, motivo: `não consegui falar com o GitHub para reservar #${abertos[0]} (o rótulo ${rotulo} não foi criado)`, saida: SAIDA_SEM_REDE };
  }

  const marcador = montarMarcador('frente', {
    ...camposDaFrente(frente, 'ativa', login, sessao),
    tickets: (frente.tickets ?? tickets).join(','), plano: frente.plano, abertaPor: frente.abertaPor, abertaEm: frente.abertaEm,
  });
  const corpo = `Frente ${frente.id} (${frente.nome}) aberta por @${login}.\n\n${marcador}\n`;
  const tocados = [];
  const relidos = new Map();
  const desfazer = (motivoDoTicket, motivoDaRecusa, saida = SAIDA_SEM_REDE) => {
    const r = desistir({ tickets: tocados, frente, login, sessao, rotulo, dirEstado, motivo: motivoDoTicket, lidos: relidos }, o);
    return { ok: false, motivo: `${motivoDaRecusa}; ${comoDesfez(r)}`, saida };
  };
  for (const n of abertos) {
    // Entra em `tocados` antes: um prazo que estoura com o comentário entregue também é desfeito.
    tocados.push(n);
    if (!comentar(n, corpo, o) || !editarTicket(n, ['--add-assignee', login, '--add-label', rotulo], o)) {
      return desfazer('o GitHub falhou no meio da reserva', `não consegui falar com o GitHub para reservar #${n} (falhou no meio)`);
    }
  }

  // Relê. O próprio marcador que ainda não aparece é atraso do servidor: relê uma vez depois de uma espera curta.
  const releitura = n => {
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      if (tentativa) esperar(esperaMs);
      const r = lerTicket(n, o);
      if (r.ok && frentesAtivas(r.ticket).some(f => f.id === frente.id)) return r.ticket;
    }
    return null;
  };
  for (const n of abertos) {
    const t = releitura(n);
    if (!t) {
      return desfazer('não consegui confirmar a reserva', `não consegui confirmar a reserva de #${n} (o comentário não apareceu na releitura)`,
        'tente de novo em instantes; se persistir, abra sem --tickets (sem reserva)');
    }
    relidos.set(n, t);
  }

  // Corrida: ordem única do servidor. Nos tickets em disputa, cada frente vale pelo menor número de comentário
  // do seu trecho ativo; empate pelo id. Exatamente uma fica; as outras, ao fazer a mesma conta, desistem.
  const chaves = new Map();
  for (const t of relidos.values()) {
    const ativas = frentesAtivas(t);
    if (!ativas.some(f => f.id !== frente.id)) continue;
    for (const f of ativas) {
      const atual = chaves.get(f.id);
      if (!atual || f.desde < atual.desde) chaves.set(f.id, f);
    }
  }
  const vencedor = [...chaves.values()].sort((a, b) => a.desde - b.desde || a.id.localeCompare(b.id))[0];
  if (vencedor && vencedor.id !== frente.id) {
    const r = desistir({ tickets: abertos, frente, login, sessao, rotulo, dirEstado, motivo: `a frente ${vencedor.id} reservou antes`, vencedor, lidos: relidos }, o);
    return {
      ok: false, desistiu: true, id: vencedor.id, login: vencedor.login,
      motivo: `a frente ${vencedor.id}${vencedor.nome ? ` (${vencedor.nome})` : ''}, de @${vencedor.login}, reservou #${abertos.join(', #')} antes desta; desisti da reserva (${comoDesfez(r)})`,
      saida: `combine com @${vencedor.login}, dona da frente ${vencedor.id}, ou escolha outro ticket; se a reserva ficou velha, peça a quem a fez para rodar ah close ou ah handoff`,
    };
  }
  return { ok: true, reservados: abertos, fechados };
}

// Separa o que ficou na fila do que se perdeu (este já avisado por comentarOuEnfileirar/editarOuEnfileirar).
function anotar(situacao, n, naFila, perdidos) {
  if (situacao === NA_FILA) naFila.push(n);
  else if (situacao === PERDIDO) perdidos.push(n);
}

// Comenta `texto` + marcador do `tipo` em cada ticket da frente (pela fila). Com `reatribuir` e um login
// fora da reserva, põe esse login de responsável (e o rótulo) e devolve a lista nova de logins.
// Devolve também os tickets cujo comentário ou edição ficou na fila e os que se perderam.
export function marcarTickets({ frente, tipo, texto, login, sessao, rotulo, dirEstado, reatribuir = false }, o = {}) {
  const estado = ESTADO_DO_TIPO[tipo] ?? 'ativa';
  const corpo = `${texto}\n\n${montarMarcador(tipo, camposDaFrente(frente, estado, login, sessao))}\n`;
  const evento = { sessao, frente: frente.nome };
  const r = { comentariosNaFila: [], comentariosPerdidos: [], edicoesNaFila: [], edicoesPerdidas: [] };
  let logins = [...(frente.reserva?.logins ?? [])];
  for (const n of frente.tickets ?? []) {
    anotar(comentarOuEnfileirar(dirEstado, n, corpo, { ...o, evento }), n, r.comentariosNaFila, r.comentariosPerdidos);
  }
  if (reatribuir && !logins.includes(login)) {
    for (const n of frente.reserva?.tickets ?? frente.tickets ?? []) {
      anotar(editarOuEnfileirar(dirEstado, n, ['--add-assignee', login, '--add-label', rotulo], { ...o, evento }), n, r.edicoesNaFila, r.edicoesPerdidas);
    }
    logins = [...logins, login];
  }
  return { logins, ...r };
}

// Fechamento: comentário com o resumo e marcador `fechamento` (livre); tira responsáveis e rótulo da reserva.
export function liberarTickets({ frente, resumo, login, rotulo, dirEstado, sessao = null }, o = {}) {
  const marcador = montarMarcador('fechamento', camposDaFrente(frente, 'livre', login, sessao));
  const corpo = `Frente ${frente.id} (${frente.nome}) fechada.\n\n${resumo}\n\n${marcador}\n`;
  const evento = { sessao, frente: frente.nome };
  const r = { comentariosNaFila: [], comentariosPerdidos: [], edicoesNaFila: [], edicoesPerdidas: [] };
  for (const n of frente.tickets ?? []) {
    anotar(comentarOuEnfileirar(dirEstado, n, corpo, { ...o, evento }), n, r.comentariosNaFila, r.comentariosPerdidos);
  }
  if (frente.reserva) {
    const args = [...(frente.reserva.logins ?? []).flatMap(l => ['--remove-assignee', l]), '--remove-label', rotulo];
    for (const n of frente.reserva.tickets ?? []) {
      anotar(editarOuEnfileirar(dirEstado, n, args, { ...o, evento }), n, r.edicoesNaFila, r.edicoesPerdidas);
    }
  }
  return r;
}

// Desfaz uma reserva já feita (o open que reservou e depois não criou o worktree). Devolve o texto do que fez.
export function desfazerReserva({ frente, login, sessao, rotulo, dirEstado, motivo }, o = {}) {
  return comoDesfez(desistir({ tickets: frente.reserva?.tickets ?? [], frente, login, sessao, rotulo, dirEstado, motivo }, o));
}
