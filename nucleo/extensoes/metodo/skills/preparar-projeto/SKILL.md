---
name: preparar-projeto
description: Use quando pedirem "prepare meu projeto", para instalar o harness, ligar o método de trabalho ou reparar a instalação do harness num projeto.
---

# Preparar o projeto

O projeto fica preparado quando tem o núcleo do harness instalado e commitado na `dev`, as extensões do método ligadas, as skills copiadas com a trava e um `tools/ah doctor` sem falha, com cada aviso relatado ao aluno.

O procedimento mora num lugar só: a seção "Instalar num projeto (instruções para o agente)" do README do agent-harness. Leia-a e siga-a, sem resumir nem pular passo. Ela está, nesta ordem de preferência:

1. no clone que o aluno indicou;
2. na cópia que a própria instalação baixou para a pasta de cache da máquina (`<cache>/README.md`, no Linux dentro de `$HOME/.cache/agent-harness/`);
3. no endereço do repositório: https://github.com/elderbernardiifsul/agent-harness.

Quando o harness já está no projeto e algo parou de funcionar, rode `tools/ah doctor` na pasta do projeto e siga o "Faça" de cada item que não estiver ok. Sem "Faça", ou se o item continuar errado, pare e relate ao aluno o comando, a saída e o que você tentou.
