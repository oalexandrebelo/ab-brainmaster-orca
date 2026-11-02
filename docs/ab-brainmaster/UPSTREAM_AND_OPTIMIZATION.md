# Upstream e otimização do AB-BRAINMASTER-ORCA

Data de pesquisa: **2 de novembro de 2026**. Base de implementação: `stablyai/orca@d616c1b9eac49b4f4e1c73a1eb5e802c67c332bb`. Este documento registra entrega executada, evidência externa e experimentos propostos separadamente. O JSON associado contém a consulta real completa, fontes e estado dos gates.

## 1. Entrega executada

O pacote `packages/ab-upstream-review` contém uma CLI Node sem dependências, worker e painel Orca com o botão **Revisar atualizações do Orca**. A CLI e o painel compartilham o motor de consulta. O módulo só acessa `api.github.com/repos/stablyai/orca` após a ação `review` ou clique explícito; não faz consulta ao abrir o painel ou ativar o worker.

O motor resolve `main` para SHA, compara com a base fixada, pagina commits e registra caminhos e estatísticas de arquivos. Não executa código recebido. Não faz pull, merge, instalação ou alteração do repositório. A interface coloca conteúdo remoto em `textContent`, incluindo títulos e nomes de arquivo adversariais. URLs apresentados são construídos pelo código com SHAs validados, e não usados diretamente da resposta remota.

Há limite de 6 s por GET, 24 s por revisão, cinco páginas/500 commits, 4 MiB por resposta, 12 MiB por coleta e 900 KiB por relatório da bridge. ETags são reaproveitados apenas por GET condicional; cache efêmero validado, até seis entradas/2 MiB, vence em 15 min. Falha de rede não reapresenta dados antigos como revisão atual. Cancelamento, limite da API, espera para nova tentativa, erro de schema e truncamento são estados explícitos.

A documentação oficial do GitHub limita a comparação a até **300 arquivos**, disponíveis só na primeira página; a paginação dos commits não elimina esse limite. Ao receber 300 arquivos, o módulo marca a lista como não comprovadamente completa. Contagens inconsistentes, páginas faltantes ou repetidas e histórico divergente também impedem estado completo. “Complete” significa somente completude da enumeração de metadados dentro do contrato; revisão de patches e validação continuam pendentes. [G1]

As regras de atenção cobrem autenticação, schema/persistência, runtime nativo, API de plugins, dependências/lockfiles, licenças e possível sobreposição AB. Conferem nomes atuais e anteriores de arquivos renomeados. São heurísticas; não analisam o diff AB real e não fazem auditoria de segurança. Uma lista sem correspondências não é evidência de risco zero.

### Evidência real

Consulta em **2026-11-02T17:46:56.857Z**, executada com `node --use-env-proxy packages/ab-upstream-review/cli.mjs review` em Node 24.22.1:

| Campo              | Resultado observado                                  |
| ------------------ | ---------------------------------------------------- |
| Base AB            | `d616c1b9eac49b4f4e1c73a1eb5e802c67c332bb`           |
| `main` resolvido   | `509461af4f25cd1b65d9c153b62ae299fb1bda65`           |
| Ancestralidade     | `ahead`; merge-base igual à base AB                  |
| Mudanças recebidas | 1 commit, 56 arquivos                                |
| Commit             | `test: remove 332 low-value renderer tests (#37517)` |
| Transporte         | 2 GETs, 391.552 bytes, 888 ms                        |
| Estado             | Metadados completos; nenhum merge realizado          |

Esse registro não garante que `main` permaneceu nesse SHA, nem transforma a coleta pontual em benchmark do produto. Uma tentativa anterior sem configuração do proxy retornou `offline` em 57 ms e preservou a distinção entre falha de conexão e resultado vazio. O arquivo `upstream-evidence.json` contém os dois resultados.

## 2. Gate de versão e contrato real do plugin

O `package.json` da base declara **1.4.214**. O schema e a referência de plugins presentes nesse mesmo checkout documentam recursos posteriores. O manifesto deste painel usa formato 2, omite publisher e declara `ui: html`; por isso mantém `engines.orca >=1.4.246`. Não utiliza hooks nem `workspace.list`, que exigiriam o piso 1.4.248. [L1, L2]

O schema efetivo do método é:

```js
orca.host.call(
  'plugin.request',
  {
    name: 'upstream.review',
    input: { confirmed: true },
    timeoutMs: 30000
  },
  { signal }
) // resultado: { output }
```

