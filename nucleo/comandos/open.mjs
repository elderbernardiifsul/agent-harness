import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ErroDeUso, arquivoDaMaquina, dirWorktrees } from '../lib/caminhos.mjs';
import { comTrava, lerJson, registrarEvento } from '../lib/estado.mjs';
import { frentesDa, gravarFrente, lerFrente, listarFrentes, listarFrentesTolerante, nomeValido, novaFrente, proximoId, removerFrente, siglaValida } from '../lib/frente.mjs';
import { existeRamo, git, recusaDoWorktree } from '../lib/git.mjs';
import { loginAtual } from '../lib/github.mjs';
import { reenviarComAviso, reenviarPendentes, temDoTicket } from '../lib/pendentes.mjs';
import { acharPassagem, ativaDaSessao, avisarDaMarcacao, confirmarRetomada, desfazerReserva, marcarTickets, paraQuem, quemTemAFrente, reservar, sessoesDaquiDaFrente } from '../lib/reserva.mjs';
import { avisosDeBloqueio } from '../lib/deps.mjs';
import { arquivosDaFrente, caminhosEmComum, tocaOsCaminhos } from '../lib/sobreposicao.mjs';
import { ESQUEMA_DO_ESTADO, gravarSessao, idCurto, lerSessao, listarSessoes, registrarSessao, resolverSessao, tocarSinal, VARIAVEL_SESSAO_CLAUDE } from '../lib/sessao.mjs';
import { aberturaEmCurso, inicioDoProcesso, pidDeComando, vidaDaSessao } from '../lib/vida.mjs';

export const descricao = 'abre uma frente de trabalho: ramo, worktree, registro e reserva dos tickets';
export const uso = 'ah open <nome> [--tickets 1,2] [--plano <arquivo>] [--caminhos <globs>] [--para <id curto>]';
export const requisitos = { config: true, sessao: true };

const COM_VALOR = new Set(['--tickets', '--plano', '--caminhos', '--para']);
const ARQUIVO_DO_HISTORICO = 'docs/agents/historico-das-frentes.md';

function lerOpcoes(args) {
  const o = { nome: null };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('--')) {
      if (o.nome !== null) throw new ErroDeUso(`Argumento a mais: ${arg.slice(0, 40)}\nPróximo passo: use ${uso}`);
      o.nome = arg;
      continue;
    }
    const igual = arg.indexOf('=');
    const nome = igual >= 0 ? arg.slice(0, igual) : arg;
    let valor = igual >= 0 ? arg.slice(igual + 1) : undefined;
    if (!COM_VALOR.has(nome)) throw new ErroDeUso(`Opção desconhecida: ${arg.slice(0, 40)}\nPróximo passo: use ${uso}`);
    if (valor === undefined) {
      valor = args[++i];
      if (valor === undefined || valor.startsWith('--')) throw new ErroDeUso(`A opção ${nome} precisa de um valor.\nPróximo passo: escreva ${nome} <valor>`);
    }
    o[nome.slice(2)] = valor;
  }
  return o;
}

function lerTickets(texto) {
  if (texto === undefined) return [];
  const partes = texto.split(',').map(s => s.trim());
  if (!partes.every(s => /^[1-9]\d{0,8}$/.test(s))) {
    throw new ErroDeUso(`--tickets só aceita números inteiros positivos separados por vírgula: ${texto.slice(0, 40)}\nPróximo passo: escreva, por exemplo, --tickets 1,2`);
  }
  return partes.map(Number);
}

// O plano é um arquivo do repositório: caminho relativo, que existe e não sai da raiz.
function conferirPlano(plano, raiz) {
  if (plano === undefined) return null;
  const fora = `O plano precisa ser um arquivo dentro do repositório: ${plano.slice(0, 60)}\nPróximo passo: passe o caminho relativo à raiz do projeto, como --plano docs/plano.md`;
  if (plano === '' || path.isAbsolute(plano) || path.win32.isAbsolute(plano) || path.posix.isAbsolute(plano)) throw new ErroDeUso(fora);
  const alvo = path.resolve(raiz, plano);
  const rel = path.relative(raiz, alvo);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) throw new ErroDeUso(fora);
  let real;
  try {
    real = fs.realpathSync(alvo);
  } catch {
    throw new ErroDeUso(`O plano não existe: ${plano.slice(0, 60)}\nPróximo passo: confira o caminho ou crie o arquivo antes de abrir a frente`);
  }
  const relReal = path.relative(fs.realpathSync(raiz), real);
  if (relReal.startsWith('..') || path.isAbsolute(relReal)) throw new ErroDeUso(fora);
  if (!fs.statSync(real).isFile()) throw new ErroDeUso(fora);
  return plano;
}

function lerCaminhos(texto) {
  if (texto === undefined) return [];
  const lista = texto.split(',').map(s => s.trim());
  if (lista.some(s => s === '')) throw new ErroDeUso('--caminhos tem um item vazio.\nPróximo passo: escreva, por exemplo, --caminhos "src/**,docs/*.md"');
  return lista;
}

// Ponto de partida: o remoto, salvo quando a base local o contém e está à frente.
function pontoDePartida(amb, base, remoto) {
  const comRemoto = remoto && git(['remote'], { cwd: amb.raiz, env: amb.env }).saida.split('\n').includes(remoto);
  const ref = comRemoto ? `${remoto}/${base}` : null;
  const temRemoto = ref && existeRamo(amb.raiz, base, { remoto, env: amb.env });
  const temLocal = existeRamo(amb.raiz, base, { env: amb.env });
  if (!temRemoto && !temLocal) return { erro: `Não achei a base ${base} (nem local nem no remoto).\nPróximo passo: rode ah init ou crie o ramo ${base}` };
  if (!temRemoto) return { ponto: base, refs: [base] };
  if (!temLocal) return { ponto: ref, refs: [ref] };
  const localContemRemoto = git(['merge-base', '--is-ancestor', ref, base], { cwd: amb.raiz, env: amb.env }).codigo === 0;
  const iguais = git(['rev-parse', ref], { cwd: amb.raiz, env: amb.env }).saida === git(['rev-parse', base], { cwd: amb.raiz, env: amb.env }).saida;
  return { ponto: localContemRemoto && !iguais ? base : ref, refs: [base, ref] };
}

