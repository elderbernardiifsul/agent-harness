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

const LIMITE = 200;

// Por que um ticket aberto não é candidato, ou null quando é. `daDeps` vem do `ah deps --json` ({numero, frente,
// pendente}); `doGh`, da lista dos tickets com o rótulo de pronto (undefined quando o ticket não veio nela), com
// `comments` só depois de lidos. `reserva` é o rótulo que o `ah open` põe no ticket reservado: o `frente` do deps
// só conhece as frentes desta máquina, e o rótulo mostra a de outra. `incompleta`: a lista dos prontos bateu no
// limite, e um ticket fora dela pode ter o rótulo.
export function motivoDeFora(daDeps, doGh, { pronto, pendencia, reserva, incompleta = false }) {
  if (daDeps.pendente) return 'bloqueada';
  if (daDeps.frente) return `com frente ${daDeps.frente}`;
  if (!doGh) return incompleta ? `não está entre os ${LIMITE} prontos lidos (lista incompleta)` : `sem o rótulo ${pronto}`;
  if ((doGh.labels ?? []).some(l => l.name === reserva)) return `com o rótulo ${reserva} (frente em outra máquina?)`;
  const tem = texto => String(texto ?? '').toLowerCase().includes(pendencia.toLowerCase());
  if (tem(doGh.body)) return `"${pendencia}" no corpo`;
  const comentario = (doGh.comments ?? []).find(c => tem(c.body));
  if (comentario) return `"${pendencia}" num comentário de ${comentario.author?.login ?? 'alguém'}`;
  return null;
}