`data` não é um campo permitido nesse método. O worker registra `orca.panels.handle`. Não há capabilities adicionais de workspace, terminal ou storage. Entretanto, `trusted-worker` executa Node com acesso ao host: ele **não é sandbox**, e a aprovação de execução continua significativa. Os seis pontos de contribuição reservados ficam vazios. [L2, L3]

**Gate aberto:** comprovar versão real do executável compatível, validar/inspecionar o pacote e homologar painel/worker no runtime. Não reduzir `engines`, falsificar a versão declarada do app nem afirmar instalação concluída. A CLI está operacional independentemente desse gate.

Foram executados **13 testes com sucesso**: 12 unitários/adversariais, incluindo simulação de DOM que rejeita `innerHTML`, e um teste que importa o parser TypeScript real do Orca com Zod 4.6.7. O parser aceitou o manifesto e a checagem de engine recusou 1.4.214 e aceitou 1.4.246. Isso comprova contrato estático; não comprova renderização Electron, comportamento mobile, aprovação de plugin ou execução em um build distribuído. Node emitiu apenas aviso de detecção de ESM no pacote raiz; não alteramos o tipo do monorepo para suprimi-lo.

Após disponibilização das dependências fixadas do monorepo, o pacote passou em `oxlint` e `oxfmt --check` locais. As regex de caracteres de controle foram substituídas por verificações numéricas equivalentes, com casos adversariais adicionais no teste existente. Os 13 testes passaram novamente usando o Zod 4.6.7 instalado pelo lockfile do repositório. Nenhuma regra de lint ou política upstream foi desativada.

## 3. Oportunidades globais verificadas

A origem abaixo é evidência de organização, afiliação institucional ou história publicada; não se deduz nacionalidade de nomes de mantenedores. Comunidades globais e local da empresa não equivalem à origem de cada contribuição. As integrações são **hipóteses**, ainda não implantadas.

| Referência e contexto documentado                                                                                                                                                                         | Mecanismo útil                                                                                                         | Hipótese para AB e decisão                                                                                                                                                                                                                                   |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **DeepGEMM / DeepSeek — Ásia.** A organização mantém o repositório; seus termos identificam Hangzhou DeepSeek Artificial Intelligence Co., Ltd. [A1, A2]                                                  | Kernels de GEMM/MoE; requisitos oficiais incluem GPUs NVIDIA SM90/SM100 e CUDA 12.9+. MIT no repositório               | Pesquisa de backend de inferência remoto somente se esse hardware existir. Não portar kernels para Electron, não instalar CUDA no cliente e não contabilizar ganhos sem benchmark. Prioridade P2                                                             |
| **ClickHouse — origem documentada na Yandex, com anúncio Moscou/Nova York; empresa independente desde 2021.** A história atual registra Delaware/San Francisco e escritório europeu em Amsterdã. [R1, R2] | Analítica colunar de grandes volumes; Apache-2.0 do projeto [R3]                                                       | Considerar exportação de métricas agregadas de agentes apenas quando o armazenamento atual apresentar gargalo medido. A origem ligada à Yandex não autoriza chamá-lo de projeto atualmente governado na Rússia. P2, sem substituir banco operacional do Orca |
| **Qdrant — Europa.** Documento oficial identifica Qdrant Solutions GmbH em Berlim. [E1]                                                                                                                   | Busca vetorial, quantização e rescoring, com trocas explícitas entre memória, velocidade e recall. Apache-2.0 [E2, E3] | Backend opcional de recuperação de documentos AB, quando corpus e benchmark justificarem. Manter contratos por documentos/IDs e preservar provenance; testar recall antes de redução de memória. P2                                                          |
| **vLLM — origem acadêmica americana.** O UC Berkeley Sky Computing Lab documenta o projeto e PagedAttention. [U1]                                                                                         | Gerenciamento de KV cache e batching; projeto Apache-2.0 [U2]                                                          | Candidato a endpoint remoto para inferência concorrente, encaixado no caminho de provider já existente após testar protocolo, tools, streaming e cancelamento. P1 condicionado a GPU remota, nunca requisito do desktop                                      |
| **SGLang — governança LMSYS e comunidade internacional, sem atribuição de nacionalidade pelo nome.** A documentação oficial identifica a hospedagem na organização sem fins lucrativos LMSYS. [S1]        | Reuso de prefixos/KV cache com RadixAttention, batching; Apache-2.0 no repositório [S2, S3]                            | Comparar com o backend já usado para tarefas AB com contexto repetido. P1 apenas se a carga tiver prefixos reutilizáveis e concorrência suficiente. A equivalência de protocolo deve ser testada                                                             |
| **llama.cpp — comunidade ggml-org internacional; país não confirmado pelas fontes consultadas.** [C1]                                                                                                     | Execução local CPU/GPU, quantização, servidor compatível com rotas de API; MIT [C1, C2]                                | Medir configuração do runtime local existente, inclusive quando já usa llama.cpp internamente, antes de introduzir outro daemon. P1 para perfil local sem GPU de datacenter. Não duplicar o runtime do usuário por padrão                                    |

