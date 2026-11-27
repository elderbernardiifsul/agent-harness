// Extensão `registros`: o diário da execução por subagentes sobrevive ao worktree.
//
// A dor: o subagent-driven-development guarda, por plano, o diário (`progress.md`: tarefas concluídas, commits,
// vereditos de revisão, decisões tomadas sem o humano) em `.superpowers/sdd/` dentro do worktree, numa pasta que o
// git ignora. Remover o worktree apaga o diário; a própria skill o apaga quando a revisão final fica limpa; e outra
// máquina que retoma a frente não o tem. Sem o diário, a skill recomeça o plano do zero. O destino durável é o
// ticket da frente.
//
// Como a extensão resolve:
//   - `tools/ah registros guardar` comenta o diário de cada plano no(s) ticket(s) (fase `guardado`), guarda uma
//     cópia na pasta de estado do projeto e tira a pasta do worktree. O `metodo.md` manda rodá-lo em dois momentos:
//     no fim do subagent-driven-development, antes de a skill apagar a pasta do plano, e antes do `ah close`;
//   - `tools/ah registros devolver` traz de volta ao worktree o diário mais novo (por exemplo, de um plano que foi
//     guardado com tarefa parada e vai continuar);
//   - `ignorados`: quem esquece o `guardar` encontra a recusa do `close` apontando este comando, e não o
//     `--descartar-ignorados`, que apagaria o diário junto com o resto;
//   - `aoPassar` (handoff): comenta (fase `passagem`) e guarda a cópia, sem tirar a pasta, porque o trabalho continua;
//   - `depoisDeAbrir` na retomada: devolve o diário de passagem mais novo, para a execução continuar de onde parou,
//     inclusive em outra máquina; o que saiu de propósito (fase `guardado`) não volta sozinho;
//   - `depoisDeFechar`: comenta no ticket um resumo a partir das cópias e apaga as cópias; fechamento só local ou
//     sem ticket mostra o resumo e mantém a cópia;
//   - `resumo`: no começo da sessão, lembra o `guardar` antes do `close`, quando o worktree tem diário não guardado.
// Nada disto recusa o trabalho: só o comando recusa o próprio erro de uso. O formato do diário está em diario.mjs.
import fs from 'node:fs';
import path from 'node:path';
// Os marcadores que o núcleo deixa nos tickets (abertura, retomada, passagem), para saber quem é da frente. Esta
// extensão acompanha o harness: o caminho vale no clone (nucleo/) e na cópia instalada (.harness/nucleo/).
import { lerMarcadores } from '../../lib/reserva.mjs';
import {
  acharDiarios, arquivosDe, corpoDoDiario, devolverDiario, diarioDoComentario, gitignoreDoSdd, lerDiario, lerMarcador, limparPastaDoSdd,
  pastasDoSdd, resumoDoFechamento,
} from './diario.mjs';

const USO = 'ah registros guardar|devolver [--frente <nome>]';
// Tipos de marcador do núcleo que dizem "este login teve a frente neste ticket" (nucleo/lib/reserva.mjs).
const TIPOS_DA_FRENTE = new Set(['frente', 'retomada', 'tomada', 'passagem']);
// A associação do autor ao repositório, que o GitHub dá em cada comentário (`authorAssociation`, enum
// CommentAuthorAssociation da API). Só estas vêm de quem tem acesso ao repositório; um terceiro num repositório
// público vem como NONE, CONTRIBUTOR, FIRST_TIME_CONTRIBUTOR ou FIRST_TIMER.
const COM_ACESSO = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);

const recusa = (ctx, motivo, saida) => new ctx.ErroDeUso(`${motivo}\nPróximo passo: ${saida}`);
const lerOuNada = arquivo => { try { return fs.readFileSync(arquivo, 'utf8'); } catch { return null; } };
const lerJson = arquivo => { try { return JSON.parse(fs.readFileSync(arquivo, 'utf8')); } catch { return null; } };
const planos = n => `${n} ${n === 1 ? 'plano' : 'planos'}`;
const primeiraLinha = r => ((r.erro || r.saida || '').trim().split('\n')[0] || `código ${r.codigo}`).slice(0, 200);
const worktreeDe = frente => (typeof frente?.worktree === 'string' && fs.existsSync(frente.worktree) ? frente.worktree : null);
const pastaSdd = wt => path.join(wt, '.superpowers', 'sdd');
const entradasDoSdd = wt => { try { return fs.readdirSync(pastaSdd(wt)); } catch { return []; } };

