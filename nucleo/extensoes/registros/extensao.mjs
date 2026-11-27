// Extensão `registros`: o diário da execução por subagentes sobrevive ao worktree.
//
// A dor: o subagent-driven-development guarda, por plano, o diário (`progress.md`: tarefas concluídas, commits,
// vereditos de revisão, decisões tomadas sem o humano) em `.superpowers/sdd/` dentro do worktree, numa pasta que o
// git ignora. Remover o worktree apaga o diário; a própria skill o apaga quando a revisão final fica limpa; e outra
// máquina que retoma a frente não o tem. O destino durável é o ticket da frente.
//
// Como a extensão resolve:
//   - `tools/ah registros guardar` comenta o diário de cada plano no(s) ticket(s), com um marcador legível por
//     máquina, guarda uma cópia na pasta de estado do projeto e tira a pasta do worktree. O `metodo.md` manda rodá-lo
//     em dois momentos: no fim do subagent-driven-development, antes de a skill apagar a pasta do plano, e antes do
//     `ah close`;
//   - `ignorados`: quem esquece o `guardar` encontra a recusa do `close` apontando este comando, e não o
//     `--descartar-ignorados`, que apagaria o diário junto com o resto;
//   - `aoPassar` (handoff): comenta e guarda a cópia, sem tirar a pasta, porque o trabalho continua.
// Nada disto recusa o trabalho: só o comando recusa o próprio erro de uso. O formato do diário está em diario.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { acharDiarios, corpoDoDiario, limparPastaDoSdd } from './diario.mjs';

const USO = 'ah registros guardar [--frente <nome>]';

const recusa = (ctx, motivo, saida) => new ctx.ErroDeUso(`${motivo}\nPróximo passo: ${saida}`);
const lerOuNada = arquivo => { try { return fs.readFileSync(arquivo, 'utf8'); } catch { return null; } };
const lerJson = arquivo => { try { return JSON.parse(fs.readFileSync(arquivo, 'utf8')); } catch { return null; } };
const planos = n => `${n} ${n === 1 ? 'plano' : 'planos'}`;
const primeiraLinha = r => ((r.erro || r.saida || '').trim().split('\n')[0] || `código ${r.codigo}`).slice(0, 200);

// Pasta das cópias da frente nesta máquina: <estado>/registros/<id da frente>/<pasta do plano>/. O id (as-1) não se
// repete na máquina; o nome da frente pode voltar depois de fechada.
export const dirDasCopias = (ctx, frente) => path.join(ctx.dirEstado, 'registros', frente.id);

// O corpo vai pela entrada padrão, como no núcleo (nucleo/lib/github.mjs): o diário pode ser grande.
function comentar(ctx, ticket, corpo) {
  const r = ctx.gh(['issue', 'comment', String(ticket), '--body-file', '-'], { entrada: corpo });
  return r.codigo === 0 ? null : primeiraLinha(r);
}

