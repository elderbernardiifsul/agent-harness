// Números de migração: lidos dos nomes dos arquivos (`0003_frete.sql` → 3), sem depender de ferramenta de migração.
// Funções puras ou que recebem o `git` de fora, para o teste não precisar de projeto.
import path from 'node:path';

// O número do arquivo pelo primeiro grupo do padrão, ou null quando o nome não casa (README.md na pasta, por exemplo).
export function numeroDoArquivo(nome, padrao) {
  const m = padrao.exec(nome);
  return m ? Number.parseInt(m[1], 10) : null;
}

// As migrações do ramo `base`, em ordem: [{numero, arquivo}]. `git(args)` devolve {codigo, saida, erro}.
// Base sem a pasta: lista vazia. Base que não existe: lança, porque contar 0 daria número repetido.
export function migracoesDaBase(git, base, pasta, padrao) {
  const r = git(['ls-tree', '--name-only', `refs/heads/${base}`, '--', `${pasta}/`]);
  if (r.codigo !== 0) throw new Error(`não consegui ler ${pasta} no ramo ${base}: ${r.erro.trim()}`);
  return r.saida.split('\n').filter(Boolean).map(c => path.posix.basename(c))
    .map(arquivo => ({ numero: numeroDoArquivo(arquivo, padrao), arquivo }))
    .filter(m => m.numero !== null)
    .sort((a, b) => a.numero - b.numero || a.arquivo.localeCompare(b.arquivo));
}

export function ultimaDaBase(git, base, pasta, padrao) {
  return migracoesDaBase(git, base, pasta, padrao).at(-1)?.numero ?? 0;
}

// O próximo livre: depois da última da base e de toda reserva viva. A reserva é o número que a frente terá se a
// base receber as frentes na ordem das reservas.
export const proximoNumero = (ultima, reservas) => Math.max(ultima, ...reservas) + 1;

export const formatar = (n, digitos) => String(n).padStart(digitos, '0');

// Os números distintos, em ordem: o par up/down (`0003_frete.up.sql` e `0003_frete.down.sql`) é uma migração só.
const distintos = numeros => [...new Set(numeros)].sort((a, b) => a - b);

// A frente está em dia quando os números dela vêm depois da última da base, em sequência, e nenhum foi reservado
// por outra frente: então ninguém vai disputar esses números, e renumerar não muda nada.
export function emDia(numeros, ultima, outras) {
  const d = distintos(numeros);
  return d[0] > ultima && d.every((n, i) => n === d[0] + i && !outras.includes(n));
}

// Os renomes que põem as migrações da frente (`daFrente`, nomes em ordem) em sequência a partir de `inicio`:
// [{de, para}], só com os que mudam. Cada número distinto ganha um número novo, e os arquivos com o mesmo número
// (o par up/down) ganham o mesmo. Troca só o número, no lugar do primeiro grupo do padrão.
export function planoDeRenumeracao(daFrente, inicio, padrao, digitos) {
  const numeroDe = de => Number.parseInt(padrao.exec(de)[1], 10);
  const novos = new Map(distintos(daFrente.map(numeroDe)).map((n, i) => [n, inicio + i]));
  return daFrente.flatMap(de => {
    const m = padrao.exec(de);
    const novo = novos.get(Number.parseInt(m[1], 10));
    if (Number.parseInt(m[1], 10) === novo) return [];
    const pos = m.index + m[0].indexOf(m[1]);
    return [{ de, para: de.slice(0, pos) + formatar(novo, digitos) + de.slice(pos + m[1].length) }];
  });
}