// Um caminho montado com dados de fora (o id da frente, que pode ter vindo de um marcador de ticket, ou a pasta de um
// plano) só vale dentro de `base`: `path.relative` diz se ele sai de lá (`..`) ou vai para outro disco (absoluto).
// O núcleo já recusa o id fora do formato; esta conferência é a segunda camada, antes de gravar ou apagar.
function dentroDe(base, ...partes) {
  const alvo = path.resolve(base, ...partes.map(String));
  const rel = path.relative(base, alvo);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`o caminho ${alvo} fica fora da pasta de estado (${base}); não gravo nem apago nada lá`);
  }
  return alvo;
}

// Pasta das cópias da frente nesta máquina: <estado>/registros/<id da frente>/<pasta do plano>/. O id (as-1) não se
// repete na máquina; o nome da frente pode voltar depois de fechada.
export const dirDasCopias = (ctx, frente) => dentroDe(path.join(ctx.dirEstado, 'registros'), frente.id);
const dirDaCopia = (ctx, frente, pasta) => dentroDe(dirDasCopias(ctx, frente), pasta);

// O aviso de que o filtro tirou algo do comentário: é uma rede, não garantia.
function avisarSegredos(ctx, pasta, removidos) {
  if (!removidos) return;
  const trechos = removidos === 1 ? '1 trecho' : `${removidos} trechos`;
  ctx.avisar(`Aviso: tirei ${trechos} com cara de segredo do diário do plano ${pasta} antes de comentar ([removido]); o filtro é uma rede, não garantia: não guarde segredo no diário.\n`);
}

// O corpo vai pela entrada padrão, como no núcleo (nucleo/lib/github.mjs): o diário pode ser grande.
function comentar(ctx, ticket, corpo) {
  const r = ctx.gh(['issue', 'comment', String(ticket), '--body-file', '-'], { entrada: corpo });
  return r.codigo === 0 ? null : primeiraLinha(r);
}

