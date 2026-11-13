// Fila de trabalho pesado (desenho, seções 7 e 11): da máquina, não do projeto. Vagas e memória mínima
// ficam no config.json da pasta da fila; as classes (quais comandos são pesados e quantas vagas pedem)
// vêm da configuração do projeto. O estado (fila.json) tem versão de formato.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ErroDeUso, baseDeEstado } from './caminhos.mjs';
import { comTrava, comTravaSinc, gravarJson } from './estado.mjs';
import { comandosSimples, ErroDeShell } from './shell.mjs';
import { inicioDoProcesso, processoExiste } from './vida.mjs';
import { grupoExiste, sinalNoGrupo } from './arvore.mjs';

export const VERSAO_DA_FILA = 1;
export const VERSAO_DA_CONFIG_DA_FILA = 1;
export const PADROES_DA_MAQUINA = Object.freeze({ versao: VERSAO_DA_CONFIG_DA_FILA, vagas: 2, memoriaLivreMinimaMb: 4096 });
const MAX_VAGAS = 64;
const MAX_MEMORIA_MB = 1048576;
// Nome da classe quando o projeto não tem nenhuma: tudo o que passa pela fila pede todas as vagas.
export const CLASSE_IMPLICITA = 'exclusivo';

const eObjeto = v => v !== null && typeof v === 'object' && !Array.isArray(v);

// ---------------------------------------------------------------- onde

// `AH_FILA` (testes, ou para separar filas de propósito); senão `<base do estado>/_fila`, a mesma base para
// todos os projetos da máquina (`_` não é começo de nome de projeto, então não colide).
export function dirDaFila(env = process.env, plataforma = process.platform, casa = os.homedir()) {
  if (env.AH_FILA) return env.AH_FILA;
  return path.join(baseDeEstado(env, plataforma, casa), '_fila');
}

const arquivoDaConfig = dir => path.join(dir, 'config.json');
export const arquivoDoEstado = dir => path.join(dir, 'fila.json');

// ---------------------------------------------------------------- configuração da máquina

export function errosDaConfigDaMaquina(obj) {
  if (!eObjeto(obj)) return ['deve ser um objeto JSON'];
  const erros = [];
  for (const k of Object.keys(obj)) if (!(k in PADROES_DA_MAQUINA)) erros.push(`${k}: campo desconhecido`);
  if (obj.versao !== VERSAO_DA_CONFIG_DA_FILA) erros.push(`versao: deve ser ${VERSAO_DA_CONFIG_DA_FILA}`);
  if (!(Number.isInteger(obj.vagas) && obj.vagas >= 1 && obj.vagas <= MAX_VAGAS)) erros.push(`vagas: deve ser um inteiro de 1 a ${MAX_VAGAS}`);
  if (!(Number.isInteger(obj.memoriaLivreMinimaMb) && obj.memoriaLivreMinimaMb >= 0 && obj.memoriaLivreMinimaMb <= MAX_MEMORIA_MB)) {
    erros.push(`memoriaLivreMinimaMb: deve ser um inteiro de 0 a ${MAX_MEMORIA_MB}`);
  }
  return erros;
}

