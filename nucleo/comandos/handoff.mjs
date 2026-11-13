import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ErroDeUso, arquivoDaMaquina } from '../lib/caminhos.mjs';
import { comTrava, lerJson, registrarEvento } from '../lib/estado.mjs';
import { frentesDa, gravarFrente, lerFrente, listarFrentes, listarFrentesTolerante, nomeValido } from '../lib/frente.mjs';
import { git, ramoAtual } from '../lib/git.mjs';
import { loginAtual } from '../lib/github.mjs';
import { reenviarComAviso } from '../lib/pendentes.mjs';
import { marcarTickets } from '../lib/reserva.mjs';
import { gravarSessao, idCurto, lerSessao, tocarSinal } from '../lib/sessao.mjs';

export const descricao = 'passa a frente adiante sem fechá-la: empurra o ramo, comenta a passagem e solta a frente';
export const uso = 'ah handoff [<nome>] [--nota "<texto>"]';
export const requisitos = { config: true, sessao: true };

const recusa = (motivo, saida) => new ErroDeUso(`${motivo}\nPróximo passo: ${saida}`);
const primeiraLinha = r => (r.erro || r.saida || `código ${r.codigo}`).trim().split('\n')[0].slice(0, 300);
const COMMITS_NO_COMENTARIO = 3;
const OPERACOES = [['rebase-merge', 'rebase'], ['rebase-apply', 'rebase'], ['MERGE_HEAD', 'merge'], ['CHERRY_PICK_HEAD', 'cherry-pick']];
const SAIDA_DA_OPERACAO = {
  rebase: 'git rebase --continue (ou git rebase --abort)',
  merge: 'git commit para terminar o merge (ou git merge --abort)',
  'cherry-pick': 'git cherry-pick --continue (ou git cherry-pick --abort)',
};

function lerOpcoes(args) {
  const o = { nome: null, nota: undefined };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('--')) {
      if (o.nome !== null) throw recusa(`Argumento a mais: ${arg.slice(0, 40)}`, `use ${uso}`);
      o.nome = arg;
      continue;
    }
    const igual = arg.indexOf('=');
    const nome = igual >= 0 ? arg.slice(0, igual) : arg;
    if (nome !== '--nota') throw recusa(`Opção desconhecida: ${arg.slice(0, 40)}`, `use ${uso}`);
    const valor = igual >= 0 ? arg.slice(igual + 1) : args[++i];
    if (valor === undefined || (igual < 0 && valor.startsWith('--'))) {
      throw recusa('A opção --nota precisa de um valor.', 'escreva --nota "<texto>" (ou --nota=<texto> se o texto começa por --)');
    }
    if (valor.trim() === '') throw recusa('A nota está vazia.', 'escreva o texto ou tire a opção --nota');
    o.nota = valor.trim();
  }
  return o;
}

// Login de quem age: o do gh; sem rede, o da máquina; por fim o de quem abriu.
export function loginDeQuemAge(amb, frente) {
  const maquina = lerJson(arquivoDaMaquina(amb.env, process.platform, os.homedir()), null);
  return loginAtual({ cwd: amb.raiz, env: amb.env })
    ?? (typeof maquina?.login === 'string' ? maquina.login : null) ?? frente.abertaPor ?? 'local';
}

// Avisos do que a marcação dos tickets deixou na fila (os perdidos já foram avisados com o comando à mão).
export function avisarDaMarcacao(r, avisar) {
  for (const n of r.comentariosNaFila) avisar(`Aviso: não consegui comentar no ticket #${n}; o comentário ficou na fila; sai no próximo comando com rede.\n`);
  for (const n of r.edicoesNaFila) avisar(`Aviso: não consegui pôr o responsável no ticket #${n}; a edição ficou na fila; sai no próximo comando com rede.\n`);
}

const temRemoto = (amb, remoto) => git(['remote'], { cwd: amb.raiz, env: amb.env }).saida.split('\n').includes(remoto);

// Operação do git em andamento no worktree (rebase, merge, cherry-pick) ou null.
function operacaoEmAndamento(wt, env) {
  for (const [arquivo, nome] of OPERACOES) {
    const r = git(['rev-parse', '--git-path', arquivo], { cwd: wt, env });
    if (r.codigo !== 0) continue;
    if (fs.existsSync(path.resolve(wt, r.saida.trim()))) return nome;
  }
  return null;
}