// A cópia de um plano: progress.md com o diário inteiro e meta.json com o que se sabe dele (em que tickets está, em
// que fase, desde quando).
function gravarCopia(ctx, frente, { pasta, plano, texto, commit, fase, em, tickets, cortado }) {
  const dir = dirDaCopia(ctx, frente, pasta);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'progress.md'), texto);
  const meta = { id: frente.id, nome: frente.nome, pasta, plano, commit, fase, em, tickets, cortado };
  fs.writeFileSync(path.join(dir, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`);
}

// As cópias guardadas da frente nesta máquina: [{pasta, plano, texto, meta}], em ordem de pasta.
function lerCopias(ctx, frente) {
  const base = dirDasCopias(ctx, frente);
  let nomes;
  try { nomes = fs.readdirSync(base).sort(); } catch { return []; }
  return nomes.map(pasta => {
    const dir = dirDaCopia(ctx, frente, pasta);
    const texto = lerOuNada(path.join(dir, 'progress.md'));
    const meta = lerJson(path.join(dir, 'meta.json')) ?? {};
    return texto === null ? null : { pasta, plano: meta.plano ?? null, texto, meta };
  }).filter(Boolean);
}
const emDa = copia => copia?.meta.em ?? copia?.meta.guardadoEm ?? '';

// Comenta e guarda o diário de cada plano do worktree da frente. `remover`: o comando; tira a pasta do worktree
// depois e grava a fase `guardado`. Sem ele (o handoff), a pasta fica e a fase é `passagem`. `calado`: sem diário,
// não diz nada (as reações).
export async function guardar(frente, ctx, { remover, calado = false }) {
  const wt = worktreeDe(frente);
  if (!wt) {
    if (!calado) ctx.escrever(`A frente ${frente.id} ${frente.nome} não tem worktree nesta máquina; não há diário a guardar.\n`);
    return { planos: 0, comentados: [], pendentes: [] };
  }
  const diarios = acharDiarios(wt);
  if (!diarios.length) {
    if (!calado) ctx.escrever(`Nenhum diário em ${pastaSdd(wt)}/.\n`);
    // Pode ter sobrado o .gitignore do sdd-workspace (de um guardar que deixou um arquivo do aluno, já tirado).
    if (remover) limpar(ctx, wt);
    return { planos: 0, comentados: [], pendentes: [] };
  }
  const fase = remover ? 'guardado' : 'passagem';
  const commit = ctx.git(['rev-parse', '--short=7', 'HEAD'], { cwd: wt }).saida.trim() || 'desconhecido';
  const tickets = frente.tickets ?? [];
  const base = dirDasCopias(ctx, frente);
  const comentados = new Set();
  const falhas = new Map();
  for (const d of diarios) {
    // O mesmo diário, na mesma fase, já comentado num ticket (pelo handoff, por um guardar anterior ou pela
    // retomada que o trouxe dele) não vai de novo: a cópia desta máquina diz onde ele já está.
    const copia = lerCopias(ctx, frente).find(c => c.pasta === d.pasta);
    const igual = copia?.texto === d.texto && copia.meta.fase === fase;
    const em = igual ? emDa(copia) : new Date().toISOString();
    const { corpo, cortado, removidos } = corpoDoDiario({ frente, diario: d, commit, fase, em });
    if (tickets.some(n => !(igual && copia.meta.tickets?.[n] === 'comentado'))) avisarSegredos(ctx, d.pasta, removidos);
    const estado = {};
    for (const n of tickets) {
      // `erro` null: já estava comentado, ou o comentário deu certo agora.
      const erro = igual && copia.meta.tickets?.[n] === 'comentado' ? null : comentar(ctx, n, corpo);
      estado[n] = erro ? 'pendente' : 'comentado';
      if (erro) falhas.set(n, erro);
      else comentados.add(n);
    }
    gravarCopia(ctx, frente, { pasta: d.pasta, plano: d.plano, texto: d.texto, commit, fase, em, tickets: estado, cortado });
  }
  const onde = comentados.size ? `; comentado em ${[...comentados].map(n => `#${n}`).join(', ')}` : '';
  ctx.escrever(`Diário de ${planos(diarios.length)} guardado em ${base}${onde}.\n`);
  if (!tickets.length) ctx.avisar(`Aviso: a frente ${frente.id} não tem ticket: o diário ficou só nesta máquina (${base}).\n`);
  for (const [n, erro] of falhas) {
    ctx.avisar(remover
      ? `Aviso: não consegui comentar em #${n} (${erro}); a cópia está em ${base}, e o ah close desta máquina comenta antes de fechar.\n`
      : `Aviso: o diário não chegou a #${n} (${erro}): outra máquina que retomar a frente não o terá; a cópia está em ${base}.\n`);
  }
  if (!remover) return { planos: diarios.length, comentados: [...comentados], pendentes: [...falhas.keys()] };
  // Plano com tarefa parada: guardar tira a pasta, e sem ela a próxima execução recomeçaria do zero.
  for (const d of diarios) {
    const parada = lerDiario(d.texto).paradas[0];
    if (parada) {
      ctx.avisar(`Aviso: o plano ${d.plano ?? d.pasta} tem tarefa parada (${parada.ultima.slice(0, 100)}); o diário saiu do worktree e está guardado. Para continuar o plano: tools/ah registros devolver --frente ${frente.nome}\n`);
    }
  }
  const rastreados = rastreadosDe(ctx, wt);
  const copiados = new Set(diarios.flatMap(d => copiarPastaDoPlano(ctx, frente, wt, d.pasta, rastreados)));
  limpar(ctx, wt, rastreados, copiados);
  return { planos: diarios.length, comentados: [...comentados], pendentes: [...falhas.keys()] };
}

// Os arquivos de .superpowers/sdd/ que o git versiona (relativos ao worktree): o guardar não os copia nem apaga.
function rastreadosDe(ctx, wt) {
  const r = ctx.git(['ls-files', '-z', '--', '.superpowers/sdd'], { cwd: wt });
  return new Set(r.codigo === 0 ? r.saida.split('\0').filter(Boolean) : []);
}

// Copia para a cópia do plano (`arquivos/`) os arquivos da pasta dele que o git não versiona: o diário, as
// instruções, os relatórios e o que mais houver lá. Devolve os caminhos absolutos copiados, os únicos que o guardar
// tira do worktree.
function copiarPastaDoPlano(ctx, frente, wt, pasta, rastreados) {
  const origem = path.join(pastaSdd(wt), pasta);
  const destino = dentroDe(dirDaCopia(ctx, frente, pasta), 'arquivos');
  const copiados = [];
  for (const abs of arquivosDe(origem)) {
    const rel = path.relative(origem, abs);
    if (rastreados.has(path.relative(wt, abs).split(path.sep).join('/'))) continue;
    const alvo = dentroDe(destino, rel);
    fs.mkdirSync(path.dirname(alvo), { recursive: true });
    fs.copyFileSync(abs, alvo);
    copiados.push(abs);
  }
  return copiados;
}

