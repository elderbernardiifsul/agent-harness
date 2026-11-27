// Extensão `migracao`: reserva do número de migração por frente. A dor: duas frentes abertas sobre a mesma base
// criam, cada uma, a "próxima" migração, e as duas ganham o mesmo número; quem entra depois descobre no merge, ou
// pior, no banco. A reserva diz que número cada frente terá se a base receber as frentes na ordem das reservas.
//
// `ah migracao reservar|liberar|listar|renumerar`. O número reservado é o maior entre a última migração da base e
// as reservas das frentes do estado, mais um; o close libera (a reserva mora no registro da frente).
// Configuração: `{"pasta": "db/migracoes", "padrao": "^(\\d+)_", "digitos": 4, "renumerar": [argv…]}`.
import { migracoesDaBase, proximoNumero, formatar } from './numeros.mjs';

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

const SUBCOMANDOS = { reservar, liberar, listar };

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
      // O número sai do primeiro grupo de captura: "(" que não começa um "(?…".
      if (!/\((?!\?)/.test(c.padrao)) return 'padrao precisa de um grupo com o número, como "^(\\d+)_"';
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
