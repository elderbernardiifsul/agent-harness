// Extensão `ambiente`: portas, banco e arquivo de ambiente por frente. A dor: duas frentes abertas ao mesmo tempo
// sobem o servidor na mesma porta e testam no mesmo banco; uma derruba a outra, ou um teste apaga os dados do outro.
// Construída sobre a ideia da extensão `recursos`, mas automática: na abertura (`depoisDeAbrir`), a frente recebe
// portas livres de uma faixa, um banco próprio (criado pelo comando da configuração) e um arquivo no worktree com
// as chaves para o programa ler. No fechamento, o banco é apagado e as portas voltam para a faixa.
// Recursos fixos (que não são de frente nenhuma, como o banco de desenvolvimento) ficam na configuração e nunca são
// dados a uma frente nem apagados.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { escolherPortas, portaEmUso } from './portas.mjs';

const USO = 'ah ambiente [mostrar] [--json] | ah ambiente preparar | ah ambiente desfazer';
const CHAVE = /^[A-Z_][A-Z0-9_]*$/;
const BANCO = /^[a-z_][a-z0-9_]{0,62}$/;
const ARQUIVO_PADRAO = '.env.frente';

const recusa = (ctx, motivo, saida) => new ctx.ErroDeUso(`${motivo}\nPróximo passo: ${saida}`);
const secaoDe = f => f?.extensoes?.ambiente ?? {};
const arquivoDe = config => config.arquivo ?? ARQUIVO_PADRAO;
const fixosDe = config => ({ portas: new Set(config.fixos?.portas ?? []), bancos: new Set(config.fixos?.bancos ?? []) });
export const nomeDoBanco = (molde, frente) => molde.replaceAll('{frente}', frente.replaceAll('-', '_'));

// O comando da configuração (lista argv, sem shell), com os marcadores trocados. Devolve {ok, erro}.
function rodar(ctx, argv, valores) {
  const troca = a => Object.entries(valores).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, v), a);
  const [prog, ...args] = argv.map(troca);
  const r = spawnSync(prog, args, { cwd: ctx.raiz ?? undefined, env: ctx.env, encoding: 'utf8' });
  if (r.error) return { ok: false, erro: r.error.message, saida: '' };
  return { ok: r.status === 0, erro: (r.stderr || r.stdout || `código ${r.status}`).trim().slice(-300), saida: r.stdout ?? '' };
}

// As portas já tomadas por outras frentes: as desta extensão e as do tipo porta da extensão recursos.
function portasDeOutras(frentes, nome) {
  return frentes.filter(f => f.nome !== nome).flatMap(f => [
    ...Object.values(secaoDe(f).portas ?? {}),
    ...(f.extensoes?.recursos?.itens ?? []).filter(i => i.tipo === 'porta').map(i => Number(i.valor)),
  ]);
}

async function reservarPortas(ctx, f, avisos) {
  const { faixa, chaves } = ctx.config.portas;
  if (chaves.every(k => Number.isInteger(secaoDe(f).portas?.[k]))) return;
  // A sondagem é assíncrona e fica fora da trava; a escolha e a gravação ficam juntas, sob ela.
  const emUso = [];
  for (let p = faixa[0]; p <= faixa[1]; p++) if (await portaEmUso(p)) emUso.push(p);
  let esgotada = false;
  await ctx.gravarCampos(f.nome, (secao, { frentes }) => {
    const ocupadas = new Set([...portasDeOutras(frentes, f.nome), ...fixosDe(ctx.config).portas, ...emUso]);
    const escolhidas = escolherPortas(faixa, chaves.length, ocupadas);
    if (!escolhidas) { esgotada = true; return {}; }
    return { portas: Object.fromEntries(chaves.map((k, i) => [k, escolhidas[i]])) };
  });
  if (esgotada) {
    avisos.push(`a faixa ${faixa[0]}-${faixa[1]} não tem ${chaves.length} portas livres para a frente ${f.nome}; Faça: aumente extensoes.ambiente.portas.faixa e rode ah ambiente preparar`);
  }
}

async function criarBanco(ctx, f, avisos) {
  const b = ctx.config.banco;
  const nome = nomeDoBanco(b.nome, f.nome);
  if (secaoDe(f).banco?.criado === true) return;
  if (!BANCO.test(nome)) {
    avisos.push(`o banco ${nome.slice(0, 70)} não é um nome válido (minúsculas, números e _); Faça: mude extensoes.ambiente.banco.nome`);
    return;
  }
  const r = rodar(ctx, b.criar, { banco: nome, frente: f.nome });
  await ctx.gravarCampos(f.nome, { banco: { nome, criado: r.ok } });
  if (!r.ok) avisos.push(`não consegui criar o banco ${nome}: ${r.erro}; Faça: confira o banco e o comando extensoes.ambiente.banco.criar e rode ah ambiente preparar`);
}

