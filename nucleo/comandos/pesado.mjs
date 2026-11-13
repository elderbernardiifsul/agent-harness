// `ah pesado -- <comando>`: espera a vez na fila de trabalho pesado da máquina, roda o comando e devolve
// a saída e o código dele (desenho, seções 7 e 11; decisões no plano da fatia 3).
import os from 'node:os';
import { ErroDeUso } from '../lib/caminhos.mjs';
import { topoDe } from '../lib/git.mjs';
import { grupoDo, iniciar, matarArvore, sinalNoGrupo } from '../lib/arvore.mjs';
import {
  dirDaFila, lerConfigDaMaquina, classeDoComando, entrarNaFila, tentarComecar, sairDaFila, sairDaFilaSinc,
  memoriaLivreMb, vagasEfetivas, textoDoArgv, marcarGrupo, aninhamentoConferido,
} from '../lib/fila.mjs';
import { inicioDoProcesso } from '../lib/vida.mjs';
import { registrarEvento } from '../lib/estado.mjs';

export const descricao = 'roda um comando pela fila de trabalho pesado da máquina';
export const uso = `ah pesado -- <comando>        espera a vez, roda e devolve a saída e o código do comando
       ah pesado --classe <comando>  diz a classe do comando sem rodar

  Um argumento só depois do -- vai para o shell (ah pesado -- "npm run build && npm test");
  vários rodam direto, sem shell (ah pesado -- npm run build).
  Classes (quais comandos são pesados e quantas vagas pedem): pesado.classes em .harness/config.json;
  comando que não casa com nenhuma cai na mais restritiva.
  Vagas e memória livre mínima são da máquina: config.json na pasta da fila (AH_FILA, ou _fila na pasta
  de estado do harness), criado com os padrões na primeira chamada.
  Ao lado de outro trabalho, só com a memória livre mínima e sendo de outro worktree.
  Interrompido (Ctrl-C, SIGTERM), mata a árvore do comando antes de soltar a vaga.
  Dentro de um comando da fila (AH_PESADO_ANINHADO com a senha de um comando que está rodando), roda direto.`;
export const requisitos = { config: true, sessao: false, repositorio: true };

const MARCADOR = 'AH_PESADO_ANINHADO';
const PAUSA_PADRAO_MS = 100;
const LIMITE_DO_COMANDO = 300;
const SINAIS = ['SIGINT', 'SIGTERM', 'SIGHUP'];

const dormir = ms => new Promise(r => setTimeout(r, ms));
const codigoDoSinal = sinal => 128 + (os.constants.signals[sinal] ?? 0);

// Um argumento só: texto para o shell; vários: argv.
const comandoDe = resto => (resto.length === 1 ? resto[0] : resto);
const textoDe = comando => (Array.isArray(comando) ? textoDoArgv(comando) : comando);

function lerArgs(args) {
  if (args[0] === '--classe') {
    const resto = args[1] === '--' ? args.slice(2) : args.slice(1);
    if (!resto.length) throw new ErroDeUso('Falta o comando depois de --classe\nPróximo passo: use ah pesado --classe <comando>');
    return { modo: 'classe', comando: comandoDe(resto) };
  }
  const fim = args.indexOf('--');
  if (fim !== 0) {
    const motivo = fim < 0 ? 'Falta o -- antes do comando' : `Opção desconhecida: ${String(args[0]).slice(0, 40)}`;
    throw new ErroDeUso(`${motivo}\nPróximo passo: use ah pesado -- <comando> (ou ah pesado --help)`);
  }
  const resto = args.slice(1);
  if (!resto.length || (resto.length === 1 && resto[0].trim() === '')) throw new ErroDeUso('Falta o comando depois do --\nPróximo passo: use ah pesado -- <comando>');
  return { modo: 'rodar', comando: comandoDe(resto) };
}

// Roda e espera o fim: o código do comando, ou 128 + sinal quando ele morre por sinal.
function esperarFim(filho) {
  return new Promise(resolve => {
    filho.on('error', e => resolve({ erro: e }));
    filho.on('exit', (codigo, sinal) => resolve({ codigo: codigo ?? codigoDoSinal(sinal) }));
  });
}

// O comando nasce em grupo próprio: lendo de um terminal, pararia (SIGTTIN). Com terminal, a entrada fica
// fechada; com cano ou arquivo, é repassada.
const STDIO = () => [process.stdin.isTTY ? 'ignore' : 'inherit', 'inherit', 'inherit'];

async function rodarDireto(comando, amb) {
  const filho = iniciar(comando, { cwd: amb.cwd, env: amb.env, stdio: STDIO() });
  const r = await esperarFim(filho);
  if (r.erro) throw new ErroDeUso(`Não consegui rodar o comando: ${r.erro.message}\nPróximo passo: confira o nome do programa e o PATH`);
  return r.codigo;
}

