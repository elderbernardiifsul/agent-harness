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

// Teto do prazo de uma trava (o maior em uso: open, close, handoff, takeover e sweep seguram 120 s). Quem julga
// uma pasta sem dono legível não sabe o prazo de quem a criou, e usa este: um dono que sumiu (devolução que não
// achou lugar, morte entre o mkdir e o dono) nunca é julgado por um prazo menor que o dele.
export const PRAZO_MAXIMO_MS = 120000;

// Vencida: o dono, desta máquina, morreu (vence na hora), ou passou o prazo desde o `em` do dono (ou desde
// `mtimeMs`, quando não há `em` legível). O prazo é o `venceMs` gravado pelo dono, que sabe quanto vai segurar
// (cortado no teto); dono legível sem ele (gravado antes), o de quem julga; sem dono legível (pasta vazia ou
// dono.json ilegível), o teto. Dono sem identidade ou de outra máquina: só o prazo.
function vencida(dono, mtimeMs, venceMs) {
  if (dono && eDestaMaquina(dono) && donoMorto(dono.pid)) return true;
  const prazo = !dono ? Math.max(venceMs, PRAZO_MAXIMO_MS)
    : Number.isFinite(dono.venceMs) && dono.venceMs > 0 ? Math.min(dono.venceMs, PRAZO_MAXIMO_MS) : venceMs;
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

// Pontos de troca para os testes, onde outro processo pode mexer na trava; fora dos testes, ficam null.
// antesDeTomar(pasta): entre a leitura da trava vencida e a tomada. depoisDoMkdir(pasta): entre o mkdir e a
// gravação do dono (a parada de quem criou a pasta). devolvendo(pasta, tentativa): antes de cada gravação da
// devolução de um dono.
export const ganchosDeTeste = { antesDeTomar: null, depoisDoMkdir: null, devolvendo: null };

// Quanto a devolução de um dono espera o lugar vagar (o escritor atrasado se recolhe logo depois de gravar), e
// quanto quem recolhe o próprio dono espera o outro devolvê-lo depois de conferir.
const ESPERA_DA_DEVOLUCAO_MS = 100;
const ESPERA_DO_RECOLHER_MS = 1000;

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

// Devolve à trava o dono.json tirado por engano, regravando o texto dele com 'wx' (O_EXCL: não sobrescreve; vale
// onde não há hard link, como FAT, exFAT e alguns FUSE e SMB). Se o lugar já tem dono, ou a pasta sumiu, ou a
// gravação falha, o tirado é descartado: a pasta fica sem dono e vence pelo teto (PRAZO_MAXIMO_MS), que não é
// menor que o prazo do dono descartado; ninguém entra antes.
//
// Com o lugar ocupado (EEXIST), espera um pouco antes de descartar: cada pasta tem um único mkdir vencedor, e o
// dono tirado é o dele; quem ocupa o lugar é um escritor atrasado, que gravou na pasta errada e se recolhe ao
// conferir a pasta (ver confirmarDono).
function devolverDono(fora, pasta) {
  let texto = null;
  try { texto = fs.readFileSync(fora, 'utf8'); } catch { /* sumiu: nada a devolver */ }
  const limite = Date.now() + ESPERA_DA_DEVOLUCAO_MS;
  for (let tentativa = 0, pausa = 1; texto !== null; tentativa++, pausa = Math.min(pausa * 2, 16)) {
    ganchosDeTeste.devolvendo?.(pasta, tentativa);
    try {
      fs.writeFileSync(path.join(pasta, 'dono.json'), texto, { flag: 'wx' });
      break;
    } catch (e) {
      if (e.code !== 'EEXIST' || Date.now() >= limite) break; // pasta sumiu, erro, ou o ocupante não saiu
      dormirSinc(pausa);
    }
  }
  try { fs.rmSync(fora, { force: true }); } catch { /* resto sem dono */ }
}

// Tira da pasta o dono desta chamada: rename para fora e confere o texto tirado (`ehMeu`); se é, apaga-o e, com
// `tirarPasta`, tira a pasta se ficou vazia; se não é, devolve-o. Sem dono.json, outro o tirou para conferir e vai
// devolvê-lo: espera com recuo até `esperaMs`. true se recolheu.
function recolherDono(t, ehMeu, { tirarPasta, esperaMs }) {
  const limite = Date.now() + esperaMs;
  for (let pausa = 1; ; pausa = Math.min(pausa * 2, 50)) {
    const fora = tirarDono(t.pasta, t.marca);
    if (fora) {
      let texto = null;
      try { texto = fs.readFileSync(fora, 'utf8'); } catch { /* ilegível: não se sabe de quem é */ }
      if (texto === null || !ehMeu(texto)) {
        devolverDono(fora, t.pasta);
        return false;
      }
      try { fs.rmSync(fora, { force: true }); } catch { /* resto sem dono */ }
      if (tirarPasta) { try { tirarPastaVazia(t.pasta); } catch { /* fica e vence pelo teto */ } }
      return true;
    }
    if (!fs.existsSync(t.pasta) || Date.now() >= limite) return false;
    dormirSinc(pausa);
  }
}

// A pasta é a mesma que o mkdir desta chamada criou? Sem número de inode (0: no Windows ele pode faltar), não há
// como saber e conta como a mesma, como antes desta conferência.
function mesmaPasta(t) {
  if (!t.ino) return true;
  try {
    const s = fs.statSync(t.pasta, { bigint: true });
    return s.ino === t.ino && s.dev === t.dev;
  } catch {
    return false;
  }
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
function tentarPegar(t) {
  const { pasta, venceMs, marca } = t;
  for (let volta = 0; volta < 8; volta++) {
    try {
      fs.mkdirSync(pasta);
      // A identidade da pasta criada, para o confirmarDono saber se ela continua a mesma.
      try { const s = fs.statSync(pasta, { bigint: true }); t.ino = s.ino; t.dev = s.dev; } catch { t.ino = 0n; }
      ganchosDeTeste.depoisDoMkdir?.(pasta);
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

function prepararTrava(dir, nome, venceMs) {
  validarNomeSeguro(nome, 'Nome da trava');
  if (!(Number.isFinite(venceMs) && venceMs > 0 && venceMs <= PRAZO_MAXIMO_MS)) {
    throw new ErroDeEstado(`Prazo da trava "${nome}" fora do teto: venceMs=${venceMs} (de 1 a ${PRAZO_MAXIMO_MS} ms)`, null, 'corrija quem chamou comTrava');
  }
  const pasta = path.join(dir, 'travas', nome);
  fs.mkdirSync(path.dirname(pasta), { recursive: true });
  return { nome, pasta, marca: randomUUID(), venceMs, ino: 0n, dev: 0n };
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
//
// O wx pode passar numa pasta que não é a do mkdir: depois de uma parada maior que o teto, a pasta vazia desta
// chamada venceu e saiu, outro criou a dele, e o dono dele está fora (conferido) bem na hora. Por isso, depois
// do wx confere-se a identidade da pasta; se mudou, o dono desta chamada é recolhido sem tirar a pasta (é do
// outro, que recebe o dono de volta de quem o conferia).
function confirmarDono(t) {
  const texto = JSON.stringify({ pid: process.pid, em: new Date().toISOString(), marca: t.marca, venceMs: t.venceMs, ...identidadeDaMaquina() });
  try {
    fs.writeFileSync(path.join(t.pasta, 'dono.json'), texto, { flag: 'wx' });
  } catch {
    return false;
  }
  if (mesmaPasta(t)) return true;
  recolherDono(t, lido => lido === texto, { tirarPasta: false, esperaMs: ESPERA_DO_RECOLHER_MS });
  return false;
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
  const t = prepararTrava(dir, nome, venceMs);
  const limite = Date.now() + esperaMs;
  while (!(tentarPegar(t) && confirmarDono(t))) {
    if (Date.now() >= limite) throw travaPresa(nome, t.pasta, esperaMs, venceMs);
    await dormir(20);
  }
  try {
    return await fn();
  } finally {
    soltar(t.pasta, t.marca);
  }
}

// Versão síncrona do comTrava, com a mesma pasta e o mesmo dono.json (as duas se excluem entre si).
// Para trechos curtos que só mexem em arquivo, chamados de código síncrono.
export function comTravaSinc(dir, nome, fn, { esperaMs = 5000, venceMs = 30000 } = {}) {
  const t = prepararTrava(dir, nome, venceMs);
  const limite = Date.now() + esperaMs;
  while (!(tentarPegar(t) && confirmarDono(t))) {
    if (Date.now() >= limite) throw travaPresa(nome, t.pasta, esperaMs, venceMs);
    dormirSinc(20);
  }
  try {
    return fn();
  } finally {
    soltar(t.pasta, t.marca);
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
