// Extensão de teste: usa cada parte da interface e registra em `eco.log` (no estado) o que o núcleo chamou.
// A configuração (`extensoes.eco` no config.json) liga os comportamentos que os testes precisam.
import fs from 'node:fs';
import path from 'node:path';

const registrar = (ctx, texto) => fs.appendFileSync(path.join(ctx.dirEstado, 'eco.log'), `${texto}\n`);

export default {
  versaoDaInterface: 1,
  descricao: 'extensão de teste: repete, recusa e registra o ciclo',

  validarConfig(c) {
    if ('proibido' in c && typeof c.proibido !== 'string') return 'proibido deve ser texto';
    return null;
  },

  comandos: {
    eco: {
      descricao: 'repete os argumentos',
      uso: 'ah eco <texto>',
      requisitos: { sessao: false },
      executar(args, ctx) {
        if (!args.length) throw new ctx.ErroDeUso('Nada a repetir.\nPróximo passo: ah eco <texto>');
        ctx.escrever(`eco: ${args.join(' ')}${ctx.frente ? ` (frente ${ctx.frente.nome})` : ''}\n`);
        return 0;
      },
    },
    'eco-marcar': {
      descricao: 'grava uma marca na frente',
      uso: 'ah eco-marcar <frente> <marca>',
      async executar([nome, marca], ctx) {
        const campos = await ctx.gravarCampos(nome, { marca });
        ctx.escrever(`marcado: ${JSON.stringify(campos)}\n`);
      },
    },
    'eco-quebra': {
      descricao: 'lança um erro qualquer',
      requisitos: { sessao: false },
      executar() { throw new Error('quebrou de propósito'); },
    },
  },

  travas: [
    {
      id: 'proibido',
      avaliar(acao, ctx) {
        const p = ctx.config.proibido;
        if (!p) return null;
        const alvo = acao.tipo === 'comando' ? acao.comando : acao.arquivo;
        return typeof alvo === 'string' && alvo.includes(p) ? { motivo: `a ação usa ${p}`, saida: 'faça sem isso' } : null;
      },
    },
    {
      id: 'quebrada',
      avaliar(acao) {
        if (acao.tipo === 'comando' && acao.comando.includes('quebra-trava')) throw new Error('falha de propósito');
        return null;
      },
    },
  ],

  verificacoes: [
    { item: 'Eco em ordem', conferir: ctx => ctx.config.doctor ?? { estado: 'ok' } },
    { item: 'Eco que lança', conferir: ctx => { if (ctx.config.doctorLanca) throw new Error('verificação quebrada'); return { estado: 'ok' }; } },
  ],

  reacoes: {
    async depoisDeAbrir(ctx) {
      registrar(ctx, `depoisDeAbrir ${ctx.frente.nome}${ctx.retomada ? ' (retomada)' : ''}`);
      await ctx.gravarCampos(ctx.frente.nome, { aberta: true });
    },
    antesDeFechar(ctx) {
      registrar(ctx, `antesDeFechar ${ctx.frente.nome}`);
      if (ctx.frente.extensoes?.eco?.marca === 'presa') return { recusa: 'a frente está presa pelo eco', saida: `rode ah eco-marcar ${ctx.frente.nome} solta` };
      if (ctx.config.fecharLanca) throw new Error('antesDeFechar quebrado');
      return null;
    },
    depoisDeFechar(ctx) { registrar(ctx, `depoisDeFechar ${ctx.frente.nome}${ctx.aberturaDesfeita ? ' (abertura desfeita)' : ''}`); },
    aoPassar(ctx) {
      registrar(ctx, `aoPassar ${ctx.frente.nome}`);
      if (ctx.config.passarLanca) throw new Error('aoPassar quebrado');
    },
    noSweep(ctx) { return [`eco ${ctx.reparar ? 'reparou' : 'conferiu'}`]; },
  },

  resumo: ctx => [`Eco: ${ctx.frente ? ctx.frente.nome : 'sem frente'}`, 'segunda linha', 'terceira linha que não entra'],

  colunas: [{ titulo: 'ECO', valor: f => f.extensoes?.eco?.marca ?? '—' }],
};