function escreverArquivo(ctx, f) {
  const secao = secaoDe(f);
  if (!f.worktree || !fs.existsSync(f.worktree)) return;
  const linhas = Object.entries(secao.portas ?? {}).map(([k, v]) => `${k}=${v}`);
  if (secao.banco) linhas.push(`${ctx.config.banco.chave}=${secao.banco.nome}`);
  const cabecalho = '# gerado por ah ambiente para esta frente; não edite: refaça com tools/ah ambiente preparar\n';
  fs.writeFileSync(path.join(f.worktree, arquivoDe(ctx.config)), cabecalho + linhas.map(l => `${l}\n`).join(''));
}

// Portas, banco e arquivo, nessa ordem; só faz o que falta (serve à abertura, à retomada e ao comando).
// Nunca lança: devolve os avisos, para a reação não derrubar o open.
async function preparar(ctx, nome) {
  const avisos = [];
  const atual = () => ctx.frentes().find(x => x.nome === nome);
  if (ctx.config.portas) await reservarPortas(ctx, atual(), avisos);
  if (ctx.config.banco) await criarBanco(ctx, atual(), avisos);
  escreverArquivo(ctx, atual());
  return avisos;
}

// Apaga o banco da frente, se foi criado por ela e não é fixo. Devolve o aviso da falha, ou null.
function apagarBanco(ctx, f) {
  const banco = secaoDe(f).banco;
  if (!banco?.criado || !ctx.config.banco || fixosDe(ctx.config).bancos.has(banco.nome)) return null;
  const r = rodar(ctx, ctx.config.banco.apagar, { banco: banco.nome, frente: f.nome });
  return r.ok ? null : `não consegui apagar o banco ${banco.nome}: ${r.erro}; Faça: apague à mão com o comando de extensoes.ambiente.banco.apagar`;
}

function texto(f) {
  const s = secaoDe(f);
  const partes = Object.entries(s.portas ?? {}).map(([k, v]) => `${k}=${v}`);
  if (s.banco) partes.push(`banco ${s.banco.nome}${s.banco.criado ? '' : ' (não criado)'}`);
  return partes.join(', ') || 'nada preparado';
}

function frenteDaSessao(ctx) {
  if (!ctx.frente) throw recusa(ctx, 'Esta sessão não tem frente.', 'abra uma com ah open <nome>');
  return ctx.frente;
}

const SUBCOMANDOS = {
  mostrar(args, ctx) {
    const f = frenteDaSessao(ctx);
    if (args.includes('--json')) ctx.escrever(`${JSON.stringify({ id: f.id, frente: f.nome, ...secaoDe(f), arquivo: arquivoDe(ctx.config) })}\n`);
    else ctx.escrever(`Ambiente da frente ${f.id} ${f.nome}: ${texto(f)} (arquivo ${arquivoDe(ctx.config)}).\n`);
    return 0;
  },
  async preparar(args, ctx) {
    const f = frenteDaSessao(ctx);
    const avisos = await preparar(ctx, f.nome);
    for (const a of avisos) ctx.avisar(`Aviso: ${a}\n`);
    ctx.escrever(`Ambiente da frente ${f.id} ${f.nome}: ${texto(ctx.frentes().find(x => x.nome === f.nome))}.\n`);
    return avisos.length ? 1 : 0;
  },
  // O passo antes do close enquanto o arquivo de ambiente no worktree travar o fechamento (P5).
  async desfazer(args, ctx) {
    const f = frenteDaSessao(ctx);
    const falha = apagarBanco(ctx, f);
    if (falha) throw recusa(ctx, falha.split('; Faça: ')[0], 'confira o banco e rode ah ambiente desfazer de novo');
    fs.rmSync(path.join(f.worktree, arquivoDe(ctx.config)), { force: true });
    await ctx.gravarCampos(f.nome, { portas: undefined, banco: undefined });
    ctx.escrever(`Ambiente da frente ${f.id} ${f.nome} desfeito: banco apagado, portas liberadas, ${arquivoDe(ctx.config)} removido.\n`);
    return 0;
  },
};