// Lê o config.json da fila; na primeira chamada (arquivo ausente) cria com os padrões.
// Ilegível, inválido ou de versão mais nova: ErroDeUso com a saída.
export function lerConfigDaMaquina(dir, { criar = true } = {}) {
  const arquivo = arquivoDaConfig(dir);
  let texto;
  try {
    texto = fs.readFileSync(arquivo, 'utf8');
  } catch (e) {
    if (e.code !== 'ENOENT') throw new ErroDeUso(`Não consegui ler a configuração da fila (${arquivo}): ${e.code ?? e.message}\nPróximo passo: confira as permissões de ${dir}`);
    if (!criar) return { ...PADROES_DA_MAQUINA };
    gravarJson(arquivo, { ...PADROES_DA_MAQUINA });
    return { ...PADROES_DA_MAQUINA };
  }
  let obj;
  try { obj = JSON.parse(texto); } catch {
    throw new ErroDeUso(`A configuração da fila não é JSON válido: ${arquivo}\nPróximo passo: corrija o arquivo (ou apague-o para voltar aos padrões)`);
  }
  if (eObjeto(obj) && Number.isInteger(obj.versao) && obj.versao > VERSAO_DA_CONFIG_DA_FILA) {
    throw new ErroDeUso(`A configuração da fila tem versão ${obj.versao}, mais nova que a deste harness (${VERSAO_DA_CONFIG_DA_FILA}): ${arquivo}\nPróximo passo: atualize o harness deste projeto e tente de novo`);
  }
  const erros = errosDaConfigDaMaquina(obj);
  if (erros.length) throw new ErroDeUso(`Configuração da fila inválida (${arquivo}): ${erros.join('; ')}\nPróximo passo: corrija o arquivo (ou apague-o para voltar aos padrões)`);
  return obj;
}

// Memória livre em MB: `AH_FILA_MEMORIA_LIVRE_MB` (testes) ou `os.freemem()`.
export function memoriaLivreMb(env = process.env) {
  const t = env.AH_FILA_MEMORIA_LIVRE_MB;
  if (typeof t === 'string' && /^\d+$/.test(t)) return Number(t);
  return Math.floor(os.freemem() / 1048576);
}

// ---------------------------------------------------------------- classes

const nomeDoPrograma = a => String(a ?? '').split(/[\\/]/).pop().replace(/\.exe$/i, '');

