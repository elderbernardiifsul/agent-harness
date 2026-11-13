import fs from 'node:fs';
import path from 'node:path';
import { ErroDeUso } from '../lib/caminhos.mjs';
import { comTrava, registrarEvento } from '../lib/estado.mjs';
import { reagir, recusaAntesDeFechar } from '../lib/extensoes.mjs';
import { frentesDa, gravarFrente, lerFrente, linhaDoHistorico, listarFrentesTolerante, nomeValido, removerFrente } from '../lib/frente.mjs';
import { existeRamo, ramoAtual, git } from '../lib/git.mjs';
import { loginAtual } from '../lib/github.mjs';
import { reenviarComAviso, temDoTicket } from '../lib/pendentes.mjs';
import { apagarFechamento, fechamentoDa, gravarFechamento } from '../lib/fechamento.mjs';
import { confirmarRetomada, desfazerAbertura, liberarTickets, quemTemAFrente, sessoesDaquiDaFrente, ticketsJaFechados } from '../lib/reserva.mjs';
import { gravarSessao, idCurto, lerSessao, tocarSinal } from '../lib/sessao.mjs';
import { aberturaParada, fechamentoEmCurso, inicioDoProcesso, prazoMs, vidaDaSessao } from '../lib/vida.mjs';

export const descricao = 'fecha a frente da sessão sem perder trabalho';
export const uso = 'ah close [<nome>] [--resumo "<texto>"] [--descartar-ignorados]';
export const requisitos = { config: true, sessao: true, repositorio: true };

const ARQUIVO_DO_HISTORICO = 'docs/agents/historico-das-frentes.md';
const MAX_LISTA = 20;
// Prazo do push que apaga o ramo remoto da frente: rede travada não segura o close.
const PRAZO_DO_PUSH_MS = 20000;
// Espera pela trava `frentes` depois do comentário de fechamento (fase 3 e retirada da marca), como a do atualizar:
// o close que já comentou não deve cair por um comando curto de outra sessão. AH_CLOSE_ESPERA_DA_TRAVA_MS troca o
// valor (testes).
const ESPERA_DA_TRAVA_MS = 30000;
// Recusa depois do comentário de fechamento: o close seguinte termina sem comentar de novo.
const JA_COMENTADO = 'os tickets já receberam o comentário de fechamento, e o próximo ah close não comenta de novo';

function lerOpcoes(args) {
  const o = { nome: null, resumo: undefined, descartarIgnorados: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('--')) {
      if (o.nome !== null) throw new ErroDeUso(`Argumento a mais: ${arg.slice(0, 40)}\nPróximo passo: use ${uso}`);
      o.nome = arg;
      continue;
    }
    const igual = arg.indexOf('=');
    const nome = igual >= 0 ? arg.slice(0, igual) : arg;
    if (nome === '--descartar-ignorados' && igual < 0) { o.descartarIgnorados = true; continue; }
    if (nome !== '--resumo') throw new ErroDeUso(`Opção desconhecida: ${arg.slice(0, 40)}\nPróximo passo: use ${uso}`);
    let valor = igual >= 0 ? arg.slice(igual + 1) : args[++i];
    // Sem "=", um valor que começa por "--" seria outra opção: não o engolimos.
    if (valor === undefined || (igual < 0 && valor.startsWith('--'))) {
      throw new ErroDeUso('A opção --resumo precisa de um valor.\nPróximo passo: escreva --resumo "<texto>" (ou --resumo=<texto> se o texto começa por --)');
    }
    if (valor.trim() === '') throw new ErroDeUso('O resumo está vazio.\nPróximo passo: escreva o texto ou tire a opção --resumo');
    o.resumo = valor;
  }
  return o;
}

const recusa = (motivo, saida) => new ErroDeUso(`${motivo}\nPróximo passo: ${saida}`);
const mesmoCaminho = (a, b) => {
  try { return fs.realpathSync(a) === fs.realpathSync(b); } catch { return path.resolve(a) === path.resolve(b); }
};

const recusaDaExtensao = (d, frente) => recusa(d.falhou
  ? `a extensão ${d.extensao} falhou em antesDeFechar: ${d.motivo}`
  : `a extensão ${d.extensao} não deixa fechar a frente ${frente.id} ${frente.nome}: ${d.motivo}`, d.saida);

function listaCortada(itens, rotulo) {
  const linhas = itens.slice(0, MAX_LISTA).map(i => `    ${i}`);
  if (itens.length > MAX_LISTA) linhas.push(`    ... e mais ${itens.length - MAX_LISTA} ${rotulo}`);
  return linhas;
}

