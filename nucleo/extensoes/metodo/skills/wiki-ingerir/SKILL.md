---
name: wiki-ingerir
description: "Compila uma fonte do projeto (ADR, spec, pesquisa, reunião, glossário, decisão em ticket) na wiki do projeto, com cada número, data e citação conferido na fonte; também move um artigo de tema. Use para ingerir na wiki, adicionar à wiki, ingestão em lote, mover artigo da wiki, ou quando o harness lembrar que há fonte nova sem ingestão."
---

# Ingerir na wiki

**Dor:** o conhecimento do projeto fica espalhado em documentos que ninguém relê, e a resposta que sai de memória parece certa sem ter fonte. A ingestão destila uma fonte em artigos da wiki que citam de onde veio cada afirmação.

Antes de escrever, leia o formato: `.harness/nucleo/extensoes/wiki/formato.md` (artigo, blocos de status, índice, log e o que é literal de alto sinal). Ele é o único lugar do formato; esta skill diz o que fazer.

## O que é fonte

- Fonte é o que `tools/ah wiki fontes` lista (a lista vem de `extensoes.wiki` no `.harness/config.json`; não a repita, não a adivinhe). A pasta da própria wiki nunca é fonte.
- A wiki lê a fonte onde ela está e **nunca a edita**. Fonte que parece errada ou desatualizada: relate ao humano; a correção é na fonte, fora da wiki.
- **Fonte externa** (URL, PDF, texto colado na conversa) entra no repositório antes: proponha a pasta que lhe cabe entre as fontes e só grave com o "sim" do humano.

## Primeira vez

Se a pasta da wiki não existe, crie só o que falta, sem sobrescrever: `index.md` com `# Índice da wiki` e `log.md` com `# Log da wiki`. Só a ingestão cria a wiki.

## Passos

1. **Escolha da fonte.** Um arquivo, ou poucos. Fonte grande (uma spec, a pasta de uma reunião) pode ir por seção ou assunto; diga qual recorte. Leia a fonte (ou o recorte) inteira antes de escrever.
2. **Triagem.** Procure na wiki as entidades da fonte e seus sinônimos (índice e busca no texto) e declare a disposição:
   - **Novo**: cria artigo(s); **Atualização**: incorpora a artigo(s) existente(s); **Contestado**: contradiz o que a wiki diz. Os três combinam.
   - **Sem material**: nada além do que a wiki já tem. Registre no log com a entrada "sem material" do formato e pare. Não force artigo de fonte rala.
3. **Compilação.** Mesma tese de um artigo → incorpore a ele e acrescente a fonte ao campo Fontes. Conceito novo → artigo novo na pasta de tema mais próxima. Atravessa temas → na mais relevante, com Veja também.
   - **Localize antes de escrever:** todo número, data, horário e citação é achado na fonte (busca ou leitura) e escrito como está. Valor derivado mostra os componentes. Não achou: tire ou diga sem precisão.
   - **Decisão prevalece:** ADR, decisão registrada em ticket e verbete do glossário valem sobre o que specs, reuniões e pesquisas disseram antes. Marque o que ficou para trás com **Status: Superado**; fontes que discordam sem decisão, com **Status: Contestado**, apontando quem decide. A wiki registra a divergência; não a resolve por conta própria.
   - Use os termos do glossário do projeto e linke o glossário em vez de redefinir.
4. **Cascata.** Busque na wiki inteira (não só no índice) as entidades e afirmações que a fonte toca e atualize cada artigo afetado, com nova data em Atualizado. Página arquivada nunca entra na cascata.
5. **Índice e log.** Uma linha por artigo tocado no índice; tema novo ganha a linha de descrição. Uma entrada de ingestão no log.
6. **Conferência.** Rode `tools/ah wiki conferir <artigos tocados>`. Cada suspeito é corrigido (achar na fonte, mostrar componentes, tirar) ou explicado ao humano. Nenhum erro de evidência fica.
7. **Commit** dos artigos, do índice e do log juntos: o commit que toca o log marca a última ingestão, e é por ele que o harness deixa de lembrar desta fonte.

## Em lote

Só quando o humano pede uma pasta ou um tema inteiro. Ler pode ser em paralelo; compilar, não: uma fonte por vez, porque índice, log e cascata são estado compartilhado. Comece pelo que decide e termine pelo que é histórico: glossário e ADRs, decisões em ticket, specs e planos, reuniões, e por último pesquisas e análises. Assim o que foi superado já entra marcado.

## Mover um artigo

Só a pedido, ou quando uma ingestão abre um tema que o artigo passa a integrar. Conhecimento não muda; Atualizado também não.

1. `git mv` para a pasta nova (um nível só), para o histórico seguir o arquivo.
2. Reescreva os links relativos de dentro do artigo (Fontes, corpo, Veja também) que a mudança quebrou.
3. Busque o nome do arquivo na wiki inteira e corrija cada link de entrada, inclusive em páginas arquivadas. Link de fonte fora da wiki para o caminho antigo: relate ao humano (a wiki não edita fontes).
4. Índice: a linha sai do tema antigo e entra no novo. Log: a entrada `mover` do formato.
5. `tools/ah wiki conferir`: nenhum erro de evidência pode aparecer por causa do movimento.

## Pronto quando

A fonte está citada no campo Fontes de pelo menos um artigo (ou registrada como sem material), o índice e o log contam o que mudou, e `tools/ah wiki conferir` não traz suspeito sem explicação.

---

Reescrita genérica da skill de [astro-han/karpathy-llm-wiki](https://github.com/astro-han/karpathy-llm-wiki) (MIT, commit `eafcc77`); licença em `LICENSE-karpathy-llm-wiki`, nesta pasta.
