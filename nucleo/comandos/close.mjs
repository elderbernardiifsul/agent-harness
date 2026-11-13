import fs from 'node:fs';
import path from 'node:path';
import { ErroDeUso } from '../lib/caminhos.mjs';
import { comTrava, registrarEvento } from '../lib/estado.mjs';
import { frentesDa, gravarFrente, lerFrente, linhaDoHistorico, listarFrentesTolerante, nomeValido, removerFrente } from '../lib/frente.mjs';
import { existeRamo, ramoAtual, git } from '../lib/git.mjs';
import { loginAtual } from '../lib/github.mjs';
import { reenviarComAviso } from '../lib/pendentes.mjs';
import { desfazerAbertura, liberarTickets, quemTemAFrente } from '../lib/reserva.mjs';
import { gravarSessao, idCurto, lerSessao, tocarSinal } from '../lib/sessao.mjs';
import { aberturaParada, prazoMs, vidaDaSessao } from '../lib/vida.mjs';

export const descricao = 'fecha a frente da sessão sem perder trabalho';
export const uso = 'ah close [<nome>] [--resumo "<texto>"] [--descartar-ignorados]';
export const requisitos = { config: true, sessao: true, repositorio: true };

const ARQUIVO_DO_HISTORICO = 'docs/agents/historico-das-frentes.md';
const MAX_LISTA = 20;

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

  // 1. Recusas que não dependem do estado.
  const t = git(['rev-parse', '--show-toplevel'], { cwd: amb.cwd, env });
  if (t.codigo !== 0) {
    throw recusa(`Não consegui conferir em que checkout estou: ${(t.erro || `código ${t.codigo}`).trim().split('\n')[0].slice(0, 200)}`, 'resolva o que o git descreve (ou rode ah doctor) e repita ah close; nada foi apagado');
  }
  const topo = t.saida.trim();
  if (topo && !mesmoCaminho(topo, raiz)) {
    throw recusa('O ah close não roda de dentro de um worktree de frente.', `rode no checkout principal: cd ${raiz}`);
  }

  return comTrava(dirEstado, 'frentes', async () => {
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
      registrarEvento(dirEstado, { tipo: 'fechamento-sem-registro', sessao: amb.sessaoId, nome });
      amb.avisar(`Aviso: a frente ${nome} não tem registro no estado; soltei a frente da sessão.\n`);
      const ramo = cfg.git.prefixo + nome;
      const sobras = [];
      if (existeRamo(raiz, ramo, { env })) sobras.push(`git branch -D ${ramo}`);
      const wt = g(['worktree', 'list', '--porcelain']).saida.split('\n').filter(l => l.startsWith('worktree ')).map(l => l.slice(9)).find(p => path.basename(p) === nome);
      if (wt) sobras.unshift(`git worktree remove ${wt}`);
      if (sobras.length) amb.avisar(`Sobrou coisa com esse nome. Para limpar à mão (confira antes se há trabalho a guardar):\n${sobras.map(s => `  ${s}`).join('\n')}\n`);
      amb.escrever(`Sessão ${idCurto(amb.sessaoId)} sem frente.\n`);
      return 0;
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
      const oGh = { cwd: raiz, env, avisar: amb.avisar };
      const login = loginAtual(oGh) ?? frente.abertaPor ?? 'local';
      const r = desfazerAbertura({ frente, login, sessao: amb.sessaoId, rotulo: cfg.github.rotuloDeReserva, dirEstado }, oGh);
      if (r.naoLidos.length) {
        amb.avisar(`Aviso: não consegui ler ${r.naoLidos.map(n => `#${n}`).join(', ')}; confira à mão se a frente ${frente.id} ainda está de responsável e com o rótulo lá.\n`);
      }
      for (const f of r.ficaram) {
        amb.avisar(`Aviso: @${f.login} continua de responsável no ticket #${f.ticket} (${f.motivo}).${f.motivo.startsWith('outra') ? '' : ` Se precisar, tire à mão: gh issue edit ${f.ticket} --remove-assignee ${f.login}`}\n`);
      }
      removerFrente(dirEstado, frente.nome);
      for (const s of [sessao, frente.dona && frente.dona !== amb.sessaoId ? lerSessao(dirEstado, frente.dona) : null]) {
        if (s && (s.frente?.nome ?? s.frente) === frente.nome) gravarSessao(dirEstado, { ...s, frente: null });
      }
      registrarEvento(dirEstado, { tipo: 'abertura-desfeita', sessao: amb.sessaoId, id: frente.id, nome: frente.nome, tickets: r.tickets });
      const sobras = [];
      if (existeRamo(raiz, frente.ramo, { env })) sobras.push(`git branch -D ${frente.ramo}`);
      if (typeof frente.worktree === 'string' && fs.existsSync(frente.worktree)) sobras.unshift(`git worktree remove ${frente.worktree}`);
      if (sobras.length) amb.avisar(`Sobrou coisa com esse nome. Para limpar à mão (confira antes se há trabalho a guardar):\n${sobras.map(x => `  ${x}`).join('\n')}\n`);
      amb.escrever(`Abertura de ${frente.id} ${frente.nome} desfeita.${r.texto ? ` Reserva: ${r.texto}.` : ''}\n`);
      return 0;
    }
    // Frente de outra sessão: se a dona não está viva (encerrada, morta, sem registro) ou a frente
    // está passada (sem dona), esta sessão fecha, com as mesmas conferências; com a dona viva, recusa
    // com o id inteiro.
    let sessaoDona = null;
    let daEncerrada = false;
    let vidaDaDona = null;
    if (frente.dona !== amb.sessaoId) {
      sessaoDona = frente.dona ? lerSessao(dirEstado, frente.dona) : null;
      vidaDaDona = frente.dona ? vidaDaSessao(dirEstado, frente.dona, { config: cfg }) : null;
      if (vidaDaDona?.estado === 'viva') {
        throw recusa(`A frente ${frente.id} ${frente.nome} é da sessão ${frente.dona}, que ainda está aberta, não desta.`,
          `peça à sessão dona que rode ah close; se ela parou, espere o sinal de vida dela vencer (sessoes.prazoDoSinalMin, hoje ${Math.round(prazoMs(cfg) / 60000)} min), confira em ah board que a frente aparece órfã e repita ah close ${frente.nome}`);
      }
      daEncerrada = true;
    }

    if (ramoAtual(raiz, env) !== base) {
      throw recusa(`O checkout principal não está no ramo base ${base}.`, `no checkout principal (${raiz}) rode git switch ${base}`);
    }
    const linhaJaGravada = () => {
      try {
        return fs.readFileSync(path.join(raiz, ...ARQUIVO_DO_HISTORICO.split('/')), 'utf8').split('\n')
          .some(l => l.startsWith('- ') && l.includes(` · ${frente.id} · ${frente.nome} · `));
      } catch { return false; }
    };
    const stHist = g(['status', '--porcelain', '--', ARQUIVO_DO_HISTORICO]);
    if (stHist.codigo !== 0) {
      throw recusa(`Não consegui conferir ${ARQUIVO_DO_HISTORICO}: ${(stHist.erro || `código ${stHist.codigo}`).trim().split('\n')[0].slice(0, 200)}`, 'resolva o que o git descreve (ou rode ah doctor) e repita ah close; nada foi apagado');
    }
    const arqSujo = stHist.saida.trim() !== '';
    // Sujo só pela linha desta frente (de um close anterior que parou no meio): segue e termina.
    if (arqSujo && !linhaJaGravada()) {
      throw recusa(`O checkout principal tem alterações em ${ARQUIVO_DO_HISTORICO}.`, `commit ou descarte essas alterações (git -C ${raiz} diff ${ARQUIVO_DO_HISTORICO}) e rode ah close de novo`);
    }

    // 2. Nada se perde. Conferência que não consegue rodar é recusa, nunca "nada a perder".
    const wt = frente.worktree;
    const temWt = fs.existsSync(wt);
    const refRamo = `refs/heads/${frente.ramo}`;
    const refRemoto = `refs/remotes/${remoto}/${frente.ramo}`;
    const falhou = (oque, r) => recusa(`Não consegui conferir ${oque}: ${(r.erro || r.saida || `código ${r.codigo}`).trim().split('\n')[0].slice(0, 200)}`, 'resolva o que o git descreve (ou rode ah doctor) e repita ah close; nada foi apagado');
    const existeRef = (ref, oque) => {
      const r = g(['show-ref', '--verify', '--quiet', ref]);
      if (r.codigo === 0) return true;
      if (r.codigo === 1) return false;
      throw falhou(oque, r);
    };
    const temRamo = existeRef(refRamo, `se o ramo ${frente.ramo} existe`);
    const temRamoRemoto = existeRef(refRemoto, `se o ramo ${frente.ramo} existe no remoto`);

    // Devolve a lista de problemas; lança recusa se alguma conferência não rodar.
    const conferir = () => {
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
    const recusarProblemas = problemas => {
      const corpo = problemas.map(([t, l]) => [`- ${t}`, ...l].join('\n')).join('\n');
      throw new ErroDeUso(`Fechar a frente ${frente.id} ${frente.nome} perderia trabalho.\nPróximo passo: ${corpo}`);
    };
    let soNoRemoto = false;
    if (temRamo) {
      const m = g(['merge-base', '--is-ancestor', refRamo, `refs/heads/${base}`]);
      if (m.codigo > 1) throw falhou(`se o ramo ${frente.ramo} está na ${base}`, m);
      soNoRemoto = m.codigo === 1;
    }
    const primeiros = conferir();
    if (primeiros.length) recusarProblemas(primeiros);

    // Frente passada com tickets: outra máquina pode tê-la retomado. Então este close só tira o registro e o
    // worktree daqui; comentar o fechamento soltaria a reserva de quem está com ela.
    let soLocal = null;
    if (frente.estado === 'passada' && (frente.tickets ?? []).length && !frente.fechamentoComentado) {
      const oGh = { cwd: raiz, env, avisar: amb.avisar };
      const login = loginAtual(oGh) ?? frente.abertaPor ?? 'local';
      const q = quemTemAFrente({ frente, login, sessao: amb.sessaoId, rotulo: cfg.github.rotuloDeReserva, dirEstado }, oGh);
      if (q.situacao === 'sem-rede') {
        throw recusa(`Não fechei ${frente.nome}: preciso do GitHub para confirmar que ninguém retomou ${frente.nome} (${q.motivo}).`,
          `tente de novo com rede: ah close ${frente.nome}; nada foi apagado`);
      }
      if (q.situacao === 'outra') soLocal = `a frente ${q.id} está ativa com @${q.login} em outra máquina`;
      if (q.situacao === 'solta') soLocal = `nos tickets a frente ${frente.id} já não está passada (fechada em outra máquina)`;
    }

    // Resumo: o que o usuário deu, ou o título do último commit do ramo.
    let resumo = o.resumo;
    if (resumo === undefined) {
      const t = temRamo ? g(['log', '-1', '--format=%s', refRamo]).saida.trim() : '';
      resumo = t || 'sem resumo';
    }
    resumo = resumo.replace(/\r\n?/g, '\n').trim();
    const primeira = resumo.split('\n').map(l => l.trim()).find(Boolean) ?? 'sem resumo';

    // 3. Tickets: comentário de fechamento (livre) e, com reserva, sai responsável e rótulo. Não fecha ticket.
    // Uma vez só, mesmo se o close for repetido.
    if (!frente.fechamentoComentado && !soLocal) {
      if ((frente.tickets ?? []).length) {
        const oGh = { cwd: raiz, env, avisar: amb.avisar };
        const login = loginAtual(oGh) ?? frente.abertaPor ?? 'local';
        const r = liberarTickets({ frente, resumo, login, rotulo: cfg.github.rotuloDeReserva, dirEstado, sessao: amb.sessaoId }, oGh);
        for (const ticket of r.comentariosNaFila) {
          amb.avisar(`Aviso: não consegui comentar no ticket #${ticket}; o comentário ficou na fila; sai no próximo comando com rede.\n`);
        }
        for (const ticket of r.edicoesNaFila) {
          amb.avisar(`Aviso: não consegui tirar responsável e rótulo do ticket #${ticket}; a edição ficou na fila; sai no próximo comando com rede.\n`);
        }
        // Os perdidos (nem a fila aceitou) já foram avisados com o comando para fazer à mão.
      }
      frente.fechamentoComentado = true;
      gravarFrente(dirEstado, frente);
    }

    // 4. Reconfere (os comentários demoram) e remove o worktree: depois daqui o que falhar vira aviso.
    const novos = conferir();
    if (novos.length) recusarProblemas(novos);
    if (temWt) {
      // A reconferência acabou de passar: só agora o --force (para ignorados) é seguro.
      let r = g(['worktree', 'remove', '--', wt]);
      if (r.codigo !== 0 && o.descartarIgnorados) r = g(['worktree', 'remove', '--force', '--', wt]);
      if (r.codigo !== 0) {
        throw recusa(`O git não removeu o worktree ${wt}: ${r.erro.trim().split('\n')[0]}`, `resolva o que o git descreve e rode ah close de novo`);
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
      if (!linhaJaGravada()) {
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
    // O foco que apontava para a frente fechada passa para a frente mais nova que sobrou à sessão (ou nenhuma).
    const soltarFoco = s => {
      if (!s || (s.frente?.nome ?? s.frente) !== frente.nome) return;
      s.frente = frentesDa(listarFrentesTolerante(dirEstado).frentes, s.id).at(-1)?.nome ?? null;
      gravarSessao(dirEstado, s);
    };
    soltarFoco(sessao);
    soltarFoco(sessaoDona);
    registrarEvento(dirEstado, { tipo: soLocal ? 'fechamento-local' : 'fechamento', sessao: amb.sessaoId, id: frente.id, nome: frente.nome, aberta: frente.abertaEm, fechada: new Date().toISOString() });

    // 7. Saída.
    if (soLocal) {
      amb.escrever(`Registro local da frente ${frente.id} ${frente.nome} fechado: ${soLocal}. Não comentei nem mexi nos tickets, e o histórico não mudou.\n`);
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
      amb.escrever(`A frente era da sessão ${frente.dona ?? '(sem dona)'}, ${como}; esta sessão a fechou.\n`);
    }
    if (g(['remote']).saida.split('\n').includes(remoto)) amb.escrever(`Falta: git push ${remoto} ${base}\n`);
    return 0;
  }, { venceMs: 120000 });
}
