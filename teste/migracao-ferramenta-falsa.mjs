// Passo falso de uma ferramenta de migração, para os testes do `ah migracao renumerar`:
// `node migracao-ferramenta-falsa.mjs <registro> <de> <para>` acrescenta "<de> -> <para>" ao arquivo de registro.
// Com MIGRACAO_FALSA_FALHA=1, sai com 1 sem registrar (a ferramenta que falha no meio).
import fs from 'node:fs';

const [registro, de, para] = process.argv.slice(2);
if (process.env.MIGRACAO_FALSA_FALHA === '1') {
  process.stderr.write('ferramenta falsa: falhou de propósito\n');
  process.exit(1);
}
fs.appendFileSync(registro, `${de} -> ${para}\n`);
