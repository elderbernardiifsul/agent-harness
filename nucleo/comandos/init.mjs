import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ErroDeUso, arquivoDaMaquina } from '../lib/caminhos.mjs';
import { PADROES, validarConfig } from '../lib/config.mjs';
import { gravarJson, lerJson } from '../lib/estado.mjs';
import { siglaValida, siglaDeLogin } from '../lib/frente.mjs';
import { git, existeRamo, ramoAtual } from '../lib/git.mjs';
import { loginAtual } from '../lib/github.mjs';
import { VERSAO } from '../versao.mjs';

export const descricao = 'instala o harness neste projeto, a partir do clone do agent-harness';
export const requisitos = { config: false, sessao: false };

const RAIZ_DO_HARNESS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const AGENTES_SUPORTADOS = ['claude-code'];
const DIRS_IGNORADOS = new Set(['node_modules', 'teste', 'test', '__tests__']);
const ARQUIVO_DE_TESTE = /\.(test|spec)\.[cm]?js$/;
const ENTRADA_GITKEEP = '.harness/extensoes/.gitkeep';
const PREFIXO_NUCLEO = '.harness/nucleo/';
const COM_VALOR = new Set(['--projeto', '--sigla', '--agentes', '--teste']);
const ARQUIVO_CLAUDE = '.claude/settings.json';
const FIM_DO_COMANDO_DO_HARNESS = 'tools/ah gancho claude-code';
const eObjeto = v => v !== null && typeof v === 'object' && !Array.isArray(v);

// Lista os arquivos do núcleo a copiar. Links simbólicos nunca são seguidos (ficam em `ignorados`),
// e node_modules, pastas de teste e arquivos de teste não entram.
export function listarArquivosDoNucleo(dir) {
  const arquivos = [];
  const ignorados = [];
  const percorrer = (atual, rel) => {
    const entradas = fs.readdirSync(atual, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1));
    for (const e of entradas) {
      const relativo = rel ? `${rel}/${e.name}` : e.name;
      if (e.isSymbolicLink()) ignorados.push(relativo);
      else if (e.isDirectory()) { if (!DIRS_IGNORADOS.has(e.name)) percorrer(path.join(atual, e.name), relativo); }
      else if (e.isFile() && !ARQUIVO_DE_TESTE.test(e.name)) arquivos.push(relativo);
    }
  };
  percorrer(dir, '');
  return { arquivos, ignorados };
}

function lerOpcoes(args) {
  const o = { sobrescrever: false };
  for (let i = 0; i < args.length; i++) {
    let [nome, valor] = args[i].startsWith('--') && args[i].includes('=') ? [args[i].slice(0, args[i].indexOf('=')), args[i].slice(args[i].indexOf('=') + 1)] : [args[i], undefined];
    if (nome === '--sobrescrever' && valor === undefined) { o.sobrescrever = true; continue; }
    if (!COM_VALOR.has(nome)) {
      throw new ErroDeUso(`Opção desconhecida: ${args[i].slice(0, 40)}\nPróximo passo: use ah init [--projeto <nome>] [--sigla <sigla>] [--agentes claude-code] [--teste "<comando>"] [--sobrescrever]`);
    }
    if (valor === undefined) {
      valor = args[++i];
      if (valor === undefined || valor.startsWith('--')) throw new ErroDeUso(`A opção ${nome} precisa de um valor.\nPróximo passo: escreva ${nome} <valor>`);
    }
    o[nome.slice(2)] = valor;
  }
  return o;
}

function nomeDeProjetoPadrao(raiz) {
  const nome = path.basename(raiz).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (!nome) throw new ErroDeUso('Não consegui tirar o nome do projeto da pasta.\nPróximo passo: rode ah init --projeto <nome>');
  return nome;
}

function montarConfig(modeloJson, o, raiz) {
  const cfg = JSON.parse(modeloJson);
  cfg.projeto = o.projeto ?? nomeDeProjetoPadrao(raiz);
  if (o.teste !== undefined) cfg.ci.comandoDeTeste = o.teste;
  if (o.agentes !== undefined) {
    const lista = o.agentes.split(',').map(s => s.trim()).filter(Boolean);
    const ruim = lista.find(a => !AGENTES_SUPORTADOS.includes(a));
    if (lista.length === 0 || ruim) {
      throw new ErroDeUso(`Agente não suportado: ${String(ruim ?? o.agentes).slice(0, 40)}\nPróximo passo: use --agentes ${AGENTES_SUPORTADOS.join(',')}`);
    }
    cfg.agentes = lista;
  }
  const v = validarConfig(cfg);
  if (!v.ok) {
    const e = v.erros[0];
    throw new ErroDeUso(`Valor inválido para ${e.campo}: ${e.motivo}\nPróximo passo: corrija a opção e rode ah init de novo`);
  }
  return cfg;
}

