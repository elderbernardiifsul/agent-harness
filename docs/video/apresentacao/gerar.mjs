#!/usr/bin/env node
// Gera o vídeo de apresentação: narração (edge-tts), quadros (chromium headless, pelo protocolo de
// depuração), legenda .srt e o mp4 (ffmpeg). Node 22 ou mais novo, sem dependências.
//
//   node gerar.mjs --tmp <pasta> --saida <pasta> --tts <binário do edge-tts>
//   node gerar.mjs --tmp <pasta> --previa        (só um PNG por passo, sem voz, para conferir a tela)
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CENAS, SECOES } from './roteiro.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const CLONE = path.resolve(AQUI, '../../..');
const FPS = 30;
const LEAD = 0.2;        // silêncio antes de cada fala
const TAIL = 0.5;        // silêncio depois de cada fala (pausa entre falas: LEAD + TAIL)
const FADE = 0.45;       // revelação de um item novo
const VOZ = 'pt-BR-AntonioNeural';
const TAXA = '-4%';
const AMOSTRAS = 48000;

const args = process.argv.slice(2);
const opc = nome => { const i = args.indexOf(nome); return i >= 0 ? args[i + 1] : null; };
const TMP = path.resolve(opc('--tmp') ?? fail('falta --tmp <pasta>'));
const PREVIA = args.includes('--previa');
const SAIDA = PREVIA ? null : path.resolve(opc('--saida') ?? fail('falta --saida <pasta>'));
const TTS = PREVIA ? null : (opc('--tts') ?? fail('falta --tts <binário do edge-tts>'));
const SO = opc('--cenas')?.split(',');

function fail(m) { console.error(m); process.exit(1); }
function roda(cmd, a, o = {}) {
  const r = spawnSync(cmd, a, { encoding: o.binario ? 'buffer' : 'utf8', maxBuffer: 1 << 30, ...o });
  if (r.status !== 0) fail(`${cmd} falhou (${r.status}): ${String(r.stderr).slice(-2000)}`);
  return r;
}