// Recusas que dependem do worktree; devolve o commit do topo do ramo.
function conferirWorktree(frente, env) {
  const wt = frente.worktree;
  if (typeof wt !== 'string' || !fs.existsSync(wt)) {
    throw recusa(`O worktree da frente ${frente.id} ${frente.nome} não existe (${wt}).`,
      `se o trabalho já está no ramo ou na base, encerre a frente com ah close ${frente.nome}; senão recrie o worktree (git worktree add ${wt} ${frente.ramo}) e rode ah handoff de novo`);
  }
  const st = git(['status', '--porcelain'], { cwd: wt, env });
  if (st.codigo !== 0) throw recusa(`Não consegui conferir o worktree ${wt}: ${primeiraLinha(st)}`, 'resolva o que o git descreve e rode ah handoff de novo; nada mudou');
  const sujos = st.saida.split('\n').filter(Boolean);
  if (sujos.length) {
    throw recusa(`O worktree ${wt} tem alterações não commitadas (${sujos.length}): ${sujos.slice(0, 5).map(l => l.trim()).join('; ').slice(0, 200)}.`,
      `faça o commit no worktree (git -C ${wt} add -A && git -C ${wt} commit -m "wip: ..."; um commit wip: serve) e rode ah handoff de novo`);
  }
  const op = operacaoEmAndamento(wt, env);
  if (op) {
    throw recusa(`O worktree ${wt} tem um ${op} em andamento.`, `termine ou aborte a operação no worktree (${SAIDA_DA_OPERACAO[op]}) e rode ah handoff de novo`);
  }
  const ramo = ramoAtual(wt, env);
  if (ramo !== frente.ramo) {
    throw recusa(`O worktree ${wt} está fora do ramo ${frente.ramo} (${ramo ? `no ramo ${ramo}` : 'HEAD solto'}).`,
      `volte ao ramo da frente (git -C ${wt} switch ${frente.ramo}), trazendo para ele os commits que fez fora (git cherry-pick ou git merge), e rode ah handoff de novo`);
  }
  const topo = git(['rev-parse', `refs/heads/${frente.ramo}`], { cwd: wt, env });
  if (topo.codigo !== 0) throw recusa(`Não consegui ler o ramo ${frente.ramo}: ${primeiraLinha(topo)}`, 'resolva o que o git descreve e rode ah handoff de novo; nada mudou');
  return topo.saida.trim();
}

function textoDaPassagem({ frente, login, nota, remoto, comRemoto, base, amb }) {
  const log = git(['log', `-${COMMITS_NO_COMENTARIO}`, '--format=%h %s', `refs/heads/${frente.ramo}`, '--not', `refs/heads/${base}`], { cwd: amb.raiz, env: amb.env });
  const commits = log.codigo === 0 ? log.saida.split('\n').filter(Boolean) : [];
  const onde = comRemoto ? `ramo ${frente.ramo} no remoto ${remoto}` : `ramo ${frente.ramo} só nesta máquina (sem remoto)`;
  return [
    `Passagem de bastão: frente ${frente.id} (${frente.nome}), por @${login}.`,
    '',
    nota ?? '(sem nota)',
    '',
    `Estado deixado: ${onde}. Últimos commits:`,
    ...(commits.length ? commits.map(c => `- ${c}`) : [`- (nenhum além da base ${base})`]),
    ...(frente.plano ? [`Plano: ${frente.plano}`] : []),
    '',
    `Para retomar: tools/ah open ${frente.nome}`,
  ].join('\n');
}