export async function executar(args, amb) {
  const { modo, comando } = lerArgs(args);
  const classes = amb.config.pesado?.classes ?? {};
  const classe = classeDoComando(comando, classes);
  if (modo === 'classe') {
    const vagas = classe.vagas === 'todas' ? 'todas as vagas' : `${classe.vagas} vaga(s)`;
    const comoCaiu = Object.keys(classes).length === 0 ? 'o projeto não tem classes: tudo pede todas as vagas'
      : classe.reconhecido ? 'casou com um padrão' : 'não casou com nenhum padrão: vale a classe mais restritiva';
    amb.escrever(`${classe.nome} (${vagas}; ${comoCaiu})\n`);
    return 0;
  }
  const dir = dirDaFila(amb.env);
  // Aninhada só conferida: a senha do marcador está rodando na fila, com o `ah` dela vivo. Senão, entra na fila.
  if (amb.env[MARCADOR] && aninhamentoConferido(dir, amb.env[MARCADOR])) return rodarDireto(comando, amb);

  const maquina = lerConfigDaMaquina(dir);
  const pausaMs = Number(amb.env.AH_FILA_PAUSA_MS) > 0 ? Number(amb.env.AH_FILA_PAUSA_MS) : PAUSA_PADRAO_MS;
  const worktree = topoDe(amb.cwd, amb.env) ?? amb.cwd;
  const texto = textoDe(comando);
  let senha = null;
  let filho = null;
  let saindo = false;
  // Os sinais são tratados desde antes de entrar na fila: um Ctrl-C no meio da entrada também solta a senha.
  const entrada = entrarNaFila(dir, {
    pid: process.pid, inicio: inicioDoProcesso(process.pid), projeto: amb.config.projeto, worktree,
    comando: texto.length > LIMITE_DO_COMANDO ? `${texto.slice(0, LIMITE_DO_COMANDO - 1)}…` : texto,
    classe: classe.nome, vagas: classe.vagas, sessao: amb.sessaoId ?? null,
  });
  const aoSair = () => { if (senha != null) sairDaFilaSinc(dir, senha); };
  const aoSinal = async sinal => {
    if (saindo) return;
    saindo = true;
    try { await entrada; } catch { /* não entrou */ }
    amb.avisar(`ah pesado: ${sinal} recebido; ${filho ? 'matando a árvore do comando e ' : ''}soltando a vaga${senha != null ? ` (senha ${senha})` : ''}\n`);
    if (filho) await matarArvore(filho);
    if (senha != null) { try { await sairDaFila(dir, senha); } catch { /* sai no exit */ } }
    process.exit(codigoDoSinal(sinal));
  };
  for (const s of SINAIS) process.on(s, aoSinal);
  process.on('exit', aoSair);
  try {
    senha = await entrada;
  } catch (e) {
    for (const s of SINAIS) process.off(s, aoSinal);
    process.off('exit', aoSair);
    throw e;
  }
  if (saindo) return new Promise(() => {});

  try {
    let ultimoMotivo = null;
    const desde = Date.now();
    for (;;) {
      let r;
      try {
        r = await tentarComecar(dir, senha, { vagas: maquina.vagas, memoriaLivreMb: memoriaLivreMb(amb.env), memoriaLivreMinimaMb: maquina.memoriaLivreMinimaMb });
      } catch (e) {
        // Trava presa (um `ah` vivo demorando): para quem espera, é só mais espera.
        if (!e?.travaPresa) throw e;
        r = { pode: false, motivo: 'a trava da fila está presa' };
      }
      if (saindo) return new Promise(() => {});
      if (r.pode) break;
      if (r.motivo !== ultimoMotivo) {
        amb.avisar(`ah pesado: esperando a vez (senha ${senha}, classe ${classe.nome}): ${r.motivo}\n`);
        ultimoMotivo = r.motivo;
      }
      await dormir(pausaMs);
    }
    const esperaMs = Date.now() - desde;
    if (ultimoMotivo !== null) amb.avisar(`ah pesado: na vez depois de ${Math.round((Date.now() - desde) / 1000)} s (senha ${senha})\n`);
    const vagas = vagasEfetivas(classe.vagas, maquina.vagas);
    if (ultimoMotivo !== null || amb.env.AH_PESADO_VERBOSO) amb.avisar(`ah pesado: rodando (classe ${classe.nome}, ${vagas} de ${maquina.vagas} vaga(s))\n`);
    filho = iniciar(comando, { cwd: amb.cwd, env: { ...amb.env, [MARCADOR]: String(senha) }, stdio: STDIO() });
    const terminou = esperarFim(filho);
    const grupo = grupoDo(filho);
    // O grupo na entrada: se este `ah` morrer sem poder matar a árvore (SIGKILL), quem vier depois mata o órfão.
    // Sem a hora de início do líder, o grupo não é gravado: um órfão não seria morto, mas nada alheio o seria.
    const grupoInicio = grupo != null ? inicioDoProcesso(grupo) : null;
    if (grupoInicio != null) { try { await marcarGrupo(dir, senha, grupo, grupoInicio); } catch { /* sem o grupo, vale o pid do ah */ } }
    const fim = await terminou;
    if (saindo) return new Promise(() => {});
    // Netos deixados em segundo plano pelo comando saem com ele.
    sinalNoGrupo(grupo, 'SIGTERM');
    if (fim.erro) throw new ErroDeUso(`Não consegui rodar o comando: ${fim.erro.message}\nPróximo passo: confira o nome do programa e o PATH`);
    // Para medir (12.5): quanto esperou, quanto rodou. Falhar aqui não muda o resultado do comando.
    try {
      registrarEvento(amb.dirEstado, { tipo: 'pesado', sessao: amb.sessaoId ?? null, senha, classe: classe.nome, esperaMs, duracaoMs: Date.now() - desde - esperaMs, codigo: fim.codigo });
    } catch { /* sem registro */ }
    return fim.codigo;
  } finally {
    if (!saindo) {
      // Os tratadores saem só depois da vaga: um sinal no meio da saída ainda é tratado.
      try { await sairDaFila(dir, senha); } catch { /* sai no exit */ }
      for (const s of SINAIS) process.off(s, aoSinal);
      process.off('exit', aoSair);
    }
  }
}