function lerHistorico(amb, refs) {
  return refs.map(r => {
    const g = git(['show', `${r}:${ARQUIVO_DO_HISTORICO}`], { cwd: amb.raiz, env: amb.env });
    // Só as linhas de entrada ("- data · id · ..."): o texto de apresentação traz um id de exemplo.
    return g.codigo === 0 ? g.saida.split('\n').filter(l => l.startsWith('- ')).join('\n') : '';
  }).join('\n');
}

const recusa = (motivo, saida) => new ErroDeUso(`${motivo}\nPróximo passo: ${saida}`);

export async function executar(args, amb) {
  await reenviarComAviso(amb.dirEstado, { cwd: amb.raiz, env: amb.env }, amb.avisar);
  const o = lerOpcoes(args);
  if (!nomeValido(o.nome)) {
    throw recusa(`Nome de frente inválido: ${String(o.nome ?? '').slice(0, 40) || '(vazio)'}`, 'use de 2 a 49 caracteres: minúsculas, números e hífen, começando por letra ou número (ex.: ah open carrinho)');
  }
  const tickets = lerTickets(o.tickets);
  // Operação desta máquina ainda na fila para um ticket pedido (o reenvio acima não a tirou, ou outro comando está
  // reenviando): o GitHub ainda não mostra o que esta máquina fez nele, e reservar agora decidiria às cegas (uma
  // desistência velha do mesmo id, reenviada depois, liberaria a reserva nova). Recusa sem mudar nada.
  const presos = tickets.filter(n => temDoTicket(amb.dirEstado, n));
  if (presos.length) {
    throw recusa(`Não reservei: há comentário pendente para o ticket ${presos.map(n => `#${n}`).join(', ')} nesta máquina, que o GitHub ainda não recebeu.`,
      'rode de novo quando o GitHub responder; ah doctor mostra a fila');
  }
  const plano = conferirPlano(o.plano, amb.raiz);
  const caminhos = lerCaminhos(o.caminhos);
  const cfg = amb.config;
  const dirEstado = amb.dirEstado;
  // --para: o orquestrador abre (ou retoma) a frente em nome de outra sessão, que fica a dona. Apontando para a
  // própria sessão, é o open comum. Conferido aqui (antes da rede) e de novo sob a trava.
  let destino = null;
  if (o.para !== undefined) {
    // Sessão de quem chama ainda sem registro (primeiro comando dela): o próprio id não está na lista.
    const soEla = o.para !== '' && String(amb.sessaoId).startsWith(o.para) && !lerSessao(dirEstado, amb.sessaoId)
      && !listarSessoes(dirEstado).sessoes.some(x => String(x.id).startsWith(o.para));
    const alvoId = soEla ? amb.sessaoId : resolverSessao(dirEstado, o.para).id;
    if (alvoId !== amb.sessaoId) {
      destino = alvoId;
      conferirPara({ dirEstado, sessao: lerSessao(dirEstado, amb.sessaoId), destino, cfg, nome: o.nome });
    }
  }
  const dona = destino ?? amb.sessaoId;

  const maquina = lerJson(arquivoDaMaquina(amb.env, process.platform, os.homedir()), null);
  if (!siglaValida(maquina?.sigla)) {
    throw recusa('Esta máquina ainda não tem sigla.', 'rode ah init --sigla <sigla>, com 2 a 4 letras minúsculas');
  }
  const login = loginAtual({ cwd: amb.raiz, env: amb.env }) ?? (typeof maquina.login === 'string' ? maquina.login : 'local');
  const remoto = cfg.git.remoto;
  const ramo = cfg.git.prefixo + o.nome;

  const oGh = { cwd: amb.raiz, env: amb.env, avisar: amb.avisar };
  const rotulo = cfg.github.rotuloDeReserva;

  // Rede fora da trava das frentes: o fetch e (abaixo) a reserva podem levar segundos, e a trava segura o
  // começo de sessão, o close, o whoami e o papel de todas as sessões da máquina.
  const temRemoto = git(['remote'], { cwd: amb.raiz, env: amb.env }).saida.split('\n').includes(remoto);
  if (temRemoto) {
    const f = git(['fetch', '--', remoto, cfg.git.base], { cwd: amb.raiz, env: amb.env });
    if (f.codigo !== 0) amb.avisar(`Aviso: não consegui atualizar ${remoto}/${cfg.git.base}; sigo com o que há aqui. (${f.erro.trim().split('\n')[0]})\n`);
  }
  // Frente passada aqui, com tickets: o GitHub diz se outra máquina já a retomou (o registro local não sabe).
  const local = lerFrente(dirEstado, o.nome);
  const conferida = local?.estado === 'passada' && (local.tickets ?? []).length && !tickets.length
    ? conferirAntesDeRetomar(local, { amb, login, rotulo, oGh, dona }) : null;
  if (local?.estado === 'passada' && temRemoto) buscarRamo(amb, remoto, local.ramo ?? ramo);
  // Frente passada em outra máquina: sem estado nem ramo aqui e com o ramo no remoto, a passagem está nos tickets.
  const passagem = temRemoto && !local ? procurarPassagem({ amb, nome: o.nome, ramo, remoto, tickets, rotulo, oGh, login, dona }) : null;

  // O registro `abrindo` é deste open enquanto guarda este processo (mesma sessão pode rodar dois open).
  const processoDesteOpen = { pid: process.pid, inicio: inicioDoProcesso(process.pid) };
  const eDesteOpen = f => Boolean(f) && f.estado === 'abrindo' && f.processo?.pid === processoDesteOpen.pid
    && (f.processo?.inicio ?? null) === processoDesteOpen.inicio;

  // Fase 1, sob a trava: recusas locais, id e o registro `abrindo` (guarda id e nome contra outro open).
  const { frente, partida, retomada, remota } = await comTrava(dirEstado, 'frentes', async () => {
    let sessao = lerSessao(dirEstado, amb.sessaoId);
    if (!sessao) {
      const doAgente = !amb.env.AH_SESSAO && amb.env[VARIAVEL_SESSAO_CLAUDE];
      const pid = pidDeComando(amb.env);
      sessao = registrarSessao(dirEstado, { id: amb.sessaoId, agente: doAgente ? 'claude' : 'desconhecido', pid, pidInicio: pid === null ? null : inicioDoProcesso(pid) });
    } else {
      tocarSinal(dirEstado, amb.sessaoId);
    }
    // Registro `abrindo` de um open que parou no meio: só se toma quando o processo daquele open morreu (seja qual
    // for a sessão); este open o toma com o mesmo id (os marcadores nos tickets são desse id). Com o processo vivo
    // há uma abertura em curso. Registro sem processo (anterior a este campo): vale a vida da sessão dona.
    const existente = lerFrente(dirEstado, o.nome);
    // Frente ativa com o mesmo nome: não se abre nem se retoma; a saída depende da dona.
    if (existente?.estado === 'ativa') {
      const qual = `${existente.id} ${existente.nome}`;
      if (existente.dona === dona) throw recusa(`A frente ${qual} já é ${destino ? `da sessão ${idCurto(dona)}` : 'desta sessão'}.`, `trabalhe em ${existente.worktree}`);
      if (existente.dona === amb.sessaoId) {
        throw recusa(`A frente ${qual} é desta sessão.`,
          `para passá-la à sessão ${idCurto(dona)}, rode ah handoff ${o.nome} e depois ah open ${o.nome} --para ${idCurto(dona)}`);
      }
      if (existente.dona && donaViva(dirEstado, existente.dona, cfg)) {
        throw recusa(`A frente ${qual} está ativa com a sessão ${idCurto(existente.dona)}, que está viva.`,
          `peça à sessão ${idCurto(existente.dona)} que rode ah handoff; depois rode ah open ${o.nome}`);
      }
      throw recusa(`A frente ${qual} está ativa, mas a dona (${existente.dona ? `sessão ${idCurto(existente.dona)}` : 'nenhuma'}) não está viva.`,
        `para assumi-la, rode ah takeover ${o.nome}`);
    }
    if (existente?.estado === 'passada' && tickets.length) {
      throw recusa(`A frente ${existente.id} ${o.nome} está passada: os tickets vêm da frente passada; rode ah open ${o.nome} sem --tickets.`,
        `rode ah open ${o.nome} sem --tickets (com --plano e --caminhos, se quiser trocá-los)`);
    }
    let tomado = null;
    if (existente?.estado === 'abrindo') {
      const vivaDona = existente.dona === dona || (Boolean(existente.dona) && donaViva(dirEstado, existente.dona, cfg));
      const emCurso = aberturaEmCurso(existente.processo);
      if (emCurso ?? (existente.dona !== dona && vivaDona)) {
        throw recusa(`Há uma abertura da frente ${o.nome} em curso (sessão ${existente.dona ?? 'sem dona'}${existente.processo ? `, processo ${existente.processo.pid}` : ''}).`,
          `espere esse ah open terminar (ah board mostra a frente) ou escolha outro nome; se ele parou, rode ah open ${o.nome} de novo`);
      }
      tomado = existente;
    }
    // A dona da frente é a fonte: o executor com frente ativa (ou em abertura) não abre outra; o orquestrador abre quantas quiser.
    // Com --para, a regra vale para a destino (e quem chama precisa ser orquestrador).
    if (destino) {
      conferirPara({ dirEstado, sessao, destino, cfg, nome: tomado?.nome ?? null });
    } else if (sessao.papel !== 'orquestrador') {
      const minhas = frentesDa(listarFrentes(dirEstado), amb.sessaoId, { comAbrindo: true }).filter(f => f.nome !== tomado?.nome);
      if (minhas.length) {
        const nomes = minhas.map(f => f.nome);
        const saidas = minhas.map(f => (f.estado === 'abrindo'
          ? `ah open ${f.nome} para retomar a abertura parada, ou ah close ${f.nome} para desistir dela`
          : `ah close ${f.nome}`));
        throw recusa(`Esta sessão já tem a frente ${nomes.join(', ').slice(0, 60)}.`,
          `continue nela ou, antes de abrir outra, encerre com ${saidas.join('; ')} (o orquestrador abre várias: ah papel orquestrador)`);
      }
    }
    if (existente?.estado === 'passada') {
      // A conferência no GitHub foi feita fora da trava para esta mesma frente; se ela mudou no meio, de novo.
      const precisa = (existente.tickets ?? []).length > 0;
      if (precisa && (!conferida || local?.id !== existente.id || local?.estado !== 'passada')) {
        throw recusa(`A frente ${existente.id} ${o.nome} mudou enquanto eu conferia o GitHub.`, `rode ah open ${o.nome} de novo`);
      }
      const retomada = retomarSobTrava(existente, { amb, cfg, login, plano, caminhos, remoto, dona, destino });
      // Frente com tickets: sempre pelo servidor, com a corrida decidida (confirmarRetomada).
      return { retomada, remota: precisa ? { proprios: conferida.proprios, tipo: conferida.tipo, anterior: existente } : null };
    }
    if (!existente && passagem && !existeRamo(amb.raiz, ramo, { env: amb.env })) {
      const retomada = retomarSobTrava(frenteDaPassagem(passagem, { amb, cfg, ramo }), { amb, cfg, login, plano, caminhos, remoto, dona, destino });
      return { retomada, remota: { proprios: passagem.proprios ?? [], anterior: null } };
    }
    const repetido = existente && !tomado ? 'frente'
      : existeRamo(amb.raiz, ramo, { env: amb.env }) ? 'ramo local'
        : existeRamo(amb.raiz, ramo, { remoto, env: amb.env }) ? 'ramo remoto' : null;
    if (repetido === 'ramo local') {
      const wt = path.join(dirWorktrees(cfg, amb.env, process.platform, os.homedir()), o.nome);
      throw recusa(`Já existe ramo local com o nome ${o.nome}.`,
        `escolha outro nome para a frente; se é sobra de um ah open interrompido (sem trabalho a guardar), limpe com git worktree remove ${wt} (se a pasta existir) e git branch -d ${ramo}, e rode ah open de novo`);
    }
    if (repetido === 'ramo remoto') {
      throw recusa(`Já existe ramo remoto com o nome ${o.nome} (${remoto}/${ramo}), sem frente aberta nem passagem nos tickets.`,
        `escolha outro nome para a frente; se o ramo é de uma frente já fechada, confira que git log ${cfg.git.base}..${remoto}/${ramo} vem vazio e apague-o com git push ${remoto} --delete ${ramo}, e rode ah open de novo`);
    }
    if (repetido) throw recusa(`Já existe ${repetido} com o nome ${o.nome}.`, 'escolha outro nome para a frente');

    const partida = pontoDePartida(amb, cfg.git.base, remoto);
    if (partida.erro) throw new ErroDeUso(partida.erro);
    // Sem o harness no ponto de partida, o worktree nasceria sem tools/ah e sem gancho.
    if (git(['cat-file', '-e', `${partida.ponto}:tools/ah`], { cwd: amb.raiz, env: amb.env }).codigo !== 0) {
      throw recusa(`O harness ainda não está no ramo ${cfg.git.base} (${partida.ponto} não tem tools/ah); a frente nasceria sem ele.`,
        `faça o commit do harness lá: git switch ${cfg.git.base} e o git add/git commit que o ah init mostrou (rode tools/ah doctor para conferir)`);
    }

    const id = tomado?.id ?? proximoId({ sigla: maquina.sigla, historico: lerHistorico(amb, partida.refs), frentes: listarFrentes(dirEstado) });
    const dirWt = dirWorktrees(cfg, amb.env, process.platform, os.homedir());
    const nova = novaFrente({ id, nome: o.nome, config: cfg, dirWorktrees: dirWt, tickets, plano, caminhos, dona, login, agora: new Date() });
    if (destino) nova.atribuidaPor = amb.sessaoId;
    nova.estado = 'abrindo';
    nova.processo = processoDesteOpen;
    // Provisória: se o open morrer no meio, quem fechar o registro sabe que tickets liberar.
    nova.reserva = tickets.length ? { logins: [login], tickets: [...tickets] } : null;
    gravarFrente(dirEstado, nova);
    if (tomado) registrarEvento(dirEstado, { tipo: 'abertura-retomada', sessao: dona, frente: o.nome, id, de: tomado.dona ?? null });
    return { frente: nova, partida };
  }, { venceMs: 120000 });
  if (retomada) return terminarRetomada(retomada, { amb, login, oGh, rotulo, remota, dona, destino });
  const id = frente.id;

  // Some com o registro `abrindo` (se ainda é deste open).
  const soltarRegistro = () => comTrava(dirEstado, 'frentes', async () => {
    const f = lerFrente(dirEstado, frente.nome);
    if (eDesteOpen(f) && f.id === id) removerFrente(dirEstado, frente.nome);
  });

  // Fase 2, fora da trava: a reserva dos tickets no servidor.
  let reserva = null;
  if (tickets.length) {
    let r;
    try {
      r = reservar({ tickets, frente, login, sessao: dona, para: destino, rotulo, dirEstado }, oGh);
    } catch (e) {
      await soltarRegistro();
      throw e;
    }
    if (!r.ok) {
      if (r.desistiu) registrarEvento(dirEstado, { tipo: 'reserva-desistida', sessao: dona, frente: frente.nome, id, tickets, vencedor: r.id });
      await soltarRegistro();
      throw recusa(`Não reservei os tickets: ${r.motivo}`, r.saida);
    }
    frente.reserva = { logins: [login], tickets: r.reservados };
    reserva = r;
    for (const n of r.fechados) amb.avisar(`Aviso: o ticket #${n} está fechado; não o reservei (a frente o guarda na lista).\n`);
  } else {
    frente.reserva = null;
  }
  const desfazer = motivo => (frente.reserva?.tickets.length
    ? ` (reserva: ${desfazerReserva({ frente, login, sessao: dona, rotulo, dirEstado, motivo }, oGh)})` : '');

  // Fase 3, sob a trava: worktree e a frente vira ativa.
  await comTrava(dirEstado, 'frentes', async () => {
    const atual = lerFrente(dirEstado, frente.nome);
    if (!eDesteOpen(atual) || atual.id !== id) {
      // Outro open tomou o registro com este mesmo id: a reserva desse id agora é dele, não se desfaz.
      const tomadoPorOutro = atual?.id === id;
      const como = tomadoPorOutro ? '' : desfazer('o registro da frente sumiu durante a reserva');
      throw recusa(`O registro da frente ${frente.nome} não é mais deste ah open (${tomadoPorOutro ? 'outro ah open o tomou' : 'sumiu'}) enquanto ele reservava os tickets${como}.`,
        'rode ah board para ver quem está com ela e, se for o caso, abra com outro nome');
    }
    const g = git(['worktree', 'add', '-b', frente.ramo, frente.worktree, partida.ponto], { cwd: amb.raiz, env: amb.env });
    if (g.codigo !== 0) {
      if (existeRamo(amb.raiz, frente.ramo, { env: amb.env })) git(['branch', '-D', frente.ramo], { cwd: amb.raiz, env: amb.env });
      removerFrente(dirEstado, frente.nome);
      const como = desfazer('o git não criou o worktree');
      throw recusa(`O git não criou o worktree: ${(g.erro.trim() || 'sem mensagem').slice(0, 300)}${como}`, 'resolva o que o git descreve (ou escolha outro nome) e rode ah open de novo');
    }

    frente.estado = 'ativa';
    delete frente.processo;
    gravarFrente(dirEstado, frente);
    // O foco vai para a dona (com --para, a sessão destino; o de quem chama não muda).
    const sessao = lerSessao(dirEstado, dona);
    if (sessao) {
      sessao.frente = frente.nome;
      gravarSessao(dirEstado, sessao);
    }
    registrarEvento(dirEstado, { tipo: 'abertura', sessao: dona, frente: frente.nome, id, tickets });
    if (reserva) registrarEvento(dirEstado, { tipo: 'reserva', sessao: dona, frente: frente.nome, id, tickets: reserva.reservados, fechados: reserva.fechados });
    if (destino) registrarEvento(dirEstado, { tipo: 'atribuicao', sessao: amb.sessaoId, para: destino, frente: frente.nome, id });

    const sujos = git(['status', '--porcelain'], { cwd: amb.raiz, env: amb.env }).saida.split('\n').filter(Boolean);
    if (sujos.length) {
      amb.avisar(`Aviso: o checkout principal tem arquivos modificados (não os toquei):\n${sujos.map(l => `  ${l}`).join('\n')}\n`);
    }
    amb.escrever(`Frente ${id} ${frente.nome} aberta.\n${destino ? `Dona: sessão ${idCurto(destino)} (aberta por esta sessão).\n` : ''}Trabalhe em: ${frente.worktree}\n`);
  }, { venceMs: 120000 });

  // Fora da trava (o git das outras frentes pode demorar): avisos sobre quem já mexe no mesmo lugar. Nunca recusa.
  avisarDasOutrasSemFalhar(frente, caminhos, amb);
  avisarDeBloqueios(frente, amb);
  return 0;
}

