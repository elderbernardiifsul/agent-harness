// Desenha uma tela do vídeo a partir da cena, do passo e do tempo t (segundos desde o começo do passo).
// Tudo é função de (cena, passo, t): o gerador pede cada quadro com window.mostrar(...) e captura.
(function () {
  'use strict';
  const FADE = 0.4;
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const suave = x => { x = clamp(x); return x * x * (3 - 2 * x); };
  const fase = (t, a, b) => suave((t - a) / (b - a));
  const lerp = (a, b, k) => a + (b - a) * k;
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Quantos elementos o passo mostra (campo `ate`, padrão: índice + 1) e quantos o anterior mostrava.
  function visiveis(cena, i, campo = 'ate') {
    const v = p => (p && p[campo] !== undefined ? p[campo] : null);
    const atual = v(cena.passos[i]) ?? i + 1;
    let ant = 0;
    if (i > 0) ant = v(cena.passos[i - 1]) ?? i;
    return { atual, ant };
  }
  // O diagrama só anima no passo que declara `anim`; nos outros, mostra o estado final.
  const tDiag = (p, t) => (p.anim !== undefined ? t : 99);
  const opac = (k, vis, t) => (k >= vis.ant && k < vis.atual && vis.ant > 0 ? clamp(t / FADE) : 1);

  function cabecalho(cena) {
    let h = '';
    if (cena.rotulo) h += `<p class="rotulo">${esc(cena.rotulo)}</p>`;
    if (cena.titulo) h += `<h2>${esc(cena.titulo)}</h2>`;
    return `<header style="display:flex;flex-direction:column;gap:10px">${h}</header>`;
  }

  const TIPOS = {
    capa(cena) {
      return `<section class="capa" style="display:flex;flex-direction:column;flex:1;justify-content:center;gap:36px">
        ${cena.rotulo ? `<p class="rotulo">${esc(cena.rotulo)}</p>` : ''}
        <h1 style="${cena.tituloTam ? `font-size:${cena.tituloTam}px` : ''}">${esc(cena.titulo)}</h1>
        ${cena.sub ? `<p class="sub" style="margin:0">${esc(cena.sub)}</p>` : ''}
        ${cena.endereco ? `<p class="endereco" style="margin:0">${esc(cena.endereco)}</p>` : ''}
      </section>`;
    },

    lista(cena, i, t) {
      const vis = visiveis(cena, i);
      const p = cena.passos[i];
      const itens = cena.itens.map((it, k) => {
        if (k >= vis.atual) return '';
        const o = opac(k, vis, t);
        const num = cena.numerada === false ? '•' : (it.n ?? k + 1);
        return `<li style="opacity:${o}"><span class="num">${esc(num)}</span><span class="t">${it.t}</span>${it.c ? `<span class="c">${it.c}</span>` : ''}</li>`;
      }).join('');
      let nota = '';
      if (p.nota) {
        const novo = !(i > 0 && cena.passos[i - 1].nota === p.nota);
        nota = `<p class="nota-rodape ${p.notaAviso ? 'aviso' : ''}" style="opacity:${novo && i > 0 ? clamp(t / FADE) : 1}">${p.nota}</p>`;
      }
      return cabecalho(cena) + `<ul class="lista ${cena.compacta ? 'compacta' : ''}">${itens}</ul>` + nota;
    },

    duas(cena, i, t) {
      const vis = visiveis(cena, i);
      const cols = cena.colunas.map((c, k) => {
        const o = k < vis.atual ? opac(k, vis, t) : 0;
        return `<div class="cartao ${c.acento ? 'a' : ''}" style="opacity:${o}">
          <h3>${esc(c.titulo)}</h3>${c.sub ? `<p class="sub">${esc(c.sub)}</p>` : ''}
          <ul>${c.itens.map(x => `<li>${x}</li>`).join('')}</ul></div>`;
      }).join('');
      const p = cena.passos[i];
      const nota = p.nota ? `<p class="nota-rodape" style="margin-top:0">${p.nota}</p>` : '';
      return cabecalho(cena) + `<div class="duas">${cols}</div>` + nota;
    },

    mecanismo(cena, i, t) {
      const p = cena.passos[i];
      const vis = visiveis(cena, i, 'custos');
      const fig = cena.diagrama ? `<div class="figura">${DIAGRAMAS[cena.diagrama](p.fase ?? i, tDiag(p, t))}</div>` : '';
      const ex = cena.exemplo ? `<div class="terminal exemplo"><pre>${linhasDoTerminal(cena.exemplo, cena.exemplo.marcas || [])}</pre></div>` : '';
      const custos = (cena.custos || []).map((c, k) => {
        if (k >= vis.atual) return '';
        const o = opac(k, vis, t);
        return `<span class="k ${c.w ? 'w' : ''}" style="opacity:${o}">${esc(c.k)}</span><span style="opacity:${o}">${c.v}</span>`;
      }).join('');
      return cabecalho(cena) + fig + (custos ? `<div class="custos">${custos}</div>` : '') + ex;
    },

    diagrama(cena, i, t) {
      const p = cena.passos[i];
      return cabecalho(cena) + `<div class="figura">${DIAGRAMAS[cena.diagrama](p.fase ?? i, tDiag(p, t))}</div>`;
    },

    terminal(cena, i, t) {
      const p = cena.passos[i];
      const vis = visiveis(cena, i);
      const blocos = cena.blocos.map((b, k) => {
        if (k >= vis.atual) return '';
        const o = opac(k, vis, t);
        const marcas = (p.marcas && p.marcas[k]) || b.marcas || [];
        return `<div class="bloco" data-k="${k}" style="opacity:${o}"><pre>${linhasDoTerminal(b, marcas)}</pre></div>`;
      }).join('');
      const leg = p.legenda ? `<p class="legenda-tela" style="margin:0">${p.legenda}</p>` : '';
      return cabecalho(cena) + `<div class="terminal">${blocos}</div>` + leg;
    },

    arvore(cena, i, t) {
      const vis = visiveis(cena, i);
      const larg = Math.max(...cena.linhas.map(l => l.txt.length));
      const linhas = cena.linhas.map((l, k) => {
        if (k >= vis.atual) return '';
        const o = opac(k, vis, t);
        const pad = ' '.repeat(larg - l.txt.length + 3);
        return `<span style="opacity:${o}"><span class="${l.dir ? 'd' : ''}">${esc(l.txt)}</span>${l.c ? `${pad}<span class="c">${esc(l.c)}</span>` : ''}</span>`;
      }).join('\n');
      const p = cena.passos[i];
      const nota = p.nota ? `<p class="nota-rodape" style="opacity:${i > 0 && cena.passos[i - 1].nota !== p.nota ? clamp(t / FADE) : 1}">${p.nota}</p>` : '';
      return cabecalho(cena) + `<div class="arvore terminal" style="flex:0 0 auto"><pre>${linhas}</pre></div>` + nota;
    },

    codigo(cena, i, t) {
      const p = cena.passos[i];
      const [a, b] = p.marca || [-1, -1];
      const linhas = cena.texto.split('\n').map((l, k) => {
        const n = String(cena.inicio + k).padStart(3, ' ');
        const m = k + cena.inicio >= a && k + cena.inicio <= b;
        return `<span class="lin ${m ? 'marca' : ''}"><span style="color:var(--empty)">${n}</span><span>${esc(l)}</span></span>`;
      }).join('');
      const leg = p.legenda ? `<p class="legenda-tela" style="margin:0">${p.legenda}</p>` : '';
      return cabecalho(cena) + `<div class="codigo terminal"><p class="arq" style="margin:0 0 14px">${esc(cena.arquivo)}</p><pre>${linhas}</pre></div>` + leg;
    },
  };

  function linhasDoTerminal(b, marcas) {
    return b.texto.split('\n').map(l => {
      let cls = 'out';
      let corpo = esc(l);
      if (l.startsWith('$ ')) { cls = 'cmd'; corpo = `<span class="p">$</span> ${esc(l.slice(2))}`; }
      else if (/^Recusado/.test(l)) cls = 'rec';
      else if (/^Faça:/.test(l)) cls = 'faca';
      else if (/^\[código/.test(l)) cls = 'cod';
      else if (/^ok {2,}/.test(l)) cls = 'ok';
      else if (/^aviso {2,}|^Aviso:/.test(l)) cls = 'av';
      else if (/^…$/.test(l)) cls = 'omitido';
      else if (/^# /.test(l)) { cls = 'comentario'; corpo = esc(l.slice(2)); }
      const m = marcas.find(x => l.includes(x.replace(/^!/, '')));
      const mc = m ? ` marca${m.startsWith('!') ? ' w' : ''}` : '';
      return `<span class="${cls}${mc}">${corpo}</span>`;
    }).join('\n');
  }

  // ------------------------------------------------------------------ diagramas
  const MARC = `<defs>
    <marker id="pm" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#9ba49f"/></marker>
    <marker id="pa" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#5fc28c"/></marker>
    <marker id="pw" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#e0a54a"/></marker>
  </defs>`;
  const svg = (w, h, corpo) => `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">${MARC}${corpo}</svg>`;
  const caixa = (x, y, w, h, cls, o = 1) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" class="${cls}" opacity="${o}"/>`;
  const texto = (x, y, s, { tam = 34, cls = '', anc = 'middle', o = 1, peso = '' } = {}) =>
    `<text x="${x}" y="${y}" font-size="${tam}" text-anchor="${anc}" class="${cls}" opacity="${o}" ${peso ? `font-weight="${peso}"` : ''}>${esc(s)}</text>`;
  const linha = (x1, y1, x2, y2, cls, marc, extra = '') =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${cls}" ${marc ? `marker-end="url(#${marc})"` : ''} ${extra}/>`;
  // Linha que se desenha de 0 a k (0..1).
  const linhaParcial = (x1, y1, x2, y2, k, cls, marc) => {
    if (k <= 0) return '';
    return linha(x1, y1, lerp(x1, x2, k), lerp(y1, y2, k), cls, k > 0.98 ? marc : null);
  };

  const DIAGRAMAS = {
    // Laço do agente: um ponto percorre contexto → modelo → ferramenta → contexto.
    laco(f, t) {
      const B = { ctx: [110, 400, 420, 170], mod: [630, 40, 420, 170], fer: [1150, 400, 420, 170] };
      const arcos = [
        { d: 'M 320 400 C 320 230 450 125 630 125', rot: '', },
        { d: 'M 1050 125 C 1230 125 1360 230 1360 400', rot: 'pede uma ferramenta' },
        { d: 'M 1150 485 L 530 485', rot: '' },
      ];
      // Ciclo: caixa (0,8 s) e arco (1,0 s), três vezes.
      const P = 5.4, u = (t % P);
      const seq = ['ctx', 0, 'mod', 1, 'fer', 2];
      let acum = 0, ativo = null, arco = -1, kArco = 0;
      for (const s of seq) {
        const dur = typeof s === 'string' ? 0.8 : 1.0;
        if (u < acum + dur) { if (typeof s === 'string') ativo = s; else { arco = s; kArco = (u - acum) / dur; } break; }
        acum += dur;
      }
      if (f > 0) { ativo = null; arco = -1; }
      const box = (id, tit, sub) => {
        const [x, y, w, h] = B[id];
        return caixa(x, y, w, h, ativo === id ? 'caixa-a' : 'caixa') +
          texto(x + w / 2, y + 72, tit, { tam: 44, peso: 700 }) + texto(x + w / 2, y + 122, sub, { tam: 30, cls: 't-muted' });
      };
      let c = box('ctx', 'contexto', 'pedido, arquivos, resultados') + box('mod', 'modelo', 'escolhe o próximo passo') +
        box('fer', 'ferramenta', 'o programa executa');
      arcos.forEach((a, k) => { c += `<path id="arco${k}" d="${a.d}" class="${arco === k ? 'seta-a' : 'seta'}" marker-end="url(#${arco === k ? 'pa' : 'pm'})"/>`; });
      c += texto(1330, 230, 'pede uma ferramenta', { tam: 30, cls: 't-muted', anc: 'start' });
      c += texto(840, 535, 'o resultado volta ao contexto', { tam: 30, cls: 't-muted' });
      c += texto(840, 690, 'resposta sem pedido de ferramenta: fim do laço', { tam: 32, cls: 't-muted' });
      if (arco >= 0) c += `<circle id="ponto" r="16" fill="#5fc28c" data-arco="${arco}" data-k="${kArco.toFixed(4)}"/>`;
      return svg(1680, 740, c);
    },

    // Três terminais numa pasta; no passo 1, a colisão.
    colisao(f, t) {
      const terms = [['terminal 1', 'agente do carrinho'], ['terminal 2', 'agente do cupom'], ['terminal 3', 'agente do frete']];
      const tx = [60, 620, 1180];
      const k0 = f === 0 ? fase(t, 0.2, 1.6) : 1;
      const meio = f === 1 ? fase(t, 0.3, 1.0) : 0;          // total.js fica pela metade
      const voa = f === 1 ? fase(t, 1.4, 3.0) : 0;            // o commit do cupom leva o arquivo
      const troca = f === 1 ? fase(t, 4.0, 4.6) : 0;          // o frete troca de ramo
      let c = '';
      terms.forEach(([a, b], k) => {
        const errado = troca > 0.5 && k < 2;
        c += caixa(tx[k], 10, 440, 140, errado ? 'caixa-w' : 'caixa') + texto(tx[k] + 220, 66, a, { tam: 30, cls: 't-muted' }) +
          texto(tx[k] + 220, 114, b, { tam: 38, peso: 700 });
        c += linhaParcial(tx[k] + 220, 150, [470, 670, 870][k], 318, k0, errado ? 'seta-w' : 'seta', errado ? 'pw' : 'pm');
      });
      c += caixa(160, 320, 1020, 410, 'caixa');
      c += texto(200, 378, 'loja/  ·  uma pasta de trabalho', { tam: 38, anc: 'start', peso: 700 });
      c += texto(200, 448, 'ramo em uso:', { tam: 32, anc: 'start', cls: 't-muted' });
      const ramo = troca > 0.5 ? 'feat/frete' : 'dev';
      c += caixa(410, 412, 270, 52, troca > 0.5 ? 'caixa-w' : 'caixa-a');
      c += texto(545, 448, ramo, { tam: 32, cls: 'mono' });
      c += texto(200, 515, 'índice (área do próximo commit): um só', { tam: 32, anc: 'start', cls: 't-muted' });
      const arqs = ['src/total.js', 'src/cupom.js', 'src/frete.js'];
      arqs.forEach((a, k) => {
        const x = 200 + k * 320, y = 570;
        const w = k === 0 && meio > 0.5;
        c += caixa(x, y, 290, 60, w ? 'caixa-w' : 'caixa') + texto(x + 145, y + 40, a, { tam: 30, cls: 'mono' });
      });
      if (meio > 0) c += texto(345, 680, 'editado pela metade', { tam: 28, cls: 't-warn', o: meio });
      if (voa > 0) {
        const x = lerp(200, 695, voa), y = lerp(570, 160, voa);
        c += caixa(x, y, 290, 60, 'caixa-w', 0.95) + texto(x + 145, y + 40, 'src/total.js', { tam: 30, cls: 'mono' });
      }
      if (voa >= 1) {
        const o = fase(t, 3.0, 3.4);
        c += texto(1220, 580, 'cupom: git add -A', { tam: 30, cls: 't-warn mono', anc: 'start', o });
        c += texto(1220, 622, 'o commit leva o total.js', { tam: 30, cls: 't-warn', anc: 'start', o });
      }
      if (troca > 0) {
        c += texto(1220, 430, 'frete: git switch', { tam: 30, cls: 't-warn mono', anc: 'start', o: troca });
        c += texto(1220, 472, 'o ramo muda para todos', { tam: 30, cls: 't-warn', anc: 'start', o: troca });
      }
      return svg(1680, 740, c);
    },

    // Uma pasta vira uma pasta principal e um worktree por frente.
    worktrees(f, t) {
      const k = fase(t, 0.9, 2.0);
      const alvo = [[450, 'wt/carrinho', 'feat/carrinho'], [880, 'wt/cupom', 'feat/cupom'], [1310, 'wt/frete', 'feat/frete']];
      let c = '';
      alvo.forEach(([x, , ], i) => {
        c += caixa(x, 0, 360, 84, 'caixa') + texto(x + 180, 54, ['carrinho', 'cupom', 'frete'][i], { tam: 34, peso: 700 });
        c += linha(x + 180, 84, x + 180, 186, 'seta', 'pm');
      });
      // Caixa única que se divide.
      const sai = 1 - fase(t, 0.5, 0.9);   // o rótulo da pasta única some antes da divisão
      const entra = fase(t, 1.8, 2.3);      // os rótulos novos entram depois da divisão
      if (k < 1) {
        c += caixa(450, 190, 1220, 210, 'caixa', 1 - k);
        c += texto(1060, 300, 'loja/  ·  uma pasta, um ramo, um índice', { tam: 36, o: sai, peso: 700 });
      }
      alvo.forEach(([x, nome, ramo], i) => {
        const x0 = 450 + i * 0, w0 = 1220;
        const xx = lerp(x0, x, k), ww = lerp(w0, 360, k);
        c += caixa(xx, 190, ww, 210, 'caixa-a', k);
        c += texto(x + 180, 262, nome, { tam: 34, peso: 700, o: entra, cls: 'mono' });
        c += texto(x + 180, 316, ramo, { tam: 30, o: entra, cls: 'mono t-acc' });
        c += texto(x + 180, 366, 'ramo e índice próprios', { tam: 26, o: entra, cls: 't-muted' });
      });
      c += caixa(20, 190, 380, 210, 'caixa', k);
      c += texto(210, 262, 'loja/', { tam: 34, peso: 700, o: entra, cls: 'mono' });
      c += texto(210, 316, 'dev', { tam: 30, o: entra, cls: 'mono t-acc' });
      c += texto(210, 366, 'pasta principal: integrar', { tam: 26, o: entra, cls: 't-muted' });
      c += caixa(20, 440, 1650, 90, 'caixa', fase(t, 2.2, 2.6));
      c += texto(845, 497, 'um repositório: o histórico é o mesmo; o git recusa o mesmo ramo em duas pastas', { tam: 30, o: fase(t, 2.2, 2.6) });
      return svg(1690, 540, c);
    },

    // Duas reservas no mesmo ticket; a ordem do servidor decide.
    reserva(f, t) {
      let c = '';
      const ana = [20, 60, 400, 230], carla = [1270, 60, 400, 230];
      const slots = [[530, 100], [530, 230], [530, 360]];
      const ganha = fase(t, 4.0, 4.4);
      const desiste = fase(t, 5.0, 5.8);
      const statusAna = ganha > 0.5 ? ['fica com o #2', 't-acc'] : (t > 0.3 ? ['lê o #2: livre', 't-muted'] : ['', '']);
      const statusCarla = desiste > 0.9 ? ['desfaz; não cria worktree', 't-warn'] : ganha > 0.5 ? ['perdeu: desiste', 't-warn'] : (t > 0.3 ? ['lê o #2: livre', 't-muted'] : ['', '']);
      [[ana, 'Ana', 'relógio 09:00:02', statusAna, ganha > 0.5 ? 'caixa-a' : 'caixa'],
        [carla, 'Carla', 'relógio 09:00:01', statusCarla, ganha > 0.5 ? 'caixa-w' : 'caixa']].forEach(([b, nome, rel, st, cls]) => {
        const [x, y, w, h] = b;
        c += caixa(x, y, w, h, cls) + texto(x + w / 2, y + 62, `máquina da ${nome}`, { tam: 34, peso: 700 }) +
          texto(x + w / 2, y + 112, rel, { tam: 28, cls: 't-muted mono' }) +
          texto(x + w / 2, y + 180, st[0], { tam: 30, cls: st[1] });
      });
      c += texto(220, 345, 'o relógio não decide', { tam: 26, cls: 't-muted' });
      c += texto(1470, 345, 'o relógio não decide', { tam: 26, cls: 't-muted' });
      c += caixa(500, 0, 680, 500, 'caixa');
      c += texto(840, 60, 'ticket #2 · comentários', { tam: 34, peso: 700 });
      slots.forEach(([x, y]) => { c += `<rect x="${x}" y="${y}" width="620" height="100" rx="12" fill="none" stroke="#48504b" stroke-dasharray="8 8" stroke-width="2"/>`; });
      const chip = (de, slot, k, rot, cls) => {
        if (k <= 0) return '';
        const [sx, sy] = slots[slot];
        const x = lerp(de[0] + 40, sx, k), y = lerp(de[1] + 60, sy, k);
        return caixa(x, y, 620, 100, cls) + texto(x + 310, y + 62, rot, { tam: 30 });
      };
      c += chip(ana, 0, fase(t, 1.0, 1.8), '1º · reserva de Ana (frente as-1)', ganha > 0.5 ? 'caixa-a' : 'caixa');
      c += chip(carla, 1, fase(t, 1.4, 2.2), '2º · reserva de Carla (frente cd-4)', 'caixa');
      c += chip(carla, 2, desiste, '3º · desistência de Carla', 'caixa-w');
      const rel = fase(t, 3.0, 3.6);
      if (rel > 0 && ganha < 1) {
        c += linhaParcial(500, 200, 420, 200, rel, 'seta-a', 'pa') + linhaParcial(1180, 280, 1270, 280, rel, 'seta-a', 'pa');
        c += texto(840, 560, 'cada uma relê o ticket', { tam: 30, cls: 't-acc', o: rel });
      }
      if (ganha > 0) c += texto(840, 560, 'vence o comentário mais antigo no servidor', { tam: 30, cls: 't-acc', o: ganha });
      return svg(1690, 580, c);
    },

    // Fase 0: sinal de vida que para e prazo que vence. Fase 1: passagem com nota.
    vida(f, t) {
      let c = '';
      const ta = f === 0 ? t : 99;
      const tb = f === 1 ? t : (f > 1 ? 99 : -1);
      // Linha A
      c += texto(20, 40, 'sessão que morre', { tam: 30, cls: 't-muted', anc: 'start', peso: 600 });
      c += caixa(20, 60, 300, 120, 'caixa') + texto(170, 133, 'ana-term', { tam: 34, cls: 'mono', peso: 700 });
      c += linha(340, 120, 1150, 120, 'seta', null, 'stroke-dasharray="4 10"');
      const nTicks = 6;
      for (let k = 0; k < nTicks; k++) {
        const tk = 0.2 + k * 0.35;
        if (ta < tk) break;
        const x = 360 + k * 50;
        c += `<rect x="${x}" y="98" width="14" height="44" rx="4" fill="#5fc28c" opacity="${fase(ta, tk, tk + 0.15)}"/>`;
      }
      if (ta > 0.3) c += texto(360, 85, 'sinal de vida a cada ação', { tam: 26, cls: 't-acc', anc: 'start' });
      const morre = fase(ta, 2.4, 2.7);
      if (morre > 0) c += texto(700, 85, '✕ o processo some', { tam: 28, cls: 't-warn', anc: 'start', o: morre });
      const prazo = fase(ta, 2.9, 5.6);
      if (prazo > 0) {
        c += `<rect x="360" y="160" width="${lerp(0, 790, prazo)}" height="22" rx="6" fill="#e0a54a" opacity="0.85"/>`;
        c += texto(360, 222, 'prazo do sinal: 120 min (sessoes.prazoDoSinalMin)', { tam: 26, cls: 't-warn', anc: 'start' });
      }
      const orfa = fase(ta, 5.6, 6.0);
      c += caixa(1190, 60, 480, 120, orfa > 0.5 ? 'caixa-w' : 'caixa-a');
      c += texto(1430, 112, 'frente carrinho', { tam: 32, peso: 700 });
      c += texto(1430, 156, orfa > 0.5 ? 'órfã' : 'ativa', { tam: 30, cls: orfa > 0.5 ? 't-warn' : 't-acc' });
      if (orfa > 0) c += texto(1430, 222, 'takeover só com --confirmado', { tam: 26, cls: 't-muted', o: orfa });
      // Linha B
      const o = tb < 0 ? 0.25 : 1;
      c += `<g opacity="${o}">`;
      c += texto(20, 300, 'parada planejada', { tam: 30, cls: 't-muted', anc: 'start', peso: 600 });
      c += caixa(20, 320, 300, 120, 'caixa') + texto(170, 393, 'ana-term', { tam: 34, cls: 'mono', peso: 700 });
      const k1 = tb < 0 ? 1 : fase(tb, 0.3, 1.2);
      c += linhaParcial(320, 380, 560, 380, k1, 'seta-a', 'pa');
      if (k1 > 0.5) c += texto(440, 360, 'handoff', { tam: 28, cls: 't-acc mono', o: k1 });
      const k2 = tb < 0 ? 1 : fase(tb, 1.0, 1.6);
      c += caixa(570, 310, 560, 140, 'caixa', k2);
      c += texto(850, 362, 'push do ramo + nota no ticket', { tam: 28, o: k2 });
      c += texto(850, 412, '“falta o teste do total”', { tam: 30, cls: 't-acc', o: k2 });
      const k3 = tb < 0 ? 1 : fase(tb, 2.2, 3.0);
      c += linhaParcial(1130, 380, 1180, 380, k3, 'seta-a', 'pa');
      c += caixa(1190, 320, 480, 120, 'caixa-a', k3);
      c += texto(1430, 370, 'carla-te', { tam: 32, cls: 'mono', peso: 700, o: k3 });
      c += texto(1430, 414, 'open carrinho: retomada', { tam: 28, cls: 't-acc', o: k3 });
      c += `</g>`;
      return svg(1690, 460, c);
    },
  };

  // Ponto do laço: posição pelo comprimento do arco, depois de o SVG entrar no DOM.
  function posicionarPonto() {
    const p = document.getElementById('ponto');
    if (!p) return;
    const a = document.getElementById('arco' + p.dataset.arco);
    const L = a.getTotalLength();
    const q = a.getPointAtLength(L * Number(p.dataset.k));
    p.setAttribute('cx', q.x); p.setAttribute('cy', q.y);
  }

  window.mostrar = function (cena, passo, t, faixa) {
    const el = document.getElementById('tela');
    el.innerHTML = TIPOS[cena.tipo](cena, passo, t);
    posicionarPonto();
    document.getElementById('faixa-secao').textContent = faixa ? faixa.secao : '';
    document.getElementById('faixa-pos').textContent = faixa ? faixa.pos : '';
    // Terminal: se não cabe, esconde os blocos mais antigos.
    const term = el.querySelector('.terminal:not(.arvore):not(.codigo)');
    if (term) {
      const blocos = [...term.querySelectorAll('.bloco')];
      let k = 0;
      while (term.scrollHeight > term.clientHeight + 1 && k < blocos.length - 1) { blocos[k].style.display = 'none'; k++; }
    }
    const tr = term ? term.scrollHeight > term.clientHeight + 1 : false;
    return { transborda: tr || document.body.scrollHeight > 1080 || el.scrollHeight > el.clientHeight + 1 };
  };
})();
