import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ErroDeUso, arquivoDaMaquina, dirWorktrees } from '../lib/caminhos.mjs';
import { comTrava, lerJson, registrarEvento } from '../lib/estado.mjs';
import { frentesDa, gravarFrente, lerFrente, listarFrentes, listarFrentesTolerante, nomeValido, novaFrente, proximoId, removerFrente, siglaValida } from '../lib/frente.mjs';
import { existeRamo, git } from '../lib/git.mjs';
import { loginAtual } from '../lib/github.mjs';
import { reenviarComAviso } from '../lib/pendentes.mjs';
import { desfazerReserva, reservar } from '../lib/reserva.mjs';
import { arquivosDaFrente, caminhosEmComum, tocaOsCaminhos } from '../lib/sobreposicao.mjs';
import { gravarSessao, lerSessao, registrarSessao, tocarSinal, VARIAVEL_SESSAO_CLAUDE } from '../lib/sessao.mjs';
import { inicioDoProcesso, pidDeComando, vidaDaSessao } from '../lib/vida.mjs';

export const descricao = 'abre uma frente de trabalho: ramo, worktree, registro e reserva dos tickets';
export const uso = 'ah open <nome> [--tickets 1,2] [--plano <arquivo>] [--caminhos <globs>]';
export const requisitos = { config: true, sessao: true };

