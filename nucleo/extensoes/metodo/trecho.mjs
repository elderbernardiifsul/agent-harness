// O trecho do método no AGENTS.md, entre marcas próprias (as do núcleo ficam intocadas). Resolve a dor de
// reinstalar sem duplicar o texto nem apagar o que o aluno escreveu fora das marcas. Mesmas regras do
// agentsComTrecho do núcleo (nucleo/comandos/init.mjs).
export const MARCA_INICIO = '<!-- agent-harness/metodo: início (o tools/ah metodo instalar reescreve este trecho; escreva fora das marcas) -->';
export const MARCA_FIM = '<!-- agent-harness/metodo: fim -->';
// Procura-se pelo começo da marca: a explicação entre parênteses pode mudar de uma versão para outra.
const INICIO = '<!-- agent-harness/metodo: início';

const ocorrencias = (texto, marca) => texto.split(marca).length - 1;

// {texto, aviso}. Só troca o trecho quando há exatamente um par de marcas, com o fim depois do início; sem marcas,
// acrescenta no fim; marca faltando ou repetida não reescreve nada do que existe: acrescenta o trecho novo no fim
// (uma vez só) e avisa. O fim de linha do arquivo (CRLF ou LF) é mantido.
export function comTrecho(atual, trecho) {
  if (atual === null) return { texto: trecho, aviso: null };
  const fimDeLinha = atual.includes('\r\n') ? '\r\n' : '\n';
  const novo = trecho.replace(/\r?\n/g, fimDeLinha);
  const acrescentado = () => `${atual}${atual === '' || atual.endsWith(fimDeLinha) ? '' : fimDeLinha}${atual === '' ? '' : fimDeLinha}${novo}`;
  const ini = ocorrencias(atual, INICIO);
  const fim = ocorrencias(atual, MARCA_FIM);
  if (ini === 0 && fim === 0) return { texto: acrescentado(), aviso: null };
  const i = atual.indexOf(INICIO);
  const f = atual.indexOf(MARCA_FIM);
  if (ini === 1 && fim === 1 && f > i) {
    let depois = f + MARCA_FIM.length;
    if (atual.startsWith(fimDeLinha, depois)) depois += fimDeLinha.length;
    return { texto: atual.slice(0, i) + novo + atual.slice(depois), aviso: null };
  }
  return {
    texto: atual.endsWith(novo) ? atual : acrescentado(),
    aviso: 'AGENTS.md tem as marcas do método incompletas ou repetidas; não mexi no que existe e acrescentei o trecho novo no fim.\nFaça: apague do AGENTS.md o trecho antigo do método e as marcas soltas, deixe só o trecho do fim e rode tools/ah metodo instalar de novo\n',
  };
}