// Retomada de frente passada, sob a trava `frentes` (a sessão já foi registrada e a regra do executor conferida):
// recria o worktree se sumiu, grava a dona e o foco. Devolve a frente ativa.
function retomarSobTrava(f, { amb, cfg, login, plano, caminhos, remoto, dona = amb.sessaoId, destino = null }) {
  const { dirEstado, env } = amb;
  const wt = typeof f.worktree === 'string' && f.worktree
    ? f.worktree : path.join(dirWorktrees(cfg, env, process.platform, os.homedir()), f.nome);
  if (!fs.existsSync(wt)) {
    // Registro velho de um worktree apagado à mão impediria o add.
    git(['worktree', 'prune'], { cwd: amb.raiz, env });
    let args;
    if (existeRamo(amb.raiz, f.ramo, { env })) args = ['worktree', 'add', wt, f.ramo];
    else if (existeRamo(amb.raiz, f.ramo, { remoto, env })) args = ['worktree', 'add', '--track', '-b', f.ramo, wt, `${remoto}/${f.ramo}`];
    else {
      throw recusa(`O worktree da frente ${f.id} ${f.nome} não existe e o ramo ${f.ramo} não está aqui nem em ${remoto}.`,
        `se o trabalho foi para outro lugar, encerre o registro com ah close ${f.nome}; se o ramo está em outro remoto, traga-o (git fetch) e rode ah open ${f.nome} de novo`);
    }
    const g = git(args, { cwd: amb.raiz, env });
    if (g.codigo !== 0) {
      throw recusa(`O git não recriou o worktree da frente ${f.nome}: ${(g.erro.trim() || 'sem mensagem').slice(0, 300)}`,
        `resolva o que o git descreve e rode ah open ${f.nome} de novo; a frente continua passada`);
    }
  }
  // O worktree que ficou (ou o recriado) precisa estar no ramo da frente e sem operação em andamento.
  const fora = recusaDoWorktree(f, wt, env, `ah open ${f.nome}`);
  if (fora) throw fora;
  const sujos = git(['status', '--porcelain'], { cwd: wt, env }).saida.split('\n').filter(Boolean);
  avancarDoRemoto(f, wt, sujos, { amb, remoto });
  if (sujos.length) {
    amb.avisar(`Aviso: o worktree ${wt} tem alterações não commitadas (${sujos.length}) deixadas por quem passou a frente; confira antes de seguir:\n${sujos.slice(0, 10).map(l => `  ${l}`).join('\n')}\n`);
  }
  const de = f.passadaPor ?? null;
  const retomada = { ...f, worktree: wt, dona, estado: 'ativa', retomadaEm: new Date().toISOString() };
  delete retomada.tomadaDe;
  delete retomada.tomadaEm;
  if (destino) retomada.atribuidaPor = amb.sessaoId;
  else delete retomada.atribuidaPor;
  if (plano !== null) retomada.plano = plano;
  if (caminhos.length) retomada.caminhos = caminhos;
  gravarFrente(dirEstado, retomada);
  const sessao = lerSessao(dirEstado, dona);
  if (sessao) gravarSessao(dirEstado, { ...sessao, frente: retomada.nome });
  registrarEvento(dirEstado, { tipo: 'retomada', sessao: dona, frente: retomada.nome, id: retomada.id, de, login });
  return retomada;
}

