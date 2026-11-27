// Testes de contrato que todo adaptador de agente precisa passar (spec, seção 15). Parametrizado
// pelo adaptador e pelos exemplos de entrada dele; quem roda é teste/contrato-adaptadores.test.mjs.
// Cada falha diz, em português, o que falta no adaptador. Roteiro: docs/agentes/provar.md.
//
// `exemplos(cwd)` devolve as entradas cruas do agente (o JSON que o gancho recebe), já com a pasta
// `cwd` no lugar da pasta gravada:
//
//   {
//     inicio:   { novo, continuacao? },                     // começo de sessão
//     sinal:    [entrada, ...],                              // sinal de vida (pode ser vazio)
//     antes:    { recusado: {entrada, comando},              // comando que as travas recusam (git push origin main)
//                 permitido: {entrada, comando},             // comando que passa (git status)
//                 edicao?: {entrada, arquivo | arquivos} },  // edição de arquivo (ou de vários, num patch), se o agente a informa
//     fim:      { encerra, continua? },                      // fim de sessão; `continua`: fim que anuncia continuação
//     invalidas?: [{entrada, tipo}],                         // entradas que a tradução recusa, com o tipo provável
//   }
//
// Só os eventos que o adaptador declara em EVENTOS_ENTREGUES precisam de exemplo; os outros são
// a degradação declarada (registro.mjs, O_QUE_SE_PERDE).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVENTOS_DO_CONTRATO } from '../nucleo/adaptadores/registro.mjs';
import { respostaNaQuebra } from '../nucleo/adaptadores/contrato.mjs';
import { validarNomeSeguro, lerEventos } from '../nucleo/lib/estado.mjs';
import { lerSessao } from '../nucleo/lib/sessao.mjs';
import { criarProjeto, dirDoTeste } from './apoio/repo.mjs';

const RAIZ_HARNESS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const D = path.dirname(fileURLToPath(import.meta.url));
const eObjeto = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const MENSAGEM = 'Recusado (T5): teste de contrato.\nFaça: abra um PR para o ramo base';

// Traduz uma entrada; a falha vira mensagem que diz o evento e o motivo.
function traduzir(a, entrada, onde) {
  try {
    return a.traduzirEntrada(entrada);
  } catch (e) {
    assert.fail(`o adaptador ${a.AGENTE} não traduz o exemplo de ${onde}: ${e?.message ?? e}`);
  }
}

function conferirSessaoECwd(a, e, onde, cwd) {
  assert.ok(eObjeto(e), `o adaptador ${a.AGENTE} não devolve um objeto no evento ${onde} (traduzirEntrada devolveu ${typeof e})`);
  assert.ok(typeof e.sessao === 'string' && e.sessao !== '', `o adaptador ${a.AGENTE} não informa a sessão (campo sessao) no evento ${onde}`);
  assert.doesNotThrow(() => validarNomeSeguro(e.sessao, 'sessao'), `o adaptador ${a.AGENTE} deixa passar uma sessão que não serve de nome de arquivo no evento ${onde}: ${JSON.stringify(e.sessao).slice(0, 60)}`);
  assert.equal(e.cwd, cwd, `o adaptador ${a.AGENTE} não informa o diretório (campo cwd) no evento ${onde}`);
}

const saidaJunta = s => `${s?.saida ?? ''}\n${s?.erro ?? ''}`;

function conferirFormaDaSaida(a, s, onde) {
  assert.ok(eObjeto(s), `o adaptador ${a.AGENTE} não devolve {saida, erro, codigo} em traduzirSaida no evento ${onde}`);
  assert.equal(typeof s.saida, 'string', `o adaptador ${a.AGENTE} não devolve saida em texto em traduzirSaida no evento ${onde}`);
  assert.equal(typeof s.erro, 'string', `o adaptador ${a.AGENTE} não devolve erro em texto em traduzirSaida no evento ${onde}`);
  assert.ok(Number.isInteger(s.codigo), `o adaptador ${a.AGENTE} não devolve um código inteiro em traduzirSaida no evento ${onde}`);
}

