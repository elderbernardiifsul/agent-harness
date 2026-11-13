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

// Vencida: o dono, desta máquina, morreu (vence na hora), ou passou de `venceMs` desde o `em` do dono (ou da
// data da pasta). Dono sem identidade (gravado antes dela) ou de outra máquina: só o prazo.
function lerDono(pasta) {
  try { return JSON.parse(fs.readFileSync(path.join(pasta, 'dono.json'), 'utf8')); } catch { return null; }
}

function travaVencida(pasta, venceMs, dono = lerDono(pasta)) {
  let em = null;
  if (dono) {
    if (eDestaMaquina(dono) && donoMorto(dono.pid)) return true;
    em = Date.parse(dono.em);
  } // sem dono legível: vale a data da pasta
  if (!Number.isFinite(em)) {
    try { em = fs.statSync(pasta).mtimeMs; } catch { return false; }
  }
  return Date.now() - em > venceMs;
}

const NOME_SEGURO = /^[A-Za-z0-9._-]+$/;

// Recusa nomes que escapariam da pasta (`../x`, `a/b`, `.`, `..`).
export function validarNomeSeguro(nome, rotulo) {
  if (typeof nome !== 'string' || !NOME_SEGURO.test(nome) || nome === '.' || nome === '..') {
    throw new ErroDeEstado(`${rotulo} inválido: ${JSON.stringify(nome)} (use só letras, números, ponto, hífen e sublinhado)`);
  }
  return nome;
}

// Ponto de troca para os testes: chamado entre a leitura da trava vencida e o rename, onde outro processo
// pode trocá-la. Fora dos testes, fica null.
export const ganchosDeTeste = { antesDeTomar: null };

// Uma tentativa de pegar a trava: true se pegou; false se outro a tem e ela não venceu.
function tentarPegar(pasta, venceMs, marca) {
  for (;;) {
    try {
      fs.mkdirSync(pasta);
      return true;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
    const vista = lerDono(pasta);
    if (!travaVencida(pasta, venceMs, vista)) return false;
    ganchosDeTeste.antesDeTomar?.(pasta);
    // Só um rename vence; quem perde (ENOENT) tenta de novo.
    const tomada = `${pasta}.vencida.${process.pid}.${Date.now()}.${marca.slice(0, 8)}`;
    try {
      fs.renameSync(pasta, tomada);
    } catch (e) {
      if (e.code === 'ENOENT') continue;
      throw e;
    }
    // O rename pegou o que estava no lugar, que pode não ser a trava vista: só apaga se a marca for a mesma
    // (e ainda vencida). Senão, era a trava de outro processo, e ela volta para ser julgada de novo.
    const tomadaDono = lerDono(tomada);
    if (tomadaDono?.marca === vista?.marca && travaVencida(tomada, venceMs, tomadaDono)) {
      fs.rmSync(tomada, { recursive: true, force: true });
    } else {
      // Devolve ao lugar. Se o lugar já tem outra trava, a devolvida não é apagada (é de alguém); fica com o
      // nome `.vencida.*` e vira lixo inofensivo.
      try { fs.renameSync(tomada, pasta); } catch { /* o lugar já tem dono: não apaga a trava alheia */ }
    }
  }
}

function prepararTrava(dir, nome) {
  validarNomeSeguro(nome, 'Nome da trava');
  const pasta = path.join(dir, 'travas', nome);
  fs.mkdirSync(path.dirname(pasta), { recursive: true });
  return { pasta, marca: randomUUID() };
}

const travaPresa = (nome, pasta, esperaMs, venceMs) => Object.assign(new ErroDeEstado(`Esperei ${esperaMs} ms pela trava "${nome}" e ela não foi solta`, pasta,
  `se outro ah está rodando, espere ele terminar e repita; uma trava esquecida vence sozinha em até ${Math.ceil(venceMs / 1000)} s (a trava é a pasta ${pasta})`), { travaPresa: true });

const marcarDono = (pasta, marca) => fs.writeFileSync(path.join(pasta, 'dono.json'), JSON.stringify({ pid: process.pid, em: new Date().toISOString(), marca, ...identidadeDaMaquina() }));

// Depois de pegar a trava e gravar o dono, ela ainda é desta chamada? (Outro pode tê-la tomado como vencida
// no meio.) Marca o dono e confere numa leitura; false: volte a esperar, sem soltar nada.
function confirmarDono(pasta, marca) {
  try {
    marcarDono(pasta, marca);
    return JSON.parse(fs.readFileSync(path.join(pasta, 'dono.json'), 'utf8'))?.marca === marca;
  } catch {
    return false;
  }
}

function soltar(pasta, marca) {
  let dono = null;
  try { dono = JSON.parse(fs.readFileSync(path.join(pasta, 'dono.json'), 'utf8')); } catch { /* sem dono legível */ }
  if (dono?.marca === marca) fs.rmSync(pasta, { recursive: true, force: true });
}

// `venceMs` precisa ser maior que o pior caso de `fn`: passado esse prazo outra chamada pode tomar a trava
// (a liberação só apaga a trava se ainda for desta chamada, mas a exclusão já terá sido perdida).
export async function comTrava(dir, nome, fn, { esperaMs = 5000, venceMs = 30000 } = {}) {
  const { pasta, marca } = prepararTrava(dir, nome);
  const limite = Date.now() + esperaMs;
  while (!(tentarPegar(pasta, venceMs, marca) && confirmarDono(pasta, marca))) {
    if (Date.now() >= limite) throw travaPresa(nome, pasta, esperaMs, venceMs);
    await dormir(20);
  }
  try {
    return await fn();
  } finally {
    soltar(pasta, marca);
  }
}

const PAUSA = new Int32Array(new SharedArrayBuffer(4));
const dormirSinc = ms => Atomics.wait(PAUSA, 0, 0, ms);

// Versão síncrona do comTrava, com a mesma pasta e o mesmo dono.json (as duas se excluem entre si).
// Para trechos curtos que só mexem em arquivo, chamados de código síncrono.
export function comTravaSinc(dir, nome, fn, { esperaMs = 5000, venceMs = 30000 } = {}) {
  const { pasta, marca } = prepararTrava(dir, nome);
  const limite = Date.now() + esperaMs;
  while (!(tentarPegar(pasta, venceMs, marca) && confirmarDono(pasta, marca))) {
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