function resolverSigla(o, amb, arquivoMaquina) {
  const gravado = lerJson(arquivoMaquina, null);
  const login = loginAtual({ cwd: amb.raiz, env: amb.env });
  if (o.sigla !== undefined && !siglaValida(o.sigla)) {
    throw new ErroDeUso(`Sigla inválida: ${o.sigla.slice(0, 20)}\nPróximo passo: use de 2 a 4 letras minúsculas, como --sigla as`);
  }
  let sigla = o.sigla ?? (siglaValida(gravado?.sigla) ? gravado.sigla : null);
  let proposta = false;
  if (!sigla && login) {
    const p = siglaDeLogin(login);
    if (siglaValida(p)) { sigla = p; proposta = true; }
  }
  if (!sigla) {
    throw new ErroDeUso(`Não consegui decidir a sigla${login ? '' : ' (sem gh, não sei o seu login)'}.\nPróximo passo: rode ah init --sigla <sigla>, com 2 a 4 letras minúsculas`);
  }
  return { sigla, proposta, login: login ?? (typeof gravado?.login === 'string' ? gravado.login : 'local'), gravado };
}

// Entrada do harness num grupo de ganchos do Claude Code: o comando termina em `tools/ah gancho claude-code`.
const eDoHarness = h => eObjeto(h) && typeof h.command === 'string' && h.command.trim().endsWith(FIM_DO_COMANDO_DO_HARNESS);

// Mescla os ganchos do modelo em `settings.hooks`, sem tocar no resto. As entradas antigas do
// harness saem (inclusive de um grupo com seletor antigo, onde os ganchos de terceiros ficam)
// e o grupo do modelo entra no lugar da primeira delas; sem entrada antiga, vai para o fim.
export function mesclarGanchos(settings, modelo) {
  const novo = structuredClone(settings);
  novo.hooks = eObjeto(novo.hooks) ? novo.hooks : {};
  for (const [evento, gruposDoModelo] of Object.entries(modelo.hooks)) {
    const resultado = [];
    let lugar = -1;
    for (const grupo of novo.hooks[evento] ?? []) {
      const ganchos = eObjeto(grupo) && Array.isArray(grupo.hooks) ? grupo.hooks : null;
      if (!ganchos || !ganchos.some(eDoHarness)) { resultado.push(grupo); continue; }
      if (lugar < 0) lugar = resultado.length;
      const restantes = ganchos.filter(h => !eDoHarness(h));
      if (restantes.length) resultado.push({ ...grupo, hooks: restantes });
    }
    resultado.splice(lugar < 0 ? resultado.length : lugar, 0, ...structuredClone(gruposDoModelo));
    novo.hooks[evento] = resultado;
  }
  return novo;
}

