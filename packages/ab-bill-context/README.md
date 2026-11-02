# AB-BRAINMASTER · Contexto opcional

Este pacote implementa um candidato de plugin Orca para ligar/desligar compressão de conversas em **novos terminais Claude CLI de workspaces locais de pasta, com chave de API, em Linux/macOS**. O proxy real é o `billion-context` 0.1.212. O plugin começa desligado, não instala dependências e não baixa modelos.

**Compatibilidade do host verificada em P1:** o pacote do aplicativo continua `1.4.214`. O core upstream já calcula `pluginHostVersion(app.getVersion())` como o maior valor entre a versão do aplicativo e o schema mais novo: neste checkout, `1.4.248`. A instalação real usa esse valor; não houve aumento artificial de versão, redução do engine `>=1.4.248` nem backport. O teste mantém a recusa de um host que anuncie diretamente `1.4.214` e aceita a versão efetiva calculada pelo core.

No build Linux AB real, o módulo foi instalado e consentido, o painel preparou Node 24.22.1, billion-context 0.1.212 (`daa082ea`) e Claude Code 2.1.316 oficiais, e passou pelo ciclo OFF → ON → OFF via interface/teclado. O plano produzido pelo painel também iniciou o proxy real e confirmou health/PID/watchdog. Isso não homologa uma tarefa Claude com provedor externo: nenhuma credencial ou chamada a modelo foi usada. Veja `docs/ab-brainmaster/P1_HOST.md` para evidências e limites.

## Fluxo implementado

1. O painel lista workspaces pelo contrato real `workspace.list`. A preparação aceita somente `kind: folder`, ID `folder:<id>`, `hostId: null` ou `local` e diretório local existente. Worktrees Git são recusados antes do toggle: a lista retorna `identity:wt2:<host>:<instanceId>`, enquanto o hook entrega `repoId::path`; a API pública não expõe uma ponte inequívoca entre eles.
2. A pessoa informa caminhos absolutos de Node, `billion-context/dist/index.js`, Claude e uma pasta privada para sessões, além do endpoint e limite real do modelo.
3. Fora do hook, a preparação executa `node --version`, `bili --version` e `claude --version`, confere pacote/versão e grava fingerprints SHA-256 dos executáveis. Ela não inicia o modelo nem um proxy.
4. Com o toggle ligado, `agent.launch.before` reescreve somente lançamentos Claude do workspace preparado. O comando precisa ser uma invocação literal, sem operadores ou expansão de shell. Comandos ambíguos, outros agentes dentro desse workspace e argumentos de retomada/configuração são recusados explicitamente.
5. O wrapper verifica os fingerprints novamente e confirma pelo caminho real que o diretório do terminal pertence ao workspace preparado, inclusive resolvendo symlinks. Exige `ANTHROPIC_API_KEY` no ambiente original do cliente e cria um diretório novo por sessão. Inicia o **bili real** em loopback, com porta estrita, config/registry/sessões próprios e sem anexar instâncias existentes.
6. Só depois de `GET /__bili/health` confirmar versão, PID do processo criado e watchdog do supervisor, o wrapper inicia Claude com `ANTHROPIC_BASE_URL` na rota `/bili/<upstream>` e compactação nativa desativada para essa execução. O proxy injeta as ferramentas ACP pelo protocolo Anthropic.
7. Encerrar Claude encerra somente o proxy criado por essa execução. Uma falha do proxy interrompe explicitamente o processo Claude e preserva os arquivos. O wrapper não faz fallback para a API direta.

O painel usa `orca.plugin.request(name, input, options)`, a fachada HTML real do Orca que encapsula `host.call('plugin.request', { name, input, timeoutMs })` e extrai `output`. Não usa um campo `data` inventado.

## OFF, ON e falhas

