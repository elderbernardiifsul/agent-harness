// Achados e reparos do `ah sweep`: o que está fora do lugar no estado desta máquina, e o reparo que mexe só no
// estado (nunca apaga worktree, ramo nem arquivo ilegível). Sem rede nos achados; nos reparos, só o reenvio da fila.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { arquivoDaMaquina, dirWorktrees as caminhoDosWorktrees, normalizarCaminho } from './caminhos.mjs';
import { ErroDeEstado, comTrava, lerJson, registrarEvento } from './estado.mjs';
import { gravarFrente, lerFrente, listarFrentesTolerante, nomeValido, novaFrente, proximoId, siglaValida } from './frente.mjs';
import { existeRamo, git, ramoAtual } from './git.mjs';
import { contarPendentes, lerFila, reenviarPendentes } from './pendentes.mjs';
import { apagarSessao, gravarSessao, idadeDoSinalMs, idCurto, listarSessoes } from './sessao.mjs';
import { aberturaParada, frenteOrfa, vidaDaDona } from './vida.mjs';

// Sessão parada há mais que isto (e a passagem feita há mais que isto) pode ser apagada pelo reparo.
export const PRAZO_DA_SESSAO_MORTA_MS = 7 * 24 * 60 * 60000;
const ARQUIVO_DO_HISTORICO = 'docs/agents/historico-das-frentes.md';
const PRAZO_DO_GIT_MS = 10000;
const PRAZO_DO_REENVIO_MS = 10000;

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const achado = (tipo, detalhe, saida) => ({ tipo, detalhe, saida });
const SAIDA_ILEGIVEL = 'apague ou conserte o arquivo (rode ah doctor)';
const nomeDoFoco = s => (s?.frente ? (s.frente.nome ?? s.frente) : null);

