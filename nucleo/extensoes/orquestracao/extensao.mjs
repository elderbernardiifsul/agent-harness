// Extensão `orquestracao`: a parte determinística do trabalho de quem orquestra. A dor: escolher o próximo ticket a
// olho deixa passar o que está bloqueado, o que outra sessão já começou e o que ainda espera uma decisão do humano;
// e decidir "este diff pede revisor novo?" de cabeça é julgamento onde bastava uma conta.
//
// `ah candidatos [--json]`: os tickets livres para começar (`ah deps --json`: abertos, sem bloqueio pendente, sem
// frente) que têm o rótulo de pronto da triagem e não têm a marca de pendência no corpo nem nos comentários.
// Configuração opcional: `{"pronto": "ready-for-agent", "pendencia": "A decidir", "revisao": ["src/pagamento/**"]}`.
// O julgamento (o que fazer com cada candidato, a quem dar) fica com a skill `orquestrar`.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const AH = fileURLToPath(new URL('../../bin/ah.mjs', import.meta.url));
const PADRAO = { pronto: 'ready-for-agent', pendencia: 'A decidir', revisao: [] };
const CAMPOS = Object.keys(PADRAO);

const recusa = (ctx, motivo, saida) => new ctx.ErroDeUso(`${motivo}\nPróximo passo: ${saida}`);
const opcoes = ctx => ({ ...PADRAO, ...ctx.config });
const umaLinha = t => String(t ?? '').trim().split('\n').at(-1).slice(0, 300);

// Por que um ticket aberto não é candidato, ou null quando é. `daDeps` vem do `ah deps --json` ({numero, frente,
// pendente}); `doGh`, da lista dos tickets com o rótulo de pronto (undefined quando o ticket não tem o rótulo).
export function motivoDeFora(daDeps, doGh, { pronto, pendencia }) {
  if (daDeps.pendente) return 'bloqueada';
  if (daDeps.frente) return `com frente ${daDeps.frente}`;
  if (!doGh) return `sem o rótulo ${pronto}`;
  const tem = texto => String(texto ?? '').toLowerCase().includes(pendencia.toLowerCase());
  if (tem(doGh.body)) return `"${pendencia}" no corpo`;
  const comentario = (doGh.comments ?? []).find(c => tem(c.body));
  if (comentario) return `"${pendencia}" num comentário de ${comentario.author?.login ?? 'alguém'}`;
  return null;
}

// O `ah deps --json` pelo contrato público, num processo filho: a extensão não depende do código interno do núcleo.
function lerDeps(ctx) {
  const r = spawnSync(process.execPath, [AH, 'deps', '--json'], { cwd: ctx.raiz, env: ctx.env, encoding: 'utf8' });
  if (r.status !== 0) throw recusa(ctx, `o ah deps não respondeu: ${umaLinha(r.stderr || r.stdout || r.error?.message)}`, 'rode tools/ah deps para ver o motivo e conserte antes');
  try { return JSON.parse(r.stdout); } catch { throw recusa(ctx, 'o ah deps --json devolveu uma saída que não li', 'rode tools/ah deps --json e confira a saída'); }
}

function lerProntos(ctx, pronto) {
  const r = ctx.gh(['issue', 'list', '--state', 'open', '--label', pronto, '--limit', '200', '--json', 'number,title,body,labels,comments']);
  if (r.codigo !== 0) throw recusa(ctx, `não consegui ler os tickets com o rótulo ${pronto}: ${umaLinha(r.erro || r.saida)}`, 'confira o acesso ao GitHub (gh auth status) e rode de novo');
  try { return new Map(JSON.parse(r.saida).map(i => [i.number, i])); } catch { throw recusa(ctx, 'a lista de tickets do gh veio num formato que não li', 'confira o gh (gh --version) e rode de novo'); }
}

