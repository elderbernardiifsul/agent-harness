import fs from 'node:fs';
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

function travaVencida(pasta, venceMs) {
  let em = null;
  try {
    em = Date.parse(JSON.parse(fs.readFileSync(path.join(pasta, 'dono.json'), 'utf8')).em);
  } catch { /* sem dono legível: vale a data da pasta */ }
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

// `venceMs` precisa ser maior que o pior caso de `fn`: passado esse prazo outra chamada pode tomar a trava
// (a liberação só apaga a trava se ainda for desta chamada, mas a exclusão já terá sido perdida).
// Uma tentativa de pegar a trava: true se pegou; false se outro a tem e ela não venceu.
function tentarPegar(pasta, venceMs, marca) {
  for (;;) {
    try {
      fs.mkdirSync(pasta);
      return true;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
    if (!travaVencida(pasta, venceMs)) return false;
    // Só um rename vence; quem perde (ENOENT) tenta de novo.
    const tomada = `${pasta}.vencida.${process.pid}.${Date.now()}.${marca.slice(0, 8)}`;
    try {
      fs.renameSync(pasta, tomada);
    } catch (e) {
      if (e.code === 'ENOENT') continue;
      throw e;
    }
    if (travaVencida(tomada, venceMs)) {
      fs.rmSync(tomada, { recursive: true, force: true });
    } else {
      // Era uma trava recém-tomada por outro: devolve ao lugar.
      try { fs.renameSync(tomada, pasta); } catch { fs.rmSync(tomada, { recursive: true, force: true }); }
    }
  }
}

function prepararTrava(dir, nome) {
  validarNomeSeguro(nome, 'Nome da trava');
  const pasta = path.join(dir, 'travas', nome);
  fs.mkdirSync(path.dirname(pasta), { recursive: true });
  return { pasta, marca: randomUUID() };
}

const travaPresa = (nome, pasta, esperaMs, venceMs) => new ErroDeEstado(`Esperei ${esperaMs} ms pela trava "${nome}" e ela não foi solta`, pasta,
  `se outro ah está rodando, espere ele terminar e repita; uma trava esquecida vence sozinha em até ${Math.ceil(venceMs / 1000)} s (a trava é a pasta ${pasta})`);

const marcarDono = (pasta, marca) => fs.writeFileSync(path.join(pasta, 'dono.json'), JSON.stringify({ pid: process.pid, em: new Date().toISOString(), marca }));

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
  while (!tentarPegar(pasta, venceMs, marca)) {
    if (Date.now() >= limite) throw travaPresa(nome, pasta, esperaMs, venceMs);
    await dormir(20);
  }
  try {
    marcarDono(pasta, marca);
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
  while (!tentarPegar(pasta, venceMs, marca)) {
    if (Date.now() >= limite) throw travaPresa(nome, pasta, esperaMs, venceMs);
    dormirSinc(20);
  }
  try {
    marcarDono(pasta, marca);
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
