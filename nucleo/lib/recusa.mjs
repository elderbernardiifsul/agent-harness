// Formato único de recusa: o motivo em uma linha e a saída (o que fazer em vez daquilo).

export function recusa(trava, motivo, saida) {
  if (typeof saida !== 'string' || saida.trim() === '') {
    throw new Error(`recusa ${trava}: toda recusa precisa dizer a saída`);
  }
  return { permite: false, trava, motivo, saida };
}

export function textoDaRecusa(r) {
  return `Recusado (${r.trava}): ${r.motivo}\nFaça: ${r.saida}`;
}
