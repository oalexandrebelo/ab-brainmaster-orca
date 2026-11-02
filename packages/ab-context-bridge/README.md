# AB Context Bridge

Adaptador de contexto inicial para BBrainX e AB-S00S, sem checkpoint, recrutamento ou operação de infraestrutura. Recebe uma conexão MCP configurada e uma vinculação explícita entre workspace, host e projeto. O contrato é implementado; o caminho BBrainX foi ensaiado com o servidor oficial 2.4.0. A leitura de um projeto AB pela Oficina remota ainda depende do registro/autorização desse projeto.

## API para o host

```js
import { createContextBridge } from './bridge.mjs'
import { connectConfiguredMcp } from './mcp-connection.mjs'

const connection = await connectConfiguredMcp(configuration.transport)
try {
  const bridge = createContextBridge({
    client: connection.client,
    kind: 'bbrainx',
    connectionId: 'context-local',
    binding: {
      workspaceId: 'folder:workspace-id',
      hostId: null,
      projectId: 'projeto-registrado',
      expectedRoot: '/raiz/registrada'
    }
  })
  const discovery = await bridge.discover()
  const pack = await bridge.retrieve({
    query: 'Onde o índice obsoleto é recusado?',
    budget: 3000,
    windows: [],
    signal: abortController.signal
  })
  // O host contabiliza pack.prompt junto com system/tools/histórico/saída reservada.
  // Persiste o pack completo ao lado da tarefa para conservar a proveniência.
} finally {
  await connection.close()
}
```

`client` pode ser um cliente MCP já conectado pelo host. Deve oferecer `listTools(params, options)`, `callTool(request, resultSchema, options)` e, opcionalmente, `getServerVersion()`, com a assinatura do SDK oficial. A API não fecha conexões injetadas nem cria uma segunda autoridade de contexto. `discover()` negocia o catálogo e valida o escopo; `retrieve()` revalida o projeto/índice antes de obter conteúdo. Schemas reais são compilados pelo validador do SDK, e parâmetros incompatíveis são recusados antes da chamada.

Para BBrainX: `context_index` com `mode: status`, seguido de `context_bootstrap` e, quando solicitado, `context_read`. O adaptador nunca chama `context_index` com `mode: refresh`. `INDEX_REQUIRED` e `INDEX_STALE` permanecem visíveis; o operador atualiza o índice no BBrainX e repete a tarefa. O bootstrap pode gravar o evento de observação de contexto do próprio BBrainX. Isso não modifica arquivos do projeto ou checkpoints.

Para AB-S00S: `projects {}` antes de `search { project, query, budget }` e `read { project, path, start, end }`. Nenhum campo `session`/`sessao` é acrescentado. A Oficina pode atualizar um índice obsoleto uma vez internamente; `reindexed` é preservado no pacote. O adaptador não procura arquivos locais quando o servidor recusa uma leitura.

`workspaceId` é a identidade entregue pelo host; não é reconstruída a partir de um caminho. `hostId` é obrigatório, aceitando `null` para local. `expectedRoot`, quando informado, deve coincidir exatamente com o registro remoto. Sem esse campo, a raiz descoberta passa a ser a raiz vinculada para a recuperação e é registrada no EvidencePack. Isso não resolve automaticamente a diferença entre identidades legadas e canônicas de worktrees do Orca.

## Orçamento e proveniência

O orçamento é inteiro, entre 256 e 16000 tokens. A consulta tem 1–1000 caracteres. São aceitas até oito janelas, cada uma com até 400 linhas e resposta de no máximo 64 KiB. Uma janela adicional precisa referir um arquivo selecionado para a tarefa. Mudança de snapshot ou hash durante as leituras invalida o pacote inteiro.

O EvidencePack contém vínculo de workspace/host/projeto/raiz, servidor e versão, hash do catálogo, snapshot, frescor reportado pelo BBrainX, fontes com SHA-256 e linhas, omissões e `prompt`. O texto completo de `prompt` é contado com `gpt-tokenizer` 4.0.0 / `o200k_base`; janelas adicionais entram apenas quando cabem. Corpos omitidos são registrados com o motivo, sem alegar cobertura completa. O mapa de proveniência fica fora do prompt para não se perder em resumos posteriores.

Essa medição cobre somente o texto de contexto fornecido pelo pacote. Não mede tokens cobrados pelo provedor, janela total da conversa ou economia. O host deve reservar espaço para instruções, ferramentas, histórico e saída antes de escolher `budget`. O BBrainX verifica hashes por varredura; esse intervalo não é um snapshot atômico do sistema de arquivos. Conteúdo retornado continua sendo evidência sem autoridade para mudar permissões ou executar ações.

