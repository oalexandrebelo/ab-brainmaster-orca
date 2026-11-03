# Distribuição do servidor AB-BRAINMASTER-ORCA

O servidor usa o `orcad`, seus PTYs, sua persistência e o `RuntimeClient` oficiais do fork. `ab-control` acrescenta uma API de observação com SDK, CLI e MCP. O processo `ab-control/host.mjs` inicia o `orcad` e a fachada; Docker ou systemd supervisionam esse processo. Não existe um segundo escalonador de agentes.

## Evidência e limites

Os testes locais usam o servidor compilado, pairing E2EE real e PTYs reais. Eles verificam nonce de comando, pasta sem Git, reconexão, preservação da identidade de instalação, registro da pasta e saída do terminal após reinício. Também verificam recusa de um dispositivo removido do registro na próxima conexão; rotação de bearer; Host, Origin e tamanho de corpo; limite de concorrência; cancelamento; e equivalência HTTP/SDK/CLI/MCP.

O ensaio de releases inicia dois slots contendo a mesma compilação atual, com metadados de versão de aceitação diferentes. Ele prova staging, hashes, troca atômica da seleção, bloqueio durante execução, retenção de perfil e retorno ao primeiro slot. Isso não prova compatibilidade de dados entre duas versões históricas distintas do produto. Não existe downgrade automático de esquema de dados.

O workflow [AB runtime and appliance](../../.github/workflows/ab-runtime.yml) executa a aceitação real dentro do build Docker, inicia um contêiner sem rede e verifica reinício com volume persistente. Para o repositório proprietário, pushes em `ab-brainmaster/**` também constroem a ISO e executam QEMU TCG sem NIC. Esses gates só constituem evidência depois que o runner terminar com sucesso. A presença do workflow ou de uma receita não equivale a uma imagem homologada.

As bases Node e Debian estão fixadas por digest. O Node embarcado também é verificado pelo hash fixado pelo Orca, e cada release tem inventário SHA-256. Os pacotes Debian obtidos durante o build ainda vêm dos índices assinados da distribuição. Não foi demonstrada igualdade binária entre duas construções completas de Docker ou ISO.

## Imagem Docker verificada

