import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ErroDeUso, arquivoDaMaquina } from '../lib/caminhos.mjs';
import { PADROES, validarConfig } from '../lib/config.mjs';
import { gravarJson, lerJson } from '../lib/estado.mjs';
import { siglaValida, siglaDeLogin } from '../lib/frente.mjs';
import { git, existeRamo, ramoAtual } from '../lib/git.mjs';
import { consultarProtecao, loginAtual, protegerRamo, repoAtual } from '../lib/github.mjs';
import { VERSAO } from '../versao.mjs';

export const descricao = 'instala o harness neste projeto, a partir do clone do agent-harness';
export const uso = 'ah init [--projeto <nome>] [--sigla <sigla>] [--agentes claude-code] [--teste "<comando>"] [--sem-protecao] [--sobrescrever]';
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
const ARQUIVO_CI = '.github/workflows/ah-ci.yml';
const MARCA_DA_CI = '# Gerado pelo agent-harness (ah init)';
const COMANDO_DA_CI_DESLIGADA = 'echo "defina ci.comandoDeTeste em .harness/config.json"';
const ARQUIVO_AGENTS = 'AGENTS.md';
const MARCA_INICIO = '<!-- agent-harness: início';
const MARCA_FIM = '<!-- agent-harness: fim -->';
// Documentos do clone copiados para .harness/nucleo/docs/: o roteiro de adaptação e a referência que ele cita.
const DOCS_COPIADOS = ['agentes', 'referencia'];
const semPonto = t => String(t).replace(/[.\s]+$/, '');
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
  const o = { sobrescrever: false, 'sem-protecao': false };
  for (let i = 0; i < args.length; i++) {
    let [nome, valor] = args[i].startsWith('--') && args[i].includes('=') ? [args[i].slice(0, args[i].indexOf('=')), args[i].slice(args[i].indexOf('=') + 1)] : [args[i], undefined];
    if (nome === '--sobrescrever' && valor === undefined) { o.sobrescrever = true; continue; }
    if (nome === '--sem-protecao' && valor === undefined) { o['sem-protecao'] = true; continue; }
    if (!COM_VALOR.has(nome)) {
      throw new ErroDeUso(`Opção desconhecida: ${args[i].slice(0, 40)}\nPróximo passo: use ${uso}`);
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
  if (typeof cfg.ci.comandoDeTeste === 'string') textoDeYaml(cfg.ci.comandoDeTeste, 'ci.comandoDeTeste');
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

// Texto de um escalar YAML numa linha, sempre entre aspas simples (o `'` dobra). Recusa o que não cabe
// numa linha (quebra de linha e outros caracteres de controle; o tab vale) e as expressões `${{ }}` do Actions.
export function textoDeYaml(texto, campo) {
  if (/[\u0000-\u0008\u000a-\u001f\u007f\u0085\u2028\u2029]/.test(texto)) {
    throw new ErroDeUso(`Valor inválido para ${campo}: não pode ter quebra de linha nem caractere de controle\nPróximo passo: escreva o comando numa linha só (use um script do projeto se precisar de vários passos)`);
  }
  if (texto.includes('${{')) {
    throw new ErroDeUso(`Valor inválido para ${campo}: expressões do Actions (\${{ }}) não entram pelo comando de teste\nPróximo passo: edite o arquivo da CI (${ARQUIVO_CI}) à mão`);
  }
  return `'${texto.replaceAll("'", "''")}'`;
}

// Texto do workflow a partir do modelo; sem comando, o trabalho nasce desligado.
// Substituição por função: o texto do usuário nunca é lido como padrão ($$, $&, $').
function textoDaCi(modelo, base, comando) {
  const ligado = typeof comando === 'string' && comando.length > 0;
  const base_ = textoDeYaml(base, 'git.base');
  const cmd = textoDeYaml(ligado ? comando : COMANDO_DA_CI_DESLIGADA, 'ci.comandoDeTeste');
  return modelo
    .replaceAll('{{BASE}}', () => base_)
    .replaceAll('{{DESLIGADO}}', () => (ligado ? '' : '    if: false\n'))
    .replaceAll('{{COMANDO}}', () => cmd);
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

const ocorrencias = (texto, marca) => texto.split(marca).length - 1;

// AGENTS.md com o trecho do harness: {texto, aviso}. Só troca o trecho quando há exatamente um par de
// marcas, com o fim depois do início; sem marcas, acrescenta no fim; marca faltando ou repetida não
// reescreve nada do que existe: acrescenta o trecho novo no fim (uma vez só) e avisa. O fim de linha
// do arquivo (CRLF ou LF) é mantido.
export function agentsComTrecho(atual, trecho) {
  if (atual === null) return { texto: trecho, aviso: null };
  const fimDeLinha = atual.includes('\r\n') ? '\r\n' : '\n';
  const novo = trecho.replace(/\r?\n/g, fimDeLinha);
  const acrescentado = () => `${atual}${atual === '' || atual.endsWith(fimDeLinha) ? '' : fimDeLinha}${atual === '' ? '' : fimDeLinha}${novo}`;
  const ini = ocorrencias(atual, MARCA_INICIO);
  const fim = ocorrencias(atual, MARCA_FIM);
  if (ini === 0 && fim === 0) return { texto: acrescentado(), aviso: null };
  const i = atual.indexOf(MARCA_INICIO);
  const f = atual.indexOf(MARCA_FIM);
  if (ini === 1 && fim === 1 && f > i) {
    let depois = f + MARCA_FIM.length;
    if (atual.startsWith(fimDeLinha, depois)) depois += fimDeLinha.length;
    return { texto: atual.slice(0, i) + novo + atual.slice(depois), aviso: null };
  }
  return {
    texto: atual.endsWith(novo) ? atual : acrescentado(),
    aviso: `${ARQUIVO_AGENTS} tem as marcas do harness incompletas ou repetidas; não mexi no que existe e acrescentei o trecho novo no fim.\nFaça: apague do ${ARQUIVO_AGENTS} o trecho antigo e as marcas soltas, deixe só o trecho do fim e rode ah init de novo\n`,
  };
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

  // Sem nenhum commit não há de onde criar os ramos nem onde commitar o harness: recusa antes de gravar qualquer coisa.
  if (git(['rev-parse', '--verify', '-q', 'HEAD^{commit}'], { cwd: raiz, env: amb.env }).codigo !== 0) {
    throw new ErroDeUso('o repositório ainda não tem commit\nPróximo passo: faça o primeiro commit (git commit --allow-empty -m "começo") e rode ah init de novo');
  }

  const arquivoMaquina = arquivoDaMaquina(amb.env, process.platform, os.homedir());
  const sigla = resolverSigla(o, amb, arquivoMaquina);
  const configExiste = fs.existsSync(path.join(raiz, '.harness', 'config.json'));
  const cfg = montarConfig(fs.readFileSync(path.join(dirModelos, 'config.json'), 'utf8'), o, raiz);

  const configLida = configExiste ? lerJson(path.join(raiz, '.harness', 'config.json'), {}) : null;
  const configFinal = configExiste
    ? { git: { ...PADROES.git, ...(configLida?.git ?? {}) }, github: { ...PADROES.github, ...(configLida?.github ?? {}) }, ci: { ...PADROES.ci, ...(configLida?.ci ?? {}) } }
    : cfg;
  const textoCi = textoDaCi(fs.readFileSync(path.join(dirModelos, 'ci', 'ah-ci.yml'), 'utf8'), configFinal.git.base, configFinal.ci.comandoDeTeste);

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
  const atualizados = [];

  // Grava `conteudo` em `rel` (caminho com "/"), sem sair da raiz do projeto nem seguir links.
  function colocar(rel, conteudo, { modo, nunca = false, mescla = false, atualizaSe = null } = {}) {
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
      if (atualizaSe && atualizaSe(fs.readFileSync(destino, 'utf8'))) { escrever(); atualizados.push(rel); return; }
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

  // Roteiro de adaptação para outros agentes (o AGENTS.md aponta para ele) e a referência que ele cita.
  for (const pasta of DOCS_COPIADOS) {
    const dir = path.join(RAIZ_DO_HARNESS, 'docs', pasta);
    if (!fs.existsSync(dir)) continue;
    for (const rel of listarArquivosDoNucleo(dir).arquivos) {
      colocar(`${PREFIXO_NUCLEO}docs/${pasta}/${rel}`, fs.readFileSync(path.join(dir, ...rel.split('/'))), { atualizaSe: () => true });
    }
  }

  // Trecho do AGENTS.md: o aviso do link simbólico manda copiá-lo daqui.
  colocar(PREFIXO_NUCLEO + 'modelos/agents-trecho.md', fs.readFileSync(path.join(dirModelos, 'agents-trecho.md')), { atualizaSe: () => true });

  // Modelo dos ganchos: o doctor da cópia instalada confere o settings.json contra ele.
  colocar(PREFIXO_NUCLEO + 'modelos/claude-code/ganchos.json', fs.readFileSync(path.join(dirModelos, 'claude-code', 'ganchos.json')), { atualizaSe: () => true });

  // 2. Configuração e extensões: nunca sobrescritas.
  colocar('.harness/config.json', Buffer.from(`${JSON.stringify(cfg, null, 2)}\n`), { nunca: true });
  colocar(ENTRADA_GITKEEP, Buffer.alloc(0), { nunca: true });

  // 3. Entrada do harness e documentos.
  colocar('tools/ah', fs.readFileSync(path.join(dirModelos, 'ah')), { modo: 0o755 });
  colocar('tools/ah.cmd', fs.readFileSync(path.join(dirModelos, 'ah.cmd')));
  for (const doc of ['sessoes-paralelas.md', 'historico-das-frentes.md']) {
    colocar(`docs/agents/${doc}`, fs.readFileSync(path.join(dirModelos, doc)));
  }

  // AGENTS.md: o trecho do harness entre marcas; o resto do arquivo fica.
  // Link simbólico: não é trocado por arquivo nem com --sobrescrever; o init diz o que fazer.
  let agentsSt = null;
  try { agentsSt = fs.lstatSync(path.join(raiz, ARQUIVO_AGENTS)); } catch { /* não existe */ }
  if (agentsSt?.isSymbolicLink()) {
    amb.avisar(`${ARQUIVO_AGENTS} é um link simbólico; não mexi nele.\nFaça: copie para o arquivo de destino do link o trecho de .harness/nucleo/modelos/agents-trecho.md\n`);
  } else {
    const agentsAtual = agentsSt?.isFile() ? fs.readFileSync(path.join(raiz, ARQUIVO_AGENTS), 'utf8') : null;
    const agents = agentsComTrecho(agentsAtual, fs.readFileSync(path.join(dirModelos, 'agents-trecho.md'), 'utf8'));
    if (agents.aviso) amb.avisar(agents.aviso);
    colocar(ARQUIVO_AGENTS, Buffer.from(agents.texto), { mescla: true });
  }

  // Ganchos do Claude Code: o conteúdo já é a mescla do arquivo atual, então pode trocá-lo.
  if (settingsClaude !== null) colocar(ARQUIVO_CLAUDE, Buffer.from(settingsClaude), { mescla: true });

  // CI modelo: o init reescreve o arquivo enquanto ele tiver a marca do harness (o comando pode ter mudado na configuração).
  colocar(ARQUIVO_CI, Buffer.from(textoCi), { atualizaSe: atual => atual.includes(MARCA_DA_CI) });

  // 4. Sigla na máquina.
  const novo = { ...(sigla.gravado ?? {}), sigla: sigla.sigla, login: sigla.login };
  gravarJson(arquivoMaquina, novo);

  // 5. Ramos locais que faltam (sem trocar de ramo e sem empurrar).
  const nomesRamos = [configFinal.git.base, ...configFinal.git.protegidos];
  const origem = configFinal.git.protegidos.find(r => existeRamo(raiz, r, { env: amb.env })) ?? ramoAtual(raiz, amb.env) ?? 'HEAD';
  const ramosCriados = [];
  for (const ramo of nomesRamos) {
    if (existeRamo(raiz, ramo, { env: amb.env })) continue;
    const r = !ramo.startsWith('-') && git(['branch', ramo, origem], { cwd: raiz, env: amb.env });
    if (r && r.codigo === 0) ramosCriados.push(ramo);
    else amb.avisar(`Não criei o ramo ${ramo.slice(0, 60)}: ${(r ? r.erro.trim() : 'nome inválido') || 'o git recusou'}\n`);
  }

  // 6. Proteção dos ramos no servidor: falha nunca derruba o init.
  const protegidos = [];
  if (!o['sem-protecao']) {
    const remoto = configFinal.git.remoto;
    const opcoes = { cwd: raiz, env: amb.env };
    if (git(['remote', 'get-url', remoto], opcoes).codigo !== 0) {
      amb.avisar(`Sem o remoto ${remoto.slice(0, 40)}: não protegi os ramos no servidor. Só a trava local protege.\nFaça: adicione o remoto, dê o primeiro push e rode ah init de novo\n`);
    } else {
      const repo = configFinal.github?.repo ?? repoAtual(opcoes);
      const envGit = { ...amb.env, GIT_TERMINAL_PROMPT: '0' };
      for (const ramo of configFinal.git.protegidos) {
        const nome = ramo.slice(0, 60);
        const ls = git(['ls-remote', '--exit-code', '--heads', remoto, `refs/heads/${ramo}`], { cwd: raiz, env: envGit });
        if (ls.codigo === 2) { amb.avisar(`${nome} ainda não está no remoto; rode ah init de novo depois do primeiro push\n`); continue; }
        if (ls.codigo !== 0) {
          amb.avisar(`Não consegui consultar o remoto (${(ls.erro.trim().split('\n')[0] || `código ${ls.codigo}`).slice(0, 200)}); proteção não conferida. Rode ah init de novo quando o remoto responder.\n`);
          break;
        }
        // O PUT substitui as regras existentes: só se chama quando o ramo está sem proteção.
        const atual = consultarProtecao(ramo, { ...opcoes, repo });
        if (atual.estado === 'protegido') { amb.escrever(`${nome} já está protegido no servidor; não alterei\n`); continue; }
        if (atual.estado === 'desconhecido') { amb.avisar(`Sem proteção no servidor para ${nome}: ${semPonto(atual.motivo)}. Só a trava local protege.\n`); continue; }
        const r = protegerRamo(ramo, { ...opcoes, repo });
        if (r.ok) protegidos.push(ramo);
        else amb.avisar(`Sem proteção no servidor para ${nome}: ${semPonto(r.motivo)}. Só a trava local protege.\n`);
      }
    }
  }
  if (!(typeof configFinal.ci.comandoDeTeste === 'string' && configFinal.ci.comandoDeTeste)) {
    amb.avisar('CI criada desligada: defina ci.comandoDeTeste em .harness/config.json e rode ah init de novo\n');
  }

  // Relatório.
  const dosArquivos = criados.filter(r => !r.startsWith(PREFIXO_NUCLEO));
  const doNucleo = criados.filter(r => r.startsWith(PREFIXO_NUCLEO)).length;
  const linhas = [];
  if (doNucleo) linhas.push(`  ${PREFIXO_NUCLEO} (${doNucleo} arquivos)`);
  linhas.push(...dosArquivos.map(r => `  ${r}`), ...ramosCriados.map(r => `  ramo ${r} (local)`));
  if (linhas.length) amb.escrever(`Criei:\n${linhas.join('\n')}\n`);
  if (sobrescritos.length) amb.escrever(`Sobrescrevi:\n${sobrescritos.map(r => `  ${r}`).join('\n')}\n`);
  if (atualizados.length) amb.escrever(`Atualizei:\n${atualizados.map(r => `  ${r}`).join('\n')}\n`);
  if (protegidos.length) amb.escrever(`Protegi no servidor: ${protegidos.join(', ')}\n`);
  if (mesclados.length) amb.escrever(`Acrescentei os ganchos do harness em:\n${mesclados.map(r => `  ${r}`).join('\n')}\n`);
  if (mantidos.length) amb.escrever(`Mantive como estavam:\n${mantidos.map(r => `  ${r}`).join('\n')}\n`);
  if (ignorados.length) amb.escrever(`Não copiei links simbólicos do núcleo:\n${ignorados.map(r => `  ${r}`).join('\n')}\n`);
  if (sigla.proposta) amb.escrever(`Sigla proposta: ${sigla.sigla}. Para trocar: ah init --sigla <outra>\n`);
  if (conflitos.length) {
    amb.avisar(`Não sobrescrevi:\n${conflitos.map(r => `  ${r}`).join('\n')}\nFaça: confira a diferença e rode ah init --sobrescrever se quiser trocar esses arquivos\n`);
    return 1;
  }
  amb.escrever(passosDoCommit(raiz, configFinal.git.base, amb.env));
  return 0;
}

// Caminhos que o init grava e que entram no commit do harness.
const CAMINHOS_DO_COMMIT = ['.harness', 'tools/ah', 'tools/ah.cmd', ARQUIVO_AGENTS, 'docs/agents/sessoes-paralelas.md', 'docs/agents/historico-das-frentes.md', ARQUIVO_CLAUDE, ARQUIVO_CI];
const MENSAGEM_DO_COMMIT = 'chore: instala o agent-harness';

// As frentes partem do ramo base: o commit do harness tem de ir para lá, senão o worktree
// nasce sem tools/ah e o gancho não existe. Diz os comandos exatos.
function passosDoCommit(raiz, base, env) {
  const caminhos = CAMINHOS_DO_COMMIT.filter(c => fs.existsSync(path.join(raiz, ...c.split('/'))));
  const pendentes = git(['status', '--porcelain', '--untracked-files=all', '--', ...caminhos], { cwd: raiz, env }).saida.trim() !== '';
  const atual = ramoAtual(raiz, env);
  const naBase = git(['cat-file', '-e', `refs/heads/${base}:tools/ah`], { cwd: raiz, env }).codigo === 0;
  if (!pendentes && naBase) return 'Agora rode: tools/ah doctor\n';
  const passos = [];
  if (atual !== base) passos.push(`git switch ${base}`);
  if (pendentes) {
    passos.push(`git add -- ${caminhos.join(' ')}`, `git commit -m "${MENSAGEM_DO_COMMIT}"`);
  } else if (atual && atual !== base) {
    passos.push(`git merge ${atual}`);
  }
  return `Falta levar o harness para o ramo base ${base} (as frentes partem dele; fora dele não há tools/ah nem gancho):\n${passos.map(l => `  ${l}`).join('\n')}\nDepois rode: tools/ah doctor\n`;
}
