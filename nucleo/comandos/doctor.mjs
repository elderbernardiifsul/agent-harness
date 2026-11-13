// `ah doctor`: diz se o projeto está bem preparado. Cada verificação é uma função isolada
// `(amb, ctx) -> item | [item] | null`; uma exceção numa vira uma falha e as outras seguem.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { arquivoDaMaquina, dirEstado as caminhoDoEstado } from '../lib/caminhos.mjs';
import { ErroDeConfig, carregarConfig, configAusente } from '../lib/config.mjs';
import { ErroDeEstado, lerJson } from '../lib/estado.mjs';
import { idsNoHistorico, lerFrente, listarFrentesTolerante, siglaValida } from '../lib/frente.mjs';
import { lerFila } from '../lib/pendentes.mjs';
import { consertoDaLinhaDePendentes, worktreeSumiu } from '../lib/varredura.mjs';
import { idCurto, lerSessao } from '../lib/sessao.mjs';
import { aberturaParada, frenteOrfa, inicioDoProcesso, vidaDaDona } from '../lib/vida.mjs';
import { existeRamo, git } from '../lib/git.mjs';
import { gh, protecaoDoRamo, repoAtual } from '../lib/github.mjs';
import { mesclarGanchos } from './init.mjs';
import { ADAPTADORES, O_QUE_SE_PERDE, agenteEmUso } from '../adaptadores/registro.mjs';
import { dirDaFila, retratoDaFila } from '../lib/fila.mjs';
import { arquivosDaCopia, citar, diferenca, eClone, lerManifesto, listaDoManifesto, versaoDoClone } from '../lib/copia.mjs';
import { itensDoDoctor } from '../lib/extensoes.mjs';

export const descricao = 'confere se o projeto está bem preparado';
export const uso = 'ah doctor [--json]';
export const requisitos = { config: false, sessao: false, repositorio: false };

const NUCLEO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIM_DO_GANCHO = 'tools/ah gancho claude-code';
const ARQUIVO_CLAUDE = path.join('.claude', 'settings.json');
const HISTORICO = path.join('docs', 'agents', 'historico-das-frentes.md');
const eObjeto = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const ok = item => ({ item, estado: 'ok' });
const aviso = (item, fazer) => ({ item, estado: 'aviso', fazer });
const falha = (item, fazer) => ({ item, estado: 'falha', fazer });
const usaClaude = amb => amb.config?.agentes?.includes('claude-code') ?? false;
const comparar = (a, b) => { for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };
const versao = t => String(t).split('.').map(Number);

function verificacao(item, fn) { fn.item = item; return fn; }

const ITEM_DO_AGENTE = 'Adaptador do agente em uso';

// O roteiro de adaptação: em .harness/nucleo/docs/agentes/ na cópia instalada, em docs/agentes/ no clone.
function caminhoDoRoteiro(raiz) {
  for (const c of [path.join(NUCLEO, 'docs', 'agentes', 'README.md'), path.join(NUCLEO, '..', 'docs', 'agentes', 'README.md')]) {
    if (!fs.existsSync(c)) continue;
    const rel = raiz ? path.relative(raiz, c) : null;
    return (rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel : path.resolve(c)).replaceAll('\\', '/');
  }
  return 'docs/agentes/README.md, no clone do agent-harness';
}