O job de contêiner `125741459455` do [run 41582866839](https://github.com/oalexandrebelo/ab-brainmaster-orca/actions/runs/41582866839) passou em `13013d24dea66c1b9c6345b3cd6f72b7ac1d691c`. O estágio de aceitação/builder executou nove testes reais, sem skips. A imagem runtime final recebeu um ensaio separado: rede `none`, usuário não root, raiz somente leitura e reinício com identidade persistida. A inspeção conferiu 27 blobs, 13 camadas e os 498 arquivos do payload, com hashes, tamanhos e modos correspondentes.

Referência: `ab-brainmaster-orca:13013d24dea66c1b9c6345b3cd6f72b7ac1d691c`. Image ID: `sha256:47869e66575023af2b309df37f2fb05dafea0bfc0f1b3219a9b783f6b72551e6`. SHA-256 do arquivo Docker compactado: `a5b1c3d01d7872ae1a39c2e9b4857bfe3ccf4a0e2869d7645cef0676c4e3b3be`.

O ZIP tem **271.850.558 bytes** e SHA-256 `9e415693e7fcfb772f6663bc4ee7b7c77d7098228333effaf3c90a2205f03123`. A imagem compactada tem **204.271.814 bytes**. O payload soma **202.832.533 bytes**; o manifesto tem SHA-256 `f47b2d7dc7e061e7d3c79faf7541e0d08524a82eebc58f54a7c6a37d78429c37` e o tar, `3e1d6588badb0924f083a1bee4f35303be7ba0e7ccdd5584322bf117af3d7e12`. O inventário mantém 241 pacotes, 246 textos npm e dois OFL.

A reconstrução passiva do inventário efetivo das 13 posições de camada — 12 blobs de camada distintos, com repetição de uma camada vazia —, em ordem e com whiteouts/substituições, encontrou 500 arquivos de release idênticos ao archive separado: 498 do payload, mais manifesto e digest. Seis módulos de implantação coincidiram com os blobs do commit. As duas funções de entrada do host tiveram AST equivalente depois da normalização explícita de posições, grafia de literais, imports e aliases locais. O protocolo de publicação durável da chave também foi localizado e revisado no `orcad-server.js` efetivamente empacotado. Essas verificações são delimitadas às funções e recursos registrados; não são uma prova formal de equivalência de todo o bundle.

A inspeção dos arquivos não iniciou um segundo Docker. A execução do contêiner não substitui os boots da appliance, a implantação remota nem o provisionamento dos modelos. A distribuição anterior `8d1a8105…` permanece histórica e não recebe essas correções por associação.

## API e execução local

A API implementada contém apenas sete operações: `status`, `repos`, `workspaces`, `folders`, `terminals`, `terminal_read` e `terminal_wait`. O [contrato e OpenAPI](../../packages/ab-control/README.md) descrevem parâmetros, limites, autenticação e erros. Não há endpoint de RPC arbitrário ou de execução de tarefas.

Tarefas autorizadas usam o terminal oficial ou o CLI/SDK de `ab-local-runtime`. O pacote local exige seu backend Ollama e os bytes do modelo provisionados separadamente. A imagem de servidor/appliance não deve ser descrita como uma instalação completa de inferência enquanto esse pack não estiver instalado e validado. Nenhuma GPU é reservada por esta distribuição.

## Docker

O [compose](../../deploy/ab-brainmaster/compose.yaml) usa bridge dedicada, usuário sem root, filesystem raiz somente leitura, nenhuma capability, `no-new-privileges`, limite de quatro CPUs, 4 GiB e 256 processos. Perfil, workspaces e home ficam em volumes dedicados. Não monta Docker socket nem a rede do host. O runtime e a API escutam em todas as interfaces somente dentro do contêiner; suas publicações no host usam `127.0.0.1`.

O build local usa BuildKit e um checkout Git independente, com diretório `.git` dentro do contexto. Essa metadata é montada somente para leitura durante a compilação, para que o guard oficial resolva o commit real; não há SHA substituto nem cópia de `.git` para o payload. O estágio final verifica sua ausência nos diretórios da aplicação. Um arquivo de fontes sem `.git`, ou um linked worktree cujo arquivo `.git` aponta para fora do contexto, não atende esse caminho: use um checkout independente. O checkout de CI usa `persist-credentials: false`; ao enviar o contexto a um builder, use também um checkout sem credenciais persistidas.

Na Oficina, o nome gerenciado é `oficina-ab-brainmaster-orca`. O Compose genérico tem `name: ab-brainmaster-orca`; a inicialização autorizada deve selecionar o nome da Oficina por `-p` ou `COMPOSE_PROJECT_NAME`, que têm precedência sobre o campo YAML conforme a [documentação Docker](https://docs.docker.com/compose/how-tos/project-name/). Se escolher `-p`, repita o argumento em todos os comandos `compose`, inclusive `config`, `up` e `exec`; alternativamente, exporte `COMPOSE_PROJECT_NAME=oficina-ab-brainmaster-orca` antes de toda a sequência. Antes de subir, confira a configuração renderizada e as duas portas efetivamente atribuídas. Esse ajuste de namespace não foi aplicado remotamente nesta entrega.

Defina as portas fornecidas pela administração da máquina. O arquivo recusa subir sem valores explícitos:

```sh
export AB_CONTROL_PORT=PORTA_ATRIBUIDA_PELA_ADMINISTRACAO
export AB_RUNTIME_PORT=PORTA_ATRIBUIDA_PELA_ADMINISTRACAO
docker compose -f deploy/ab-brainmaster/compose.yaml up --build -d
docker compose -f deploy/ab-brainmaster/compose.yaml exec core node /opt/ab-release/ab-control/cli.mjs status
```

As expressões de porta acima são instruções de preenchimento, não números reservados. A criação do projeto remoto AB-PCSRV depende da autorização pendente da Oficina. Este repositório não pressupõe que essas portas já existam ou estejam reservadas.

### Carregar a imagem testada sem reconstruir

Depois da aceitação real do contêiner, o workflow exporta a imagem com a referência `ab-brainmaster-orca:COMMIT_SHA_COMPLETO`. Antes de exportar, compara seu image ID com o da imagem `:ci` ensaiada. O artefato `ab-runtime-release-linux-x64` inclui `ab-brainmaster-orca-linux-x64.docker.tar.gz`, seu `.sha256` e `docker-image-receipt.json`, além do release usado pela appliance. O recibo registra commit, referência, image ID e hash do arquivo. A exportação usa `docker image save`; não inclui os volumes, credenciais ou estado dos contêineres de aceitação.

No diretório extraído do artefato, confira o checksum e carregue a imagem:

```sh
sha256sum --check ab-brainmaster-orca-linux-x64.docker.tar.gz.sha256
docker load --input ab-brainmaster-orca-linux-x64.docker.tar.gz
export AB_IMAGE=ab-brainmaster-orca:SHA_COMPLETO_DO_COMMIT
docker image inspect "$AB_IMAGE" --format '{{.Id}}'
```

Preencha `AB_IMAGE` com o `imageRef` exato do recibo e compare o retorno de `docker image inspect` com seu `imageId`. O checksum usa somente o basename, portanto funciona nesse diretório após a extração. Confirme também que o commit e o run correspondem à distribuição revisada; o hash sozinho não autentica a origem.

Com o checkout dessa revisão disponível localmente, execute o compose a partir de sua raiz, usando as duas portas atribuídas e a referência já carregada:

```sh
export AB_CONTROL_PORT=PORTA_ATRIBUIDA_PELA_ADMINISTRACAO
export AB_RUNTIME_PORT=PORTA_ATRIBUIDA_PELA_ADMINISTRACAO
docker compose -f deploy/ab-brainmaster/compose.yaml up --no-build --pull never -d
docker compose -f deploy/ab-brainmaster/compose.yaml exec core node /opt/ab-release/ab-control/cli.mjs status
```

O compose usa `AB_IMAGE` quando definido e mantém `ab-brainmaster-orca:local` como padrão para builds locais. `--no-build --pull never` exige a imagem carregada e permite subir sem registry ou reconstrução. A existência desse caminho de exportação só constitui entrega validada depois que o respectivo job terminar com sucesso.

O primeiro boot cria a credencial privada no volume, instala o release verificado e ativa esse slot. Um novo build da imagem não substitui automaticamente uma seleção persistida. Atualizações exigem staging e ativação explícitos. `restart: unless-stopped` restaura o processo após reinício do Docker/host; o healthcheck observa o runtime pela API autenticada.

## Releases locais e rollback

Construa os artefatos antes de empacotar:

```sh
pnpm build:mobile-web
pnpm build:orcad
node packages/ab-control/build.mjs
node packages/ab-local-runtime/build.mjs
node config/scripts/ab-release-package.mjs /destino/novo/release 0.1.0
```

O empacotador recusa um destino existente. Sua saída contém o digest do manifesto, que deve ser conferido por um canal confiável. Hashes detectam alteração de bytes; não substituem uma assinatura de procedência. O inventário recusa symlinks e arquivos especiais. Não há download, atualização ou publicação automáticos.

```sh
node config/scripts/ab-release-cli.mjs stage /dados/releases /destino/novo/release DIGEST_SHA256_DO_MANIFESTO
node config/scripts/ab-release-cli.mjs activate /dados/releases DIGEST_SHA256_DO_MANIFESTO
node config/scripts/ab-release-cli.mjs status /dados/releases
```

`stage` copia para um diretório temporário, verifica novamente os bytes e sincroniza os arquivos e diretórios de baixo para cima antes de nomear o slot. O rename é seguido pela sincronização de `slots` e da raiz. Reutilização e ativação também revalidam e sincronizam a árvore e os diretórios, cobrindo uma interrupção entre rename e sincronização. `activate` exige o serviço parado e troca `active.json` por rename atômico com sincronização do arquivo e do diretório em POSIX. O registro mantém o slot anterior e uma geração crescente. O profile fica fora dos slots.

A lease do serviço usa temporário privado sincronizado, publicação por hardlink exclusivo e sincronização do diretório antes de admitir o host. Recuperação e remoção ocorrem sob a exclusão mútua SQLite. Um proprietário vivo ou JSON inválido bloqueia a operação. Credenciais usam o mesmo princípio de publicar bytes completos: hardlink exclusivo na criação e rename na rotação autorizada, modo `0600` e sincronização do pai. O cleanup remove somente o temporário próprio. A sincronização de diretórios é omitida no Windows; nenhuma garantia equivalente foi homologada nessa plataforma.

```sh
export AB_RELEASE_ROOT=/dados/releases
export AB_CONTROL_PROFILE=/dados/perfil
export AB_CONTROL_TOKEN_FILE=/dados/privado/control-token
export AB_CONTROL_PORT=8080
export AB_RUNTIME_PORT=8081
node config/scripts/ab-release-run.mjs
```

O launcher resolve a seleção e carrega o código do slot selecionado. Pare o serviço, faça uma cópia consistente do perfil segundo a política da instalação e só então ative outra versão. Para voltar à seleção anterior:

```sh
node config/scripts/ab-release-cli.mjs rollback /dados/releases
```

A lease do serviço impede alterações enquanto ele roda. No store local contratado, um boot ID Linux válido e diferente prova que a lease pertence a um boot anterior; essa prova é avaliada antes de sondar um PID que pode ter sido reutilizado. No mesmo boot ou sem identidade comprovada, a existência do processo é verificada conservadoramente. Falta de visibilidade em `/proc` não prova morte; `EPERM` preserva a lease. Identidade inválida e JSON malformado continuam bloqueando a operação. O lock de staging/ativação usa uma transação `BEGIN IMMEDIATE` de `node:sqlite`, sem tabelas de domínio: a exclusão mútua pertence ao sistema operacional e é liberada mesmo em SIGKILL. O ensaio interrompe um staging real e verifica que duas operações concorrentes posteriores se serializam sem alterar a seleção anterior. Não remova slots ativos nem arquivos do perfil para destravar uma atualização.

## Appliance Debian Live

A receita em [deploy/ab-brainmaster/appliance](../../deploy/ab-brainmaster/appliance/build.sh) produz uma ISO híbrida Debian bookworm amd64 contendo o release real. Ela não instala o sistema sobre discos existentes. A persistência é um disco separado com label `persistence`, usando os mecanismos oficiais do [Debian Live](https://live-team.pages.debian.net/live-manual/html/live-manual.en.html) e de [persistence.conf](https://manpages.debian.org/bookworm/live-boot-doc/persistence.conf.5.en.html).

O disco guarda `/var/lib/ab-brainmaster`, `/workspaces`, `/etc/ab-admin` e `/var/lib/dbus`. Cada disco novo recebe um `machine-id` único, regular, `root:root`, modo `0444`; o bind de `/var/lib/dbus` já está disponível na inicialização do PID1, quando o systemd escolhe a identidade. A ISO permanece genérica, e clonar um disco copia sua identidade. Discos antigos não são migrados automaticamente. O serviço recusa iniciar sem o marcador de persistência. Um boot da ISO sem esse disco não é uma appliance persistente disponível. O construtor de estado aceita somente um caminho inexistente e cria uma imagem ext4 nova de 1 GiB; não formata um dispositivo físico:

```sh
bash deploy/ab-brainmaster/appliance/make-state.sh /destino/novo/state.img --admin-key "$HOME/.ssh/id_ed25519.pub"
```

A chave pública habilita o usuário administrativo `abadmin`; a chave privada permanece com o operador. A imagem não contém senha fixa, chave privada de administrador ou chave de host SSH compartilhada. O host SSH gera sua identidade no primeiro boot e a guarda no disco. SSH só inicia se existir uma chave administrativa provisionada. O usuário do runtime, `abbrainmaster`, não possui login interativo nem acesso de escrita à configuração administrativa.

Para uma VM administrada localmente, publique SSH apenas no loopback do host, por exemplo com uma opção QEMU `-netdev user,id=net0,hostfwd=tcp:127.0.0.1:2222-:22 -device virtio-net-pci,netdev=net0`, e conecte com a chave fornecida:

```sh
ssh -p 2222 -i "$HOME/.ssh/id_ed25519" -L 8080:127.0.0.1:8080 -L 8081:127.0.0.1:8081 abadmin@127.0.0.1
```

Os números nesse exemplo são escolhas locais da VM, não portas do AB-PCSRV. O ensaio de CI usa `-nic none`; esse acesso administrativo de rede é uma configuração explícita separada. A API HTTP exige seu bearer mesmo através do túnel.

Para gerar pairing, o operador entra por SSH, para `ab-brainmaster.service`, resolve o slot em `/var/lib/ab-brainmaster/releases/active.json` e executa o `orcad/orcad.js` desse slot em primeiro plano, como `abbrainmaster`, com `ORCA_USER_DATA=/var/lib/ab-brainmaster/profile`, `--port 8081`, `--bind 127.0.0.1` e `--pairing-address` apontando ao endpoint que o cliente alcança. Use `--mobile-pairing` para o telefone. A oferta aparece exclusivamente nessa sessão administrativa. Após o pareamento, encerre esse processo e reinicie o serviço; ele reutiliza o perfil e as credenciais persistidas. O serviço normal usa `--no-pairing` para não gravar ofertas em logs.

### Chave de autoridade e prontidão durável

A chave de autoridade de sessões é publicada por temporário privado de 32 bytes, sincronização e hardlink exclusivo, usando o helper existente. O vencedor nunca é substituído. Leitores e criadores sincronizam o arquivo e a ancestralidade POSIX no mesmo filesystem antes de devolver o signer. Uma chave existente inválida continua sendo recusada; ela não é regenerada para contornar a falha. O formato permanece compatível com chaves válidas anteriores. Filesystems sem hardlink ou sincronização de diretório, ou ancestrais sem acesso suficiente, falham explicitamente. No Windows há flush do arquivo, sem garantia equivalente de flush de diretório homologada.

Somente a unidade da appliance habilita `AB_APPLIANCE_SYNC_BOOTSTRAP=1`. Depois da prontidão do `orcad` e antes de abrir a API de controle ou publicar `ab_host_ready`, o supervisor executa `/usr/bin/sync --file-system -- <perfil>`, limitado a 30 segundos. Erro, timeout ou saída truncada impedem sucesso e encerram o runtime supervisionado. O recibo `ab_bootstrap_filesystem_sync` informa apenas a duração; stderr privado não é exportado. A barreira cobre gravações já entregues ao filesystem, não buffers futuros, caches defeituosos ou toda perda física de energia.

### ISO final: três boots aprovados

O job de appliance `125742925218` do [run 41582866839](https://github.com/oalexandrebelo/ab-brainmaster-orca/actions/runs/41582866839), commit `13013d24dea66c1b9c6345b3cd6f72b7ac1d691c`, concluiu com sucesso. A ISO normal `ab-brainmaster-amd64.iso` tem **404.750.336 bytes** e SHA-256 `5a4aebb825747c6c320bdff894c0f63288f03cda7dd8a4ac62e6e4dc95159038`. A variante de aceitação é separada: **404.029.440 bytes**, SHA-256 `162745366db4f34c5e6c85cc172c39432ba74b9d06b0190b2456c24144672973`.

| Boot                                   | Tempo registrado | Barreira de sincronização antes de `ab_host_ready` | Encerramento                               |
| -------------------------------------- | ---------------: | -------------------------------------------------: | ------------------------------------------ |
| ISO normal                             |         161,09 s |                                             124 ms | Host encerrou QEMU após prontidão.         |
| Primeiro boot persistente de aceitação |         139,05 s |                                             121 ms | Guest desligou; serviço saiu com código 0. |
| Segundo boot persistente de aceitação  |         133,04 s |                                             126 ms | Guest desligou; serviço saiu com código 0. |

Os três boots usaram BIOS, QEMU TCG, duas vCPUs, 4 GiB e nenhuma NIC, com o prazo original de 600 segundos. Os seriais confirmam a inicialização por D-Bus nos três casos. Nos dois boots de aceitação, a identidade da instalação e o fingerprint HMAC da máquina permanecem estáveis; os identificadores de boot são distintos. O manifesto de release de cada prontidão é `f47b2d7dc7e061e7d3c79faf7541e0d08524a82eebc58f54a7c6a37d78429c37`, igual ao payload conferido no Docker. Os dois testes que criam discos independentes também passaram.

No segundo boot, o marcador de recuperação RPC apareceu cerca de 42 ms antes da barreira; a barreira e `ab_host_ready` aparecem antes do desligamento, na ordem exigida. O recibo não converte esse marcador em uma alegação de prontidão anterior à sincronização. A leitura independente dos arquivos não repete a emulação.

A distribuição para operação é a ISO normal. O disco persistente de 1 GiB é criado separadamente e serve ao ensaio; não acompanha a ISO e não comporta os pesos do modelo ensaiado. Ollama e pesos continuam separados. Estes resultados não homologam UEFI, hardware físico, perda física de energia ou reconstrução binária idêntica.

Evidências: `p3/ci/runtime-13013d24/appliance-evidence.json`, `appliance-artifact-verification.json`, `appliance-bootstrap-order-verification.json`, `appliance-files-freeze.json` e os três seriais completos. O freeze tem SHA-256 `ccf9590c2b76608b1a1b03bed2bbdfe074ca68ee89283edb42bcebc90a70af9d`.

### Gate de boot

O workflow constrói a ISO normal e uma cópia de CI cujo menu acrescenta `ab.acceptance=1`. A aceitação também exige `.ab-acceptance-enabled` no disco; um marcador gravável pelo serviço, isoladamente, não ativa o ensaio na ISO normal. A variante de CI tem nome distinto e não deve substituir a ISO de operação.

QEMU TCG executa sem NIC. Primeiro verifica que a ISO normal chega à prontidão do servidor. Depois inicia a variante CI duas vezes com o mesmo disco: no primeiro boot, executa um nonce em PTY real e grava uma pasta e testemunhos sincronizados; no segundo, verifica a mesma identidade de instalação, runtime novo, pasta persistida e nonce no workspace. Cada boot de aceitação desliga a VM somente após passar. O recibo registra hashes das ISOs, tempo, modo TCG, ausência de rede e identidade persistente. Logs e recibos ficam nos artefatos do workflow. EFI, hardware físico, perda abrupta de energia e backends de inferência continuam exigindo ensaios próprios.

## Acesso pelo iPhone sem relay SaaS

`127.0.0.1` no telefone se refere ao próprio telefone. Os binds e as publicações padrão desta distribuição não são diretamente acessíveis pelo iPhone. O aplicativo móvel usa pairing e E2EE do Orca; a fachada HTTP de observação não é seu transporte.

Para alcançar o runtime sem relay SaaS, o operador configura uma VPN própria, como WireGuard, entre o iPhone e o host e um proxy TLS na interface privada autorizada. O proxy encaminha WebSocket e as rotas do runtime ao `127.0.0.1:AB_RUNTIME_PORT` do host. A configuração precisa preservar upgrade WebSocket, caminhos e conexões longas; o certificado TLS deve ser confiável no iOS. O endereço entregue ao `--pairing-address` deve ser o `wss://` privado efetivamente alcançável pelo telefone. Então gere uma oferta `--mobile-pairing` e leia o QR/link no aplicativo. Isso mantém a autenticação por dispositivo e a criptografia ponta a ponta do runtime.

Alternativamente, um listener em IP privado autorizado pode ser configurado explicitamente e protegido conforme a rede escolhida. Essa mudança de exposição não está ativada pelo compose padrão nem foi feita na infraestrutura remota. Não basta editar o endereço anunciado: bind, roteamento, TLS e endpoint da oferta precisam corresponder à rota real. A integração local prova pairing e revogação reais; uma conexão física de iPhone por VPN/TLS ainda requer validação nesse ambiente.
