# Runtime local AB

O pacote `packages/ab-local-runtime` executa uma tarefa textual em um Ollama configurado explicitamente, obtém contexto fresco pela ponte P2 quando habilitada e conserva pergunta, EvidencePack, resposta e proveniência. A API e a CLI são consumíveis pelo host. A fachada HTTP/MCP de `ab-control` continua com o escopo descrito em sua própria documentação; não anuncia uma rota de inferência que não implementa.

A aceitação usa o PTY e o pareamento reais do `orcad`, BBrainX oficial 2.4.0 por MCP stdio e Qwen3 1.7B em CPU no perfil final, com baseline 0.6B preservado. O harness reinicia o `orcad`, consulta a tarefa por um novo processo da CLI e repete a chave idempotente. Não certifica todas as funções do desktop IDE, outros modelos, macOS ou Windows.

## Jornada offline verificada

O [run 41582866804](https://github.com/oalexandrebelo/ab-brainmaster-orca/actions/runs/41582866804), commit `13013d24dea66c1b9c6345b3cd6f72b7ac1d691c`, concluiu a jornada `orcad → pareamento → PTY → CLI → MCP BBrainX → Ollama/Qwen → journal`. O ZIP de 25.088 bytes, SHA-256 `346d07fc8dcf49816955cc59e2204f201beab6aca91ef99b1f2fa266fb20d6f3`, contém dez membros verificados. Os sete arquivos de contexto coincidem com os objetos Git desse commit; resultado inicial, recuperado e idempotente são idênticos byte a byte. O CI registra pareamento, PTY e preservação da instalação, com mudança do identificador de runtime após o reinício.

O contêiner tinha somente loopback, `NetworkMode=none` e tentativa TCP externa recusada com `ENETUNREACH`. Ollama 0.40.13 e Qwen3:1.7B, digest `8f68893c685c3ddff2aa3fffce2aa60a30bb2da65ca488b61fff134a4d1730e7`, foram provisionados antes do isolamento. Os três critérios factuais passaram. O tempo do provedor nesta pergunta foi **15,239 segundos**, com 1.179 tokens de entrada avaliados e 42 gerados.

O perfil usou UID/GID 1001, 2 CPUs, 4 GiB de memória, `MemorySwap` de 8 GiB, remoção de todas as capabilities e `no-new-privileges`; a raiz desse contêiner era gravável. O contêiner de produção com raiz somente leitura tem uma prova separada. Não se declara p95, pico de memória, qualidade geral do modelo, funcionamento integral do IDE ou ensaio físico do iPhone.

As execuções anteriores `5ae456b9…` (run `41561063152`) e `8d1a8105…` (run `41575659816`) registraram 17,619 e 27,305 segundos de provedor, respectivamente. Os hashes do prompt, da resposta e dos sete arquivos de contexto permanecem iguais na execução atual. São observações individuais de CI; as diferenças de duração não demonstram ganho causado pela correção, benchmark ou regressão. Cada recibo mantém sua referência de fonte.

Recibos e limites: [CI_EVIDENCE_20261103.md](CI_EVIDENCE_20261103.md).

## Contrato de execução

`node packages/ab-local-runtime/build.mjs` gera `dist/cli.mjs` e `dist/runtime.mjs`, autocontidos para Node 24.22.1. O build usa `esbuild` do lockfile principal e as dependências instaladas da ponte P2; não precisa de dependências próprias de runtime além dos módulos nativos do Node. A distribuição pode copiar esses dois arquivos. Ollama e pesos são provisionados separadamente: incluir a CLI na ISO não inclui os bytes do servidor/modelo.

```js
import { createLocalRuntime } from './packages/ab-local-runtime/runtime.mjs'

const runtime = await createLocalRuntime(configuration)
try {
  const record = await runtime.submit(
    {
      idempotencyKey: 'task-2026-11-02-001',
      task: 'Qual erro é emitido quando o índice está stale? Cite o arquivo e as linhas.',
      context: {
        query: 'BBrainX INDEX_STALE discover retrieve',
        budget: 1200
      }
    },
    { signal: abortController.signal }
  )
  const sameRecord = runtime.get(record.id)
} finally {
  await runtime.close()
}
```

`submit()` aguarda o estado terminal e retorna o registro completo. Erros de configuração, admissão e conflito idempotente lançam `LocalRuntimeError`. Falhas depois da admissão são persistidas e retornadas no registro. Os estados são `preparing`, `running`, `succeeded`, `failed`, `cancelled`, `timed_out` e `interrupted`. Somente `succeeded` contém uma resposta confirmada do provedor. `result.truncated` informa término por limite de tokens.

`get(id)` retorna o registro ou `null`. `list({ limit, offset })` retorna páginas de até cem resumos. `recover()` informa quais tarefas o processo atual encontrou interrompidas ao abrir o estado; não dispara inferências. `close()` cancela a tarefa ativa, aguarda sua gravação e libera a propriedade do estado. Um segundo chamador da mesma chave e requisição acompanha a promessa já ativa; a primeira admissão controla seu cancelamento.

```sh
node packages/ab-local-runtime/cli.mjs submit /config/local.json /pedido/task.json
node packages/ab-local-runtime/cli.mjs get /config/local.json UUID_DA_TAREFA
node packages/ab-local-runtime/cli.mjs list /config/local.json
node packages/ab-local-runtime/cli.mjs recover /config/local.json
```

A CLI escreve JSON na saída padrão. Código 0 significa sucesso da operação; 2 sinaliza erro, tarefa não concluída com sucesso ou ID inexistente. `SIGINT` e `SIGTERM` solicitam cancelamento. Os arquivos JSON de entrada são limitados a 128 KiB antes do parse.

## Configuração explícita

```json
{
  "stateDirectory": "/estado/ab-local",
  "provider": "ollama",
  "endpoint": "http://127.0.0.1:11435",
  "model": "qwen3:0.6b",
  "allowedModels": [
    {
      "name": "qwen3:0.6b",
      "digest": "7df6b6e09427a769808717c0a93cadc4ae99ed4eb8bf5ca557c90846becea435"
    }
  ],
  "concurrency": 1,
  "limits": {
    "timeoutMs": 120000,
    "maxPromptBytes": 32768,
    "maxOutputBytes": 32768,
    "maxOutputTokens": 512,
    "templateTokenReserve": 2048,
    "contextWindowTokens": 8192,
    "numThreads": 2
  },
  "contextBridge": {
    "kind": "bbrainx",
    "connectionId": "bbrainx-local",
    "binding": {
      "workspaceId": "identidade-fornecida-pelo-host",
      "hostId": null,
      "projectId": "projeto-registrado",
      "expectedRoot": "/projeto/registrado"
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
      "env": { "BBRAINX_HOME": "/estado/bbrainx" }
    }
  }
}
```

O endpoint de inferência aceita somente uma origem HTTP(S) numérica `127.0.0.1` ou `[::1]`, sem caminho, query, fragmento ou credenciais. A conexão HTTP usa `node:http`/`node:https` diretamente e não herda um proxy HTTP do ambiente. Redirects são recusados. `allowedModels` exige nome e digest SHA-256 completos, conferidos contra `/api/tags` a cada nova tarefa. Um modelo ausente ou com digest diferente falha antes de `/api/chat`.

O runtime não instala, baixa nem inicia modelos. O operador prepara o Ollama e os pesos antes da tarefa. Não há fallback para nuvem. Cada chamada solicita `num_gpu: 0`, `num_thread`, `num_ctx`, `num_predict`, temperatura zero, seed 42, `think: false` e `keep_alive: 0`. A identidade e a versão reportadas pelo servidor, o digest instalado, os parâmetros e as métricas da resposta ficam no recibo. Esses parâmetros não tornam a saída de um LLM uma prova de correção.

Somente uma tarefa é admitida por runtime e diretório de estado. Outra chave recebe `RUNTIME_BUSY`, sem registro parcial. Não há fila ilimitada. O limite total de 100 ms a 600 s cobre recuperação de contexto, checagem do modelo e inferência; o fechamento do transporte MCP pode levar seu intervalo adicional de encerramento. O corpo HTTP é limitado durante a leitura, antes do parse JSON.

Os perfis permitidos nesta versão são Qwen3 0.6B e 1.7B Q4_K_M, fixados por digest. O digest 0.6B aparece na configuração acima; o 1.7B usa `8f68893c685c3ddff2aa3fffce2aa60a30bb2da65ca488b61fff134a4d1730e7`. Perfis desconhecidos são recusados com `MODEL_PROFILE_UNSUPPORTED`. Antes de inferir, `/api/show` precisa confirmar tokenizer `gpt2` com pré-tokenizador `qwen2`, ausência de BOS adicional/sistema persistido e template de 1.723 bytes com SHA-256 `ae370d884f108d16e7cc8fd5259ebc5773a0afa6e078b11f4ed7e39a27e0dfc4`. Outra identidade de tokenizer/template produz `MODEL_PROFILE_MISMATCH`.

Nesse perfil byte-BPE auditado, o runtime impõe antes de `/api/chat`: **bytes UTF-8 do envelope completo + reserva de template de pelo menos 2.048 tokens + reserva de saída ≤ `num_ctx`**. Também aplica `maxPromptBytes`. O envelope inclui sistema, pergunta, contexto e a serialização das mensagens; o template fixado recebe somente essas duas mensagens, sem ferramentas. A reserva conservadora é maior que o próprio template em bytes. Com janela 8.192 e saída 512, sobram no máximo 5.632 bytes para o envelope. Excesso gera `CONTEXT_WINDOW_LIMIT`; o runtime não corta o texto para fazê-lo caber.

A contagem `o200k_base` do EvidencePack pertence à ponte e não é o tokenizer Qwen. A política troca parte da capacidade útil por um limite verificável no perfil aceito, sem alegar contagem exata da janela ou cobrança. `prompt_eval_count` e `eval_count` reais ficam no recibo, e uma resposta que não confirme contagem de entrada dentro da reserva é recusada. Essa política não é generalizada automaticamente a outros modelos/tokenizers.

## Contexto e confiança

Ao configurar `contextBridge`, cada tarefa exige sua própria consulta. `submit()` abre a conexão configurada, chama `createContextBridge(...).retrieve()`, confere `packId` e o hash do texto, fecha a conexão e envia `pack.prompt.text` no pedido do modelo. O caminho é utilizado pela execução de produção e pela aceitação; não é apenas uma função auxiliar disponível.

A ponte preserva os erros de escopo, índice ausente, índice obsoleto, snapshot alterado e orçamento. O runtime não atualiza índices implicitamente. A recuperação fica no BBrainX, seguida por nova tarefa com outra chave. O comando MCP é configuração confiável do operador, lançado pelo transporte P2 baseado em `@orca/process-host`. Texto recuperado e resposta do modelo não podem alterar esse comando ou executar ferramentas.

Transportes MCP aceitos nesta política local são stdio e HTTP(S) numérico loopback com sua rota explícita. Uma conexão Oficina remota não entra automaticamente nessa política. Configurar um subprocesso stdio não bloqueia a rede desse subprocesso; o isolamento de saída da prova vem do namespace do container.

O registro conserva o EvidencePack inteiro, sua origem/servidor, vínculo workspace/host/projeto/raiz, snapshot, linhas, hashes, omissões e orçamento. O harness liga o `workspaceId` ao ID real recebido de `folderWorkspace.create` e usa o seletor oficial `id:folder:<id>` para o PTY. As fontes de contexto da prova são cópias byte a byte dos módulos públicos AB, verificadas por SHA-256 e registradas em um folder workspace sem Git.

`result.executable` é sempre `false`. A resposta é texto não confiável para leitura humana; não existe caminho que execute código ou shell gerado pelo modelo. Credenciais da configuração não são serializadas no registro. Pergunta, contexto e resposta são armazenados integralmente, portanto o diretório de estado pertence ao usuário autorizado daquele projeto.

## Persistência, idempotência e recuperação

O banco `local-runtime.sqlite` usa SQLite nativo do Node 24.22.1, WAL e `synchronous=FULL`. Cada transição grava atomicamente um registro completo com estado, artefatos e proveniência. O registro tem SHA-256 conferido em leitura. Essa integridade detecta alteração acidental; não é uma assinatura contra alguém que possua escrita no banco.

A chave idempotente é representada por hash. O hash da requisição inclui pergunta, pedido de contexto e configuração normalizada. Repetir a mesma chave e conteúdo devolve o mesmo registro, inclusive após reinício, sem nova leitura de contexto ou inferência. Alterar conteúdo ou configuração mantendo a chave produz `IDEMPOTENCY_CONFLICT`.

Uma transação SQLite controla o proprietário do diretório com PID, hostname e token aleatório. Um proprietário vivo ou cuja morte não pode ser comprovada gera `STATE_BUSY`. Após morte comprovada do processo anterior no mesmo host, o novo processo toma a propriedade e marca `preparing`/`running` como `interrupted` na mesma transação. O banco precisa estar em disco local, fora de sincronização que copie individualmente arquivos ativos; não é um protocolo de coordenação entre máquinas ou sobre NFS. Backups devem usar a API SQLite apropriada ou ser feitos depois do fechamento completo, sem copiar DB/WAL/SHM vivos separadamente.

Interrupção, timeout ou cancelamento podem acontecer depois de o modelo ter produzido uma resposta que o cliente não confirmou. O registro informa essa incerteza e nunca tenta novamente a chave automaticamente. Há deduplicação de admissões e recuperação de estado, sem promessa de execução exatamente uma vez no provedor. O teste de recuperação mata um processo real durante uma requisição HTTP pendente e verifica que a reabertura não reproduz a inferência.

As APIs de caminho são multiplataforma e `chmod` é aplicado somente onde suportado. Subprocessos MCP e de aceitação usam o wrapper de processos Orca. A implementação não exige shell para as tarefas normais; o harness de PTY/container é explicitamente Linux. Ensaios nativos macOS e Windows permanecem fora da comprovação desta rodada.

## Evidência e reprodução

```sh
ORCA_BACKGROUND_LAUNCH=1 node --test --test-isolation=none packages/ab-local-runtime/tests/*.test.mjs
```

Os sete testes de contrato cobrem política de endpoint/digest, persistência e idempotência após reabertura, exclusão de outro proprietário, concorrência, cancelamento, timeout, redirects, limites de prompt/saída morte real do processo e snapshot profunda do pedido contra mutação do chamador após admissão. Os servidores HTTP desses testes são fixtures de protocolo; não são apresentados como inferência real.

A primeira execução local com MCP e modelo reais produziu a tarefa `78e14242-2a41-428d-a254-dd4e2f1391d2`, com EvidencePack `28367c6a60bc89d9c93cee041d7db70b85d28eca4e033ec0ead5319c26962fcd`. Qwen3 respondeu corretamente `INDEX_STALE` e citou o trecho 241–297, mas não extraiu os dois métodos públicos pedidos. Essa resposta parcial permanece no recibo local. Uma tentativa anterior foi recusada com `INDEX_STALE` antes da inferência; o índice foi depois atualizado explicitamente em estado isolado.

O harness `proof/run-proof.mjs` usa uma segunda versão explícita da pergunta e verifica os campos `publicMethods = [discover, retrieve]`, `staleError = INDEX_STALE` e uma citação a `bridge.mjs`. A avaliação factual fica separada do transporte e da recuperação. Na CI há um passo posterior específico que exige os três critérios. A validação é uma extração pequena, não um benchmark geral nem recomendação de Qwen 0.6B para produção.

A comparação posterior usou **exatamente os mesmos bytes de prompt**, SHA-256 `9d14f036b90d9133463bb2ebaebe875eefc7a67b48f7d2f3ea5479c9685e1a4c`, sem mudar pergunta ou resposta esperada. Ambos reportaram 1.179 tokens de entrada. Os números abaixo pertencem a uma execução em CPU com duas threads, sem generalização de desempenho:

| Perfil                         | Tempo total reportado pelo Ollama | Métodos                | Erro stale    | Citação                                 | Resultado factual        |
| ------------------------------ | --------------------------------: | ---------------------- | ------------- | --------------------------------------- | ------------------------ |
| Qwen3 0.6B, digest `7df6b6e0…` |                           13,81 s | `discover`, `retrieve` | `120`         | `bridge.mjs`, intervalos 241–297/61–120 | Falhou                   |
| Qwen3 1.7B, digest `8f68893c…` |                           25,05 s | `discover`, `retrieve` | `INDEX_STALE` | `bridge.mjs:241-297`                    | Passou os três critérios |

O perfil da CI foi escolhido como **1.7B**, pois acertou essa tarefa sob o mesmo critério e o custo medido cabe no limite de 4 GiB/duas CPUs. O runner reportou projeção de aproximadamente 2.314 MiB somando memória host e repack; esse número não é uma medição de pico RSS. O modelo continua exigindo avaliação mais ampla antes de uso de engenharia em produção.

A jornada final 1.7B executada inteiramente em `/tmp` produziu a tarefa `27e9aeba-df08-4ffe-ab1d-417520c7ead0`: pareamento real, PTY, CLI distribuída, MCP BBrainX, inferência, reinício do `orcad` e nova consulta da tarefa concluíram com sucesso. Repetir a chave devolveu registro idêntico. Depois de fechar todos os handles, o banco não tinha WAL/SHM, a tabela de proprietário estava vazia e a cópia fechada conservava a linha `succeeded`, seu hash e o mesmo registro do artefato JSON. Os três critérios factuais passaram.

Uma tentativa anterior dentro do workspace sincronizado mostrou saída `succeeded`, seguida de leitura de um WAL antigo com estado `running` reaparecido depois do reinício. A forense preservou esse estado: a data de criação do WAL era posterior à recuperação, mas seu mtime e conteúdo eram anteriores ao sucesso. Não houve cópia manual de estado vivo no harness. A divergência não se reproduziu na jornada isolada em `/tmp`; o indício é compatível com reposição externa de arquivos pelo ambiente, e não é apresentado como falha comprovada do SQLite ou do produto. O harness usa `/tmp` por padrão e o ensaio Docker serve como contraprova independente de isolamento e persistência.

Para reproduzir a parte funcional em Linux com os artefatos de host e controle já construídos, dependências P2 instaladas, BBrainX oficial instalado e Ollama local iniciado:

```sh
ORCA_BACKGROUND_LAUNCH=1 \
AB_BBRAINX_SOURCE=/fonte/BBrainX \
AB_PROOF_DIRECTORY=/evidencias/ab-local \
AB_OLLAMA_ENDPOINT=http://127.0.0.1:11435 \
node packages/ab-local-runtime/proof/run-proof.mjs
```

Sem `AB_OFFLINE_REQUIRED=1`, o recibo declara explicitamente que essa execução não foi isolada da rede. Nesta máquina de trabalho Docker não estava disponível e namespaces de rede foram recusados pelo ambiente; uma URL loopback não é tratada como prova offline.

O workflow [ab-offline-proof.yml](../../.github/workflows/ab-offline-proof.yml) prepara antes do isolamento:

- Host Orca real, Node 24.22.1, ponte P2 e adaptador oficial do controle.
- BBrainX público no commit `7943b40167ea58fa64e208281eb6b95a26da6663`, dependências pelo lockfile e licença MIT preservada.
- Ollama 0.40.13, arquivo Linux SHA-256 `c9490e0f520be21271d969e6703f012268b1d39f8b70dd58854e5bfef7a75bb6`.
- Manifesto Qwen3 1.7B `8f68893c685c3ddff2aa3fffce2aa60a30bb2da65ca488b61fff134a4d1730e7` (859 bytes), com tamanho e hash de cada blob conferidos, incluindo GGUF `3d0b790534fe4b79525fc3692950408dca41171676ed7e21db57af5c65ef6ab6` (1.359.279.776 bytes). O registry é consultado pela tag `1.7b`, mas qualquer mudança no manifesto fixado por hash/tamanho interrompe a preparação.

Em seguida executa o container com `--network none`, CPU 2, memória 4 GiB, sem capacidades e sem privilégios adicionais. A prova exige interfaces somente loopback e tenta uma conexão TCP externa real a `1.1.1.1:443`, que deve falhar. O modo Docker fica no arquivo de inspeção do container. Só depois o harness executa o MCP, a tarefa através do PTY, a inferência, o reinício e as leituras idempotentes.

A imagem da prova usa `AB_PROOF_UID` e `AB_PROOF_GID` iguais aos do runner Linux que é dono do diretório de evidências montado. O UID deve ser pelo menos `1000` e o GID positivo. A conta existente desse UID é reutilizada; quando ausente, a imagem cria `ab-proof`. O diretório pessoal vem da conta em `/etc/passwd`; os modelos já verificados são copiados com esse proprietário. O início exige UID/GID esperados, home correspondente e propriedade do diretório de saída, e registra `process-identity.json`. Isso permite gravar os recibos com modo `0600` mantendo `--cap-drop ALL`, sem permissões globais de escrita. A abertura do log é confirmada antes de iniciar o Ollama.

O staging usa `AB_PROOF_ASSETS` em um diretório absoluto existente fora do checkout; na CI, `$RUNNER_TEMP/ab-offline-assets`, propagado por `GITHUB_ENV`. Para preparar a imagem localmente, crie um diretório novo, provisione nele `bbrainx/`, `ollama/` e `models/` pelos passos verificados do workflow e execute `AB_PROOF_ASSETS=/caminho/externo/ab-offline-assets node packages/ab-local-runtime/proof/stage-image.mjs`. O script cria `stage/` nesse diretório e recusa destino já existente, caminho interno ao repositório ou symlink que resolva para dentro dele. Não há default dentro de `packages/ab-local-runtime`, evitando copiar a árvore fonte para um descendente de si mesma. Antes do staging, construa `mobile-web`, `orcad`, controle e runtime local como no workflow.

Os artefatos de CI incluem recibo, tarefa com contexto e proveniência, resultados recuperado e repetido, índice, configuração de isolamento e identidades das imagens. Tokens de pareamento, perfil Orca e diretórios privados não são enviados. O índice oficial Ubuntu 24.04 está fixado em `sha256:fe81560990fae86dc4743202b2cb4d3df98d0bcf949173cecef15ce1127ef852`, obtido do registry oficial e conferido contra o hash do manifesto em 2026-11-02. Dockerfile e pull usam exatamente essa referência. `apt` continua usando os repositórios da distribuição durante a preparação; isso fixa a imagem de origem sem alegar builds bit a bit idênticos.

A existência do workflow não representa uma execução bem-sucedida: a comprovação offline exige um run concluído e os respectivos artefatos. O escopo comprovável é **jornada do PTY Orca ao pipeline AB offline**, sem homologação integral do IDE desktop.

Referências primárias: [BBrainX no commit utilizado](https://github.com/oalexandrebelo/BBrainX/tree/7943b40167ea58fa64e208281eb6b95a26da6663), [Ollama 0.40.13](https://github.com/ollama/ollama/releases/tag/v0.40.13), [API Ollama](https://docs.ollama.com/api/introduction), [SQLite do Node](https://nodejs.org/api/sqlite.html). Os contratos da ponte estão em [CONTEXT_INTEGRATION.md](./CONTEXT_INTEGRATION.md).
