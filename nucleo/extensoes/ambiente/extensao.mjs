// Extensão `ambiente`: portas, banco e arquivo de ambiente por frente. A dor: duas frentes abertas ao mesmo tempo
// sobem o servidor na mesma porta e testam no mesmo banco; uma derruba a outra, ou um teste apaga os dados do outro.
// Construída sobre a ideia da extensão `recursos`, mas automática: na abertura (`depoisDeAbrir`), a frente recebe
// portas livres de uma faixa, um banco próprio (criado pelo comando da configuração) e um arquivo no worktree com
// as chaves para o programa ler. No fechamento, o banco é apagado e as portas voltam para a faixa.
// Recursos fixos (que não são de frente nenhuma, como o banco de desenvolvimento) ficam na configuração e nunca são
// dados a uma frente nem apagados.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { escolherPortas, portaEmUso } from './portas.mjs';

const USO = 'ah ambiente [mostrar] [--json] | ah ambiente preparar | ah ambiente desfazer';
const CHAVE = /^[A-Z_][A-Z0-9_]*$/;
const BANCO = /^[a-z_][a-z0-9_]{0,62}$/;
const ARQUIVO_PADRAO = '.env.frente';
const CABECALHO = '# gerado por ah ambiente para esta frente; não edite: refaça com tools/ah ambiente preparar\n';

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

// As portas já tomadas por outras frentes (por todas, com `nome` null): as desta extensão e as do tipo porta da
// extensão recursos.
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
  // Uma frente chamada "test" com o molde loja_{frente} daria o banco comum de teste: a frente fica sem banco.
  if (fixosDe(ctx.config).bancos.has(nome)) {
    avisos.push(`o nome da frente ${f.nome} dá o banco fixo ${nome}; Faça: mude extensoes.ambiente.banco.nome ou abra a frente com outro nome`);
    return;
  }
  if (!BANCO.test(nome)) {
    avisos.push(`o banco ${nome.slice(0, 70)} não é um nome válido (minúsculas, números e _); Faça: mude extensoes.ambiente.banco.nome`);
    return;
  }
  const r = rodar(ctx, b.criar, { banco: nome, frente: f.nome });
  // A máquina que criou o banco é a única que o apaga: outra máquina com a mesma frente (retomada) não tem como
  // saber se o banco ainda é usado.
  await ctx.gravarCampos(f.nome, { banco: r.ok ? { nome, criado: true, maquina: os.hostname() } : { nome, criado: false } });
  if (!r.ok) avisos.push(`não consegui criar o banco ${nome}: ${r.erro}; Faça: confira o banco e o comando extensoes.ambiente.banco.criar e rode ah ambiente preparar`);
}

// O arquivo é nosso quando ainda não existe ou começa com o nosso cabeçalho. O de outra origem (o .env do aluno,
// com as chaves dele) nunca é sobrescrito nem apagado.
function eNosso(caminho) {
  try { return fs.readFileSync(caminho, 'utf8').startsWith(CABECALHO); } catch (e) { return e.code === 'ENOENT'; }
}

const sha256 = texto => crypto.createHash('sha256').update(texto).digest('hex');

// Escreve o arquivo e devolve o registro dele ({caminho, sha256}), ou null quando não escreveu. O registro é o que
// permite ao close tratá-lo como descartável: só o arquivo que a extensão escreveu, ainda como ela o deixou.
function escreverArquivo(ctx, f, avisos) {
  const secao = secaoDe(f);
  if (!f.worktree || !fs.existsSync(f.worktree)) return null;
  const arquivo = arquivoDe(ctx.config);
  const caminho = path.join(f.worktree, arquivo);
  if (!eNosso(caminho)) {
    avisos.push(`${arquivo} já existe e não foi gerado pelo ah ambiente; Faça: use outro extensoes.ambiente.arquivo ou apague o arquivo à mão e rode ah ambiente preparar`);
    return null;
  }
  const linhas = Object.entries(secao.portas ?? {}).map(([k, v]) => `${k}=${v}`);
  // Só o banco que existe: apontar para um banco que a frente não criou faria ela usar o de outra.
  if (secao.banco?.criado) linhas.push(`${ctx.config.banco.chave}=${secao.banco.nome}`);
  const texto = CABECALHO + linhas.map(l => `${l}\n`).join('');
  fs.mkdirSync(path.dirname(caminho), { recursive: true });
  fs.writeFileSync(caminho, texto);
  // Fora do .gitignore, o arquivo aparece como alteração não commitada, e o close recusa o worktree.
  if (ctx.git(['check-ignore', '-q', '--', arquivo], { cwd: f.worktree }).codigo === 1) {
    avisos.push(`${arquivo} não está no .gitignore; Faça: acrescente ${arquivo} ao .gitignore e commite (senão o close recusa o worktree)`);
  }
  return { caminho: arquivo, sha256: sha256(texto) };
}

