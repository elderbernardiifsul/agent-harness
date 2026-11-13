// Interpretador de shell para as travas. Só lê o texto: nada é executado nem
// expandido (variáveis ficam como texto). Na dúvida, enxerga a mais: um comando
// que este módulo não mostre passa pelas travas.
//
// Duas etapas: `tokenizar` quebra o texto em palavras e operadores respeitando
// aspas; `Leitor` percorre as palavras e monta os comandos simples.
import path from 'node:path';

export class ErroDeShell extends Error {
  constructor(motivo, posicao) {
    super(posicao == null ? motivo : `${motivo} (posição ${posicao})`);
    this.name = 'ErroDeShell';
    this.posicao = posicao ?? null;
  }
}

const LIMITE_PROFUNDIDADE = 100;
const LIMITE_EXPANSAO = 10000;
const LIMITE_CARACTERES_EXPANDIDOS = 2_000_000;
const LIMITE_ENTRADAS_DE_AMBIENTE = 1_000_000;
const LIMITE_TEXTO_RELIDO_MINIMO = 1_000_000;

// ---------------------------------------------------------------- palavras

function novaPalavra(pos) {
  return { tipo: 'palavra', pecas: [], subs: [], expande: false, citada: false, texto: '', pos };
}

// Peça literal sem aspas (`livre`), entre aspas/escapada, ou marcador de chave
// (`{`, `,`, `}` sem aspas, candidatos à expansão de chaves).
function acrescentar(palavra, s, livre) {
  const ultima = palavra.pecas.at(-1);
  if (ultima && ultima.marca == null && ultima.livre === livre) ultima.s += s;
  else palavra.pecas.push({ s, livre });
}
function acrescentarCitado(palavra, s) { palavra.citada = true; acrescentar(palavra, s, false); }
function acrescentarExpansao(palavra, s) { palavra.expande = true; acrescentar(palavra, s, false); }

function finalizar(palavra) {
  palavra.texto = palavra.pecas.map(p => p.s).join('');
  return palavra;
}

// Palavra sem aspas, sem escape e sem expansão: candidata a palavra reservada.
function livre(t, texto) {
  return t?.tipo === 'palavra' && t.pecas.every(p => p.livre) && (texto === undefined || t.texto === texto);
}

const ehInicioDeNome = c => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_';
const ehDeNome = c => ehInicioDeNome(c) || (c >= '0' && c <= '9');
const ehDigito = c => c >= '0' && c <= '9';

function nomeValido(s) {
  if (!s || !ehInicioDeNome(s[0])) return false;
  for (const c of s) if (!ehDeNome(c)) return false;
  return true;
}

// `NOME=valor` ou `NOME+=valor`, com o nome e o `=` fora de aspas.
function atribuicao(palavra) {
  const p = palavra.pecas[0];
  if (!p || !p.livre || p.marca != null) return null;
  const k = p.s.indexOf('=');
  if (k <= 0) return null;
  const nome = p.s[k - 1] === '+' ? p.s.slice(0, k - 1) : p.s.slice(0, k);
  if (!nomeValido(nome)) return null;
  return { nome, valor: palavra.texto.slice(k + 1) };
}

// ---------------------------------------------------------------- tokenizador

function verificarProfundidade(prof, pos) {
  if (prof > LIMITE_PROFUNDIDADE) throw new ErroDeShell('aninhamento fundo demais', pos);
}

const op = (valor, pos) => ({ tipo: 'op', valor, pos });

// Lê de `i` até o fim (modo 'topo') ou até o `)` que fecha um `$(` (modo 'subst').
function tokenizar(texto, i, modo, prof) {
  verificarProfundidade(prof, i);
  const tokens = [];
  const pendentes = []; // heredocs à espera do corpo
  let palavra = null;
  let esperaDelimitador = null;
  let parenteses = 0;
  const atual = () => (palavra ??= novaPalavra(i));
  const fechar = () => {
    if (!palavra) return;
    tokens.push(finalizar(palavra));
    if (esperaDelimitador) {
      pendentes.push({ token: esperaDelimitador, delimitador: palavra.texto, citado: palavra.citada });
      esperaDelimitador = null;
    }
    palavra = null;
  };
  const operador = (valor, pos) => {
    fechar();
    if (esperaDelimitador) throw new ErroDeShell('heredoc sem delimitador', pos);
    const t = op(valor, pos);
    tokens.push(t);
    return t;
  };

  while (i < texto.length) {
    const c = texto[i];
    if (c === '\\') {
      if (texto[i + 1] === '\n') { i += 2; continue; }
      if (i + 1 >= texto.length) { acrescentarCitado(atual(), '\\'); i++; continue; }
      acrescentarCitado(atual(), texto[i + 1]);
      i += 2;
      continue;
    }
    if (c === "'") {
      const f = texto.indexOf("'", i + 1);
      if (f < 0) throw new ErroDeShell('aspas simples sem fechar', i);
      acrescentarCitado(atual(), texto.slice(i + 1, f));
      i = f + 1;
      continue;
    }
    if (c === '"') { atual().citada = true; i = lerAspasDuplas(texto, i + 1, atual(), prof, false); continue; }
    if (c === '`') { i = lerCrase(texto, i + 1, atual(), prof); continue; }
    if (c === '$') { i = lerDolar(texto, i, atual(), prof, false); continue; }
    if (c === '#' && !palavra) {
      const f = texto.indexOf('\n', i);
      i = f < 0 ? texto.length : f;
      continue;
    }
    if (c === ' ' || c === '\t' || c === '\r') { fechar(); i++; continue; }
    if (c === '\n') {
      operador('\n', i);
      i = lerCorpos(texto, i + 1, pendentes, prof);
      continue;
    }
    if (c === '(') {
      if (palavra && ehPrefixoDeLista(palavra)) {
        // Atribuição de lista: A=(a b $(c)).
        const r = tokenizar(texto, i + 1, 'subst', prof + 1);
        for (const s of subsDe(r.tokens)) palavra.subs.push(s);
        acrescentarExpansao(palavra, texto.slice(i, r.fim));
        i = r.fim;
        continue;
      }
      if (!palavra && texto[i + 1] === '(') {
        // Comando aritmético (( … )): só as substituições de dentro contam.
        const r = lerAritmetica(texto, i + 2, prof + 1);
        if (esperaDelimitador) throw new ErroDeShell('heredoc sem delimitador', i);
        tokens.push({ tipo: 'aritm', subs: r.subs, texto: texto.slice(i, r.fim), pos: i });
        i = r.fim;
        continue;
      }
      operador('(', i);
      parenteses++;
      i++;
      continue;
    }
    if (c === ')') {
      if (modo === 'subst' && parenteses === 0) {
        fechar();
        if (esperaDelimitador || pendentes.length) throw new ErroDeShell('heredoc sem corpo dentro de $( … )', i);
        return { tokens, fim: i + 1 };
      }
      operador(')', i);
      parenteses--;
      i++;
      continue;
    }
    if ((c === '<' || c === '>') && texto[i + 1] === '(') {
      // Substituição de processo: <( … ) e >( … ).
      const r = tokenizar(texto, i + 2, 'subst', prof + 1);
      atual().subs.push(r.tokens);
      acrescentarExpansao(palavra, texto.slice(i, r.fim));
      i = r.fim;
      continue;
    }
    if (c === '<' || c === '>' || (c === '&' && texto[i + 1] === '>')) {
      let fd = null;
      if (palavra && palavra.pecas.length === 1 && palavra.pecas[0].livre && [...palavra.pecas[0].s].every(ehDigito)) {
        fd = palavra.pecas[0].s;
        palavra = null;
      }
      const valor = lerOperador(texto, i, ['<<<', '<<-', '<<', '<>', '<&', '<', '>>', '>&', '>|', '>', '&>>', '&>']);
      const t = operador(valor, i);
      t.tipo = 'redir';
      t.fd = fd;
      if (valor === '<<' || valor === '<<-') esperaDelimitador = t;
      i += valor.length;
      continue;
    }
    if (c === '&' || c === '|' || c === ';') {
      const valor = lerOperador(texto, i, ['&&', '||', '|&', ';;&', ';;', ';&', '&', '|', ';']);
      operador(valor, i);
      i += valor.length;
      continue;
    }
    // Caractere comum.
    const p = atual();
    if (c === '{' || c === ',' || c === '}') p.pecas.push({ s: c, livre: true, marca: c });
    else {
      if (c === '*' || c === '?' || c === '[' || (c === '~' && p.pecas.length === 0)) p.expande = true;
      acrescentar(p, c, true);
    }
    i++;
  }
  fechar();
  if (modo === 'subst') throw new ErroDeShell('parêntese sem fechar em $( … )', i);
  if (esperaDelimitador) throw new ErroDeShell('heredoc sem delimitador', i);
  if (pendentes.length) throw new ErroDeShell(`heredoc sem a linha final "${pendentes[0].delimitador}"`, i);
  return { tokens, fim: i };
}