// Registra os testes de contrato de um adaptador. `nome` é a chave no registro.
export function testarAdaptador(nome, a, exemplos) {
  const prefixo = `contrato do adaptador ${nome}:`;

  test(`${prefixo} exporta o que o gancho usa`, () => {
    assert.equal(a.AGENTE, nome, `o adaptador registrado como ${nome} exporta AGENTE = ${JSON.stringify(a.AGENTE)}; os dois têm de ser iguais`);
    for (const f of ['traduzirEntrada', 'traduzirSaida', 'tipoProvavel', 'acaoLeniente']) {
      assert.equal(typeof a[f], 'function', `o adaptador ${nome} não exporta a função ${f}`);
    }
    assert.ok(Array.isArray(a.EVENTOS_ENTREGUES), `o adaptador ${nome} não declara EVENTOS_ENTREGUES (a lista dos eventos do contrato que o agente dele entrega)`);
    for (const ev of a.EVENTOS_ENTREGUES) assert.ok(EVENTOS_DO_CONTRATO.includes(ev), `o adaptador ${nome} declara um evento que o contrato não tem: ${JSON.stringify(ev)} (os quatro são ${EVENTOS_DO_CONTRATO.join(', ')})`);
    const modelo = path.join(RAIZ_HARNESS, 'modelos', nome);
    assert.ok(fs.existsSync(modelo) && fs.readdirSync(modelo).length > 0, `o adaptador ${nome} não tem o arquivo de gancho em modelos/${nome}/ (o que o init copia para o projeto)`);
  });

  if (typeof exemplos !== 'function') {
    test(`${prefixo} tem exemplos gravados`, () => assert.fail(`o adaptador ${nome} não tem exemplos: crie teste/eventos-gravados/${nome}/exemplos.mjs exportando exemplos(cwd)`));
    return;
  }
  const ex = exemplos(D);
  const entrega = ev => Array.isArray(a.EVENTOS_ENTREGUES) && a.EVENTOS_ENTREGUES.includes(ev);

  for (const ev of EVENTOS_DO_CONTRATO) {
    if (!entrega(ev)) test(`${prefixo} não entrega o evento ${ev} (degradação declarada)`, t => t.diagnostic(`sem o evento ${ev}; veja docs/agentes/escrever-um-adaptador.md, "Quando falta um evento"`));
  }

  if (entrega('inicio')) {
    test(`${prefixo} começo de sessão`, () => {
      assert.ok(ex.inicio?.novo, `o adaptador ${nome} declara o evento inicio mas os exemplos não trazem inicio.novo`);
      const e = traduzir(a, ex.inicio.novo, 'começo de sessão');
      assert.equal(e?.tipo, 'inicio', `o adaptador ${nome} não traduz o começo de sessão para tipo 'inicio' (veio ${JSON.stringify(e?.tipo)})`);
      conferirSessaoECwd(a, e, 'começo de sessão', D);
      assert.equal(e.agente, nome, `o adaptador ${nome} não informa o agente (campo agente = ${JSON.stringify(nome)}) no começo de sessão`);
      assert.equal(e.origem, 'novo', `o adaptador ${nome} não informa origem 'novo' no começo de sessão novo (veio ${JSON.stringify(e.origem)})`);
      assert.ok(e.modelo == null || typeof e.modelo === 'string', `o adaptador ${nome} informa um modelo que não é texto nem nulo no começo de sessão`);
      if (ex.inicio.continuacao) {
        const c = traduzir(a, ex.inicio.continuacao, 'começo de sessão que continua outra');
        assert.equal(c?.origem, 'continuacao', `o adaptador ${nome} não informa origem 'continuacao' no começo de sessão que continua outra (compactada, limpa ou retomada)`);
      }
      const s = a.traduzirSaida(e, { contexto: 'RESUMO-DO-CONTRATO' });
      conferirFormaDaSaida(a, s, 'começo de sessão');
      assert.equal(s.codigo, 0, `o adaptador ${nome} sai com código ${s.codigo} no começo de sessão; tem de ser 0`);
      assert.match(s.saida, /RESUMO-DO-CONTRATO/, `o adaptador ${nome} não põe o resumo (contexto) na saída padrão no começo de sessão`);
    });
  }

  if (entrega('sinal')) {
    test(`${prefixo} sinal de vida`, () => {
      assert.ok(Array.isArray(ex.sinal) && ex.sinal.length, `o adaptador ${nome} declara o evento sinal mas os exemplos não trazem sinal: [entrada, ...]`);
      for (const entrada of ex.sinal) {
        const e = traduzir(a, entrada, 'sinal de vida');
        assert.equal(e?.tipo, 'sinal', `o adaptador ${nome} não traduz o sinal de vida para tipo 'sinal' (veio ${JSON.stringify(e?.tipo)})`);
        conferirSessaoECwd(a, e, 'sinal de vida', D);
        const s = a.traduzirSaida(e, {});
        conferirFormaDaSaida(a, s, 'sinal de vida');
        assert.equal(s.codigo, 0, `o adaptador ${nome} sai com código ${s.codigo} no sinal de vida; tem de ser 0 (o sinal nunca bloqueia o agente)`);
      }
    });
  }

  if (entrega('antes')) {
    test(`${prefixo} antes da ferramenta: comando`, () => {
      for (const caso of ['recusado', 'permitido']) {
        const ex_ = ex.antes?.[caso];
        assert.ok(ex_?.entrada && typeof ex_.comando === 'string', `o adaptador ${nome} declara o evento antes mas os exemplos não trazem antes.${caso} = {entrada, comando}`);
        const e = traduzir(a, ex_.entrada, `antes-da-ferramenta (${caso})`);
        assert.equal(e?.tipo, 'antes', `o adaptador ${nome} não traduz o evento antes-da-ferramenta para tipo 'antes' (veio ${JSON.stringify(e?.tipo)})`);
        conferirSessaoECwd(a, e, 'antes-da-ferramenta', D);
        assert.ok(eObjeto(e.acao), `o adaptador ${nome} não informa a ação (campo acao) no evento antes-da-ferramenta`);
        assert.equal(e.acao.tipo, 'comando', `o adaptador ${nome} não informa acao.tipo 'comando' para um comando de shell (veio ${JSON.stringify(e.acao.tipo)})`);
        assert.equal(e.acao.comando, ex_.comando, `o adaptador ${nome} não informa o texto do comando (acao.comando) no evento antes-da-ferramenta`);
        assert.ok(e.acao.shell === undefined || e.acao.shell === 'posix', `o adaptador ${nome} informa acao.shell = ${JSON.stringify(e.acao.shell)}; só vale 'posix' ou nada`);
        assert.deepEqual(a.acaoLeniente(ex_.entrada), e.acao, `o adaptador ${nome} não tira a mesma ação em acaoLeniente (usada quando o gancho quebra)`);
      }
    });

    test(`${prefixo} antes da ferramenta: recusa e permissão`, () => {
      const e = traduzir(a, ex.antes.recusado.entrada, 'antes-da-ferramenta');
      const recusa = a.traduzirSaida(e, { decisao: 'recusa', mensagem: MENSAGEM });
      const permite = a.traduzirSaida(e, { decisao: 'permite' });
      conferirFormaDaSaida(a, recusa, 'antes-da-ferramenta (recusa)');
      conferirFormaDaSaida(a, permite, 'antes-da-ferramenta (permite)');
      assert.equal(permite.codigo, 0, `o adaptador ${nome} sai com código ${permite.codigo} quando o núcleo permite; tem de ser 0`);
      assert.notDeepEqual(recusa, permite, `o adaptador ${nome} devolve a mesma saída para recusa e para permissão no evento antes-da-ferramenta`);
      const primeira = MENSAGEM.split('\n')[0];
      const junta = saidaJunta(recusa);
      assert.ok(junta.includes(primeira) || junta.includes(JSON.stringify(primeira).slice(1, -1)), `o adaptador ${nome} não leva a mensagem da recusa ao agente (nem na saída nem no erro)`);
    });

    if (ex.antes?.edicao) {
      test(`${prefixo} antes da ferramenta: edição`, () => {
        const e = traduzir(a, ex.antes.edicao.entrada, 'antes-da-ferramenta (edição)');
        conferirSessaoECwd(a, e, 'antes-da-ferramenta (edição)', D);
        assert.equal(e.acao?.tipo, 'edicao', `o adaptador ${nome} não informa acao.tipo 'edicao' para uma edição de arquivo`);
        // Um arquivo vem em acao.arquivo; uma ferramenta que escreve vários (patch), em acao.arquivos.
        const veio = Object.hasOwn(e.acao, 'arquivos') ? e.acao.arquivos : [e.acao.arquivo];
        assert.ok(Array.isArray(veio) && veio.length > 0 && veio.every(x => typeof x === 'string'), `o adaptador ${nome} não informa o arquivo (acao.arquivo, ou acao.arquivos no patch) na edição`);
        const esperado = ex.antes.edicao.arquivos ?? [ex.antes.edicao.arquivo];
        assert.deepEqual(veio.map(x => path.resolve(D, x)), esperado.map(x => path.resolve(D, x)), `o adaptador ${nome} informa o arquivo errado na edição (veio ${JSON.stringify(veio)})`);
      });
    }

    test(`${prefixo} gancho quebrado recusa no antes`, () => {
      const texto = JSON.stringify(ex.antes.recusado.entrada);
      assert.equal(a.tipoProvavel(texto.slice(0, -1)), 'antes', `o adaptador ${nome} não reconhece o evento antes-da-ferramenta num JSON cortado (tipoProvavel); sem isso, uma entrada quebrada passa sem trava`);
      assert.equal(a.tipoProvavel(ex.antes.recusado.entrada), 'antes', `o adaptador ${nome} não reconhece o evento antes-da-ferramenta pelo JSON (tipoProvavel)`);
      assert.equal(a.tipoProvavel('isto não é um evento'), 'desconhecido', `o adaptador ${nome} não devolve 'desconhecido' em tipoProvavel para texto que não é evento`);
      assert.equal(a.acaoLeniente('isto não é um evento'), null, `o adaptador ${nome} não devolve null em acaoLeniente para entrada que não serve`);
      const provavel = { tipo: 'antes', acao: null };
      const s = a.traduzirSaida(provavel, respostaNaQuebra(provavel, 'motivo de teste', { raiz: null, cwd: D }));
      assert.notEqual(s.codigo, 0, `o adaptador ${nome} não recusa (código diferente de 0) quando o gancho quebra no antes-da-ferramenta`);
      assert.match(saidaJunta(s), /T0/, `o adaptador ${nome} não leva a recusa T0 ao agente quando o gancho quebra`);
    });
  }

  if (entrega('fim')) {
    test(`${prefixo} fim de sessão`, () => {
      assert.ok(ex.fim?.encerra, `o adaptador ${nome} declara o evento fim mas os exemplos não trazem fim.encerra`);
      const e = traduzir(a, ex.fim.encerra, 'fim de sessão');
      assert.equal(e?.tipo, 'fim', `o adaptador ${nome} não traduz o fim de sessão para tipo 'fim' (veio ${JSON.stringify(e?.tipo)})`);
      conferirSessaoECwd(a, e, 'fim de sessão', D);
      assert.ok(e.continuacao === undefined || e.continuacao === false, `o adaptador ${nome} marca continuacao num fim que encerra`);
      if (ex.fim.continua) {
        const c = traduzir(a, ex.fim.continua, 'fim que anuncia continuação');
        assert.equal(c?.continuacao, true, `o adaptador ${nome} não informa continuacao: true no fim que anuncia uma sessão nova no mesmo processo`);
      }
      const s = a.traduzirSaida(e, {});
      conferirFormaDaSaida(a, s, 'fim de sessão');
      assert.equal(s.codigo, 0, `o adaptador ${nome} sai com código ${s.codigo} no fim de sessão; tem de ser 0`);
    });
  }

  test(`${prefixo} entrada que não serve lança com o tipo provável`, () => {
    const casos = [{ entrada: { campo: 'sem evento' }, tipo: 'desconhecido' }, ...(ex.invalidas ?? [])];
    for (const { entrada, tipo } of casos) {
      let erro = null;
      try { a.traduzirEntrada(entrada); } catch (e) { erro = e; }
      assert.ok(erro, `o adaptador ${nome} aceita uma entrada que não serve: ${JSON.stringify(entrada).slice(0, 80)}`);
      assert.equal(erro.tipo, tipo, `o adaptador ${nome} não diz o tipo provável (erro.tipo = ${JSON.stringify(tipo)}) ao recusar a entrada ${JSON.stringify(entrada).slice(0, 80)}`);
    }
    const s = a.traduzirSaida({ tipo: 'sinal' }, { aviso: 'Aviso: teste' });
    assert.equal(s.codigo, 0, `o adaptador ${nome} não sai com 0 quando o núcleo só avisa (fora do antes, o gancho quebrado nunca bloqueia)`);
    assert.match(saidaJunta(s), /Aviso: teste/, `o adaptador ${nome} não leva o aviso ao agente`);
  });

  // Ponta a ponta: o `ah gancho <nome>` num projeto de verdade, com os exemplos.
  test(`${prefixo} ponta a ponta pelo ah gancho ${nome}`, t => {
    const p = criarProjeto();
    t.after(() => p.limpar());
    const ex2 = exemplos(p.raiz);
    const gancho = entrada => p.ah(['gancho', nome], { entrada: typeof entrada === 'string' ? entrada : JSON.stringify(entrada) });
    let sessao = null;
    if (entrega('inicio')) {
      const r = gancho(ex2.inicio.novo);
      assert.equal(r.codigo, 0, `ah gancho ${nome} saiu com ${r.codigo} no começo de sessão: ${r.erro}`);
      assert.doesNotMatch(r.erro, /Aviso: o harness/, `ah gancho ${nome} quebrou no começo de sessão: ${r.erro}`);
      sessao = traduzir(a, ex2.inicio.novo, 'começo de sessão (ponta a ponta)').sessao;
      const s = lerSessao(dirDoTeste(p), sessao);
      assert.ok(s, `ah gancho ${nome} não registrou a sessão no começo de sessão (ela está registrada em gancho.mjs pelo registro.mjs?)`);
      assert.equal(s.agente, nome, `ah gancho ${nome} registrou a sessão com outro agente: ${JSON.stringify(s.agente)}`);
      assert.match(r.saida, /Sessão/, `ah gancho ${nome} não devolveu o resumo no começo de sessão`);
    }
    if (entrega('sinal') && ex2.sinal?.length) {
      const r = gancho(ex2.sinal[0]);
      assert.equal(r.codigo, 0, `ah gancho ${nome} saiu com ${r.codigo} no sinal de vida`);
      assert.doesNotMatch(r.erro, /Aviso: o harness/, `ah gancho ${nome} quebrou no sinal de vida: ${r.erro}`);
    }
    if (entrega('antes')) {
      const recusa = gancho(ex2.antes.recusado.entrada);
      const permite = gancho(ex2.antes.permitido.entrada);
      assert.doesNotMatch(saidaJunta(permite), /Recusado/, `ah gancho ${nome} recusou o comando permitido (${ex2.antes.permitido.comando}): ${saidaJunta(permite)}`);
      assert.match(saidaJunta(recusa), /Recusado \(T\d\)/, `ah gancho ${nome} não recusou o comando ${ex2.antes.recusado.comando}: ${saidaJunta(recusa)}`);
      assert.notDeepEqual([recusa.codigo, recusa.saida], [permite.codigo, permite.saida], `ah gancho ${nome} sai igual na recusa e na permissão; o agente não teria como distinguir`);
      const recusas = lerEventos(dirDoTeste(p)).filter(e => e.tipo === 'recusa');
      assert.ok(recusas.length >= 1, `ah gancho ${nome} recusou sem registrar a recusa em eventos.jsonl`);
      const quebrado = gancho(JSON.stringify(ex2.antes.recusado.entrada).slice(0, -1));
      assert.match(saidaJunta(quebrado), /Recusado \(T0\)/, `ah gancho ${nome} deixou passar um JSON cortado no antes-da-ferramenta (tem de recusar com T0)`);
    }
    if (entrega('fim')) {
      const r = gancho(ex2.fim.encerra);
      assert.equal(r.codigo, 0, `ah gancho ${nome} saiu com ${r.codigo} no fim de sessão`);
      const id = traduzir(a, ex2.fim.encerra, 'fim de sessão (ponta a ponta)').sessao;
      if (id === sessao) assert.ok(lerSessao(dirDoTeste(p), id)?.fim, `ah gancho ${nome} não encerrou a sessão no fim de sessão`);
    }
  });
}