| Estado                                                      | Comportamento                                                                                                                                                                                                                                   |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OFF                                                         | O hook devolve o comando original sem analisar/reformatar. Nenhum processo proxy é iniciado.                                                                                                                                                    |
| ON, configuração válida, novo Claude no workspace escolhido | O wrapper inicia um proxy privado, exige health próprio e inicia o cliente com a rota verificada.                                                                                                                                               |
| ON, preparação inválida                                     | Lançamento recusado com mensagem para verificar a configuração.                                                                                                                                                                                 |
| ON, outro agente no workspace escolhido                     | Recusa explícita; desligar o toggle libera o fluxo normal.                                                                                                                                                                                      |
| Outro workspace                                             | O hook deixa o lançamento original passar, inclusive quando a configuração do workspace escolhido ficou inválida.                                                                                                                               |
| ON sem qualquer plano de workspace recuperável              | Recusa explícita global, pois não existe escopo confiável para aplicar. Desligue o toggle ou desabilite o plugin e prepare novamente.                                                                                                           |
| Porta ocupada                                               | Recusa a instância externa e encerra apenas seu próprio filho.                                                                                                                                                                                  |
| Proxy não saudável, versão inesperada ou watchdog incorreto | Claude não inicia.                                                                                                                                                                                                                              |
| Proxy termina durante uma sessão                            | Mensagem explícita, término do cliente, arquivos preservados. Não muda para upstream direto.                                                                                                                                                    |
| Toggle desligado durante sessão ativa                       | Vale para lançamentos seguintes; a sessão ativa continua com seu proxy.                                                                                                                                                                         |
| Worker do plugin falha                                      | `onError: deny` solicita ao host recusar o lançamento. Esse comportamento também pode bloquear quando o último toggle era OFF, pois o host não consegue consultar um worker morto. Desabilitar o plugin no Orca restaura o lançamento original. |

O hook fica no caminho de lançamentos de terminal. O core o exclui em retomadas/restores; o chat estruturado interno não é coberto. O plugin não altera essas rotas. Windows, SSH, WSL, OAuth, Claude Desktop, Vertex, Bedrock, Codex, Pi, OMP e OpenCode continuam fora do escopo validado deste candidato. A biblioteca upstream possui mais integrações, mas elas não foram implicitamente habilitadas aqui.

## Proteções e privacidade

O processo proxy recebe um ambiente reduzido, separado do ambiente original do Claude. Não recebe chaves de API por herança; recebe os cabeçalhos normais que o Claude encaminha em cada requisição, portanto o proxy ainda é uma fronteira de confiança com acesso ao conteúdo e à autenticação em trânsito.

- `BILI_AUTO_MODE_FORGE=0` e `autoModeForge.enabled=false` são obrigatórios. O upstream auditado ativa por padrão uma resposta local de autorização em certo classificador Claude; isso fica desativado. Um teste com o proxy real comprova que uma resposta sintética de bloqueio chega do upstream e é preservada.
- Atualização automática, reinício automático, download de engine SQLite, MITM, relay administrativo, dump de corpo, keepalive de cache e resumo por provedor externo ficam desativados neste perfil.
- `BILI_PARENT_PID` arma o watchdog do proxy. O health precisa anunciar o PID do supervisor desta execução. SIGTERM recebe prazo de dois segundos antes de SIGKILL do filho criado. O cleanup aguarda mais até dois segundos para confirmar o término após SIGKILL; se não confirmar, devolve erro explícito e não grava um encerramento normal. Desligar o toggle não chama esse cleanup para sessões já abertas.
- A execução exige Node 24+ para SQLite nativo; o upstream em si anuncia Node 20+.
- A sessão recebe diretório aleatório novo com modo POSIX 0700; config/plano/recibos usam 0600. Não se reusa estado de outro projeto. Instâncias e sessões preexistentes do usuário não são modificadas.
- As conversas e resumos ficam persistidos em SQLite e envelopes JSON **sem criptografia própria neste perfil**. A criptografia de disco e o acesso do usuário do sistema operacional continuam relevantes. Logs diagnósticos internos do upstream não foram certificados como completamente livres de conteúdo sensível.
- O plugin não contém telemetry collector. Desativa os canais periódicos de advisory/release/update do upstream. Isso não prova ausência de toda telemetria possível no cliente Claude ou na API escolhida.

O proxy continua enviando o contexto reconstruído à API escolhida e pode gerar chamadas adicionais para compressão. Não oferece inferência offline por si só, sandbox de ferramentas, gratuidade de tokens ou uma janela real de um bilhão de tokens.

## Contexto, memória e recuperação