const COM_VALOR = new Set(['--tickets', '--plano', '--caminhos']);
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
  const plano = conferirPlano(o.plano, amb.raiz);
  const caminhos = lerCaminhos(o.caminhos);
  const cfg = amb.config;
  const dirEstado = amb.dirEstado;

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

  // Fase 1, sob a trava: recusas locais, id e o registro `abrindo` (guarda id e nome contra outro open).
  const { frente, partida } = await comTrava(dirEstado, 'frentes', async () => {
    let sessao = lerSessao(dirEstado, amb.sessaoId);
    if (!sessao) {
      const doAgente = !amb.env.AH_SESSAO && amb.env[VARIAVEL_SESSAO_CLAUDE];
      const pid = pidDeComando(amb.env);
      sessao = registrarSessao(dirEstado, { id: amb.sessaoId, agente: doAgente ? 'claude' : 'desconhecido', pid, pidInicio: pid === null ? null : inicioDoProcesso(pid) });
    } else {
      tocarSinal(dirEstado, amb.sessaoId);
    }
    // Registro `abrindo` de um open que parou no meio (dona que não está viva, ou esta mesma sessão): este open
    // o toma, com o mesmo id (os marcadores nos tickets são desse id). Com a dona viva, ela ainda está abrindo.
    const existente = lerFrente(dirEstado, o.nome);
    let tomado = null;
    if (existente?.estado === 'abrindo') {
      if (existente.dona !== amb.sessaoId && existente.dona && donaViva(dirEstado, existente.dona, cfg)) {
        throw recusa(`A sessão ${existente.dona} está abrindo a frente ${o.nome} agora.`,
          `espere ela terminar (ah board mostra a frente) ou escolha outro nome; se ela parou, rode ah open ${o.nome} de novo quando o sinal de vida dela vencer`);
      }
      tomado = existente;
    }
    // A dona da frente é a fonte: o executor com frente ativa (ou em abertura) não abre outra; o orquestrador abre quantas quiser.
    if (sessao.papel !== 'orquestrador') {
      const minhas = frentesDa(listarFrentes(dirEstado), amb.sessaoId, { comAbrindo: true }).filter(f => f.nome !== tomado?.nome);
      if (minhas.length) {
        const nomes = minhas.map(f => f.nome);
        throw recusa(`Esta sessão já tem a frente ${nomes.join(', ').slice(0, 60)}.`,
          `continue nela ou, antes de abrir outra, encerre com ${nomes.map(n => `ah close ${n}`).join('; ')} (o orquestrador abre várias: ah papel orquestrador)`);
      }
    }
    const repetido = existente && !tomado ? 'frente'
      : existeRamo(amb.raiz, ramo, { env: amb.env }) ? 'ramo local'
        : existeRamo(amb.raiz, ramo, { remoto, env: amb.env }) ? 'ramo remoto' : null;
    if (repetido === 'ramo local') {
      const wt = path.join(dirWorktrees(cfg, amb.env, process.platform, os.homedir()), o.nome);
      throw recusa(`Já existe ramo local com o nome ${o.nome}.`,
        `escolha outro nome para a frente; se é sobra de um ah open interrompido (sem trabalho a guardar), limpe com git worktree remove ${wt} (se a pasta existir) e git branch -d ${ramo}, e rode ah open de novo`);
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
    const nova = novaFrente({ id, nome: o.nome, config: cfg, dirWorktrees: dirWt, tickets, plano, caminhos, dona: amb.sessaoId, login, agora: new Date() });
    nova.estado = 'abrindo';
    // Provisória: se o open morrer no meio, quem fechar o registro sabe que tickets liberar.
    nova.reserva = tickets.length ? { logins: [login], tickets: [...tickets] } : null;
    gravarFrente(dirEstado, nova);
    if (tomado) registrarEvento(dirEstado, { tipo: 'abertura-retomada', sessao: amb.sessaoId, frente: o.nome, id, de: tomado.dona ?? null });
    return { frente: nova, partida };
  }, { venceMs: 120000 });
  const id = frente.id;

  // Some com o registro `abrindo` (se ainda é deste open).
  const soltarRegistro = () => comTrava(dirEstado, 'frentes', async () => {
    const f = lerFrente(dirEstado, frente.nome);
    if (f && f.estado === 'abrindo' && f.dona === amb.sessaoId && f.id === id) removerFrente(dirEstado, frente.nome);
  });

  // Fase 2, fora da trava: a reserva dos tickets no servidor.
  let reserva = null;
  if (tickets.length) {
    let r;
    try {
      r = reservar({ tickets, frente, login, sessao: amb.sessaoId, rotulo, dirEstado }, oGh);
    } catch (e) {
      await soltarRegistro();
      throw e;
    }
    if (!r.ok) {
      if (r.desistiu) registrarEvento(dirEstado, { tipo: 'reserva-desistida', sessao: amb.sessaoId, frente: frente.nome, id, tickets, vencedor: r.id });
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
    ? ` (reserva: ${desfazerReserva({ frente, login, sessao: amb.sessaoId, rotulo, dirEstado, motivo }, oGh)})` : '');

  // Fase 3, sob a trava: worktree e a frente vira ativa.
  await comTrava(dirEstado, 'frentes', async () => {
    const atual = lerFrente(dirEstado, frente.nome);
    if (!atual || atual.estado !== 'abrindo' || atual.dona !== amb.sessaoId || atual.id !== id) {
      const como = desfazer('outra sessão tomou o registro da frente');
      throw recusa(`Outra sessão tomou o registro da frente ${frente.nome} enquanto esta reservava os tickets${como}.`, 'rode ah board para ver quem está com ela e, se for o caso, abra com outro nome');
    }
    const g = git(['worktree', 'add', '-b', frente.ramo, frente.worktree, partida.ponto], { cwd: amb.raiz, env: amb.env });
    if (g.codigo !== 0) {
      if (existeRamo(amb.raiz, frente.ramo, { env: amb.env })) git(['branch', '-D', frente.ramo], { cwd: amb.raiz, env: amb.env });
      removerFrente(dirEstado, frente.nome);
      const como = desfazer('o git não criou o worktree');
      throw recusa(`O git não criou o worktree: ${(g.erro.trim() || 'sem mensagem').slice(0, 300)}${como}`, 'resolva o que o git descreve (ou escolha outro nome) e rode ah open de novo');
    }

    frente.estado = 'ativa';
    gravarFrente(dirEstado, frente);
    const sessao = lerSessao(dirEstado, amb.sessaoId);
    if (sessao) {
      sessao.frente = frente.nome;
      gravarSessao(dirEstado, sessao);
    }
    registrarEvento(dirEstado, { tipo: 'abertura', sessao: amb.sessaoId, frente: frente.nome, id, tickets });
    if (reserva) registrarEvento(dirEstado, { tipo: 'reserva', sessao: amb.sessaoId, frente: frente.nome, id, tickets: reserva.reservados, fechados: reserva.fechados });

    const sujos = git(['status', '--porcelain'], { cwd: amb.raiz, env: amb.env }).saida.split('\n').filter(Boolean);
    if (sujos.length) {
      amb.avisar(`Aviso: o checkout principal tem arquivos modificados (não os toquei):\n${sujos.map(l => `  ${l}`).join('\n')}\n`);
    }
    amb.escrever(`Frente ${id} ${frente.nome} aberta.\nTrabalhe em: ${frente.worktree}\n`);
  }, { venceMs: 120000 });

  // Fora da trava (o git das outras frentes pode demorar): avisos sobre quem já mexe no mesmo lugar. Nunca recusa.
  try {
    avisarDasOutras(frente, caminhos, amb);
  } catch (e) {
    if (e?.name === 'ErroDeUso') throw e;
    amb.avisar(`Aviso: não consegui conferir as outras frentes (${String(e?.message ?? e).split('\n')[0].slice(0, 120)}).\n`);
  }
  return 0;
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

// A sessão está viva? Arquivo ilegível conta como não viva.
function donaViva(dirEstado, id, config) {
  try {
    return vidaDaSessao(dirEstado, id, { config }).estado === 'viva';
  } catch {
    return false;
  }
}
