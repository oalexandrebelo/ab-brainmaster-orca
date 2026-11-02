# Comparação de referências e oportunidades — AB-BRAINMASTER-ORCA

**Pesquisa: 2 de novembro de 2026. Base técnica observada: Orca no commit `d616c1b9eac49b4f4e1c73a1eb5e802c67c332bb`.**

A estratégia recomendada é manter o Orca como núcleo de execução, revisão, hosts e clientes; acrescentar ao AB uma camada própria de contexto operacional, instruções, painéis e fluxos de negócio. A pesquisa não sustenta reconstruir uma stack privada da Ratoeira, nem substituir capacidades remotas e móveis já presentes no upstream. As melhores oportunidades iniciais são revisão de artefatos, rastreabilidade de fontes, organização do trabalho e homologação de plugins por versão.

Os nomes de arquivos deste relatório identificam documentação e código **lidos**, não testes executados. Não houve instalação de plugin, uso de pacote pago, execução do produto privado ou alteração do fork nesta frente.

## 1. O que cada evidência permite afirmar

| Evidência                                                        | O que sustenta                                                    | O que permanece não demonstrado                                        |
| ---------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Página pública da [Ratoeira](https://ratosdeia.com.br/ratoeira/) | Oferta e comportamento que o fabricante anuncia                   | Stack interna, schema de dados, execução real, desempenho e isolamento |
| [Skills da Ratos](https://ratosdeia.com.br/skills/)              | Catálogo, requisitos declarados, condições públicas de uso        | Conteúdo integral de cada pacote e eficácia de seus testes             |
| [Site Orca](https://www.onorca.dev/)                             | Posicionamento e recursos anunciados                              | Desempenho no hardware do AB e qualidade de cada integração            |
| Documentação e código Orca no commit fixado                      | Contratos e caminhos implementados que podem ser auditados        | Homologação do binário produzido pelo fork                             |
| Catálogos Orca fixados por commit                                | Identidade, versão, execução, licença declarada e hash de release | Auditoria de dependências e execução dos plugins                       |
| AB-Ratoeira 0.1.0 local                                          | Experiência anterior e possíveis ideias reutilizáveis             | Não representa a Ratoeira comercial nem a base deste fork              |

A página CHIA descreve uma operação organizada em contexto, habilidades, integrações e automações; informa uso de `AGENTS.md` e registros de integrações/rotinas. Isso orienta a **organização do AB**, sem exigir replicar textos, imagens ou arquivos privados. A contagem de mapas, skills e integrações dessa página é uma declaração do fabricante, não inventário verificado. [Fonte CHIA](https://ratosdeia.com.br/assets/ratosos/)

**Node, Go, PostgreSQL e Redis na Ratoeira privada: não verificados.** A linguagem de uma skill não revela a stack do portal. Uma menção a Supabase como integração também não identifica o banco interno. Não se deve converter essas hipóteses em diagramas da arquitetura real.

## 2. Comparação útil para o fork

A coluna Ratoeira resume **anúncios públicos**, não resultados de acesso ao sistema privado. A coluna Orca usa o site e a documentação versionada. As decisões AB são propostas desta pesquisa.

| Dimensão             | Ratoeira anunciada                                                                     | Orca observado                                                                            | Decisão para AB                                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Execução persistente | VPS Ubuntu própria; uso pelo navegador                                                 | Runtime local/remoto, `orca serve` e orcad; clientes pareados                             | Homologar o runtime upstream no servidor alvo; não construir outro executor                                      |
| Agentes e contas     | Claude Code/Codex; conta por conversa                                                  | Ambiente para vários agentes; contas e sessões pertencem ao host executor                 | Mostrar host, conta, modelo e destino antes do envio                                                             |
| Colaboração          | Conversas compartilhadas e continuidade pelo colega                                    | Múltiplos clientes podem compartilhar um servidor; filtro de workspaces por cliente       | Definir separadamente colaboração, posse de runtime e autorização por pessoa; pareamento não prova ACL de equipe |
| Arquivos e revisão   | Painéis lado a lado e versões atribuídas                                               | Workspaces, worktrees, editor, diff, controle de versão e plugins de documentos           | Organizar entregáveis e evidências sobre esses mecanismos                                                        |
| Apps                 | Aplicações com banco e ferramentas acionáveis pelo chat                                | Browser, artefatos e superfícies de extensão; cada integração tem contrato próprio        | Descrever para cada app o runtime, armazenamento, portas e verificação; não tratar preview como implantação      |
| Rotinas              | Agendamentos que continuam com o cliente fechado                                       | Presets, cron, RRULE, timezone, host, precheck, histórico e repetição                     | Criar receitas AB sobre automações existentes; preservar destino e semântica de execução                         |
| Mobile               | Acesso pelo celular                                                                    | App iOS/Android e Chat UI, arquivos, ações de controle, hosts e notificações documentados | Homologar as jornadas do AB no companion existente antes de criar outro cliente                                  |
| Atualizações         | Instalação paralela com retorno à anterior; acesso a versões ligado à oferta comercial | Código MIT e catálogos com releases fixadas, compatibilidade e revisão de mudanças        | Manter upstream identificável e pacote AB separado, com testes de atualização                                    |
| Memória operacional  | Histórico, decisões e busca                                                            | Arquivos, sessões, tarefas e recursos do host fornecem matéria-prima                      | Vincular decisão → fonte → artefato → execução, com pesquisa rastreável                                          |

Fontes: [Ratoeira](https://ratosdeia.com.br/ratoeira/), [Orca](https://www.onorca.dev/), [servidores remotos](https://github.com/stablyai/orca/blob/d616c1b9eac49b4f4e1c73a1eb5e802c67c332bb/docs/site/content/docs/remote-servers.mdx), [mobile](https://github.com/stablyai/orca/blob/d616c1b9eac49b4f4e1c73a1eb5e802c67c332bb/docs/site/content/docs/mobile.mdx), [automações](https://github.com/stablyai/orca/blob/d616c1b9eac49b4f4e1c73a1eb5e802c67c332bb/docs/site/content/docs/cli/automations.mdx). As capacidades de servidor e mobile estão documentadas como beta. Elas existem na base; sua implantação no AB continua exigindo homologação.

### Vídeo solicitado

O vídeo [lC2hhdGcmaU](https://www.youtube.com/watch?v=lC2hhdGcmaU) **não foi assistido nem transcrito**. A página de reprodução retornou throttling; o embed oficial vinculado pela página de produto retornou apenas metadados; o endpoint oficial oEmbed não ficou disponível. Não foram usados espelhos, sessões de terceiros ou acesso pago. Nenhum achado técnico deste relatório é atribuído ao conteúdo falado do vídeo.

## 3. Catálogo Orca: dimensão e contratos

Os JSON oficiais foram lidos e conferidos novamente nos commits fixados. A cópia por commit coincidiu byte a byte com o conteúdo observado em `main`:

- Oficial: 43 entradas, commit `30f40973b0d9d4b521f094a15173f932292c85f6` — [C1](https://raw.githubusercontent.com/stablyai/orca-plugins/30f40973b0d9d4b521f094a15173f932292c85f6/orca-catalog.json).
- Comunitário: 14 entradas, commit `1fc4435a109978c754045c4439d4678494eb78da` — [C2](https://raw.githubusercontent.com/stablyai/orca-community-plugins/1fc4435a109978c754045c4439d4678494eb78da/orca-catalog.json).
- Total: **57 plugins**; `data` 42, `declarative` 4, `sandboxed-ui` 10, `trusted-worker` 1.
- Licença declarada: 52 MIT; 2 MIT AND Apache-2.0; 1 MIT AND BSD-2-Clause; 1 MIT AND ISC; 1 MIT AND BSD-3-Clause.
- As contagens de instalações no site variaram entre resultados de cache; não são critério de qualidade nem entraram na pontuação.

O inventário completo, com versões, hashes, commits, capacidades e fonte, está em `sources-reference.json`. As licenças acima são **metadados declarados pelos catálogos**. Para redistribuir uma release, verificar também seus arquivos LICENSE/NOTICE e dependências incluídas; uma licença da aplicação principal não relicencia todos os seus plugins.

### Quatro perfis, quatro contratos

| Perfil           | Superfície disponível                                                   | Implicação para uma extensão AB                                                                          |
| ---------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `data`           | Temas, ícones, gramáticas e traduções                                   | Começar por localização e identidade onde o contrato atende; sem introduzir worker                       |
| `declarative`    | Comandos sobre ações nativas, atalhos, receitas de VM e itens de status | Usar para atalhos operacionais e receitas reproduzíveis; revisar comandos que serão executados           |
| `sandboxed-ui`   | Painéis e editores de arquivos em superfície isolada                    | Melhor ponto para relatórios, revisão e navegação de artefatos; não supor shell ou filesystem irrestrito |
| `trusted-worker` | Processo Node, eventos, hooks e métodos do host concedidos              | Reservar a funcionalidades que exigem esses poderes; o processo roda com permissões do usuário           |

[Manifesto](https://github.com/stablyai/orca/blob/d616c1b9eac49b4f4e1c73a1eb5e802c67c332bb/docs/reference/plugin-manifest.md) e [autoria](https://github.com/stablyai/orca/blob/d616c1b9eac49b4f4e1c73a1eb5e802c67c332bb/docs/reference/plugin-authoring.md) definem a API. `manifestVersion: 2` exige host compatível; `engines.orca` é o gate de versão; `pluginApi` identifica o major da API. A identidade instalada deriva do proprietário do repositório. Releases do catálogo têm `commit` e `contentHash`; contribuições e capacidades declaradas são comparadas ao manifesto. Um catálogo alternativo não deve se apresentar como o oficial. [Contrato do catálogo](https://github.com/stablyai/orca/blob/d616c1b9eac49b4f4e1c73a1eb5e802c67c332bb/docs/reference/plugin-catalog.md)

**Limite decisivo:** `contributes.skills`, `mcpServers`, `taskSources`, `connections`, `sidebarCards` e `agentHarnesses` estão reservados e precisam permanecer vazios nesse contrato. O AB pode manter suas instruções e integrações pelos mecanismos existentes do agente/runtime, mas não anunciar sua distribuição por esses campos ainda. Uma tela de plugin que parece um conector não cria automaticamente um contrato de credenciais ou de MCP. [Manifesto](https://github.com/stablyai/orca/blob/d616c1b9eac49b4f4e1c73a1eb5e802c67c332bb/docs/reference/plugin-manifest.md)

Um painel não pode enviar texto a terminal. `terminal:send` exige worker. Editor recebe documento e devolve edições pelo host; isso não corresponde a acesso geral aos arquivos. Hooks de worker têm semântica de falha relevante: o comportamento normal deixa a operação continuar em timeout/erro; quando a regra precisa bloquear, existe `onError: "deny"`. Essa configuração deve ser testada, não presumida. [API do host](https://github.com/stablyai/orca/blob/d616c1b9eac49b4f4e1c73a1eb5e802c67c332bb/docs/reference/plugin-host-api.md)

### Pontos de compatibilidade a resolver antes de distribuir

1. **Versão efetiva do host:** o `package.json` do commit base declara **1.4.214**. As 57 releases atuais exigem pelo menos 1.4.245; seis gramáticas exigem 1.4.246 e Excalidraw exige 1.4.248. O código contém os contratos novos. Isso é uma inconsistência a investigar no build/runtime, não prova de que todas falham. Medir a versão entregue ao serviço de plugins e executar o gate real no binário AB. Não baixar os mínimos dos manifests só para fazer a instalação passar. [Pacote](https://github.com/stablyai/orca/blob/d616c1b9eac49b4f4e1c73a1eb5e802c67c332bb/package.json), [C1](https://raw.githubusercontent.com/stablyai/orca-plugins/30f40973b0d9d4b521f094a15173f932292c85f6/orca-catalog.json), [C2](https://raw.githubusercontent.com/stablyai/orca-community-plugins/1fc4435a109978c754045c4439d4678494eb78da/orca-catalog.json).
2. **Instruções de publicação em transição:** a [página pública](https://www.onorca.dev/plugins/add) pede `publisher` explícito; o [manifesto no commit](https://github.com/stablyai/orca/blob/d616c1b9eac49b4f4e1c73a1eb5e802c67c332bb/docs/reference/plugin-manifest.md) já o trata como obsoleto e permite omissão em hosts a partir de 1.4.246. A decisão deve seguir o host alvo e o schema, mantendo compatibilidade com versões menores quando necessário.
3. **Validação não é execução:** `plugin validate` é estático; `plugin check` e `plugin test` executam código local sem sandbox, conforme a [referência CLI](https://github.com/stablyai/orca/blob/d616c1b9eac49b4f4e1c73a1eb5e802c67c332bb/skill-guides/orca-cli/references/plugins.md). Esta pesquisa só leu metadados.
4. **Publicação oficial é gratuita:** a [política pública](https://www.onorca.dev/plugins/add) não admite paywall ou chave de licença do próprio plugin, embora permita conexão a serviço pago do usuário. Isso impacta uma futura oferta comercial AB; não condiciona a construção de um catálogo próprio.
5. **Atualizar preservando origem:** um plugin instalado permanece associado ao catálogo de origem. O AB deve registrar versão do núcleo, catálogo e plugin usados em cada homologação; atualizar o fork e atualizar um plugin são operações diferentes.

## 4. Plugins com utilidade concreta para AB

A prioridade abaixo considera frequência de uso na operação, contribuição ao produto e tamanho da intervenção no núcleo. Não indica execução bem-sucedida neste ambiente.

| Plugin / release                                                                                                                                             | Recurso anunciado e acesso                                         | Licença declarada / host mínimo | Uso AB e validação proposta                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| [Excalidraw 2.1.0](https://www.onorca.dev/plugins/stablyai/orca-plugins/orca-excalidraw)                                                                     | Editor e criação de diagramas; sandboxed-ui                        | MIT / 1.4.248                   | **P1:** revisar mapas do projeto. Testar salvar, reabrir, conflito simultâneo e manutenção do original                   |
| [Spreadsheet Viewer 1.1.0](https://www.onorca.dev/plugins/stablyai/orca-plugins/orca-spreadsheet)                                                            | Abre Excel/ODS, folhas, fórmulas e valores; sandboxed-ui           | MIT / 1.4.245                   | **P1:** inspeção de planilhas de saída. Não prometer recálculo/edição; comparar fórmulas e células com corpus conhecido  |
| [Word Document Viewer 1.0.0](https://www.onorca.dev/plugins/stablyai/orca-plugins/orca-docx)                                                                 | Visualização DOCX declarada como leitura; sandboxed-ui             | MIT / 1.4.245                   | **P1:** revisar relatório/proposta no workspace. Verificar tabelas, imagens, cabeçalho e ausência de alteração dos bytes |
| [SQLite Browser 1.0.0](https://www.onorca.dev/plugins/stablyai/orca-plugins/orca-sqlite-browser)                                                             | Inspeção de banco, tabelas e filtros; leitura; sandboxed-ui        | MIT / 1.4.245                   | **P1:** diagnósticos em cópias de dados. Confirmar consulta, arquivo bloqueado e hash intacto                            |
| [Image Markup 1.0.2](https://www.onorca.dev/plugins/stablyai/orca-plugins/orca-image-markup)                                                                 | Anota imagem e preserva original interno; sandboxed-ui             | MIT / 1.4.245                   | **P2:** revisão visual de entregáveis. Testar reedição, exportação e recuperação                                         |
| [Narrow Markdown 0.1.0](https://www.onorca.dev/plugins/kolebayev/orca-md-layout)                                                                             | Leitura em coluna estreita; comunitário; sandboxed-ui              | MIT / 1.4.245                   | **P2:** leitura de conhecimento e especificações; medir tempo para encontrar decisões em texto longo                     |
| [Presentation Viewer 0.1.0](https://www.onorca.dev/plugins/thailoc-dev/orca-pptx-viewer)                                                                     | Preview de PPTX e formatos relacionados; comunitário; sandboxed-ui | MIT / 1.4.245                   | **P2:** conferir decks; medir elementos ausentes e registrar fidelidade por tipo                                         |
| [Dev Toolbox 0.1.0](https://www.onorca.dev/plugins/thailoc-dev/orca-dev-toolbox)                                                                             | Painel local de conversões e inspeções técnicas; comunitário       | MIT / 1.4.245                   | **P2:** utilitários do operador, opcionais para usuários de negócio                                                      |
| [Multipass 2.0.1](https://www.onorca.dev/plugins/stablyai/orca-plugins/orca-multipass-recipes)                                                               | Receita declarativa oficial de VM                                  | MIT / 1.4.245                   | **P2:** laboratório descartável. Testar criar, suspender, retomar e remover com limpeza comprovada                       |
| [Lima 1.0.2](https://www.onorca.dev/plugins/cemalkilic/lima-orca-vm-recipes)                                                                                 | Ciclo de VM por limactl; comunitário                               | MIT / 1.4.245                   | **P2:** alternativa de laboratório em host compatível; verificar o que atravessa a fronteira da VM                       |
| [Instabox 0.1.1](https://www.onorca.dev/plugins/insforge/orca-instabox-plugin) e [Upstash Box 0.1.1](https://www.onorca.dev/plugins/upstash/box-orca-plugin) | Receitas de máquinas remotas; Upstash se declara experimental      | MIT / 1.4.245                   | **P3:** avaliar só se a infraestrutura escolhida requer; medir custo, tempo e destruição dos recursos                    |
| [Grazr 0.6.3](https://www.onorca.dev/plugins/senadaruc/orca-grazr)                                                                                           | Rotação de contas; worker com acesso completo e terminal:send      | MIT / 1.4.245                   | **P3:** sem adoção padrão. Exige análise específica de contas, política do provedor e efeitos remotos                    |

O selo de acesso do catálogo é uma **categoria de permissões**, não descrição exata da funcionalidade. DOCX e SQLite aparecem na categoria que abre/edita arquivos, mas suas páginas anunciam leitura. O AB deve apresentar “visualizar” onde é isso que foi validado.

Temas e gramáticas devem entrar sob demanda. Os cinco casos de licença composta são: Gleam e Erlang (MIT AND Apache-2.0), MATLAB (MIT AND BSD-2-Clause), OCaml (MIT AND ISC) e Haskell (MIT AND BSD-3-Clause). Não há motivo operacional para instalar os 57 plugins por padrão.

## 5. Skills Ratos: o que aproveitar legitimamente

O catálogo público agrupa 25 skills em pesquisa, vídeo, imagem, comercial e publicação/tráfego. A FAQ anuncia uso na própria operação, inclusive entregas a clientes, e veda revenda da skill como própria. Também informa compra avulsa e acesso por comunidade com atualizações; isso **não equivale a licença aberta de redistribuição**. Não foi encontrada licença pública que autorize incorporar esses pacotes ao fork. [Catálogo e FAQ](https://ratosdeia.com.br/skills/)

| Família pública    | Exemplos identificados                                                                             | Oportunidade própria AB                                               |
| ------------------ | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Pesquisa           | triagem-youtube-ratos, seo-ranking-ratos, espiar-ads-ratos, aprender-ratos, whatsapp-local-ratos   | Fontes numeradas, período e lacunas explícitos                        |
| Vídeo              | carrossel-video, cortes-video-ratos, editar-video-ratos, transcribe, yt-transcript                 | Entradas/saídas rastreáveis, fila e progresso por estágio             |
| Imagem             | carrossel-ratos, criativo-ads-ratos, image-gen-ratos, gpt-image2-ratos, nanobanana-ratos           | Brief de marca próprio, versões e revisão visual                      |
| Comercial          | schwartz-copy, ogilvy-copy, apresentacao-comercial, proposta-comercial-ratos                       | Artefatos a partir de contexto autorizado e campos pendentes visíveis |
| Publicação/tráfego | ads-ratos, meta-ads-ratos, google-ads-ratos, ga4-ratos, publicar-social-ratos, comentario-dm-ratos | Destino verificável, preview, confirmação e resultado auditável       |

A soma dos itens apresentados por família é 25. A lista identifica produtos; não reproduz instruções ou código privado.

### Padrões públicos que podem orientar testes independentes

| Fonte específica                                                                      | Afirmação pública útil                                          | Critério AB criado nesta pesquisa                                                                            |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| [yt-transcript](https://ratosdeia.com.br/skills/yt-transcript/)                       | Obtém legendas existentes usando yt-dlp, sem ASR                | Se legenda não estiver disponível, registrar falha de aquisição; não produzir suposta transcrição            |
| [transcribe](https://ratosdeia.com.br/skills/transcribe/)                             | Anuncia áudio, faster-whisper e ffmpeg locais                   | Benchmark com áudio próprio: duração, idioma, WER e timestamps; separar download de transcrição              |
| [aprender-ratos](https://ratosdeia.com.br/skills/aprender-ratos/)                     | Cruzamento de fontes, divergências e curadoria humana           | Toda afirmação factual do relatório aponta para fonte e trecho; consenso exige quantidade explícita          |
| [whatsapp-local-ratos](https://ratosdeia.com.br/skills/whatsapp-local-ratos/)         | Lê cópia de dados do WhatsApp macOS; não envia mensagens        | Não anunciar cobertura Windows/Linux. Teste só em base sintética/consentida; zero escrita na origem          |
| [proposta-comercial-ratos](https://ratosdeia.com.br/skills/proposta-comercial-ratos/) | Proposta HTML e campos não informados visíveis                  | Valores ausentes ficam pendentes; precisão de preços/datas 100% no corpus controlado                         |
| [meta-ads-ratos](https://ratosdeia.com.br/skills/meta-ads-ratos/)                     | SDK oficial, validação real da conexão e revisão das alterações | Primeiro conector AB: leitura, destino e preview; escrita só após contrato revisável e autorização concreta  |
| [publicar-social-ratos](https://ratosdeia.com.br/skills/publicar-social-ratos/)       | Preview, conta de destino, modo de teste e link final           | Simulação não deve produzir post; confirmação identifica payload/conta; retorno inclui ID verificável        |
| [gpt-image2-ratos](https://ratosdeia.com.br/skills/gpt-image2-ratos/)                 | Vendedor anuncia geração usando plano ChatGPT                   | Não converter anúncio em promessa de API suportada; selecionar integração cujo contrato possa ser verificado |

Para skills compradas legitimamente, homologar em workspace isolado do cliente autorizado, preservando versão, hash, licença recebida, dependências e fixtures próprias. Não publicar o pacote ou seu conteúdo num repositório AB. Sem o pacote autorizado, testar a implementação independente e os resultados esperados — não alegar teste da skill original.

## 6. Backlog priorizado, com resultado mensurável

Escala: impacto 1–5 sobre jornadas frequentes; esforço relativo P/M/G, sem estimativa de horas antes da inspeção de implementação. Todos os números de aceite são **metas propostas**, não desempenho já medido.

| Ordem | Entrega                                      | Impacto / esforço | Aceite                                                                                                          | Dependência e relação com upstream                                                |
| ----- | -------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| P0.1  | Compatibilidade de núcleo e plugins          | 5 / M             | Versão efetiva registrada; plugins selecionados aceitos pelo gate legítimo; release anterior continua listada   | Investigar diferença 1.4.214 vs mínimos 1.4.245–248                               |
| P0.2  | Identidade de execução sempre visível        | 5 / M             | 100% das ações de iniciar/retomar mostram host, workspace e agente; zero envio ao destino errado em 30 cenários | Usar estado do runtime e UI existentes                                            |
| P0.3  | Rastreabilidade do conhecimento              | 5 / M             | 20 decisões de fixture ligam fonte e artefato; zero fonte inventada; versão do contexto registrada              | Arquivos/contexto próprios; não depender de campos reservados                     |
| P1.1  | Kit de revisão de entregáveis                | 4 / P–M           | Corpus com 10 arquivos por formato; hashes intactos nos viewers; perdas visuais classificadas                   | DOCX, planilha, SQLite; Excalidraw após gate 1.4.248                              |
| P1.2  | Receitas AB de automação                     | 5 / M             | Próximas três ocorrências e timezone corretos; pausar impede próximo disparo; falha expõe ação de recuperação   | Usar automações upstream; “Run now” ignora precheck e deve informar isso          |
| P1.3  | Painel de operação AB                        | 4 / M             | Identificar trabalho bloqueado em até 10 s; abrir destino em até duas ações; sem duplicar fonte de verdade      | painel sandboxed-ui ou worker estritamente necessário                             |
| P1.4  | Localização e vocabulário de negócio         | 4 / M             | 90% de acerto no destino de comandos por usuários piloto; termos consistentes no desktop/mobile                 | Language packs onde suportado; manter tokens/primitivos                           |
| P2.1  | Primeiro conector comprovado                 | 4 / G             | Conta validada com leitura real; escopo explícito; IDs de efeito reconciliados; nenhuma conexão fictícia        | Escolher um caso concreto; manifesto de plugins não oferece connections/MCP ainda |
| P2.2  | Laboratório de runner descartável            | 3 / M–G           | Dez ciclos sem recursos órfãos; cancelar/retomar sem repetir efeito externo                                     | Multipass/Lima conforme host                                                      |
| P2.3  | Curadoria de plugins e update canário        | 4 / M             | Duas atualizações de núcleo e plugin mantendo arquivos e aprovações; rollback documentado                       | Catálogo AB identificado, origem e hashes mantidos                                |
| P3    | Pacotes estéticos, jogos e rotação de contas | 1–2 / variável    | Só entram após demanda e teste específico                                                                       | Não bloqueiam operação principal                                                  |

## 7. Preservar atualizações sem congelar o produto

Manter um registro de compatibilidade por release: commit upstream, patches AB, versão efetiva, plugins fixados, contratos usados, hosts/clientes testados e falhas abertas. Preferir extensões documentadas e contribuições pequenas ao núcleo. Quando uma capacidade reservada for implementada upstream, migrar um adaptador AB por vez, com teste do estado antigo e do novo.

Um update de catálogo deve gerar comparação de licença, capacidades, perfil, origem, mínimo do host, commit e hash. A comparação precede a execução. Mudanças de licença/origem/capacidades precisam ficar visíveis ao operador; novos temas não devem mascarar a superfície de aprovação. O upstream já documenta superfícies de decisão protegidas no [Style Guide](https://github.com/stablyai/orca/blob/d616c1b9eac49b4f4e1c73a1eb5e802c67c332bb/docs/STYLEGUIDE.md).

Não afirmar compatibilidade retroativa porque o JSON foi parseado: listar uma release e executar seu contrato são operações distintas. A manutenção ganha previsibilidade quando há corpus pequeno de jornadas críticas: abrir projeto, iniciar agente, recuperar conexão, revisar arquivo, executar rotina e aplicar update selecionado.

## 8. Registro de fontes

`sources-reference.json` contém URLs, refs de recuperação, commits e limites por fonte, além dos 57 registros de catálogo. Referências técnicas principais: [manifesto](https://github.com/stablyai/orca/blob/d616c1b9eac49b4f4e1c73a1eb5e802c67c332bb/docs/reference/plugin-manifest.md), [catálogo](https://github.com/stablyai/orca/blob/d616c1b9eac49b4f4e1c73a1eb5e802c67c332bb/docs/reference/plugin-catalog.md), [API](https://github.com/stablyai/orca/blob/d616c1b9eac49b4f4e1c73a1eb5e802c67c332bb/docs/reference/plugin-host-api.md), [autoria](https://github.com/stablyai/orca/blob/d616c1b9eac49b4f4e1c73a1eb5e802c67c332bb/docs/reference/plugin-authoring.md), [CLI de plugins](https://github.com/stablyai/orca/blob/d616c1b9eac49b4f4e1c73a1eb5e802c67c332bb/skill-guides/orca-cli/references/plugins.md), [licença do núcleo](https://github.com/stablyai/orca/blob/d616c1b9eac49b4f4e1c73a1eb5e802c67c332bb/LICENSE).

`UX_HEURISTICS.md` traduz as dez heurísticas de Jakob Nielsen em fluxos, critérios verificáveis, métricas e protocolo de teste do AB. Ele não atribui ao NNGroup os limites numéricos propostos para o projeto.