// Destino de um redirecionamento que escreve em arquivo, ou null: `>`, `>>`, `>|`, `<>`, `&>`, `&>>`
// e `>&` quando o destino não é número de descritor nem `-`.
const REDIR_QUE_ESCREVE = new Set(['>', '>>', '>|', '<>', '&>', '&>>']);
function escritaDe(r, alvo) {
  if (REDIR_QUE_ESCREVE.has(r.valor)) return alvo.texto;
  if (r.valor === '>&' && !/^(\d+-?|-)$/.test(alvo.texto)) return alvo.texto;
  return null;
}

function lerOperador(texto, i, candidatos) {
  for (const c of candidatos) if (texto.startsWith(c, i)) return c;
  return texto[i];
}

function ehPrefixoDeLista(palavra) {
  const p = palavra.pecas;
  if (p.length !== 1 || !p[0].livre || p[0].marca != null || !p[0].s.endsWith('=')) return false;
  const nome = p[0].s.slice(0, p[0].s.endsWith('+=') ? -2 : -1);
  return nomeValido(nome);
}

// Corpo dos heredocs pendentes, a partir do começo da linha seguinte.
function lerCorpos(texto, i, pendentes, prof) {
  for (const h of pendentes) {
    const linhas = [];
    let achou = false;
    const menos = h.token.valor === '<<-';
    while (i < texto.length) {
      let f = texto.indexOf('\n', i);
      if (f < 0) f = texto.length;
      let linha = texto.slice(i, f);
      if (linha.endsWith('\r')) linha = linha.slice(0, -1);
      i = Math.min(f + 1, texto.length);
      if (menos) { let k = 0; while (linha[k] === '\t') k++; linha = linha.slice(k); }
      if (linha === h.delimitador) { achou = true; break; }
      linhas.push(linha);
    }
    if (!achou) throw new ErroDeShell(`heredoc sem a linha final "${h.delimitador}"`, i);
    const corpo = linhas.map(l => `${l}\n`).join('');
    h.token.corpo = corpo;
    h.token.subs = [];
    if (!h.citado) {
      // Sem aspas no delimitador, o shell expande $( … ) e crases do corpo.
      const tmp = novaPalavra(i);
      lerAspasDuplas(corpo, 0, tmp, prof, true);
      h.token.subs = tmp.subs;
    }
  }
  pendentes.length = 0;
  return i;
}

// Dentro de aspas duplas (ou no corpo de heredoc, com `ateOFim`).
function lerAspasDuplas(texto, i, palavra, prof, ateOFim) {
  const inicio = i;
  while (i < texto.length) {
    const c = texto[i];
    if (c === '"' && !ateOFim) return i + 1;
    if (c === '\\') {
      const d = texto[i + 1];
      if (d === '\n') { i += 2; continue; }
      if (d === '$' || d === '`' || d === '\\' || (d === '"' && !ateOFim)) { acrescentar(palavra, d, false); i += 2; continue; }
      acrescentar(palavra, '\\', false);
      i++;
      continue;
    }
    if (c === '$') { i = lerDolar(texto, i, palavra, prof, true); continue; }
    if (c === '`') { i = lerCrase(texto, i + 1, palavra, prof); continue; }
    acrescentar(palavra, c, false);
    i++;
  }
  if (ateOFim) return i;
  throw new ErroDeShell('aspas duplas sem fechar', inicio - 1);
}

// Crase: o conteúdo, sem os escapes da crase, é lido como shell à parte.
function lerCrase(texto, i, palavra, prof) {
  verificarProfundidade(prof + 1, i);
  const inicio = i;
  let interno = '';
  while (i < texto.length) {
    const c = texto[i];
    if (c === '\\' && (texto[i + 1] === '`' || texto[i + 1] === '\\' || texto[i + 1] === '$')) { interno += texto[i + 1]; i += 2; continue; }
    if (c === '\\' && i + 1 < texto.length) { interno += c + texto[i + 1]; i += 2; continue; }
    if (c === '`') {
      palavra.subs.push(tokenizar(interno, 0, 'topo', prof + 1).tokens);
      acrescentarExpansao(palavra, texto.slice(inicio - 1, i + 1));
      return i + 1;
    }
    interno += c;
    i++;
  }
  throw new ErroDeShell('crase sem fechar', inicio - 1);
}

function lerDolar(texto, i, palavra, prof, emAspas) {
  const d = texto[i + 1];
  if (!emAspas && d === "'") return lerAnsiC(texto, i + 2, palavra);
  if (!emAspas && d === '"') { palavra.citada = true; return lerAspasDuplas(texto, i + 2, palavra, prof, false); }
  if (d === '(') {
    if (texto[i + 2] === '(') {
      const r = lerAritmetica(texto, i + 3, prof + 1);
      for (const s of r.subs) palavra.subs.push(s);
      acrescentarExpansao(palavra, texto.slice(i, r.fim));
      return r.fim;
    }
    const r = tokenizar(texto, i + 2, 'subst', prof + 1);
    palavra.subs.push(r.tokens);
    acrescentarExpansao(palavra, texto.slice(i, r.fim));
    return r.fim;
  }
  if (d === '{') {
    const r = lerParametro(texto, i + 2, prof + 1, emAspas);
    for (const s of r.subs) palavra.subs.push(s);
    acrescentarExpansao(palavra, texto.slice(i, r.fim));
    return r.fim;
  }
  if (d !== undefined && ehInicioDeNome(d)) {
    let f = i + 2;
    while (f < texto.length && ehDeNome(texto[f])) f++;
    acrescentarExpansao(palavra, texto.slice(i, f));
    return f;
  }
  if (d !== undefined && (ehDigito(d) || '@*#?$!-'.includes(d))) {
    acrescentarExpansao(palavra, texto.slice(i, i + 2));
    return i + 2;
  }
  acrescentar(palavra, '$', !emAspas);
  return i + 1;
}

// ${ … }: as chaves se contam, como no bash; só as substituições de dentro contam.
function lerParametro(texto, i, prof, emAspas) {
  verificarProfundidade(prof, i);
  const inicio = i - 2;
  const tmp = novaPalavra(i);
  let nivel = 1;
  while (i < texto.length) {
    const c = texto[i];
    if (c === '\\') { i += 2; continue; }
    if (c === '{') { nivel++; i++; continue; }
    if (c === '}') { if (--nivel === 0) return { fim: i + 1, subs: tmp.subs }; i++; continue; }
    if (c === '$') { i = lerDolar(texto, i, tmp, prof, true); continue; }
    if (c === '`') { i = lerCrase(texto, i + 1, tmp, prof); continue; }
    if (c === '"') { i = lerAspasDuplas(texto, i + 1, tmp, prof, false); continue; }
    if (c === "'" && !emAspas) {
      const f = texto.indexOf("'", i + 1);
      if (f < 0) throw new ErroDeShell('aspas simples sem fechar', i);
      i = f + 1;
      continue;
    }
    i++;
  }
  throw new ErroDeShell('chave sem fechar em ${ … }', inicio);
}