// Depois da trava: a retomada nos tickets (sem rede vai para a fila), a lista de logins da reserva e os avisos.
// Retomada de outra máquina (`remota`): direto no GitHub, com a corrida decidida; quem perde desfaz e recusa.
// `remota` (conferida no GitHub): {proprios, anterior}; `anterior` é o registro local de antes (null quando a
// frente veio de outra máquina), que volta se a retomada não fica.
async function terminarRetomada(frente, { amb, login, oGh, rotulo, remota = null, dona = amb.sessaoId, destino = null }) {
  if ((frente.tickets ?? []).length) {
    let r;
    if (remota) {
      // A confirmação fala direto com o GitHub: operação da fila desta máquina num desses tickets passaria para trás.
      const presos = async () => (frente.tickets ?? []).filter(n => temDoTicket(amb.dirEstado, n));
      if ((await presos()).length) await reenviarPendentes(amb.dirEstado, { cwd: amb.raiz, env: amb.env });
      const ainda = await presos();
      if (ainda.length) {
        const local = await desfazerRetomada(frente, amb, remota.anterior, dona);
        throw recusa(`Não retomei a frente ${frente.id} ${frente.nome}: há operações desta máquina na fila para ${ainda.map(n => `#${n}`).join(', ')} que precisam sair antes (aqui: ${local}).`,
          `tente de novo com rede: ah open ${frente.nome}`);
      }
      r = confirmarRetomada({ frente, login, sessao: dona, para: destino, rotulo, dirEstado: amb.dirEstado, proprios: remota.proprios, tipo: remota.tipo }, oGh);
      if (!r.ok) {
        const local = await desfazerRetomada(frente, amb, remota.anterior, dona);
        const qual = `${frente.id} ${frente.nome}`;
        if (r.vencedor) {
          throw recusa(`Não retomei ${frente.nome}: a frente ${frente.id} foi retomada antes por @${r.vencedor.login} (tickets: ${r.como}; aqui: ${local}).`,
            `combine com @${r.vencedor.login}, que está com a frente ${frente.id}; se ela passar a frente de novo (ah handoff), rode ah open ${frente.nome}`);
        }
        if (r.fechada) {
          throw recusa(`Não retomei ${frente.nome}: ${r.motivo}, em outra máquina (tickets: ${r.como}; aqui: ${local}).`,
            `o registro desta máquina ficou velho: ah close ${frente.nome} o tira (só o worktree e o registro daqui; os tickets não mudam)`);
        }
        throw recusa(`Não retomei a frente ${qual}: ${r.motivo} (tickets: ${r.como}; aqui: ${local}).`,
          `tente de novo com rede: ah open ${frente.nome}`);
      }
    } else {
      r = marcarTickets({
        frente, tipo: 'retomada', texto: `Frente ${frente.id} (${frente.nome}) retomada por @${login}${paraQuem(destino)}.`,
        login, sessao: dona, rotulo, dirEstado: amb.dirEstado, reatribuir: true,
      }, oGh);
      avisarDaMarcacao(r, amb.avisar);
    }
    if (frente.reserva && r.logins.length !== (frente.reserva.logins ?? []).length) {
      await comTrava(amb.dirEstado, 'frentes', async () => {
        const atual = lerFrente(amb.dirEstado, frente.nome);
        if (atual?.id !== frente.id || atual.dona !== dona || !atual.reserva) return;
        atual.reserva = { ...atual.reserva, logins: [...new Set([...(atual.reserva.logins ?? []), ...r.logins])] };
        gravarFrente(amb.dirEstado, atual);
        frente.reserva = atual.reserva;
      });
    }
  }
  if (destino) registrarEvento(amb.dirEstado, { tipo: 'atribuicao', sessao: amb.sessaoId, para: destino, frente: frente.nome, id: frente.id });
  amb.escrever(`Frente ${frente.id} ${frente.nome} retomada.\n${destino ? `Dona: sessão ${idCurto(destino)} (retomada por esta sessão).\n` : ''}Trabalhe em: ${frente.worktree}\n`);
  avisarDasOutrasSemFalhar(frente, Array.isArray(frente.caminhos) ? frente.caminhos.filter(c => typeof c === 'string') : [], amb);
  avisarDeBloqueios(frente, amb);
  return 0;
}

