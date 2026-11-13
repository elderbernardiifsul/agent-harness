import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, realpathSync, readFileSync, mkdirSync, existsSync, utimesSync, chmodSync, readdirSync, lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { carregarConfig } from '../../nucleo/lib/config.mjs';

const RAIZ_HARNESS = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function executar(args, { cwd, env }) {
  try {
    const saida = execFileSync('git', args, { cwd, env, encoding: 'utf8', stdio: 'pipe' });
    return { codigo: 0, saida, erro: '' };
  } catch (e) {
    return { codigo: e.status ?? 1, saida: String(e.stdout ?? ''), erro: String(e.stderr ?? '') };
  }
}

// Pastas de teste ainda não limpas: apagadas na saída do processo (cada arquivo de teste roda no seu),
// para não sobrar pasta quando o teste falha ou esquece o `limpar`.
const PASTAS_A_LIMPAR = new Set();

// Devolve a escrita às pastas (um teste pode ter tirado) para o rm conseguir apagar.
function liberarEscrita(pasta) {
  try { chmodSync(pasta, 0o700); } catch { /* segue */ }
  let itens = [];
  try { itens = readdirSync(pasta); } catch { return; }
  for (const item of itens) {
    const caminho = join(pasta, item);
    let st;
    try { st = lstatSync(caminho); } catch { continue; }
    if (st.isDirectory()) liberarEscrita(caminho);
  }
}

export function apagarPastaDeTeste(pasta) {
  try {
    rmSync(pasta, { recursive: true, force: true, maxRetries: 3 });
  } catch {
    liberarEscrita(pasta);
    try { rmSync(pasta, { recursive: true, force: true, maxRetries: 3 }); } catch { /* sobra: nada mais a fazer */ }
  }
  if (!existsSync(pasta)) PASTAS_A_LIMPAR.delete(pasta);
}

process.on('exit', () => {
  for (const pasta of [...PASTAS_A_LIMPAR]) apagarPastaDeTeste(pasta);
});

function lerTicketsFalsos(arquivo) {
  return existsSync(arquivo) ? JSON.parse(readFileSync(arquivo, 'utf8')) : {};
}

export function criarRepo({ ramos = ['main', 'dev', 'stage'], remoto = true, sufixo = '' } = {}) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), `ah-teste${sufixo}-`)));
  PASTAS_A_LIMPAR.add(base);
  const raiz = join(base, 'repo');
  const estado = join(base, 'estado');
  const configVazia = join(base, 'gitconfig');
  writeFileSync(configVazia, '');
  const env = {
    ...process.env,
    GIT_CONFIG_GLOBAL: configVazia,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'ana-souza',
    GIT_AUTHOR_EMAIL: 'ana@exemplo.test',
    GIT_COMMITTER_NAME: 'ana-souza',
    GIT_COMMITTER_EMAIL: 'ana@exemplo.test',
    AH_ESTADO: estado,
    AH_WORKTREES: join(base, 'wt'),
    AH_SESSAO: 'sessao-teste-0001',
    AH_GH: join(RAIZ_HARNESS, 'teste', 'apoio', 'gh-falso.mjs'),
    GH_FALSO_LOG: join(base, 'gh.log'),
    GH_FALSO_TICKETS: join(base, 'gh-tickets.json'),
  };
  delete env.CLAUDE_CODE_SESSION_ID;
  delete env.AH_PID_AGENTE;
  delete env.GH_FALSO_FORA;
  delete env.GH_FALSO_RESPOSTAS;
  delete env.GH_FALSO_LOGIN;
  delete env.GH_FALSO_CORRIDA;
  const exigir = (args, cwd) => {
    const r = executar(args, { cwd, env });
    if (r.codigo !== 0) throw new Error(`git ${args.join(' ')} falhou: ${r.erro}`);
  };

  exigir(['init', '-b', 'main', raiz], base);
  writeFileSync(join(raiz, 'README.md'), 'repositório de teste\n');
  exigir(['add', 'README.md'], raiz);
  exigir(['commit', '-m', 'commit inicial'], raiz);
  for (const ramo of ramos) {
    if (ramo !== 'main') exigir(['branch', ramo], raiz);
  }
  if (ramos.includes('dev')) exigir(['switch', 'dev'], raiz);
  else if (!ramos.includes('main') && ramos.length) exigir(['switch', ramos[0]], raiz);

  let remotoCaminho = null;
  if (remoto) {
    remotoCaminho = join(base, 'remoto.git');
    exigir(['init', '--bare', '-b', 'main', remotoCaminho], base);
    exigir(['remote', 'add', 'origin', remotoCaminho], raiz);
  }

  return montarProjeto({ base, raiz, remoto: remotoCaminho, estado, env });
}

