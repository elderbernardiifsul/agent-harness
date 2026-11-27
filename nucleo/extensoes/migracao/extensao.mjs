// Extensão `migracao`: reserva do número de migração por frente. A dor: duas frentes abertas sobre a mesma base
// criam, cada uma, a "próxima" migração, e as duas ganham o mesmo número; quem entra depois descobre no merge, ou
// pior, no banco. A reserva diz que número cada frente terá se a base receber as frentes na ordem das reservas.
//
// `ah migracao reservar|liberar|listar|renumerar`. O número reservado é o maior entre a última migração da base e
// as reservas das frentes do estado, mais um; o close libera (a reserva mora no registro da frente).
// Configuração: `{"pasta": "db/migracoes", "padrao": "^(\\d+)_", "digitos": 4, "renumerar": [argv…]}`.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { emDia, migracoesDaBase, numeroDoArquivo, planoDeRenumeracao, proximoNumero, formatar } from './numeros.mjs';

const USO = 'ah migracao reservar|liberar|renumerar [--frente <nome>] | ah migracao listar [--json]';
const CAMPOS = ['pasta', 'padrao', 'digitos', 'renumerar'];

const recusa = (ctx, motivo, saida) => new ctx.ErroDeUso(`${motivo}\nPróximo passo: ${saida}`);
const numeroDe = f => (Number.isInteger(f?.extensoes?.migracao?.numero) ? f.extensoes.migracao.numero : null);
const opcoes = ctx => ({
  pasta: ctx.config.pasta,
  padrao: new RegExp(ctx.config.padrao ?? '^(\\d+)_'),
  digitos: ctx.config.digitos ?? 4,
  base: ctx.configDoProjeto?.git?.base ?? 'dev',
});
const doRepositorio = (ctx, o) => {
  try { return migracoesDaBase(ctx.git, o.base, o.pasta, o.padrao); } catch (e) {
    throw recusa(ctx, e.message, `confira se o ramo ${o.base} existe neste repositório`);
  }
};

// Separa `--frente <nome>` e `--json` dos posicionais; opção desconhecida recusa.
function lerArgs(args, ctx) {
  const o = { posicionais: [], frente: null, json: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--frente') {
      o.frente = args[++i];
      if (!o.frente) throw recusa(ctx, 'A opção --frente precisa do nome da frente.', `use ${USO}`);
    } else if (a === '--json') o.json = true;
    else if (a.startsWith('--')) throw recusa(ctx, `Opção desconhecida: ${a.slice(0, 40)}`, `use ${USO}`);
    else o.posicionais.push(a);
  }
  if (o.posicionais.length) throw recusa(ctx, `Argumento a mais: ${o.posicionais[0].slice(0, 40)}`, `use ${USO}`);
  return o;
}

// A frente do comando: a dada em --frente, ou a da sessão (como na extensão recursos).
export function frenteAlvo(ctx, nome) {
  if (nome) {
    const f = ctx.frentes().find(x => x.nome === nome || x.id === nome);
    if (!f) throw recusa(ctx, `Não achei a frente ${nome.slice(0, 49)}.`, 'rode ah board para ver as frentes abertas');
    return f;
  }
  if (!ctx.frente) throw recusa(ctx, 'Esta sessão não tem frente.', 'abra uma com ah open <nome>, ou diga qual com --frente <nome>');
  return ctx.frente;
}

// Frente ativa de outra sessão viva: só a dona mexe na reserva dela. Chamada sob a trava, com a frente lida ali.
export function conferirDona(ctx, atual) {
  if (!atual || atual.estado !== 'ativa' || !atual.dona || atual.dona === ctx.sessaoId || !ctx.donaViva(atual)) return;
  throw recusa(ctx, `A frente ${atual.id} ${atual.nome} é da sessão ${atual.dona}, que está viva.`,
    `peça à sessão dona (${atual.dona}) que faça ela mesma; com a sessão morta (frente órfã) ou a frente passada, o --frente vale`);
}

