import { readFileSync } from 'node:fs';
import path from 'node:path';

export class ErroDeConfig extends Error {
  // `erros`: [{campo, motivo, codigo?}]; `codigo` é o do sistema (ENOENT…) quando o arquivo não foi lido.
  constructor(erros) {
    super(`Configuração inválida: ${erros.map(e => `${e.campo} (${e.motivo})`).join('; ')}`);
    this.name = 'ErroDeConfig';
    this.erros = erros;
  }
}

export const PADROES = Object.freeze({
  versaoDoEsquema: 1,
  harnessMinimo: '0.1.0',
  projeto: undefined,
  git: { base: 'dev', prefixo: 'feat/', protegidos: ['stage', 'main'], remoto: 'origin' },
  github: { repo: null, rotuloDeReserva: 'em-andamento' },
  worktrees: { dir: null },
  ci: { comandoDeTeste: null },
  agentes: ['claude-code'],
  extensoes: {},
  fuso: 'America/Sao_Paulo',
  sessoes: { prazoDoSinalMin: 120 },
  pesado: { classes: {} },
});

const eObjeto = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const eTexto = v => typeof v === 'string' && v.length > 0;
const eTextoOuNulo = v => v === null || eTexto(v);
const eListaDeTextos = v => Array.isArray(v) && v.every(eTexto);

const NOME_DE_CLASSE = /^[a-z0-9][a-z0-9-]*$/;
const MAX_VAGAS = 64;

// `pesado`: só `classes` é lida; chave que começa com `_` é comentário (o init instala `_exemplo`).
// Devolve a lista de erros ({campo, motivo}) com o campo completo.
function errosDoPesado(v) {
  if (!eObjeto(v)) return [{ campo: 'pesado', motivo: 'deve ser um objeto' }];
  const erros = [];
  for (const chave of Object.keys(v)) {
    if (chave.startsWith('_')) continue;
    if (chave !== 'classes') erros.push({ campo: `pesado.${chave}`, motivo: 'campo desconhecido (vagas e memória são da máquina, no config.json da fila)' });
  }
  if (!('classes' in v)) return erros;
  if (!eObjeto(v.classes)) return [...erros, { campo: 'pesado.classes', motivo: 'deve ser um objeto {nome: {vagas, padroes}}' }];
  for (const [nome, c] of Object.entries(v.classes)) {
    const campo = `pesado.classes.${nome}`;
    if (!NOME_DE_CLASSE.test(nome)) { erros.push({ campo, motivo: 'o nome da classe deve ter só minúsculas, números e hífen' }); continue; }
    if (!eObjeto(c)) { erros.push({ campo, motivo: 'deve ser um objeto {vagas, padroes}' }); continue; }
    for (const k of Object.keys(c)) if (k !== 'vagas' && k !== 'padroes') erros.push({ campo: `${campo}.${k}`, motivo: 'campo desconhecido' });
    if (!(c.vagas === 'todas' || (Number.isInteger(c.vagas) && c.vagas >= 1 && c.vagas <= MAX_VAGAS))) {
      erros.push({ campo: `${campo}.vagas`, motivo: `deve ser um inteiro de 1 a ${MAX_VAGAS} ou "todas"` });
    }
    if (!Array.isArray(c.padroes) || c.padroes.length === 0 || !c.padroes.every(p => typeof p === 'string' && p.trim() !== '')) {
      erros.push({ campo: `${campo}.padroes`, motivo: 'deve ser uma lista não vazia de comandos (ex.: "npm run build*")' });
    }
  }
  return erros;
}

// `extensoes`: {nome: true | false | {configuração da extensão}}. A configuração de cada uma quem valida é a
// própria extensão (validarConfig), na carga.
function errosDasExtensoes(v) {
  if (!eObjeto(v)) return 'deve ser um objeto {nome: true, false ou a configuração da extensão}';
  for (const [nome, valor] of Object.entries(v)) {
    if (!/^[a-z][a-z0-9-]*$/.test(nome)) return `nome de extensão inválido: ${nome.slice(0, 40)} (minúsculas, números e hífen, começando por letra)`;
    if (!(valor === true || valor === false || eObjeto(valor))) return `${nome} deve ser true, false ou um objeto com a configuração da extensão`;
  }
  return null;
}

// `fuso`: o nome IANA que o Intl aceita; conferir aqui evita que `deps`, `board --numeros` e o nome da
// frente caiam em "Erro inesperado" na primeira data formatada.
function errosDoFuso(v) {
  if (!eTexto(v)) return 'deve ser um fuso como America/Sao_Paulo';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: v });
    return null;
  } catch {
    return `fuso desconhecido: ${v.slice(0, 60)} (use um nome IANA como America/Sao_Paulo ou UTC)`;
  }
}

