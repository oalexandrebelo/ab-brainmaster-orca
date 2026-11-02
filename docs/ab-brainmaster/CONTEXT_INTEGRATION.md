# Integração de contexto P2

Data: 2 de novembro de 2026. Pacote: [`packages/ab-context-bridge`](../../packages/ab-context-bridge/README.md). O adaptador de contexto inicial foi implementado e ensaiado com o BBrainX oficial 2.4.0, commit `7943b40167ea58fa64e208281eb6b95a26da6663`. Ele reutiliza o SDK MCP oficial 1.32.1 e o subprocess host do Orca. Não cria índice, daemon, executor ou manifesto de plugin concorrente.

| Superfície                       | Estado e evidência                                                                                                                        |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Conexão MCP stdio BBrainX        | Verificada com `initialize`, `tools/list`, `context_index` status, `context_bootstrap` e `context_read` reais.                            |
| Vínculo de escopo                | Workspace e host explícitos, ID e raiz do projeto conferidos; resposta de outro projeto/raiz recusada.                                    |
| Frescor e proveniência           | Snapshot, hashes de arquivos, linhas, hash do catálogo e contagem exata do prompt conservados; varredura declarada não atômica.           |
| Orçamento                        | 256–16000 tokens de contexto; fontes/janelas omitidas identificadas; não representa limite total da conversa ou faturamento.              |
| Índice obsoleto                  | `INDEX_STALE` observado após alteração real de arquivo. Sem refresh automático pelo adaptador BBrainX; recuperação explícita ensaiada.    |
| Escopo negado e arquivo sensível | `FORBIDDEN`, traversal e `.env` testados no servidor BBrainX real.                                                                        |
| Oficina AB-S00S                  | Contratos `projects {}`, `search`, `read` implementados; catálogo conectado consultado, sem projeto AB-BRAINMASTER disponível.            |
| Transporte HTTP                  | Configurável por URL MCP exata e cabeçalhos vindos do ambiente, sem endpoint inventado; homologação remota depende de projeto autorizado. |
| Contexto na sessão Orca          | API pronta para o host; injeção em prompt, painel e instalação desktop continuam sendo trabalho de integração do aplicativo.              |
| Checkpoint e memória             | Não expostos; nenhum checkpoint, aprovação de memória ou recrutamento é acionado pela recuperação.                                        |

O catálogo conectado consultado nesta fase retornou 16 projetos. Nenhum deles era `ab-brainmaster-orca`, `bbrainx-dev` ou `ab-s00s`. Não houve busca em um projeto alheio. A criação do novo projeto remoto ficou bloqueada pela revisão automática de aprovação e deve seguir o fluxo de autorização concreto da Oficina; não foi contornada por outro canal.

## Contrato para a integração do host

P1 pode importar `createContextBridge()` de `packages/ab-context-bridge/bridge.mjs` e `connectConfiguredMcp()` de `mcp-connection.mjs`. O primeiro também aceita um cliente MCP do host já conectado. Métodos públicos: `discover({ signal? })` e `retrieve({ query, budget?, task?, windows?, signal? })`. O cliente aceita as assinaturas do SDK oficial; a bridge respeita timeout e cancelamento. As ferramentas admitidas são fixadas por adaptador e validadas contra os schemas recebidos.

O host fornece `connectionId` sem segredo e `binding: { workspaceId, hostId, projectId, expectedRoot? }`. Para uma conexão remota, `hostId` identifica o executor que já possui acesso. A bridge não converte caminhos remotos para locais nem tenta reconstruir uma identidade de worktree a partir do path. A raiz descoberta é conservada como vínculo da recuperação.

O retorno é um EvidencePack com `packId`, `binding`, `origin`, `query`, `snapshot`, `freshness`, `sources`, `omissions`, `selection` e `prompt`. Apenas `prompt.text` é o conteúdo limitado a inserir na nova tarefa. `prompt.payloadTokens` é contado com `o200k_base`; o pacote completo e seus hashes ficam junto do registro da tarefa. O host precisa reservar o restante da janela e limitar o contexto usando a implantação efetiva do modelo.

Conteúdo de repositório é dado. Nenhuma fonte recuperada modifica permissões ou autoriza ferramentas. A ponte aplica recusa de caminhos sensíveis, e o BBrainX aplica seus filtros de indexação; isso não certifica a ausência universal de segredos. Arquivos e banco do BBrainX pertencem ao host configurado. Bootstrap registra observações de contexto no serviço; a Oficina pode atualizar seu índice uma vez e sinalizar `reindexed`.

## Verificação reproduzível e limites

A suíte P2 contém ensaio de processo BBrainX real e casos de contrato da Oficina. O teste real percorre recuperação de texto com hash e janela, negação de escopo, traversal, `.env` fora do índice, mudança de conteúdo que invalida o índice, perda da conexão e retomada após refresh explícito. O teste depende de `AB_BBRAINX_TEST_SOURCE`; ausente, retorna skipped. Os comandos completos estão no README do pacote.

O sandbox deste ambiente encerrava subprocessos Node sem saída; a execução real foi feita após escalada aprovada. O bloqueio de rede e inferência local são ensaios separados. Os resultados do transporte MCP não certificam qualidade de LLM, interface renderizada, instalação desktop, OAuth, Windows/macOS ou checkpoint CAS. O código privado AB-S00S `UNLICENSED` foi usado somente para descobrir contratos e não foi copiado para o fork.

Fontes primárias: [BBrainX fixado](https://github.com/oalexandrebelo/BBrainX/tree/7943b40167ea58fa64e208281eb6b95a26da6663), especialmente `src/engine.mjs`, `src/aci.mjs`, `src/context.mjs`, `src/retrieval.mjs`; AB-S00S privado `fabe96a98ee13df842beafecf8ff9c55016ca640`, schemas e envelopes MCP observados. Os snapshots locais do trabalho e recibos de teste pertencem à evidência de execução P2.
