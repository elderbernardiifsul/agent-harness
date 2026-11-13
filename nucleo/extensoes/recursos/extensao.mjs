// Extensão `recursos`: registro de recursos por frente (tipo e valor, como `porta 3001` ou `banco loja_frete`),
// para duas frentes não usarem o mesmo recurso. Guarda em frente.extensoes.recursos.itens; o close recusa a frente
// que ainda tem recursos; a frente passada (ah handoff) continua dona deles. Configuração opcional:
// `{"tipos": ["porta", "banco"]}` limita os tipos aceitos. Serve também de exemplo da interface
// (docs/extensoes/interface.md).

const TIPO = /^[a-z][a-z0-9-]*$/;
const VALOR = /^\S{1,100}$/;
const USO = 'ah recursos reservar <tipo> <valor> [--frente <nome>] | liberar <tipo> <valor>|--todos [--frente <nome>] | listar [--json]';

const itensDe = f => (Array.isArray(f?.extensoes?.recursos?.itens) ? f.extensoes.recursos.itens : []);
const texto = i => `${i.tipo} ${i.valor}`;
const mesmo = (a, b) => a.tipo === b.tipo && a.valor === b.valor;

function recusa(ctx, motivo, saida) {
  return new ctx.ErroDeUso(`${motivo}\nPróximo passo: ${saida}`);
}

// Separa `--frente <nome>` e `--todos`/`--json` dos posicionais; opção desconhecida recusa.
function lerArgs(args, ctx, aceitas) {
  const o = { posicionais: [], frente: null, todos: false, json: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--frente' && aceitas.includes('--frente')) {
      o.frente = args[++i];
      if (!o.frente) throw recusa(ctx, 'A opção --frente precisa do nome da frente.', `use ${USO}`);
    } else if (a === '--todos' && aceitas.includes('--todos')) o.todos = true;
    else if (a === '--json' && aceitas.includes('--json')) o.json = true;
    else if (a.startsWith('--')) throw recusa(ctx, `Opção desconhecida: ${a.slice(0, 40)}`, `use ${USO}`);
    else o.posicionais.push(a);
  }
  return o;
}

// A frente do comando: a dada em --frente, ou a da sessão.
function frenteAlvo(ctx, nome) {
  if (nome) {
    const f = ctx.frentes().find(x => x.nome === nome || x.id === nome);
    if (!f) throw recusa(ctx, `Não achei a frente ${nome.slice(0, 49)}.`, 'rode ah board para ver as frentes abertas');
    return f;
  }
  if (!ctx.frente) throw recusa(ctx, 'Esta sessão não tem frente.', 'abra uma com ah open <nome>, ou diga qual com --frente <nome>');
  return ctx.frente;
}

// Com --frente, a frente pode ser de outra sessão: vale a passada, a órfã (dona morta) e a sem dona, mas não a
// ativa de uma sessão viva, que é quem sabe o que os recursos dela sustentam. Chamada sob a trava das frentes,
// com a frente lida ali (`atual`), para a dona não mudar entre a conferência e a gravação.
function conferirDona(ctx, atual) {
  if (!atual || atual.estado !== 'ativa' || !atual.dona || atual.dona === ctx.sessaoId || !ctx.donaViva(atual)) return;
  throw recusa(ctx, `A frente ${atual.id} ${atual.nome} é da sessão ${atual.dona}, que está viva.`,
    `peça à sessão dona (${atual.dona}) que reserve ou libere ela mesma; com a sessão morta (frente órfã) ou a frente passada, o --frente vale`);
}
const daFrente = (frentes, f) => frentes.find(x => x.nome === f.nome);

function lerItem(ctx, [tipo, valor, ...resto]) {
  if (tipo === undefined || valor === undefined || resto.length) throw recusa(ctx, 'Faltam ou sobram argumentos.', `use ${USO}`);
  if (!TIPO.test(tipo)) throw recusa(ctx, `Tipo inválido: ${tipo.slice(0, 40)}`, 'use minúsculas, números e hífen, começando por letra (ex.: porta)');
  if (!VALOR.test(valor)) throw recusa(ctx, 'Valor inválido: precisa ter de 1 a 100 caracteres, sem espaço.', 'escreva o valor sem espaço (ex.: 3001)');
  const tipos = ctx.config.tipos;
  if (Array.isArray(tipos) && !tipos.includes(tipo)) {
    throw recusa(ctx, `Tipo ${tipo} fora de extensoes.recursos.tipos (${tipos.join(', ')}).`, `use um desses tipos ou acrescente ${tipo} em .harness/config.json`);
  }
  return { tipo, valor };
}

async function reservar(args, ctx) {
  const o = lerArgs(args, ctx, ['--frente']);
  const item = lerItem(ctx, o.posicionais);
  const f = frenteAlvo(ctx, o.frente);
  let ja = false;
  // Sob a trava das frentes: a conferência e a gravação não se separam.
  await ctx.gravarCampos(f.nome, (secao, { frentes }) => {
    conferirDona(ctx, daFrente(frentes, f));
    const dona = frentes.find(x => x.nome !== f.nome && itensDe(x).some(i => mesmo(i, item)));
    if (dona) {
      throw recusa(ctx, `${texto(item)} já está reservado pela frente ${dona.id} ${dona.nome}.`,
        `escolha outro valor (ah recursos listar mostra os reservados) ou combine com a dona da frente ${dona.nome}`);
    }
    const itens = Array.isArray(secao.itens) ? secao.itens : [];
    ja = itens.some(i => mesmo(i, item));
    return ja ? {} : { itens: [...itens, { ...item, em: new Date().toISOString() }] };
  });
  ctx.escrever(ja ? `${texto(item)} já estava reservado para esta frente (${f.id} ${f.nome}).\n` : `Reservado: ${texto(item)} para a frente ${f.id} ${f.nome}.\n`);
  return 0;
}