// Tira do worktree só o que foi copiado, sem tocar no que o git versiona, e avisa do que sobrou.
function limpar(ctx, wt, rastreados = rastreadosDe(ctx, wt), copiados = new Set()) {
  const sobras = limparPastaDoSdd(wt, rastreados, copiados);
  if (sobras.length) ctx.avisar(`Aviso: deixei no worktree o que não é do subagent-driven-development ou não foi guardado: ${sobras.join(', ')}. O ah close recusa enquanto isso estiver lá: mova o que importa para fora de ${pastaSdd(wt)} ou apague.\n`);
}

// Os logins que tiveram a frente num ticket, pelos marcadores do núcleo, com a mesma regra dele: o marcador só vale
// quando o autor do comentário é o login que ele declara.
function loginsDaFrente(comentarios, frente) {
  const logins = new Set();
  for (const c of comentarios) {
    const autor = c?.author?.login;
    for (const m of lerMarcadores(c?.body)) {
      // O `ah:frente` antigo (fatia 1, sem `login` nem `v`) vale pelo autor, como no núcleo.
      const antigo = m.tipo === 'frente' && m.campos.login === undefined && m.campos.v === undefined;
      const login = antigo ? autor : m.campos.login;
      if (TIPOS_DA_FRENTE.has(m.tipo) && m.campos.id === frente.id && autor && login === autor) logins.add(autor);
    }
  }
  return logins;
}

// O diário mais novo (pelo `em` do marcador) de cada plano da frente, juntando todos os tickets:
// {achados: Map pasta -> {plano, texto, cortado, em, fase, ticket, tickets}, lidos: quantos tickets se leram}.
// `tickets`: todos em que o mesmo diário (mesmo texto e mesmo `em`) está, para não comentá-lo de novo em nenhum.
// Repositório público: qualquer um comenta, e o diário é lido pelo agente como instrução de trabalho. Por isso só
// vale o comentário de quem tem acesso ao repositório (associação OWNER, MEMBER ou COLLABORATOR) e marcador do núcleo
// nesta frente, naquele ticket. O marcador sozinho não basta: um terceiro pode forjá-lo com o próprio login. Sem a
// associação (gh antigo), vale a regra mais estrita: o comentário é ignorado. Os ignorados saem num aviso.
function diariosDosTickets(ctx, frente, avisar) {
  const todos = new Map();
  let lidos = 0;
  for (const n of frente.tickets ?? []) {
    const r = ctx.gh(['issue', 'view', String(n), '--json', 'comments']);
    if (r.codigo !== 0) {
      avisar(`Aviso: não consegui ler os comentários de #${n} (${primeiraLinha(r)}); o diário que estiver lá não entrou na conta.\n`);
      continue;
    }
    lidos += 1;
    let comentarios = [];
    try { comentarios = JSON.parse(r.saida).comments ?? []; } catch { comentarios = []; }
    const daFrente = loginsDaFrente(comentarios, frente);
    const ignorados = new Set();
    for (const c of comentarios) {
      const m = lerMarcador(c?.body);
      if (!m || m.id !== frente.id) continue;
      const autor = c?.author?.login ?? '(sem autor)';
      const associacao = typeof c?.authorAssociation === 'string' ? c.authorAssociation : null;
      if (!daFrente.has(autor) || !COM_ACESSO.has(associacao)) {
        const qual = associacao ? `associação ${associacao}` : 'associação desconhecida: o gh não informou';
        if (!ignorados.has(autor)) avisar(`Aviso: ignorei o diário que @${autor} comentou em #${n} (${qual}): só vale o de quem tem acesso ao repositório e marcador do harness nesta frente.\n`);
        ignorados.add(autor);
        continue;
      }
      if (!todos.has(m.pasta)) todos.set(m.pasta, []);
      todos.get(m.pasta).push({ plano: m.plano, texto: diarioDoComentario(c.body), cortado: m.cortado, em: m.em, fase: m.fase, ticket: n });
    }
  }
  const achados = new Map();
  for (const [pasta, lista] of todos) {
    // Mesmo `em` (ou nenhum, no v=1): vale o que vem depois na leitura.
    const novo = lista.reduce((a, b) => (b.em >= a.em ? b : a));
    const tickets = [...new Set(lista.filter(x => x.em === novo.em && x.texto === novo.texto).map(x => x.ticket))];
    achados.set(pasta, { ...novo, tickets, origem: 'do ticket' });
  }
  return { achados, lidos };
}