// Fora da trava: traz o ramo da frente do remoto (o que outra máquina empurrou). Falha não para nada: vale a
// referência que já houver.
function buscarRamo(amb, remoto, ramo) {
  git(['fetch', '--', remoto, `+refs/heads/${ramo}:refs/remotes/${remoto}/${ramo}`], { cwd: amb.raiz, env: amb.env });
}

// Sob a trava, na retomada: o ramo do remoto à frente do worktree avança por fast-forward (worktree limpo); com
// alterações soltas ou ramos divergentes, recusa sem mudar nada. Sem o ramo no remoto, ou o local à frente, segue.
function avancarDoRemoto(f, wt, sujos, { amb, remoto }) {
  const { env } = amb;
  const g = args => git(args, { cwd: wt, env });
  const refR = `refs/remotes/${remoto}/${f.ramo}`;
  if (!remoto || g(['show-ref', '--verify', '--quiet', refR]).codigo !== 0) return;
  const aqui = g(['rev-parse', `refs/heads/${f.ramo}`]).saida.trim();
  const la = g(['rev-parse', refR]).saida.trim();
  if (!aqui || aqui === la || g(['merge-base', '--is-ancestor', refR, `refs/heads/${f.ramo}`]).codigo === 0) return;
  if (g(['merge-base', '--is-ancestor', `refs/heads/${f.ramo}`, refR]).codigo !== 0) {
    throw recusa(`O ramo ${f.ramo} daqui e o de ${remoto} divergiram (cada um tem commits que o outro não tem).`,
      `junte os dois no worktree (git -C ${wt} pull --rebase ${remoto} ${f.ramo}, ou merge), confira e rode ah open ${f.nome} de novo`);
  }
  if (sujos.length) {
    throw recusa(`O ramo ${f.ramo} em ${remoto} está à frente do worktree ${wt}, que tem alterações não commitadas (${sujos.length}).`,
      `faça o commit (ou guarde) as alterações no worktree, traga o remoto (git -C ${wt} pull --rebase ${remoto} ${f.ramo}) e rode ah open ${f.nome} de novo`);
  }
  const m = g(['merge', '--ff-only', refR]);
  if (m.codigo !== 0) {
    throw recusa(`O git não avançou o worktree ${wt} até ${remoto}/${f.ramo}: ${(m.erro.trim() || 'sem mensagem').split('\n')[0].slice(0, 200)}`,
      `resolva o que o git descreve e rode ah open ${f.nome} de novo`);
  }
  amb.avisar(`Aviso: o worktree ${wt} avançou até ${remoto}/${f.ramo} (commits empurrados por quem retomou a frente em outra máquina).\n`);
}