function candidatos(args, ctx) {
  const json = args.includes('--json');
  const outro = args.find(a => a !== '--json');
  if (outro) throw recusa(ctx, `Argumento desconhecido: ${outro.slice(0, 40)}`, 'use ah candidatos [--json]');
  const o = opcoes(ctx);
  const deps = lerDeps(ctx);
  const prontos = lerProntos(ctx, o.pronto);
  const lista = [];
  const fora = [];
  for (const i of deps.issues ?? []) {
    const motivo = motivoDeFora(i, prontos.get(i.numero), o);
    if (motivo) fora.push({ numero: i.numero, titulo: i.titulo, motivo });
    else lista.push({ numero: i.numero, titulo: i.titulo });
  }
  if (json) {
    ctx.escrever(`${JSON.stringify({ pronto: o.pronto, pendencia: o.pendencia, deCache: Boolean(deps.deCache), candidatos: lista, fora })}\n`);
    return 0;
  }
  if (deps.deCache) ctx.escrever(`Bloqueios da leitura guardada de ${deps.lidoEm} (o GitHub não respondeu ao ah deps).\n`);
  if (lista.length) ctx.escrever(`Candidatos (rótulo ${o.pronto}, sem "${o.pendencia}"):\n${lista.map(c => `#${c.numero} ${c.titulo}\n`).join('')}`);
  else ctx.escrever('Nenhum candidato.\n');
  if (fora.length) ctx.escrever(`Fora:\n${fora.map(f => `#${f.numero} ${f.titulo}: ${f.motivo}\n`).join('')}`);
  return 0;
}

// Um padrão de caminho casa com o caminho inteiro: `**` atravessa pastas (`src/**` casa `src/a/b.js`; `src/**/x.js`
// casa também `src/x.js`), `*` e `?` ficam dentro de uma pasta. O resto vale literalmente.
export function casaGlob(caminho, glob) {
  const partes = glob.split(/(\*\*\/|\*\*|\*|\?)/).map(t => ({
    '**/': '(?:.*/)?', '**': '.*', '*': '[^/]*', '?': '[^/]',
  })[t] ?? t.replace(/[.+^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`^${partes.join('')}$`).test(caminho);
}

// Os arquivos que o ramo muda em relação à base e que casam com `revisao`: pede revisor novo quando há algum.
function pedeRevisao(args, ctx) {
  const json = args.includes('--json');
  const [ramo, ...resto] = args.filter(a => a !== '--json');
  if (!ramo || resto.length) throw recusa(ctx, ramo ? `Argumento a mais: ${resto[0].slice(0, 40)}` : 'Falta o ramo.', 'use ah pede-revisao <ramo> [--json]');
  const o = opcoes(ctx);
  const base = ctx.configDoProjeto?.git?.base ?? 'dev';
  if (ctx.git(['rev-parse', '--verify', '-q', `${ramo}^{commit}`]).codigo !== 0) {
    throw recusa(ctx, `${ramo.slice(0, 60)} não é um ramo deste repositório.`, 'confira o nome com git branch');
  }
  const d = ctx.git(['diff', '--name-only', `${base}...${ramo}`]);
  if (d.codigo !== 0) throw recusa(ctx, `não consegui comparar ${ramo} com a ${base}: ${umaLinha(d.erro)}`, `confira se a ${base} existe (git branch)`);
  const arquivos = d.saida.split('\n').filter(Boolean).filter(a => o.revisao.some(g => casaGlob(a, g))).sort();
  if (json) {
    ctx.escrever(`${JSON.stringify({ ramo, base, pede: arquivos.length > 0, arquivos })}\n`);
    return 0;
  }
  if (!o.revisao.length) ctx.escrever(`${ramo} não pede revisão (extensoes.orquestracao.revisao está vazia).\n`);
  else if (!arquivos.length) ctx.escrever(`${ramo} não pede revisão: nenhum arquivo do diff casa com extensoes.orquestracao.revisao.\n`);
  else ctx.escrever(`${ramo} pede revisão: toca ${arquivos.join(', ')} (extensoes.orquestracao.revisao).\n`);
  return 0;
}

function erroDaConfig(c) {
  const fora = Object.keys(c).find(k => !CAMPOS.includes(k));
  if (fora) return `campo desconhecido: ${fora} (valem ${CAMPOS.join(', ')})`;
  for (const k of ['pronto', 'pendencia']) if (k in c && (typeof c[k] !== 'string' || !c[k].trim())) return `${k} deve ser um texto não vazio`;
  if ('revisao' in c && !(Array.isArray(c.revisao) && c.revisao.every(g => typeof g === 'string' && g))) return 'revisao deve ser uma lista de padrões de caminho, como ["src/pagamento/**"]';
  return null;
}

export default {
  versaoDaInterface: 1,
  descricao: 'escolha de trabalho para quem orquestra: candidatos prontos e caminhos que pedem revisão',
  validarConfig: erroDaConfig,

  comandos: {
    candidatos: {
      descricao: 'tickets livres, com o rótulo de pronto e sem decisão pendente; o resto, com o motivo',
      uso: 'ah candidatos [--json]',
      requisitos: { sessao: false },
      executar: candidatos,
    },
    'pede-revisao': {
      descricao: 'diz se o diff de um ramo toca os caminhos que pedem revisor novo, e quais arquivos',
      uso: 'ah pede-revisao <ramo> [--json]',
      requisitos: { sessao: false },
      executar: pedeRevisao,
    },
  },
};