// De onde vem o diário a devolver, por plano: o mais novo entre os tickets e a cópia desta máquina. A cópia vale
// quando nenhum ticket se leu, quando o ticket não tem o plano, ou quando ela é mais nova (guardada sem rede, com o
// ticket pendente); ela guarda o diário inteiro, então nunca está cortada.
function fonteDoDiario(ctx, frente, avisar) {
  const { achados, lidos } = (frente.tickets ?? []).length ? diariosDosTickets(ctx, frente, avisar) : { achados: new Map(), lidos: 0 };
  for (const c of lerCopias(ctx, frente)) {
    const doTicket = achados.get(c.pasta);
    if (lidos && doTicket && !(emDa(c) > doTicket.em)) continue;
    achados.set(c.pasta, {
      plano: c.plano, texto: c.texto, cortado: false, em: emDa(c), fase: c.meta.fase ?? 'passagem', ticket: null, tickets: [],
      origem: 'da cópia desta máquina',
    });
  }
  return achados;
}

// Devolve ao worktree o diário mais novo de cada plano. `soPassagem`: a retomada, que não traz de volta o que saiu
// de propósito. O diário que já está no worktree só é trocado quando é igual à cópia desta máquina (ninguém mexeu
// nele aqui desde a última guarda) e o da fonte é mais novo. Diferente da cópia: se a fonte é a própria cópia, o
// worktree é o mais novo e fica; se não, há duas versões, e ele fica com aviso.
// Devolve {devolvidos, achados, avisos, semWorktree}.
function devolver(ctx, frente, { soPassagem }) {
  const wt = worktreeDe(frente);
  if (!wt) return { devolvidos: 0, achados: 0, avisos: 0, semWorktree: true };
  let avisos = 0;
  const avisar = texto => { avisos += 1; ctx.avisar(texto); };
  const noWorktree = new Map(acharDiarios(wt).map(d => [d.pasta, d.texto]));
  const copias = new Map(lerCopias(ctx, frente).map(c => [c.pasta, c]));
  const achados = fonteDoDiario(ctx, frente, avisar);
  const origens = new Set();
  let devolvidos = 0;
  for (const [pasta, d] of achados) {
    if (soPassagem && d.fase !== 'passagem') continue;
    const atual = noWorktree.get(pasta);
    if (atual === d.texto) continue;
    const copia = copias.get(pasta);
    if (atual !== undefined && copia?.texto !== atual) {
      if (d.texto !== copia?.texto) {
        avisar(`Aviso: o diário do plano ${pasta} no worktree mudou desde a última guarda nesta máquina, e há outro mais novo ${d.origem}; mantive o do worktree. Para ficar com o outro: apague ${path.join(pastaSdd(wt), pasta)} e rode tools/ah registros devolver.\n`);
      }
      continue;
    }
    if (atual !== undefined && !(d.em > emDa(copia))) continue;
    if (d.cortado) {
      avisar(`Aviso: o diário do plano ${pasta} no ticket #${d.ticket} está cortado; não o devolvi (o inteiro ficou na máquina que guardou).\n`);
      continue;
    }
    if (d.texto === null) {
      avisar(`Aviso: não achei o bloco do diário do plano ${pasta} no comentário de #${d.ticket} (editado à mão?); não o devolvi.\n`);
      continue;
    }
    try {
      devolverDiario(wt, { pasta, plano: d.plano, texto: d.texto });
    } catch (e) {
      avisar(`Aviso: não devolvi o diário do plano ${pasta}: ${e.message}.\n`);
      continue;
    }
    // Veio do ticket: a cópia desta máquina passa a saber em que tickets ele já está, para o handoff não comentá-lo
    // de novo. A cópia com ticket pendente não é trocada: o close ainda precisa levá-la ao ticket.
    const pendente = Object.values(copia?.meta.tickets ?? {}).includes('pendente');
    if (d.ticket !== null && !pendente) {
      const commit = ctx.git(['rev-parse', '--short=7', 'HEAD'], { cwd: wt }).saida.trim() || 'desconhecido';
      const tickets = Object.fromEntries(d.tickets.map(n => [n, 'comentado']));
      gravarCopia(ctx, frente, { pasta, plano: d.plano, texto: d.texto, commit, fase: d.fase, em: d.em, tickets, cortado: false });
    }
    origens.add(d.origem);
    devolvidos += 1;
  }
  if (devolvidos) ctx.escrever(`Registros: devolvi o diário de ${planos(devolvidos)} a ${pastaSdd(wt)}/ (${[...origens].join(' e ')}).\n`);
  return { devolvidos, achados: achados.size, avisos, semWorktree: false };
}

