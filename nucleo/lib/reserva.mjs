// Reserva de ticket: marcador nos comentários, leitura do ticket, reserva no open, marcação e liberação.
// Todas as funções com rede recebem `o = {cwd, env}` como as de github.mjs.
// Marcador (decisão 6 da fatia 2): última linha do comentário,
//   <!-- ah:<tipo> id=<id> nome=<nome> ramo=<ramo> estado=<ativa|passada|livre> login=<login> ... v=1 -->
// O último marcador de uma frente diz o estado dela no ticket; na corrida decide a ordem do servidor em cada
// ticket (o número do comentário): fica só quem tem o primeiro marcador em todos os seus tickets.
import { createHash } from 'node:crypto';
import { comentar, criarRotulo, editarTicket, gh } from './github.mjs';
import { ENVIADO, NA_FILA, PERDIDO, comentarOuEnfileirar, editarOuEnfileirar, enfileirar, pendentesDoTicket } from './pendentes.mjs';
import { idCurto, listarSessoes } from './sessao.mjs';
import { idValido, nomeValido } from './frente.mjs';

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

// Os marcadores que valem nos comentários de um ticket, com o autor e a ordem do servidor.
function marcadoresDosComentarios(comentarios) {
  const marcadores = [];
  (Array.isArray(comentarios) ? comentarios : []).forEach((c, i) => {
    const autor = c?.author?.login ?? null;
    for (const m of lerMarcadores(c?.body)) {
      // Sem `login` só vale o `ah:frente` no formato da fatia 1 (sem `v`), com o login do autor.
      const antigo = m.campos.login === undefined && m.tipo === 'frente' && m.campos.v === undefined;
      if (!autor || (m.campos.login === undefined ? !antigo : m.campos.login !== autor)) continue;
      // O id e o nome do marcador viram nomes de pasta e de arquivo (o registro da frente, as cópias das extensões):
      // fora do formato que o núcleo cria (`as-1`, `carrinho`), o marcador não vale. Um terceiro que comente
      // `id=../../../vitima` não vira a frente retomada.
      if ((m.campos.id !== undefined && !idValido(m.campos.id)) || (m.campos.nome !== undefined && !nomeValido(m.campos.nome))) continue;
      marcadores.push({ ...m, autor, ordem: numeroDoComentario(c?.url) ?? i });
    }
  });
  return marcadores;
}

// Uma chamada: `comments` do gh issue view traz todos os comentários (o gh pagina sozinho) com o `url`.
// Marcador de terceiro (autor diferente do `login` que o marcador declara) não vale: nem reserva nem libera.
// Marcador sem `login` só vale se for o `ah:frente` antigo (fatia 1); `fechamento` e os demais sem login, não.
const TICKET_INEXISTENTE = /Could not resolve to an issue|issue .* not found|Not Found \(HTTP 404\)/i;