// ------------------------------------------------------------------ conteúdo das telas
function linhasMantidas(linhas, manter) {
  const fica = (l, k) => k === 0 || /^\[código [1-9]/.test(l) || manter.some(m => (m.endsWith('\n') ? l === m.slice(0, -1) : l.includes(m)));
  const out = [];
  let pulou = false;
  linhas.forEach((l, k) => {
    if (fica(l, k)) { if (pulou) out.push('…'); out.push(l); pulou = false; } else pulou = true;
  });
  if (pulou) out.push('…');
  return out;
}

function resolverBloco(b) {
  if (b.texto) return;
  if (b.doc) {
    const todas = fs.readFileSync(path.join(CLONE, b.doc), 'utf8').split('\n');
    b.texto = [...(b.antes ? [b.antes] : []), ...todas.slice(b.linhas[0] - 1, b.linhas[1])].join('\n');
    return;
  }
  let linhas = fs.readFileSync(path.join(AQUI, 'demo/saidas', `${b.arquivo}.txt`), 'utf8').replace(/\n$/, '').split('\n');
  linhas = linhas.filter(l => l !== '[código 0]');
  if (b.comando) linhas[0] = `$ ${b.comando}`;
  if (b.manter) linhas = linhasMantidas(linhas, b.manter);
  if (b.antes) linhas.unshift(b.antes);
  b.texto = linhas.join('\n');
}

function resolverCena(cena) {
  const c = structuredClone(cena);
  if (c.exemplo) resolverBloco(c.exemplo);
  if (c.tipo === 'terminal') {
    for (const b of c.blocos) resolverBloco(b);
  }
  if (c.tipo === 'codigo') {
    const todas = fs.readFileSync(path.join(CLONE, c.arquivo), 'utf8').split('\n');
    c.texto = todas.slice(c.trecho[0] - 1, c.trecho[1]).join('\n');
    c.inicio = c.trecho[0];
  }
  return c;
}

// ------------------------------------------------------------------ narração
async function sintetizar(texto, destino) {
  for (let tentativa = 1; tentativa <= 4; tentativa++) {
    const ok = await new Promise(res => {
      const parcial = `${destino}.parcial.mp3`;
      const p = spawn(TTS, ['--voice', VOZ, `--rate=${TAXA}`, `--text=${texto}`, '--write-media', parcial], { stdio: ['ignore', 'ignore', 'pipe'] });
      let err = '';
      p.stderr.on('data', d => { err += d; });
      p.on('close', code => {
        const valido = code === 0 && fs.existsSync(parcial) &&
          spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', parcial]).status === 0;
        if (valido) { fs.renameSync(parcial, destino); res(true); return; }
        fs.rmSync(parcial, { force: true });
        console.error(`edge-tts, tentativa ${tentativa}: ${err.trim().split('\n').at(-1) ?? ''}`);
        res(false);
      });
    });
    if (ok) return;
    await new Promise(r => setTimeout(r, 1500 * tentativa));
  }
  fail(`edge-tts falhou: ${texto.slice(0, 60)}…`);
}

function pcm(arquivo) {
  return roda('ffmpeg', ['-v', 'error', '-i', arquivo, '-f', 's16le', '-ac', '1', '-ar', String(AMOSTRAS), '-'], { binario: true }).stdout;
}

// ------------------------------------------------------------------ chromium pelo protocolo de depuração
async function abrirNavegador() {
  const perfil = path.join(TMP, 'perfil-chromium');
  fs.rmSync(perfil, { recursive: true, force: true });
  const proc = spawn('chromium', ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${perfil}`, '--hide-scrollbars',
    '--force-device-scale-factor=1', '--window-size=1920,1080', '--no-first-run', '--no-default-browser-check', '--disable-gpu', 'about:blank'],
  { stdio: ['ignore', 'ignore', 'pipe'] });
  const wsBrowser = await new Promise((res, rej) => {
    let buf = '';
    proc.stderr.on('data', d => { buf += d; const m = /DevTools listening on (ws:\/\/\S+)/.exec(buf); if (m) res(m[1]); });
    proc.on('exit', c => rej(new Error(`chromium saiu (${c}): ${buf}`)));
  });
  const porta = new URL(wsBrowser).port;
  const lista = await (await fetch(`http://127.0.0.1:${porta}/json/list`)).json();
  const pagina = lista.find(x => x.type === 'page');
  const ws = new WebSocket(pagina.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pend = new Map();
  const ouvintes = [];
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
    else if (m.method) ouvintes.forEach(f => f(m));
  };
  const enviar = (method, params = {}) => new Promise((res, rej) => { const k = ++id; pend.set(k, { res, rej }); ws.send(JSON.stringify({ id: k, method, params })); });
  await enviar('Page.enable');
  await enviar('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  const carregou = new Promise(res => ouvintes.push(m => { if (m.method === 'Page.loadEventFired') res(); }));
  await enviar('Page.navigate', { url: `file://${path.join(AQUI, 'palco.html')}` });
  await carregou;
  await enviar('Runtime.evaluate', { expression: 'document.fonts.ready.then(() => true)', awaitPromise: true });
  return {
    async quadro(cena, passo, t, faixa, formato = 'jpeg') {
      const r = await enviar('Runtime.evaluate', { expression: `mostrar(${JSON.stringify(cena)}, ${passo}, ${t}, ${JSON.stringify(faixa)})`, returnByValue: true });
      if (r.exceptionDetails) fail(`erro na tela ${cena.id}: ${JSON.stringify(r.exceptionDetails).slice(0, 800)}`);
      const img = await enviar('Page.captureScreenshot', formato === 'png' ? { format: 'png' } : { format: 'jpeg', quality: 93 });
      return { dados: Buffer.from(img.data, 'base64'), transborda: r.result.value?.transborda };
    },
    fechar() { ws.close(); proc.kill(); },
  };
}

// ------------------------------------------------------------------ legenda
function hms(s) {
  const ms = Math.round(s * 1000);
  const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, ss = Math.floor(ms / 1000) % 60, r = ms % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')},${String(r).padStart(3, '0')}`;
}
// Quebra a fala em pedaços de até duas linhas de 42 caracteres, nas frases e vírgulas.
function pedacos(texto) {
  const frases = texto.match(/[^.:;!?]+[.:;!?]+|[^.:;!?]+$/g).map(s => s.trim()).filter(Boolean);
  const out = [];
  for (const f of frases) {
    if (f.length <= 84) { out.push(f); continue; }
    let atual = '';
    for (const parte of f.split(/(?<=,)\s+/)) {
      if (!atual) atual = parte;
      else if ((atual + ' ' + parte).length <= 84) atual += ' ' + parte;
      else { out.push(atual); atual = parte; }
    }
    if (atual) out.push(atual);
  }
  // Pedaço ainda longo: corta em palavras.
  return out.flatMap(p => {
    if (p.length <= 84) return [p];
    const pal = p.split(' '), r = [];
    let a = '';
    for (const w of pal) { if ((a + ' ' + w).trim().length > 84) { r.push(a.trim()); a = w; } else a += ' ' + w; }
    if (a.trim()) r.push(a.trim());
    return r;
  });
}
function duasLinhas(p) {
  if (p.length <= 42) return p;
  const meio = p.length / 2;
  let melhor = -1;
  for (let i = 0; i < p.length; i++) if (p[i] === ' ' && (melhor < 0 || Math.abs(i - meio) < Math.abs(melhor - meio))) melhor = i;
  return melhor < 0 ? p : `${p.slice(0, melhor)}\n${p.slice(melhor + 1)}`;
}

// ------------------------------------------------------------------ principal
async function main() {
  fs.mkdirSync(TMP, { recursive: true });
  const cenas = CENAS.filter(c => !SO || SO.includes(c.id)).map(resolverCena);
  const totalPorSecao = {};
  for (const c of CENAS) totalPorSecao[c.secao] = (totalPorSecao[c.secao] ?? 0) + 1;
  const faixaDe = c => ({ secao: SECOES[c.secao], pos: `${c.secao}/5` });

  if (PREVIA) {
    const dir = path.join(TMP, 'previa');
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const nav = await abrirNavegador();
    for (const c of cenas) {
      for (let i = 0; i < c.passos.length; i++) {
        const p = c.passos[i];
        const t = p.anim === 'todo' ? 1.5 : (typeof p.anim === 'number' ? p.anim : FADE) + 0.01;
        const q = await nav.quadro(c, i, t, faixaDe(c), 'png');
        const nome = `${c.id}-${i}.png`;
        fs.writeFileSync(path.join(dir, nome), q.dados);
        console.log(`${nome}${q.transborda ? '  TRANSBORDA' : ''}`);
      }
    }
    nav.fechar();
    return;
  }

  // 1. Narração
  const dirVoz = path.join(TMP, 'voz');
  fs.mkdirSync(dirVoz, { recursive: true });
  const falas = [];
  for (const c of cenas) c.passos.forEach((p, i) => falas.push({ c, i, p, texto: p.voz ?? p.fala }));
  for (const f of falas) f.mp3 = path.join(dirVoz, crypto.createHash('sha1').update(`${VOZ}|${TAXA}|${f.texto}`).digest('hex').slice(0, 16) + '.mp3');
  const faltam = falas.filter(f => !fs.existsSync(f.mp3));
  console.log(`narração: ${falas.length} falas, ${faltam.length} a sintetizar`);
  for (let k = 0; k < faltam.length; k += 2) await Promise.all(faltam.slice(k, k + 2).map(f => sintetizar(f.texto, f.mp3)));
  for (const f of falas) { f.pcm = pcm(f.mp3); f.dur = f.pcm.length / 2 / AMOSTRAS; }

  // 2. Linha do tempo: cada passo dura LEAD + fala + TAIL (+ cauda), arredondado para quadros inteiros.
  let quadrosAte = 0;
  for (const f of falas) {
    f.quadros = Math.ceil((LEAD + f.dur + TAIL + (f.p.cauda ?? 0)) * FPS);
    f.inicio = quadrosAte / FPS;
    quadrosAte += f.quadros;
  }
  const total = quadrosAte / FPS;
  console.log(`duração prevista: ${Math.floor(total / 60)}:${String(Math.floor(total % 60)).padStart(2, '0')} (${total.toFixed(2)} s)`);

  // 3. Áudio: cada fala no seu lugar, silêncio no resto.
  const amostras = Math.round(total * AMOSTRAS);
  const pista = Buffer.alloc(amostras * 2);
  for (const f of falas) {
    const off = Math.round((f.inicio + LEAD) * AMOSTRAS) * 2;
    f.pcm.copy(pista, off, 0, Math.min(f.pcm.length, pista.length - off));
  }
  const cab = Buffer.alloc(44);
  cab.write('RIFF', 0); cab.writeUInt32LE(36 + pista.length, 4); cab.write('WAVE', 8); cab.write('fmt ', 12);
  cab.writeUInt32LE(16, 16); cab.writeUInt16LE(1, 20); cab.writeUInt16LE(1, 22); cab.writeUInt32LE(AMOSTRAS, 24);
  cab.writeUInt32LE(AMOSTRAS * 2, 28); cab.writeUInt16LE(2, 32); cab.writeUInt16LE(16, 34); cab.write('data', 36); cab.writeUInt32LE(pista.length, 40);
  const wav = path.join(TMP, 'narracao.wav');
  fs.writeFileSync(wav, Buffer.concat([cab, pista]));

  // Normalização em duas passadas a -16 LUFS.
  const med = roda('ffmpeg', ['-hide_banner', '-i', wav, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-']).stderr;
  const j = JSON.parse(med.slice(med.lastIndexOf('{'), med.lastIndexOf('}') + 1));
  const wavNorm = path.join(TMP, 'narracao-16lufs.wav');
  roda('ffmpeg', ['-y', '-v', 'error', '-i', wav, '-af',
    `loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=${j.input_i}:measured_TP=${j.input_tp}:measured_LRA=${j.input_lra}:measured_thresh=${j.input_thresh}:offset=${j.target_offset}:linear=true`,
    '-ar', String(AMOSTRAS), wavNorm]);

  // 4. Quadros
  const dirQ = path.join(TMP, 'quadros');
  fs.rmSync(dirQ, { recursive: true, force: true });
  fs.mkdirSync(dirQ, { recursive: true });
  const nav = await abrirNavegador();
  const lista = [];
  let n = 0;
  const avisos = [];
  for (const f of falas) {
    const { c, i, p } = f;
    let anim = p.anim === 'todo' ? f.quadros / FPS : (typeof p.anim === 'number' ? p.anim : (i > 0 ? FADE : 0));
    let nAnim = Math.min(f.quadros - 1, Math.round(anim * FPS));
    if (p.anim === 'todo') nAnim = f.quadros;
    for (let k = 0; k < nAnim; k++) {
      const q = await nav.quadro(c, i, k / FPS, faixaDe(c));
      const arq = path.join(dirQ, `q${String(++n).padStart(6, '0')}.jpg`);
      fs.writeFileSync(arq, q.dados);
      lista.push({ arq, quadros: 1 });
      if (q.transborda && k === 0) avisos.push(`${c.id}/${i}`);
    }
    if (nAnim < f.quadros) {
      const q = await nav.quadro(c, i, anim + 0.001, faixaDe(c));
      const arq = path.join(dirQ, `q${String(++n).padStart(6, '0')}.jpg`);
      fs.writeFileSync(arq, q.dados);
      lista.push({ arq, quadros: f.quadros - nAnim });
      if (q.transborda) avisos.push(`${c.id}/${i}`);
    }
  }
  nav.fechar();
  if (avisos.length) console.log(`AVISO: telas que transbordam: ${[...new Set(avisos)].join(', ')}`);
  console.log(`quadros capturados: ${n}`);
  const txt = lista.map(x => `file '${x.arq}'\nduration ${(x.quadros / FPS).toFixed(6)}`).join('\n') + `\nfile '${lista.at(-1).arq}'\n`;
  const arqLista = path.join(TMP, 'quadros.txt');
  fs.writeFileSync(arqLista, txt);

  // 5. Legenda e capítulos
  fs.mkdirSync(SAIDA, { recursive: true });
  const srt = [];
  for (const f of falas) {
    const ps = pedacos(f.p.fala);
    const chars = ps.reduce((a, s) => a + s.length, 0);
    let t0 = f.inicio + LEAD;
    for (const s of ps) {
      const d = f.dur * s.length / chars;
      srt.push(`${srt.length + 1}\n${hms(t0)} --> ${hms(t0 + d - 0.001)}\n${duasLinhas(s)}\n`);
      t0 += d;
    }
  }
  fs.writeFileSync(path.join(SAIDA, 'apresentacao.srt'), srt.join('\n'));
  const caps = [];
  for (const c of cenas) {
    const f = falas.find(x => x.c === c);
    caps.push(`${hms(f.inicio).slice(3, 8)}  ${c.secao}/5  ${c.id}  ${c.titulo}`);
  }
  fs.writeFileSync(path.join(SAIDA, 'cenas.txt'), caps.join('\n') + '\n');

  // 6. Montagem
  const mp4 = path.join(SAIDA, 'apresentacao.mp4');
  roda('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', arqLista, '-i', wavNorm,
    '-vf', `fps=${FPS},scale=in_range=pc:out_range=tv,format=yuv420p`, '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-r', String(FPS),
    '-t', total.toFixed(3),
    '-c:a', 'aac', '-b:a', '160k', '-ar', String(AMOSTRAS), '-movflags', '+faststart', mp4]);
  console.log(`pronto: ${mp4}`);
  console.log(caps.join('\n'));
}

main().catch(e => fail(e.stack));