// Fechamento: o diário pendente vai primeiro; depois, o resumo. Roda sob a trava das frentes do close, e cada gh
// tem o prazo de 15 s do núcleo: na primeira falha, para de chamar o gh, para a rede travada não segurar a trava.
// Falha vira aviso, sem desfazer o fechamento. A cópia só sai quando tudo chegou ao ticket e nada foi cortado.
async function resumir(ctx) {
  const frente = ctx.frente;
  if (!frente || ctx.aberturaDesfeita) return;
  const copias = lerCopias(ctx, frente);
  if (!copias.length) {
    ctx.escrever(`Registros: nenhum diário guardado para a frente ${frente.id}.\n`);
    return;
  }
  const base = dirDasCopias(ctx, frente);
  const tickets = ctx.soLocal ? [] : (frente.tickets ?? []);
  let semRede = null;
  const tentar = (n, corpo) => {
    if (semRede) return false;
    semRede = comentar(ctx, n, corpo);
    return !semRede;
  };
  for (const c of copias) {
    for (const n of tickets) {
      if (c.meta.tickets?.[n] === 'comentado') continue;
      // O pendente sai com a fase e a data de quando foi guardado, não as de agora.
      const quando = emDa(c) ? { em: emDa(c) } : {};
      const { corpo, removidos } = corpoDoDiario({ frente, diario: c, commit: c.meta.commit ?? 'desconhecido', fase: c.meta.fase ?? 'passagem', ...quando });
      avisarSegredos(ctx, c.pasta, removidos);
      tentar(n, corpo);
    }
  }
  const corpo = resumoDoFechamento({ frente, copias });
  const comentados = tickets.filter(n => tentar(n, corpo));
  if (semRede) ctx.avisar(`Aviso: sem rede (${semRede}): parei de comentar; o diário e o resumo ficam em ${base}.\n`);
  if (comentados.length) ctx.escrever(`Registros: resumo da execução comentado em ${comentados.map(n => `#${n}`).join(', ')}.\n`);
  else ctx.escrever(corpo.split('\n').slice(1).join('\n'));
  const cortados = copias.filter(c => c.meta.cortado);
  for (const c of cortados) ctx.escrever(`Registros: o diário do plano ${c.pasta} foi cortado no ticket; a cópia inteira fica em ${base}.\n`);
  if (tickets.length && !semRede && !cortados.length) fs.rmSync(base, { recursive: true, force: true });
  else if (!cortados.length) ctx.escrever(`Registros: a cópia do diário fica em ${base}.\n`);
}

// Começo de sessão: há diário no worktree da frente que não está guardado (sem cópia, ou diferente dela)? A linha só
// lembra o guardar antes do close; no meio do plano, guardar tiraria a pasta de que a execução precisa.
function lembrete(ctx) {
  const frente = ctx.frente;
  const wt = typeof frente?.worktree === 'string' ? frente.worktree : null;
  if (!wt || !ctx.dirEstado) return null;
  const guardados = new Map(lerCopias(ctx, frente).map(c => [c.pasta, c.texto]));
  const soltos = acharDiarios(wt).filter(d => guardados.get(d.pasta) !== d.texto);
  if (!soltos.length) return null;
  return 'Registros: antes do ah close, rode tools/ah registros guardar.';
}

function lerArgs(args, ctx) {
  const [sub, ...resto] = args;
  if (sub === undefined) throw recusa(ctx, 'Falta o subcomando.', `use ${USO}`);
  if (sub !== 'guardar' && sub !== 'devolver') throw recusa(ctx, `Subcomando desconhecido: ${String(sub).slice(0, 40)}`, `use ${USO}`);
  const o = { sub, frente: null };
  for (let i = 0; i < resto.length; i++) {
    if (resto[i] === '--frente') {
      o.frente = resto[++i];
      if (!o.frente) throw recusa(ctx, 'A opção --frente precisa do nome da frente.', `use ${USO}`);
    } else throw recusa(ctx, `Argumento desconhecido: ${resto[i].slice(0, 40)}`, `use ${USO}`);
  }
  return o;
}

// A frente do comando: a dada em --frente (por nome ou id), ou a da sessão. Frente ativa de outra sessão viva não:
// ela pode estar no meio da execução, e o guardar tira (e o devolver troca) a pasta de trabalho do worktree.
function frenteAlvo(ctx, nome, sub) {
  if (!nome) {
    if (!ctx.frente) throw recusa(ctx, 'Esta sessão não tem frente.', 'abra uma com ah open <nome>, ou diga qual com --frente <nome>');
    return ctx.frente;
  }
  const f = ctx.frentes().find(x => x.nome === nome || x.id === nome);
  if (!f) throw recusa(ctx, `Não achei a frente ${nome.slice(0, 49)}.`, 'rode ah board para ver as frentes abertas');
  if (f.estado === 'ativa' && f.dona && f.dona !== ctx.sessaoId && ctx.donaViva(f)) {
    throw recusa(ctx, `A frente ${f.id} ${f.nome} é da sessão ${f.dona}, que está viva.`,
      `peça à sessão dona (${f.dona}) que rode tools/ah registros ${sub}; com a sessão morta (frente órfã) ou a frente passada, o --frente vale`);
  }
  return f;
}

export default {
  versaoDaInterface: 1,
  descricao: 'leva o diário da execução por subagentes para o ticket da frente',
  comandos: {
    registros: {
      descricao: 'guarda o diário do subagent-driven-development no ticket (guardar) ou o traz de volta (devolver)',
      uso: USO,
      async executar(args, ctx) {
        const o = lerArgs(args, ctx);
        const frente = frenteAlvo(ctx, o.frente, o.sub);
        if (o.sub === 'guardar') {
          await guardar(frente, ctx, { remover: true });
          return 0;
        }
        const r = devolver(ctx, frente, { soPassagem: false });
        if (r.semWorktree) ctx.escrever(`A frente ${frente.id} ${frente.nome} não tem worktree nesta máquina; nada a devolver.\n`);
        else if (!r.achados) ctx.escrever('Nada a devolver: não achei diário desta frente nos tickets nem nesta máquina.\n');
        else if (!r.devolvidos && r.avisos) ctx.escrever('Nada devolvido: veja os avisos acima.\n');
        else if (!r.devolvidos) ctx.escrever('Nada a devolver: o worktree já tem o diário mais novo de cada plano.\n');
        return 0;
      },
    },
  },
  // Só o que é do subagent-driven-development: as pastas de plano e, com alguma delas, o .gitignore que o
  // sdd-workspace cria. Um arquivo do aluno em .superpowers/sdd/ fica na linha de sempre do close, porque o guardar
  // não o tira. Lê só o disco, rápido: o close chama sob a trava.
  ignorados(ctx) {
    const wt = typeof ctx.frente?.worktree === 'string' ? ctx.frente.worktree : null;
    if (!wt) return [];
    const pastas = pastasDoSdd(wt);
    // O .gitignore entra com alguma pasta de plano, ou sozinho quando é o do sdd-workspace (`*`) e nada mais sobrou
    // na pasta: com um arquivo do aluno ao lado, o guardar não o tira, e o close fica na linha de sempre.
    const sozinho = gitignoreDoSdd(wt) && entradasDoSdd(wt).every(n => n === '.gitignore');
    const ignora = pastas.length || sozinho ? ['.superpowers/sdd/.gitignore'] : [];
    const guardar = `tools/ah registros guardar --frente ${ctx.frente.nome}`;
    return [...pastas, ...ignora].map(caminho => ({ caminho, guardar }));
  },
  reacoes: {
    async aoPassar(ctx) {
      await guardar(ctx.frente, ctx, { remover: false, calado: true });
    },
    async depoisDeAbrir(ctx) {
      if (ctx.retomada) devolver(ctx, ctx.frente, { soPassagem: true });
    },
    depoisDeFechar: resumir,
  },
  resumo: lembrete,
};