**Candidato descartado como dependência nova:** `mistralai/mistral-inference` tem entidade europeia identificada em Paris, mas o repositório oficial consultado está arquivado e declara não ser mais mantido. Serve como referência histórica, não como nova peça operacional. Modelos Mistral podem ser avaliados em runtime suportado; licença da biblioteca não substitui licença de cada conjunto de pesos. [E4, E5]

Nenhum número promocional de throughput desses projetos foi adotado como economia do AB. Não foram instalados esses backends, baixados pesos por esta frente, executadas inferências ou realizados benchmarks de modelo. As licenças indicadas são do código consultado; dependências, pesos e serviços comerciais exigem verificação por versão antes de adoção.

## 4. Plano mensurável de performance

**Baseline obrigatório:** registrar SHA do Orca e patches AB, versão real do executável, host, SO, CPU/RAM/GPU, plugins, provider/modelo, quantização, corpus, concorrência e RTT. Usar primeiro o sistema atual, sem otimizações novas. Separar tempo de interface, fila, rede, prefill, geração e execução de ferramenta; custo de API é medido por fatura/usage real, não por estimativa de tokens comprimidos. Não há baseline completo de inferência medido nesta entrega.

| Experimento proposto                    | Baseline e carga                                                                                                   | Métricas                                                                           | Gate de adoção inicial proposto                                                                                                              |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Revalidação de upstream                 | Mesmo alvo, primeiro GET versus GET condicional, rede controlada                                                   | Bytes, duração p50/p95, taxa de sucesso; igualdade do relatório salvo horários     | Mesmo conteúdo e nenhuma falsa completude; redução observada de bytes em revalidação; sem meta de latência universal                         |
| Runtime local / llama.cpp já disponível | Configuração atual; corpus AB fixado; contexto curto/médio/longo; concorrência 1 e 2                               | Tempo até primeiro token, tokens/s, RSS, consumo e sucesso de tarefa               | Qualidade sem regressão material; p95 melhora ≥10% ou RSS cai ≥20%; reversão documentada se aumentar erros                                   |
| vLLM versus SGLang / backend atual      | Mesmo modelo/pesos/quantização, mesma GPU; concorrências 1, 4 e 16; prefixos únicos e repetidos                    | TTFT p50/p95, tempo total p95, throughput por GPU, VRAM, erros, cancelamentos      | ≥15% de ganho em uma métrica-alvo com qualidade e p95 das demais dentro de +5%; funcionamento de tools/streaming/cancelamento obrigatório    |
| Recuperação vetorial                    | Recuperação atual; corpus versionado de documentos autorizados e 200 consultas rotuladas                           | Recall@10, nDCG@10, p95, RSS, tempo/custo de ingestão                              | Recall@10 ≥95% do baseline e sem falhas de autorização; p95 melhora ≥20% ou memória cai ≥25%. Validar valores absolutos e inspeção dos erros |
| Analítica ClickHouse opcional           | Banco/consulta atual; só abrir experimento se relatórios sobre volume representativo falharem o orçamento acordado | p95 de agregações, ingestão, disco/RSS, custo operacional, igualdade de resultados | Resultados exatos e redução ≥30% em p95; ganho precisa justificar um serviço adicional. Sem gargalo, manter a base atual                     |
| Kernels DeepGEMM                        | Backend GPU existente com versão fixada e GPU suportada                                                            | Latência do kernel e da tarefa completa, VRAM, compilação, precisão                | Ganho de kernel sozinho é insuficiente: exige ≥10% na tarefa completa e qualidade preservada; não adotar sem mantenedor responsável          |

Os percentuais são **critérios iniciais propostos**, não resultados. Para comparação de latência, executar aquecimento documentado e pelo menos 200 observações por cenário, com ordem A/B alternada e amostras frias e quentes separadas. Publicar dispersão e erros junto das medianas/p95; usar intervalo de confiança quando houver amostra suficiente. Nas tarefas com modelo, manter conjunto de avaliação fixo e verificar qualidade, tool calls e resultados, além do tempo. Mais tokens/s não compensa conclusão incorreta.