// Fora da trava, antes de retomar uma frente passada desta máquina que tem tickets: confere no GitHub que ninguém a
// retomou. Operação desta máquina ainda na fila para um dos tickets (o open já tentou o reenvio) recusa: o GitHub
// ainda não mostra o que esta máquina fez. Devolve {proprios}; senão recusa.
function conferirAntesDeRetomar(local, { amb, login, rotulo, oGh, dona = amb.sessaoId }) {
  const nome = local.nome;
  const presos = local.tickets.filter(n => temDoTicket(amb.dirEstado, n));
  if (presos.length) {
    throw recusa(`Não retomei a frente ${local.id} ${nome}: há operações desta máquina na fila para ${presos.map(n => `#${n}`).join(', ')} que precisam sair antes.`,
      `tente de novo com rede: ah open ${nome}`);
  }
  const sessoesDaqui = sessoesDaquiDaFrente(amb.dirEstado, local, [local.passadaPor, local.passadaDe]);
  const q = quemTemAFrente({ frente: local, login, sessao: dona, rotulo, sessoesDaqui }, oGh);
  const fechar = `o registro desta máquina ficou velho: ah close ${nome} o tira (só o worktree e o registro daqui; os tickets não mudam)`;
  switch (q.situacao) {
    case 'passada': return { proprios: [] };
    case 'daqui': return { proprios: [], tipo: 'tomada' };
    case 'propria': return { proprios: q.proprios };
    case 'outra':
      throw recusa(`Não retomei ${nome}: a frente ${q.id} está ativa com @${q.login} em outra máquina.`, `combine com @${q.login}; ${fechar}`);
    case 'solta':
      throw recusa(`Não retomei ${nome}: nos tickets (${local.tickets.map(n => `#${n}`).join(', ')}) a frente ${local.id} não está passada (foi fechada, ou a passagem não está lá).`,
        `confira os tickets; se ela foi fechada em outra máquina, ${fechar}`);
    case 'nao-achei':
      throw recusa(`Não retomei ${nome}: não achei o ticket #${q.ticket} da frente ${local.id}.`,
        `confira o ticket #${q.ticket}; se ele foi apagado, encerre com ah close ${nome}`);
    default:
      throw recusa(`Não retomei ${nome}: preciso do GitHub para confirmar que ninguém retomou ${nome} (${q.motivo}).`, `tente de novo com rede: ah open ${nome}`);
  }
}

