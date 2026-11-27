// Leitura de um artigo da wiki e extração dos literais de alto sinal, sem tocar no disco.
//
// Dor: "resposta plausível sem fonte". A invariante da wiki diz que todo número, data, horário ou citação de um
// artigo existe literalmente numa fonte ligada pelo campo Fontes dele. Para conferir, primeiro é preciso saber o que,
// no artigo, é literal de alto sinal: números com separador ou sufixo (1.234,56; 2,5%; 42K), números de 4 ou mais
// dígitos (2026), datas (2026-11-20, 01/12/2026), horários (0:12:40) e citações de 15 ou mais caracteres. Inteiros
// pequenos ("42 pedidos") ficam de fora: valem pela regra de localizar na fonte antes de escrever.
//
// Reescrita em JavaScript das regras de scripts/check_evidence.py de astro-han/karpathy-llm-wiki (MIT, commit
// eafcc77; licença em LICENSE-karpathy-llm-wiki, nesta pasta).

const CERCA_ABRE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const CERCA_FECHA = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;
const METADADO = /^>\s*(Fontes|Atualizado|Arquivado):/;
const LINHA_FONTES = /^>\s*Fontes:/;
const LINHA_ARQUIVADO = /^>\s*Arquivado:/;
const LINHA_STATUS = /^>\s*\*\*Status:/;
const LINK = /\[([^\]]*)\]\(([^)]*)\)/g;
const CODIGO = /`[^`\n]*`/g;
const ASPAS = [/"([^"\n]*)"/g, /“([^”\n]*)”/g];

const DATA_ISO = /\d{4}-\d{2}(?:-\d{2})?/g;
const DATA_BR = /(?<![\d/])\d{1,2}\/\d{1,2}(?:\/\d{2,4})?(?![\d/])/g;
const HORA = /(?<![\d:])\d{1,2}:\d{2}(?::\d{2})?(?![\d:])/g;
const NUMERO = /\d+(?:[.,]\d+)*(?:\s*(?:%|[KMB](?![A-Za-z])))?(?![A-Za-z])/g;
const MINIMO_DA_CITACAO = 15;

export const normalizar = texto => texto.replace(/\s+/g, ' ').trim();

// A cerca de código que a linha abre ({car, tam}), ou null. Uma cerca de crases com crase no resto não é cerca.
function abreCerca(linha) {
  const m = CERCA_ABRE.exec(linha);
  if (!m || (m[1][0] === '`' && m[2].includes('`'))) return null;
  return { car: m[1][0], tam: m[1].length };
}
const fechaCerca = (linha, c) => {
  const m = CERCA_FECHA.exec(linha);
  return Boolean(m && m[1][0] === c.car && m[1].length >= c.tam);
};

// Título, cabeçalho e corpo. O cabeçalho é só o blockquote contíguo logo depois do primeiro "# " fora de cerca;
// uma cerca encerra o cabeçalho; o que está dentro de cercas não entra em lugar nenhum.
export function lerArtigo(texto) {
  let titulo = null;
  const cabecalho = [];
  const antes = [];
  const corpo = [];
  let estado = 'antes';
  let cerca = null;
  for (const linha of texto.split(/\r?\n/)) {
    if (cerca) {
      if (fechaCerca(linha, cerca)) cerca = null;
      continue;
    }
    const c = abreCerca(linha);
    if (c) {
      cerca = c;
      if (estado === 'titulo' || estado === 'cabecalho') estado = 'corpo';
      continue;
    }
    const citacao = linha.trim().startsWith('>');
    if (estado === 'antes') {
      if (linha.startsWith('# ')) { titulo = linha; estado = 'titulo'; } else antes.push(linha);
    } else if (estado === 'titulo') {
      if (!linha.trim()) continue;
      if (citacao) { cabecalho.push(linha); estado = 'cabecalho'; } else { corpo.push(linha); estado = 'corpo'; }
    } else if (estado === 'cabecalho') {
      if (citacao) cabecalho.push(linha); else { corpo.push(linha); estado = 'corpo'; }
    } else corpo.push(linha);
  }
  return { titulo, cabecalho, corpo: [...antes, ...corpo] };
}

// Os alvos dos links da linha "> Fontes:" do cabeçalho, sem âncora. A mesma linha no corpo é conteúdo, não campo.
export function linksDeFontes(texto) {
  const alvos = [];
  for (const linha of lerArtigo(texto).cabecalho) {
    if (!LINHA_FONTES.test(linha.trim())) continue;
    for (const m of linha.matchAll(LINK)) {
      const alvo = m[2].split('#')[0].trim();
      if (alvo) alvos.push(alvo);
    }
  }
  return alvos;
}

// Página arquivada é retrato de um momento: não é conferida.
export const arquivado = texto => lerArtigo(texto).cabecalho.some(l => LINHA_ARQUIVADO.test(l.trim()));

// Código em linha não é afirmação; de um link, vale o texto.
const limpar = linha => linha.replace(CODIGO, ' ').replace(LINK, '$1');

const ficaONumero = n => /(?:%|[KMB])$/.test(n) || n.includes(',') || n.includes('.') || n.length >= 4;

// Datas, horários e números de uma linha. O que já foi lido como data ou horário sai antes da busca de números,
// para "01/12/2026" não virar também "2026".
function literaisDaLinha(linha) {
  const achados = [];
  let resto = linha;
  for (const [tipo, re] of [['data', DATA_ISO], ['data', DATA_BR], ['hora', HORA]]) {
    resto = resto.replace(re, m => { achados.push({ tipo, valor: m }); return ' '.repeat(m.length); });
  }
  for (const m of resto.matchAll(NUMERO)) if (ficaONumero(m[0].trim())) achados.push({ tipo: 'número', valor: m[0].trim() });
  return achados;
}

// Os literais de alto sinal do artigo, sem repetição, na ordem em que aparecem. Os metadados do cabeçalho
// (Fontes, Atualizado, Arquivado) e os blocos de status (o que deixou de valer) não contam.
export function candidatos(texto) {
  const a = lerArtigo(texto);
  const linhas = [...(a.titulo ? [a.titulo] : []), ...a.cabecalho.filter(l => !METADADO.test(l.trim())), ...a.corpo];
  const lista = [];
  let bloco = [];
  let paragrafo = [];
  let noStatus = false;
  const fecharBloco = () => {
    const junto = normalizar(bloco.join(' '));
    if (junto.length >= MINIMO_DA_CITACAO) lista.push({ tipo: 'citação', valor: junto });
    bloco = [];
  };
  const fecharParagrafo = () => {
    const junto = normalizar(paragrafo.join(' '));
    for (const re of ASPAS) {
      for (const m of junto.matchAll(re)) if (m[1].trim().length >= MINIMO_DA_CITACAO) lista.push({ tipo: 'citação', valor: m[1] });
    }
    paragrafo = [];
  };
  for (const linha of linhas) {
    const l = linha.trim();
    if (LINHA_STATUS.test(l)) { fecharBloco(); fecharParagrafo(); noStatus = true; continue; }
    if (noStatus) {
      if (l.startsWith('>')) continue;
      noStatus = false;
    }
    if (l.startsWith('>')) {
      fecharParagrafo();
      const conteudo = limpar(l.replace(/^>+/, '').trim());
      bloco.push(conteudo);
      lista.push(...literaisDaLinha(conteudo));
      continue;
    }
    fecharBloco();
    if (!l) { fecharParagrafo(); continue; }
    const limpa = limpar(linha);
    lista.push(...literaisDaLinha(limpa));
    paragrafo.push(limpa);
  }
  fecharBloco();
  fecharParagrafo();
  const vistos = new Set();
  const unicos = [];
  for (const c of lista) {
    const valor = c.valor.trim().replace(/^[.,;:()[\]]+|[.,;:()[\]]+$/g, '');
    const chave = `${c.tipo}\u0000${valor}`;
    if (valor && !vistos.has(chave)) { vistos.add(chave); unicos.push({ tipo: c.tipo, valor }); }
  }
  return unicos;
}

const escapar = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// O literal está na fonte (já normalizada)? A citação, por inclusão. Os outros, inteiros: "2,5" não casa dentro de
// "12,5", "58:24" não casa dentro de "01:58:24", e o mês "2026-09" não casa como começo de "2026-09-24".
export function contem(fonte, c) {
  if (c.tipo === 'citação') return fonte.includes(c.valor);
  const antes = c.tipo === 'hora' ? '(?<![\\d.,:])' : '(?<![\\d.,])';
  let depois = c.tipo === 'hora' ? '(?![A-Za-z0-9]|[.,:]\\d|%)' : '(?![A-Za-z0-9]|[.,]\\d|%)';
  if (c.tipo === 'data' && /^\d{4}-\d{2}$/.test(c.valor)) depois = `(?!-\\d{2})${depois}`;
  return new RegExp(antes + escapar(c.valor) + depois).test(fonte);
}