// O número sai do primeiro grupo de captura do padrão. Ele precisa existir, não ter nome e não ser opcional
// (com `?` ou `*` depois, o grupo pode não casar, e o número viraria NaN). Lê o padrão como texto: pula o caractere
// escapado e o que está entre colchetes, e acha o ")" que fecha o primeiro "(" que não começa um "(?…".
function erroDoGrupo(padrao) {
  if (/\(\?<(?![=!])/.test(padrao)) return 'padrao precisa de um grupo simples com o número, sem nome: troque (?<nome>…) por (…), como "^V(\\d+)__"';
  let inicio = -1;
  let profundidade = 0;
  let emColchetes = false;
  for (let i = 0; i < padrao.length; i++) {
    const c = padrao[i];
    if (c === '\\') { i++; continue; }
    if (emColchetes) { emColchetes = c !== ']'; continue; }
    if (c === '[') emColchetes = true;
    else if (c === '(' && inicio < 0 && padrao[i + 1] !== '?') { inicio = i; profundidade = 1; }
    else if (c === '(' && inicio >= 0) profundidade++;
    else if (c === ')' && inicio >= 0 && --profundidade === 0) {
      return /^([?*]|\{0)/.test(padrao.slice(i + 1)) ? 'padrao precisa de um grupo obrigatório com o número: tire o ? ou o * depois do grupo, como "^(\\d+)_"' : null;
    }
  }
  return 'padrao precisa de um grupo com o número, como "^(\\d+)_"';
}

async function reservar(args, ctx) {
  const o = { ...opcoes(ctx), ...lerArgs(args, ctx) };
  const f = frenteAlvo(ctx, o.frente);
  const ultima = doRepositorio(ctx, o).at(-1)?.numero ?? 0;
  let numero = null;
  let nova = false;
  // Sob a trava das frentes: duas reservas ao mesmo tempo não pegam o mesmo número.
  await ctx.gravarCampos(f.nome, (secao, { frentes }) => {
    conferirDona(ctx, frentes.find(x => x.nome === f.nome));
    if (Number.isInteger(secao.numero) && secao.numero > ultima) { numero = secao.numero; return {}; }
    const outras = frentes.filter(x => x.nome !== f.nome).map(numeroDe).filter(n => n !== null);
    numero = proximoNumero(ultima, outras);
    nova = true;
    return { numero, em: new Date().toISOString() };
  });
  ctx.escrever(`Frente ${f.id} ${f.nome}: migração ${nova ? 'reservada' : 'já reservada'}: ${formatar(numero, o.digitos)} (a última da ${o.base} é a ${formatar(ultima, o.digitos)}).\n`);
  return 0;
}

async function liberar(args, ctx) {
  const o = { ...opcoes(ctx), ...lerArgs(args, ctx) };
  const f = frenteAlvo(ctx, o.frente);
  await ctx.gravarCampos(f.nome, (secao, { frentes }) => {
    conferirDona(ctx, frentes.find(x => x.nome === f.nome));
    return { numero: undefined, em: undefined };
  });
  ctx.escrever(`Frente ${f.id} ${f.nome}: reserva de migração liberada.\n`);
  return 0;
}

function listar(args, ctx) {
  const o = { ...opcoes(ctx), ...lerArgs(args, ctx) };
  const daBase = doRepositorio(ctx, o);
  const ultima = daBase.at(-1)?.numero ?? 0;
  const reservas = ctx.frentes().filter(f => numeroDe(f) !== null).sort((a, b) => numeroDe(a) - numeroDe(b));
  if (o.json) {
    ctx.escrever(`${JSON.stringify({ base: o.base, ultima, reservas: reservas.map(f => ({ id: f.id, frente: f.nome, estado: f.estado, numero: numeroDe(f) })) })}\n`);
    return 0;
  }
  ctx.escrever(`Última da ${o.base}: ${daBase.length ? `${formatar(ultima, o.digitos)} (${daBase.at(-1).arquivo})` : 'nenhuma'}\n`);
  if (!reservas.length) ctx.escrever('Nenhuma reserva.\n');
  for (const f of reservas) {
    const passou = numeroDe(f) <= ultima ? ` (a ${o.base} já passou dela: rode ah migracao renumerar depois de reintegrar)` : '';
    ctx.escrever(`${formatar(numeroDe(f), o.digitos)} ${f.id} ${f.nome}${passou}\n`);
  }
  return 0;
}

// Depois de reintegrar a base no worktree da frente, põe as migrações dela logo depois da última da base.
// Renomeia com git mv (fica em stage) e roda o passo da ferramenta, se a configuração tiver um; não commita.
async function renumerar(args, ctx) {
  const o = { ...opcoes(ctx), ...lerArgs(args, ctx) };
  const f = frenteAlvo(ctx, o.frente);
  conferirDona(ctx, f);
  const wt = f.worktree;
  const g = a => ctx.git(a, { cwd: wt });
  const emConflito = g(['diff', '--name-only', '--diff-filter=U']).saida.trim();
  if (g(['rev-parse', '-q', '--verify', 'MERGE_HEAD']).codigo === 0 || emConflito) {
    throw recusa(ctx, `o worktree ${wt} tem um merge em curso${emConflito ? ` (em conflito: ${emConflito.split('\n').slice(0, 5).join(', ')})` : ''}.`,
      'resolva os conflitos, termine o merge com git commit e rode ah migracao renumerar de novo');
  }
  const mesclada = g(['merge-base', '--is-ancestor', `refs/heads/${o.base}`, 'HEAD']);
  if (mesclada.codigo !== 0) {
    throw recusa(ctx, `a ${o.base} não está mesclada no ramo ${f.ramo}: renumerar agora daria números que a ${o.base} ainda pode ocupar.`,
      `no worktree, git merge ${o.base} --no-edit (pode parar em conflito: resolva e commite), e rode ah migracao renumerar de novo`);
  }
  const daBase = doRepositorio(ctx, o);
  const ultima = daBase.at(-1)?.numero ?? 0;
  const nomesDaBase = new Set(daBase.map(m => m.arquivo));
  const pasta = path.join(wt, o.pasta);
  const daFrente = (fs.existsSync(pasta) ? fs.readdirSync(pasta) : [])
    .filter(a => numeroDoArquivo(a, o.padrao) !== null && !nomesDaBase.has(a))
    .sort((a, b) => numeroDoArquivo(a, o.padrao) - numeroDoArquivo(b, o.padrao) || a.localeCompare(b));
  if (!daFrente.length) {
    ctx.escrever(`A frente ${f.id} ${f.nome} não tem migração fora da ${o.base} (a última da ${o.base} é a ${formatar(ultima, o.digitos)}): nada a renumerar.\n`);
    return 0;
  }
  // Sob a trava: o primeiro número novo é o próximo livre depois da base e das reservas das outras frentes, e a
  // reserva (o último número da frente) é gravada antes dos renomes, para outra reserva não pegar o mesmo número.
  // Com mais de uma migração, a reserva guarda a última: a próxima reserva de outra frente vem depois dela.
  // Arquivo novo que não foi para o git: o git mv recusaria, e a migração nem está no ramo ainda.
  const foraDoGit = new Set(g(['ls-files', '--others', '--exclude-standard', '--', `${o.pasta}/`]).saida.split('\n').filter(Boolean).map(c => path.posix.basename(c)));
  const naoAdicionada = daFrente.find(a => foraDoGit.has(a));
  if (naoAdicionada) {
    throw recusa(ctx, `a migração ${naoAdicionada} ainda não está no git (arquivo novo, sem git add).`,
      `git add -- ${path.posix.join(o.pasta, naoAdicionada)} e rode ah migracao renumerar de novo`);
  }
  const numeros = daFrente.map(a => numeroDoArquivo(a, o.padrao));
  let inicio = null;
  await ctx.gravarCampos(f.nome, (secao, { frentes }) => {
    conferirDona(ctx, frentes.find(x => x.nome === f.nome));
    const outras = frentes.filter(x => x.nome !== f.nome).map(numeroDe).filter(n => n !== null);
    inicio = emDia(numeros, ultima, outras) ? numeros[0] : proximoNumero(ultima, outras);
    return { numero: inicio + daFrente.length - 1, em: new Date().toISOString() };
  });
  const plano = planoDeRenumeracao(daFrente, inicio, o.padrao, o.digitos);
  if (!plano.length) {
    ctx.escrever(`A migração da frente (${daFrente.join(', ')}) já está em dia: segue a ${formatar(ultima, o.digitos)} da ${o.base}, sem número de outra frente.\n`);
    return 0;
  }
  const ocupado = plano.find(({ para }) => fs.existsSync(path.join(pasta, para)) && !daFrente.includes(para));
  if (ocupado) throw recusa(ctx, `${ocupado.para} já existe em ${o.pasta}.`, 'renomeie à mão o arquivo que está no caminho e rode ah migracao renumerar de novo');
  // Subindo os números, renomeia do último para o primeiro, para um não cair no nome do outro.
  const ordem = numeroDoArquivo(plano[0].para, o.padrao) > numeroDoArquivo(plano[0].de, o.padrao) ? [...plano].reverse() : plano;
  const feitos = [];
  const seta = ({ de, para }) => `${de} → ${para}`;
  for (const par of ordem) {
    const mv = g(['mv', '--', path.posix.join(o.pasta, par.de), path.posix.join(o.pasta, par.para)]);
    if (mv.codigo !== 0) throw recusa(ctx, `git mv ${par.de} falhou: ${mv.erro.trim()}${feitos.length ? `; já renomeados (em stage): ${feitos.map(seta).join(', ')}` : ''}`, 'confira o worktree com git status');
    feitos.push(par);
    if (ctx.config.renumerar) {
      const troca = a => a.replaceAll('{de}', par.de).replaceAll('{para}', par.para).replaceAll('{pasta}', o.pasta);
      const [prog, ...resto] = ctx.config.renumerar.map(troca);
      const r = spawnSync(prog, resto, { cwd: wt, env: ctx.env, encoding: 'utf8' });
      if (r.error || r.status !== 0) {
        throw recusa(ctx, `o passo de renumerar da configuração falhou em ${seta(par)} (${r.error?.message ?? `código ${r.status}`}): ${(r.stderr || r.stdout || '').trim().slice(-400)}; já renomeados (em stage): ${feitos.map(seta).join(', ')}`,
          `conserte o passo da ferramenta para esses arquivos à mão, ou desfaça com git restore --source=HEAD --staged --worktree -- ${o.pasta} (descarta também o que não foi commitado nessa pasta) e rode de novo`);
      }
    }
  }
  ctx.escrever(`A migração da frente agora vai de ${formatar(inicio, o.digitos)} em diante (a última da ${o.base} é a ${formatar(ultima, o.digitos)}): ${plano.map(seta).join(', ')}.\n`);
  const antigos = plano.flatMap(({ de }) => ['-e', de]);
  const citam = g(['grep', '-l', '-F', ...antigos, '--', '.', `:!${o.pasta}`]).saida.split('\n').filter(Boolean);
  if (citam.length) ctx.escrever(`Citam o nome antigo: ${citam.join(', ')}.\n`);
  ctx.escrever('Falta: git commit no worktree.\n');
  return 0;
}

const SUBCOMANDOS = { reservar, liberar, listar, renumerar };

export default {
  versaoDaInterface: 1,
  descricao: 'reserva do número de migração por frente, para duas frentes não criarem o mesmo número',

  validarConfig(c) {
    for (const k of Object.keys(c)) if (!CAMPOS.includes(k)) return `campo desconhecido: ${k} (valem ${CAMPOS.join(', ')})`;
    if (typeof c.pasta !== 'string' || !c.pasta || c.pasta.startsWith('/') || c.pasta.split('/').includes('..')) {
      return 'pasta é obrigatória: o caminho da pasta de migrações, relativo à raiz (ex.: "db/migracoes")';
    }
    if ('padrao' in c) {
      try { new RegExp(c.padrao); } catch { return `padrao não é uma expressão regular válida: ${String(c.padrao).slice(0, 40)}`; }
      const grupo = erroDoGrupo(c.padrao);
      if (grupo) return grupo;
    }
    if ('digitos' in c && !(Number.isInteger(c.digitos) && c.digitos >= 1 && c.digitos <= 12)) return 'digitos deve ser um inteiro de 1 a 12';
    if ('renumerar' in c && !(Array.isArray(c.renumerar) && c.renumerar.length && c.renumerar.every(a => typeof a === 'string' && a !== ''))) {
      return 'renumerar deve ser uma lista não vazia de textos, como ["npx", "ferramenta", "renomear", "{de}", "{para}"]';
    }
    return null;
  },

  comandos: {
    migracao: {
      descricao: 'reserva, libera, lista e renumera o número de migração da frente',
      uso: USO,
      requisitos: { sessao: false },
      executar([sub, ...args], ctx) {
        if (!Object.hasOwn(SUBCOMANDOS, sub ?? '')) {
          throw recusa(ctx, sub ? `Subcomando desconhecido: ${sub.slice(0, 40)}` : 'Falta o subcomando.', `use ${USO}`);
        }
        // Só listar não grava nada em nome de uma sessão.
        if (sub !== 'listar' && !ctx.sessaoId) throw recusa(ctx, 'não sei qual é a sessão', 'defina AH_SESSAO ou ligue o adaptador do agente');
        return SUBCOMANDOS[sub](args, ctx);
      },
    },
  },

  reacoes: {
    // A reserva sai do estado junto com a frente; aqui só se diz isso.
    depoisDeFechar(ctx) {
      const n = numeroDe(ctx.frente);
      if (n !== null) ctx.escrever(`Reserva de migração ${formatar(n, ctx.config.digitos ?? 4)} liberada.\n`);
    },
    // aoPassar não está aqui de propósito: a frente passada continua dona do número.
  },

  colunas: [{ titulo: 'MIGRACAO', valor: (f, ctx) => (numeroDe(f) === null ? '' : formatar(numeroDe(f), ctx.config.digitos ?? 4)) }],
};