// Para a P5 do close: o arquivo de ambiente é refeito a partir do estado, e perdê-lo não perde trabalho.
// Fica fora do export default até o núcleo aceitar o campo `ignorados` (hoje, campo desconhecido impede a carga).
export function ignorados(ctx) {
  return [{ caminho: arquivoDe(ctx.config), descartavel: true }];
}

const eArgv = v => Array.isArray(v) && v.length > 0 && v.every(a => typeof a === 'string' && a !== '');
const ePorta = v => Number.isInteger(v) && v >= 1 && v <= 65535;

function erroDaConfig(c) {
  const fora = Object.keys(c).find(k => !['arquivo', 'portas', 'banco', 'fixos'].includes(k));
  if (fora) return `campo desconhecido: ${fora} (valem arquivo, portas, banco e fixos)`;
  if (!c.portas && !c.banco) return 'declare portas ou banco (ou os dois)';
  if ('arquivo' in c && (typeof c.arquivo !== 'string' || !c.arquivo || path.isAbsolute(c.arquivo) || c.arquivo.split(/[\\/]/).includes('..'))) {
    return 'arquivo deve ser um caminho relativo ao worktree, sem .., como ".env.frente"';
  }
  if (c.portas) {
    const { faixa, chaves } = c.portas;
    if (!(Array.isArray(faixa) && faixa.length === 2 && faixa.every(ePorta) && faixa[0] <= faixa[1])) return 'portas.faixa deve ser [de, ate], portas de 1 a 65535 com de <= ate, como [4100, 4199]';
    if (!(Array.isArray(chaves) && chaves.length && chaves.every(k => typeof k === 'string' && CHAVE.test(k)))) return 'portas.chaves deve ser uma lista de nomes de variável, como ["PORTA_WEB"]';
  }
  if (c.banco) {
    const b = c.banco;
    if (typeof b.nome !== 'string' || !b.nome) return 'banco.nome é o molde do nome, como "loja_{frente}"';
    if (typeof b.chave !== 'string' || !CHAVE.test(b.chave)) return 'banco.chave é o nome da variável no arquivo, como "BANCO"';
    for (const k of ['criar', 'apagar']) if (!eArgv(b[k])) return `banco.${k} deve ser uma lista não vazia de textos, como ["createdb", "{banco}"]`;
    if ('listar' in b && !eArgv(b.listar)) return 'banco.listar deve ser uma lista não vazia de textos';
    if (!b.nome.includes('{frente}') && (c.fixos?.bancos ?? []).includes(b.nome)) return `o molde ${b.nome} dá o banco fixo ${b.nome}: o close o apagaria`;
  }
  if (c.fixos) {
    if (!(c.fixos.portas ?? []).every(ePorta)) return 'fixos.portas deve ser uma lista de portas';
    if (!(c.fixos.bancos ?? []).every(n => typeof n === 'string' && n)) return 'fixos.bancos deve ser uma lista de nomes';
  }
  return null;
}

export default {
  versaoDaInterface: 1,
  descricao: 'portas, banco e arquivo de ambiente por frente, criados na abertura e desfeitos no fechamento',
  validarConfig: erroDaConfig,

  comandos: {
    ambiente: {
      descricao: 'mostra, prepara de novo ou desfaz as portas, o banco e o arquivo de ambiente da frente',
      uso: USO,
      executar([sub = 'mostrar', ...args], ctx) {
        if (sub === '--json') return SUBCOMANDOS.mostrar(['--json'], ctx);
        if (!Object.hasOwn(SUBCOMANDOS, sub)) throw recusa(ctx, `Subcomando desconhecido: ${sub.slice(0, 40)}`, `use ${USO}`);
        return SUBCOMANDOS[sub](args, ctx);
      },
    },
  },

  reacoes: {
    async depoisDeAbrir(ctx) {
      for (const a of await preparar(ctx, ctx.frente.nome)) ctx.avisar(`Aviso: ${a}\n`);
    },
    // As portas saem do estado com a frente; o banco é apagado aqui. A falha só avisa: a frente já fechou.
    depoisDeFechar(ctx) {
      const falha = apagarBanco(ctx, ctx.frente);
      if (falha) ctx.avisar(`Aviso: ${falha}\n`);
    },
    // aoPassar não está aqui de propósito: a frente passada continua dona das portas e do banco.
  },

  colunas: [{
    titulo: 'AMBIENTE',
    valor: f => {
      const s = secaoDe(f);
      return [...Object.values(s.portas ?? {}), ...(s.banco ? [s.banco.nome] : [])].join(' ');
    },
  }],
};
