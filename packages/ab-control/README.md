# AB control

API de observação do `orcad`, implementada sobre o `RuntimeClient` oficial do projeto. HTTP, SDK JavaScript, CLI e MCP usam o mesmo contrato de sete operações. O pacote não inicia agentes, envia texto ao terminal nem aceita nomes de RPC arbitrários. Execução autorizada permanece no terminal e no CLI/SDK de `ab-local-runtime`.

## Build e testes

Execute a partir da raiz do repositório, com Node 24 e as dependências do projeto instaladas:

```sh
npm ci --prefix packages/ab-control --ignore-scripts
node packages/ab-control/build.mjs
node --test --test-isolation=none packages/ab-control/tests/*.test.mjs
ORCA_BACKGROUND_LAUNCH=1 node --test --test-isolation=none packages/ab-control/tests/*.integration.mjs
```

A integração exige `out/orcad`, o Node fixado em `out/runtimes` e o bundle `out/mobile-web`. Construa com `pnpm build:mobile-web` e `pnpm build:orcad`. Os testes abrem portas efêmeras de loopback e PTYs reais em perfis descartáveis. `tests/runtime-fixture.mjs` é suporte de teste.

## Contrato

| Operação        | RPC oficial            | Parâmetros aceitos            |
| --------------- | ---------------------- | ----------------------------- |
| `status`        | `status.get`           | Objeto vazio                  |
| `repos`         | `repo.list`            | Objeto vazio                  |
| `workspaces`    | `worktree.list`        | `repo`, `limit`               |
| `folders`       | `folderWorkspace.list` | Objeto vazio                  |
| `terminals`     | `terminal.list`        | `worktree`, `limit`           |
| `terminal_read` | `terminal.read`        | `terminal`, `cursor`, `limit` |
| `terminal_wait` | `terminal.wait`        | `terminal`, `timeoutMs`       |

`limit` aceita 1–200 e assume 100. `terminal_wait` observa apenas a saída de um terminal existente e aceita 1–5000 ms; o padrão é 1000 ms. Atingir esse limite retorna `timeout`/HTTP 504. Parâmetros extras são recusados. Listagens de terminais excluem previews e layouts. O resultado mantém a forma do RPC oficial e sua identidade de runtime; consumidores devem observar as capacidades e a versão do runtime.

O [OpenAPI 3.1](openapi.json) é gerado diretamente de [contract.mjs](contract.mjs). Atualize com `node packages/ab-control/openapi.mjs --write`; o teste de contrato detecta divergência.

## Inicialização

Crie um diretório privado e uma credencial. O comando informa apenas o caminho:

```sh
mkdir -m 700 -p "$HOME/.ab-brainmaster"
node packages/ab-control/dist/cli.mjs init-auth "$HOME/.ab-brainmaster/control-token"
export AB_CONTROL_PROFILE=/caminho/do/perfil-orcad
export AB_CONTROL_TOKEN_FILE="$HOME/.ab-brainmaster/control-token"
export AB_CONTROL_PORT=8080
node packages/ab-control/dist/cli.mjs serve
```

O `orcad` deve estar ativo nesse perfil. Também é possível definir `AB_CONTROL_PAIRING_FILE` como caminho de um arquivo privado contendo a oferta real de pairing. A oferta passa ao `RuntimeClient`; a fachada não implementa autenticação ou protocolo Orca alternativos.

O HTTP usa loopback por padrão, verifica `Host`, exige bearer, recusa qualquer cabeçalho `Origin`, não habilita CORS, limita o corpo a 16 KiB e a resposta a 4 MiB. Existem no máximo quatro chamadas simultâneas por padrão. Requisições excedentes recebem 429. O timeout padrão é 15 segundos. No modo contêiner, o bind interno amplo exige `AB_CONTROL_CONTAINER=1` e `AB_CONTROL_PUBLISHED_PORT`; o compose publica exclusivamente em `127.0.0.1` no host.

## Clientes

```js
import { ControlClient } from './packages/ab-control/sdk.mjs'
const client = new ControlClient({
  url: 'http://127.0.0.1:8080',
  tokenFile: '/caminho/privado/control-token'
})
const observation = await client.call('status')
console.log(observation.result)
```

O SDK aceita `AbortSignal` no terceiro argumento de `call`. Cancelar abandona a observação no cliente. A chamada em andamento mantém sua vaga no servidor até o RPC terminar ou atingir o timeout; o cancelamento não autoriza trabalho novo nem equivale a interromper um processo no terminal.

```sh
export AB_CONTROL_URL=http://127.0.0.1:8080
export AB_CONTROL_TOKEN_FILE=/caminho/privado/control-token
node packages/ab-control/dist/cli.mjs status
node packages/ab-control/dist/cli.mjs terminal_read parametros.json
node packages/ab-control/dist/mcp.mjs
```

O último comando é o servidor MCP por stdio. Configure essas duas variáveis no cliente MCP e use `node` com o caminho absoluto de `dist/mcp.mjs`. Ele oferece as mesmas sete ferramentas de leitura e propaga cancelamento para o SDK. Não transmite credenciais pela linha de comando.

Para revogar o bearer anterior:

```sh
node packages/ab-control/dist/cli.mjs rotate-auth /caminho/privado/control-token
```

A troca do arquivo é atômica e o servidor relê a credencial a cada solicitação. O token anterior falha na próxima requisição. Observações já admitidas podem terminar dentro de seu timeout. Arquivos com permissões de grupo/outros em POSIX, symlinks ou conteúdo inválido são recusados. No Windows, o operador deve restringir a ACL do arquivo; a integração Windows ainda precisa de runner próprio.

Consulte [distribuição do servidor](../../docs/ab-brainmaster/SERVER_DISTRIBUTION.md) para compose, releases, rollback, appliance e acesso móvel.