`billion-context` comprime histórico de conversa em resumos reversíveis e mantém originais quando persistidos. O nome se refere a fluxo acumulado de tokens numa sessão longa; não significa carregar um bilhão de tokens na RAM, no KV cache ou numa requisição.

O limite informado é aplicado em `compress.modelContextLimit`; o perfil usa pressão em 70% e emergência em 90%. Esses limiares são política do adaptador, não números medidos de qualidade. O limite real do provedor, sua saída reservada, ferramentas, imagens e erro do estimador continuam impondo um teto. Nunca configure um valor maior que o deployment de fato aceita.

Cada diretório `session-*` guarda `proxy.json`, `receipt.json`, `sessions/` e um marcador `closed.json` quando o wrapper encerra normalmente. Os recibos não registram prompts nem chaves. OFF não elimina arquivos. A recuperação operacional é inspeção/exportação com o `bili export` da mesma versão apontado explicitamente à pasta daquela sessão. Exporte os resumos para uma **nova conversa** se precisar sair do proxy; não devolva o histórico integral de uma sessão longa diretamente a um modelo com janela menor. Este candidato não implementa retomada transparente, botão de exportação, backup automático ou política de retenção.

BBrainX e AB-S00S são complementares: o primeiro fornece contexto verificado de arquivos/checkpoints/memória; o segundo expõe e limita os contratos MCP por projeto. O contrato `projects → search/read` está registrado em `LEGACY_CONTEXT_CONTRACT` e na auditoria. **Não há um conector BBrainX/AB-S00S funcionando dentro deste plugin ainda.** Nenhum endpoint, segredo, allowlist ou projeto foi presumido. O catálogo atual consultado não anuncia `bbrainx-dev`, `ab-s00s` ou `ab-brainmaster-orca`.

## Validação reproduzível

Sem dependências de produção próprias:

```sh
cd packages/ab-bill-context
npm test
```

Integração com o pacote oficial previamente instalado em um diretório isolado:

```sh
AB_BILI_TEST_ENTRY=/caminho/billion-context/dist/index.js npm run test:integration
```

O teste de schema usa o código Orca do checkout e o Zod da versão correspondente; o loader de teste apenas resolve imports TypeScript sem extensão. Não altera o loader de produção:

```sh
AB_ORCA_TEST_SOURCE=/caminho/checkout-orca \
AB_ORCA_TEST_ZOD=/caminho/node_modules/zod/index.js \
node --test --test-isolation=none tests/orca-schema.integration.mjs
```

Validação realizada em Node 24.22.1: sete testes de contrato, dois testes com CLI/proxy real e upstream HTTP sintético, um teste usando o schema Orca real. O pacote npm executado anuncia 0.1.212, build `daa082ea`. A fonte revisada está em `dec393f430cb7495a54133e3d7fad4bc2bea8968`; não se confunde o build publicado com esse HEAD posterior. Não houve chamada a modelo real, benchmark de economia, login, instalação no Orca, screenshot renderizado no Orca ou execução de `orca plugin check/test`. O checkout não tem o aplicativo/CLI construído disponível nesta frente.

## Atribuição e licença

Este produto usa [billion-context](https://github.com/ranxianglei/billion-context) e seu [acp-kernel](https://github.com/ranxianglei/acp-kernel), de ranxianglei, para compressão de contexto. O texto `LICENSE.billion-context` preserva integralmente a licença upstream auditada: texto MIT **mais termo adicional de atribuição visível em superfície de produto/documentação**. O painel também exibe a atribuição. Não declare essa dependência como MIT puro sem registrar o termo adicional. O kernel e pesos de modelos não foram vendorizados neste pacote.

Referências primárias: `src/shared/plugins/events/plugin-hook-payloads.ts`, `src/main/ipc/pty/spawn-agent-launch-plugin-hook.ts`, `src/shared/plugins/contributions/plugin-hook-contribution.ts`, `src/shared/plugins/manifest/plugin-schema-field-docs.ts`, `src/shared/plugins/frames/plugin-panel-shell-facades.ts` no Orca; `src/server/admin.ts`, `src/server.ts`, `src/knobs.ts`, `src/paths.ts`, `src/auto-mode-forge.ts` e `CONFIGURATION.md` no billion-context.