// Item do doctor para o agente em uso; null quando nenhum agente se identifica (terminal comum).
// `ligados`: a lista `agentes` da configuração (null sem configuração legível).
export function situacaoDoAgente({ agente, adaptadores, ligados, roteiro }) {
  if (!agente) return null;
  const a = Object.hasOwn(adaptadores, agente) ? adaptadores[agente] : null;
  if (!a) return aviso(ITEM_DO_AGENTE, `o agente em uso (${agente}) não tem adaptador: as travas automáticas não valem e não há resumo no começo da sessão; para escrever um, leia ${roteiro}`);
  if (Array.isArray(ligados) && !ligados.includes(agente)) {
    return aviso(ITEM_DO_AGENTE, `o adaptador ${agente} existe mas não está ligado; acrescente "${agente}" em agentes no .harness/config.json e rode ah init`);
  }
  if (!Array.isArray(a.EVENTOS_ENTREGUES)) {
    return aviso(ITEM_DO_AGENTE, `o adaptador ${agente} não declara EVENTOS_ENTREGUES (os eventos do contrato que o agente entrega); declare-os como diz ${roteiro}`);
  }
  const faltam = Object.keys(O_QUE_SE_PERDE).filter(ev => !a.EVENTOS_ENTREGUES.includes(ev));
  if (faltam.length) {
    return aviso(ITEM_DO_AGENTE, `o adaptador ${agente} não entrega ${faltam.join(', ')}: ${faltam.map(ev => O_QUE_SE_PERDE[ev]).join('; ')}; o que fazer está em ${roteiro}`);
  }
  return ok(`${ITEM_DO_AGENTE} (${agente})`);
}

// O nome da frente no rótulo do item, entre crases: uma frente chamada `parada` não se confunde com o texto.
const nomeNoItem = f => `\`${f.nome}\``;

// As frentes legíveis ({frentes}), ou {falha} com o que fazer quando a pasta delas não se lê.
function frentesOuFalha(amb, nome) {
  try {
    return { frentes: listarFrentesTolerante(amb.dirEstado).frentes };
  } catch (e) {
    if (!(e instanceof ErroDeEstado)) throw e;
    return { falha: falha(nome, `${e.message}; ${e.proximo}`) };
  }
}

// Lê o `.claude/settings.json` do projeto: {settings} ou {erro}.
function lerSettings(raiz) {
  try {
    const s = JSON.parse(fs.readFileSync(path.join(raiz, ARQUIVO_CLAUDE), 'utf8'));
    return eObjeto(s) ? { settings: s } : { erro: 'não é um objeto JSON' };
  } catch (e) {
    return { erro: e.code === 'ENOENT' ? 'não existe' : 'não pôde ser lido como JSON' };
  }
}

// O modelo mora em modelos/ no clone (fonte) e em .harness/nucleo/modelos/ na cópia instalada pelo init.
function lerModelo() {
  for (const base of [path.join(NUCLEO, 'modelos'), path.join(NUCLEO, '..', 'modelos')]) {
    try {
      return JSON.parse(fs.readFileSync(path.join(base, 'claude-code', 'ganchos.json'), 'utf8'));
    } catch { /* tenta o outro lugar */ }
  }
  return null;
}

const comandoDoPre = settings => {
  for (const grupo of settings?.hooks?.PreToolUse ?? []) {
    for (const h of eObjeto(grupo) && Array.isArray(grupo.hooks) ? grupo.hooks : []) {
      if (eObjeto(h) && typeof h.command === 'string' && h.command.trim().endsWith(FIM_DO_GANCHO)) return h.command;
    }
  }
  return null;
};

// Grupos do PreToolUse que chamam o gancho do harness.
const gruposDoHarness = settings => (settings?.hooks?.PreToolUse ?? []).filter(grupo => eObjeto(grupo) && Array.isArray(grupo.hooks)
  && grupo.hooks.some(h => eObjeto(h) && typeof h.command === 'string' && h.command.trim().endsWith(FIM_DO_GANCHO)));

// O seletor (`matcher`) do Claude Code pega a ferramenta? Vazio, ausente ou `*` pega todas; senão é uma
// expressão regular que precisa casar com o nome inteiro. Seletor que não é expressão válida não pega nada.
function seletorPega(matcher, ferramenta) {
  if (matcher === undefined || matcher === null || matcher === '' || matcher === '*') return true;
  if (typeof matcher !== 'string') return false;
  try { return new RegExp(`^(?:${matcher})$`).test(ferramenta); } catch { return false; }
}

