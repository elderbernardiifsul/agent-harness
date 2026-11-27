// Banco falso para os testes da extensão ambiente: cada banco é um arquivo vazio numa pasta.
// `node ambiente-banco-falso.mjs criar|apagar|listar <pasta> [<banco>]`. Criar banco que já existe sai 1 (como a
// ferramenta real costuma fazer); apagar banco inexistente sai 0; listar imprime um nome por linha.
// Com BANCO_FALSO_FALHA=1, toda chamada sai 1 (o banco desligado).
import fs from 'node:fs';
import path from 'node:path';

const [acao, pasta, banco] = process.argv.slice(2);
if (process.env.BANCO_FALSO_FALHA === '1') {
  process.stderr.write('banco falso: desligado\n');
  process.exit(1);
}
fs.mkdirSync(pasta, { recursive: true });
const arquivo = banco ? path.join(pasta, banco) : null;
if (acao === 'criar') {
  if (fs.existsSync(arquivo)) { process.stderr.write(`banco falso: ${banco} já existe\n`); process.exit(1); }
  fs.writeFileSync(arquivo, '');
} else if (acao === 'apagar') {
  fs.rmSync(arquivo, { force: true });
} else if (acao === 'listar') {
  for (const nome of fs.readdirSync(pasta).sort()) process.stdout.write(`${nome}\n`);
} else {
  process.stderr.write(`banco falso: ação desconhecida ${acao}\n`);
  process.exit(2);
}