export async function executar(args, amb) {
  const o = lerOpcoes(args);
  if (o.nome !== null && !nomeValido(o.nome)) {
    throw recusa(`Nome de frente inválido: ${o.nome.slice(0, 40) || '(vazio)'}`, 'use o nome que ah board mostra (ex.: ah handoff carrinho)');
  }
  const { dirEstado, env, config: cfg } = amb;
  const remoto = cfg.git.remoto;

  // Fase 1, sob a trava: recusas locais, sem mudar nada.
  const { frente, topo } = await comTrava(dirEstado, 'frentes', async () => {
    const sessao = lerSessao(dirEstado, amb.sessaoId);
    if (sessao) tocarSinal(dirEstado, amb.sessaoId);
    const minhas = frentesDa(listarFrentes(dirEstado), amb.sessaoId);
    if (!minhas.length) throw recusa('Esta sessão não tem frente ativa para passar.', 'rode ah board para ver as frentes');
    const foco = sessao?.frente ? (sessao.frente.nome ?? sessao.frente) : null;
    const nome = o.nome ?? (minhas.some(f => f.nome === foco) ? foco : minhas.length === 1 ? minhas[0].nome : null);
    if (!nome) throw recusa(`Esta sessão tem mais de uma frente (${minhas.map(f => f.nome).join(', ').slice(0, 80)}).`, 'diga qual: ah handoff <nome>');
    const f = lerFrente(dirEstado, nome);
    if (!f || f.dona !== amb.sessaoId) {
      const deQuem = !f ? 'não existe no estado' : f.estado === 'passada' ? 'já está passada, sem dona'
        : `é da sessão ${idCurto(f.dona ?? '—')}`;
      throw recusa(`A frente ${nome} não é desta sessão: ${deQuem}.`,
        f?.estado === 'passada' ? `para retomá-la, rode ah open ${nome}` : 'rode ah board para ver as frentes desta sessão');
    }
    if (f.estado !== 'ativa') {
      throw recusa(`A frente ${f.id} ${f.nome} não está ativa (estado ${f.estado}).`,
        `se o ah open dela parou no meio, rode ah open ${f.nome} para terminar ou ah close ${f.nome} para desistir`);
    }
    return { frente: f, topo: conferirWorktree(f, env) };
  }, { venceMs: 120000 });

  // Fora da trava: fila, push e (depois) os comentários levam rede.
  await reenviarComAviso(dirEstado, { cwd: amb.raiz, env }, amb.avisar);
  const comRemoto = temRemoto(amb, remoto);
  if (comRemoto) {
    const ref = `refs/heads/${frente.ramo}`;
    const p = git(['push', '-u', remoto, `${ref}:${ref}`], { cwd: amb.raiz, env });
    if (p.codigo !== 0) {
      throw recusa(`O git push do ramo ${frente.ramo} para ${remoto} falhou: ${primeiraLinha(p)}`,
        `resolva o que o git descreve (rede, permissão, ramo divergente no remoto) e rode ah handoff de novo; nada mudou`);
    }
  } else {
    amb.avisar(`Aviso: sem remoto: só esta máquina retoma a frente ${frente.nome} (o ramo ${frente.ramo} fica só aqui).\n`);
  }
  const login = loginDeQuemAge(amb, frente);
  const texto = textoDaPassagem({ frente, login, nota: o.nota, remoto, comRemoto, base: cfg.git.base, amb });

  // Fase 2, sob a trava: confere que nada mudou desde a fase 1 e solta a frente.
  const passada = await comTrava(dirEstado, 'frentes', async () => {
    const f = lerFrente(dirEstado, frente.nome);
    if (!f || f.id !== frente.id || f.dona !== amb.sessaoId || f.estado !== 'ativa') {
      throw recusa(`A frente ${frente.nome} mudou durante o handoff (agora: ${f ? `${f.estado}, dona ${f.dona ?? '—'}` : 'sem registro'}).`,
        'rode ah board para ver quem está com ela; o estado local não mudou');
    }
    if (conferirWorktree(f, env) !== topo) {
      throw recusa(`O ramo ${f.ramo} ganhou commits durante o handoff.`, 'rode ah handoff de novo para empurrá-los; o estado local não mudou');
    }
    const agora = new Date().toISOString();
    f.estado = 'passada';
    f.dona = null;
    f.passadaEm = agora;
    f.passadaPor = amb.sessaoId;
    if (o.nota !== undefined) f.notas = [...(f.notas ?? []), { em: agora, sessao: amb.sessaoId, texto: o.nota }];
    gravarFrente(dirEstado, f);
    const sessao = lerSessao(dirEstado, amb.sessaoId);
    if (sessao && (sessao.frente?.nome ?? sessao.frente) === f.nome) {
      // O foco passa para a frente mais nova que sobrou à sessão (o orquestrador pode ter outras), senão nenhuma.
      sessao.frente = frentesDa(listarFrentesTolerante(dirEstado).frentes, amb.sessaoId).at(-1)?.nome ?? null;
      gravarSessao(dirEstado, sessao);
    }
    registrarEvento(dirEstado, { tipo: 'passagem', sessao: amb.sessaoId, frente: f.nome, id: f.id, remoto: comRemoto ? remoto : null });
    return f;
  }, { venceMs: 120000 });

  // Fora da trava: a passagem nos tickets (sem rede vai para a fila; a reserva continua).
  if ((passada.tickets ?? []).length) {
    const oGh = { cwd: amb.raiz, env, avisar: amb.avisar };
    const r = marcarTickets({ frente: passada, tipo: 'passagem', texto, login, sessao: amb.sessaoId, rotulo: cfg.github.rotuloDeReserva, dirEstado }, oGh);
    avisarDaMarcacao(r, amb.avisar);
  }
  amb.escrever(`Frente ${passada.id} ${passada.nome} passada.\nPara retomar: tools/ah open ${passada.nome}\n`);
  return 0;
}