// Portas, banco e arquivo, nessa ordem; só faz o que falta (serve à abertura, à retomada e ao comando).
// O que se espera dar errado (faixa cheia, banco desligado, arquivo alheio) vira aviso, para não derrubar o open.
async function preparar(ctx, nome) {
  const avisos = [];
  const atual = () => ctx.frentes().find(x => x.nome === nome);
  if (ctx.config.portas) await reservarPortas(ctx, atual(), avisos);
  if (ctx.config.banco) await criarBanco(ctx, atual(), avisos);
  const escrito = escreverArquivo(ctx, atual(), avisos);
  if (escrito) await ctx.gravarCampos(nome, { arquivo: escrito });
  return avisos;
}

// Por que o banco desta frente não deve ser apagado aqui, ou null quando pode. O banco de outra máquina fica com
// ela (só ela sabe se a frente continua lá).
function motivoParaManter(f) {
  const banco = secaoDe(f).banco;
  if (banco?.maquina && banco.maquina !== os.hostname()) {
    return `o banco ${banco.nome} foi criado em outra máquina (${banco.maquina}): não o apaguei; Faça: apague-o naquela máquina, ou à mão com o comando de extensoes.ambiente.banco.apagar, quando ninguém mais o usar`;
  }
  return null;
}

// Apaga o banco da frente, se foi criado por ela, nesta máquina, e não é fixo. Devolve o aviso da falha, ou null.
function apagarBanco(ctx, f) {
  const banco = secaoDe(f).banco;
  if (!banco?.criado || !ctx.config.banco || fixosDe(ctx.config).bancos.has(banco.nome)) return null;
  const manter = motivoParaManter(f);
  if (manter) return manter;
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
  // Devolve a frente ao que era antes do ambiente: sem banco, sem portas, sem arquivo.
  async desfazer(args, ctx) {
    const f = frenteDaSessao(ctx);
    const secao = secaoDe(f);
    const falha = apagarBanco(ctx, f);
    if (falha) throw recusa(ctx, falha.split('; Faça: ')[0], 'confira o banco e rode ah ambiente desfazer de novo');
    const feito = [];
    if (secao.banco?.criado && !fixosDe(ctx.config).bancos.has(secao.banco.nome)) feito.push(`banco ${secao.banco.nome} apagado`);
    // A pasta da frente pode ter um .env do aluno no mesmo caminho: só sai o que a extensão escreveu.
    if (Object.keys(secao.portas ?? {}).length) feito.push('portas liberadas');
    const arquivo = arquivoDe(ctx.config);
    const caminho = path.join(f.worktree, arquivo);
    const alheio = fs.existsSync(caminho) && !eNosso(caminho);
    if (fs.existsSync(caminho) && !alheio) { fs.rmSync(caminho); feito.push(`${arquivo} removido`); }
    await ctx.gravarCampos(f.nome, { portas: undefined, banco: undefined, arquivo: undefined });
    ctx.escrever(`Ambiente da frente ${f.id} ${f.nome} desfeito: ${feito.join(', ') || 'nada a desfazer'}.\n`);
    if (alheio) ctx.escrever(`${arquivo} não foi removido (não foi gerado pelo ah ambiente).\n`);
    return 0;
  },
};

const eArgv = v => Array.isArray(v) && v.length > 0 && v.every(a => typeof a === 'string' && a !== '');
const ePorta = v => Number.isInteger(v) && v >= 1 && v <= 65535;

