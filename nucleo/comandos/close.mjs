import fs from 'node:fs';
import path from 'node:path';
import { ErroDeUso } from '../lib/caminhos.mjs';
import { comTrava, registrarEvento } from '../lib/estado.mjs';
import { gravarFrente, lerFrente, linhaDoHistorico, nomeValido, removerFrente } from '../lib/frente.mjs';
import { existeRamo, ramoAtual, git, topoDe } from '../lib/git.mjs';
import { comentar } from '../lib/github.mjs';
import { gravarSessao, idCurto, lerSessao } from '../lib/sessao.mjs';

export const descricao = 'fecha a frente da sessão sem perder trabalho';
export const requisitos = { config: true, sessao: true, repositorio: true };

const USO = 'use ah close [<nome>] [--resumo "<texto>"] [--descartar-ignorados]';
const ARQUIVO_DO_HISTORICO = 'docs/agents/historico-das-frentes.md';
const MAX_LISTA = 20;

function lerOpcoes(args) {
  const o = { nome: null, resumo: undefined, descartarIgnorados: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('--')) {
      if (o.nome !== null) throw new ErroDeUso(`Argumento a mais: ${arg.slice(0, 40)}\nPróximo passo: ${USO}`);
      o.nome = arg;
      continue;
    }
    const igual = arg.indexOf('=');
    const nome = igual >= 0 ? arg.slice(0, igual) : arg;
    if (nome === '--descartar-ignorados' && igual < 0) { o.descartarIgnorados = true; continue; }
    if (nome !== '--resumo') throw new ErroDeUso(`Opção desconhecida: ${arg.slice(0, 40)}\nPróximo passo: ${USO}`);
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
  const o = lerOpcoes(args);
  if (o.nome !== null && !nomeValido(o.nome)) {
    throw recusa(`Nome de frente inválido: ${o.nome.slice(0, 40) || '(vazio)'}`, 'use o nome que ah board mostra (ex.: ah close carrinho)');
  }
  const { raiz, env, dirEstado, config: cfg } = amb;
  const g = (a, cwd = raiz) => git(a, { cwd, env });
  const base = cfg.git.base;
  const remoto = cfg.git.remoto;

  // 1. Recusas que não dependem do estado.
  const topo = topoDe(amb.cwd, env);
  if (topo && !mesmoCaminho(topo, raiz)) {
    throw recusa('O ah close não roda de dentro de um worktree de frente.', `rode no checkout principal: cd ${raiz}`);
  }

  return comTrava(dirEstado, 'frentes', async () => {
    const sessao = lerSessao(dirEstado, amb.sessaoId);
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
    if (frente.dona !== amb.sessaoId) {
      throw recusa(`A frente ${frente.id} ${frente.nome} é da sessão ${frente.dona ? idCurto(frente.dona) : '(sem dona)'}, não desta.`, 'peça à dona que rode ah close (esta versão não tem tomada de frente)');
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
    const arqSujo = g(['status', '--porcelain', '--', ARQUIVO_DO_HISTORICO]).saida.trim() !== '';
    // Sujo só pela linha desta frente (de um close anterior que parou no meio): segue e termina.
    if (arqSujo && !linhaJaGravada()) {
      throw recusa(`O checkout principal tem alterações em ${ARQUIVO_DO_HISTORICO}.`, `commit ou descarte essas alterações (git -C ${raiz} diff ${ARQUIVO_DO_HISTORICO}) e rode ah close de novo`);
    }

    // 2. Nada se perde.
    const wt = frente.worktree;
    const temWt = fs.existsSync(wt);
    const problemas = [];
    let ignorados = [];
    if (temWt) {
      const st = g(['status', '--porcelain'], wt);
      if (st.codigo !== 0) throw recusa(`Não consegui ler o worktree ${wt}: ${st.erro.trim().split('\n')[0]}`, 'confira com git worktree list; se ele está quebrado, git worktree remove --force e rode ah close de novo');
      const sujos = st.saida.split('\n').filter(Boolean);
      if (sujos.length) {
        problemas.push([`alterações não commitadas no worktree (${sujos.length}); saída: commit no worktree (git -C ${wt} add -A && git -C ${wt} commit)`, listaCortada(sujos, 'arquivos')]);
      }
    }
    const refRamo = `refs/heads/${frente.ramo}`;
    const temRamo = existeRamo(raiz, frente.ramo, { env });
    const temRamoRemoto = existeRamo(raiz, frente.ramo, { remoto, env });
    let soNoRemoto = false;
    if (temRamo) {
      const excluir = [`refs/heads/${base}`, ...(temRamoRemoto ? [`refs/remotes/${remoto}/${frente.ramo}`] : [])];
      const r = g(['log', '--format=%h %s', refRamo, '--not', ...excluir]);
      const perdidos = r.saida.split('\n').filter(Boolean);
      if (r.codigo !== 0) throw recusa(`Não consegui comparar o ramo ${frente.ramo} com a base: ${r.erro.trim().split('\n')[0]}`, 'rode ah doctor');
      if (perdidos.length) {
        problemas.push([`commits do ramo ${frente.ramo} que não estão na ${base} nem no remoto (${perdidos.length}); saída: git merge --no-ff ${frente.ramo} na ${base}, ou git push -u ${remoto} ${frente.ramo}`, listaCortada(perdidos, 'commits')]);
      }
      soNoRemoto = g(['merge-base', '--is-ancestor', refRamo, `refs/heads/${base}`]).codigo !== 0;
    }
    if (temWt && !o.descartarIgnorados) {
      const ig = g(['ls-files', '-z', '-o', '-i', '--exclude-standard'], wt);
      ignorados = ig.saida.split('\0').filter(Boolean);
      if (ignorados.length) {
        problemas.push([`arquivos ignorados no worktree (${ignorados.length}), que o git não guarda; saída: copie o que importa de ${wt}, ou repita com --descartar-ignorados`, listaCortada(ignorados, 'arquivos')]);
      }
    }
    if (problemas.length) {
      const corpo = problemas.map(([t, l]) => [`- ${t}`, ...l].join('\n')).join('\n');
      throw new ErroDeUso(`Fechar a frente ${frente.id} ${frente.nome} perderia trabalho.\nPróximo passo: ${corpo}`);
    }

    // Resumo: o que o usuário deu, ou o título do último commit do ramo.
    let resumo = o.resumo;
    if (resumo === undefined) {
      const t = temRamo ? g(['log', '-1', '--format=%s', refRamo]).saida.trim() : '';
      resumo = t || 'sem resumo';
    }
    resumo = resumo.replace(/\r\n?/g, '\n').trim();
    const primeira = resumo.split('\n').map(l => l.trim()).find(Boolean) ?? 'sem resumo';

    // 3. Tickets (só aviso; não fecha ticket). Uma vez só, mesmo se o close for repetido.
    if (!frente.fechamentoComentado) {
      for (const ticket of frente.tickets ?? []) {
        const corpo = `Frente ${frente.id} (${frente.nome}) fechada.\n\n${resumo}\n`;
        if (!comentar(ticket, corpo, { cwd: raiz, env })) {
          amb.avisar(`Aviso: não consegui comentar no ticket #${ticket}; comente à mão que a frente ${frente.id} foi fechada.\n`);
        }
      }
      frente.fechamentoComentado = true;
      gravarFrente(dirEstado, frente);
    }

    // 4. Remove o worktree: a partir daqui o que falhar vira aviso.
    if (temWt) {
      let r = g(['worktree', 'remove', wt]);
      if (r.codigo !== 0 && o.descartarIgnorados) r = g(['worktree', 'remove', '--force', wt]);
      if (r.codigo !== 0) {
        throw recusa(`O git não removeu o worktree ${wt}: ${r.erro.trim().split('\n')[0]}`, `resolva o que o git descreve e rode ah close de novo`);
      }
    } else {
      g(['worktree', 'prune']);
    }
    if (temRamo) {
      const r = g(['branch', soNoRemoto ? '-D' : '-d', '--', frente.ramo]);
      if (r.codigo !== 0) amb.avisar(`Aviso: não apaguei o ramo ${frente.ramo} (${r.erro.trim().split('\n')[0]}). Apague à mão: git branch -D ${frente.ramo}\n`);
    }

    // 5. Histórico.
    const arquivo = path.join(raiz, ...ARQUIVO_DO_HISTORICO.split('/'));
    try {
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
    if (sessao) {
      sessao.frente = null;
      gravarSessao(dirEstado, sessao);
    }
    registrarEvento(dirEstado, { tipo: 'fechamento', sessao: amb.sessaoId, id: frente.id, nome: frente.nome, aberta: frente.abertaEm, fechada: new Date().toISOString() });

    // 7. Saída.
    amb.escrever(`Frente ${frente.id} ${frente.nome} fechada.\n`);
    if (g(['remote']).saida.split('\n').includes(remoto)) amb.escrever(`Falta: git push ${remoto} ${base}\n`);
    return 0;
  }, { venceMs: 120000 });
}
