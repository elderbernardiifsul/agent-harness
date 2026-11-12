// Reserva de ticket: marcador nos comentários, leitura do ticket, reserva no open, marcação e liberação.
// Todas as funções com rede recebem `o = {cwd, env}` como as de github.mjs.
// Marcador (decisão 6 da fatia 2): última linha do comentário,
//   <!-- ah:<tipo> id=<id> nome=<nome> ramo=<ramo> estado=<ativa|passada|livre> login=<login> ... v=1 -->
// O último marcador de uma frente diz o estado dela no ticket; na corrida vence o marcador ativo mais antigo.
import { comentar, criarRotulo, editarTicket, gh } from './github.mjs';
import { comentarOuEnfileirar, editarOuEnfileirar } from './pendentes.mjs';
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

const MARCADOR = /<!--\s*ah:([a-z]+)((?:\s+[A-Za-z]+=\S*)*)\s*-->/g;

export function lerMarcadores(texto) {
  const achados = [];
  for (const m of String(texto ?? '').matchAll(MARCADOR)) {
    const campos = {};
    for (const par of m[2].trim().split(/\s+/).filter(Boolean)) {
      const i = par.indexOf('=');
      campos[par.slice(0, i)] = decodificar(par.slice(i + 1));
    }
    // Marcador da fatia 1 (sem v): vale como frente ativa.
    if (campos.v === undefined && m[1] === 'frente' && campos.estado === undefined) campos.estado = 'ativa';
    achados.push({ tipo: m[1], campos });
  }
  return achados;
}

function motivoCurto(r) {
  return (`${r.erro}\n${r.saida}`.trim().split('\n')[0] || `o gh saiu com código ${r.codigo}`).slice(0, 200);
}

// Uma chamada: `comments` do gh issue view traz todos os comentários (o gh pagina sozinho).
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
  for (const c of j.comments ?? []) {
    for (const m of lerMarcadores(c?.body)) marcadores.push({ ...m, autor: c?.author?.login ?? null });
  }
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

// Frentes com reserva no ticket: pelo último marcador de cada uma. `desde` é a posição do primeiro marcador
// do trecho ativo atual (depois do último `livre`): é por ele que se decide quem chegou antes.
function frentesAtivas(ticket) {
  const porId = new Map();
  ticket.marcadores.forEach((m, i) => {
    const id = m.campos.id;
    if (!id) return;
    const estado = m.campos.estado ?? ESTADO_DO_TIPO[m.tipo] ?? 'ativa';
    const atual = porId.get(id);
    const desde = !atual || atual.estado === 'livre' ? i : atual.desde;
    porId.set(id, { id, nome: m.campos.nome ?? null, login: m.campos.login ?? m.autor ?? 'desconhecido', estado, desde });
  });
  return [...porId.values()].filter(f => f.estado !== 'livre').sort((a, b) => a.desde - b.desde);
}

export function situacaoDoTicket(ticket, { rotulo, frenteId }) {
  const ativas = frentesAtivas(ticket);
  const outra = ativas.find(f => f.id !== frenteId);
  if (outra) return { livre: false, id: outra.id, nome: outra.nome, login: outra.login, estado: outra.estado };
  const donos = new Set(ativas.map(f => f.login));
  const solto = ticket.responsaveis.find(l => !donos.has(l));
  if (solto) return { livre: false, id: null, nome: null, login: solto, estado: 'ativa' };
  if (!ativas.length && rotulo && ticket.rotulos.includes(rotulo)) {
    return { livre: false, id: null, nome: null, login: ticket.responsaveis[0] ?? 'desconhecido', estado: 'ativa' };
  }
  return ativas.length ? { livre: true, propria: true } : { livre: true };
}

const camposDaFrente = (frente, estado, login, sessao) => ({
  id: frente.id, nome: frente.nome, ramo: frente.ramo, estado, login, sessao: sessao ? idCurto(sessao) : null,
});

const SAIDA_SEM_REDE = 'tente de novo com rede, ou abra sem --tickets (sem reserva)';

// Desfaz a reserva desta frente nos tickets: comenta `desistencia` (livre) e tira o login de responsável
// (salvo se o vencedor tem o mesmo login) e o rótulo onde nenhuma outra frente ficou. Pela fila: nunca falha.
function desistir({ tickets, frente, login, sessao, rotulo, dirEstado, motivo, vencedor = null, lidos = new Map() }, o) {
  for (const n of tickets) {
    const texto = `Frente ${frente.id} (${frente.nome}) desistiu da reserva: ${motivo}.`;
    const corpo = `${texto}\n\n${montarMarcador('desistencia', camposDaFrente(frente, 'livre', login, sessao))}\n`;
    const outras = lidos.has(n) ? frentesAtivas(lidos.get(n)).filter(f => f.id !== frente.id) : [];
    const args = [];
    if (!vencedor || vencedor.login !== login) args.push('--remove-assignee', login);
    if (!outras.length) args.push('--remove-label', rotulo);
    if (dirEstado) {
      comentarOuEnfileirar(dirEstado, n, corpo, { ...o, evento: { sessao, frente: frente.nome } });
      if (args.length) editarOuEnfileirar(dirEstado, n, args, { ...o, evento: { sessao, frente: frente.nome } });
    } else {
      comentar(n, corpo, o);
      if (args.length) editarTicket(n, args, o);
    }
  }
}