export function lerTicket(numero, o = {}) {
  const r = gh(['issue', 'view', String(numero), '--json', 'state,assignees,labels,comments'], o);
  // Ticket que não existe (ou foi apagado) é outro erro que a falta de rede: `naoExiste`.
  if (r.codigo !== 0) return { ok: false, motivo: motivoCurto(r), naoExiste: TICKET_INEXISTENTE.test(`${r.erro}\n${r.saida}`) };
  let j;
  try {
    j = JSON.parse(r.saida);
  } catch {
    return { ok: false, motivo: 'resposta do gh ilegível' };
  }
  const marcadores = marcadoresDosComentarios(j.comments);
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

// Frentes que seguram o ticket (ativa ou passada; `livre` tira da conta): pelo último marcador de cada uma.
// `desde` é o número do comentário do primeiro marcador do trecho atual (depois do último `livre`); a lista sai
// nessa ordem, e é por ela que se decide quem chegou antes no ticket.
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

// Identificador da sessão inteira no marcador: os 16 primeiros hex do sha256 do id. Vai nos marcadores que seguram
// a frente (frente, retomada, tomada): é por ele que uma sessão reconhece o que é dela (a `sessao` curta não basta).
export const sidDe = sessao => createHash('sha256').update(String(sessao)).digest('hex').slice(0, 16);

// O marcador é desta sessão? Pelo `sid`; marcador antigo, sem `sid`, por login e sessão curta.
export function marcadorDaSessao(m, { login, sessao }) {
  if (!m) return false;
  if (m.campos.sid) return m.campos.sid === sidDe(sessao);
  return (m.campos.login ?? m.autor) === login && m.campos.sessao === idCurto(sessao);
}

// Com o que outra máquina precisa para reconstruir a frente (a passagem e a retomada levam tudo).
const camposCompletos = (frente, estado, login, sessao) => ({
  ...camposDaFrente(frente, estado, login, sessao),
  tickets: (frente.tickets ?? []).join(','), plano: frente.plano, abertaPor: frente.abertaPor, abertaEm: frente.abertaEm,
  ...(estado === 'ativa' && sessao ? { sid: sidDe(sessao) } : {}),
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

// Desfaz a reserva desta frente nos tickets: comenta `desistencia` (livre, com o `login` de quem comenta) e tira
// só o que nenhuma outra frente segura: cada login de `logins` (padrão: o próprio) de responsável, salvo se outra
// frente do ticket é do mesmo login, e o rótulo, se nenhuma outra frente ficou. O ticket que não está em `lidos`
// é relido antes; sem leitura, não tira nada e devolve em `semLeitura` o comando para tirar à mão. Pela fila quando há `dirEstado`. Devolve quantas operações ficaram na
// fila e quantas se perderam, e em `ficaram` os responsáveis que não saíram (ticket, login, motivo).
function desistir({ tickets, frente, login, logins = [login], sessao, rotulo, dirEstado, motivo, lidos = new Map() }, o) {
  const situacoes = [];
  const ficaram = [];
  const semLeitura = [];
  for (const n of tickets) {
    const texto = `Frente ${frente.id} (${frente.nome}) desistiu da reserva: ${motivo}.`;
    const corpo = `${texto}\n\n${montarMarcador('desistencia', camposDaFrente(frente, 'livre', login, sessao))}\n`;
    let lido = lidos.get(n);
    if (!lido) {
      const r = lerTicket(n, o);
      lido = r.ok ? r.ticket : null;
    }
    const args = [];
    const tirados = [];
    if (lido) {
      const outras = frentesAtivas(lido).filter(f => f.id !== frente.id);
      for (const l of new Set(logins)) {
        if (outras.some(f => f.login === l)) ficaram.push({ ticket: n, login: l, motivo: 'outra frente do mesmo login segura o ticket' });
        else { args.push('--remove-assignee', l); tirados.push(l); }
      }
      if (!outras.length) args.push('--remove-label', rotulo);
    } else {
      // Sem reler, não se sabe se outra frente segura o ticket: não tira nada às cegas; diz como tirar à mão.
      semLeitura.push({ ticket: n, comando: `gh issue edit ${n} ${[...new Set(logins)].map(l => `--remove-assignee ${l}`).join(' ')} --remove-label ${rotulo}` });
    }
    let edicao = null;
    if (dirEstado) {
      situacoes.push(comentarOuEnfileirar(dirEstado, n, corpo, { ...o, evento: { sessao, frente: frente.nome } }));
      if (args.length) situacoes.push(edicao = editarOuEnfileirar(dirEstado, n, args, { ...o, evento: { sessao, frente: frente.nome } }));
    } else {
      situacoes.push(comentar(n, corpo, o) ? ENVIADO : PERDIDO);
      if (args.length) situacoes.push(edicao = (editarTicket(n, args, o) ? ENVIADO : PERDIDO));
    }
    if (edicao === NA_FILA) for (const l of tirados) ficaram.push({ ticket: n, login: l, motivo: 'a edição que o tira ficou na fila' });
    if (edicao === PERDIDO) for (const l of tirados) ficaram.push({ ticket: n, login: l, motivo: 'a edição que o tira não foi feita' });
  }
  return { ...contar(situacoes), ficaram, semLeitura };
}

// O que a desistência conseguiu, para a mensagem de recusa.
function comoDesfez({ naFila, perdidos, semLeitura = [] }) {
  const base = perdidos ? 'não consegui desfazer tudo: confira os tickets e tire à mão o responsável e o rótulo desta frente'
    : naFila ? 'deixei na fila o que desfaz a reserva; sai no próximo comando com rede'
      : 'desfiz o que tinha feito';
  if (!semLeitura.length) return base;
  const cegos = semLeitura.map(x => `#${x.ticket} (se ninguém mais o segura: ${x.comando})`).join('; ');
  return `${base}, menos o responsável e o rótulo de ${cegos}, que não consegui reler para saber se outra frente os segura`;
}

// `sessao` é a da dona (vai no marcador); `para` (o open --para do orquestrador) diz no texto para quem foi aberta.
export const paraQuem = para => (para ? ` para a sessão ${idCurto(para)}` : '');

export function reservar({ tickets, frente, login, sessao, para = null, rotulo, dirEstado = null, esperaMs = ESPERA_DA_RELEITURA_MS }, o = {}) {
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
    // Frente passada (sem dona) continua com a reserva: o caminho é retomá-la, não abrir outra.
    if (s.estado === 'passada' && s.nome) {
      return {
        ok: false, id: s.id, login: s.login,
        motivo: `o ticket #${n} já está reservado ${quem}, que foi passada adiante (sem dona).`,
        saida: `retome essa frente com ah open ${s.nome} em vez de abrir outra, ou combine com @${s.login} e escolha outro ticket`,
      };
    }
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
    ...(sessao ? { sid: sidDe(sessao) } : {}),
  });
  const corpo = `Frente ${frente.id} (${frente.nome}) aberta por @${login}${paraQuem(para)}.\n\n${marcador}\n`;
  const tocados = [];
  const relidos = new Map();
  const desfazer = (motivoDoTicket, motivoDaRecusa, saida = SAIDA_SEM_REDE) => {
    // Só os relidos depois das escritas valem aqui (os lidos antes não mostram quem chegou no meio).
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

  // Corrida: decide a ordem do servidor dentro de cada ticket. Esta frente fica só se, em CADA ticket dela, o seu
  // marcador é o primeiro (menor número de comentário) entre as frentes que seguram o ticket; se perder em
  // qualquer um, desiste de todos. Quem escreve depois sempre vê quem escreveu antes: duas nunca ficam (podem as
  // duas desistir uma diante da outra, e tentam de novo).
  let vencedor = null;
  for (const n of abertos) {
    const primeira = frentesAtivas(relidos.get(n))[0];
    if (primeira && primeira.id !== frente.id) {
      vencedor = primeira;
      break;
    }
  }
  if (vencedor && vencedor.id !== frente.id) {
    const r = desistir({ tickets: abertos, frente, login, sessao, rotulo, dirEstado, motivo: `a frente ${vencedor.id} reservou antes`, lidos: relidos }, o);
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
// Corpo do comentário de marcação: `texto` + marcador do `tipo` (o estado vem do tipo).
export function corpoDaMarcacao({ frente, tipo, texto, login, sessao }) {
  const estado = ESTADO_DO_TIPO[tipo] ?? 'ativa';
  return `${texto}\n\n${montarMarcador(tipo, camposCompletos(frente, estado, login, sessao))}\n`;
}

// `soNaFila`: não fala com o GitHub; só põe as operações na fila, na ordem (para quem está sob a trava `frentes`
// e manda a fila depois de soltá-la). Devolve também o `corpo` e os `args` da edição, para achá-los na fila.
export function marcarTickets({ frente, tipo, texto, login, sessao, rotulo, dirEstado, reatribuir = false, soNaFila = false }, o = {}) {
  const corpo = corpoDaMarcacao({ frente, tipo, texto, login, sessao });
  const evento = { sessao, frente: frente.nome };
  const r = { comentariosNaFila: [], comentariosPerdidos: [], edicoesNaFila: [], edicoesPerdidas: [] };
  const comentarUm = n => (soNaFila
    ? (enfileirar(dirEstado, { tipo: 'comentario', ticket: n, corpo }), NA_FILA)
    : comentarOuEnfileirar(dirEstado, n, corpo, { ...o, evento }));
  const editarUm = (n, args) => (soNaFila
    ? (enfileirar(dirEstado, { tipo: 'edicao', ticket: n, args }), NA_FILA)
    : editarOuEnfileirar(dirEstado, n, args, { ...o, evento }));
  let logins = [...(frente.reserva?.logins ?? [])];
  for (const n of frente.tickets ?? []) anotar(comentarUm(n), n, r.comentariosNaFila, r.comentariosPerdidos);
  let args = null;
  if (reatribuir && !logins.includes(login)) {
    args = ['--add-assignee', login, '--add-label', rotulo];
    for (const n of frente.reserva?.tickets ?? frente.tickets ?? []) anotar(editarUm(n, args), n, r.edicoesNaFila, r.edicoesPerdidas);
    logins = [...logins, login];
  }
  return { logins, corpo, args, ...r };
}

// Avisos do que a marcação dos tickets deixou na fila (os perdidos já foram avisados com o comando à mão).
export function avisarDaMarcacao(r, avisar) {
  for (const n of r.comentariosNaFila) avisar(`Aviso: não consegui comentar no ticket #${n}; o comentário ficou na fila; sai no próximo comando com rede.\n`);
  for (const n of r.edicoesNaFila) avisar(`Aviso: não consegui pôr o responsável no ticket #${n}; a edição ficou na fila; sai no próximo comando com rede.\n`);
}

// Fechamento: comentário com o resumo e marcador `fechamento` (livre); tira responsáveis e rótulo da reserva.
// Os responsáveis a tirar de cada ticket: os da reserva local e os que os marcadores do ticket mostram para esta
// frente (relido antes de comentar: quem a retomou em outra máquina e passou de volta), menos os logins que outra
// frente do ticket segura. Sem releitura, só os da reserva local. `pular`: tickets que já têm o comentário de
// fechamento (de um close que parou no meio); neles só se repete a edição.
export function liberarTickets({ frente, resumo, login, rotulo, dirEstado, sessao = null, pular = [] }, o = {}) {
  const daReserva = frente.reserva?.logins ?? [];
  const porTicket = new Map();
  for (const n of frente.reserva?.tickets ?? []) {
    const lido = lerTicket(n, o);
    if (!lido.ok) continue;
    const doTicket = situacaoDaFrente(lido.ticket.marcadores.filter(m => m.campos.id === frente.id)).logins;
    const outras = frentesAtivas(lido.ticket).filter(f => f.id !== frente.id);
    const deOutras = new Set(outras.map(f => f.login));
    porTicket.set(n, {
      logins: [...new Set([...daReserva, ...doTicket])].filter(l => !deOutras.has(l)),
      rotulo: outras.length === 0,
    });
  }
  // Sem releitura: como antes, os da reserva local e o rótulo.
  const doTicket = n => porTicket.get(n) ?? { logins: daReserva, rotulo: true };
  const marcador = montarMarcador('fechamento', camposDaFrente(frente, 'livre', login, sessao));
  const corpo = `Frente ${frente.id} (${frente.nome}) fechada.\n\n${resumo}\n\n${marcador}\n`;
  const evento = { sessao, frente: frente.nome };
  const r = { comentariosNaFila: [], comentariosPerdidos: [], edicoesNaFila: [], edicoesPerdidas: [] };
  for (const n of frente.tickets ?? []) {
    if (pular.includes(n)) continue;
    anotar(comentarOuEnfileirar(dirEstado, n, corpo, { ...o, evento }), n, r.comentariosNaFila, r.comentariosPerdidos);
  }
  if (frente.reserva) {
    for (const n of frente.reserva.tickets ?? []) {
      const { logins, rotulo: tiraRotulo } = doTicket(n);
      const args = [...logins.flatMap(l => ['--remove-assignee', l]), ...(tiraRotulo ? ['--remove-label', rotulo] : [])];
      if (!args.length) continue;
      anotar(editarOuEnfileirar(dirEstado, n, args, { ...o, evento }), n, r.edicoesNaFila, r.edicoesPerdidas);
    }
  }
  return r;
}

// Tickets da frente que já têm o comentário de fechamento dela (de um close que parou no meio do comentário): o
// último marcador do id no ticket, relido no servidor, é `fechamento`, ou o comentário espera na fila desta máquina.
// Ticket que não existe mais não recebe comentário: conta como feito. Devolve {ok: true, feitos} ou {ok: false, motivo}.
export function ticketsJaFechados({ frente, dirEstado }, o = {}) {
  const doFechamento = op => op.tipo === 'comentario' && lerMarcadores(op.corpo).some(m => m.tipo === 'fechamento' && m.campos.id === frente.id);
  const feitos = [];
  for (const n of frente.tickets ?? []) {
    let naFila = false;
    try { naFila = pendentesDoTicket(dirEstado, n).some(doFechamento); } catch { naFila = false; }
    if (naFila) { feitos.push(n); continue; }
    const r = lerTicket(n, o);
    if (!r.ok && r.naoExiste) { feitos.push(n); continue; }
    if (!r.ok) return { ok: false, motivo: `#${n}: ${r.motivo}` };
    if (r.ticket.marcadores.filter(m => m.campos.id === frente.id).at(-1)?.tipo === 'fechamento') feitos.push(n);
  }
  return { ok: true, feitos };
}

// Desfaz uma reserva já feita (o open que reservou e depois não criou o worktree). Devolve o texto do que fez.
export function desfazerReserva({ frente, login, sessao, rotulo, dirEstado, motivo }, o = {}) {
  return comoDesfez(desistir({ tickets: frente.reserva?.tickets ?? [], frente, login, sessao, rotulo, dirEstado, motivo }, o));
}

// `ah close` de um registro `abrindo` (open que parou no meio): desiste só nos tickets cujo marcador ativo é desta
// frente e tira os responsáveis que a reserva pôs (`frente.reserva.logins`), não só o login de quem fecha.
// Devolve o texto do que fez, os tickets desfeitos, os que não consegui ler e os responsáveis que ficaram.
export function desfazerAbertura({ frente, login, sessao, rotulo, dirEstado }, o = {}) {
  const lidos = new Map();
  const naoLidos = [];
  for (const n of frente.reserva?.tickets ?? []) {
    const r = lerTicket(n, o);
    if (!r.ok) naoLidos.push(n);
    else if (frentesAtivas(r.ticket).some(f => f.id === frente.id)) lidos.set(n, r.ticket);
  }
  const logins = frente.reserva?.logins?.length ? frente.reserva.logins : [login];
  const r = desistir({ tickets: [...lidos.keys()], frente, login, logins, sessao, rotulo, dirEstado, motivo: 'a abertura foi desfeita', lidos }, o);
  return { texto: lidos.size ? comoDesfez(r) : null, tickets: [...lidos.keys()], naoLidos, ficaram: r.ficaram };
}

// ---- Passagem de bastão vista de outra máquina ----

const estadoDo = m => m.campos.estado ?? ESTADO_DO_TIPO[m.tipo] ?? 'ativa';
const numerosDe = texto => String(texto ?? '').split(',').map(s => s.trim()).filter(s => /^[1-9]\d{0,8}$/.test(s)).map(Number);
const loginDo = m => m.campos.login ?? m.autor;

// Situação de uma frente pelos seus marcadores (de todos os tickets, na ordem do servidor). Quem segura é o
// primeiro marcador ativo depois do último que solta (`livre`) ou passa adiante (`passada`); uma `tomada` depois
// dele troca quem segura; outra `retomada` no mesmo trecho perdeu a corrida e não conta. `logins` são os que
// seguraram desde o último `livre` (quem a reserva pôs de responsável).
function situacaoDaFrente(marcadores) {
  let segura = null;
  let logins = [];
  for (const m of marcadores) {
    const estado = estadoDo(m);
    if (estado === 'livre') {
      segura = null;
      logins = [];
    } else if (estado === 'passada') {
      segura = null;
    } else if (!segura || m.tipo === 'tomada') {
      segura = m;
      if (!logins.includes(loginDo(m))) logins.push(loginDo(m));
    }
  }
  const ultimo = marcadores.at(-1) ?? null;
  return { estado: ultimo ? estadoDo(ultimo) : null, ultimo, segura, logins };
}

// Marcadores de cada ticket: `{ok, porTicket: [{numero, marcadores}]}` ou `{ok: false, motivo, naoAchei?}`.
function lerOsTickets(tickets, o) {
  const porTicket = [];
  for (const n of tickets) {
    const r = lerTicket(n, o);
    if (!r.ok) return r.naoExiste ? { ok: false, naoAchei: n, motivo: `não achei o ticket #${n}` } : { ok: false, motivo: `#${n}: ${r.motivo}` };
    porTicket.push({ numero: n, marcadores: r.ticket.marcadores });
  }
  return { ok: true, porTicket };
}

// Sem tickets dados: os abertos com o rótulo de reserva onde algum marcador tem o `nome` (a lista do gh só aponta;
// a decisão vem da leitura de cada um por lerTicket).
function ticketsComONome({ nome, rotulo }, o) {
  const r = gh(['issue', 'list', '--label', rotulo, '--state', 'open', '--json', 'number,comments', '--limit', '200'], o);
  if (r.codigo !== 0) return { ok: false, motivo: motivoCurto(r) };
  let lista;
  try {
    lista = JSON.parse(r.saida);
  } catch {
    return { ok: false, motivo: 'resposta do gh ilegível' };
  }
  if (!Array.isArray(lista)) return { ok: false, motivo: 'resposta do gh ilegível' };
  const numeros = lista.filter(i => marcadoresDosComentarios(i?.comments).some(m => m.campos.nome === nome))
    .map(i => Number(i?.number)).filter(n => Number.isInteger(n) && n > 0);
  return { ok: true, tickets: [...new Set(numeros)].sort((a, b) => a - b) };
}

// Marcadores de uma frente (por id) em todos os tickets lidos, na ordem do servidor, com o ticket de cada um.
const marcadoresDoId = (porTicket, id) => porTicket
  .flatMap(t => t.marcadores.filter(m => m.campos.id === id).map(m => ({ ...m, ticket: t.numero })))
  .sort((a, b) => a.ordem - b.ordem);

// Os dados da frente que um marcador completo carrega (passagem, retomada, tomada).
const dadosDoMarcador = (m, id, nome, tickets) => ({
  id, nome, ramo: m.campos.ramo ?? null,
  tickets: numerosDe(m.campos.tickets).length ? numerosDe(m.campos.tickets) : tickets,
  plano: m.campos.plano ?? null, abertaPor: m.campos.abertaPor ?? null, abertaEm: m.campos.abertaEm ?? null,
});

// Procura a passagem da frente `nome` nos `tickets` dados ou, sem eles, nos tickets abertos com o rótulo de
// reserva (relidos um a um). Vale o último marcador com esse nome: `passagem` devolve a passagem; ativo devolve
// quem a segura (`ativa`: id, login, sessão curta, número do comentário, os dados da frente e os logins).
// Falha: `{ok: false, motivo}`, com `naoAchei: <n>` quando o ticket não existe.
export function acharPassagem({ nome, tickets = [], rotulo }, o = {}) {
  let onde = tickets;
  if (!onde.length) {
    const l = ticketsComONome({ nome, rotulo }, o);
    if (!l.ok) return { ok: false, motivo: l.motivo };
    onde = l.tickets;
  }
  const lidos = lerOsTickets(onde, o);
  if (!lidos.ok) return lidos;
  const doNome = lidos.porTicket.flatMap(t => t.marcadores.filter(m => m.campos.nome === nome && m.campos.id))
    .sort((a, b) => a.ordem - b.ordem);
  const ultimo = doNome.at(-1);
  if (!ultimo) return { ok: true, passagem: null };
  const id = ultimo.campos.id;
  const doId = marcadoresDoId(lidos.porTicket, id);
  const s = situacaoDaFrente(doId);
  const ondeApareceu = tipo => [...new Set(doId.filter(m => m.tipo === tipo).map(m => m.ticket))].sort((a, b) => a - b);
  if (s.estado === 'ativa') {
    const m = s.segura ?? s.ultimo;
    return {
      ok: true, passagem: null,
      ativa: { id, login: loginDo(m), sessao: m.campos.sessao ?? null, sid: m.campos.sid ?? null, numero: m.ordem, frente: dadosDoMarcador(m, id, nome, ondeApareceu(m.tipo)), logins: s.logins },
    };
  }
  if (s.estado !== 'passada') return { ok: true, passagem: null };
  return { ok: true, passagem: { ...dadosDoMarcador(s.ultimo, id, nome, ondeApareceu('passagem')), logins: s.logins, login: loginDo(s.ultimo) } };
}

// Sessões desta máquina que podem ter deixado a frente ativa nos tickets sem passagem (para a situação 'daqui'):
// `extras` (a dona morta no takeover), as que a frente guarda (`passadaPor`, `passadaDe` e `sessoesAnteriores`,
// as substituídas por herança) e as registradas aqui cuja frente em foco é esta (viva ou encerrada com esse foco).
// Sessão daqui de outra frente, viva ou encerrada, não conta.
export function sessoesDaquiDaFrente(dirEstado, frente, extras = []) {
  const daqui = listarSessoes(dirEstado).sessoes
    .filter(s => (s.frente?.nome ?? s.frente) === frente.nome).map(s => s.id);
  const daFrente = [frente.passadaPor, frente.passadaDe, ...(Array.isArray(frente.sessoesAnteriores) ? frente.sessoesAnteriores : [])];
  return [...new Set([...extras, ...daFrente].filter(x => typeof x === 'string' && x).concat(daqui))];
}

// Quem segura a frente (o `ativa` de acharPassagem) é esta sessão? Pelo `sid`; sem ele, login e sessão curta.
export const ativaDaSessao = (ativa, { login, sessao }) => Boolean(ativa)
  && marcadorDaSessao({ campos: { sid: ativa.sid ?? undefined, login: ativa.login, sessao: ativa.sessao } }, { login, sessao });

// Antes de retomar ou fechar uma frente `passada` local com tickets: quem está com ela no GitHub. Devolve
// `{situacao}`: 'passada' (a passagem dela é a última),
// 'propria' (esta sessão a segura: retomada que parou no meio; `proprios` = número do comentário), 'outra'
// (`login`, `id`: ativa com outro), 'solta' (fechada ou sem marcador dela), 'sem-rede' (`motivo`) ou
// 'nao-achei' (`ticket`).
// 'daqui' (quem a segura é outra sessão desta máquina, `sessoesDaqui`: a frente ficou passada aqui sem passagem
// nos tickets, como na continuação sem vínculo; a retomada vai como `tomada`).
// A fila desta máquina para os tickets da frente é conferida por quem chama, antes (a releitura não a vê).
export function quemTemAFrente({ frente, login, sessao, rotulo, sessoesDaqui = [] }, o = {}) {
  const a = acharPassagem({ nome: frente.nome, tickets: frente.tickets ?? [], rotulo }, o);
  if (!a.ok) return a.naoAchei ? { situacao: 'nao-achei', ticket: a.naoAchei } : { situacao: 'sem-rede', motivo: a.motivo };
  if (a.passagem) return a.passagem.id === frente.id ? { situacao: 'passada', passagem: a.passagem } : { situacao: 'outra', login: a.passagem.login, id: a.passagem.id, passada: true };
  if (a.ativa) {
    if (a.ativa.id === frente.id && ativaDaSessao(a.ativa, { login, sessao })) return { situacao: 'propria', proprios: [a.ativa.numero] };
    // Só pelo `sid`: marcador antigo, sem ele, não casa pelos 8 caracteres neste caminho.
    if (a.ativa.id === frente.id && a.ativa.sid && sessoesDaqui.some(id => id && sidDe(id) === a.ativa.sid)) return { situacao: 'daqui' };
    return { situacao: 'outra', login: a.ativa.login, id: a.ativa.id };
  }
  return { situacao: 'solta' };
}

// Retomada conferida no GitHub: comenta `retomada` em cada ticket da frente e se põe de responsável, direto (sem
// fila: sem confirmar a corrida não se retoma), relê e decide a corrida pela regra de situacaoDaFrente (a retomada
// de menor número fica). O próprio marcador se reconhece pelo número do comentário (o url que o gh devolve; os de
// uma retomada anterior desta sessão vêm em `proprios`); sem url, por login e sessão. Quem perde desfaz pela
// fila: comentário sem marcador (não muda o estado da frente) e sai de responsável. Quem falha sem perder relê:
// se ainda segura a frente, comenta de novo a `passagem` (com os dados da frente) para ela voltar a passada.
// A retomada também perde quando, relido no servidor, o estado da frente antes do primeiro marcador dela é livre
// (um fechamento chegou entre a conferência e o comentário): então desfaz com `desistencia`, para o ticket voltar a
// livre, e tira o responsável e o rótulo que ela pôs.
// Quem entra de responsável (e com o rótulo) decide-se pelos tickets relidos, não pela reserva local.
// Devolve {ok: true, logins} | {ok: false, vencedor?: {login}, fechada?: true, motivo, como}.
// `tipo`: 'retomada' ou 'tomada' (quando quem segura a frente nos tickets é outra sessão desta máquina).
export function confirmarRetomada({ frente, login, sessao, para = null, rotulo, dirEstado, proprios = [], tipo = 'retomada', esperaMs = ESPERA_DA_RELEITURA_MS }, o = {}) {
  const tickets = frente.tickets ?? [];
  const reservaTickets = frente.reserva?.tickets ?? tickets;
  const antes = frente.reserva?.logins ?? [];
  // O que cada ticket da reserva mostra agora: falta este login de responsável, ou o rótulo?
  const faltam = [];
  const semMim = new Set();
  for (const n of reservaTickets) {
    const r = lerTicket(n, o);
    if (!r.ok) return { ok: false, motivo: `não consegui ler #${n} para retomar (${r.motivo})`, como: 'nada foi feito nos tickets' };
    if (!r.ticket.responsaveis.includes(login)) semMim.add(n);
    if (!r.ticket.responsaveis.includes(login) || !r.ticket.rotulos.includes(rotulo)) faltam.push(n);
  }
  const corpo = corpoDaMarcacao({ frente, tipo, texto: `Frente ${frente.id} (${frente.nome}) ${tipo === 'tomada' ? 'tomada' : 'retomada'} por @${login}${paraQuem(para)}.`, login, sessao });
  const meus = new Set(proprios);
  let semUrl = false;
  const comentados = [];
  const editados = [];
  // Meu: o número do comentário; senão o `sid` (desta sessão, inclusive de uma retomada anterior); marcador
  // antigo sem `sid`, só sem url, por login e sessão curta.
  const eMeu = m => Boolean(m) && (m.tipo === 'retomada' || m.tipo === 'tomada')
    && (meus.has(m.ordem) || (m.campos.sid ? m.campos.sid === sidDe(sessao) : semUrl && marcadorDaSessao(m, { login, sessao })));
  // Situação relida, se algum marcador desta retomada já aparece e o estado da frente antes do primeiro deles.
  // `emCadaTicket`: o marcador que segura a frente em cada ticket é desta retomada; `livreDepois`: há fechamento ou
  // desistência da frente depois do primeiro marcador desta retomada (em qualquer ticket).
  const reler = () => {
    const lidos = lerOsTickets(tickets, o);
    if (!lidos.ok) return null;
    const ms = marcadoresDoId(lidos.porTicket, frente.id);
    const primeiro = ms.findIndex(eMeu);
    const emCadaTicket = lidos.porTicket.every(t => eMeu(situacaoDaFrente(t.marcadores.filter(m => m.campos.id === frente.id)).segura));
    const livreDepois = primeiro >= 0 && ms.slice(primeiro + 1).some(m => estadoDo(m) === 'livre');
    return {
      ...situacaoDaFrente(ms), visto: primeiro >= 0, emCadaTicket, livreDepois,
      antes: primeiro >= 0 ? situacaoDaFrente(ms.slice(0, primeiro)).estado : null,
    };
  };
  // A frente foi fechada antes desta retomada: `desistencia` (volta a livre) e tira o responsável e o rótulo
  // que ela pôs (o rótulo só se nenhuma outra frente segura o ticket).
  const desfazerFechada = motivo => {
    const situacoes = [];
    const evento = { sessao, frente: frente.nome };
    const corpoLivre = corpoDaMarcacao({ frente, tipo: 'desistencia', texto: `Retomada da frente ${frente.id} (${frente.nome}) por @${login} desfeita: ${motivo}.`, login, sessao });
    for (const n of comentados) situacoes.push(comentarOuEnfileirar(dirEstado, n, corpoLivre, { ...o, evento }));
    for (const n of editados) {
      // Como no `desistir`: sem releitura não se tira nada; outra frente do mesmo login segura o responsável, e
      // qualquer outra frente segura o rótulo.
      const lido = lerTicket(n, o);
      if (!lido.ok) continue;
      const outras = frentesAtivas(lido.ticket).filter(f => f.id !== frente.id);
      const tiraLogin = semMim.has(n) && !outras.some(f => f.login === login);
      const args = [...(tiraLogin ? ['--remove-assignee', login] : []), ...(outras.length ? [] : ['--remove-label', rotulo])];
      if (args.length) situacoes.push(editarOuEnfileirar(dirEstado, n, args, { ...o, evento }));
    }
    return comoDesfez(contar(situacoes));
  };
  const desfazer = (motivo, vencedor = null) => {
    const situacoes = [];
    const evento = { sessao, frente: frente.nome };
    // Sem ter perdido: se a frente ainda está com esta retomada, a passagem volta a ser a última palavra.
    // Onde comentar: onde esta retomada comentou; se nada saiu agora e há uma anterior desta sessão, em todos.
    const alvos = comentados.length ? comentados : proprios.length ? tickets : [];
    const devolver = !vencedor && alvos.length > 0 && eMeu(reler()?.segura);
    const texto = `Retomada da frente ${frente.id} (${frente.nome}) por @${login} desfeita: ${motivo}.`;
    const corpoDesfeito = devolver ? corpoDaMarcacao({ frente, tipo: 'passagem', texto, login, sessao }) : `${texto}\n`;
    for (const n of alvos) situacoes.push(comentarOuEnfileirar(dirEstado, n, corpoDesfeito, { ...o, evento }));
    // Sai de responsável só se entrou agora e quem ficou com a frente não é o mesmo login.
    if (vencedor?.login !== login) {
      for (const n of editados.filter(x => semMim.has(x))) situacoes.push(editarOuEnfileirar(dirEstado, n, ['--remove-assignee', login], { ...o, evento }));
    }
    return comoDesfez(contar(situacoes));
  };
  if (faltam.length && !criarRotulo(rotulo, o)) {
    return { ok: false, motivo: `não consegui falar com o GitHub para retomar (o rótulo ${rotulo} não foi criado)`, como: 'nada foi feito nos tickets' };
  }
  for (const n of tickets) {
    const url = comentar(n, corpo, o);
    if (!url) return { ok: false, motivo: `não consegui comentar a retomada em #${n}`, como: desfazer('o GitHub falhou no meio da retomada') };
    comentados.push(n);
    const numero = numeroDoComentario(url);
    if (numero === null) semUrl = true;
    else meus.add(numero);
  }
  for (const n of faltam) {
    if (!editarTicket(n, ['--add-assignee', login, '--add-label', rotulo], o)) {
      return { ok: false, motivo: `não consegui pôr @${login} de responsável em #${n}`, como: desfazer('o GitHub falhou no meio da retomada') };
    }
    editados.push(n);
  }
  let s = null;
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    if (tentativa) esperar(esperaMs);
    const lida = reler();
    // O próprio marcador ainda não aparece: atraso do servidor; relê uma vez.
    if (!lida || !lida.visto) continue;
    s = lida;
    break;
  }
  if (!s) return { ok: false, motivo: 'não consegui confirmar a retomada (o comentário não apareceu na releitura)', como: desfazer('não consegui confirmar a retomada') };
  if ((s.antes !== 'passada' && s.antes !== 'ativa') || s.livreDepois) {
    const motivo = `a frente ${frente.id} foi fechada ${s.livreDepois ? 'durante' : 'antes de'} esta retomada`;
    return { ok: false, fechada: true, motivo, como: desfazerFechada(motivo) };
  }
  if (!eMeu(s.segura) || !s.emCadaTicket) {
    const outro = s.segura && !eMeu(s.segura) ? s.segura : null;
    if (!outro) {
      const motivo = 'a frente não ficou com esta retomada em todos os tickets';
      return { ok: false, motivo, como: desfazer(motivo) };
    }
    const quem = { login: loginDo(outro) };
    const motivo = `@${quem.login} retomou antes`;
    return { ok: false, vencedor: quem, motivo, como: desfazer(motivo, quem) };
  }
  return { ok: true, logins: [...new Set([...antes, login])] };
}