function regexDaPalavra(p) {
  const corpo = p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${corpo}$`, 's');
}

// O padrão (palavras separadas por espaço) casa com as primeiras palavras do comando, uma a uma; a primeira
// compara o nome do programa sem pasta nem `.exe`.
export function casaPadrao(padrao, argv) {
  const palavras = String(padrao).trim().split(/\s+/);
  if (!palavras[0] || argv.length < palavras.length) return false;
  return palavras.every((p, i) => regexDaPalavra(p).test(i === 0 ? nomeDoPrograma(argv[0]) : argv[i]));
}

// Peso para comparar classes: "todas" é a mais restritiva.
const peso = vagas => (vagas === 'todas' ? Infinity : vagas);

// A classe (nome) que casa com um comando simples, ou null. Várias casam: a mais restritiva; empate, a primeira.
export function classeQueCasa(argv, classes = {}) {
  let melhor = null;
  for (const [nome, c] of Object.entries(classes)) {
    if (!(c?.padroes ?? []).some(p => casaPadrao(p, argv))) continue;
    if (melhor === null || peso(c.vagas) > peso(classes[melhor].vagas)) melhor = nome;
  }
  return melhor;
}

export function classeMaisRestritiva(classes = {}) {
  let melhor = null;
  for (const [nome, c] of Object.entries(classes)) if (melhor === null || peso(c.vagas) > peso(classes[melhor].vagas)) melhor = nome;
  return melhor;
}

// Texto de shell que repete um argv (para o interpretador desembrulhar `env`, `bash -c` etc.).
const citar = a => (/^[A-Za-z0-9_@%+=:,./-]+$/.test(a) ? a : `'${String(a).replaceAll("'", "'\\''")}'`);
export const textoDoArgv = argv => argv.map(citar).join(' ');

// Classe de um comando da fila (texto de shell, ou argv): {nome, vagas, reconhecido}. Vale a mais restritiva
// entre os comandos simples que casam; nenhum casa (ou o texto não se lê): a mais restritiva configurada;
// sem classes: CLASSE_IMPLICITA, com todas as vagas.
export function classeDoComando(comando, classes = {}) {
  if (!classes || Object.keys(classes).length === 0) return { nome: CLASSE_IMPLICITA, vagas: 'todas', reconhecido: false };
  const texto = Array.isArray(comando) ? textoDoArgv(comando) : String(comando);
  let simples = [];
  try { simples = comandosSimples(texto, null); } catch (e) { if (!(e instanceof ErroDeShell)) throw e; }
  let melhor = null;
  for (const c of simples) {
    if (!c.argv.length) continue;
    const nome = classeQueCasa(c.argv, classes);
    if (nome && (melhor === null || peso(classes[nome].vagas) > peso(classes[melhor].vagas))) melhor = nome;
  }
  if (melhor) return { nome: melhor, vagas: classes[melhor].vagas, reconhecido: true };
  const nome = classeMaisRestritiva(classes);
  return { nome, vagas: classes[nome].vagas, reconhecido: false };
}

// Vagas que uma entrada ocupa com o total da máquina: "todas" e o que passa do total viram o total.
export const vagasEfetivas = (vagas, total) => (vagas === 'todas' ? total : Math.min(vagas, total));

// ---------------------------------------------------------------- estado

const estadoVazio = () => ({ versao: VERSAO_DA_FILA, proximaSenha: 1, entradas: [] });

export function lerEstadoDaFila(dir) {
  const arquivo = arquivoDoEstado(dir);
  let texto;
  try {
    texto = fs.readFileSync(arquivo, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return estadoVazio();
    throw new ErroDeUso(`Não consegui ler o estado da fila (${arquivo}): ${e.code ?? e.message}\nPróximo passo: confira as permissões de ${dir}`);
  }
  let obj;
  try { obj = JSON.parse(texto); } catch { obj = null; }
  if (eObjeto(obj) && obj.versao !== VERSAO_DA_FILA && Number.isInteger(obj.versao)) {
    throw new ErroDeUso(`O estado da fila tem formato ${obj.versao}, que este harness não conhece (conhece o ${VERSAO_DA_FILA}): ${arquivo}\nPróximo passo: atualize o harness deste projeto (outro projeto da máquina gravou a fila com um harness mais novo)`);
  }
  if (!eObjeto(obj) || !Number.isInteger(obj.proximaSenha) || !Array.isArray(obj.entradas)) {
    throw new ErroDeUso(`O estado da fila não se lê: ${arquivo}\nPróximo passo: confira que nenhum ah pesado está rodando (ah board) e apague ${arquivo}`);
  }
  return obj;
}

// O `ah pesado` da entrada morreu (pid que não existe, ou reaproveitado: hora de início diferente)?
export function ahMorto(e, { existe = processoExiste, inicio = inicioDoProcesso } = {}) {
  if (!existe(e.pid)) return true;
  if (e.inicio == null) return false;
  const atual = inicio(e.pid);
  return atual != null && atual !== e.inicio;
}

const grupoVivo = (e, opcoes = {}) => e.grupo != null && (opcoes.grupoExiste ?? grupoExiste)(e.grupo);

// Morta: o `ah` morreu e o grupo do comando (quando gravado) também. `ah` morto com o grupo de pé é órfã.
export const entradaMorta = (e, opcoes = {}) => ahMorto(e, opcoes) && !grupoVivo(e, opcoes);
export const entradaOrfa = (e, opcoes = {}) => ahMorto(e, opcoes) && grupoVivo(e, opcoes);

// Quanto o SIGTERM tem antes do SIGKILL no grupo órfão.
export const GRACA_DO_ORFAO_MS = 3000;

// Tira as mortas. Órfã (o `ah` morreu, por exemplo com SIGKILL, e o comando segue) continua ocupando a vaga:
// o grupo recebe SIGTERM na primeira passagem (`terminadoEm`) e SIGKILL depois da graça; a entrada sai quando
// o grupo acabar. `alterou` diz que alguma órfã foi marcada (precisa gravar).
export function separarMortas(estado, opcoes = {}) {
  const sinal = opcoes.sinalNoGrupo ?? sinalNoGrupo;
  const agora = opcoes.agora ?? Date.now();
  const vivas = [];
  const mortas = [];
  const orfas = [];
  let alterou = false;
  for (const e of estado.entradas) {
    if (!ahMorto(e, opcoes)) { vivas.push(e); continue; }
    if (!grupoVivo(e, opcoes)) { mortas.push(e); continue; }
    orfas.push(e);
    const desde = Date.parse(e.terminadoEm ?? '');
    if (!Number.isFinite(desde)) {
      sinal(e.grupo, 'SIGTERM');
      vivas.push({ ...e, terminadoEm: new Date(agora).toISOString() });
      alterou = true;
    } else {
      if (agora - desde >= GRACA_DO_ORFAO_MS) sinal(e.grupo, 'SIGKILL');
      vivas.push(e);
    }
  }
  return { estado: { ...estado, entradas: vivas }, mortas, orfas, alterou };
}

// Pode a entrada `senha` começar agora? {pode, motivo}. Fila estrita: só o primeiro da espera começa
// (quem pede todas as vagas não é ultrapassado). Ao lado de outro, só com memória livre e de outro worktree.
export function podeComecar(estado, senha, { vagas, memoriaLivreMb: livre, memoriaLivreMinimaMb: minima }) {
  const minha = estado.entradas.find(e => e.senha === senha);
  if (!minha) return { pode: false, motivo: 'a senha não está na fila' };
  if (minha.rodandoDesde) return { pode: true, motivo: 'já está rodando' };
  const rodando = estado.entradas.filter(e => e.rodandoDesde);
  const antes = estado.entradas.filter(e => !e.rodandoDesde && e.senha < senha).sort((a, b) => a.senha - b.senha);
  if (antes.length) return { pode: false, motivo: `à frente na espera: senha ${antes.map(e => e.senha).join(', ')}` };
  const usadas = rodando.reduce((s, e) => s + vagasEfetivas(e.vagas, vagas), 0);
  const pede = vagasEfetivas(minha.vagas, vagas);
  if (usadas + pede > vagas) return { pode: false, motivo: `sem vaga (${usadas} de ${vagas} em uso; esta pede ${pede})` };
  if (rodando.length) {
    const mesmo = rodando.find(e => e.worktree === minha.worktree);
    if (mesmo) return { pode: false, motivo: `a senha ${mesmo.senha} roda no mesmo worktree` };
    if (livre < minima) return { pode: false, motivo: `memória livre ${livre} MB, abaixo do mínimo de ${minima} MB para rodar ao lado de outro` };
  }
  return { pode: true, motivo: 'vez' };
}

// ---------------------------------------------------------------- operações sob a trava

const TRAVA = { esperaMs: 10000, venceMs: 30000 };

// Roda `fn(estado)` sob a trava da fila, descartando antes as senhas mortas; grava se `fn` devolver
// {gravar: true}. Devolve o que `fn` devolveu, mais `mortas`.
export async function naFila(dir, fn, opcoes = {}) {
  fs.mkdirSync(dir, { recursive: true });
  return comTrava(dir, 'fila', () => {
    const lido = lerEstadoDaFila(dir);
    const { estado, mortas, orfas, alterou } = separarMortas(lido, opcoes);
    const r = fn(estado) ?? {};
    if (r.gravar || mortas.length || alterou) gravarJson(arquivoDoEstado(dir), r.estado ?? estado);
    return { ...r, mortas, orfas };
  }, TRAVA);
}

// Entra na fila: {senha}. `entrada` = {pid, inicio, projeto, worktree, comando, classe, vagas}.
export async function entrarNaFila(dir, entrada, opcoes) {
  const r = await naFila(dir, estado => {
    const senha = estado.proximaSenha;
    const novo = { ...estado, proximaSenha: senha + 1, entradas: [...estado.entradas, { ...entrada, senha, chegou: new Date().toISOString(), rodandoDesde: null }] };
    return { gravar: true, estado: novo, senha };
  }, opcoes);
  return r.senha;
}

// Tenta começar: {pode, motivo, mortas}; quando pode, marca `rodandoDesde`.
export async function tentarComecar(dir, senha, maquina, opcoes) {
  return naFila(dir, estado => {
    const r = podeComecar(estado, senha, maquina);
    if (!r.pode || r.motivo === 'já está rodando') return r;
    const entradas = estado.entradas.map(e => (e.senha === senha ? { ...e, rodandoDesde: new Date().toISOString() } : e));
    return { ...r, gravar: true, estado: { ...estado, entradas } };
  }, opcoes);
}

// Grava o grupo de processos do comando na entrada (para matar um órfão se o `ah` morrer).
export async function marcarGrupo(dir, senha, grupo, opcoes) {
  return naFila(dir, estado => ({ gravar: true, estado: { ...estado, entradas: estado.entradas.map(e => (e.senha === senha ? { ...e, grupo } : e)) } }), opcoes);
}

// O marcador de aninhamento (`AH_PESADO_ANINHADO=<senha>`) só vale conferido: a senha está na fila, rodando,
// e o `ah` dela está vivo. Sem trava (só leitura); fila ilegível ou de versão desconhecida: não confere.
export function aninhamentoConferido(dir, valor, opcoes = {}) {
  if (typeof valor !== 'string' || !/^[1-9]\d{0,15}$/.test(valor)) return false;
  let estado;
  try { estado = lerEstadoDaFila(dir); } catch { return false; }
  const e = estado.entradas.find(x => x.senha === Number(valor));
  return Boolean(e && e.rodandoDesde && !ahMorto(e, opcoes));
}

export async function sairDaFila(dir, senha, opcoes) {
  return naFila(dir, estado => ({ gravar: true, estado: { ...estado, entradas: estado.entradas.filter(e => e.senha !== senha) } }), opcoes);
}

// Saída síncrona (no `exit` do processo), esperando a trava por pouco tempo; se não der, a senha
// fica e é descartada como morta na próxima passagem.
export function sairDaFilaSinc(dir, senha) {
  try {
    comTravaSinc(dir, 'fila', () => {
      const estado = lerEstadoDaFila(dir);
      gravarJson(arquivoDoEstado(dir), { ...estado, entradas: estado.entradas.filter(e => e.senha !== senha) });
    }, { esperaMs: 2000, venceMs: TRAVA.venceMs });
  } catch { /* a senha morta sai na próxima passagem */ }
}

// ---------------------------------------------------------------- retrato (board e doctor)

// Como a fila está, sem trava e sem gravar: {vagas, memoriaLivreMinimaMb, entradas, erro}. Cada entrada traz
// `estado` ('rodando' | 'esperando'), `desde` (começo ou chegada), `haMs` e `morta`. Erro de leitura
// (versão desconhecida, arquivo ilegível) vai em `erro` (a saída inteira), sem lançar.
export function retratoDaFila(dir, { agora = Date.now(), existe, inicio } = {}) {
  const r = { dir, vagas: null, memoriaLivreMinimaMb: null, entradas: [], erro: null };
  try {
    const m = lerConfigDaMaquina(dir, { criar: false });
    r.vagas = m.vagas;
    r.memoriaLivreMinimaMb = m.memoriaLivreMinimaMb;
    const estado = lerEstadoDaFila(dir);
    const opcoes = {};
    if (existe) opcoes.existe = existe;
    if (inicio) opcoes.inicio = inicio;
    r.entradas = [...estado.entradas].sort((a, b) => a.senha - b.senha).map(e => {
      const desde = e.rodandoDesde ?? e.chegou ?? null;
      const ms = Date.parse(desde);
      return { ...e, estado: e.rodandoDesde ? 'rodando' : 'esperando', desde, haMs: Number.isFinite(ms) ? Math.max(0, agora - ms) : null, morta: entradaMorta(e, opcoes), orfa: entradaOrfa(e, opcoes) };
    });
  } catch (e) {
    if (!(e instanceof ErroDeUso)) throw e;
    r.erro = e.saida;
  }
  return r;
}

export function duracaoCurta(ms) {
  if (ms == null) return '?';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  return `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`;
}