// $(( … )) e (( … )): procura o `))` que fecha; só as substituições contam.
function lerAritmetica(texto, i, prof) {
  verificarProfundidade(prof, i);
  const inicio = i - 2;
  const tmp = novaPalavra(i);
  let nivel = 0;
  while (i < texto.length) {
    const c = texto[i];
    if (c === '\\') { i += 2; continue; }
    if (c === '(') { if (++nivel > LIMITE_PROFUNDIDADE) throw new ErroDeShell('aninhamento fundo demais', i); i++; continue; }
    if (c === ')') {
      if (nivel === 0) {
        if (texto[i + 1] === ')') return { fim: i + 2, subs: tmp.subs };
        throw new ErroDeShell('expressão aritmética sem "))"', inicio);
      }
      nivel--;
      i++;
      continue;
    }
    if (c === '$') { i = lerDolar(texto, i, tmp, prof, true); continue; }
    if (c === '`') { i = lerCrase(texto, i + 1, tmp, prof); continue; }
    if (c === '"') { i = lerAspasDuplas(texto, i + 1, tmp, prof, false); continue; }
    if (c === "'") {
      const f = texto.indexOf("'", i + 1);
      if (f < 0) throw new ErroDeShell('aspas simples sem fechar', i);
      i = f + 1;
      continue;
    }
    i++;
  }
  throw new ErroDeShell('expressão aritmética sem "))"', inicio);
}

const ehHex = c => c !== undefined && /^[0-9a-fA-F]$/.test(c);

// $' … ': escapes no estilo do C.
function lerAnsiC(texto, i, palavra) {
  const inicio = i - 2;
  let s = '';
  const numero = (k, max, ok, base) => {
    let f = k;
    while (f < texto.length && f - k < max && ok(texto[f])) f++;
    return { valor: f > k ? parseInt(texto.slice(k, f), base) : null, fim: f };
  };
  const ponto = v => (v != null && v <= 0x10ffff ? String.fromCodePoint(v) : '');
  const simples = { n: '\n', t: '\t', r: '\r', a: '\x07', b: '\b', e: '\x1b', E: '\x1b', f: '\f', v: '\v', '\\': '\\', "'": "'", '"': '"', '?': '?' };
  while (i < texto.length) {
    const c = texto[i];
    if (c === "'") { acrescentarCitado(palavra, s); return i + 1; }
    if (c !== '\\') { s += c; i++; continue; }
    const d = texto[i + 1];
    if (d in simples) { s += simples[d]; i += 2; continue; }
    if (d === 'x' || d === 'u' || d === 'U') {
      const r = numero(i + 2, d === 'x' ? 2 : d === 'u' ? 4 : 8, ehHex, 16);
      s += r.valor == null ? `\\${d}` : ponto(r.valor);
      i = r.fim;
      continue;
    }
    if (d >= '0' && d <= '7') {
      const r = numero(i + 1, 3, x => x >= '0' && x <= '7', 8);
      s += ponto(r.valor);
      i = r.fim;
      continue;
    }
    if (d === 'c' && texto[i + 2] !== undefined && texto[i + 2] !== "'") {
      s += String.fromCharCode(texto.charCodeAt(i + 2) & 0x1f);
      i += 3;
      continue;
    }
    if (d === undefined) break;
    s += `\\${d}`;
    i += 2;
  }
  throw new ErroDeShell("aspas $' sem fechar", inicio);
}

// Substituições guardadas nas palavras de uma lista de tokens (sem executá-las).
function subsDe(tokens) {
  const r = [];
  for (const t of tokens) if (t.subs) r.push(...t.subs);
  return r;
}

// ---------------------------------------------------------------- expansão de chaves

// {a,b} e {1..3}, só com chaves e vírgulas fora de aspas, como no bash.
// `global.resta` é o orçamento de caracteres expandidos da chamada inteira.
function expandirChaves(palavra, global) {
  if (!palavra.pecas.some(p => p.marca === '{')) return [palavra.texto];
  // Árvore: sequência de nós; nó = texto | { alternativas: [sequência] }.
  const raiz = { seq: [], alternativas: null };
  const pilha = [raiz];
  const orcamento = { resta: LIMITE_EXPANSAO };
  const topo = () => pilha.at(-1);
  const emitir = n => {
    const f = topo();
    (f.alternativas ? f.alternativas.at(-1) : f.seq).push(n);
  };
  for (const p of palavra.pecas) {
    if (p.marca === '{') {
      if (pilha.length > LIMITE_PROFUNDIDADE) throw new ErroDeShell('chaves aninhadas demais', palavra.pos);
      pilha.push({ seq: null, alternativas: [[]] });
    } else if (p.marca === ',' && pilha.length > 1) {
      topo().alternativas.push([]);
    } else if (p.marca === '}' && pilha.length > 1) {
      const f = pilha.pop();
      if (f.alternativas.length > 1) emitir({ alternativas: f.alternativas });
      else {
        const dentro = f.alternativas[0];
        const seq = dentro.every(n => typeof n === 'string') ? sequencia(dentro.join(''), orcamento) : null;
        if (seq) emitir({ alternativas: seq.map(s => [s]) });
        else { emitir('{'); for (const n of dentro) emitir(n); emitir('}'); }
      }
    } else emitir(p.s);
  }
  // Chaves sem par voltam a ser texto.
  while (pilha.length > 1) {
    const f = pilha.pop();
    emitir('{');
    f.alternativas.forEach((alt, k) => { if (k) emitir(','); for (const n of alt) emitir(n); });
  }
  const total = contar(raiz.seq);
  global.resta -= total * palavra.texto.length;
  if (total > LIMITE_EXPANSAO || global.resta < 0) {
    throw new ErroDeShell('expansão de chaves grande demais', palavra.pos);
  }
  const r = expandir(raiz.seq);
  // Como no bash, a palavra vazia sem aspas que sai da expansão some.
  return palavra.citada ? r : r.filter(x => x !== '');
}

function contar(seq) {
  let n = 1;
  for (const no of seq) {
    if (typeof no === 'string') continue;
    let soma = 0;
    for (const alt of no.alternativas) { soma += contar(alt); if (soma > LIMITE_EXPANSAO) return Infinity; }
    n *= soma;
    if (n > LIMITE_EXPANSAO) return Infinity;
  }
  return n;
}

function expandir(seq) {
  let r = [''];
  for (const no of seq) {
    if (typeof no === 'string') { r = r.map(s => s + no); continue; }
    const opcoes = no.alternativas.flatMap(expandir);
    r = r.flatMap(s => opcoes.map(o => s + o));
  }
  return r;
}

// {1..5}, {a..e}, {01..10..2}; null quando não é sequência.
function sequencia(s, orcamento) {
  const partes = s.split('..');
  if (partes.length !== 2 && partes.length !== 3) return null;
  const inteiro = x => /^-?\d+$/.test(x);
  const letra = x => x.length === 1 && ehInicioDeNome(x) && x !== '_';
  let passo = 1;
  if (partes.length === 3) {
    if (!inteiro(partes[2])) return null;
    passo = Math.abs(Number(partes[2])) || 1;
  }
  const [a, b] = partes;
  let ini, fim, largura = 0, comoLetra = false;
  if (inteiro(a) && inteiro(b)) {
    ini = Number(a); fim = Number(b);
    const zero = x => /^-?0\d/.test(x);
    if (zero(a) || zero(b)) largura = Math.max(a.length, b.length);
  } else if (letra(a) && letra(b)) {
    ini = a.charCodeAt(0); fim = b.charCodeAt(0); comoLetra = true;
  } else return null;
  const quantos = Math.floor(Math.abs(fim - ini) / passo) + 1;
  orcamento.resta -= quantos;
  if (!Number.isFinite(quantos) || orcamento.resta < 0) throw new ErroDeShell('expansão de chaves grande demais', null);
  const r = [];
  const dir = fim >= ini ? 1 : -1;
  for (let k = 0, v = ini; k < quantos; k++, v += dir * passo) {
    if (comoLetra) r.push(String.fromCharCode(v));
    else {
      const neg = v < 0;
      let t = String(Math.abs(v));
      if (largura) t = t.padStart(largura - (neg ? 1 : 0), '0');
      r.push(neg ? `-${t}` : t);
    }
  }
  return r;
}

