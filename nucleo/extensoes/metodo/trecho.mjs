// O trecho do método no AGENTS.md, entre marcas próprias (as do núcleo ficam intocadas). Resolve a dor de
// reinstalar sem duplicar o texto nem apagar o que o aluno escreveu fora das marcas. As regras são as do trecho do
// núcleo (trechoEntreMarcas, em nucleo/comandos/init.mjs).
import { trechoEntreMarcas } from '../../comandos/init.mjs';

export const MARCA_INICIO = '<!-- agent-harness/metodo: início (o tools/ah metodo instalar reescreve este trecho; escreva fora das marcas) -->';
export const MARCA_FIM = '<!-- agent-harness/metodo: fim -->';

// {texto, aviso}. Procura-se pelo começo da marca de início: a explicação entre parênteses pode mudar.
export const comTrecho = (atual, trecho) => trechoEntreMarcas(atual, trecho, {
  inicio: '<!-- agent-harness/metodo: início', fim: MARCA_FIM, arquivo: 'AGENTS.md', dono: 'do método', comando: 'tools/ah metodo instalar',
});