// Roda o gancho PreToolUse instalado com um evento de Bash, num estado temporário (o real fica intacto).
// Devolve {comando} quando não há gancho a ensaiar, senão o resultado do spawnSync.
function ensaiarGancho(amb, comandoBash) {
  const { settings } = lerSettings(amb.raiz);
  const comando = settings ? comandoDoPre(settings) : null;
  if (!comando) return null;
  const evento = {
    hook_event_name: 'PreToolUse', session_id: 'doctor-ensaio', cwd: amb.raiz, tool_name: 'Bash',
    tool_input: { command: comandoBash },
  };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ah-doctor-'));
  try {
    const env = { ...amb.env, CLAUDE_PROJECT_DIR: amb.raiz, AH_ESTADO: tmp, AH_SESSAO: 'doctor-ensaio' };
    return process.platform === 'win32'
      // Windows não tem sh: ali roda o ah.mjs instalado direto, que é o que tools/ah.cmd executa.
      ? spawnSync(process.execPath, [path.join(amb.raiz, '.harness', 'nucleo', 'bin', 'ah.mjs'), 'gancho', 'claude-code'], { cwd: amb.raiz, env, input: JSON.stringify(evento), encoding: 'utf8', timeout: 30000 })
      : spawnSync('sh', ['-c', comando], { cwd: amb.raiz, env, input: JSON.stringify(evento), encoding: 'utf8', timeout: 30000 });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// O gancho recusou com a trava esperada? ok, ou falha com o que se viu.
function conferirRecusa(nome, r, trava, comandoBash) {
  const fazer = 'rode ah init --sobrescrever e confira tools/ah';
  if (r.status === 2) {
    if (new RegExp(`Recusado \\(${trava}\\)`).test(`${r.stderr ?? ''}\n${r.stdout ?? ''}`)) return ok(nome);
    const linha = (r.stderr ?? '').trim().split('\n')[0].slice(0, 200);
    return falha(nome, `saiu com 2 mas sem a recusa ${trava}: ${linha || '(sem mensagem)'}; ${fazer}`);
  }
  const motivo = r.error ? String(r.error.message) : `saiu com código ${r.status}`;
  return falha(nome, `o gancho não recusou \`${comandoBash}\` (${motivo}); ${fazer}`);
}

// Resultado de `gh auth status`, uma vez só.
function ghPronto(amb, ctx) {
  ctx.gh ??= gh(['auth', 'status'], { cwd: amb.raiz ?? amb.cwd, env: amb.env }).codigo === 0;
  return ctx.gh;
}

function arquivosDeEstado(dirEstado) {
  const lista = [];
  for (const pasta of ['sessoes', 'frentes']) {
    let nomes = [];
    try { nomes = fs.readdirSync(path.join(dirEstado, pasta)); } catch (e) {
      if (e.code === 'ENOENT') continue; // pasta ausente: nada a ler
      throw new ErroDeEstado(`não consegui ler a pasta ${path.join(dirEstado, pasta)} (${e.code ?? e.message})`, path.join(dirEstado, pasta));
    }
    for (const n of nomes) if (n.endsWith('.json') && !n.startsWith('.')) lista.push({ pasta, nome: n.slice(0, -5), arq: path.join(dirEstado, pasta, n) });
  }
  return lista;
}

export const VERIFICACOES = [
  verificacao('Node 22 ou mais novo', () => {
    const maior = Number(process.versions.node.split('.')[0]);
    return maior >= 22 ? ok('Node 22 ou mais novo') : falha('Node 22 ou mais novo', `o Node é ${process.versions.node}; instale o Node 22 ou mais novo`);
  }),

  verificacao('git presente', amb => (git(['--version'], { env: amb.env }).codigo === 0
    ? ok('git presente') : falha('git presente', 'instale o git e deixe-o no PATH'))),

  verificacao('Shell POSIX', () => (process.platform !== 'win32'
    ? ok('Shell POSIX') : aviso('Shell POSIX', 'no Windows nativo as travas de comando não valem; use o WSL2'))),

  verificacao('.harness/config.json válido', amb => {
    const nome = '.harness/config.json válido';
    if (!amb.raiz) return falha(nome, 'entre na pasta do projeto: aqui não é um repositório git');
    try {
      carregarConfig(amb.raiz);
      return ok(nome);
    } catch (e) {
      if (!(e instanceof ErroDeConfig)) throw e;
      if (configAusente(e)) return falha(nome, 'não há .harness/config.json; rode ah init');
      return falha(nome, `${e.erros.map(x => `${x.campo} (${x.motivo})`).join('; ')}; corrija .harness/config.json`);
    }
  }),

  verificacao('Cópia do núcleo (MANIFEST.json)', amb => {
    const nome = 'Cópia do núcleo (MANIFEST.json)';
    if (!amb.config) return null;
    const arquivo = path.join(amb.raiz, '.harness', 'nucleo', 'MANIFEST.json');
    let m;
    try { m = JSON.parse(fs.readFileSync(arquivo, 'utf8')); } catch { return falha(nome, 'não achei um .harness/nucleo/MANIFEST.json legível; rode ah init'); }
    if (!eObjeto(m) || !/^\d+\.\d+\.\d+$/.test(m.versao ?? '')) return falha(nome, 'o MANIFEST.json não tem uma versão válida; rode ah init --sobrescrever');
    if (comparar(versao(m.versao), versao(amb.config.harnessMinimo)) < 0) {
      return falha(nome, `o núcleo copiado é ${m.versao} e o projeto pede ${amb.config.harnessMinimo} ou mais novo; rode ah init --sobrescrever a partir do clone atualizado`);
    }
    return ok(nome);
  }),

  // Fatia 5: a cópia instalada é a do clone de onde veio? O clone fica em origem.json, no estado do projeto
  // (é da máquina); a comparação é pelo conteúdo (sha256 de cada arquivo), não pelo commit.
  verificacao('Núcleo igual ao clone de origem', amb => {
    const nome = 'Núcleo igual ao clone de origem';
    if (!amb.config || !amb.dirEstado) return null;
    let registro = null;
    try { registro = lerJson(path.join(amb.dirEstado, 'origem.json'), null); } catch {
      return aviso(nome, `${path.join(amb.dirEstado, 'origem.json')} ilegível; apague-o e rode tools/ah atualizar --de <clone>`);
    }
    if (typeof registro?.clone !== 'string') return ok(`${nome} (sem clone registrado nesta máquina; não conferido)`);
    const clone = registro.clone;
    if (!eClone(clone)) return aviso(nome, `o clone registrado (${clone}) não existe mais ou não é um clone do agent-harness; rode tools/ah atualizar --de <clone>`);
    const m = lerManifesto(path.join(amb.raiz, '.harness', 'nucleo'));
    const instalada = listaDoManifesto(m);
    if (!instalada) return aviso(nome, `o MANIFEST.json não tem a lista dos arquivos (cópia de antes da atualização existir); rode tools/ah atualizar --de ${citar(clone)}`);
    let doClone;
    try {
      doClone = Object.fromEntries(arquivosDaCopia(clone).arquivos.map(a => [a.rel, a.sha256]));
    } catch (e) {
      return aviso(nome, `o clone registrado (${clone}) está incompleto (${e.code === 'ENOENT' && e.path ? `falta ${path.relative(clone, e.path)}` : (e.code ?? e.message)}); atualize o clone (git pull nele, ou clone de novo) e rode tools/ah atualizar --de ${citar(clone)}`);
    }
    const d = diferenca(instalada, doClone);
    const n = d.novos.length + d.alterados.length + d.removidos.length;
    if (n === 0) return ok(nome);
    return aviso(nome, `o clone em ${clone} (versão ${versaoDoClone(clone) ?? 'desconhecida'}) difere da cópia instalada (${m.versao ?? 'versão desconhecida'}) em ${n} arquivo(s); rode tools/ah atualizar --de ${citar(clone)} (--simular mostra o que muda)`);
  }),

  verificacao('Arquivos de estado legíveis', amb => {
    const nome = 'Arquivos de estado legíveis';
    if (!amb.dirEstado) return null;
    const ruins = [];
    let arquivos = [];
    try { arquivos = arquivosDeEstado(amb.dirEstado); } catch (e) {
      if (e instanceof ErroDeEstado) return falha(nome, `${e.arquivo} ilegível; confira as permissões da pasta`);
      throw e;
    }
    // Lê como os comandos leem (com a migração de esquema): esquema desconhecido ou mais novo também é falha.
    const comEsquema = [];
    for (const { pasta, nome: n, arq } of arquivos) {
      try {
        if (pasta === 'sessoes') lerSessao(amb.dirEstado, n); else lerFrente(amb.dirEstado, n);
      } catch (e) {
        if (!(e instanceof ErroDeEstado)) throw e;
        if (e.esquema) comEsquema.push(`${e.message}; ${e.proximo}`); else ruins.push(arq);
      }
    }
    const partes = [
      ...(ruins.length ? [`${ruins.join(', ')} ilegível; apague ou conserte o arquivo`] : []),
      ...comEsquema,
    ];
    return partes.length ? falha(nome, partes.join('; ')) : ok(nome);
  }),

  verificacao('Sigla sem choque', amb => {
    const nome = 'Sigla sem choque';
    if (!amb.config) return null;
    const arquivo = arquivoDaMaquina(amb.env, process.platform, os.homedir());
    let maquina;
    try { maquina = lerJson(arquivo, null); } catch (e) {
      if (e instanceof ErroDeEstado) return falha(nome, `${arquivo} ilegível; apague ou conserte o arquivo e rode ah init --sigla <sigla>`);
      throw e;
    }
    if (!siglaValida(maquina?.sigla)) return falha(nome, 'esta máquina não tem sigla; rode ah init --sigla <sigla>, com 2 a 4 letras minúsculas');
    const { sigla, login } = maquina;
    if (typeof login !== 'string' || login === '' || login === 'local') return aviso(nome, 'não conferi o histórico sem login do gh; instale o gh, rode gh auth login e depois ah init');
    let texto = '';
    try { texto = fs.readFileSync(path.join(amb.raiz, HISTORICO), 'utf8'); } catch { /* sem histórico: sem choque */ }
    for (const linha of texto.split('\n')) {
      const ids = idsNoHistorico(linha, sigla);
      const autor = /@([A-Za-z0-9][A-Za-z0-9-]*)/.exec(linha)?.[1];
      if (ids.length && autor && autor.toLowerCase() !== login.toLowerCase()) {
        return falha(nome, `a sigla ${sigla} já foi usada por @${autor} (${sigla}-${ids[0]}) no histórico; rode ah init --sigla <outra sigla>`);
      }
    }
    return ok(nome);
  }),

  verificacao('gh presente e autenticado', (amb, ctx) => (ghPronto(amb, ctx)
    ? ok('gh presente e autenticado')
    : aviso('gh presente e autenticado', 'sem o gh não há comentário em ticket nem proteção de ramo; instale o gh e rode gh auth login'))),

  verificacao('Ramo base e ramos protegidos', amb => {
    const nome = 'Ramo base e ramos protegidos';
    if (!amb.config) return null;
    const faltam = [amb.config.git.base, ...amb.config.git.protegidos].filter(r => !existeRamo(amb.raiz, r, { env: amb.env }));
    return faltam.length ? falha(nome, `faltam os ramos ${faltam.join(', ')}; rode ah init`) : ok(nome);
  }),

  verificacao('Ganchos do Claude Code instalados', amb => {
    const nome = 'Ganchos do Claude Code instalados';
    if (!amb.config || !usaClaude(amb)) return null;
    const { settings, erro } = lerSettings(amb.raiz);
    if (!settings) return falha(nome, `${ARQUIVO_CLAUDE.replaceAll('\\', '/')} ${erro}; rode ah init`);
    const modelo = lerModelo();
    if (!modelo) return falha(nome, 'não achei o modelo dos ganchos (modelos/claude-code/ganchos.json) no núcleo; rode ah init');
    const completo = JSON.stringify(mesclarGanchos(settings, modelo)) === JSON.stringify(settings);
    return completo ? ok(nome) : falha(nome, 'faltam ou diferem os ganchos que o init instala; rode ah init');
  }),

  verificacao('Harness no ramo base', amb => {
    const nome = 'Harness no ramo base';
    if (!amb.config) return null;
    const base = amb.config.git.base;
    const faltam = ['tools/ah', '.harness/config.json']
      .filter(c => git(['cat-file', '-e', `refs/heads/${base}:${c}`], { cwd: amb.raiz, env: amb.env }).codigo !== 0);
    if (!faltam.length) return ok(nome);
    return falha(nome, `${faltam.join(' e ')} ${faltam.length > 1 ? 'não estão' : 'não está'} no ramo ${base}, de onde as frentes partem; faça o commit do harness em ${base}: `
      + `git switch ${base} e o git add/git commit que o ah init mostrou (se o commit já está em outro ramo: git switch ${base} && git merge <esse ramo>)`);
  }),

  verificacao('Gancho responde', amb => {
    const nome = 'Gancho responde';
    if (!amb.config || !usaClaude(amb)) return null;
    const alvo = amb.config.git.protegidos[0];
    const { settings } = lerSettings(amb.raiz);
    if (!settings || !comandoDoPre(settings)) return falha(nome, 'não achei o gancho PreToolUse do harness; rode ah init');
    if (!alvo) return aviso(nome, 'não há ramo protegido para ensaiar o gancho; defina git.protegidos em .harness/config.json');
    const comando = `git push ${amb.config.git.remoto} ${alvo}`;
    return conferirRecusa(nome, ensaiarGancho(amb, comando), 'T5', comando);
  }),

  verificacao('Hora de início do processo', () => {
    const nome = 'Hora de início do processo';
    if (process.platform === 'win32') return aviso(nome, 'no Windows a hora de início não é conferida; um pid reaproveitado conta como vivo até o sinal vencer');
    return inicioDoProcesso(process.pid) !== null ? ok(nome)
      : aviso(nome, `não consegui ler a hora de início de um processo (${process.platform === 'linux' ? '/proc' : 'ps -o lstart'}); um pid reaproveitado conta como vivo até o sinal vencer`);
  }),

  verificacao('Gancho recusa troca de ramo', amb => {
    const nome = 'Gancho recusa troca de ramo';
    if (!amb.config || !usaClaude(amb)) return null;
    const alvo = amb.config.git.protegidos[0];
    const { settings } = lerSettings(amb.raiz);
    if (!settings || !comandoDoPre(settings)) return falha(nome, 'não achei o gancho PreToolUse do harness; rode ah init');
    if (!alvo) return aviso(nome, 'não há ramo protegido para ensaiar a troca de ramo; defina git.protegidos em .harness/config.json');
    const comando = `git switch ${alvo}`;
    return conferirRecusa(nome, ensaiarGancho(amb, comando), 'T1', comando);
  }),

  verificacao('Ganchos vigiam a edição', amb => {
    const nome = 'Ganchos vigiam a edição';
    if (!amb.config || !usaClaude(amb)) return null;
    const { settings } = lerSettings(amb.raiz);
    const grupos = settings ? gruposDoHarness(settings) : [];
    if (!grupos.length) return falha(nome, 'não achei o gancho PreToolUse do harness; rode ah init');
    const faltam = ['Edit', 'Write', 'NotebookEdit'].filter(f => !grupos.some(g => seletorPega(g.matcher, f)));
    if (!faltam.length) return ok(nome);
    const lista = faltam.length === 1 ? faltam[0] : `${faltam.slice(0, -1).join(', ')} e ${faltam.at(-1)}`;
    return falha(nome, `o seletor do PreToolUse não pega ${lista}; sem ele a trava T4 não vê a edição de arquivo; rode ah init`);
  }),

  // A mesma leitura dos achados `pendentes` e `pendente-ilegivel` do sweep (lerFila, uma leitura só).
  verificacao('Comentários pendentes', amb => {
    const nome = 'Comentários pendentes';
    if (!amb.dirEstado) return null;
    let fila;
    try {
      fila = lerFila(amb.dirEstado);
    } catch (e) {
      if (e instanceof ErroDeEstado) return aviso(nome, `não consegui ler a fila (${e.message.split('\n')[0]}); apague ou conserte o arquivo`);
      throw e;
    }
    const n = fila.ops.length;
    const itens = fila.ilegiveis.map(linha => aviso(nome, `linha ilegível em pendentes: linha ${linha} de ${fila.arquivo}; ${consertoDaLinhaDePendentes(linha, fila.arquivo)}`));
    if (!n) return itens.length ? itens : ok(nome);
    const tickets = [...new Set(fila.ops.map(op => op.ticket))].map(t => `#${t}`).join(', ');
    return [aviso(nome, `${n} ${n === 1 ? 'operação' : 'operações'} na fila${tickets ? ` (${tickets})` : ''}; rode ah sweep --reparar com rede; `
      + 'enquanto um ticket tem operação na fila, o ah open não o reserva'), ...itens];
  }),

  // As mesmas funções do achado `frente-orfa` do sweep (vidaDaDona e frenteOrfa).
  verificacao('Frentes órfãs', amb => {
    if (!amb.dirEstado) return null;
    const lidas = frentesOuFalha(amb, 'Frentes órfãs');
    if (lidas.falha) return lidas.falha;
    const { frentes } = lidas;
    const agora = Date.now();
    const orfas = frentes.map(f => ({ f, v: vidaDaDona(amb.dirEstado, f.dona, { config: amb.config, agora }) })).filter(({ f, v }) => frenteOrfa(f, v));
    if (!orfas.length) return ok('Frentes órfãs');
    return orfas.map(({ f, v }) => aviso(`Frente ${nomeNoItem(f)} órfã`,
      `${f.dona ? `dona ${idCurto(f.dona)} (${v.motivo})` : 'sem dona'}; ah takeover ${f.nome} com a ordem do executivo`));
  }),

  verificacao('Proteção no servidor', (amb, ctx) => {
    if (!amb.config) return null;
    const nome = 'Proteção no servidor';
    if (!ghPronto(amb, ctx)) return aviso(nome, 'sem o gh não consegui conferir a proteção dos ramos; só a trava local protege');
    const o = { cwd: amb.raiz, env: amb.env };
    const repo = amb.config.github?.repo ?? repoAtual(o);
    if (!amb.config.git.protegidos.length) return aviso(nome, 'não há ramo protegido para conferir no servidor; defina git.protegidos em .harness/config.json');
    return amb.config.git.protegidos.map(ramo => {
      const item = `Proteção de ${ramo} no servidor`;
      const r = protecaoDoRamo(ramo, { ...o, repo });
      if (r === 'protegido') return ok(item);
      if (r === 'sem-protecao') return aviso(item, 'sem proteção no servidor: só a trava local protege; rode ah init');
      return aviso(item, `não consegui conferir a proteção de ${ramo}; confira o login do gh e o acesso ao repositório`);
    });
  }),

  verificacao('CI com comando de teste', amb => {
    if (!amb.config) return null;
    const c = amb.config.ci.comandoDeTeste;
    return typeof c === 'string' && c ? ok('CI com comando de teste')
      : aviso('CI com comando de teste', 'defina ci.comandoDeTeste em .harness/config.json e rode ah init');
  }),

  verificacao('Frentes com worktree', amb => {
    // Como o sweep: a vida da dona por vidaDaDona, o mesmo filtro do achado `worktree-sumiu` (worktreeSumiu) e o
    // arquivo de frente ilegível de fora (o item dos arquivos de estado o acusa), sem esconder as outras.
    const sessaoViva = (a, id) => vidaDaDona(a.dirEstado, id, { config: a.config })?.estado === 'viva';
    if (!amb.dirEstado) return null;
    const lidas = frentesOuFalha(amb, 'Frentes com worktree');
    if (lidas.falha) return lidas.falha;
    const { frentes } = lidas;
    const sumidas = frentes.filter(worktreeSumiu);
    // Registro `abrindo` parado (processo do open morto): um open que parou entre a reserva e o worktree.
    const paradas = frentes.filter(f => f.estado === 'abrindo' && aberturaParada(f, sessaoViva(amb, f.dona)));
    if (!sumidas.length && !paradas.length) return ok('Frentes com worktree');
    return [
      ...sumidas.map(f => aviso(`Frente ${nomeNoItem(f)}`, `o worktree ${f.worktree} não existe; recrie-o ou encerre a frente com ah close ${f.nome}`)),
      ...paradas.map(f => aviso(`Frente ${nomeNoItem(f)} em abertura parada`, `um ah open parou no meio (sessão ${f.dona ?? 'sem dona'}${f.processo ? `, processo ${f.processo.pid} morto` : ''}); rode ah open ${f.nome} para terminar, ou ah close ${f.nome} para desistir`)),
    ];
  }),

  // A fila de pesado é da máquina (config.json e fila.json na pasta dela): legível, versão conhecida, sem senha morta.
  verificacao('Fila de pesado', amb => {
    const nome = 'Fila de pesado';
    const f = retratoDaFila(dirDaFila(amb.env));
    if (f.erro) {
      const [motivo, proximo] = f.erro.split('\n');
      return falha(nome, `${motivo}; ${proximo.replace(/^Próximo passo:\s*/, '')}`);
    }
    const mortas = f.entradas.filter(e => e.morta);
    if (mortas.length) {
      return aviso(nome, `senha(s) de processo morto: ${mortas.map(e => `${e.senha} (pid ${e.pid})`).join(', ')}; saem sozinhas na próxima chamada de ah pesado (ou rode ah pesado -- true)`);
    }
    return ok(nome);
  }),

  // Fatia 4: o agente em uso (AH_AGENTE ou as variáveis que ele põe no ambiente) tem adaptador?
  verificacao(ITEM_DO_AGENTE, amb => situacaoDoAgente({
    agente: agenteEmUso(amb.env ?? {}), adaptadores: ADAPTADORES, ligados: amb.config?.agentes ?? null, roteiro: caminhoDoRoteiro(amb.raiz),
  })),
];

function rodar(amb) {
  const ctx = {};
  const itens = [];
  for (const v of VERIFICACOES) {
    try {
      const r = v(amb, ctx);
      if (r) itens.push(...(Array.isArray(r) ? r : [r]));
    } catch (e) {
      itens.push(falha(v.item, `erro interno: ${String(e?.message ?? e).split('\n')[0]}`));
    }
  }
  return itens;
}

const ROTULO = { ok: 'ok     ', aviso: 'aviso  ', falha: 'FALHOU ' };

export async function executar(args, amb) {
  const completo = { ...amb };
  if (amb.raiz && !amb.dirEstado && amb.config) completo.dirEstado = caminhoDoEstado(amb.config.projeto, amb.env, process.platform, os.homedir());
  if (amb.raiz && !amb.config) {
    try { completo.config = carregarConfig(amb.raiz); } catch { /* a verificação da configuração acusa */ }
  }
  if (completo.config && !completo.dirEstado) completo.dirEstado = caminhoDoEstado(completo.config.projeto, amb.env, process.platform, os.homedir());
  const itens = rodar(completo);
  // Depois dos itens do núcleo: o item "Extensões" e as verificações das extensões (só com configuração legível).
  if (completo.config && completo.raiz) {
    try {
      itens.push(...await itensDoDoctor(completo));
    } catch (e) {
      itens.push(falha('Extensões', `erro interno: ${String(e?.message ?? e).split('\n')[0]}`));
    }
  }
  const falhas = itens.filter(i => i.estado === 'falha').length;
  const avisos = itens.filter(i => i.estado === 'aviso').length;
  if (args.includes('--json')) {
    amb.escrever(`${JSON.stringify({ itens: itens.map(i => ({ item: i.item, estado: i.estado, fazer: i.fazer ?? null })), falhas, avisos })}\n`);
  } else {
    for (const i of itens) amb.escrever(`${ROTULO[i.estado]} ${i.item}${i.fazer ? `: ${i.fazer}` : ''}\n`);
    amb.escrever(falhas || avisos ? `${falhas} falha(s), ${avisos} aviso(s).\n` : 'Tudo certo.\n');
  }
  return falhas ? 1 : 0;
}
