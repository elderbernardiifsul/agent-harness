// Dependências entre tickets (desenho, seção 11, "Ordem e dependências"; decisões 16 a 19 da fatia 5b). O harness
// só lê: a relação de bloqueio mora no GitHub. Fonte principal, a API REST de dependências
// (docs.github.com/en/rest/issues/issue-dependencies, conferida em 13/11/2026); reserva, a linha
// `Bloqueado por: #N[, #M]` no corpo da issue, que vale sempre. Toda leitura boa vai para `deps.json` no estado.
import fs from 'node:fs';
import path from 'node:path';
import { ErroDeUso } from './caminhos.mjs';
import { gravarJson } from './estado.mjs';
import { listarFrentesTolerante } from './frente.mjs';
import { gh, repoAtual } from './github.mjs';

export const USO_DEPS = 'ah deps [ticket] [--json]';
const ESQUEMA = 1;
const LIMITE_LISTA = 200; // issues abertas lidas, no máximo (decisão 17)
const POR_PAGINA = 100; // máximo da API
const PROFUNDIDADE = 10; // cascata na leitura e na árvore

export const arquivoDoCache = dirEstado => path.join(dirEstado, 'deps.json');

// Números da linha `Bloqueado por: #3, #7` (sem diferenciar maiúsculas; uma ou mais linhas), sem repetição.
export function bloqueiosDoCorpo(corpo) {
  if (typeof corpo !== 'string') return [];
  const achados = [];
  for (const m of corpo.matchAll(/^[ \t]*Bloqueado por:[ \t]*(.+)$/gim)) {
    for (const n of m[1].matchAll(/#(\d+)/g)) achados.push(Number(n[1]));
  }
  return [...new Set(achados)];
}

// --- Leitura pelo gh ---

const motivoDe = r => ((r.erro || r.saida).trim().split('\n')[0] ?? '').slice(0, 200) || `o gh saiu com código ${r.codigo}`;

function api(caminho, o) {
  const r = gh(['api', caminho], o);
  if (r.codigo === 0) {
    try { return { ok: true, dados: JSON.parse(r.saida) }; } catch { return { ok: false, motivo: 'resposta da API não é JSON' }; }
  }
  // 404/410: o recurso não existe (issue ausente, ou instância sem a API de dependências).
  return { ok: false, naoExiste: /HTTP 40[4]|HTTP 410/.test(r.erro), motivo: motivoDe(r) };
}

// Páginas de 100 até `maximo` itens. `completa`: a última página veio curta (não há mais).
function paginas(caminho, o, maximo) {
  const itens = [];
  for (let pagina = 1; itens.length < maximo; pagina++) {
    const r = api(`${caminho}${caminho.includes('?') ? '&' : '?'}per_page=${POR_PAGINA}&page=${pagina}`, o);
    if (!r.ok) return r;
    if (!Array.isArray(r.dados)) return { ok: false, motivo: 'resposta da API não é uma lista' };
    itens.push(...r.dados);
    if (r.dados.length < POR_PAGINA) return { ok: true, dados: itens.slice(0, maximo), completa: true };
  }
  return { ok: true, dados: itens.slice(0, maximo), completa: false };
}

const estadoDe = s => (s === 'open' ? 'aberta' : s === 'closed' ? 'fechada' : null);
const repoDaUrl = u => (typeof u === 'string' ? u.match(/\/repos\/([^/]+\/[^/]+)\/?$/)?.[1] ?? null : null);

// Referência a uma issue que bloqueia ou é bloqueada: `repo` null quando é deste repositório.
function refDaApi(item, repo) {
  const outro = repoDaUrl(item.repository_url);
  return { numero: item.number, repo: outro && outro !== repo ? outro : null, titulo: item.title ?? null, estado: estadoDe(item.state) };
}

const temBloqueio = item => (item.issue_dependencies_summary?.total_blocked_by ?? 1) > 0;

// Bloqueios de uma issue: os da API (quando ela responde) somados aos do corpo. `estadoDoCorpo(n)` dá o estado
// de quem só aparece no corpo. `ctx.api` vira false no primeiro 404 da API de dependências.
function bloqueiosDe(item, repo, o, ctx, estadoDoCorpo) {
  let daApi = [];
  if (ctx.api && temBloqueio(item)) {
    const r = paginas(`repos/${repo}/issues/${item.number}/dependencies/blocked_by`, o, LIMITE_LISTA);
    if (r.ok) daApi = r.dados.map(i => refDaApi(i, repo));
    else if (r.naoExiste) ctx.api = false;
    else ctx.avisos.push(`#${item.number}: a API de dependências falhou (${r.motivo}); vale só o corpo`);
  }
  const doCorpo = bloqueiosDoCorpo(item.body)
    .filter(n => !daApi.some(b => b.repo === null && b.numero === n))
    .map(n => ({ numero: n, repo: null, titulo: null, estado: estadoDoCorpo(n) }));
  return [...daApi, ...doCorpo];
}

const registro = (item, bloqueadoPor) => ({ numero: item.number, titulo: item.title ?? '', estado: estadoDe(item.state) ?? 'aberta', bloqueadoPor });

// Todas as abertas (até 200): {ok, issues, completa, fonte, avisos} ou {ok: false, motivo}.
function lerAbertas(repo, o) {
  const lista = paginas(`repos/${repo}/issues?state=open`, o, LIMITE_LISTA);
  if (!lista.ok) return lista;
  // A API de issues devolve também os PRs (chave pull_request).
  const abertas = lista.dados.filter(i => i && !i.pull_request && Number.isInteger(i.number));
  const numeros = new Set(abertas.map(i => i.number));
  // Quem só está no corpo: aberta se está na lista; fora de uma lista completa, fechada; senão, não se sabe.
  const estadoDoCorpo = n => (numeros.has(n) ? 'aberta' : lista.completa ? 'fechada' : null);
  const ctx = { api: true, avisos: [] };
  const issues = {};
  for (const item of abertas) issues[item.number] = registro(item, bloqueiosDe(item, repo, o, ctx, estadoDoCorpo));
  // Títulos de quem só veio pelo corpo.
  for (const i of Object.values(issues)) for (const b of i.bloqueadoPor) if (b.repo === null && b.titulo == null) b.titulo = issues[b.numero]?.titulo ?? null;
  return { ok: true, issues, completa: lista.completa, fonte: ctx.api ? 'api' : 'corpo', avisos: ctx.avisos };
}

// Uma issue, o que a bloqueia em cascata (só as deste repositório ainda abertas) e o que ela bloqueia.
function lerUma(n, repo, o) {
  const ctx = { api: true, avisos: [] };
  const issues = {};
  const visitar = (numero, nivel) => {
    if (issues[numero] || nivel > PROFUNDIDADE) return { ok: true };
    const r = api(`repos/${repo}/issues/${numero}`, o);
    if (!r.ok) return r;
    // Estado de quem só está no corpo: lido na visita a ela (abaixo); até lá, não se sabe.
    issues[numero] = registro(r.dados, bloqueiosDe(r.dados, repo, o, ctx, () => null));
    for (const b of issues[numero].bloqueadoPor) {
      if (b.repo !== null || b.estado === 'fechada') continue;
      const v = visitar(b.numero, nivel + 1);
      if (v.ok && issues[b.numero]) Object.assign(b, { titulo: issues[b.numero].titulo, estado: issues[b.numero].estado });
    }
    return { ok: true };
  };
  const primeira = visitar(n, 0);
  if (!primeira.ok) return primeira;
  let bloqueia = null;
  if (ctx.api) {
    const r = paginas(`repos/${repo}/issues/${n}/dependencies/blocking`, o, LIMITE_LISTA);
    if (r.ok) bloqueia = r.dados.map(i => refDaApi(i, repo));
    else if (r.naoExiste) ctx.api = false;
  }
  issues[n].bloqueia = bloqueia;
  return { ok: true, issues, fonte: ctx.api ? 'api' : 'corpo', avisos: ctx.avisos };
}

// --- Cache ---

// {cache} legível, {cache: null} ausente, {erro} ilegível.
export function lerCache(dirEstado) {
  let texto;
  try {
    texto = fs.readFileSync(arquivoDoCache(dirEstado), 'utf8');
  } catch (e) {
    return e.code === 'ENOENT' ? { cache: null } : { erro: e.message };
  }
  try {
    const c = JSON.parse(texto);
    if (c?.esquema !== ESQUEMA || typeof c.issues !== 'object' || c.issues === null || !Date.parse(c.lidoEm)) return { erro: 'formato desconhecido' };
    return { cache: c };
  } catch {
    return { erro: 'não é JSON válido' };
  }
}

// Cache gravado antes do campo `parcial`: o de `ah deps <n>` sem lista guardada ficava com `completa: null`.
const cacheParcial = c => c.parcial ?? c.completa == null;

// Data e hora (AAAA-MM-DD HH:MM) no fuso da configuração.
export function quando(iso, fuso) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(iso)).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

// --- Montagem ---

const pendente = b => b.estado !== 'fechada'; // aberta ou não se sabe
const rotulo = b => `${b.repo ? `${b.repo}#` : '#'}${b.numero}${b.titulo ? ` ${b.titulo}` : ''}`;

// Árvore do que bloqueia `numero`, pelo mapa `issues`; corta ciclo e profundidade. `vistas` guarda as issues cuja
// subárvore já foi montada (na mesma árvore ou nas de antes, com o mesmo `vistas`): a repetição sai com
// `verAcima` e sem filhos, para um grafo denso não multiplicar os caminhos.
function arvore(issues, numero, frentes, caminho = new Set(), vistas = new Set()) {
  const i = issues[numero];
  if (!i || caminho.has(numero) || caminho.size >= PROFUNDIDADE) return [];
  const dentro = new Set([...caminho, numero]);
  return i.bloqueadoPor.map(b => {
    const daqui = b.repo === null ? issues[b.numero] : null;
    const no = { ...b, titulo: b.titulo ?? daqui?.titulo ?? null, estado: daqui?.estado ?? b.estado, frente: b.repo === null ? frentes.get(b.numero) ?? null : null };
    const ciclo = dentro.has(b.numero) && b.repo === null;
    if (b.repo !== null || !pendente(no) || ciclo) return { ...no, ciclo, bloqueadaPor: [] };
    if (vistas.has(b.numero)) return { ...no, ciclo, verAcima: true, bloqueadaPor: [] };
    // Só conta como vista a que vai ser montada aqui (a cortada pela profundidade pode aparecer inteira depois).
    if (dentro.size < PROFUNDIDADE) vistas.add(b.numero);
    return { ...no, ciclo, bloqueadaPor: arvore(issues, b.numero, frentes, dentro, vistas) };
  });
}

function textoDaArvore(nos, recuo, prefixo = '') {
  return nos.flatMap(n => [
    `${' '.repeat(recuo)}${prefixo}${rotulo(n)} (${n.estado ?? 'estado desconhecido'}${n.frente ? `, frente ${n.frente}` : ''}${n.ciclo ? ', ciclo' : ''}${n.verAcima ? ', ver acima' : ''})`,
    ...textoDaArvore(n.bloqueadaPor, recuo + 2, prefixo),
  ]);
}

// Ticket → id da frente que o tem (qualquer frente no estado: ativa, passada ou abrindo).
function frentesPorTicket(dirEstado) {
  const mapa = new Map();
  for (const f of listarFrentesTolerante(dirEstado).frentes) for (const t of f.tickets ?? []) if (!mapa.has(Number(t))) mapa.set(Number(t), f.id);
  return mapa;
}

const ordem = (a, b) => b - a; // mais nova primeiro, como a lista do GitHub

function cabecalho(dados, fuso) {
  return dados.deCache
    ? `Bloqueios de ${dados.repo} (leitura guardada de ${quando(dados.lidoEm, fuso)}; sem acesso ao GitHub agora)`
    : `Bloqueios de ${dados.repo} (lidos agora)`;
}
const FONTE_CORPO = 'Fonte: a linha "Bloqueado por:" do corpo das issues (a API de dependências do GitHub não respondeu)';

function mostrarTudo(dados, frentes, amb) {
  const issues = dados.issues;
  const abertas = Object.values(issues).filter(i => i.estado === 'aberta').map(i => i.numero).sort(ordem);
  const vistas = new Set(); // uma subárvore por issue na saída inteira
  const lista = abertas.map(n => {
    const bloqueadaPor = arvore(issues, n, frentes, new Set(), vistas);
    return { numero: n, titulo: issues[n].titulo, estado: issues[n].estado, frente: frentes.get(n) ?? null, pendente: bloqueadaPor.some(pendente), bloqueadaPor };
  });
  const livres = lista.filter(i => !i.pendente && !i.frente);
  const comFrente = lista.filter(i => !i.pendente && i.frente);
  if (dados.json) {
    amb.escrever(`${JSON.stringify({ repo: dados.repo, lidoEm: dados.lidoEm, deCache: dados.deCache, fonte: dados.fonte, completa: dados.completa, parcial: dados.parcial, issues: lista, livres: livres.map(i => i.numero), avisos: dados.avisos })}\n`);
    return 0;
  }
  const linhas = [cabecalho(dados, amb.config.fuso)];
  if (dados.fonte === 'corpo') linhas.push(FONTE_CORPO);
  const bloqueadas = lista.filter(i => i.pendente);
  if (!bloqueadas.length) linhas.push('Nenhuma issue aberta com bloqueio pendente.');
  for (const i of bloqueadas) linhas.push(`#${i.numero} ${i.titulo}${i.frente ? ` (frente ${i.frente})` : ''}`, ...textoDaArvore(i.bloqueadaPor.filter(pendente), 2, 'bloqueada por '));
  linhas.push(`Livres para começar: ${livres.length ? livres.map(i => `#${i.numero} ${i.titulo}`).join('; ') : 'nenhuma'}`);
  if (comFrente.length) linhas.push(`Sem bloqueio, já com frente: ${comFrente.map(i => `#${i.numero} ${i.titulo} (${i.frente})`).join('; ')}`);
  if (dados.completa === false) linhas.push(`Aviso: li só as ${LIMITE_LISTA} issues abertas mais novas.`);
  if (dados.parcial) linhas.push(`Aviso: a leitura guardada veio só de ah deps <ticket> (${Object.keys(issues).length} issues), não da lista das abertas: as livres para começar podem ser outras. Com acesso ao GitHub, rode ah deps.`);
  for (const a of dados.avisos ?? []) linhas.push(`Aviso: ${a}`);
  amb.escrever(`${linhas.join('\n')}\n`);
  return 0;
}

function mostrarUma(n, dados, frentes, amb) {
  const issues = dados.issues;
  const i = issues[n];
  const bloqueadaPor = arvore(issues, n, frentes);
  // O que ela bloqueia: a API (quando leu) somada ao que a leitura guardada mostra (inclusive pelo corpo).
  const bloqueia = [...(i.bloqueia ?? [])];
  for (const outra of Object.values(issues)) {
    if (outra.numero === n || !outra.bloqueadoPor.some(b => b.repo === null && b.numero === n)) continue;
    if (!bloqueia.some(b => b.repo === null && b.numero === outra.numero)) bloqueia.push({ numero: outra.numero, repo: null, titulo: outra.titulo, estado: outra.estado });
  }
  const comFrente = bloqueia.map(b => ({ ...b, frente: b.repo === null ? frentes.get(b.numero) ?? null : null }));
  const ticket = { numero: n, titulo: i.titulo, estado: i.estado, frente: frentes.get(n) ?? null };
  if (dados.json) {
    amb.escrever(`${JSON.stringify({ repo: dados.repo, lidoEm: dados.lidoEm, deCache: dados.deCache, fonte: dados.fonte, ticket, bloqueadaPor, bloqueia: comFrente, avisos: dados.avisos })}\n`);
    return 0;
  }
  const linhas = [cabecalho(dados, amb.config.fuso)];
  if (dados.fonte === 'corpo') linhas.push(FONTE_CORPO);
  linhas.push(`#${n} ${i.titulo} (${i.estado}${ticket.frente ? `, frente ${ticket.frente}` : ''})`);
  linhas.push(...(bloqueadaPor.length ? ['Bloqueada por:', ...textoDaArvore(bloqueadaPor, 2)] : ['Bloqueada por: nada']));
  linhas.push(...(comFrente.length ? ['Bloqueia:', ...textoDaArvore(comFrente.map(b => ({ ...b, bloqueadaPor: [] })), 2)] : ['Bloqueia: nada']));
  for (const a of dados.avisos ?? []) linhas.push(`Aviso: ${a}`);
  amb.escrever(`${linhas.join('\n')}\n`);
  return 0;
}

// --- Comando ---

export function executarDeps(args, amb) {
  let json = false;
  let ticket = null;
  for (const arg of args) {
    if (arg === '--json') json = true;
    else if (arg.startsWith('-')) throw new ErroDeUso(`Opção desconhecida: ${arg.slice(0, 40)}\nPróximo passo: use ${USO_DEPS}`);
    else if (ticket !== null) throw new ErroDeUso(`Argumento a mais: ${arg.slice(0, 40)}\nPróximo passo: use ${USO_DEPS}`);
    else if (/^#?[1-9]\d{0,9}$/.test(arg)) ticket = Number(arg.replace('#', ''));
    else throw new ErroDeUso(`ticket inválido: ${arg.slice(0, 40)}\nPróximo passo: use o número da issue, como ah deps 12`);
  }
  const o = { cwd: amb.raiz, env: amb.env };
  const dirEstado = amb.dirEstado;
  const lido = lerCache(dirEstado);
  const repo = repoAtual(o);
  let leitura = repo ? (ticket === null ? lerAbertas(repo, o) : lerUma(ticket, repo, o)) : { ok: false, motivo: 'não consegui descobrir o repositório no GitHub' };
  if (!leitura.ok && leitura.naoExiste && ticket !== null) {
    throw new ErroDeUso(`não achei a issue #${ticket} em ${repo}\nPróximo passo: confira o número (gh issue view ${ticket})`);
  }
  let dados;
  if (leitura.ok) {
    const agora = new Date().toISOString();
    // A lista inteira troca o retrato; a leitura de uma issue soma ao que estava guardado.
    const anterior = ticket === null || !lido.cache || lido.cache.repo !== repo ? null : lido.cache;
    // Parcial: o retrato não veio da lista das abertas (só de `ah deps <n>`, sem lista guardada antes).
    const parcial = ticket === null ? false : !anterior || cacheParcial(anterior);
    const cache = { esquema: ESQUEMA, repo, lidoEm: agora, fonte: leitura.fonte, completa: leitura.completa ?? anterior?.completa ?? null, parcial, issues: { ...(anterior?.issues ?? {}), ...leitura.issues } };
    gravarJson(arquivoDoCache(dirEstado), cache);
    dados = { ...cache, deCache: false, avisos: leitura.avisos };
  } else {
    const proximo = 'rode ah deps de novo com acesso ao GitHub (confira com gh auth status)';
    if (lido.erro) throw new ErroDeUso(`sem acesso ao GitHub (${leitura.motivo}) e a leitura guardada (${arquivoDoCache(dirEstado)}) está ilegível: ${lido.erro}\nPróximo passo: apague o arquivo e ${proximo}`);
    if (!lido.cache) throw new ErroDeUso(`sem acesso ao GitHub e sem leitura guardada (${leitura.motivo})\nPróximo passo: ${proximo}`);
    if (ticket !== null && !lido.cache.issues[ticket]) throw new ErroDeUso(`sem acesso ao GitHub, e a leitura guardada não tem a issue #${ticket}\nPróximo passo: ${proximo}`);
    dados = { ...lido.cache, parcial: cacheParcial(lido.cache), deCache: true, avisos: [] };
  }
  dados.json = json;
  const frentes = frentesPorTicket(dirEstado);
  return ticket === null ? mostrarTudo(dados, frentes, amb) : mostrarUma(ticket, dados, frentes, amb);
}

// Para o `open` (decisão 19): linhas de aviso dos tickets bloqueados por outro aberto, só pela leitura guardada
// (sem rede). Sem cache, ou com cache ilegível, nada.
export function avisosDeBloqueio(dirEstado, tickets, fuso) {
  const { cache } = lerCache(dirEstado);
  if (!cache) return [];
  const linhas = [];
  for (const t of tickets ?? []) {
    const abertos = (cache.issues[t]?.bloqueadoPor ?? []).filter(b => b.estado === 'aberta' || (b.repo === null && cache.issues[b.numero]?.estado === 'aberta'));
    if (!abertos.length) continue;
    linhas.push(`Aviso: o ticket #${t} está bloqueado por ${abertos.map(b => `${b.repo ? `${b.repo}#` : '#'}${b.numero} (aberta)`).join(', ')}; a frente abre assim mesmo (leitura de ah deps de ${quando(cache.lidoEm, fuso)}).`);
  }
  return linhas;
}