// ---------------------------------------------------------------- leitor

const PREFIXOS = new Set(['!', 'if', 'then', 'elif', 'else', 'while', 'until', 'do', 'fi', 'done', 'esac', 'time', 'coproc']);
const SEPARADORES = new Set([';', '&', '\n']);
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh', 'ash']);
const nunca = () => false;
// Simulação do cwd numa lista && / ||: nenhum estado, ou mais de um cwd possível.
const NENHUM = Symbol('nenhum');
const VARIOS = Symbol('vários');
const juntar = (a, b) => (a === NENHUM ? b : b === NENHUM ? a : a === b ? a : VARIOS);
const ehOp = (t, ...valores) => t?.tipo === 'op' && valores.includes(t.valor);

function definir(obj, k, v) {
  Object.defineProperty(obj, k, { value: v, enumerable: true, writable: true, configurable: true });
}

function nomeBase(s) {
  let b = s.slice(Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\')) + 1);
  if (b.toLowerCase().endsWith('.exe')) b = b.slice(0, -4);
  return b;
}

// Nome-base para reconhecer invólucros e o git (`/usr/bin/git`, `~/bin/git`);
// com variável ou substituição no nome-base, não reconhece nada.
function nomeDoComando(item) {
  const b = nomeBase(item.s);
  return b.includes('$') || b.includes('`') ? '' : b;
}

function resolverDir(base, dir, temExpansao) {
  if (temExpansao) return null;
  if (path.isAbsolute(dir)) return path.resolve(dir);
  return base == null ? null : path.resolve(base, dir);
}

// Opções curtas e longas de um envoltório. `comValor` são as letras que levam
// valor; `longosComValor`, as longas que levam o valor na palavra seguinte.
// `aoVer(opcao, valor)` recebe as que interessam. Devolve o índice do comando.
function pularOpcoes(itens, k, comValor, longosComValor = new Set(), aoVer = () => {}) {
  while (k < itens.length) {
    const a = itens[k].s;
    if (a === '--') return k + 1;
    if (a.startsWith('--')) {
      const igual = a.indexOf('=');
      if (igual > 0) { aoVer(a.slice(0, igual), a.slice(igual + 1)); k++; continue; }
      if (longosComValor.has(a)) { aoVer(a, itens[k + 1]?.s, itens[k + 1]); k += 2; continue; }
      aoVer(a, null); k++;
      continue;
    }
    if (a.length < 2 || a[0] !== '-') return k;
    let usou = 1;
    for (let j = 1; j < a.length; j++) {
      const letra = a[j];
      if (comValor.has(letra)) {
        if (j < a.length - 1) aoVer(`-${letra}`, a.slice(j + 1));
        else { aoVer(`-${letra}`, itens[k + 1]?.s, itens[k + 1]); usou = 2; }
        break;
      }
      aoVer(`-${letra}`, null);
    }
    k += usou;
  }
  return k;
}

class Leitor {
  constructor() {
    this.saida = [];
    this.profundidade = 0;
    this.entradasDeAmbiente = 0;
    this.orcamentoDeChaves = { resta: LIMITE_CARACTERES_EXPANDIDOS };
    this.orcamentoDeTexto = LIMITE_TEXTO_RELIDO_MINIMO;
    this.orcamentoDeSaida = { resta: LIMITE_TEXTO_RELIDO_MINIMO };
  }

  entrar(pos) {
    if (++this.profundidade > LIMITE_PROFUNDIDADE) throw new ErroDeShell('aninhamento fundo demais', pos);
  }
  sair() { this.profundidade--; }

  // Estado do shell: o cwd e o ambiente herdado do prefixo de um `eval`,
  // `bash -c` ou `su -c` de fora. Subshell, pipeline e segundo plano desfazem.
  // Atribuição solta e `export` não entram no `env` (decisão R10).
  //
  // `alternativos` são os outros cwds possíveis de um `cd` que pode ter falhado
  // antes de `;` (cd nao-existe; git add -A roda na pasta de antes): os comandos
  // seguintes saem com `cwdsAlternativos` e as travas os avaliam em cada um.
  marcar(ctx) { return { cwd: ctx.cwd, herdado: ctx.herdado, alternativos: ctx.alternativos }; }
  desfazer(ctx, marca) {
    ctx.cwd = marca.cwd;
    ctx.herdado = marca.herdado;
    ctx.alternativos = marca.alternativos;
  }
  herdar(ctx, env) {
    if (Object.keys(env).length) ctx.herdado = { ...ctx.herdado, ...env };
  }

  // Texto relido como shell (eval, bash -c, …): orçamento total por chamada,
  // conferido antes de tokenizar, contra cadeias de eval que multiplicam a entrada.
  lerTexto(texto, ctx, pos) {
    this.orcamentoDeTexto -= texto.length;
    if (this.orcamentoDeTexto < 0) throw new ErroDeShell('texto relido demais (eval, bash -c …)', pos);
    this.entrar(pos);
    const { tokens } = tokenizar(texto, 0, 'topo', this.profundidade);
    this.lerTudo(tokens, ctx);
    this.sair();
  }

  lerTudo(tokens, ctx) {
    const cur = { tokens, i: 0 };
    this.lerLista(cur, ctx, nunca);
    const resto = cur.tokens[cur.i];
    if (resto) throw new ErroDeShell(`não esperava "${resto.valor ?? resto.texto}"`, resto.pos);
  }

  // Substituição: roda num subshell.
  lerSub(tokens, ctx) {
    this.entrar(tokens[0]?.pos);
    const m = this.marcar(ctx);
    this.lerTudo(tokens, ctx);
    this.desfazer(ctx, m);
    this.sair();
  }

  lerLista(cur, ctx, para) {
    for (;;) {
      while (ehOp(cur.tokens[cur.i], '\n')) cur.i++;
      const t = cur.tokens[cur.i];
      if (!t || para(t)) return;
      this.lerAndOr(cur, ctx);
      const s = cur.tokens[cur.i];
      if (!s) return;
      if (s.tipo === 'op' && SEPARADORES.has(s.valor)) { cur.i++; continue; }
      if (para(s)) return;
      throw new ErroDeShell(`não esperava "${s.valor ?? s.texto}"`, s.pos);
    }
  }

  // a && b || c. O cwd de cada operando sai de uma simulação: para o status
  // "deu certo" e para o "falhou" guarda-se o cwd possível (ou VARIOS). O
  // operando roda nos estados que o operador deixa passar (&& no certo, || no
  // falhou); se ali houver mais de um cwd possível, o cwd dele é null. Um cd
  // que dá certo muda o cwd, e falhando não muda; outro operando que mudou o
  // cwd (eval, chaves) e o negado com `!` deixam os dois status em aberto.
  //
  // Depois da lista vale o cwd sequencial (o do último cd), ou null se algum cd
  // depois do primeiro operando mudou o cwd; com `&` no fim, nada vaza.
  lerAndOr(cur, ctx) {
    const m = this.marcar(ctx);
    let sequencial = ctx.cwd;
    let condicional = false;
    let certo = ctx.cwd;
    let falhou = NENHUM;
    let operador = '&&';
    for (let n = 0; ; n++) {
      const roda = operador === '&&' ? certo : falhou;
      ctx.cwd = roda === VARIOS || roda === NENHUM ? null : roda;
      const antes = ctx.cwd;
      const info = this.lerPipeline(cur, ctx) ?? {};
      const depois = ctx.cwd;
      let rCerto = antes;
      let rFalhou = antes;
      if (depois !== antes) {
        sequencial = depois;
        if (n > 0) condicional = true;
        if (info.ehCd && !info.negado) rCerto = depois;
        else rCerto = rFalhou = juntar(antes, depois);
      }
      if (info.negado) rCerto = rFalhou = juntar(rCerto, rFalhou);
      if (info.termina) rCerto = rFalhou = NENHUM; // exit/return: nada roda depois dele
      if (operador === '&&') { certo = rCerto; falhou = juntar(falhou, rFalhou); }
      else { falhou = rFalhou; certo = juntar(certo, rCerto); }
      if (!ehOp(cur.tokens[cur.i], '&&', '||')) break;
      operador = cur.tokens[cur.i].valor;
      cur.i++;
      while (ehOp(cur.tokens[cur.i], '\n')) cur.i++;
    }
    if (ehOp(cur.tokens[cur.i], '&')) this.desfazer(ctx, m);
    else {
      ctx.cwd = condicional ? null : sequencial;
      // A lista pode ter falhado num cwd diferente (cd que não achou a pasta): esse cwd
      // vira alternativo para o que vem depois do `;`.
      if (!condicional && typeof falhou === 'string') acrescentarAlternativos(ctx, [falhou]);
    }
  }

  // Cada parte de um pipeline roda num subshell. O texto que uma parte entrega
  // a um shell que lê a entrada (`… | sh`) é lido como shell.
  lerPipeline(cur, ctx) {
    const partes = [];
    for (;;) {
      const m = this.marcar(ctx);
      const info = this.lerComando(cur, ctx) ?? {};
      partes.push(info);
      const segue = ehOp(cur.tokens[cur.i], '|', '|&');
      if (segue || partes.length > 1) this.desfazer(ctx, m);
      if (!segue) break;
      cur.i++;
      while (ehOp(cur.tokens[cur.i], '\n')) cur.i++;
    }
    if (partes.length === 1) return partes[0];
    // Cada texto é lido uma vez só, mesmo com vários shells no pipeline.
    let ultimoShell = -1;
    partes.forEach((p, k) => { if (k > 0 && p.shellLendoEntrada) ultimoShell = k; });
    for (const anterior of partes.slice(0, Math.max(ultimoShell, 0))) {
      for (const fonte of anterior.saidaTexto ?? []) {
        const texto = typeof fonte === 'function' ? fonte() : fonte;
        const m = this.marcar(ctx);
        this.lerTexto(texto, ctx, null);
        this.desfazer(ctx, m);
      }
    }
    return {};
  }

  // Devolve o que o comando informa ao pipeline e à lista (ehCd, saidaTexto…),
  // com `negado` quando vem depois de `!`.
  lerComando(cur, ctx) {
    const negacao = { negado: false };
    const info = this.lerComandoSemNegacao(cur, ctx, negacao);
    return negacao.negado ? { ...(info ?? {}), negado: true } : info;
  }

  lerComandoSemNegacao(cur, ctx, negacao) {
    let pulou = false;
    for (;;) {
      const t = cur.tokens[cur.i];
      if (!livre(t) || !PREFIXOS.has(t.texto)) break;
      cur.i++;
      pulou = true;
      if (t.texto === '!') negacao.negado = true;
      if (t.texto === 'time') while (livre(cur.tokens[cur.i], '-p') || livre(cur.tokens[cur.i], '--')) cur.i++;
    }
    const t = cur.tokens[cur.i];
    if (!t) {
      if (pulou) return null;
      throw new ErroDeShell('faltou um comando no fim do texto', null);
    }
    if (ehOp(t, '(')) {
      cur.i++;
      this.entrar(t.pos);
      const m = this.marcar(ctx);
      this.lerLista(cur, ctx, x => ehOp(x, ')'));
      if (!ehOp(cur.tokens[cur.i], ')')) throw new ErroDeShell('parêntese sem fechar', t.pos);
      cur.i++;
      this.desfazer(ctx, m);
      this.sair();
      this.lerRedirecionamentos(cur, ctx);
      return null;
    }
    if (livre(t, '{')) {
      cur.i++;
      this.entrar(t.pos);
      const antes = this.marcar(ctx);
      this.lerLista(cur, ctx, x => livre(x, '}'));
      if (!livre(cur.tokens[cur.i], '}')) throw new ErroDeShell('chave sem fechar', t.pos);
      cur.i++;
      this.sair();
      this.lerRedirecionamentos(cur, ctx, antes);
      return null;
    }
    if (livre(t, '}')) throw new ErroDeShell('chave } sem {', t.pos);
    if (livre(t, 'case')) return this.lerCase(cur, ctx);
    if (livre(t, 'for') || livre(t, 'select')) {
      cur.i++;
      while (cur.tokens[cur.i] && cur.tokens[cur.i].tipo !== 'op' && !livre(cur.tokens[cur.i], 'do')) {
        for (const s of cur.tokens[cur.i].subs ?? []) this.lerSub(s, ctx);
        cur.i++;
      }
      return null;
    }
    if (livre(t, 'function')) {
      cur.i++;
      if (cur.tokens[cur.i]?.tipo !== 'palavra') throw new ErroDeShell('function sem nome', t.pos);
      cur.i++;
      if (ehOp(cur.tokens[cur.i], '(')) {
        if (!ehOp(cur.tokens[cur.i + 1], ')')) throw new ErroDeShell('function com "(" sem ")"', t.pos);
        cur.i += 2;
      }
      return this.lerCorpoDeFuncao(cur, ctx, t.pos);
    }
    if (livre(t, '[[')) return this.lerTeste(cur, ctx);
    if (t.tipo === 'op') {
      if (pulou) return null;
      throw new ErroDeShell(`faltou um comando antes de "${t.valor}"`, t.pos);
    }
    return this.lerSimples(cur, ctx);
  }

  // Corpo de função: aparece na lista (pode ser chamada depois), sem vazar cd.
  lerCorpoDeFuncao(cur, ctx, pos) {
    while (ehOp(cur.tokens[cur.i], '\n')) cur.i++;
    if (!cur.tokens[cur.i]) throw new ErroDeShell('função sem corpo', pos);
    this.entrar(pos);
    const m = this.marcar(ctx);
    this.lerComando(cur, ctx);
    this.desfazer(ctx, m);
    this.sair();
    return null;
  }

  // Redirecionamentos depois de um comando composto; os que escrevem saem num comando só de
  // redirecionamento (`argv: []`) no cwd `marca` (o de antes do composto).
  lerRedirecionamentos(cur, ctx, marca = this.marcar(ctx)) {
    const escritas = [];
    while (cur.tokens[cur.i]?.tipo === 'redir') {
      const r = cur.tokens[cur.i];
      const alvo = cur.tokens[cur.i + 1];
      if (alvo?.tipo !== 'palavra') throw new ErroDeShell(`redirecionamento "${r.valor}" sem destino`, r.pos);
      for (const s of [...(r.subs ?? []), ...alvo.subs]) this.lerSub(s, ctx);
      const e = escritaDe(r, alvo);
      if (e != null) escritas.push(e);
      cur.i += 2;
    }
    if (escritas.length) this.emitirEscritas(escritas, marca, ctx, {});
  }

  lerCase(cur, ctx) {
    const antes = this.marcar(ctx);
    const inicio = cur.tokens[cur.i];
    cur.i++;
    const sujeito = cur.tokens[cur.i];
    if (sujeito?.tipo !== 'palavra') throw new ErroDeShell('case sem palavra', inicio.pos);
    for (const s of sujeito.subs) this.lerSub(s, ctx);
    cur.i++;
    while (ehOp(cur.tokens[cur.i], '\n')) cur.i++;
    if (!livre(cur.tokens[cur.i], 'in')) throw new ErroDeShell('case sem "in"', inicio.pos);
    cur.i++;
    this.entrar(inicio.pos);
    for (;;) {
      while (ehOp(cur.tokens[cur.i], '\n', ';')) cur.i++;
      const t = cur.tokens[cur.i];
      if (!t) throw new ErroDeShell('case sem "esac"', inicio.pos);
      if (livre(t, 'esac')) { cur.i++; break; }
      if (ehOp(t, '(')) cur.i++;
      for (;;) {
        const p = cur.tokens[cur.i];
        if (p?.tipo === 'palavra') { for (const s of p.subs) this.lerSub(s, ctx); cur.i++; continue; }
        if (ehOp(p, '|')) { cur.i++; continue; }
        if (ehOp(p, ')')) { cur.i++; break; }
        throw new ErroDeShell('padrão do case sem ")"', p?.pos ?? inicio.pos);
      }
      this.lerLista(cur, ctx, x => ehOp(x, ';;', ';&', ';;&') || livre(x, 'esac'));
      if (ehOp(cur.tokens[cur.i], ';;', ';&', ';;&')) cur.i++;
    }
    this.sair();
    this.lerRedirecionamentos(cur, ctx, antes);
    return null;
  }

  // [[ … ]]: um comando só, com os operadores de dentro como texto.
  lerTeste(cur, ctx) {
    const inicio = cur.tokens[cur.i];
    const argv = [];
    for (;;) {
      const t = cur.tokens[cur.i];
      if (!t) throw new ErroDeShell('[[ sem ]]', inicio.pos);
      cur.i++;
      for (const s of t.subs ?? []) this.lerSub(s, ctx);
      argv.push(t.tipo === 'palavra' || t.tipo === 'aritm' ? t.texto : t.valor);
      if (livre(t, ']]')) break;
    }
    this.emitir(argv, ctx.cwd, ctx, {});
    return null;
  }

  lerSimples(cur, ctx) {
    const primeiro = cur.i;
    const palavras = [];
    const entradas = [];
    const escritas = [];
    const subs = [];
    for (;;) {
      const t = cur.tokens[cur.i];
      if (!t) break;
      if (t.tipo === 'palavra') { palavras.push(t); subs.push(...t.subs); cur.i++; continue; }
      if (t.tipo === 'aritm') { subs.push(...t.subs); cur.i++; continue; }
      if (t.tipo === 'redir') {
        const alvo = cur.tokens[cur.i + 1];
        if (alvo?.tipo !== 'palavra') throw new ErroDeShell(`redirecionamento "${t.valor}" sem destino`, t.pos);
        subs.push(...(t.subs ?? []), ...alvo.subs);
        if (t.valor === '<<' || t.valor === '<<-') entradas.push(t.corpo ?? '');
        if (t.valor === '<<<') entradas.push(alvo.texto);
        const e = escritaDe(t, alvo);
        if (e != null) escritas.push(e);
        cur.i += 2;
        continue;
      }
      if (ehOp(t, '(')) {
        if (palavras.length === 1 && ehOp(cur.tokens[cur.i + 1], ')')) {
          cur.i += 2;
          return this.lerCorpoDeFuncao(cur, ctx, t.pos);
        }
        throw new ErroDeShell('"(" no meio de um comando', t.pos);
      }
      break;
    }
    for (const s of subs) this.lerSub(s, ctx);

    const envLocal = {};
    let k = 0;
    for (; k < palavras.length; k++) {
      const a = atribuicao(palavras[k]);
      if (!a) break;
      definir(envLocal, a.nome, a.valor);
    }
    const itens = palavras.slice(k).flatMap(p => expandirChaves(p, this.orcamentoDeChaves).map(s => ({ s, exp: p.expande })));
    if (!itens.length) {
      // Só atribuição ou só redirecionamento (`> f`): o arquivo é criado mesmo assim.
      if (escritas.length) this.emitirEscritas(escritas, this.marcar(ctx), ctx, envLocal);
      return null;
    }
    // Os tokens já lidos não servem mais: soltá-los poupa memória numa cadeia
    // de eval, em que cada nível relê o texto inteiro.
    for (let j = primeiro; j < cur.i; j++) cur.tokens[j] = undefined;
    palavras.length = 0;
    return this.resolver(itens, envLocal, ctx, entradas, escritas);
  }

  // Tira os envoltórios e trata os comandos que mudam o estado ou leem shell.
  // `escritas` são os destinos de redirecionamento do comando: valem no cwd do shell (ctx.cwd), não no
  // de `git -C`/`env -C`; saem no próprio comando quando o cwd é o mesmo, senão num comando só deles.
  resolver(itens, envLocal, ctx, entradas, escritas = []) {
    const marca = this.marcar(ctx);
    const soEscritas = () => { if (escritas.length) this.emitirEscritas(escritas, marca, ctx, envLocal); };
    const comEscritas = (argv, cwd, env) => {
      if (escritas.length && cwd !== ctx.cwd) { soEscritas(); this.emitir(argv, cwd, ctx, env); } else this.emitir(argv, cwd, ctx, env, escritas);
    };
    const env = { ...envLocal };
    let cwd = ctx.cwd;
    let original = itens;
    for (;;) {
      if (!itens.length) { itens = original; break; }
      const nome = nomeDoComando(itens[0]);
      let k = null;
      if (nome === 'env') {
        let dividir = null;
        k = pularOpcoes(itens, 1, new Set(['u', 'C', 'S']), new Set(['--unset', '--chdir', '--split-string']), (o, v, item) => {
          if ((o === '-C' || o === '--chdir') && v != null) cwd = resolverDir(cwd, v, item?.exp);
          if ((o === '-S' || o === '--split-string') && v != null) dividir = v;
        });
        while (k < itens.length && (itens[k].s === '-' || itens[k].s.indexOf('=') > 0)) {
          const s = itens[k].s;
          if (s !== '-') definir(env, s.slice(0, s.indexOf('=')), s.slice(s.indexOf('=') + 1));
          k++;
        }
        if (dividir != null) {
          this.orcamentoDeTexto -= dividir.length;
          if (this.orcamentoDeTexto < 0) throw new ErroDeShell('texto relido demais (env -S)', null);
          const palavrasDivididas = tokenizar(dividir, 0, 'topo', 1).tokens.filter(t => t.tipo === 'palavra');
          itens = [...palavrasDivididas.map(p => ({ s: p.texto, exp: p.expande })), ...itens.slice(k)];
          continue;
        }
      } else if (nome === 'sudo' || nome === 'doas') {
        const comValor = nome === 'sudo' ? 'ugCDhprtTUc' : 'uC';
        k = pularOpcoes(itens, 1, new Set(comValor),
          new Set(['--user', '--group', '--close-from', '--chdir', '--host', '--prompt', '--role', '--type', '--command-timeout', '--other-user', '--login-class']),
          (o, v, item) => { if (nome === 'sudo' && (o === '-D' || o === '--chdir') && v != null) cwd = resolverDir(cwd, v, item?.exp); });
        while (k < itens.length && atribuicaoDeTexto(itens[k].s)) {
          const a = atribuicaoDeTexto(itens[k].s);
          definir(env, a.nome, a.valor);
          k++;
        }
      } else if (nome === 'command') k = pularOpcoes(itens, 1, new Set());
      else if (nome === 'builtin' || nome === 'nohup') k = pularOpcoes(itens, 1, new Set());
      else if (nome === 'exec') k = pularOpcoes(itens, 1, new Set(['a']));
      else if (nome === 'time') k = pularOpcoes(itens, 1, new Set(['f', 'o']), new Set(['--format', '--output']));
      else if (nome === 'nice') k = pularOpcoes(itens, 1, new Set(['n']), new Set(['--adjustment']));
      else if (nome === 'stdbuf') k = pularOpcoes(itens, 1, new Set(['i', 'o', 'e']), new Set(['--input', '--output', '--error']));
      else if (nome === 'setsid') k = pularOpcoes(itens, 1, new Set());
      else if (nome === 'ionice') k = pularOpcoes(itens, 1, new Set(['c', 'n', 'p', 'P', 'u']), new Set(['--class', '--classdata', '--pid', '--pgid', '--uid']));
      else if (nome === 'timeout') {
        k = pularOpcoes(itens, 1, new Set(['s', 'k']), new Set(['--signal', '--kill-after']));
        if (k < itens.length) k++; // duração
      } else if (nome === 'xargs') {
        k = pularOpcoes(itens, 1, new Set(['I', 'L', 'n', 'P', 's', 'd', 'E', 'a']),
          new Set(['--arg-file', '--delimiter', '--max-args', '--max-procs', '--max-chars', '--process-slot-var', '--max-lines']));
        if (k >= itens.length) { itens = [{ s: 'echo', exp: false }]; continue; }
      }
      if (k == null) break;
      original = itens;
      itens = itens.slice(k);
    }

    const argv = itens.map(x => x.s);
    const nome = nomeDoComando(itens[0]);

    if (SHELLS.has(nome)) {
      const texto = textoDoDashC(itens);
      const filho = (t) => {
        const m = this.marcar(ctx);
        this.herdar(ctx, env);
        if (cwd !== ctx.cwd) ctx.alternativos = [];
        ctx.cwd = cwd;
        this.lerTexto(t, ctx, null);
        this.desfazer(ctx, m);
      };
      if (texto !== undefined) {
        soEscritas();
        if (texto !== null) filho(texto);
        return null;
      }
      comEscritas(argv, cwd, env);
      for (const e of entradas) filho(e);
      return { shellLendoEntrada: !argv.slice(1).some(a => !a.startsWith('-') && !a.startsWith('+')) };
    }
    if (nome === 'su') {
      // su [usuário] -c '<texto>': o texto roda num shell novo.
      let texto = null;
      for (let k = 1; k < argv.length; k++) {
        if ((argv[k] === '-c' || argv[k] === '--command') && k + 1 < argv.length) texto = argv[k + 1];
        else if (argv[k].startsWith('--command=')) texto = argv[k].slice('--command='.length);
      }
      if (texto == null) { comEscritas(argv, cwd, env); return null; }
      soEscritas();
      const m = this.marcar(ctx);
      this.herdar(ctx, env);
      this.lerTexto(texto, ctx, null);
      this.desfazer(ctx, m);
      return null;
    }
    if (nome === 'eval') {
      // eval roda no shell atual: o cd vaza; o prefixo vale só para o texto.
      const texto = argv.slice(1).join(' ');
      itens.length = 0;
      argv.length = 0;
      soEscritas();
      if (!texto.trim()) return null;
      const herdado = ctx.herdado;
      this.herdar(ctx, env);
      this.lerTexto(texto, ctx, null);
      ctx.herdado = herdado;
      return null;
    }
    if (nome === 'trap') {
      comEscritas(argv, cwd, env);
      const k = pularOpcoes(itens, 1, new Set());
      if (itens.length - k >= 2) {
        const m = this.marcar(ctx);
        this.lerTexto(itens[k].s, ctx, null);
        this.desfazer(ctx, m);
      }
      return null;
    }
    if (nome === 'git') {
      const r = tirarDashC(itens, cwd);
      comEscritas(r.argv, r.cwd, env);
      return null;
    }
    comEscritas(argv, cwd, env);

    const ehCd = nome === 'cd' || nome === 'pushd' || nome === 'popd';
    if (ehCd) {
      const alternativos = ctx.alternativos.map(a => novoCwd(nome, itens, a));
      ctx.cwd = novoCwd(nome, itens, ctx.cwd);
      acrescentarAlternativos(ctx, alternativos);
    }
    // Texto que este comando escreve na saída, caso vá para um shell. Montado
    // só se for mesmo para um shell (printf sem como montar lança erro).
    const saidaTexto = [...entradas];
    if (nome === 'echo') saidaTexto.push(...saidaDoEcho(itens));
    else if (nome === 'printf') {
      let k = 1;
      if (argv[k] === '-v') k += 2;
      if (argv[k] === '--') k++;
      if (k < itens.length) saidaTexto.push(() => saidaDoPrintf(itens.slice(k), this.orcamentoDeSaida));
    }
    return { saidaTexto, ehCd, termina: nome === 'exit' || nome === 'return' };
  }

  // Cada comando leva a cópia do ambiente conhecido; o teto evita que milhares
  // de atribuições vezes milhares de comandos esgotem a memória.
  emitir(argv, cwd, ctx, env, escritas) {
    const completo = { ...ctx.herdado, ...env };
    this.entradasDeAmbiente += Object.keys(completo).length + 1;
    if (this.entradasDeAmbiente > LIMITE_ENTRADAS_DE_AMBIENTE) throw new ErroDeShell('texto grande demais para ler (ambiente × comandos)', null);
    const saida = { argv, cwd, env: completo };
    // Os alternativos valem para o cwd da lista; com git -C ou env -C o cwd é outro.
    if (ctx.alternativos.length && cwd === ctx.cwd) saida.cwdsAlternativos = [...ctx.alternativos];
    if (escritas?.length) saida.escritas = [...escritas];
    this.saida.push(saida);
  }

  // Comando só de redirecionamento (`argv: []`), no cwd e com os alternativos de `marca`.
  emitirEscritas(escritas, marca, ctx, env) {
    const m = this.marcar(ctx);
    this.desfazer(ctx, marca);
    this.emitir([], marca.cwd, ctx, env, escritas);
    this.desfazer(ctx, m);
  }
}

// ---------------------------------------------------------------- echo e printf

const ESCAPES = { a: '\x07', b: '\b', e: '\x1b', E: '\x1b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v', '\\': '\\', '"': '"', "'": "'" };
const ehOctal = c => c !== undefined && c >= '0' && c <= '7';

// Um escape em `s[i]` (que é `\`). Modo 'printf': `\NNN` octal; modo 'echo'
// (echo -e e %b): `\0NNN` octal e `\c` encerra a saída.
function umEscape(s, i, modo) {
  const d = s[i + 1];
  if (d === undefined) return { texto: '\\', fim: i + 1 };
  if (d in ESCAPES) return { texto: ESCAPES[d], fim: i + 2 };
  if (d === 'c' && modo === 'echo') return { texto: '', fim: s.length, parou: true };
  const numero = (k, max, ok, base) => {
    let f = k;
    while (f < s.length && f - k < max && ok(s[f])) f++;
    return { valor: f > k ? parseInt(s.slice(k, f), base) : null, fim: f };
  };
  const ponto = v => (v <= 0x10ffff ? String.fromCodePoint(v) : '');
  if (d === 'x' || d === 'u' || d === 'U') {
    const r = numero(i + 2, d === 'x' ? 2 : d === 'u' ? 4 : 8, ehHex, 16);
    return r.valor == null ? { texto: `\\${d}`, fim: i + 2 } : { texto: ponto(r.valor), fim: r.fim };
  }
  if (modo === 'echo' && d === '0') {
    const r = numero(i + 2, 3, ehOctal, 8);
    return { texto: ponto(r.valor ?? 0), fim: r.fim };
  }
  if (modo === 'printf' && ehOctal(d)) {
    const r = numero(i + 1, 3, ehOctal, 8);
    return { texto: ponto(r.valor), fim: r.fim };
  }
  return { texto: `\\${d}`, fim: i + 2 };
}

function decodificar(s, modo) {
  let r = '';
  for (let i = 0; i < s.length;) {
    if (s[i] !== '\\') { r += s[i]; i++; continue; }
    const e = umEscape(s, i, modo);
    r += e.texto;
    if (e.parou) return { texto: r, parou: true };
    i = e.fim;
  }
  return { texto: r, parou: false };
}

// O que o echo escreve. Sem -e o bash não interpreta os escapes, mas o `sh`
// de alguns sistemas interpreta: lê as duas formas.
function saidaDoEcho(itens) {
  let k = 1;
  let comE = false;
  let comEMaiusculo = false;
  while (k < itens.length && /^-[neE]+$/.test(itens[k].s)) {
    if (itens[k].s.includes('e')) comE = true;
    if (itens[k].s.includes('E')) comEMaiusculo = true;
    k++;
  }
  if (k >= itens.length) return [];
  const cru = itens.slice(k).map(x => x.s).join(' ');
  const decodificado = decodificar(cru, 'echo').texto;
  // Com -e e -E juntos vale a última no bash; aqui saem as duas leituras.
  if (comE && !comEMaiusculo) return [decodificado];
  return decodificado === cru ? [cru] : [cru, decodificado];
}

// O que o printf escreve: escapes do formato, %% e as conversões %s, %b e %q
// trocadas pelos argumentos (%b com os escapes do echo, %q com o argumento cru).
// Não dá para montar, e lança ErroDeShell: formato ou argumento com variável,
// outra conversão (%c, %d, %x …), precisão ou `*`. Cada pedaço desconta de
// `orcamento.resta`: o formato reaproveitado multiplica o tamanho da saída.
function saidaDoPrintf(itens, orcamento) {
  const naoDa = () => new ErroDeShell('printf entregue a um shell com formato ou argumento variável', null);
  if (itens[0].exp) throw naoDa();
  const formato = itens[0].s;
  const args = itens.slice(1);
  if (args.some(x => x.exp)) throw naoDa();
  let a = 0;
  let saida = '';
  const proximo = () => (a < args.length ? args[a++].s : '');
  const por = t => {
    orcamento.resta -= t.length;
    if (orcamento.resta < 0) throw new ErroDeShell('saída do printf grande demais para ler', null);
    saida += t;
  };
  for (;;) {
    const antes = a;
    for (let i = 0; i < formato.length;) {
      const c = formato[i];
      if (c === '\\') {
        const e = umEscape(formato, i, 'printf');
        por(e.texto);
        i = e.fim;
        continue;
      }
      if (c !== '%') { por(c); i++; continue; }
      if (formato[i + 1] === '%') { por('%'); i += 2; continue; }
      // Só %s, %b e %q puros: flag, largura ou precisão mudam o texto
      // (preenchimento, corte) e não são montados.
      const f = i + 1;
      const conv = formato[f];
      if (conv === undefined) { por(formato.slice(i)); break; }
      if (conv !== 's' && conv !== 'b' && conv !== 'q') {
        throw new ErroDeShell(`printf entregue a um shell com %${conv} (flag, largura, precisão ou conversão que não é montada)`, null);
      }
      if (conv === 'b') {
        const r = decodificar(proximo(), 'echo');
        por(r.texto);
        if (r.parou) return saida;
      } else if (conv === 'q') {
        // %q cita o argumento; só o que sai igual ao citar dá para montar.
        const arg = proximo();
        if (!ehInalteradoPeloQ(arg)) throw new ErroDeShell('printf entregue a um shell com %q de argumento que muda ao citar', null);
        por(arg);
      } else por(proximo());
      i = f + 1;
    }
    if (a === antes || a >= args.length) return saida;
  }
}

// O %q do bash devolve o argumento igual só se ele for não vazio e tiver só
// estes caracteres (conferido no bash 5: a vírgula sai como `\,`).
function ehInalteradoPeloQ(s) {
  if (!s) return false;
  for (const c of s) if (!ehDeNome(c) && !'./=:+@%-'.includes(c)) return false;
  return true;
}

function atribuicaoDeTexto(s) {
  const k = s.indexOf('=');
  if (k <= 0) return null;
  const nome = s[k - 1] === '+' ? s.slice(0, k - 1) : s.slice(0, k);
  return nomeValido(nome) ? { nome, valor: s.slice(k + 1) } : null;
}

// bash -c '<texto>': devolve o texto (null se faltar), ou undefined sem -c.
function textoDoDashC(itens) {
  let temC = false;
  let k = 1;
  while (k < itens.length) {
    const a = itens[k].s;
    if (a === '--' || a === '-') { k++; break; }
    if (a.startsWith('--')) { k += a === '--rcfile' || a === '--init-file' ? 2 : 1; continue; }
    if (a.length < 2 || (a[0] !== '-' && a[0] !== '+')) break;
    if (a.includes('c')) temC = true;
    k += a.includes('o') || a.includes('O') ? 2 : 1;
  }
  if (!temC) return undefined;
  return itens[k]?.s ?? null;
}

// git -C <dir>: o cwd passa a ser <dir> e o par sai do argv.
const GIT_COM_VALOR = new Set(['-c', '--git-dir', '--work-tree', '--namespace', '--super-prefix', '--config-env']);
function tirarDashC(itens, cwd) {
  const argv = [itens[0].s];
  let k = 1;
  while (k < itens.length) {
    const a = itens[k].s;
    if (a === '-C' && k + 1 < itens.length) {
      cwd = resolverDir(cwd, itens[k + 1].s, itens[k + 1].exp);
      k += 2;
      continue;
    }
    if (!a.startsWith('-')) break;
    argv.push(a);
    if (GIT_COM_VALOR.has(a) && k + 1 < itens.length) argv.push(itens[++k].s);
    k++;
  }
  for (; k < itens.length; k++) argv.push(itens[k].s);
  return { argv, cwd };
}

// Junta cwds alternativos sem repetir o atual; passado o teto, um null (desconhecido) fica no lugar.
const MAX_ALTERNATIVOS = 8;
function acrescentarAlternativos(ctx, novos) {
  const lista = [...ctx.alternativos];
  for (const a of novos) if (a !== ctx.cwd && !lista.includes(a)) lista.push(a);
  ctx.alternativos = lista.length > MAX_ALTERNATIVOS ? [null] : lista;
}

function novoCwd(nome, itens, cwd) {
  if (nome === 'popd') return null;
  let k = 1;
  while (k < itens.length && /^-[LPe@]+$/.test(itens[k].s)) k++;
  if (itens[k]?.s === '--') k++;
  const resto = itens.slice(k);
  if (resto.length !== 1) return null;
  const [alvo] = resto;
  if (alvo.s === '-' || (nome === 'pushd' && (alvo.s.startsWith('+') || alvo.s.startsWith('-')))) return null;
  return resolverDir(cwd, alvo.s, alvo.exp);
}

/**
 * Comandos simples de um texto de shell, na ordem em que rodariam.
 * Não executa nada. `cwd` null quer dizer "desconhecido". `escritas` são os destinos dos
 * redirecionamentos que escrevem (relativos ao `cwd` do comando); um comando só de
 * redirecionamento (`> f`, ou o de um composto, `eval`, `bash -c`) sai com `argv: []`.
 * @returns {Array<{argv: string[], cwd: string|null, env: Record<string, string>, cwdsAlternativos?: Array<string|null>, escritas?: string[]}>}
 */
export function comandosSimples(texto, cwd) {
  if (typeof texto !== 'string') throw new TypeError('comandosSimples: o texto precisa ser string');
  const leitor = new Leitor();
  leitor.orcamentoDeTexto = Math.max(4 * texto.length, LIMITE_TEXTO_RELIDO_MINIMO);
  leitor.orcamentoDeSaida.resta = leitor.orcamentoDeTexto;
  const { tokens } = tokenizar(texto, 0, 'topo', 0);
  leitor.lerTudo(tokens, { cwd: cwd ?? null, herdado: {}, alternativos: [] });
  return leitor.saida;
}
