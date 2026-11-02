# Distribuição do servidor AB-BRAINMASTER-ORCA

O servidor usa o `orcad`, seus PTYs, sua persistência e o `RuntimeClient` oficiais do fork. `ab-control` acrescenta uma API de observação com SDK, CLI e MCP. O processo `ab-control/host.mjs` inicia o `orcad` e a fachada; Docker ou systemd supervisionam esse processo. Não existe um segundo escalonador de agentes.

## Evidência e limites

Os testes locais usam o servidor compilado, pairing E2EE real e PTYs reais. Eles verificam nonce de comando, pasta sem Git, reconexão, preservação da identidade de instalação, registro da pasta e saída do terminal após reinício. Também verificam recusa de um dispositivo removido do registro na próxima conexão; rotação de bearer; Host, Origin e tamanho de corpo; limite de concorrência; cancelamento; e equivalência HTTP/SDK/CLI/MCP.

O ensaio de releases inicia dois slots contendo a mesma compilação atual, com metadados de versão de aceitação diferentes. Ele prova staging, hashes, troca atômica da seleção, bloqueio durante execução, retenção de perfil e retorno ao primeiro slot. Isso não prova compatibilidade de dados entre duas versões históricas distintas do produto. Não existe downgrade automático de esquema de dados.

O workflow [AB runtime and appliance](../../.github/workflows/ab-runtime.yml) executa a aceitação real dentro do build Docker, inicia um contêiner sem rede e verifica reinício com volume persistente. Para o repositório proprietário, pushes em `ab-brainmaster/**` também constroem a ISO e executam QEMU TCG sem NIC. Esses gates só constituem evidência depois que o runner terminar com sucesso. A presença do workflow ou de uma receita não equivale a uma imagem homologada.

As bases Node e Debian estão fixadas por digest. O Node embarcado também é verificado pelo hash fixado pelo Orca, e cada release tem inventário SHA-256. Os pacotes Debian obtidos durante o build ainda vêm dos índices assinados da distribuição. Não foi demonstrada igualdade binária entre duas construções completas de Docker ou ISO.

## API e execução local

A API implementada contém apenas sete operações: `status`, `repos`, `workspaces`, `folders`, `terminals`, `terminal_read` e `terminal_wait`. O [contrato e OpenAPI](../../packages/ab-control/README.md) descrevem parâmetros, limites, autenticação e erros. Não há endpoint de RPC arbitrário ou de execução de tarefas.

Tarefas autorizadas usam o terminal oficial ou o CLI/SDK de `ab-local-runtime`. O pacote local exige seu backend Ollama e os bytes do modelo provisionados separadamente. A imagem de servidor/appliance não deve ser descrita como uma instalação completa de inferência enquanto esse pack não estiver instalado e validado. Nenhuma GPU é reservada por esta distribuição.

## Docker

O [compose](../../deploy/ab-brainmaster/compose.yaml) usa bridge dedicada, usuário sem root, filesystem raiz somente leitura, nenhuma capability, `no-new-privileges`, limite de quatro CPUs, 4 GiB e 256 processos. Perfil, workspaces e home ficam em volumes dedicados. Não monta Docker socket nem a rede do host. O runtime e a API escutam em todas as interfaces somente dentro do contêiner; suas publicações no host usam `127.0.0.1`.

Defina as portas fornecidas pela administração da máquina. O arquivo recusa subir sem valores explícitos:

```sh
export AB_CONTROL_PORT=PORTA_ATRIBUIDA_PELA_ADMINISTRACAO
export AB_RUNTIME_PORT=PORTA_ATRIBUIDA_PELA_ADMINISTRACAO
docker compose -f deploy/ab-brainmaster/compose.yaml up --build -d
docker compose -f deploy/ab-brainmaster/compose.yaml exec core node /opt/ab-release/ab-control/cli.mjs status
```

As expressões de porta acima são instruções de preenchimento, não números reservados. A criação do projeto remoto AB-PCSRV depende da autorização pendente da Oficina. Este repositório não pressupõe que essas portas já existam ou estejam reservadas.

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

`stage` copia para um diretório temporário e verifica novamente os bytes antes de nomear o slot. `activate` verifica o slot, exige o serviço parado e troca `active.json` por rename atômico com sincronização do arquivo e do diretório em POSIX. O registro mantém o slot anterior e uma geração crescente. O profile fica fora dos slots.

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

