// Marca do comentário de fechamento: `<estado>/fechamentos/<nome>.json`, gravada pelo `ah close` fora da trava
// `frentes` (só o close com a marca `fechando` viva a grava), logo antes e logo depois de comentar nos tickets, por
// troca atômica de arquivo. Diz, mesmo quando o close para no meio (recusa, trava ocupada, processo morto), que os
// tickets podem já ter o comentário de fechamento: o close seguinte não comenta de novo, o quadro mostra
// `fechamento parado`, a herança não passa a frente e o handoff recusa. Sai junto com o registro da frente.
import fs from 'node:fs';
import path from 'node:path';
import { gravarJson, lerJson, validarNomeSeguro } from './estado.mjs';

const arquivo = (dirEstado, nome) => path.join(dirEstado, 'fechamentos', `${validarNomeSeguro(nome, 'Nome da frente')}.json`);

// `situacao`: 'comentando' (o close ia comentar e pode ter parado no meio) ou 'comentado'.
export function gravarFechamento(dirEstado, frente, situacao) {
  gravarJson(arquivo(dirEstado, frente.nome), { id: frente.id, nome: frente.nome, estado: frente.estado, situacao, em: new Date().toISOString() });
}

// A marca que vale para a frente: a do mesmo id e do mesmo estado (`ativa` ou `passada`) de quando o close comentou.
// A frente que mudou de estado depois do comentário (uma passagem chegou aos tickets depois dele) volta a pedir a
// conferência de quem a tem e o comentário. Sem marca, ou ilegível: null.
export function fechamentoDa(dirEstado, frente) {
  if (!frente?.nome || !frente.id) return null;
  let m;
  try { m = lerJson(arquivo(dirEstado, frente.nome), null); } catch { return null; }
  if (!m || m.id !== frente.id || m.estado !== frente.estado) return null;
  return m.situacao === 'comentado' || m.situacao === 'comentando' ? m : null;
}

// Tira a marca do nome; com `id`, só se ela for desse id (ou ilegível).
export function apagarFechamento(dirEstado, nome, id = undefined) {
  if (id !== undefined) {
    let m = null;
    try { m = lerJson(arquivo(dirEstado, nome), null); } catch { /* ilegível: sai */ }
    if (m && m.id !== id) return;
  }
  fs.rmSync(arquivo(dirEstado, nome), { force: true });
}