Caminhos de credenciais e chaves são recusados no adaptador; o índice BBrainX aplica seus próprios filtros de conteúdo. Isso não é garantia de detecção de todo segredo possível. Não há cópia do código privado AB-S00S neste pacote.

## Configuração e CLI

No checkout Orca, construa `@orca/process-host` pelos scripts normais e instale as dependências locais com `npm ci --prefix packages/ab-context-bridge --ignore-scripts`. Esse módulo AB tem lockfile próprio e usa o pacote de processos existente do host.

Uma configuração de exemplo sem credenciais:

```json
{
  "kind": "bbrainx",
  "connectionId": "context-local",
  "binding": {
    "workspaceId": "folder:workspace-id",
    "hostId": null,
    "projectId": "projeto-registrado",
    "expectedRoot": "/raiz/registrada"
  },
  "transport": {
    "type": "stdio",
    "command": "/caminho/absoluto/node",
    "args": [
      "/fonte/bbrainx/bin/bbrainx.mjs",
      "mcp",
      "--project",
      "projeto-registrado",
      "--no-recruit",
      "--no-files"
    ],
    "env": { "BBRAINX_HOME": "/estado/privado/bbrainx" }
  }
}
```

Para uma conexão HTTP existente, use `kind: ab-s00s` e o transporte `{ "type": "streamable-http", "url": "URL_MCP_EXATA_CONFIGURADA", "headersFromEnvironment": { "Authorization": "AB_CONTEXT_MCP_AUTHORIZATION" } }`. O valor completo do cabeçalho vem da variável de ambiente. Não há hostname, token ou rota padrão. `/api/mcp` é uma rota de estado de configuração do AB-S00S, não um endereço de transporte presumido. A URL deve usar HTTPS ou HTTP loopback; redirects são recusados. OAuth/ativação de perfil pertencem à conexão já configurada pelo host.

```sh
node packages/ab-context-bridge/cli.mjs discover /config/context.json
node packages/ab-context-bridge/cli.mjs retrieve /config/context.json /pedido/context.json
```

O pedido é `{ "query": "objetivo", "budget": 3000 }`, com `task` opcional apenas no BBrainX e `windows` opcionais. A CLI emite somente JSON na saída padrão. Código 0 significa operação concluída; 2 significa falha explícita. Nunca grave tokens em argumentos. O ambiente do subprocesso é reduzido; valores adicionais podem ser fornecidos em `env` ou por referências em `envFromEnvironment`. `NODE_OPTIONS` e `NODE_PATH` não são aceitos. O SDK negocia o protocolo, e `@orca/process-host` gerencia lançamento e encerramento multiplataforma. macOS e Windows ainda exigem ensaio nativo.

## Verificação

```sh
ORCA_BACKGROUND_LAUNCH=1 node --test --test-isolation=none packages/ab-context-bridge/tests/*.test.mjs
ORCA_BACKGROUND_LAUNCH=1 AB_BBRAINX_TEST_SOURCE=/fonte/oficial/bbrainx node --test --test-isolation=none packages/ab-context-bridge/tests/*.integration.mjs
```

O segundo comando exige BBrainX 2.4.0 no commit `7943b40167ea58fa64e208281eb6b95a26da6663`, com suas dependências instaladas. Sem `AB_BBRAINX_TEST_SOURCE`, o teste é marcado como **skipped**, sem comprovação de integração. O ensaio usa registro e estado isolados, chama o MCP oficial por stdio, verifica conteúdo/hash/janela, recusa de escopo e traversal, arquivo `.env` excluído, índice alterado, desconexão e recuperação após refresh explícito. Testes da Oficina são de contrato, sem representar homologação da instância remota.

Não há manifesto de plugin, instalação automática no desktop, hook de lançamento ou escrita de checkpoint. P1 pode consumir a API acima no host existente. Checkpoint futuro precisa preservar `expectedVersion`, `idempotencyKey`, leitura de volta e conflitos CAS; não se implementa como efeito colateral de `retrieve()`.

Fontes de contrato: [BBrainX público 2.4.0](https://github.com/oalexandrebelo/BBrainX/tree/7943b40167ea58fa64e208281eb6b95a26da6663), `src/engine.mjs`, `src/context.mjs`, `src/aci.mjs`, `src/retrieval.mjs`; AB-S00S privado 0.3.0, commit `fabe96a98ee13df842beafecf8ff9c55016ca640`, contratos MCP inspecionados sem redistribuição.