Prioridade imediata: medir gargalos do núcleo e dos adaptadores atuais, verificar renderizações/consultas redundantes, paginar listagens e reutilizar eventos e contratos do Orca. Instalar toda a lista de projetos aumentaria a superfície de operação antes de demonstrar benefício.

## 5. Legado AB, automações e Nielsen

O Orca já documenta automações por host, cron/RRULE, timezone, prechecks e histórico. O plano AB deve homologar e adaptar essa base; não criar segundo scheduler ou banco concorrente de estado. O painel de revisão upstream é manual e não se torna uma rotina oculta. [L4]

Interoperabilidade do legado exige inventário real de endpoints, autenticação, schemas, licenças e efeitos para cada integração. A ausência de dados internos da Ratoeira não pode ser preenchida com uma stack presumida. Usar contratos/adaptadores e resultados esperados verificáveis; código ou skills proprietárias somente com acesso e licença válidos. Este trabalho não transcreveu vídeo nem confirmou a stack privada de terceiros.

O painel materializa cinco critérios do documento `UX_HEURISTICS.md`: estado visível e datado; ação explícita; bloqueio de duplicação e cancelamento; linguagem que não declara atualização aplicada; detalhes recolhíveis e erro persistente com próxima ação. A aplicação das heurísticas foi verificada por código e teste de DOM, não por piloto humano. Faltam validação visual em light/dark, teclado, leitor de tela, 390×844 e 1280×800, além de latência remota 50/200 ms, depois do gate de build. [L5]

## Fontes e rastreabilidade

- **G1:** [GitHub REST: Compare two commits](https://docs.github.com/en/rest/commits/commits#compare-two-commits).
- **A1:** [DeepGEMM, repositório e requisitos oficiais](https://github.com/deepseek-ai/DeepGEMM).
- **A2:** [DeepSeek, entidade operadora nos termos oficiais](https://cdn.deepseek.com/policies/en-US/deepseek-open-platform-terms-of-service.html).
- **R1:** [Yandex, anúncio do spin-off de ClickHouse](https://yandex.com/company/news/2021-09-20).
- **R2:** [ClickHouse, história da companhia](https://clickhouse.com/company/our-story).
- **R3:** [ClickHouse, código e licença](https://github.com/ClickHouse/ClickHouse).
- **E1:** [Qdrant, identificação de Berlim](https://qdrant.tech/legal/recruitment-privacy-policy/).
- **E2:** [Qdrant, quantização e seus tradeoffs](https://qdrant.tech/documentation/quantization/).
- **E3:** [Qdrant, código e licença](https://github.com/qdrant/qdrant).
- **E4:** [Mistral, entidade francesa](https://mistral.ai/legal/).
- **E5:** [Mistral Inference, estado arquivado e licença](https://github.com/mistralai/mistral-inference).
- **U1:** [UC Berkeley Sky Computing Lab: vLLM](https://sky.cs.berkeley.edu/project/vllm/).
- **U2:** [vLLM, código e licença](https://github.com/vllm-project/vllm).
- **S1:** [SGLang, documentação e governança LMSYS](https://sgl-project.github.io/).
- **S2:** [LMSYS, RadixAttention e SGLang](https://www.lmsys.org/blog/2024-01-17-sglang/).
- **S3:** [SGLang, código e licença](https://github.com/sgl-project/sglang).
- **C1:** [llama.cpp, repositório e licença](https://github.com/ggml-org/llama.cpp).
- **C2:** [llama.cpp, servidor e interfaces](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md).
- **L1:** `package.json` e `skill-guides/orca-plugin-authoring/references/manifest.md` na base fixada.
- **L2:** `src/shared/plugins/workers/plugin-host-api-panel-methods.ts` e `skill-guides/orca-plugin-authoring/references/host-api.md` na base fixada.
- **L3:** `skill-guides/orca-plugin-authoring.md`, `references/recipes.md` e manifesto do módulo.
- **L4:** [Orca, automações CLI na base](https://github.com/stablyai/orca/blob/d616c1b9eac49b4f4e1c73a1eb5e802c67c332bb/docs/site/content/docs/cli/automations.mdx) e `REFERENCE_COMPARISON.md` desta pesquisa.
- **L5:** `UX_HEURISTICS.md` desta pesquisa, com crédito e fonte primária de Jakob Nielsen; `docs/STYLEGUIDE.md` do Orca.