// O objeto de projeto de teste (o mesmo para criarRepo e outraMaquina).
function montarProjeto({ base, raiz, remoto, estado, env }) {
  const git = (args, { cwd = raiz } = {}) => executar(args, { cwd, env });
  return {
    raiz,
    remoto,
    estado,
    env,
    git,
    ghChamadas() {
      if (!existsSync(env.GH_FALSO_LOG)) return [];
      return readFileSync(env.GH_FALSO_LOG, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
    },
    ghResponder(lista) {
      const arq = join(base, 'gh-respostas.json');
      writeFileSync(arq, JSON.stringify(lista));
      env.GH_FALSO_RESPOSTAS = arq;
    },
    // Ticket como o gh falso o guarda; ausente nasce aberto e vazio.
    ghTicket(n) {
      const t = lerTicketsFalsos(env.GH_FALSO_TICKETS)[String(n)] ?? {};
      return { state: t.state ?? 'OPEN', assignees: t.assignees ?? [], labels: t.labels ?? [], comments: t.comments ?? [] };
    },
    // Acrescenta campos a um ticket do gh falso (ex.: {apagado: true}, {labels: ['em-andamento']}).
    ghSemear(n, parcial) {
      const t = lerTicketsFalsos(env.GH_FALSO_TICKETS);
      t[String(n)] = { state: 'OPEN', assignees: [], labels: [], comments: [], ...(t[String(n)] ?? {}), ...parcial };
      // O rótulo semeado num ticket existe no repositório.
      t._rotulos = [...new Set([...(t._rotulos ?? []), ...(parcial.labels ?? [])])];
      writeFileSync(env.GH_FALSO_TICKETS, JSON.stringify(t, null, 2));
    },
    ah(args, { cwd = raiz, env: extra = {}, entrada } = {}) {
      const r = spawnSync(process.execPath, [join(RAIZ_HARNESS, 'nucleo', 'bin', 'ah.mjs'), ...args], {
        cwd, env: { ...env, ...extra }, encoding: 'utf8', input: entrada, maxBuffer: 64 * 1024 * 1024,
      });
      return { codigo: r.status ?? 1, saida: r.stdout ?? '', erro: r.stderr ?? '' };
    },
    limpar() {
      apagarPastaDeTeste(base);
    },
  };
}

// Outra máquina do mesmo projeto: empurra `dev` de `p`, clona o remoto de `p` numa pasta nova, com estado e
// worktrees próprios, a sessão e o login dados, os mesmos tickets e o mesmo registro do gh falso, e a
// máquina com `{sigla, login}`. Mesma forma do objeto de criarRepo.
export function outraMaquina(p, { sessao, login, sigla }) {
  if (!p.remoto) throw new Error('outraMaquina precisa de um projeto com remoto');
  const empurra = p.git(['push', 'origin', 'refs/heads/dev:refs/heads/dev']);
  if (empurra.codigo !== 0) throw new Error(`git push do dev falhou: ${empurra.erro}`);
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'ah-teste-maquina-')));
  PASTAS_A_LIMPAR.add(base);
  const raiz = join(base, 'repo');
  const estado = join(base, 'estado');
  const env = { ...p.env, AH_ESTADO: estado, AH_WORKTREES: join(base, 'wt'), AH_SESSAO: sessao, GH_FALSO_LOGIN: login };
  delete env.GH_FALSO_RESPOSTAS;
  const c = executar(['clone', '-b', 'dev', '--', p.remoto, raiz], { cwd: base, env });
  if (c.codigo !== 0) throw new Error(`git clone falhou: ${c.erro}`);
  mkdirSync(estado, { recursive: true });
  writeFileSync(join(estado, 'maquina.json'), JSON.stringify({ sigla, login }, null, 2));
  return montarProjeto({ base, raiz, remoto: p.remoto, estado, env });
}

// Grava .harness/config.json no repositório de teste.
export function escreverConfig(p, config = {}) {
  mkdirSync(join(p.raiz, '.harness'), { recursive: true });
  writeFileSync(join(p.raiz, '.harness', 'config.json'), JSON.stringify({ projeto: 'loja', ...config }, null, 2));
}

// Repositório de teste com o init já aplicado e commitado (por caminho), para os testes partirem de um repositório limpo.
export function criarProjeto(opcoes = {}) {
  const p = criarRepo(opcoes);
  const r = p.ah(['init', '--projeto', 'loja', '--sigla', 'as', '--sem-protecao']);
  if (r.codigo !== 0) throw new Error(`ah init falhou: ${r.erro}`);
  for (const args of [['add', '--', '.harness', 'tools', 'docs/agents', '.claude', '.github'], ['commit', '-m', 'chore: instala o harness']]) {
    const g = p.git(args);
    if (g.codigo !== 0) throw new Error(`git ${args.join(' ')} falhou: ${g.erro}`);
  }
  return p;
}

// Grava um arquivo (relativo à raiz) no repositório de teste.
export function gravar(p, rel, texto) {
  const destino = join(p.raiz, rel);
  mkdirSync(dirname(destino), { recursive: true });
  writeFileSync(destino, texto);
}

// Pasta de estado do projeto `loja` no teste.
export const dirDoTeste = p => join(p.estado, 'loja');

// Ambiente de `tratar` para chamar o contrato no próprio processo.
export function amb(p) {
  return { cwd: p.raiz, env: p.env, raiz: p.raiz, config: carregarConfig(p.raiz), dirEstado: dirDoTeste(p), pid: process.pid };
}

// Evento gravado do Claude Code, com campos de topo trocados.
export function gravado(nome, troca = {}) {
  const obj = JSON.parse(readFileSync(join(RAIZ_HARNESS, 'teste', 'eventos-gravados', 'claude-code', nome), 'utf8'));
  return { ...obj, ...troca };
}

// Roda `ah gancho claude-code` com um PreToolUse da ferramenta dada.
export function ganchoPre(p, toolInput, toolName = 'Bash', { cwd = p.raiz, env } = {}) {
  const base = gravado(toolName === 'Bash' ? 'pre-bash.json' : 'pre-edit.json', { cwd, tool_name: toolName, tool_input: toolInput });
  return p.ah(['gancho', 'claude-code'], { entrada: JSON.stringify(base), env });
}

// Recua em `minutos` a data do sinal de vida da sessão (arquivo `sessoes/<sessao>.sinal`).
export function envelhecerSinal(p, sessao, minutos) {
  const arquivo = join(dirDoTeste(p), 'sessoes', `${sessao}.sinal`);
  const quando = new Date(Date.now() - minutos * 60000);
  utimesSync(arquivo, quando, quando);
}