// Fora da trava (o fetch e o gh levam rede): sem frente nem ramo locais e com o ramo `<prefixo><nome>` no remoto,
// procura a passagem nos tickets (`--tickets` só diz onde procurar). Devolve a passagem ou recusa.
function procurarPassagem({ amb, nome, ramo, remoto, tickets, rotulo, oGh, login, dona = amb.sessaoId }) {
  if (lerFrente(amb.dirEstado, nome) || existeRamo(amb.raiz, ramo, { env: amb.env })) return null;
  // Um ramo que não existe lá faz o fetch falhar; o que vale é a referência depois dele.
  git(['fetch', '--', remoto, `+refs/heads/${ramo}:refs/remotes/${remoto}/${ramo}`], { cwd: amb.raiz, env: amb.env });
  if (!existeRamo(amb.raiz, ramo, { remoto, env: amb.env })) return null;
  const a = acharPassagem({ nome, tickets, rotulo }, oGh);
  if (a.naoAchei) {
    throw recusa(`Não achei o ticket #${a.naoAchei} (dado em --tickets) para procurar a passagem de ${nome}.`,
      `confira o número e rode ah open ${nome} --tickets <n> com o ticket da frente`);
  }
  if (!a.ok) {
    throw recusa(`Já existe ramo remoto com o nome ${nome}, e preciso do GitHub para achar a passagem de ${nome} (${a.motivo}).`,
      `tente de novo com rede; se ${nome} não é uma frente passada, escolha outro nome`);
  }
  // Retomada desta mesma sessão que parou no meio (o registro local se perdeu): continua de onde parou.
  if (a.ativa && ativaDaSessao(a.ativa, { login, sessao: dona })) {
    return { ...a.ativa.frente, logins: a.ativa.logins.filter(l => l !== login), login, proprios: [a.ativa.numero] };
  }
  if (a.ativa) {
    throw recusa(`Não retomei ${nome}: a frente ${a.ativa.id} está ativa com @${a.ativa.login} em outra máquina.`,
      `combine com @${a.ativa.login}: peça que rode ah handoff lá e depois rode ah open ${nome}; ou escolha outro nome`);
  }
  if (!a.passagem) {
    throw recusa(`Já existe ramo remoto com o nome ${nome}, sem passagem de bastão achada.`,
      `se é uma frente passada, rode ah open ${nome} --tickets <n> com o ticket dela; se é o ramo de uma frente já fechada, confira que git log ${amb.config.git.base}..${remoto}/${ramo} vem vazio, apague-o com git push ${remoto} --delete ${ramo} e rode ah open ${nome} de novo; senão escolha outro nome`);
  }
  return a.passagem;
}

// Sob a trava: a frente passada reconstruída do marcador da passagem (mesmo id), pronta para retomarSobTrava.
function frenteDaPassagem(passagem, { amb, cfg, ramo }) {
  const { dirEstado, env } = amb;
  const igual = listarFrentes(dirEstado).find(f => f.id === passagem.id && f.nome !== passagem.nome);
  if (igual) {
    throw recusa(`A passagem de ${passagem.nome} é da frente ${passagem.id}, mas já existe aqui a frente ${igual.id} ${igual.nome} (máquinas com a mesma sigla).`,
      `retome ${passagem.nome} numa máquina sem a frente ${igual.id}, ou encerre ${igual.nome} aqui (ah close ${igual.nome}) e rode ah open ${passagem.nome}; para não repetir, dê siglas diferentes às máquinas (ah init --sigla)`);
  }
  const wt = path.join(dirWorktrees(cfg, env, process.platform, os.homedir()), passagem.nome);
  if (fs.existsSync(wt)) {
    throw recusa(`A pasta do worktree da frente ${passagem.nome} já existe (${wt}) e não é de nenhuma frente desta máquina.`,
      `confira o que há nela; se é sobra, apague-a (ou git worktree remove ${wt}) e rode ah open ${passagem.nome} de novo`);
  }
  return {
    esquema: ESQUEMA_DO_ESTADO, id: passagem.id, nome: passagem.nome, ramo, worktree: wt,
    tickets: [...passagem.tickets], plano: passagem.plano ?? null, caminhos: [], dona: null,
    abertaPor: passagem.abertaPor ?? passagem.login, abertaEm: passagem.abertaEm ?? null,
    estado: 'passada', notas: [], reserva: { logins: [...passagem.logins], tickets: [...passagem.tickets] }, passadaPor: null,
  };
}

