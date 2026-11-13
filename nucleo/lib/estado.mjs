import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export class ErroDeEstado extends Error {
  constructor(mensagem, arquivo = null, proximo = 'rode ah doctor') {
    super(mensagem);
    this.name = 'ErroDeEstado';
    this.arquivo = arquivo;
    this.proximo = proximo;
    this.saida = `${mensagem}\nPróximo passo: ${proximo}`;
  }
}

export function lerJson(arquivo, padrao = null) {
  let texto;
  try {
    texto = fs.readFileSync(arquivo, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return padrao;
    throw new ErroDeEstado(`Não consegui ler ${arquivo}: ${e.message}`, arquivo);
  }
  try {
    return JSON.parse(texto);
  } catch {
    throw new ErroDeEstado(`O arquivo de estado não é JSON válido: ${arquivo}`, arquivo);
  }
}

export function gravarJson(arquivo, obj) {
  const pasta = path.dirname(arquivo);
  fs.mkdirSync(pasta, { recursive: true });
  const temp = path.join(pasta, `.${path.basename(arquivo)}.${process.pid}.${Date.now()}.tmp`);
  try {
    fs.writeFileSync(temp, JSON.stringify(obj, null, 2) + '\n');
    fs.renameSync(temp, arquivo);
  } catch (e) {
    fs.rmSync(temp, { force: true });
    throw e;
  }
}

const dormir = ms => new Promise(r => setTimeout(r, ms));
const PAUSA = new Int32Array(new SharedArrayBuffer(4));
const dormirSinc = ms => Atomics.wait(PAUSA, 0, 0, ms);

// Quem é esta máquina para o dono de uma trava: o hostname e, no Linux, o id do boot e o namespace de pid
// (leitura de arquivo, barata; fora do Linux, null). Um pid só se confere na máquina, no boot e no
// namespace em que foi gravado.
let identidade = null;
export function identidadeDaMaquina() {
  if (identidade) return identidade;
  const ler = f => { try { return f(); } catch { return null; } };
  const linux = process.platform === 'linux';
  identidade = Object.freeze({
    maquina: os.hostname(),
    boot: linux ? ler(() => fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim() || null) : null,
    nsPid: linux ? ler(() => fs.readlinkSync('/proc/self/ns/pid')) : null,
  });
  return identidade;
}

const eDestaMaquina = dono => {
  const eu = identidadeDaMaquina();
  return typeof dono?.maquina === 'string' && dono.maquina === eu.maquina && (dono.boot ?? null) === eu.boot && (dono.nsPid ?? null) === eu.nsPid;
};

// O pid do dono não existe mais (EPERM conta como existe). Pid ausente ou inválido: não se sabe (false).
function donoMorto(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return false;
  } catch (e) {
    return e.code === 'ESRCH';
  }
}

// Um arquivo de dono: {dono} quando existe (`dono` é o JSON lido, ou null se ilegível) e null só quando falta
// (ENOENT). Sem permissão de leitura, ou outro erro, conta como ilegível: o arquivo está lá e a pasta não está vazia.
function lerArquivoDono(arquivo) {
  let texto;
  try { texto = fs.readFileSync(arquivo, 'utf8'); } catch (e) { return e.code === 'ENOENT' ? null : { dono: null }; }
  let dono = null;
  try { dono = JSON.parse(texto); } catch { /* ilegível */ }
  return { dono: dono && typeof dono === 'object' ? dono : null };
}
const lerDono = pasta => lerArquivoDono(path.join(pasta, 'dono.json'));

// Vencida: o dono, desta máquina, morreu (vence na hora), ou passou o prazo desde o `em` do dono (ou desde
// `mtimeMs`, quando não há `em` legível). O prazo é o `venceMs` gravado pelo dono, que sabe quanto vai segurar;
// sem ele (dono gravado antes), o de quem julga. Dono sem identidade ou de outra máquina: só o prazo.
function vencida(dono, mtimeMs, venceMs) {
  if (dono && eDestaMaquina(dono) && donoMorto(dono.pid)) return true;
  const prazo = Number.isFinite(dono?.venceMs) && dono.venceMs > 0 ? dono.venceMs : venceMs;
  let em = Date.parse(dono?.em);
  if (!Number.isFinite(em)) em = mtimeMs;
  return Number.isFinite(em) && Date.now() - em > prazo;
}

const mtime = alvo => { try { return fs.statSync(alvo).mtimeMs; } catch { return NaN; } };

const NOME_SEGURO = /^[A-Za-z0-9._-]+$/;