async function liberar(args, ctx) {
  const o = lerArgs(args, ctx, ['--frente', '--todos']);
  const f = frenteAlvo(ctx, o.frente);
  if (o.todos) {
    if (o.posicionais.length) throw recusa(ctx, 'Com --todos não vão tipo nem valor.', `use ${USO}`);
    let n = 0;
    await ctx.gravarCampos(f.nome, (secao, { frentes }) => {
      conferirDona(ctx, daFrente(frentes, f));
      n = Array.isArray(secao.itens) ? secao.itens.length : 0;
      return { itens: [] };
    });
    ctx.escrever(`Liberados ${n} recurso(s) da frente ${f.id} ${f.nome}.\n`);
    return 0;
  }
  const item = lerItem(ctx, o.posicionais);
  await ctx.gravarCampos(f.nome, (secao, { frentes }) => {
    conferirDona(ctx, daFrente(frentes, f));
    const itens = Array.isArray(secao.itens) ? secao.itens : [];
    if (!itens.some(i => mesmo(i, item))) throw recusa(ctx, `${texto(item)} não está reservado pela frente ${f.id} ${f.nome}.`, 'ah recursos listar mostra o que cada frente tem');
    return { itens: itens.filter(i => !mesmo(i, item)) };
  });
  ctx.escrever(`Liberado: ${texto(item)} da frente ${f.id} ${f.nome}.\n`);
  return 0;
}

function listar(args, ctx) {
  const o = lerArgs(args, ctx, ['--json']);
  if (o.posicionais.length) throw recusa(ctx, `Argumento a mais: ${o.posicionais[0].slice(0, 40)}`, `use ${USO}`);
  const comItens = ctx.frentes().filter(f => itensDe(f).length);
  if (o.json) {
    const recursos = comItens.flatMap(f => itensDe(f).map(i => ({ id: f.id, frente: f.nome, estado: f.estado, tipo: i.tipo, valor: i.valor, em: i.em ?? null })));
    ctx.escrever(`${JSON.stringify({ recursos })}\n`);
    return 0;
  }
  if (!comItens.length) ctx.escrever('Nenhum recurso reservado.\n');
  for (const f of comItens) ctx.escrever(`${f.id} ${f.nome}${f.estado === 'ativa' ? '' : ` (${f.estado})`}: ${itensDe(f).map(texto).join(', ')}\n`);
  return 0;
}

const SUBCOMANDOS = { reservar, liberar, listar };

export default {
  versaoDaInterface: 1,
  descricao: 'registro de recursos por frente (portas, bancos), que o close confere',

  validarConfig(c) {
    for (const k of Object.keys(c)) if (k !== 'tipos') return `campo desconhecido: ${k} (só vale tipos)`;
    if ('tipos' in c && !(Array.isArray(c.tipos) && c.tipos.length && c.tipos.every(t => typeof t === 'string' && TIPO.test(t)))) {
      return 'tipos deve ser uma lista não vazia de nomes (minúsculas, números e hífen), como ["porta", "banco"]';
    }
    return null;
  },

  comandos: {
    recursos: {
      descricao: 'reserva, libera e lista recursos por frente (portas, bancos)',
      uso: USO,
      requisitos: { sessao: false },
      executar([sub, ...args], ctx) {
        if (!Object.hasOwn(SUBCOMANDOS, sub ?? '')) {
          throw recusa(ctx, sub ? `Subcomando desconhecido: ${sub.slice(0, 40)}` : 'Falta o subcomando.', `use ${USO}`);
        }
        // Reservar e liberar mexem no estado em nome de uma sessão; listar só lê.
        if (sub !== 'listar' && !ctx.sessaoId) throw recusa(ctx, 'não sei qual é a sessão', 'defina AH_SESSAO ou ligue o adaptador do agente');
        return SUBCOMANDOS[sub](args, ctx);
      },
    },
  },

  reacoes: {
    // A frente com recursos não fecha: quem a fecha libera antes (os recursos podem ter processo ou banco atrás).
    antesDeFechar(ctx) {
      const itens = itensDe(ctx.frente);
      if (!itens.length) return null;
      return {
        recusa: `a frente ainda tem recursos reservados: ${itens.map(texto).join(', ')}`,
        saida: `libere com ah recursos liberar --todos --frente ${ctx.frente.nome} e rode ah close de novo`,
      };
    },
    // aoPassar não está aqui de propósito: a frente passada continua dona dos recursos.
  },

  verificacoes: [{
    item: 'Recursos sem conflito',
    // O mesmo recurso em duas frentes só aparece com o estado editado à mão (o reservar confere sob a trava).
    conferir(ctx) {
      const donos = new Map();
      for (const f of ctx.frentes()) {
        for (const i of itensDe(f)) {
          const chave = texto(i);
          donos.set(chave, [...(donos.get(chave) ?? []), `${f.id} ${f.nome}`]);
        }
      }
      const repetidos = [...donos].filter(([, fs]) => fs.length > 1);
      if (!repetidos.length) return { estado: 'ok' };
      const [chave] = repetidos[0];
      return {
        estado: 'falha',
        detalhe: repetidos.map(([c, fs]) => `${c} em ${fs.join(' e ')}`).join('; '),
        conserto: `libere numa delas: ah recursos liberar ${chave} --frente <nome>`,
      };
    },
  }],

  colunas: [{ titulo: 'RECURSOS', valor: f => itensDe(f).map(texto).join(', ') }],
};