// A retomada conferida perdeu (ou falhou). Frente que já estava aqui (`anterior`): volta o registro de antes,
// passado, e o worktree fica. Frente vinda de outra máquina: apaga o worktree, o ramo e o registro criados.
// Devolve o texto do que fez.
async function desfazerRetomada(frente, amb, anterior = null, dona = amb.sessaoId) {
  const { dirEstado, env } = amb;
  return comTrava(dirEstado, 'frentes', async () => {
    const atual = lerFrente(dirEstado, frente.nome);
    if (atual?.id !== frente.id || atual.dona !== dona) return 'o registro mudou; não mexi nele';
    const soltarFoco = () => {
      const sessao = lerSessao(dirEstado, dona);
      if (sessao && (sessao.frente?.nome ?? sessao.frente) === frente.nome) gravarSessao(dirEstado, { ...sessao, frente: null });
    };
    if (anterior) {
      gravarFrente(dirEstado, anterior);
      soltarFoco();
      registrarEvento(dirEstado, { tipo: 'retomada-desfeita', sessao: dona, frente: frente.nome, id: frente.id });
      return 'o registro voltou a passada; o worktree ficou';
    }
    const w = git(['worktree', 'remove', '--force', frente.worktree], { cwd: amb.raiz, env });
    const b = w.codigo === 0 ? git(['branch', '-D', frente.ramo], { cwd: amb.raiz, env }) : w;
    removerFrente(dirEstado, frente.nome);
    soltarFoco();
    registrarEvento(dirEstado, { tipo: 'retomada-desfeita', sessao: dona, frente: frente.nome, id: frente.id });
    return b.codigo === 0 ? 'desfiz o worktree, o ramo e o registro'
      : `apaguei o registro, mas o git não apagou o worktree ou o ramo (${(b.erro.trim() || 'sem mensagem').split('\n')[0].slice(0, 200)}); apague à mão ${frente.worktree} e o ramo ${frente.ramo}`;
  }, { venceMs: 120000 });
}

// A frente já está ativa: qualquer erro aqui vira aviso, e o open sai com 0.
// Ticket bloqueado por outro aberto, pela leitura guardada do `ah deps` (sem rede): avisa, não recusa (decisão 19).
function avisarDeBloqueios(frente, amb) {
  try {
    for (const l of avisosDeBloqueio(amb.dirEstado, frente.tickets, amb.config.fuso)) amb.avisar(`${l}\n`);
  } catch { /* o aviso é ajuda: falhar aqui não muda a abertura */ }
}

export function avisarDasOutrasSemFalhar(minha, caminhos, amb) {
  try {
    avisarDasOutras(minha, caminhos, amb);
  } catch (e) {
    amb.avisar(`Aviso: não consegui conferir as outras frentes (${String(e?.message ?? e).split('\n')[0].slice(0, 120)}).\n`);
  }
}

const LIMITE_NOTA = 120;
const NOTAS_MOSTRADAS = 3;
const ARQUIVOS_MOSTRADOS = 10;
const TEMPO_DO_GIT_POR_CHAMADA_MS = 5000;

const linhaUnica = (texto, limite) => {
  const t = String(texto ?? '').replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, ' ').replace(/\s+/g, ' ').trim();
  return t.length > limite ? `${t.slice(0, limite - 1)}…` : t;
};

// Para cada outra frente ativa (ou em abertura): as últimas notas e, com --caminhos, o que ela já mudou
// dentro deles e os caminhos que ela declarou em comum.
function avisarDasOutras(minha, caminhos, amb) {
  const { frentes } = listarFrentesTolerante(amb.dirEstado);
  const outras = frentes.filter(f => f.nome !== minha.nome && (f.estado === 'ativa' || f.estado === 'abrindo'));
  const linhas = [];
  for (const f of outras) {
    const rotulo = `${linhaUnica(f.id, 20)} ${linhaUnica(f.nome, 49)}`;
    const notas = (Array.isArray(f.notas) ? f.notas : []).slice(-NOTAS_MOSTRADAS);
    if (notas.length) {
      linhas.push(`Notas de ${rotulo}:`, ...notas.map(n => `  ${linhaUnica(`${String(n?.em ?? '').slice(0, 10)} ${n?.texto ?? ''}`, LIMITE_NOTA)}`));
    }
    if (!caminhos.length) continue;
    const arquivos = f.estado === 'ativa'
      ? arquivosDaFrente(f, { raiz: amb.raiz, base: amb.config.git.base, env: amb.env, tempoPorChamadaMs: TEMPO_DO_GIT_POR_CHAMADA_MS })
      : [];
    const tocados = tocaOsCaminhos(arquivos, caminhos);
    if (tocados.length) {
      const lista = tocados.slice(0, ARQUIVOS_MOSTRADOS).map(a => linhaUnica(a, 120)).join(', ');
      const resto = tocados.length > ARQUIVOS_MOSTRADOS ? ` e mais ${tocados.length - ARQUIVOS_MOSTRADOS}` : '';
      linhas.push(`Atenção: ${rotulo} já mudou ${tocados.length} arquivo(s) de --caminhos: ${lista}${resto}`);
    }
    const comuns = caminhosEmComum(Array.isArray(f.caminhos) ? f.caminhos.filter(c => typeof c === 'string') : [], caminhos);
    if (comuns.length) linhas.push(`Atenção: ${rotulo} declarou os mesmos caminhos: ${linhaUnica(comuns.join(','), 200)}`);
  }
  if (linhas.length) amb.avisar(`${linhas.join('\n')}\n`);
}

// --para: quem chama precisa ser orquestrador; a destino, viva; destino executora não recebe com frente (ativa ou em
// abertura) que não seja `nome` (a abertura parada dela que este open toma). Destino orquestradora recebe.
function conferirPara({ dirEstado, sessao, destino, cfg, nome = null }) {
  if (sessao?.papel !== 'orquestrador') {
    throw recusa(`Só o orquestrador abre frente para outra sessão, e esta sessão (${sessao ? idCurto(sessao.id) : 'sem registro'}) é ${sessao?.papel ?? 'executor'}.`,
      'ah papel orquestrador');
  }
  const alvo = lerSessao(dirEstado, destino);
  if (!alvo || !donaViva(dirEstado, destino, cfg)) {
    throw recusa(`A sessão ${idCurto(destino)} não está viva; uma frente aberta para ela ficaria sem ninguém.`,
      'confira as sessões vivas em tools/ah board');
  }
  if (alvo.papel !== 'orquestrador') {
    const delas = frentesDa(listarFrentes(dirEstado), destino, { comAbrindo: true }).filter(f => f.nome !== nome);
    if (delas.length) {
      throw recusa(`A sessão ${idCurto(destino)} é executora e já tem a frente ${delas.map(f => f.nome).join(', ').slice(0, 60)}.`,
        'escolha outra sessão ou peça a ela ah handoff');
    }
  }
}

// A sessão está viva? Arquivo ilegível conta como não viva.
function donaViva(dirEstado, id, config) {
  try {
    return vidaDaSessao(dirEstado, id, { config }).estado === 'viva';
  } catch {
    return false;
  }
}