A lease do serviço impede alterações enquanto ele roda. Após interrupção abrupta, `reclaim` só remove a lease quando o processo morreu; em Linux também compara boot ID e início do processo para reconhecer reutilização de PID em outro boot/contêiner. O lock de staging/ativação usa uma transação `BEGIN IMMEDIATE` de `node:sqlite`, sem tabelas de domínio: a exclusão mútua pertence ao sistema operacional e é liberada mesmo em SIGKILL. O ensaio interrompe um staging real e verifica que duas operações concorrentes posteriores se serializam sem alterar a seleção anterior. Não remova slots ativos nem arquivos do perfil para destravar uma atualização.

## Appliance Debian Live

A receita em [deploy/ab-brainmaster/appliance](../../deploy/ab-brainmaster/appliance/build.sh) produz uma ISO híbrida Debian bookworm amd64 contendo o release real. Ela não instala o sistema sobre discos existentes. A persistência é um disco separado com label `persistence`, usando os mecanismos oficiais do [Debian Live](https://live-team.pages.debian.net/live-manual/html/live-manual.en.html) e de [persistence.conf](https://manpages.debian.org/bookworm/live-boot-doc/persistence.conf.5.en.html).

O disco guarda `/var/lib/ab-brainmaster`, `/workspaces` e `/etc/ab-admin`. O serviço recusa iniciar sem o marcador de persistência. Um boot da ISO sem esse disco não é uma appliance persistente disponível. O construtor de estado aceita somente um caminho inexistente e cria uma imagem ext4 nova de 1 GiB; não formata um dispositivo físico:

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

### Gate de boot

O workflow constrói a ISO normal e uma cópia de CI cujo menu acrescenta `ab.acceptance=1`. A aceitação também exige `.ab-acceptance-enabled` no disco; um marcador gravável pelo serviço, isoladamente, não ativa o ensaio na ISO normal. A variante de CI tem nome distinto e não deve substituir a ISO de operação.

QEMU TCG executa sem NIC. Primeiro verifica que a ISO normal chega à prontidão do servidor. Depois inicia a variante CI duas vezes com o mesmo disco: no primeiro boot, executa um nonce em PTY real e grava uma pasta e testemunhos sincronizados; no segundo, verifica a mesma identidade de instalação, runtime novo, pasta persistida e nonce no workspace. Cada boot de aceitação desliga a VM somente após passar. O recibo registra hashes das ISOs, tempo, modo TCG, ausência de rede e identidade persistente. Logs e recibos ficam nos artefatos do workflow. EFI, hardware físico, perda abrupta de energia e backends de inferência continuam exigindo ensaios próprios.

## Acesso pelo iPhone sem relay SaaS

`127.0.0.1` no telefone se refere ao próprio telefone. Os binds e as publicações padrão desta distribuição não são diretamente acessíveis pelo iPhone. O aplicativo móvel usa pairing e E2EE do Orca; a fachada HTTP de observação não é seu transporte.

Para alcançar o runtime sem relay SaaS, o operador configura uma VPN própria, como WireGuard, entre o iPhone e o host e um proxy TLS na interface privada autorizada. O proxy encaminha WebSocket e as rotas do runtime ao `127.0.0.1:AB_RUNTIME_PORT` do host. A configuração precisa preservar upgrade WebSocket, caminhos e conexões longas; o certificado TLS deve ser confiável no iOS. O endereço entregue ao `--pairing-address` deve ser o `wss://` privado efetivamente alcançável pelo telefone. Então gere uma oferta `--mobile-pairing` e leia o QR/link no aplicativo. Isso mantém a autenticação por dispositivo e a criptografia ponta a ponta do runtime.

Alternativamente, um listener em IP privado autorizado pode ser configurado explicitamente e protegido conforme a rede escolhida. Essa mudança de exposição não está ativada pelo compose padrão nem foi feita na infraestrutura remota. Não basta editar o endereço anunciado: bind, roteamento, TLS e endpoint da oferta precisam corresponder à rota real. A integração local prova pairing e revogação reais; uma conexão física de iPhone por VPN/TLS ainda requer validação nesse ambiente.