// Esquema: campo -> verificador (devolve motivo ou null) ou sub-esquema.
const ESQUEMA = {
  versaoDoEsquema: v => (v === 1 ? null : 'deve ser 1'),
  harnessMinimo: v => (typeof v === 'string' && /^\d+\.\d+\.\d+$/.test(v) ? null : 'deve ser uma versão como 0.1.0'),
  projeto: v => (typeof v === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(v) ? null : 'deve ter só minúsculas, números e hífen, começando por letra ou número'),
  git: {
    base: v => (eTexto(v) ? null : 'deve ser um nome de ramo'),
    prefixo: v => (typeof v === 'string' ? null : 'deve ser texto'),
    protegidos: v => (eListaDeTextos(v) ? null : 'deve ser uma lista de nomes de ramo'),
    remoto: v => (eTexto(v) ? null : 'deve ser o nome de um remoto'),
  },
  github: {
    repo: v => (eTextoOuNulo(v) ? null : 'deve ser texto ou nulo'),
    rotuloDeReserva: v => (eTexto(v) ? null : 'deve ser texto'),
  },
  worktrees: { dir: v => (eTextoOuNulo(v) ? null : 'deve ser um caminho ou nulo') },
  ci: { comandoDeTeste: v => (eTextoOuNulo(v) ? null : 'deve ser texto ou nulo') },
  agentes: v => (eListaDeTextos(v) ? null : 'deve ser uma lista de nomes'),
  extensoes: errosDasExtensoes,
  fuso: errosDoFuso,
  pesado: () => null, // conferido à parte (errosDoPesado)
  sessoes: {
    prazoDoSinalMin: v => (Number.isInteger(v) && v >= 1 && v <= 10080 ? null : 'deve ser um número inteiro de minutos, de 1 a 10080'),
  },
};

function conferir(obj, esquema, prefixo, erros) {
  for (const chave of Object.keys(obj)) {
    const campo = prefixo + chave;
    if (!(chave in esquema)) { erros.push({ campo, motivo: 'campo desconhecido' }); continue; }
    if (prefixo === '' && chave === 'pesado') { erros.push(...errosDoPesado(obj[chave])); continue; }
    const regra = esquema[chave];
    if (typeof regra === 'function') {
      const motivo = regra(obj[chave]);
      if (motivo) erros.push({ campo, motivo });
    } else if (!eObjeto(obj[chave])) {
      erros.push({ campo, motivo: 'deve ser um objeto' });
    } else {
      conferir(obj[chave], regra, `${campo}.`, erros);
    }
  }
}

export function validarConfig(obj) {
  const erros = [];
  if (!eObjeto(obj)) return { ok: false, erros: [{ campo: '(raiz)', motivo: 'deve ser um objeto' }] };
  conferir(obj, ESQUEMA, '', erros);
  if (!('projeto' in obj)) erros.push({ campo: 'projeto', motivo: 'obrigatório' });
  const base = obj.git?.base ?? PADROES.git.base;
  const protegidos = obj.git?.protegidos ?? PADROES.git.protegidos;
  if (typeof base === 'string' && Array.isArray(protegidos) && protegidos.includes(base)) {
    erros.push({ campo: 'git.base', motivo: 'o ramo base não pode estar entre os protegidos' });
  }
  return { ok: erros.length === 0, erros };
}

export function aplicarPadroes(obj) {
  const c = structuredClone(PADROES);
  for (const [chave, valor] of Object.entries(obj)) {
    c[chave] = eObjeto(valor) && eObjeto(c[chave]) && chave !== 'extensoes' ? { ...c[chave], ...valor } : valor;
  }
  return c;
}

export function carregarConfig(raiz) {
  const arquivo = path.join(raiz, '.harness', 'config.json');
  let obj;
  try {
    obj = JSON.parse(readFileSync(arquivo, 'utf8'));
  } catch (e) {
    throw new ErroDeConfig([{ campo: arquivo, motivo: `não consegui ler (${e.code ?? e.message})`, codigo: e.code ?? null }]);
  }
  const v = validarConfig(obj);
  if (!v.ok) throw new ErroDeConfig(v.erros);
  return aplicarPadroes(obj);
}

// O erro diz só que o arquivo de configuração não existe.
export const configAusente = e => e instanceof ErroDeConfig && e.erros.length > 0 && e.erros.every(x => x.codigo === 'ENOENT');