// O `ah deps --json` pelo contrato público, num processo filho: a extensão não depende do código interno do núcleo.
function lerDeps(ctx) {
  const r = spawnSync(process.execPath, [AH, 'deps', '--json'], { cwd: ctx.raiz, env: ctx.env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw recusa(ctx, `o ah deps não respondeu: ${umaLinha(r.stderr || r.stdout || r.error?.message)}`, 'rode tools/ah deps para ver o motivo e conserte antes');
  try { return JSON.parse(r.stdout); } catch { throw recusa(ctx, 'o ah deps --json devolveu uma saída que não li', 'rode tools/ah deps --json e confira a saída'); }
}

// Uma chamada ao gh que devolve JSON. Saída grande demais ou demora viram uma recusa própria: o próximo passo não
// é conferir o login.
function ghJson(ctx, args, oQue) {
  const r = ctx.gh(args);
  if (r.codigo !== 0) {
    if (/ENOBUFS|maxBuffer|ETIMEDOUT|SIGKILL/.test(r.erro)) throw recusa(ctx, `o gh demorou ou respondeu demais ao ler ${oQue}`, 'rode de novo; se repetir, use um rótulo de pronto mais específico em extensoes.orquestracao.pronto');
    throw recusa(ctx, `não consegui ler ${oQue}: ${umaLinha(r.erro || r.saida)}`, 'confira o acesso ao GitHub (gh auth status) e rode de novo');
  }
  try { return JSON.parse(r.saida); } catch { throw recusa(ctx, `o gh devolveu ${oQue} num formato que não li`, 'confira o gh (gh --version) e rode de novo'); }
}

// Os tickets com o rótulo de pronto, sem os comentários (que podem ser muitos): só o corpo e os rótulos.
const lerProntos = (ctx, pronto) => new Map(ghJson(ctx, ['issue', 'list', '--state', 'open', '--label', pronto, '--limit', String(LIMITE), '--json', 'number,body,labels'], `os tickets com o rótulo ${pronto}`).map(i => [i.number, i]));
const lerComentarios = (ctx, n) => ghJson(ctx, ['issue', 'view', String(n), '--json', 'comments'], `os comentários do #${n}`).comments ?? [];

function candidatos(args, ctx) {
  const json = args.includes('--json');
  const outro = args.find(a => a !== '--json');
  if (outro) throw recusa(ctx, `Argumento desconhecido: ${outro.slice(0, 40)}`, 'use ah candidatos [--json]');
  const deps = lerDeps(ctx);
  const prontos = lerProntos(ctx, opcoes(ctx).pronto);
  const incompleta = deps.completa === false || Boolean(deps.parcial) || prontos.size >= LIMITE;
  const o = { ...opcoes(ctx), reserva: ctx.configDoProjeto?.github?.rotuloDeReserva ?? 'em-andamento', incompleta };
  const lista = [];
  const fora = [];
  for (const i of deps.issues ?? []) {
    const doGh = prontos.get(i.numero);
    let motivo = motivoDeFora(i, doGh, o);
    // Os comentários só de quem passou no resto: poucos tickets, uma chamada cada.
    if (!motivo) motivo = motivoDeFora(i, { ...doGh, comments: lerComentarios(ctx, i.numero) }, o);
    if (motivo) fora.push({ numero: i.numero, titulo: i.titulo, motivo });
    else lista.push({ numero: i.numero, titulo: i.titulo });
  }
  const avisos = [...(deps.avisos ?? []).map(String)];
  if (incompleta) avisos.push(`lista incompleta: o deps ou o gh bateu no limite de ${LIMITE} tickets; os mais antigos podem faltar`);
  if (json) {
    ctx.escrever(`${JSON.stringify({ pronto: o.pronto, pendencia: o.pendencia, deCache: Boolean(deps.deCache), lidoEm: deps.lidoEm ?? null, incompleta, avisos, candidatos: lista, fora })}\n`);
    return 0;
  }
  if (deps.deCache) ctx.escrever(`Bloqueios da leitura guardada de ${deps.lidoEm} (o GitHub não respondeu ao ah deps).\n`);
  for (const a of avisos) ctx.escrever(`Aviso: ${a}\n`);
  if (lista.length) ctx.escrever(`Candidatos (rótulo ${o.pronto}, sem "${o.pendencia}"):\n${lista.map(c => `#${c.numero} ${c.titulo}\n`).join('')}`);
  else ctx.escrever('Nenhum candidato.\n');
  if (fora.length) ctx.escrever(`Fora:\n${fora.map(f => `#${f.numero} ${f.titulo}: ${f.motivo}\n`).join('')}`);
  return 0;
}

// Um padrão de caminho casa com o caminho inteiro: `**` atravessa pastas (`src/**` casa `src/a/b.js`; `src/**/x.js`
// casa também `src/x.js`), `*` e `?` ficam dentro de uma pasta, e a barra no fim vale "tudo abaixo" (`src/pagamento/`
// é `src/pagamento/**`, como no --caminhos do ah open). O resto vale literalmente.
export function casaGlob(caminho, glob) {
  const partes = (glob.endsWith('/') ? `${glob}**` : glob).split(/(\*\*\/|\*\*|\*|\?)/).map(t => ({
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
  // Sem aspas nos nomes com acento (core.quotePath), sem juntar o renome (o lado de onde o arquivo saiu também conta)
  // e separado por NUL (nome com espaço ou quebra de linha).
  const d = ctx.git(['-c', 'core.quotePath=false', 'diff', '--name-only', '--no-renames', '-z', `${base}...${ramo}`]);
  if (d.codigo !== 0) throw recusa(ctx, `não consegui comparar ${ramo} com a ${base}: ${umaLinha(d.erro)}`, `confira se a ${base} existe (git branch)`);
  const arquivos = d.saida.split('\0').filter(Boolean).filter(a => o.revisao.some(g => casaGlob(a, g))).sort();
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
  const absoluto = (c.revisao ?? []).find(g => g.startsWith('/') || g.startsWith('./'));
  if (absoluto) return `revisao: o padrão ${absoluto.slice(0, 40)} deve ser relativo à raiz, sem ./ nem / no começo (ex.: src/pagamento/**)`;
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