export function reservar({ tickets, frente, login, sessao, rotulo, dirEstado = null }, o = {}) {
  const lidos = new Map();
  for (const n of tickets) {
    const r = lerTicket(n, o);
    if (!r.ok) return { ok: false, motivo: `não consegui falar com o GitHub para reservar #${n} (${r.motivo})`, saida: SAIDA_SEM_REDE };
    lidos.set(n, r.ticket);
  }
  const abertos = tickets.filter(n => lidos.get(n).aberto);
  const fechados = tickets.filter(n => !lidos.get(n).aberto);
  for (const n of abertos) {
    const s = situacaoDoTicket(lidos.get(n), { rotulo, frenteId: frente.id });
    if (s.livre) continue;
    const quem = s.id ? `pela frente ${s.id}${s.nome ? ` (${s.nome})` : ''}, de @${s.login}` : `por @${s.login} (responsável ou rótulo ${rotulo} sem frente do harness)`;
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
  const falha = n => {
    desistir({ tickets: tocados, frente, login, sessao, rotulo, dirEstado, motivo: 'o GitHub falhou no meio da reserva' }, o);
    return { ok: false, motivo: `não consegui falar com o GitHub para reservar #${n} (falhou no meio; desfiz o que deu)`, saida: SAIDA_SEM_REDE };
  };
  for (const n of abertos) {
    if (!comentar(n, corpo, o)) return falha(n);
    tocados.push(n);
    if (!editarTicket(n, ['--add-assignee', login, '--add-label', rotulo], o)) return falha(n);
  }

  // Relê: se outra frente marcou antes desta (corrida), esta desiste em todos.
  const relidos = new Map();
  let vencedor = null;
  for (const n of abertos) {
    const r = lerTicket(n, o);
    if (!r.ok) return falha(n);
    relidos.set(n, r.ticket);
    const ativas = frentesAtivas(r.ticket);
    const minha = ativas.find(f => f.id === frente.id);
    const antes = ativas.find(f => f.id !== frente.id && (!minha || f.desde < minha.desde));
    if (antes && !vencedor) vencedor = antes;
  }
  if (vencedor) {
    desistir({ tickets: abertos, frente, login, sessao, rotulo, dirEstado, motivo: `a frente ${vencedor.id} reservou antes`, vencedor, lidos: relidos }, o);
    return {
      ok: false, desistiu: true, id: vencedor.id, login: vencedor.login,
      motivo: `a frente ${vencedor.id}${vencedor.nome ? ` (${vencedor.nome})` : ''}, de @${vencedor.login}, reservou #${abertos.join(', #')} antes desta; desisti da reserva.`,
      saida: `combine com @${vencedor.login}, dona da frente ${vencedor.id}, ou escolha outro ticket; se a reserva ficou velha, peça a quem a fez para rodar ah close ou ah handoff`,
    };
  }
  return { ok: true, reservados: abertos, fechados };
}

// Comenta `texto` + marcador do `tipo` em cada ticket da frente (pela fila). Com `reatribuir` e um login
// fora da reserva, põe esse login de responsável e devolve a lista nova.
export function marcarTickets({ frente, tipo, texto, login, sessao, rotulo, dirEstado, reatribuir = false }, o = {}) {
  const estado = ESTADO_DO_TIPO[tipo] ?? 'ativa';
  const corpo = `${texto}\n\n${montarMarcador(tipo, camposDaFrente(frente, estado, login, sessao))}\n`;
  const evento = { sessao, frente: frente.nome };
  const comentariosNaFila = [];
  const edicoesNaFila = [];
  let logins = [...(frente.reserva?.logins ?? [])];
  const novo = reatribuir && !logins.includes(login);
  for (const n of frente.tickets ?? []) {
    if (!comentarOuEnfileirar(dirEstado, n, corpo, { ...o, evento })) comentariosNaFila.push(n);
  }
  if (novo) {
    for (const n of frente.reserva?.tickets ?? frente.tickets ?? []) {
      if (!editarOuEnfileirar(dirEstado, n, ['--add-assignee', login, '--add-label', rotulo], { ...o, evento })) edicoesNaFila.push(n);
    }
    logins = [...logins, login];
  }
  return { logins, comentariosNaFila, edicoesNaFila };
}

// Fechamento: comentário com o resumo e marcador `fechamento` (livre); tira responsáveis e rótulo da reserva.
export function liberarTickets({ frente, resumo, login, rotulo, dirEstado, sessao = null }, o = {}) {
  const marcador = montarMarcador('fechamento', camposDaFrente(frente, 'livre', login, sessao));
  const corpo = `Frente ${frente.id} (${frente.nome}) fechada.\n\n${resumo}\n\n${marcador}\n`;
  const evento = { sessao, frente: frente.nome };
  const comentariosNaFila = [];
  const edicoesNaFila = [];
  for (const n of frente.tickets ?? []) {
    if (!comentarOuEnfileirar(dirEstado, n, corpo, { ...o, evento })) comentariosNaFila.push(n);
  }
  if (frente.reserva) {
    const args = [...(frente.reserva.logins ?? []).flatMap(l => ['--remove-assignee', l]), '--remove-label', rotulo];
    for (const n of frente.reserva.tickets ?? []) {
      if (!editarOuEnfileirar(dirEstado, n, args, { ...o, evento })) edicoesNaFila.push(n);
    }
  }
  return { comentariosNaFila, edicoesNaFila };
}

// Desfaz uma reserva já feita (o open que reservou e depois não criou o worktree).
export function desfazerReserva({ frente, login, sessao, rotulo, dirEstado, motivo }, o = {}) {
  desistir({ tickets: frente.reserva?.tickets ?? [], frente, login, sessao, rotulo, dirEstado, motivo }, o);
}