// Recusa nomes que escapariam da pasta (`../x`, `a/b`, `.`, `..`).
export function validarNomeSeguro(nome, rotulo) {
  if (typeof nome !== 'string' || !NOME_SEGURO.test(nome) || nome === '.' || nome === '..') {
    throw new ErroDeEstado(`${rotulo} inválido: ${JSON.stringify(nome)} (use só letras, números, ponto, hífen e sublinhado)`);
  }
  return nome;
}

// Ponto de troca para os testes: chamado entre a leitura da trava vencida e a tomada, onde outro processo
// pode trocá-la. Fora dos testes, fica null.
export const ganchosDeTeste = { antesDeTomar: null };

// Tira o dono.json da trava para um nome único ao lado dela (rename: só um consegue). Devolve o caminho do
// arquivo tirado, ou null se não havia dono.json.
function tirarDono(pasta, marca) {
  const fora = `${pasta}.dono.${process.pid}.${Date.now()}.${marca.slice(0, 8)}`;
  try {
    fs.renameSync(path.join(pasta, 'dono.json'), fora);
    return fora;
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

// Devolve à trava o dono.json tirado por engano. link não sobrescreve: se o lugar já tem dono, ou a pasta
// sumiu, o tirado é descartado (a trava fica sem dono e vence pelo prazo, sem que ninguém entre antes).
function devolverDono(fora, pasta) {
  try { fs.linkSync(fora, path.join(pasta, 'dono.json')); } catch { /* lugar ocupado ou pasta sumiu */ }
  fs.rmSync(fora, { force: true });
}

// O que há na pasta da trava além do dono.json (arquivo comum): lixo que só um humano sabe o que é. Com lixo,
// o rmdir nunca passaria; a trava fica presa e a recusa diz o que há e como limpar.
function lixoNaPasta(pasta) {
  try {
    return fs.readdirSync(pasta, { withFileTypes: true }).filter(e => !(e.name === 'dono.json' && e.isFile())).map(e => e.name).sort();
  } catch {
    return [];
  }
}

// Uma tentativa de pegar a trava: true se pegou; false se outro a tem e ela não venceu, ou se está presa.
//
// A pasta da trava nunca sai do lugar com dono dentro. Para tomar uma vencida, tira-se o dono.json dela (rename,
// atômico) e confere-se o arquivo tirado: se é o dono visto vencido e continua vencido, a pasta fica vazia e
// sai com rmdir, que só remove pasta vazia. Se é outro (a trava foi trocada no meio), ele volta. Enquanto o
// dono está fora, ninguém entra (a pasta existe) e ninguém a julga vencida (o rename renovou a data dela).
// O laço tem voltas contadas: cada volta só recomeça quando a trava mudou (pasta sumiu, dono trocado), e o
// resto devolve false, para valer o esperaMs de quem chama.
function tentarPegar(pasta, venceMs, marca) {
  for (let volta = 0; volta < 8; volta++) {
    try {
      fs.mkdirSync(pasta);
      return true;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
    const vista = lerDono(pasta);
    if (!vencida(vista?.dono, mtime(pasta), venceMs)) return false;
    if (lixoNaPasta(pasta).length) return false;
    ganchosDeTeste.antesDeTomar?.(pasta);
    if (!vista) {
      // Sem dono.json: pasta vazia (alguém morreu entre o mkdir e o dono). rmdir só a tira se ainda estiver
      // vazia; se outro acabou de gravar o dono (ou apareceu lixo), falha e vale a espera.
      if (!tirarPastaVazia(pasta)) return false;
      continue;
    }
    const fora = tirarDono(pasta, marca);
    if (!fora) continue; // outro tirou antes: julga de novo
    const tirado = lerArquivoDono(fora)?.dono ?? null;
    // O tirado é o visto (mesma marca; ausente nos dois conta como a mesma) e continua vencido pela data dele?
    if ((tirado?.marca ?? null) === (vista.dono?.marca ?? null) && vencida(tirado, mtime(fora), venceMs)) {
      fs.rmSync(fora, { force: true });
      if (!tirarPastaVazia(pasta)) return false;
    } else {
      devolverDono(fora, pasta);
    }
  }
  return false;
}

// rmdir da pasta da trava: true se saiu (ou já não existia); false se não está vazia (outro gravou dono, ou há
// lixo): a trava fica, e quem chama volta a esperar.
function tirarPastaVazia(pasta) {
  try {
    fs.rmdirSync(pasta);
    return true;
  } catch (e) {
    if (e.code === 'ENOENT') return true;
    if (e.code === 'ENOTEMPTY' || e.code === 'EEXIST') return false;
    throw e;
  }
}

function prepararTrava(dir, nome) {
  validarNomeSeguro(nome, 'Nome da trava');
  const pasta = path.join(dir, 'travas', nome);
  fs.mkdirSync(path.dirname(pasta), { recursive: true });
  return { pasta, marca: randomUUID() };
}

function travaPresa(nome, pasta, esperaMs, venceMs) {
  const lixo = lixoNaPasta(pasta);
  const proximo = lixo.length
    ? `a pasta da trava tem o que não é dela (${lixo.slice(0, 5).join(', ')}${lixo.length > 5 ? ', …' : ''}) e não vence sozinha; se nenhum ah está rodando, apague a pasta ${pasta} (rm -r) e repita`
    : `se outro ah está rodando, espere ele terminar e repita; uma trava esquecida vence sozinha em até ${Math.ceil(venceMs / 1000)} s (a trava é a pasta ${pasta})`;
  return Object.assign(new ErroDeEstado(`Esperei ${esperaMs} ms pela trava "${nome}" e ela não foi solta`, pasta, proximo), { travaPresa: true });
}

// Depois do mkdir, grava o dono com 'wx' (falha se já existe): uma pasta tem um dono só. Falha também se a pasta
// sumiu (tomada como vencida antes do dono, depois de uma parada maior que o prazo). false: volte a esperar,
// sem soltar nada. O prazo vai junto, para quem julgar o vencimento usar o deste dono.
function confirmarDono(pasta, marca, venceMs) {
  try {
    fs.writeFileSync(path.join(pasta, 'dono.json'), JSON.stringify({ pid: process.pid, em: new Date().toISOString(), marca, venceMs, ...identidadeDaMaquina() }), { flag: 'wx' });
    return true;
  } catch {
    return false;
  }
}

// Solta pelo mesmo caminho da tomada: tira o dono.json e só tira a pasta se o tirado for desta chamada. Sem
// dono.json, outro o tirou para conferir e vai devolvê-lo: tenta de novo por pouco tempo.
function soltar(pasta, marca) {
  for (let i = 0; i < 5; i++) {
    const fora = tirarDono(pasta, marca);
    if (!fora) {
      if (!fs.existsSync(pasta)) return;
      dormirSinc(2);
      continue;
    }
    if (lerArquivoDono(fora)?.dono?.marca !== marca) return devolverDono(fora, pasta);
    fs.rmSync(fora, { force: true });
    try { fs.rmdirSync(pasta); } catch { /* outro gravou dono na pasta vazia: a trava é dele */ }
    return;
  }
}

// `venceMs` precisa ser maior que o pior caso de `fn`: passado esse prazo outra chamada pode tomar a trava
// (a liberação só apaga a trava se ainda for desta chamada, mas a exclusão já terá sido perdida).
export async function comTrava(dir, nome, fn, { esperaMs = 5000, venceMs = 30000 } = {}) {
  const { pasta, marca } = prepararTrava(dir, nome);
  const limite = Date.now() + esperaMs;
  while (!(tentarPegar(pasta, venceMs, marca) && confirmarDono(pasta, marca, venceMs))) {
    if (Date.now() >= limite) throw travaPresa(nome, pasta, esperaMs, venceMs);
    await dormir(20);
  }
  try {
    return await fn();
  } finally {
    soltar(pasta, marca);
  }
}

// Versão síncrona do comTrava, com a mesma pasta e o mesmo dono.json (as duas se excluem entre si).
// Para trechos curtos que só mexem em arquivo, chamados de código síncrono.
export function comTravaSinc(dir, nome, fn, { esperaMs = 5000, venceMs = 30000 } = {}) {
  const { pasta, marca } = prepararTrava(dir, nome);
  const limite = Date.now() + esperaMs;
  while (!(tentarPegar(pasta, venceMs, marca) && confirmarDono(pasta, marca, venceMs))) {
    if (Date.now() >= limite) throw travaPresa(nome, pasta, esperaMs, venceMs);
    dormirSinc(20);
  }
  try {
    return fn();
  } finally {
    soltar(pasta, marca);
  }
}

export function registrarEvento(dirEstado, evento) {
  fs.mkdirSync(dirEstado, { recursive: true });
  const linha = JSON.stringify({ ...evento, em: new Date().toISOString() });
  fs.appendFileSync(path.join(dirEstado, 'eventos.jsonl'), linha + '\n');
}

export function lerEventos(dirEstado) {
  const arquivo = path.join(dirEstado, 'eventos.jsonl');
  let texto;
  try {
    texto = fs.readFileSync(arquivo, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
  return texto.split('\n').filter(l => l.trim()).map((l, i) => {
    try { return JSON.parse(l); } catch { throw new ErroDeEstado(`Linha ${i + 1} de eventos.jsonl não é JSON válido`, arquivo); }
  });
}