// Comenta e guarda o diário de cada plano do worktree da frente. `remover`: tira a pasta do worktree depois (o
// comando); sem ele, ela fica (o handoff). `calado`: sem diário, não diz nada (as reações).
export async function guardar(frente, ctx, { remover, calado = false }) {
  const wt = typeof frente.worktree === 'string' ? frente.worktree : null;
  const diarios = wt ? acharDiarios(wt) : [];
  const sdd = path.join(wt ?? '?', '.superpowers', 'sdd');
  if (!diarios.length) {
    if (!calado) ctx.escrever(`Nenhum diário em ${sdd}/.\n`);
    return { planos: 0, comentados: [], pendentes: [] };
  }
  const commit = ctx.git(['rev-parse', '--short=7', 'HEAD'], { cwd: wt }).saida.trim() || 'desconhecido';
  const tickets = frente.tickets ?? [];
  const base = dirDasCopias(ctx, frente);
  const comentados = new Set();
  const falhas = new Map();
  for (const d of diarios) {
    const dir = path.join(base, d.pasta);
    // O mesmo diário já comentado no mesmo ticket (pelo handoff, ou por um guardar anterior) não vai de novo.
    const anterior = lerOuNada(path.join(dir, 'progress.md')) === d.texto ? lerJson(path.join(dir, 'meta.json')) : null;
    const { corpo, cortado } = corpoDoDiario({ frente, diario: d, commit });
    const estado = {};
    for (const n of tickets) {
      const erro = anterior?.tickets?.[n] === 'comentado' ? null : comentar(ctx, n, corpo);
      estado[n] = erro ? 'pendente' : 'comentado';
      if (erro) falhas.set(n, erro);
      else comentados.add(n);
    }
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'progress.md'), d.texto);
    const meta = { id: frente.id, nome: frente.nome, pasta: d.pasta, plano: d.plano, commit, guardadoEm: new Date().toISOString(), tickets: estado, cortado };
    fs.writeFileSync(path.join(dir, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`);
  }
  const onde = comentados.size ? `; comentado em ${[...comentados].map(n => `#${n}`).join(', ')}` : '';
  ctx.escrever(`Diário de ${planos(diarios.length)} guardado em ${base}${onde}.\n`);
  if (!tickets.length) ctx.avisar(`Aviso: a frente ${frente.id} não tem ticket: o diário ficou só nesta máquina (${base}).\n`);
  for (const [n, erro] of falhas) ctx.avisar(`Aviso: não consegui comentar em #${n} (${erro}); a cópia está em ${base}, e o ah close comenta antes de fechar.\n`);
  if (remover) {
    const sobras = limparPastaDoSdd(wt);
    if (sobras.length) ctx.avisar(`Aviso: deixei no worktree o que não é do subagent-driven-development: ${sobras.join(', ')}. O ah close recusa enquanto isso estiver lá: mova o que importa para fora de ${sdd} ou apague.\n`);
  }
  return { planos: diarios.length, comentados: [...comentados], pendentes: [...falhas.keys()] };
}

function lerArgs(args, ctx) {
  const [sub, ...resto] = args;
  if (sub === undefined) throw recusa(ctx, 'Falta o subcomando.', `use ${USO}`);
  if (sub !== 'guardar') throw recusa(ctx, `Subcomando desconhecido: ${String(sub).slice(0, 40)}`, `use ${USO}`);
  const o = { frente: null };
  for (let i = 0; i < resto.length; i++) {
    if (resto[i] === '--frente') {
      o.frente = resto[++i];
      if (!o.frente) throw recusa(ctx, 'A opção --frente precisa do nome da frente.', `use ${USO}`);
    } else throw recusa(ctx, `Argumento desconhecido: ${resto[i].slice(0, 40)}`, `use ${USO}`);
  }
  return o;
}

// A frente do comando: a dada em --frente (por nome ou id), ou a da sessão. Frente ativa de outra sessão viva não:
// ela pode estar no meio da execução, e o guardar tira a pasta de trabalho do worktree.
function frenteAlvo(ctx, nome) {
  if (!nome) {
    if (!ctx.frente) throw recusa(ctx, 'Esta sessão não tem frente.', 'abra uma com ah open <nome>, ou diga qual com --frente <nome>');
    return ctx.frente;
  }
  const f = ctx.frentes().find(x => x.nome === nome || x.id === nome);
  if (!f) throw recusa(ctx, `Não achei a frente ${nome.slice(0, 49)}.`, 'rode ah board para ver as frentes abertas');
  if (f.estado === 'ativa' && f.dona && f.dona !== ctx.sessaoId && ctx.donaViva(f)) {
    throw recusa(ctx, `A frente ${f.id} ${f.nome} é da sessão ${f.dona}, que está viva.`,
      `peça à sessão dona (${f.dona}) que rode tools/ah registros guardar; com a sessão morta (frente órfã) ou a frente passada, o --frente vale`);
  }
  return f;
}

export default {
  versaoDaInterface: 1,
  descricao: 'leva o diário da execução por subagentes para o ticket da frente',
  comandos: {
    registros: {
      descricao: 'guarda o diário do subagent-driven-development no ticket e tira a pasta do worktree',
      uso: USO,
      async executar(args, ctx) {
        const o = lerArgs(args, ctx);
        await guardar(frenteAlvo(ctx, o.frente), ctx, { remover: true });
        return 0;
      },
    },
  },
  // A pasta inteira do subagent-driven-development; o guardar tira só o que é dele e avisa do resto.
  ignorados: ctx => (ctx.frente ? [{ caminho: '.superpowers/sdd/', guardar: `tools/ah registros guardar --frente ${ctx.frente.nome}` }] : []),
  reacoes: {
    async aoPassar(ctx) {
      await guardar(ctx.frente, ctx, { remover: false, calado: true });
    },
  },
};
