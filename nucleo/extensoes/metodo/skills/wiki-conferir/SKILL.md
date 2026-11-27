---
name: wiki-conferir
description: "Confere a wiki do projeto: roda a conferência de evidência, julga os suspeitos contra as fontes, corrige o que é seguro (índice e links) e relata o resto. Use para lint da wiki, conferir a wiki, revisar a wiki, ou quando o ah doctor avisar suspeitos na Evidência da wiki."
---

# Conferir a wiki

**Dor:** a fonte muda depois do artigo, um link quebra, um número entra arredondado, e a wiki passa a afirmar o que nenhum documento diz. A conferência acha isso antes de alguém confiar na wiki.

O formato (o que é literal de alto sinal, campo Fontes, blocos de status, índice, log) está em `.harness/nucleo/extensoes/wiki/formato.md`. O que é fonte: `tools/ah wiki fontes`.

Se a wiki não existe, diga: "A wiki ainda não tem ingestão; a skill wiki-ingerir cria a wiki." Não crie a estrutura.

São três categorias, com autoridades diferentes.

## 1. Correções seguras (faça)

- **Índice** contra os arquivos da wiki (fora `index.md` e `log.md`): arquivo sem linha → acrescente com `(sem resumo)` e a data do campo Atualizado (Arquivado, na página arquivada); linha sem arquivo → marque `[AUSENTE]`, não apague; data diferente da do artigo → acerte pela do artigo.
- **Links internos do corpo** que não resolvem: procure na wiki um arquivo com o mesmo nome. Exatamente um → corrija o caminho. Nenhum ou vários → relate.
- **Links de Fontes** que não resolvem: procure entre as fontes um arquivo com o mesmo nome. Exatamente um → corrija (a fonte mudou de lugar). Nenhum ou vários → relate.
- **Veja também** que não resolve: um achado → corrija; nenhum → remova o link; vários → relate.

## 2. Relatório mecânico (não corrija fato sozinho)

Rode `tools/ah wiki conferir --pendentes` (ou com caminhos de artigos, para limitar).

- **Suspeitos de fidelidade** são candidatos, não veredito: valor derivado e paráfrase aparecem. Julgue cada um contra a fonte e relate só as divergências reais. Literal que sumiu da fonte indica fonte alterada: proponha atualizar o artigo, com bloco Superado se a mudança for uma decisão.
- **Erros de evidência** (sem Fontes, link fora das fontes, que não resolve, fonte que não é texto) sempre pedem decisão do humano.
- **Cobertura** e fontes ainda não citadas são lembrete de trabalho pendente, não erro: ofereça a ingestão (skill wiki-ingerir).

## 3. Relatório de julgamento (não corrija)

- Contradições entre artigos; afirmação superada por fonte mais nova ainda sem bloco de status; divergência entre fontes sem anotação.
- Bloco de status malformado: Superado sem data, ou qualquer bloco sem explicação.
- Página órfã, sem link de entrada; conceito muito citado sem artigo próprio; referência cruzada que obviamente falta (sugira, não acrescente em silêncio).
- Artigo que redefine ou contradiz um termo do glossário em vez de linkar.
- Página arquivada cujos artigos citados mudaram muito depois do arquivamento.

## Depois

Acrescente ao log a entrada `lint` do formato, com quantos problemas achou e quantos corrigiu, e commite as correções seguras junto com o log.

## Pronto quando

As correções seguras estão feitas, `tools/ah wiki conferir` foi rodado e cada suspeito ou erro está corrigido ou relatado ao humano com o julgamento.

---

Reescrita genérica da skill de [astro-han/karpathy-llm-wiki](https://github.com/astro-han/karpathy-llm-wiki) (MIT, commit `eafcc77`); licença em `LICENSE-karpathy-llm-wiki`, nesta pasta.