function erroDaConfig(c) {
  const fora = Object.keys(c).find(k => !['arquivo', 'portas', 'banco', 'fixos'].includes(k));
  if (fora) return `campo desconhecido: ${fora} (valem arquivo, portas, banco e fixos)`;
  if (!c.portas && !c.banco) return 'declare portas ou banco (ou os dois)';
  if ('arquivo' in c && (typeof c.arquivo !== 'string' || !c.arquivo || path.isAbsolute(c.arquivo) || c.arquivo.split(/[\\/]/).includes('..'))) {
    return 'arquivo deve ser um caminho relativo ao worktree, sem .., como ".env.frente"';
  }
  if ('arquivo' in c && /[\\/]$/.test(c.arquivo)) {
    return 'arquivo deve ser um arquivo, não uma pasta (sem / no fim), como ".env.frente"';
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

  // O arquivo de ambiente é refeito a partir do estado: perdê-lo com o worktree não perde trabalho, e o close
  // não o conta como item ignorado a guardar.
  // O arquivo de ambiente só é descartável quando foi esta extensão que o escreveu e ele ainda está como ela o
  // deixou (o hash gravado na frente): aí ele é refeito a partir do estado, e perdê-lo com o worktree não perde
  // trabalho. Um arquivo alheio no mesmo caminho (o .env do aluno) ou mudado à mão cai na recusa de sempre do close.
  ignorados(ctx) {
    const registro = secaoDe(ctx.frente).arquivo;
    const arquivo = arquivoDe(ctx.config);
    if (!registro || registro.caminho !== arquivo || !ctx.frente.worktree) return [];
    let texto;
    try { texto = fs.readFileSync(path.join(ctx.frente.worktree, arquivo), 'utf8'); } catch { return []; }
    return sha256(texto) === registro.sha256 ? [{ caminho: arquivo.replaceAll('\\', '/'), descartavel: true }] : [];
  },

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
      const banco = secaoDe(ctx.frente).banco;
      // A frente passada pode ter continuado noutra sessão ou máquina, que usa o mesmo banco.
      if (ctx.frente.estado === 'passada' && banco?.criado && !fixosDe(ctx.config).bancos.has(banco.nome)) {
        ctx.avisar(`Aviso: a frente estava passada: o banco ${banco.nome} fica para quem a continuou; Faça: se ninguém a continuou, apague-o à mão com o comando de extensoes.ambiente.banco.apagar\n`);
        return;
      }
      const falha = apagarBanco(ctx, ctx.frente);
      if (falha) ctx.avisar(`Aviso: ${falha}\n`);
    },
    // aoPassar não está aqui de propósito: a frente passada continua dona das portas e do banco.

    // O que ficou para trás: porta da faixa escutando sem frente, banco do molde sem frente. Só lista: apagar banco
    // ou matar processo é decisão de quem sabe o que está ali.
    async noSweep(ctx) {
      const linhas = [];
      const frentes = ctx.frentes();
      const fixos = fixosDe(ctx.config);
      if (ctx.config.portas) {
        const deFrentes = new Set(portasDeOutras(frentes, null));
        const [de, ate] = ctx.config.portas.faixa;
        for (let p = de; p <= ate; p++) {
          if (deFrentes.has(p) || fixos.portas.has(p) || !(await portaEmUso(p))) continue;
          linhas.push(`porta ${p} em uso sem frente; Faça: encerre o processo ou declare a porta em extensoes.ambiente.fixos.portas`);
        }
      }
      const b = ctx.config.banco;
      if (b?.listar) {
        const r = rodar(ctx, b.listar, {});
        if (!r.ok) linhas.push(`não consegui listar os bancos: ${r.erro}; Faça: confira extensoes.ambiente.banco.listar`);
        else {
          // O molde vira expressão regular: o texto literal escapado, e {frente} no lugar de qualquer nome de frente.
          const literal = b.nome.split('{frente}').map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
          const doMolde = new RegExp(`^${literal.join('[a-z0-9_]+')}$`);
          const daFrente = new Set(frentes.flatMap(f => [secaoDe(f).banco?.nome, nomeDoBanco(b.nome, f.nome)]));
          for (const nome of r.saida.split('\n').map(l => l.trim()).filter(Boolean)) {
            if (!doMolde.test(nome) || daFrente.has(nome) || fixos.bancos.has(nome)) continue;
            linhas.push(`banco ${nome} sem frente; Faça: apague com o comando de extensoes.ambiente.banco.apagar ou declare em fixos.bancos`);
          }
        }
      }
      if (ctx.reparar && linhas.length) linhas.push('o --reparar não apaga banco nem encerra processo: confira cada linha e faça à mão');
      return linhas;
    },
  },

  colunas: [{
    titulo: 'AMBIENTE',
    valor: f => {
      const s = secaoDe(f);
      return [...Object.values(s.portas ?? {}), ...(s.banco ? [s.banco.nome] : [])].join(' ');
    },
  }],
};