// Worktrees de `git worktree list --porcelain`: [{caminho, ramo, principal, prunable}]; o primeiro é o principal.
function listarWorktrees(raiz, env) {
  const r = git(['worktree', 'list', '--porcelain'], { cwd: raiz, env, timeoutMs: PRAZO_DO_GIT_MS });
  if (r.codigo !== 0) return [];
  const lista = [];
  for (const bloco of r.saida.split(/\n\s*\n/)) {
    const linhas = bloco.split('\n').filter(Boolean);
    const wt = linhas.find(l => l.startsWith('worktree '));
    if (!wt) continue;
    const ramo = linhas.find(l => l.startsWith('branch '))?.slice('branch '.length).replace(/^refs\/heads\//, '') ?? null;
    lista.push({ caminho: wt.slice('worktree '.length), ramo, principal: lista.length === 0, prunable: linhas.some(l => l.startsWith('prunable')) });
  }
  return lista;
}

// `--no-optional-locks`: o sweep só olha; o `git status` não regrava o índice (nem disputa a trava dele com quem trabalha).
const linhasDoStatus = (cwd, env) => {
  const r = git(['--no-optional-locks', 'status', '--porcelain'], { cwd, env, timeoutMs: PRAZO_DO_GIT_MS });
  return r.codigo === 0 ? r.saida.split('\n').filter(l => l.trim()).length : null;
};

// Commits do HEAD do worktree que não estão na base nem em nenhum ramo do remoto.
function commitsSoltos(cwd, base, env) {
  const args = ['rev-list', '--count', 'HEAD', '--not', '--remotes'];
  if (existeRamo(cwd, base, { env })) args.push(`refs/heads/${base}`);
  const r = git(args, { cwd, env, timeoutMs: PRAZO_DO_GIT_MS });
  return r.codigo === 0 ? Number(r.saida.trim()) : null;
}

const idadeDe = (dirEstado, s, agora) => {
  const sinal = idadeDoSinalMs(dirEstado, s.id, agora);
  if (sinal !== null) return sinal;
  const em = Date.parse(s.fim ?? s.inicio);
  return Number.isFinite(em) ? Math.max(0, agora - em) : null;
};

// Frente (fora da abertura) cujo worktree não existe: o achado `worktree-sumiu` do sweep e o item do doctor.
export const worktreeSumiu = f => f?.estado !== 'abrindo' && (typeof f?.worktree !== 'string' || !fs.existsSync(f.worktree));

// O conserto de uma linha ilegível da fila de pendentes (o mesmo no sweep e no doctor).
export const consertoDaLinhaDePendentes = (linha, arquivo) => `apague a linha ${linha} de ${arquivo} (o próximo reenvio com rede, ah sweep --reparar, também a descarta)`;

// Tudo o que o sweep vê, com o que o reparo usa: {lista, sessoesMortas, reconstruiveis}.
function levantar(amb) {
  const { dirEstado, raiz, config: cfg, env } = amb;
  const agora = Date.now();
  const lista = [];
  const sessoesMortas = [];
  const reconstruiveis = [];

  const { frentes, ilegiveis: frentesIlegiveis } = listarFrentesTolerante(dirEstado);
  const { sessoes, ilegiveis: sessoesIlegiveis } = listarSessoes(dirEstado);
  for (const id of sessoesIlegiveis) lista.push(achado('estado-ilegivel', path.join(dirEstado, 'sessoes', `${id}.json`), SAIDA_ILEGIVEL));
  for (const nome of frentesIlegiveis) lista.push(achado('estado-ilegivel', path.join(dirEstado, 'frentes', `${nome}.json`), SAIDA_ILEGIVEL));

  const vidas = new Map();
  const vida = id => {
    if (!vidas.has(id)) vidas.set(id, vidaDaDona(dirEstado, id, { config: cfg, agora }));
    return vidas.get(id);
  };

  for (const f of frentes) {
    const qual = `frente ${f.id} ${f.nome}`;
    const v = vida(f.dona);
    if (f.estado === 'abrindo') {
      // Como o open e o doctor: o open parou entre a reserva e o worktree; não há worktree nem ramo a conferir.
      if (aberturaParada(f, v?.estado === 'viva')) {
        lista.push(achado('abertura-parada', `${qual}, sessão ${f.dona ? idCurto(f.dona) : 'sem dona'}${f.processo ? `, processo ${f.processo.pid} morto` : ''}`,
          `ah open ${f.nome} para terminar, ou ah close ${f.nome} para desistir`));
      }
      continue;
    }
    if (frenteOrfa(f, v)) {
      lista.push(achado('frente-orfa', `${qual}, ${f.dona ? `dona ${idCurto(f.dona)} (${v.motivo})` : 'sem dona'}`, `ah takeover ${f.nome} (com a ordem do executivo)`));
    }
    if (worktreeSumiu(f)) {
      lista.push(achado('worktree-sumiu', `${qual}, worktree ${f.worktree}`, `ah close ${f.nome}`));
    }
    if (typeof f.ramo === 'string' && !existeRamo(raiz, f.ramo, { env }) && !existeRamo(raiz, f.ramo, { remoto: cfg.git.remoto, env })) {
      lista.push(achado('ramo-sumiu', `${qual}, ramo ${f.ramo}`, `confira com quem abriu; ah close ${f.nome}`));
    }
  }

  // Worktrees sem frente. Um nome de frente ilegível pode ser a frente do worktree: fica com o estado-ilegivel.
  const dirWt = caminhoDosWorktrees(cfg, env, process.platform, os.homedir());
  const dasFrentes = new Set(frentes.filter(f => typeof f.worktree === 'string').map(f => normalizarCaminho(f.worktree)));
  const dosIlegiveis = new Set(frentesIlegiveis.map(n => normalizarCaminho(path.join(dirWt, n))));
  for (const wt of listarWorktrees(raiz, env)) {
    if (wt.principal || wt.prunable) continue;
    const norm = normalizarCaminho(wt.caminho);
    if (dasFrentes.has(norm) || dosIlegiveis.has(norm)) continue;
    const nome = path.basename(wt.caminho);
    const noPadrao = nomeValido(nome) && wt.ramo === cfg.git.prefixo + nome && normalizarCaminho(path.join(dirWt, nome)) === norm;
    const commits = commitsSoltos(wt.caminho, cfg.git.base, env);
    const sujos = linhasDoStatus(wt.caminho, env);
    const partes = [
      `ramo ${wt.ramo ?? 'nenhum (HEAD solto)'}`,
      commits === null ? 'commits fora da base e do remoto: ?' : `${plural(commits, 'commit', 'commits')} fora da base e do remoto`,
      sujos === null ? 'arquivos sujos: ?' : plural(sujos, 'arquivo sujo', 'arquivos sujos'),
    ];
    lista.push(achado('worktree-sem-frente', `${wt.caminho} (${partes.join(', ')})`,
      noPadrao ? 'ah sweep --reparar' : 'confira e git worktree remove à mão'));
    if (noPadrao) reconstruiveis.push({ nome, caminho: wt.caminho });
  }

  // Sessões mortas: não viva, sem frente ativa (ou em abertura) dela, sem passagem recente feita por ela, parada há
  // mais de 7 dias. Com arquivo de frente ilegível não se sabe de quem ele é: nenhuma sessão vira achado.
  if (!frentesIlegiveis.length) {
    for (const s of sessoes) {
      const v = vida(s.id);
      if (!v || v.estado === 'viva' || v.estado === 'ilegivel') continue;
      if (frentes.some(f => f.dona === s.id)) continue;
      const passouHaPouco = frentes.some(f => f.estado === 'passada' && f.passadaPor === s.id
        && !(agora - Date.parse(f.passadaEm) > PRAZO_DA_SESSAO_MORTA_MS));
      if (passouHaPouco) continue;
      const idade = idadeDe(dirEstado, s, agora);
      if (idade === null || idade <= PRAZO_DA_SESSAO_MORTA_MS) continue;
      lista.push(achado('sessao-morta', `${s.id} (${v.motivo}, último sinal há ${plural(Math.floor(idade / 86400000), 'dia', 'dias')})`, 'ah sweep --reparar'));
      sessoesMortas.push(s.id);
    }
  }

  const base = cfg.git.base;
  const ramo = ramoAtual(raiz, env);
  if (ramo !== base) {
    lista.push(achado('principal-fora-da-base', `${raiz} está ${ramo ? `no ramo ${ramo}` : 'com HEAD solto'}, não em ${base}`, `git switch ${base} no principal`));
  }
  const sujos = linhasDoStatus(raiz, env);
  if (sujos) lista.push(achado('principal-sujo', `${raiz} com ${plural(sujos, 'arquivo alterado', 'arquivos alterados')}`, 'commit por caminho ou combine com a dona'));

  try {
    // Uma leitura só da fila: a contagem e os tickets vêm do mesmo retrato.
    const fila = lerFila(dirEstado);
    const n = fila.ops.length;
    if (n) {
      const tickets = [...new Set(fila.ops.map(op => op.ticket))].map(t => `#${t}`).join(', ');
      lista.push(achado('pendentes', `${plural(n, 'operação', 'operações')}${tickets ? ` (${tickets})` : ''}`, 'ah sweep --reparar (com rede)'));
    }
    for (const linha of fila.ilegiveis) {
      lista.push(achado('pendente-ilegivel', `linha ilegível em pendentes: linha ${linha} de ${fila.arquivo}`, consertoDaLinhaDePendentes(linha, fila.arquivo)));
    }
  } catch (e) {
    if (!(e instanceof ErroDeEstado)) throw e;
    lista.push(achado('estado-ilegivel', e.arquivo ?? path.join(dirEstado, 'pendentes.jsonl'), SAIDA_ILEGIVEL));
  }

  return { lista, sessoesMortas, reconstruiveis };
}

export function achados(amb) {
  return levantar(amb).lista;
}

// Linhas de entrada do histórico na base local e na do remoto (o que o open usa para o próximo id).
function lerHistorico({ raiz, env, config: cfg }) {
  const refs = [`refs/heads/${cfg.git.base}`, `refs/remotes/${cfg.git.remoto}/${cfg.git.base}`];
  return refs.map(r => {
    const g = git(['show', `${r}:${ARQUIVO_DO_HISTORICO}`], { cwd: raiz, env, timeoutMs: PRAZO_DO_GIT_MS });
    return g.codigo === 0 ? g.saida.split('\n').filter(l => l.startsWith('- ')).join('\n') : '';
  }).join('\n');
}

// Repara só o estado, sob a trava das frentes (o reenvio da fila, com rede, vem depois dela). Devolve uma linha por
// reparo; cada um também vira um evento `reparo`.
export async function reparar(amb) {
  const { dirEstado, config: cfg, env } = amb;
  const linhas = [];
  const feito = (linha, evento) => {
    linhas.push(linha);
    registrarEvento(dirEstado, { tipo: 'reparo', ...evento });
  };
  await comTrava(dirEstado, 'frentes', async () => {
    const lev = levantar(amb);

    // (1) Sessões mortas.
    for (const id of lev.sessoesMortas) {
      apagarSessao(dirEstado, id);
      feito(`apaguei a sessão ${id} (parada há mais de 7 dias, sem frente)`, { acao: 'apagar-sessao', sessao: id });
    }

    // (2) Foco que aponta para frente que não existe ou que é de outra dona. Frente ilegível: não se sabe, fica.
    for (const s of listarSessoes(dirEstado).sessoes) {
      const nome = nomeDoFoco(s);
      if (nome === null) continue;
      let f = null;
      if (typeof nome === 'string' && nomeValido(nome)) {
        try { f = lerFrente(dirEstado, nome); } catch (e) {
          if (e instanceof ErroDeEstado) continue;
          throw e;
        }
      }
      if (f && !(f.dona && f.dona !== s.id)) continue;
      gravarSessao(dirEstado, { ...s, frente: null });
      const porque = f ? `a frente é da sessão ${idCurto(f.dona)}` : 'a frente não existe';
      feito(`tirei o foco da sessão ${s.id} em ${String(nome).slice(0, 49)} (${porque})`, { acao: 'limpar-foco', sessao: s.id, frente: String(nome).slice(0, 49) });
    }

    // (3) Frente passada, sem dona, para cada worktree no padrão sem frente. ID novo: o original se perdeu.
    if (lev.reconstruiveis.length) {
      const maquina = (() => {
        try { return lerJson(arquivoDaMaquina(env, process.platform, os.homedir()), null); } catch { return null; }
      })();
      if (!siglaValida(maquina?.sigla)) {
        amb.avisar?.('Aviso: não reconstruí as frentes dos worktrees soltos: esta máquina não tem sigla. Faça: ah init --sigla <sigla> e ah sweep --reparar\n');
      } else {
        const historico = lerHistorico(amb);
        const dirWt = caminhoDosWorktrees(cfg, env, process.platform, os.homedir());
        for (const { nome } of lev.reconstruiveis) {
          // Nunca por cima de um arquivo de frente (nem do ilegível).
          if (fs.existsSync(path.join(dirEstado, 'frentes', `${nome}.json`))) continue;
          const agora = new Date();
          const id = proximoId({ sigla: maquina.sigla, historico, frentes: listarFrentesTolerante(dirEstado).frentes });
          const login = typeof maquina.login === 'string' && maquina.login ? maquina.login : 'local';
          const f = {
            ...novaFrente({ id, nome, config: cfg, dirWorktrees: dirWt, tickets: [], plano: null, caminhos: [], dona: null, login, agora }),
            estado: 'passada',
            passadaEm: agora.toISOString(),
            reconstruida: true,
          };
          gravarFrente(dirEstado, f);
          feito(`reconstruí a frente ${id} ${nome} (passada, sem dona) para o worktree ${f.worktree}; retome com ah open ${nome}`,
            { acao: 'reconstruir-frente', frente: nome, id });
        }
      }
    }
  }, { venceMs: 120000 });

  // (4) A fila de pendentes, com rede.
  if (contarPendentes(dirEstado) > 0) {
    const r = await reenviarPendentes(dirEstado, { cwd: amb.raiz, env, timeoutMs: PRAZO_DO_REENVIO_MS });
    if (r.enviados || r.descartados) {
      feito(`pendentes: ${plural(r.enviados, 'enviada', 'enviadas')}, ${r.restam} na fila, ${plural(r.descartados, 'descartada', 'descartadas')}`,
        { acao: 'reenviar-pendentes', enviados: r.enviados, restam: r.restam, descartados: r.descartados });
    }
  }
  return linhas;
}
