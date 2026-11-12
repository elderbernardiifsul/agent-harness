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
});

const eObjeto = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const eTexto = v => typeof v === 'string' && v.length > 0;
const eTextoOuNulo = v => v === null || eTexto(v);
const eListaDeTextos = v => Array.isArray(v) && v.every(eTexto);

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
  extensoes: v => (eObjeto(v) ? null : 'deve ser um objeto'),
  fuso: v => (eTexto(v) ? null : 'deve ser um fuso como America/Sao_Paulo'),
  sessoes: {
    prazoDoSinalMin: v => (Number.isInteger(v) && v >= 1 && v <= 10080 ? null : 'deve ser um número inteiro de minutos, de 1 a 10080'),
  },
};

function conferir(obj, esquema, prefixo, erros) {
  for (const chave of Object.keys(obj)) {
    const campo = prefixo + chave;
    if (!(chave in esquema)) { erros.push({ campo, motivo: 'campo desconhecido' }); continue; }
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
