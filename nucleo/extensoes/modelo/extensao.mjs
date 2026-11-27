// Extensão `modelo`: níveis de modelo com nomes neutros (`alto`, `medio`, `leve`), traduzidos por agente.
//
// A dor: modelo grande em trabalho pequeno custa caro e demora; modelo pequeno em trabalho de desenho erra. E os
// nomes de modelo mudam a cada poucos meses: um plano que diz "use o opus" envelhece, um que diz "Nível: alto" não.
// O plano marca o nível de cada tarefa; `tools/ah modelo <nível>` diz qual modelo e qual esforço usar no agente
// em uso. A tradução fica na configuração do projeto (`extensoes.modelo.agentes`), sobre os padrões datados de
// `padroes.json`, que vêm da documentação oficial de cada agente.
//
// Princípio: o harness sugere e registra. Esta extensão nunca recusa por causa de modelo; só recusa o erro de uso
// do próprio comando (nível ou agente que ela não conhece). A coluna MODELO do quadro mostra o modelo que cada
// sessão dona declarou ao começar (hoje, só o adaptador do Claude Code informa).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NIVEIS = ['alto', 'medio', 'leve'];
const NOME = /^[a-z][a-z0-9-]*$/;
const USO = 'ah modelo [alto|medio|leve] [--agente <nome>] [--json]';
const PADROES = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'padroes.json'), 'utf8'));

const eObjeto = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const recusa = (ctx, motivo, saida) => new ctx.ErroDeUso(`${motivo}\nPróximo passo: ${saida}`);

// null aceita; texto é o motivo da recusa da configuração.
function validarConfig(config) {
  for (const k of Object.keys(config)) if (k !== 'agentes') return `campo desconhecido: ${k} (vale só agentes)`;
  if (config.agentes === undefined) return null;
  if (!eObjeto(config.agentes)) return 'agentes deve ser um objeto {<agente>: {<nível>: {modelo, esforco}}}';
  for (const [agente, niveis] of Object.entries(config.agentes)) {
    if (!NOME.test(agente)) return `agente ${agente}: nome inválido (minúsculas, números e hífen)`;
    if (!eObjeto(niveis)) return `agentes.${agente} deve ser um objeto {<nível>: {modelo, esforco}}`;
    for (const [nivel, t] of Object.entries(niveis)) {
      if (!NIVEIS.includes(nivel)) return `agentes.${agente}: nível ${nivel} desconhecido (valem ${NIVEIS.join(', ')})`;
      if (!eObjeto(t)) return `agentes.${agente}.${nivel} deve ser um objeto {modelo, esforco}`;
      for (const [campo, v] of Object.entries(t)) {
        if (campo !== 'modelo' && campo !== 'esforco') return `agentes.${agente}.${nivel}: campo desconhecido ${campo} (valem modelo e esforco)`;
        if (campo === 'modelo' && typeof v !== 'string') return `agentes.${agente}.${nivel}.modelo deve ser um texto`;
        if (campo === 'esforco' && v !== null && typeof v !== 'string') return `agentes.${agente}.${nivel}.esforco deve ser um texto ou null`;
      }
    }
  }
  return null;
}

// Os agentes conhecidos: os dos padrões, na ordem deles, e os que o projeto acrescentou.
const agentesDe = ctx => [...new Set([...Object.keys(PADROES.agentes), ...Object.keys(ctx.config.agentes ?? {})])];

// A tradução de um nível para um agente: o padrão, com os campos que o projeto mudou por cima.
function traduzir(nivel, agente, ctx) {
  const padrao = PADROES.agentes[agente]?.[nivel] ?? {};
  const doProjeto = ctx.config.agentes?.[agente]?.[nivel] ?? {};
  const t = { ...padrao, ...doProjeto };
  return {
    agente, nivel,
    modelo: t.modelo ?? null,
    esforco: t.esforco ?? null,
    origem: Object.keys(doProjeto).length ? 'projeto' : 'padrao',
    uso: PADROES.agentes[agente]?.uso ?? null,
  };
}

const linha = t => (t.modelo
  ? `${t.nivel} (${t.agente}): modelo ${t.modelo}, esforço ${t.esforco ?? 'padrão do agente'}`
  : `${t.nivel} (${t.agente}): sem tradução (acrescente em extensoes.modelo.agentes)`);

function lerArgs(args, ctx) {
  const o = { nivel: null, agente: null, json: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--json') o.json = true;
    else if (a === '--agente') {
      o.agente = args[++i];
      if (!o.agente) throw recusa(ctx, 'A opção --agente precisa do nome do agente.', `use ${USO}`);
    } else if (a.startsWith('--')) throw recusa(ctx, `Opção desconhecida: ${a.slice(0, 40)}`, `use ${USO}`);
    else if (o.nivel === null) o.nivel = a;
    else throw recusa(ctx, `Argumento a mais: ${a.slice(0, 40)}`, `use ${USO}`);
  }
  return o;
}

function executar(args, ctx) {
  const o = lerArgs(args, ctx);
  if (o.nivel !== null && !NIVEIS.includes(o.nivel)) {
    throw recusa(ctx, `Nível desconhecido: ${o.nivel.slice(0, 40)}.`, 'use alto, medio ou leve (tools/ah modelo mostra a tabela)');
  }
  const conhecidos = agentesDe(ctx);
  if (o.agente !== null && !conhecidos.includes(o.agente)) {
    throw recusa(ctx, `Agente desconhecido: ${o.agente.slice(0, 40)}.`,
      `use ${conhecidos.slice(0, -1).join(', ')} ou ${conhecidos.at(-1)}, ou acrescente o agente em extensoes.modelo.agentes`);
  }
  const agentes = o.agente ? [o.agente] : conhecidos;
  const niveis = o.nivel ? [o.nivel] : NIVEIS;
  const traducoes = agentes.flatMap(a => niveis.map(n => traduzir(n, a, ctx)));
  if (o.json) {
    ctx.escrever(`${JSON.stringify({ ...(o.nivel ? { nivel: o.nivel } : {}), padroesDe: PADROES.data, traducoes })}\n`);
    return 0;
  }
  if (o.nivel) {
    ctx.escrever(traducoes.map(linha).join('\n') + '\n');
    for (const a of agentes) if (PADROES.agentes[a]?.uso) ctx.escrever(`Como usar${agentes.length > 1 ? ` (${a})` : ''}: ${PADROES.agentes[a].uso}\n`);
    return 0;
  }
  ctx.escrever(`Níveis de modelo (padrões de ${PADROES.data}; o projeto muda os dele em extensoes.modelo.agentes):\n`);
  ctx.escrever(traducoes.map(t => `  ${linha(t)}`).join('\n') + '\n');
  ctx.escrever('Critérios: docs/agents/metodo.md (nível de modelo).\n');
  return 0;
}

export default {
  versaoDaInterface: 1,
  descricao: 'níveis de modelo (alto, medio, leve) traduzidos por agente',
  validarConfig,
  comandos: {
    modelo: {
      descricao: 'mostra o modelo e o esforço de cada nível no agente',
      uso: USO,
      requisitos: { sessao: false },
      executar,
    },
  },
  colunas: [{
    titulo: 'MODELO',
    // O modelo que a sessão dona declarou ao começar; sem dona ou sem o dado, o quadro mostra "—".
    valor: (frente, ctx) => (frente.dona ? ctx.sessao(frente.dona)?.modelo ?? null : null),
  }],
};
