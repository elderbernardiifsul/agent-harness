// As skills que um texto do método cita. Resolve a dor de um texto que manda usar uma skill que o projeto não tem:
// o teste e o doctor comparam o que o texto cita com o que o método instala.
// Convenção de escrita: código inline de uma palavra só, em minúsculas (letras, dígitos e hífen, começando por
// letra), é nome de skill; todo o resto em código leva barra, ponto, espaço, dois-pontos ou sinal.

const NOME_DE_SKILL = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const CERCA = /^```[\s\S]*?^```/gm;
const CODIGO = /`([^`\n]+)`/g;
const PRIMEIRA_COLUNA = /^\|\s*`([a-z][a-z0-9-]*)`\s*\|/gm;

const unicas = lista => [...new Set(lista)];

// As skills citadas, sem repetição e em ordem alfabética; bloco cercado por ``` não conta.
export function skillsCitadas(texto) {
  const semCercas = texto.replace(CERCA, '');
  return unicas([...semCercas.matchAll(CODIGO)].map(m => m[1]).filter(c => NOME_DE_SKILL.test(c))).sort();
}

// A primeira coluna da tabela "Skill citada | Quem cita | No lugar" do trecho do AGENTS.md: as skills que as
// instaladas citam e que o projeto não tem de propósito.
export const skillsNoLugar = trecho => unicas([...trecho.matchAll(PRIMEIRA_COLUNA)].map(m => m[1]));

// As skills de todas as coleções de colecoes.json, a do harness inclusive.
export const skillsConhecidas = colecoes => new Set(Object.values(colecoes).flatMap(c => Object.keys(c.skills ?? {})));