export async function executar(args, amb) {
  await reenviarComAviso(amb.dirEstado, { cwd: amb.raiz, env: amb.env }, amb.avisar);
  const o = lerOpcoes(args);
  if (o.nome !== null && !nomeValido(o.nome)) {
    throw recusa(`Nome de frente inválido: ${o.nome.slice(0, 40) || '(vazio)'}`, 'use o nome que ah board mostra (ex.: ah close carrinho)');
  }
  const { raiz, env, dirEstado, config: cfg } = amb;
  const g = (a, cwd = raiz) => git(a, { cwd, env });
  const base = cfg.git.base;
  const remoto = cfg.git.remoto;
  const esperaDaTrava = Number(env.AH_CLOSE_ESPERA_DA_TRAVA_MS) > 0 ? Number(env.AH_CLOSE_ESPERA_DA_TRAVA_MS) : ESPERA_DA_TRAVA_MS;

  // 1. Recusas que não dependem do estado.
  const t = git(['rev-parse', '--show-toplevel'], { cwd: amb.cwd, env });
  if (t.codigo !== 0) {
    throw recusa(`Não consegui conferir em que checkout estou: ${(t.erro || `código ${t.codigo}`).trim().split('\n')[0].slice(0, 200)}`, 'resolva o que o git descreve (ou rode ah doctor) e repita ah close; nada foi apagado');
  }
  const topo = t.saida.trim();
  if (topo && !mesmoCaminho(topo, raiz)) {
    throw recusa('O ah close não roda de dentro de um worktree de frente.', `rode no checkout principal: cd ${raiz}`);
  }

  // Conferências do git sobre a frente. Conferência que não consegue rodar é recusa, nunca "nada a perder".
  const falhou = (oque, r) => recusa(`Não consegui conferir ${oque}: ${(r.erro || r.saida || `código ${r.codigo}`).trim().split('\n')[0].slice(0, 200)}`, 'resolva o que o git descreve (ou rode ah doctor) e repita ah close; nada foi apagado');
  const existeRef = (ref, oque) => {
    const r = g(['show-ref', '--verify', '--quiet', ref]);
    if (r.codigo === 0) return true;
    if (r.codigo === 1) return false;
    throw falhou(oque, r);
  };
  // Onde está o trabalho da frente: lido na primeira fase e de novo na última (o handoff pode ter empurrado no meio).
  const lerRefs = frente => {
    const refRamo = `refs/heads/${frente.ramo}`;
    const refRemoto = `refs/remotes/${remoto}/${frente.ramo}`;
    const temRamo = existeRef(refRamo, `se o ramo ${frente.ramo} existe`);
    const temRamoRemoto = existeRef(refRemoto, `se o ramo ${frente.ramo} existe no remoto`);
    let soNoRemoto = false;
    if (temRamo) {
      const m = g(['merge-base', '--is-ancestor', refRamo, `refs/heads/${base}`]);
      if (m.codigo > 1) throw falhou(`se o ramo ${frente.ramo} está na ${base}`, m);
      soNoRemoto = m.codigo === 1;
    }
    return { wt: frente.worktree, temWt: fs.existsSync(frente.worktree), refRamo, refRemoto, temRamo, temRamoRemoto, soNoRemoto };
  };
  // Devolve a lista de problemas; lança recusa se alguma conferência não rodar.
  const conferir = (frente, { wt, temWt, refRamo, refRemoto, temRamo, temRamoRemoto }) => {
    const problemas = [];
    if (temWt) {
      const st = g(['status', '--porcelain'], wt);
      if (st.codigo !== 0) throw falhou(`as alterações do worktree ${wt}`, st);
      const sujos = st.saida.split('\n').filter(Boolean);
      if (sujos.length) {
        problemas.push([`alterações não commitadas no worktree (${sujos.length}); saída: commit no worktree (git -C ${wt} add -A && git -C ${wt} commit)`, listaCortada(sujos, 'arquivos')]);
      }
    }
    if (temRamo) {
      const excluir = [`refs/heads/${base}`, ...(temRamoRemoto ? [refRemoto] : [])];
      const r = g(['log', '--format=%h %s', refRamo, '--not', ...excluir]);
      if (r.codigo !== 0) throw falhou(`os commits do ramo ${frente.ramo}`, r);
      const perdidos = r.saida.split('\n').filter(Boolean);
      if (perdidos.length) {
        problemas.push([`commits do ramo ${frente.ramo} que não estão na ${base} nem no remoto (${perdidos.length}); saída: git merge --no-ff ${frente.ramo} na ${base}, ou git push -u ${remoto} ${frente.ramo}`, listaCortada(perdidos, 'commits')]);
      }
    }
    if (temWt && !o.descartarIgnorados) {
      const ig = g(['ls-files', '-z', '-o', '-i', '--exclude-standard', '--directory'], wt);
      if (ig.codigo !== 0) throw falhou(`os arquivos ignorados do worktree ${wt}`, ig);
      const ignorados = ig.saida.split('\0').filter(Boolean);
      if (ignorados.length) {
        problemas.push([`itens ignorados no worktree (${ignorados.length}; pasta inteira conta como um), que o git não guarda; saída: copie o que importa de ${wt}, ou repita com --descartar-ignorados`, listaCortada(ignorados, 'itens')]);
      }
    }
    return problemas;
  };
  const recusarProblemas = (frente, problemas, depois = '') => {
    const corpo = problemas.map(([t, l]) => [`- ${t}`, ...l].join('\n')).join('\n');
    throw new ErroDeUso(`Fechar a frente ${frente.id} ${frente.nome} perderia trabalho.\nPróximo passo: ${corpo}${depois}`);
  };
  // Worktree trancado (`git worktree lock`): o remove simples recusa sempre; melhor saber antes de mexer nos tickets.
  const trancado = wt => {
    const l = g(['worktree', 'list', '--porcelain']);
    if (l.codigo !== 0) throw falhou('os worktrees do git', l);
    for (const bloco of l.saida.split(/\n\s*\n/)) {
      const linhas = bloco.split('\n');
      const caminho = linhas.find(x => x.startsWith('worktree '))?.slice(9);
      if (!caminho || !mesmoCaminho(caminho, wt)) continue;
      const lk = linhas.find(x => x === 'locked' || x.startsWith('locked '));
      return lk === undefined ? null : (lk.slice(7).trim() || 'sem motivo');
    }
    return null;
  };
  const linhaJaGravada = frente => {
    try {
      return fs.readFileSync(path.join(raiz, ...ARQUIVO_DO_HISTORICO.split('/')), 'utf8').split('\n')
        .some(l => l.startsWith('- ') && l.includes(` · ${frente.id} · ${frente.nome} · `));
    } catch { return false; }
  };
  const foraDaBase = depois => recusa(`O checkout principal não está no ramo base ${base}.`, `no checkout principal (${raiz}) rode git switch ${base}${depois}`);

  // O registro da frente guarda o processo deste close (`fechando`) entre as fases: outro close, o handoff, o
  // takeover e a retomada recusam enquanto ele vive; morto, a marca não vale e o close seguinte termina.
  const processoDeste = { pid: process.pid, inicio: inicioDoProcesso(process.pid) };
  const eDeste = f => Boolean(f?.fechando) && f.fechando.pid === processoDeste.pid && (f.fechando.inicio ?? null) === processoDeste.inicio;
  let nomeDaMarca = null;
  const tirarMarca = () => {
    try {
      const f = lerFrente(dirEstado, nomeDaMarca);
      if (eDeste(f)) {
        delete f.fechando;
        gravarFrente(dirEstado, f);
      }
    } catch { /* registro ilegível ou apagado: a marca de um processo morto não vale */ }
  };

  // Abertura parada: a desistência nos tickets fora da trava; depois, sob a trava, tira o registro se ainda é deste
  // close (só então: outro processo que o tomou responde por ele).
  async function desfazerAbrindo(frente) {
    const oGh = { cwd: raiz, env, avisar: amb.avisar };
    const login = loginAtual(oGh) ?? frente.abertaPor ?? 'local';
    const r = desfazerAbertura({ frente, login, sessao: amb.sessaoId, rotulo: cfg.github.rotuloDeReserva, dirEstado }, oGh);
    if (r.naoLidos.length) {
      amb.avisar(`Aviso: não consegui ler ${r.naoLidos.map(n => `#${n}`).join(', ')}; confira à mão se a frente ${frente.id} ainda está de responsável e com o rótulo lá.\n`);
    }
    for (const f of r.ficaram) {
      amb.avisar(`Aviso: @${f.login} continua de responsável no ticket #${f.ticket} (${f.motivo}).${f.motivo.startsWith('outra') ? '' : ` Se precisar, tire à mão: gh issue edit ${f.ticket} --remove-assignee ${f.login}`}\n`);
    }
    await comTrava(dirEstado, 'frentes', async () => {
      const atual = lerFrente(dirEstado, frente.nome);
      const deste = atual?.id === frente.id && atual.estado === 'abrindo' && atual.processo?.pid === processoDeste.pid
        && (atual.processo?.inicio ?? null) === processoDeste.inicio;
      if (!deste) {
        throw recusa(`O registro da frente ${frente.nome} mudou enquanto eu desfazia a abertura (${atual ? `agora ${atual.id}, ${atual.estado}` : 'sumiu'}); não mexi nele.`,
          `rode ah board para ver como ela está${r.tickets.length ? `; nos tickets: ${r.texto}` : ''}`);
      }
      removerFrente(dirEstado, frente.nome);
      for (const id of new Set([amb.sessaoId, frente.dona].filter(Boolean))) {
        const s = lerSessao(dirEstado, id);
        if (s && (s.frente?.nome ?? s.frente) === frente.nome) gravarSessao(dirEstado, { ...s, frente: null });
      }
      registrarEvento(dirEstado, { tipo: 'abertura-desfeita', sessao: amb.sessaoId, id: frente.id, nome: frente.nome, frente: frente.nome, tickets: r.tickets });
      await reagir('depoisDeFechar', amb, { frente, dentroDaTrava: true, soLocal: false, aberturaDesfeita: true });
    }, { venceMs: 120000 });
    const sobras = [];
    if (existeRamo(raiz, frente.ramo, { env })) sobras.push(`git branch -D ${frente.ramo}`);
    if (typeof frente.worktree === 'string' && fs.existsSync(frente.worktree)) sobras.unshift(`git worktree remove ${frente.worktree}`);
    if (sobras.length) amb.avisar(`Sobrou coisa com esse nome. Para limpar à mão (confira antes se há trabalho a guardar):\n${sobras.map(x => `  ${x}`).join('\n')}\n`);
    amb.escrever(`Abertura de ${frente.id} ${frente.nome} desfeita.${r.texto ? ` Reserva: ${r.texto}.` : ''}\n`);
    return 0;
  }

  // Fase 1, sob a trava: recusas locais, conferências de perda de trabalho, antesDeFechar e a marca `fechando`.
  const fase1 = await comTrava(dirEstado, 'frentes', async () => {
    const sessao = lerSessao(dirEstado, amb.sessaoId);
    if (sessao) tocarSinal(dirEstado, amb.sessaoId);
    const nomeDaSessao = sessao?.frente ? (sessao.frente.nome ?? sessao.frente) : null;
    const nome = o.nome ?? nomeDaSessao;
    if (!nome) throw recusa('Esta sessão não tem frente.', 'rode ah board para ver as frentes abertas');
    if (!nomeValido(nome)) {
      throw recusa(`A sessão aponta para um nome de frente inválido: ${String(nome).slice(0, 40)}`, 'rode ah doctor');
    }
    const frente = lerFrente(dirEstado, nome);

    if (!frente) {
      // A sessão aponta para uma frente sem registro: libera a sessão e diz o que sobrou.
      if (nomeDaSessao !== nome) throw recusa(`Não achei a frente ${nome} no estado.`, 'rode ah board para ver as frentes abertas');
      sessao.frente = null;
      gravarSessao(dirEstado, sessao);
      registrarEvento(dirEstado, { tipo: 'fechamento-sem-registro', sessao: amb.sessaoId, nome, frente: nome });
      amb.avisar(`Aviso: a frente ${nome} não tem registro no estado; soltei a frente da sessão.\n`);
      const ramo = cfg.git.prefixo + nome;
      const sobras = [];
      if (existeRamo(raiz, ramo, { env })) sobras.push(`git branch -D ${ramo}`);
      const wt = g(['worktree', 'list', '--porcelain']).saida.split('\n').filter(l => l.startsWith('worktree ')).map(l => l.slice(9)).find(p => path.basename(p) === nome);
      if (wt) sobras.unshift(`git worktree remove ${wt}`);
      if (sobras.length) amb.avisar(`Sobrou coisa com esse nome. Para limpar à mão (confira antes se há trabalho a guardar):\n${sobras.map(s => `  ${s}`).join('\n')}\n`);
      amb.escrever(`Sessão ${idCurto(amb.sessaoId)} sem frente.\n`);
      return { fim: 0 };
    }
    // Registro `abrindo`: com o ah open ainda rodando, recusa; parado, só desfaz a abertura (sem histórico,
    // sem commit, sem "fechada" nos tickets) e só nos tickets cujo marcador ativo é desta frente.
    if (frente.estado === 'abrindo') {
      let vivaOutra = false;
      if (frente.dona && frente.dona !== amb.sessaoId) {
        try { vivaOutra = vidaDaSessao(dirEstado, frente.dona, { config: cfg }).estado === 'viva'; } catch { vivaOutra = false; }
      }
      if (!aberturaParada(frente, vivaOutra)) {
        throw recusa(`A frente ${frente.id} ${frente.nome} está sendo aberta agora (sessão ${frente.dona ?? 'sem dona'}${frente.processo ? `, processo ${frente.processo.pid}` : ''}).`,
          `espere esse ah open terminar (ah board mostra quando ela fica ativa) e, se ainda quiser, rode ah close ${frente.nome}`);
      }
      // As extensões também conferem a abertura desfeita (podem ter gravado na frente no meio do open).
      const daExtensao = await recusaAntesDeFechar(amb, { frente, dentroDaTrava: true, aberturaDesfeita: true });
      if (daExtensao) throw recusaDaExtensao(daExtensao, frente);
      // O registro passa a guardar o processo deste close: enquanto ele vive, outro open (ou close) vê uma abertura
      // em curso e espera; a leitura dos tickets e a desistência rodam fora da trava.
      let atual = frente;
      try { atual = lerFrente(dirEstado, frente.nome) ?? frente; } catch { /* vale a que temos */ }
      atual.processo = processoDeste;
      gravarFrente(dirEstado, atual);
      return { abrindo: atual };
    }
    // Outras frentes com arquivo ilegível não param este close (a do nome dado, sim: lerFrente recusa acima).
    for (const n of listarFrentesTolerante(dirEstado).ilegiveis) {
      amb.avisar(`Aviso: arquivo de frente ilegível: ${path.join(dirEstado, 'frentes', `${n}.json`)} (rode ah doctor)\n`);
    }
    // Outro close desta frente no meio (entre as fases, com a rede): espera ele terminar.
    if (fechamentoEmCurso(frente)) {
      throw recusa(`A frente ${frente.id} ${frente.nome} está sendo fechada agora (processo ${frente.fechando.pid}).`,
        `espere esse ah close terminar (ah board mostra fechando enquanto ele roda) e, se a frente continuar no quadro, rode ah close ${frente.nome}`);
    }
    // Frente de outra sessão: se a dona não está viva (encerrada, morta, sem registro) ou a frente
    // está passada (sem dona), esta sessão fecha, com as mesmas conferências; com a dona viva, recusa
    // com o id inteiro.
    let daEncerrada = false;
    let vidaDaDona = null;
    if (frente.dona !== amb.sessaoId) {
      vidaDaDona = frente.dona ? vidaDaSessao(dirEstado, frente.dona, { config: cfg }) : null;
      if (vidaDaDona?.estado === 'viva') {
        throw recusa(`A frente ${frente.id} ${frente.nome} é da sessão ${frente.dona}, que ainda está aberta, não desta.`,
          `peça à sessão dona que rode ah close; se ela parou, espere o sinal de vida dela vencer (sessoes.prazoDoSinalMin, hoje ${Math.round(prazoMs(cfg) / 60000)} min), confira em ah board que a frente aparece órfã e repita ah close ${frente.nome}`);
      }
      daEncerrada = true;
    }

    if (ramoAtual(raiz, env) !== base) throw foraDaBase('');
    const stHist = g(['status', '--porcelain', '--', ARQUIVO_DO_HISTORICO]);
    if (stHist.codigo !== 0) {
      throw recusa(`Não consegui conferir ${ARQUIVO_DO_HISTORICO}: ${(stHist.erro || `código ${stHist.codigo}`).trim().split('\n')[0].slice(0, 200)}`, 'resolva o que o git descreve (ou rode ah doctor) e repita ah close; nada foi apagado');
    }
    const arqSujo = stHist.saida.trim() !== '';
    // Sujo só pela linha desta frente (de um close anterior que parou no meio): segue e termina.
    if (arqSujo && !linhaJaGravada(frente)) {
      throw recusa(`O checkout principal tem alterações em ${ARQUIVO_DO_HISTORICO}.`, `commit ou descarte essas alterações (git -C ${raiz} diff ${ARQUIVO_DO_HISTORICO}) e rode ah close de novo`);
    }

    // 2. Nada se perde.
    const refs = lerRefs(frente);
    const primeiros = conferir(frente, refs);
    if (primeiros.length) recusarProblemas(frente, primeiros);
    const tranca = refs.temWt ? trancado(refs.wt) : null;
    if (tranca !== null) {
      throw recusa(`O worktree ${refs.wt} está trancado no git (${tranca.slice(0, 120)}); o git não o remove.`,
        `se ninguém mais o usa, destranque com git worktree unlock ${refs.wt} e rode ah close de novo; nada foi apagado`);
    }
    // As extensões conferem o que é delas (antesDeFechar) antes de qualquer mudança; a que recusa (ou falha) para
    // o close aqui. O que ela gravou na frente volta para o objeto que o close grava adiante.
    const daExtensao = await recusaAntesDeFechar(amb, { frente, dentroDaTrava: true });
    if (daExtensao) throw recusaDaExtensao(daExtensao, frente);
    try {
      const relida = lerFrente(dirEstado, frente.nome);
      if (relida?.extensoes !== undefined) frente.extensoes = relida.extensoes;
    } catch { /* fica o que já estava no objeto */ }
    if (frente.estado === 'passada' && (frente.tickets ?? []).length && fechamentoDa(dirEstado, frente)?.situacao !== 'comentado') {
      const presos = frente.tickets.filter(n => temDoTicket(dirEstado, n));
      if (presos.length) {
        throw recusa(`Não fechei ${frente.nome}: há operações desta máquina na fila para ${presos.map(n => `#${n}`).join(', ')} que precisam sair antes.`,
          `tente de novo com rede: ah close ${frente.nome}; nada foi apagado`);
      }
    }
    frente.fechando = processoDeste;
    gravarFrente(dirEstado, frente);
    nomeDaMarca = frente.nome;
    return { frente, daEncerrada, vidaDaDona, refs };
  }, { venceMs: 120000 });
  if (fase1.fim !== undefined) return fase1.fim;
  if (fase1.abrindo) return desfazerAbrindo(fase1.abrindo);
  let { frente } = fase1;
  const { daEncerrada, vidaDaDona } = fase1;
  const temTickets = (frente.tickets ?? []).length > 0;

  // Fase 2, fora da trava (rede): quem tem a frente passada, e o comentário de fechamento nos tickets.
  // Frente passada com tickets: outra máquina pode tê-la retomado, ou retomá-la enquanto este close comenta.
  // Então este close primeiro toma a frente pela mesma corrida da retomada (marcador `retomada` desta sessão) e
  // só então a fecha como própria; se outra a tem (ou ganha a corrida), tira só o registro e o worktree daqui.
  let soLocal = null;
  // O que o close só local fez nos tickets: nada, ou desfez a retomada que comentou para tomar a frente.
  let nosTickets = 'Não comentei nem mexi nos tickets';
  // Este close terminou o passo dos tickets (comentou, ou não havia o que comentar).
  let comentou = false;
  // O comentário de fechamento de um close anterior (marca em fechamentos/): `comentado` em todos os tickets, ou
  // `jaComentados`, os tickets onde saiu o de um close que parou no meio dele (marca `comentando`).
  const marca = temTickets ? fechamentoDa(dirEstado, frente) : null;
  let comentado = marca?.situacao === 'comentado';
  let jaComentados = [];
  let primeira;
  const oGh = { cwd: raiz, env, avisar: amb.avisar };
  try {
    if (marca?.situacao === 'comentando') {
      const r = ticketsJaFechados({ frente, dirEstado }, oGh);
      if (!r.ok) {
        throw recusa(`Não fechei ${frente.nome}: um ah close anterior parou no meio do comentário de fechamento, e preciso do GitHub para saber em que tickets ele saiu (${r.motivo}).`,
          `tente de novo com rede: ah close ${frente.nome}; nada foi apagado`);
      }
      jaComentados = r.feitos;
      comentado = frente.tickets.every(n => r.feitos.includes(n));
    }
    // O close que comentou o fechamento (em todos os tickets ou em parte) já conferiu quem tem a frente e a tomou.
    if (frente.estado === 'passada' && temTickets && !comentado && !jaComentados.length) {
      const login = loginAtual(oGh) ?? frente.abertaPor ?? 'local';
      const rotulo = cfg.github.rotuloDeReserva;
      const semRede = motivo => recusa(`Não fechei ${frente.nome}: preciso do GitHub para confirmar que ninguém retomou ${frente.nome} (${motivo}).`,
        `tente de novo com rede: ah close ${frente.nome}; nada foi apagado`);
      const sessoesDaqui = sessoesDaquiDaFrente(dirEstado, frente, [frente.passadaPor, frente.passadaDe]);
      const q = quemTemAFrente({ frente, login, sessao: amb.sessaoId, rotulo, sessoesDaqui }, oGh);
      if (q.situacao === 'sem-rede') throw semRede(q.motivo);
      if (q.situacao === 'outra') soLocal = `a frente ${q.id} está ativa com @${q.login} em outra máquina`;
      if (q.situacao === 'solta') soLocal = `nos tickets a frente ${frente.id} já não está passada (fechada em outra máquina)`;
      if (['passada', 'propria', 'daqui'].includes(q.situacao)) {
        const tipo = q.situacao === 'daqui' ? 'tomada' : 'retomada';
        const r = confirmarRetomada({ frente, login, sessao: amb.sessaoId, rotulo, dirEstado, proprios: q.proprios ?? [], tipo }, oGh);
        if (!r.ok && (r.vencedor || r.fechada)) {
          soLocal = r.vencedor ? `a frente ${frente.id} foi retomada antes por @${r.vencedor.login} em outra máquina` : `${r.motivo}, em outra máquina`;
          nosTickets = `Nos tickets, desfiz a retomada deste close (${r.como})`;
        }
        else if (!r.ok) throw semRede(`${r.motivo}; ${r.como}`);
        else frente.reserva = { ...(frente.reserva ?? { tickets: [...frente.tickets] }), logins: r.logins };
      }
    }

    // Resumo: o que o usuário deu, ou o título do último commit do ramo.
    let resumo = o.resumo;
    if (resumo === undefined) {
      const t = fase1.refs.temRamo ? g(['log', '-1', '--format=%s', fase1.refs.refRamo]).saida.trim() : '';
      resumo = t || 'sem resumo';
    }
    resumo = resumo.replace(/\r\n?/g, '\n').trim();
    primeira = resumo.split('\n').map(l => l.trim()).find(Boolean) ?? 'sem resumo';

    // 3. Tickets: comentário de fechamento (livre) e, com reserva, sai responsável e rótulo. Não fecha ticket.
    // Uma vez só, mesmo se o close for repetido: a marca em fechamentos/ é gravada antes (`comentando`) e depois
    // (`comentado`) do comentário, fora da trava, e sobrevive a recusa, trava ocupada e processo morto.
    if (!comentado && !soLocal) {
      if (temTickets) {
        gravarFechamento(dirEstado, frente, 'comentando');
        const login = loginAtual(oGh) ?? frente.abertaPor ?? 'local';
        const r = liberarTickets({ frente, resumo, login, rotulo: cfg.github.rotuloDeReserva, dirEstado, sessao: amb.sessaoId, pular: jaComentados }, oGh);
        gravarFechamento(dirEstado, frente, 'comentado');
        for (const ticket of r.comentariosNaFila) {
          amb.avisar(`Aviso: não consegui comentar no ticket #${ticket}; o comentário ficou na fila; sai no próximo comando com rede.\n`);
        }
        for (const ticket of r.edicoesNaFila) {
          amb.avisar(`Aviso: não consegui tirar responsável e rótulo do ticket #${ticket}; a edição ficou na fila; sai no próximo comando com rede.\n`);
        }
        // Os perdidos (nem a fila aceitou) já foram avisados com o comando para fazer à mão.
      }
      comentou = true;
    }
  } catch (e) {
    // A marca sai sob a trava; se nem assim, fica a de um processo que vai morrer, que não vale.
    try { await comTrava(dirEstado, 'frentes', async () => tirarMarca(), { esperaMs: esperaDaTrava, venceMs: 120000 }); } catch { /* vale a recusa original */ }
    throw e;
  }
  // Os tickets já têm o comentário de fechamento (deste close ou de um anterior): toda recusa daqui em diante o diz.
  const ticketsComentados = temTickets && !soLocal && (comentou || comentado);
  const depoisDoComentario = ticketsComentados ? `; ${JA_COMENTADO}` : '; nada foi apagado';

  // Fase 3, sob a trava (com espera longa: os tickets já podem ter o comentário): reconfere, remove worktree e
  // ramo, grava o histórico e tira o registro.
  let dentroDaFase3 = false;
  let fase3;
  try {
    fase3 = await comTrava(dirEstado, 'frentes', async () => {
      dentroDaFase3 = true;
      const relida = lerFrente(dirEstado, frente.nome);
      if (!relida || relida.id !== frente.id || !eDeste(relida) || relida.estado !== frente.estado) {
        tirarMarca();
        // A marca do comentário só vale para o mesmo id e o mesmo estado; senão é sobra, e o close seguinte confere
        // e comenta de novo.
        const valeAMarca = relida?.id === frente.id && relida.estado === frente.estado;
        if (!valeAMarca) apagarFechamento(dirEstado, frente.nome, frente.id);
        const depois = !ticketsComentados || valeAMarca ? depoisDoComentario : '; os tickets já receberam o comentário de fechamento deste close';
        throw recusa(`A frente ${frente.nome} mudou durante o fechamento (agora: ${relida ? `${relida.id}, ${relida.estado}` : 'sem registro'}).`,
          `rode ah board para ver como ela está${depois}`);
      }
      // Vale o registro relido (notas, dona e campos de extensão gravados no meio), com a reserva que a fase de rede decidiu.
      frente = { ...relida, reserva: frente.reserva };
      if (comentou) gravarFrente(dirEstado, frente);
      try {
        return await fecharSobTrava();
      } catch (e) {
        tirarMarca();
        throw e;
      }
    }, { esperaMs: esperaDaTrava, venceMs: 120000 });
  } catch (e) {
    if (!e?.travaPresa || dentroDaFase3) throw e;
    throw recusa(`${e.message}; o fechamento da frente ${frente.id} ${frente.nome} parou antes de remover o worktree.`,
      `${e.proximo}; depois rode ah close ${frente.nome} de novo${depoisDoComentario}`);
  }

  async function fecharSobTrava() {
    // Recusa daqui em diante: os tickets já podem ter o comentário de fechamento; o close seguinte não comenta de novo.
    const depois = depoisDoComentario;
    if (ramoAtual(raiz, env) !== base) throw foraDaBase(depois);
    // 4. Reconfere (os comentários demoram) e remove o worktree: depois daqui o que falhar vira aviso.
    const refs = lerRefs(frente);
    const { wt, temWt, refRamo, refRemoto, temRamo, temRamoRemoto, soNoRemoto } = refs;
    const novos = conferir(frente, refs);
    if (novos.length) recusarProblemas(frente, novos, ticketsComentados ? `\n(${JA_COMENTADO})` : '');
    if (temWt) {
      // Nunca com --force: o remove simples já apaga os ignorados, e só falha com alteração ou arquivo novo, que
      // pode ser trabalho escrito depois da reconferência.
      const r = g(['worktree', 'remove', '--', wt]);
      if (r.codigo !== 0) {
        throw recusa(`O git não removeu o worktree ${wt}: ${(r.erro || r.saida || `código ${r.codigo}`).trim().split('\n')[0]} (apareceu alteração ou arquivo novo depois da conferência?)`,
          `confira o que apareceu (git -C ${wt} status), guarde ou apague e rode ah close de novo${depois}`);
      }
    } else {
      g(['worktree', 'prune']);
    }
    // O -D só vale se o topo do ramo continua no ref remoto.
    const salvoNoRemoto = !soNoRemoto || (temRamoRemoto && g(['merge-base', '--is-ancestor', refRamo, refRemoto]).codigo === 0);
    if (temRamo && !salvoNoRemoto) {
      amb.avisar(`Aviso: não apaguei o ramo ${frente.ramo}: o topo dele não está mais no remoto. Confira e apague à mão se quiser: git branch -D ${frente.ramo}\n`);
    } else if (temRamo) {
      const r = g(['branch', soNoRemoto ? '-D' : '-d', '--', frente.ramo]);
      if (r.codigo !== 0) amb.avisar(`Aviso: não apaguei o ramo ${frente.ramo} (${r.erro.trim().split('\n')[0]}). Apague à mão: git branch -D ${frente.ramo}\n`);
    }

    // 5. Histórico (não no fechamento só local: a frente continua em outra máquina).
    const arquivo = path.join(raiz, ...ARQUIVO_DO_HISTORICO.split('/'));
    if (!soLocal) try {
      if (!linhaJaGravada(frente)) {
        const atual = fs.existsSync(arquivo) ? fs.readFileSync(arquivo, 'utf8') : '';
        fs.mkdirSync(path.dirname(arquivo), { recursive: true });
        fs.writeFileSync(arquivo, `${atual}${atual === '' || atual.endsWith('\n') ? '' : '\n'}${linhaDoHistorico(frente, primeira, new Date())}\n`);
      }
      const a = g(['add', '--', ARQUIVO_DO_HISTORICO]);
      const c = a.codigo === 0 ? g(['commit', '-m', `docs(frentes): fecha ${frente.id} ${frente.nome}`, '--', ARQUIVO_DO_HISTORICO]) : a;
      const nada = c.codigo !== 0 && g(['status', '--porcelain', '--', ARQUIVO_DO_HISTORICO]).saida.trim() === '';
      if (c.codigo !== 0 && !nada) {
        amb.avisar(`Aviso: não consegui commitar o histórico (${(c.erro || c.saida).trim().split('\n')[0]}). Faça à mão: git -C ${raiz} commit ${ARQUIVO_DO_HISTORICO} -m "docs(frentes): fecha ${frente.id} ${frente.nome}"\n`);
      }
    } catch (e) {
      amb.avisar(`Aviso: não consegui gravar o histórico (${e.message}). Acrescente à mão ao fim de ${ARQUIVO_DO_HISTORICO} a linha: ${linhaDoHistorico(frente, primeira, new Date())}\n`);
    }

    // 6. Estado.
    removerFrente(dirEstado, frente.nome);
    apagarFechamento(dirEstado, frente.nome, frente.id);
    // O foco que apontava para a frente fechada passa para a frente mais nova que sobrou à sessão (ou nenhuma).
    const soltarFoco = s => {
      if (!s || (s.frente?.nome ?? s.frente) !== frente.nome) return;
      s.frente = frentesDa(listarFrentesTolerante(dirEstado).frentes, s.id).at(-1)?.nome ?? null;
      gravarSessao(dirEstado, s);
    };
    for (const id of new Set([amb.sessaoId, fase1.frente.dona, frente.dona].filter(Boolean))) soltarFoco(lerSessao(dirEstado, id));
    registrarEvento(dirEstado, { tipo: soLocal ? 'fechamento-local' : 'fechamento', sessao: amb.sessaoId, id: frente.id, nome: frente.nome, frente: frente.nome, aberta: frente.abertaEm, fechada: new Date().toISOString() });
    await reagir('depoisDeFechar', amb, { frente, dentroDaTrava: true, soLocal: Boolean(soLocal) });

    // O ramo remoto sai depois da trava (rede); aqui só se decide, com as referências locais.
    if (!temRamoRemoto || soLocal) return { remota: null };
    const naBaseRemota = g(['merge-base', '--is-ancestor', refRemoto, `refs/remotes/${remoto}/${base}`]).codigo === 0;
    const naBaseLocal = !naBaseRemota && g(['merge-base', '--is-ancestor', refRemoto, `refs/heads/${base}`]).codigo === 0;
    const topo = naBaseRemota ? g(['rev-parse', '--verify', '-q', refRemoto]).saida.trim() : null;
    return { remota: { naBaseRemota, naBaseLocal, topo } };
  }

  // Fora da trava: o ramo remoto da frente integrada (o handoff o empurra) sai também, senão o nome fica preso no
  // open. Só quando o topo dele está contido em <remoto>/<base> (a referência de acompanhamento, sem fetch novo: o
  // trabalho já está no remoto) e não avançou lá (lease no topo conhecido). Contido só na base local: fica, com
  // aviso. Nunca recusa.
  const { remota } = fase3;
  if (remota?.naBaseRemota) {
    const r = git(['push', `--force-with-lease=refs/heads/${frente.ramo}:${remota.topo}`, remoto, '--delete', frente.ramo], { cwd: raiz, env, timeoutMs: PRAZO_DO_PUSH_MS });
    if (r.codigo !== 0) {
      const porque = (r.erro || r.saida || `código ${r.codigo}`).trim().split('\n')[0].slice(0, 200);
      amb.avisar(`Aviso: não apaguei o ramo remoto ${frente.ramo} (${porque}); enquanto ele existir, o nome ${frente.nome} não abre de novo.\n`
        + `Faça: git fetch ${remoto}, confira que git log ${remoto}/${base}..${remoto}/${frente.ramo} vem vazio (nada fora da ${base}) e apague: git push ${remoto} --delete ${frente.ramo}\n`);
    }
  } else if (remota?.naBaseLocal) {
    amb.avisar(`Aviso: o ramo remoto ${frente.ramo} ficou porque a ${base} ainda não foi enviada (o trabalho dele está só na ${base} local); enquanto ele existir, o nome ${frente.nome} não abre de novo.\n`
      + `Faça: git push ${remoto} ${base} e depois git push ${remoto} --delete ${frente.ramo}\n`);
  }

  // 7. Saída.
  if (soLocal) {
    amb.escrever(`Registro local da frente ${frente.id} ${frente.nome} fechado: ${soLocal}. ${nosTickets}, e o histórico não mudou.\n`);
    return 0;
  }
  amb.escrever(`Frente ${frente.id} ${frente.nome} fechada.\n`);
  if (daEncerrada && frente.estado === 'passada') {
    const por = !frente.passadaPor ? ''
      : frente.passadaPor === 'continuacao-sem-vinculo' ? ' numa continuação de sessão sem vínculo'
        : ` pela sessão ${idCurto(frente.passadaPor)}`;
    amb.escrever(`A frente estava passada${por}, sem dona; esta sessão a fechou.\n`);
  } else if (daEncerrada) {
    const como = vidaDaDona?.estado === 'morta' ? `que não está viva (${vidaDaDona.motivo})` : 'já encerrada';
    amb.escrever(`A frente era da sessão ${fase1.frente.dona ?? '(sem dona)'}, ${como}; esta sessão a fechou.\n`);
  }
  if (g(['remote']).saida.split('\n').includes(remoto)) amb.escrever(`Falta: git push ${remoto} ${base}\n`);
  return 0;
}
