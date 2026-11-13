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

// A entrada é de um processo morto (pid que não existe, ou reaproveitado: hora de início diferente)?
export function entradaMorta(e, { existe = processoExiste, inicio = inicioDoProcesso } = {}) {
  if (!existe(e.pid)) return true;
  if (e.inicio == null) return false;
  const atual = inicio(e.pid);
  return atual != null && atual !== e.inicio;
}

export function separarMortas(estado, opcoes) {
  const vivas = [];
  const mortas = [];
  for (const e of estado.entradas) (entradaMorta(e, opcoes) ? mortas : vivas).push(e);
  return { estado: { ...estado, entradas: vivas }, mortas };
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
    const { estado, mortas } = separarMortas(lido, opcoes);
    const r = fn(estado) ?? {};
    if (r.gravar || mortas.length) gravarJson(arquivoDoEstado(dir), r.estado ?? estado);
    return { ...r, mortas };
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
