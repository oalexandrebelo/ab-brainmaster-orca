# Heurísticas de UX aplicadas ao AB-BRAINMASTER-ORCA

**Data: 2 de novembro de 2026. Escopo: produto operacional de agentes, derivado do Orca.**

Este documento usa as dez heurísticas de Jakob Nielsen para transformar intenção de produto em verificações observáveis. Os nomes abaixo são traduções sintéticas; fluxos, critérios, métricas e metas são propostas originais para o AB. Não são uma reprodução do artigo nem benchmarks atribuídos ao NNGroup. [Fonte primária e crédito: Jakob Nielsen, Nielsen Norman Group](https://www.nngroup.com/articles/ten-usability-heuristics/).

A avaliação realizada nesta frente foi **documental**. Foram lidos contratos, documentação, guia visual e nomes de testes no commit `d616c1b9eac49b4f4e1c73a1eb5e802c67c332bb`. Nenhuma sessão de usabilidade, teste em aparelho ou medição de latência foi executada. “Aceite” abaixo significa requisito a verificar; não significa resultado aprovado.

## 1. Três intervenções de maior valor

1. **Mostrar onde o trabalho acontece.** Host, projeto/pasta, agente, conta e estado precisam acompanhar o envio e a retomada. O usuário deve poder distinguir cliente conectado de executor trabalhando.
2. **Preservar trabalho em interrupções.** Cancelar, sair de diálogo, perder rede e reiniciar devem manter rascunhos e apontar claramente o que continua no servidor.
3. **Fazer o resultado ser verificável.** Conclusão de agente, conexão de conta, instalação de plugin e publicação de artefato só recebem estado concluído quando houver evidência correspondente.

Essas prioridades decorrem das jornadas do AB e da presença de runtimes remotos, mobile e automações já documentados no Orca. Não são afirmações de defeitos observados na interface. Fontes: [servidores](https://github.com/stablyai/orca/blob/d616c1b9eac49b4f4e1c73a1eb5e802c67c332bb/docs/site/content/docs/remote-servers.mdx), [mobile](https://github.com/stablyai/orca/blob/d616c1b9eac49b4f4e1c73a1eb5e802c67c332bb/docs/site/content/docs/mobile.mdx), [rotinas](https://github.com/stablyai/orca/blob/d616c1b9eac49b4f4e1c73a1eb5e802c67c332bb/docs/site/content/docs/cli/automations.mdx).

## 2. Matriz heurística → fluxo → critério → métrica

| Heurística de Nielsen                             | Fluxo AB                                                              | Critério verificável proposto                                                                                                                                                                    | Métrica e meta inicial                                                                                                                                         | Como verificar                                                                                                                   |
| ------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **1. Visibilidade do estado**                     | Iniciar agente local/remoto; reconectar; acompanhar rotina            | Mostrar destino antes do envio; estados enviado/em execução/aguardando entrada/concluído/falhou/desconectado derivados do runtime. Desconexão do cliente não vira conclusão do trabalho          | 100% das transições críticas têm rótulo; 0 conclusões sem resultado; p95 de feedback local ≤100 ms; atualização remota ≤2 s após evento recebido               | Capturar timestamps da ação, confirmação local, evento e render. Simular RTT 50/200 ms e queda de 30 s                           |
| **2. Correspondência com a linguagem do usuário** | Criar projeto ou pasta, escolher host, conta e rotina                 | Usar vocabulário de trabalho; explicar worktree quando relevante; exibir data/hora local e timezone. Não tratar pasta simples como branch Git                                                    | ≥90% de escolhas corretas de destino e agente no piloto; 0 confusões host/conta com efeito; ≥90% identifica próxima ocorrência corretamente                    | Tarefas sem instrução prévia: abrir pasta, criar trabalho separado, agendar 09:00 local. Registrar termos que causaram hesitação |
| **3. Controle e liberdade**                       | Cancelar agente, rejeitar alteração, fechar painel, sair de aprovação | Escape fecha a superfície adequada; rascunho persiste; cancelar execução mostra resultado real. Fechar a aba não pode ser apresentado como parar o processo                                      | 100% dos diálogos comuns têm saída por teclado; 0 rascunhos perdidos em 20 interrupções; cancelamento recebe confirmação em ≤2 s após ack do host              | Criar texto único, abrir/fechar, desconectar, cancelar durante ferramenta; verificar rascunho e estado de efeito                 |
| **4. Consistência e padrões**                     | Mesma ação no desktop, mobile e host remoto                           | Nome, ícone, hierarquia e estado têm o mesmo significado; atalho corresponde ao sistema operacional. Usar tokens e primitivas upstream                                                           | 0 atalhos exibidos sem função; 0 rótulos contraditórios nos 12 comandos críticos; 100% dos estados essenciais têm texto além de cor                            | Revisar light/dark e Cmd/Ctrl; comparar criar, retomar, pausar, aprovar, cancelar e reconectar em cada cliente                   |
| **5. Prevenção de erros**                         | Aprovar plugin/update, descartar arquivo, executar rotina ou publicar | Antes de efeito, mostrar entidade e destino; bloquear submissão duplicada; verificar versão/hash e alterações de acesso. Rotina informa timezone; execução manual informa quando ignora precheck | 0 efeitos duplicados em 30 duplos cliques/retries; 100% dos updates que ampliam acesso pedem nova revisão; 0 arquivos sobrescritos silenciosamente em conflito | Injetar atraso, repetir envio e alterar release/capacidade. Usar fixtures; comparar IDs e hashes antes/depois                    |
| **6. Reconhecimento em vez de memorização**       | Encontrar projeto, contexto, arquivo, habilidade e execução anterior  | Busca por nome e descrição; recentes e contexto ativo visíveis; escolhas preservadas quando seguras; origem/versão recuperável sem lembrar ID                                                    | Encontrar arquivo/execução conhecida em ≤15 s; ≥90% de sucesso em corpus de 100 itens; informação de host/contexto a ≤1 ação                                   | Dar nomes parciais e objetivos de trabalho. Contar consultas, erros de seleção e retornos                                        |
| **7. Flexibilidade e eficiência**                 | Repetir tarefas, usar comandos rápidos, navegar por teclado           | Fluxo comum acessível por interface e teclado; personalização preserva defaults compreensíveis; comandos rápidos não duplicam ações do núcleo                                                    | Reabrir trabalho ou executar comando salvo em ≤2 ações quando contexto completo; redução ≥25% do tempo após segunda tentativa, sem aumento de erro             | Comparar primeira e segunda execução por participante; testar caminho de mouse/toque e teclado, sem exigir atalho de novato      |
| **8. Design essencial e legível**                 | Mesa de trabalho, painel AB, revisão de resultado e configurações     | Uma ação primária por contexto; detalhes raros em disclosure; texto crítico nunca só em tooltip. Painéis preservam área útil e foco                                                              | ≥90% identifica próximo passo em ≤5 s; 0 texto essencial cortado em 1280×800 e 390×844; ≤2 ações até detalhe necessário                                        | Capturas em estados vazio, carregando, ocupado, erro e sucesso; tarefas de encontrar ação e comparar artefatos                   |
| **9. Diagnóstico e recuperação de erro**          | Falha de agente, host offline, plugin incompatível, conexão revogada  | Mensagem nomeia causa disponível, escopo e ação concreta; erro persistente fica inline; detalhe técnico copiável; retry preserva entrada e não duplica efeito                                    | ≥90% recupera cenário conhecido em ≤2 min; 100% dos cinco erros críticos tem ação; 0 sucesso falso após timeout                                                | Forçar host offline, token revogado, plugin mínimo maior, conflito de arquivo e falha de modelo; observar recuperação            |
| **10. Ajuda e documentação**                      | Primeiro acesso, pareamento, plugin, rotina e habilidade              | Ajuda no ponto de bloqueio, instrução curta, link direto e versão do host; ambiente faltante oferece ação de configuração                                                                        | ≥80% completa primeira tarefa em ≤10 min sem ajuda humana; documento correto em ≤2 ações; 100% dos links críticos válidos no release                           | Piloto com instalação provisionada e fixture; medir tempo até primeiro resultado verificável e chamadas de ajuda                 |

**Interpretação das metas:** as taxas são limites iniciais de aceite e precisam ser calibradas ao público. p95 exige amostra repetida de eventos; não deve ser calculado a partir de cinco participantes como se fosse uma estimativa estável da população. As metas de tempo de ação não incluem duração de inferência nem download, que devem ser mostrados e medidos separadamente.

## 3. Vocabulário de estados e efeitos

O modelo operacional deve separar três dimensões:

| Dimensão           | Exemplos                                                                        | Regra de apresentação                                                                            |
| ------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Conexão do cliente | conectando, conectado, desconectado, acesso revogado                            | Descreve o acesso à fonte de estado; não conclui sobre o processo remoto sem evento              |
| Trabalho do agente | fila, em execução, aguardando entrada, cancelando, concluído, falhou            | Mantém ID e host; o último evento conhecido e sua hora devem ser recuperáveis                    |
| Efeito produzido   | alteração proposta, aprovada, aplicada, publicação confirmada, aplicação falhou | “Aplicado/publicado” exige resultado; mensagem do agente sozinha não confirma um sistema externo |

Em cada card de trabalho, o caminho “abrir contexto → ver resultado → responder” deve ser reconhecível. Ações possíveis dependem da identidade, host e recurso. Se uma ação estiver indisponível, sua explicação deve resolver a dúvida presente, como atualizar o servidor ou reconectar, sem usar um rótulo genérico.

Não criar mais um banco de estado para o painel AB sem necessidade. Preferir o estado do runtime e referências aos recursos; duplicação introduz divergência entre “feito” no painel e “rodando” na sessão. Esta é uma decisão de projeto, não uma conclusão sobre bugs atuais.

## 4. Regras de interface herdadas do upstream

O [Style Guide](https://github.com/stablyai/orca/blob/d616c1b9eac49b4f4e1c73a1eb5e802c67c332bb/docs/STYLEGUIDE.md) estabelece tokens canônicos em `src/renderer/src/assets/main.css`, primitivas em `components/ui`, uso de estado real no texto, feedback proporcional à duração, foco e navegação por teclado. O [rubric de revisão](https://github.com/stablyai/orca/blob/d616c1b9eac49b4f4e1c73a1eb5e802c67c332bb/docs/styleguide/ux-review-rubric.md) já pede foco em ações frequentes, disclosure, erros persistentes e comportamento remoto.

Para o fork:

- Estender tokens/primitivas existentes. Tema AB deve ter equivalência light/dark e manter significado das cores de estado.
- Não colocar detalhes técnicos no fluxo principal sem utilidade decisória. Host, conta, destino, permissões e versão incompatível têm utilidade; nomes internos de filas e RPCs normalmente pertencem ao diagnóstico.
- Manter a superfície de confiança que o upstream reserva para aprovação de código/plugins; temas não devem alterar sua aparência de modo que encubra acesso.
- Tratar movimento reduzido, foco, zoom e tamanho de viewport como condições de aceite.
- Conservar as convenções de atalhos macOS/Windows/Linux. Mobile precisa de ações visíveis para recursos que no desktop dependem de hover ou botão direito.
- Aplicar erro inline quando o usuário precisa ler, copiar ou agir. Toast é adequado a confirmação breve, não a único registro de falha persistente.

Essas são aplicações das regras existentes. A pesquisa não adicionou paleta, tipografia ou componente ao fork.

## 5. Protocolo de homologação

**Ambiente registrado.** Guardar commit do núcleo, patches AB, versão efetiva do runtime, host, cliente, SO, CPU/RAM, plugins, agent/model, RTT e viewport. Registrar se o projeto é pasta simples, repositório principal ou worktree.

**Cenários mínimos.**

| Código | Jornada                               | Falha/variação obrigatória                                       | Evidência                                                        |
| ------ | ------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| UX-A   | Abrir projeto e iniciar agente        | Pasta sem Git; duas contas; dois hosts parecidos                 | Captura do destino e ID da execução                              |
| UX-B   | Revisar arquivo ou documento          | Conflito de edição; arquivo grande; viewer somente leitura       | Diff, hash antes/depois, lista de perdas de visualização         |
| UX-C   | Criar e pausar rotina                 | Timezone, mudança de horário, cliente fechado, host indisponível | Próximas ocorrências, histórico e ausência de disparo após pausa |
| UX-D   | Instalar/atualizar plugin selecionado | Mínimo incompatível; mudança de capacidades; hash divergente     | Resultado do gate; diálogo e registro de versão                  |
| UX-E   | Móvel/remoto                          | Desconexão de 30 s; revogação; troca de host; retomada           | Captura antes/depois, preservação do rascunho, ID estável        |
| UX-F   | Recuperar falha de agente             | Falha de provedor durante ferramenta; cancelamento               | Estado final, efeitos produzidos e caminho de continuação        |

**Amostra de uso.** Começar com seis participantes de perfis previstos: três operadores de negócio e três usuários técnicos. Cada um executa as seis jornadas com dados sintéticos. Isso oferece descoberta de fricções e uma linha de base local; não sustenta alegação estatística de satisfação da população. Rodadas posteriores devem focar os problemas encontrados.

**Medição técnica.** Para feedback e duplicação, repetir 30 vezes cada cenário afetado, separando local, RTT 50 ms e RTT 200 ms. Usar relógio monotônico para durações e IDs para correlacionar ações. Medir latência até confirmação local, confirmação do host, resultado e render separadamente. Resultados devem informar tamanho da amostra, mediana, p95 e falhas, sem misturar interfaces e hosts.

**Critérios de saída propostos.** Nenhuma perda silenciosa, envio para destino errado, aprovação incorreta ou sucesso falso nas jornadas críticas. Nenhum problema que impeça recuperação sem reiniciar o trabalho. Erros cosméticos têm registro e prioridade menor. Percentuais da matriz só recebem estado “medido” com corpus, denominador e evidência.

## 6. Aproveitar testes existentes com precisão

Os arquivos abaixo **existem** no checkout e são pontos de partida para verificar regressões pertinentes. Sua presença não significa execução ou aprovação nesta pesquisa.

| Área                  | Teste upstream identificado                                                                                                                                                                                   | Cobertura que ainda precisa ser confirmada ao ler/rodar   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Aprovação de update   | [plugin-update-review.spec.ts](https://github.com/stablyai/orca/blob/d616c1b9eac49b4f4e1c73a1eb5e802c67c332bb/tests/e2e/plugin-update-review.spec.ts)                                                         | Novas capacidades, licença/origem e preservação de estado |
| Notificação de update | [plugin-update-review-toast.spec.ts](https://github.com/stablyai/orca/blob/d616c1b9eac49b4f4e1c73a1eb5e802c67c332bb/tests/e2e/plugin-update-review-toast.spec.ts)                                             | Ação de review e foco entre toast/diálogo                 |
| Descarte              | [source-control-discard-confirmation.spec.ts](https://github.com/stablyai/orca/blob/d616c1b9eac49b4f4e1c73a1eb5e802c67c332bb/tests/e2e/source-control-discard-confirmation.spec.ts)                           | Escopo exato dos arquivos e cancelamento                  |
| Rascunho              | [source-control-commit-draft-persistence.spec.ts](https://github.com/stablyai/orca/blob/d616c1b9eac49b4f4e1c73a1eb5e802c67c332bb/tests/e2e/source-control-commit-draft-persistence.spec.ts)                   | Preservação em navegação/fechamento                       |
| Recuperação           | [source-control-operation-recovery.spec.ts](https://github.com/stablyai/orca/blob/d616c1b9eac49b4f4e1c73a1eb5e802c67c332bb/tests/e2e/source-control-operation-recovery.spec.ts)                               | Retry após falha e efeitos parciais                       |
| Remoto                | [paired-remote-terminal-host-quit-reconnect-input.spec.ts](https://github.com/stablyai/orca/blob/d616c1b9eac49b4f4e1c73a1eb5e802c67c332bb/tests/e2e/paired-remote-terminal-host-quit-reconnect-input.spec.ts) | Autoridade da sessão e input depois da retomada           |
| Mobile                | [paired-mobile-desktop-mirror-files-git-review.spec.ts](https://github.com/stablyai/orca/blob/d616c1b9eac49b4f4e1c73a1eb5e802c67c332bb/tests/e2e/paired-mobile-desktop-mirror-files-git-review.spec.ts)       | Equivalência dos arquivos e revisão entre clientes        |
| Pareamento            | [paired-desktop-pairing-cycle.spec.ts](https://github.com/stablyai/orca/blob/d616c1b9eac49b4f4e1c73a1eb5e802c67c332bb/tests/e2e/paired-desktop-pairing-cycle.spec.ts)                                         | Parear, revogar e reconectar                              |
| Exclusão de workspace | [worktree-delete-dialog-layout.spec.ts](https://github.com/stablyai/orca/blob/d616c1b9eac49b4f4e1c73a1eb5e802c67c332bb/tests/e2e/worktree-delete-dialog-layout.spec.ts)                                       | Layout, opções e efeito correto no alvo                   |

Executar somente os testes pertinentes à mudança e os gates exigidos pelo repositório. Testes de UI precisam de viewport e estado reproduzíveis, capturas e runtime correto. O AGENTS do upstream exige validação Electron em background e por seu fluxo apropriado; esta frente não iniciou o aplicativo.

## 7. Como registrar cada achado real

Um registro útil contém: jornada, condição inicial, passos, esperado, observado, frequência, impacto, captura/log sanitizado e proposta de correção. Classificar impacto em: perda ou efeito indevido; bloqueio de tarefa; demora/confusão recuperável; aparência. Priorizar primeiro o efeito sobre trabalho e capacidade de recuperação.

O relatório de release deve distinguir:

- **Verificado em código/documento:** o contrato existe.
- **Executado:** o cenário foi rodado no ambiente identificado.
- **Aprovado:** o resultado satisfaz o critério com evidência.
- **Pendente:** dependência, acesso ou medição ainda falta.
- **Não aplicável:** o fluxo não faz parte da entrega, com justificativa.

A página da Ratoeira ajuda a identificar jornadas de negócio; não fornece baseline quantitativo de UX. O NNGroup fornece o referencial conceitual; não uma nota automática de qualidade do AB. A matriz deve passar a conter resultados reais conforme o fork for homologado.