// Lê `.claude/settings.json` e devolve o texto mesclado, ou null se nada muda. Arquivo
// inválido recusa antes de o init gravar qualquer coisa.
function settingsDoClaude(raiz, dirModelos) {
  const arquivo = path.join(raiz, ...ARQUIVO_CLAUDE.split('/'));
  const modelo = JSON.parse(fs.readFileSync(path.join(dirModelos, 'claude-code', 'ganchos.json'), 'utf8'));
  const recusar = motivo => new ErroDeUso(`${ARQUIVO_CLAUDE} ${motivo}; não mexi nele\nPróximo passo: conserte ${ARQUIVO_CLAUDE} (ou apague-o) e rode ah init de novo`);
  let texto = null;
  try { texto = fs.readFileSync(arquivo, 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw recusar(`não pôde ser lido (${e.code ?? e.message})`); }
  let atual = {};
  if (texto !== null) {
    try { atual = JSON.parse(texto); } catch { throw recusar('não é JSON válido'); }
    if (!eObjeto(atual)) throw recusar('não é um objeto JSON');
    if ('hooks' in atual && !eObjeto(atual.hooks)) throw recusar('tem "hooks" que não é um objeto');
    for (const [evento, grupos] of Object.entries(atual.hooks ?? {})) {
      if (!Array.isArray(grupos)) throw recusar(`tem "hooks.${evento.slice(0, 40)}" que não é uma lista`);
    }
  }
  const final = `${JSON.stringify(mesclarGanchos(atual, modelo), null, 2)}\n`;
  return final === texto ? null : final;
}

function raizReal(p) {
  let atual = path.resolve(p);
  for (;;) {
    try { return path.join(fs.realpathSync(atual), path.relative(atual, path.resolve(p))); } catch { /* sobe */ }
    const pai = path.dirname(atual);
    if (pai === atual) return path.resolve(p);
    atual = pai;
  }
}

export async function executar(args, amb) {
  const o = lerOpcoes(args);
  const raiz = amb.raiz;
  const dirNucleo = path.join(RAIZ_DO_HARNESS, 'nucleo');
  const dirModelos = path.join(RAIZ_DO_HARNESS, 'modelos');
  if (!fs.existsSync(path.join(dirModelos, 'ah'))) {
    throw new ErroDeUso('Este núcleo é a cópia instalada no projeto, não o clone do agent-harness.\nPróximo passo: rode o init a partir do clone do agent-harness (node <clone>/nucleo/bin/ah.mjs init)');
  }
  if (fs.realpathSync(raiz) === fs.realpathSync(RAIZ_DO_HARNESS)) {
    throw new ErroDeUso('Este é o próprio clone do agent-harness, não um projeto de destino.\nPróximo passo: entre na pasta do projeto e rode o init de lá, usando o caminho do clone');
  }

  const arquivoMaquina = arquivoDaMaquina(amb.env, process.platform, os.homedir());
  const sigla = resolverSigla(o, amb, arquivoMaquina);
  const configExiste = fs.existsSync(path.join(raiz, '.harness', 'config.json'));
  const cfg = montarConfig(fs.readFileSync(path.join(dirModelos, 'config.json'), 'utf8'), o, raiz);

  let agentesFinais = cfg.agentes;
  try {
    if (configExiste) agentesFinais = lerJson(path.join(raiz, '.harness', 'config.json'), {})?.agentes ?? cfg.agentes;
  } catch { /* configuração ilegível: valem as opções; o resto do init avisa */ }
  const settingsClaude = Array.isArray(agentesFinais) && agentesFinais.includes('claude-code') ? settingsDoClaude(raiz, dirModelos) : null;

  const real = fs.realpathSync(raiz);
  const criados = [];
  const sobrescritos = [];
  const conflitos = [];
  const mantidos = [];
  const mesclados = [];

  // Grava `conteudo` em `rel` (caminho com "/"), sem sair da raiz do projeto nem seguir links.
  function colocar(rel, conteudo, { modo, nunca = false, mescla = false } = {}) {
    const destino = path.join(raiz, ...rel.split('/'));
    const pai = raizReal(path.dirname(destino));
    if (pai !== real && !pai.startsWith(real + path.sep)) {
      throw new ErroDeUso(`O destino sai do projeto: ${rel}\nPróximo passo: remova o link simbólico no caminho e rode ah init de novo`);
    }
    const escrever = () => {
      fs.mkdirSync(path.dirname(destino), { recursive: true });
      fs.writeFileSync(destino, conteudo, { mode: modo });
      if (modo !== undefined && process.platform !== 'win32') fs.chmodSync(destino, modo);
    };
    let st = null;
    try { st = fs.lstatSync(destino); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    if (!st) { escrever(); criados.push(rel); return; }
    if (st.isFile()) {
      if (fs.readFileSync(destino).equals(conteudo)) {
        if (modo !== undefined && process.platform !== 'win32') fs.chmodSync(destino, modo);
        return;
      }
      if (nunca) { mantidos.push(rel); return; }
      if (mescla) { escrever(); mesclados.push(rel); return; }
      if (!o.sobrescrever) { conflitos.push(rel); return; }
      escrever(); sobrescritos.push(rel); return;
    }
    if (st.isSymbolicLink() && o.sobrescrever && !nunca) { fs.unlinkSync(destino); escrever(); sobrescritos.push(rel); return; }
    conflitos.push(rel);
  }

  // 1. Núcleo e manifesto.
  const { arquivos, ignorados } = listarArquivosDoNucleo(dirNucleo);
  for (const rel of arquivos) colocar(PREFIXO_NUCLEO + rel, fs.readFileSync(path.join(dirNucleo, ...rel.split('/'))));
  const c = git(['rev-parse', 'HEAD'], { cwd: RAIZ_DO_HARNESS, env: amb.env });
  const commit = c.codigo === 0 && /^[0-9a-f]{40}$/.test(c.saida.trim()) ? c.saida.trim() : null;
  const arquivoManifesto = PREFIXO_NUCLEO + 'MANIFEST.json';
  const anterior = lerJson(path.join(raiz, ...arquivoManifesto.split('/')), null);
  if (!(anterior && anterior.versao === VERSAO && anterior.commit === commit)) {
    colocar(arquivoManifesto, Buffer.from(`${JSON.stringify({ versao: VERSAO, commit, copiadoEm: new Date().toISOString() }, null, 2)}\n`));
  }

  // 2. Configuração e extensões: nunca sobrescritas.
  colocar('.harness/config.json', Buffer.from(`${JSON.stringify(cfg, null, 2)}\n`), { nunca: true });
  colocar(ENTRADA_GITKEEP, Buffer.alloc(0), { nunca: true });

  // 3. Entrada do harness e documentos.
  colocar('tools/ah', fs.readFileSync(path.join(dirModelos, 'ah')), { modo: 0o755 });
  colocar('tools/ah.cmd', fs.readFileSync(path.join(dirModelos, 'ah.cmd')));
  for (const doc of ['sessoes-paralelas.md', 'historico-das-frentes.md']) {
    colocar(`docs/agents/${doc}`, fs.readFileSync(path.join(dirModelos, doc)));
  }

  // Ganchos do Claude Code: o conteúdo já é a mescla do arquivo atual, então pode trocá-lo.
  if (settingsClaude !== null) colocar(ARQUIVO_CLAUDE, Buffer.from(settingsClaude), { mescla: true });

  // 4. Sigla na máquina.
  const novo = { ...(sigla.gravado ?? {}), sigla: sigla.sigla, login: sigla.login };
  gravarJson(arquivoMaquina, novo);

  // 5. Ramos locais que faltam (sem trocar de ramo e sem empurrar).
  const configFinal = configExiste ? { git: { ...PADROES.git, ...(lerJson(path.join(raiz, '.harness', 'config.json'), {}).git ?? {}) } } : cfg;
  const nomesRamos = [configFinal.git.base, ...configFinal.git.protegidos];
  const origem = configFinal.git.protegidos.find(r => existeRamo(raiz, r, { env: amb.env })) ?? ramoAtual(raiz, amb.env) ?? 'HEAD';
  const ramosCriados = [];
  for (const ramo of nomesRamos) {
    if (existeRamo(raiz, ramo, { env: amb.env })) continue;
    const r = !ramo.startsWith('-') && git(['branch', ramo, origem], { cwd: raiz, env: amb.env });
    if (r && r.codigo === 0) ramosCriados.push(ramo);
    else amb.avisar(`Não criei o ramo ${ramo.slice(0, 60)}: ${(r ? r.erro.trim() : 'nome inválido') || 'o git recusou'}\n`);
  }

  // Relatório.
  const dosArquivos = criados.filter(r => !r.startsWith(PREFIXO_NUCLEO));
  const doNucleo = criados.filter(r => r.startsWith(PREFIXO_NUCLEO)).length;
  const linhas = [];
  if (doNucleo) linhas.push(`  ${PREFIXO_NUCLEO} (${doNucleo} arquivos)`);
  linhas.push(...dosArquivos.map(r => `  ${r}`), ...ramosCriados.map(r => `  ramo ${r} (local)`));
  if (linhas.length) amb.escrever(`Criei:\n${linhas.join('\n')}\n`);
  if (sobrescritos.length) amb.escrever(`Sobrescrevi:\n${sobrescritos.map(r => `  ${r}`).join('\n')}\n`);
  if (mesclados.length) amb.escrever(`Acrescentei os ganchos do harness em:\n${mesclados.map(r => `  ${r}`).join('\n')}\n`);
  if (mantidos.length) amb.escrever(`Mantive como estavam:\n${mantidos.map(r => `  ${r}`).join('\n')}\n`);
  if (ignorados.length) amb.escrever(`Não copiei links simbólicos do núcleo:\n${ignorados.map(r => `  ${r}`).join('\n')}\n`);
  if (sigla.proposta) amb.escrever(`Sigla proposta: ${sigla.sigla}. Para trocar: ah init --sigla <outra>\n`);
  if (conflitos.length) {
    amb.avisar(`Não sobrescrevi:\n${conflitos.map(r => `  ${r}`).join('\n')}\nFaça: confira a diferença e rode ah init --sobrescrever se quiser trocar esses arquivos\n`);
    return 1;
  }
  amb.escrever('Agora rode: tools/ah doctor\n');
  return 0;
}
