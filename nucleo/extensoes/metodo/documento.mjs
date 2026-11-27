// O documento do método no projeto (docs/agents/metodo.md), mantido pelo `metodo instalar` como as skills: escrito
// quando falta, reescrito quando continua igual ao que foi instalado, nunca por cima de uma mudança à mão.
// O hash ignora a diferença entre CRLF e LF: um checkout com core.autocrlf (comum no Windows) não é mudança à mão.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from './trava.mjs';

export const DOCUMENTO_DO_METODO = 'docs/agents/metodo.md';
// O texto que esta cópia do harness instala (muda com o tools/ah atualizar).
export const MODELO_DO_METODO = path.join(path.dirname(fileURLToPath(import.meta.url)), 'modelos', 'metodo.md');

export const hashDoDocumento = conteudo => sha256((Buffer.isBuffer(conteudo) ? conteudo.toString('utf8') : String(conteudo)).replace(/\r\n/g, '\n'));

// O que há no disco, sem seguir link simbólico: {tipo: 'ausente'|'link'|'arquivo'|'outro', hash?}.
export function lerDocumento(raiz, rel = DOCUMENTO_DO_METODO) {
  const abs = path.join(raiz, ...rel.split('/'));
  const st = fs.lstatSync(abs, { throwIfNoEntry: false });
  if (!st) return { tipo: 'ausente' };
  if (st.isSymbolicLink()) return { tipo: 'link' };
  if (!st.isFile()) return { tipo: 'outro' };
  return { tipo: 'arquivo', hash: hashDoDocumento(fs.readFileSync(abs)) };
}
