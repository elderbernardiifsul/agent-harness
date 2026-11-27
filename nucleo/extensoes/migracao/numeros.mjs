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

// Os renomes que põem as migrações da frente (`daFrente`, nomes em ordem) logo depois da última da base:
// [{de, para}], só com os que mudam. Lista vazia: já em dia. Troca só o número, no lugar do primeiro grupo do padrão.
export function planoDeRenumeracao(daFrente, ultima, padrao, digitos) {
  return daFrente.flatMap((de, i) => {
    const m = padrao.exec(de);
    const novo = ultima + 1 + i;
    if (Number.parseInt(m[1], 10) === novo) return [];
    const inicio = m.index + m[0].indexOf(m[1]);
    return [{ de, para: de.slice(0, inicio) + formatar(novo, digitos) + de.slice(inicio + m[1].length) }];
  });
}
