# AB-BRAINMASTER-ORCA — evidências de distribuição em 2026-11-03

Este registro identifica os commits que efetivamente produziram os artefatos. Uma alteração posterior de documentação não muda os bytes de um pacote já construído. O histórico P0 permanece em [VERIFICATION.md](VERIFICATION.md), e a implementação P1–P5 está em [PHASES_P1_P5.md](PHASES_P1_P5.md).

## Artefatos conferidos

| Alvo                          | Fonte imutável                             | Execução                                                                                      | Resultado                                                                                                                                     |
| ----------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop Linux x64             | `13013d24dea66c1b9c6345b3cd6f72b7ac1d691c` | [41582866783](https://github.com/oalexandrebelo/ab-brainmaster-orca/actions/runs/41582866783) | Pacote de desenvolvimento construído e bytes conferidos independentemente.                                                                    |
| Servidor Docker amd64         | `13013d24dea66c1b9c6345b3cd6f72b7ac1d691c` | [41582866839](https://github.com/oalexandrebelo/ab-brainmaster-orca/actions/runs/41582866839) | Contêiner aprovado com reinício; imagem e payload corrigidos conferidos.                                                                      |
| ISO/appliance amd64           | `13013d24dea66c1b9c6345b3cd6f72b7ac1d691c` | [41582866839](https://github.com/oalexandrebelo/ab-brainmaster-orca/actions/runs/41582866839) | Três boots sem rede aprovados; ISO normal e variante de aceitação conferidas, identidade persistente e barreira antes da prontidão.           |
| Companion iOS arm64           | `1e66053e1fbb5c82fcae6d06283d4fb4cf38c418` | [41565349527](https://github.com/oalexandrebelo/ab-brainmaster-orca/actions/runs/41565349527) | Archive Release sem assinatura construído; bundle e notices conferidos independentemente. Não houve exportação assinada ou instalação física. |
| Jornada de inferência offline | `13013d24dea66c1b9c6345b3cd6f72b7ac1d691c` | [41582866804](https://github.com/oalexandrebelo/ab-brainmaster-orca/actions/runs/41582866804) | Pareamento, PTY, BBrainX, Qwen, reinício e idempotência aprovados com rede bloqueada; dez membros e sete arquivos de contexto conferidos.     |

A prova anterior `5ae456b9…`, run `41561063152`, permanece no histórico. O run `41563662698` também concluiu com sucesso em `14f23f7a…`; seu status não foi convertido em uma nova auditoria de bytes. O registro atual de artefatos offline é o run `41582866804` acima.

### Desktop

O [run 41582866783](https://github.com/oalexandrebelo/ab-brainmaster-orca/actions/runs/41582866783), commit `13013d24dea66c1b9c6345b3cd6f72b7ac1d691c`, concluiu build, rebuild Sherpa, ASR real em Node/Electron, gate ELF e empacotamento. O tar `AB-BRAINMASTER-LINUX-X64-DEVELOPMENT.tar.gz` tem **261.285.782 bytes** e SHA-256 `27f30642861715c7f2a7d8dc6e5a8edcd04bcf88283af170b272c7885b4aee7c`. A correção da chave de autoridade está no ASAR final; o testemunho estático resolve também os imports dos helpers de publicação e fsync.

A inspeção conferiu 7.614 arquivos regulares e vinculou 2.054 registros aos bytes do pacote: 507 pacotes, 523 textos dessas dependências, 547 arquivos de notices ao todo e 76 fontes em cinco grupos. O ASAR tem 16.826.371 bytes e SHA-256 `7f017fe9eec91470ee270211030523c14c39e1197c2f8074d2e4f58ad491559b`. Os 39 arquivos de contexto foram ligados aos blobs do commit; o coordenador repetiu o rehash dos 81 arquivos de evidência e a leitura de três módulos e quatro fragmentos compilados do ASAR.

A varredura por magic em todos os arquivos regulares encontrou 21 imagens ELF executáveis/dinâmicas e um objeto relocável `node-pty/.../pty.o`, de 122.080 bytes. As 21 imagens correspondem exatamente ao collector de runtime publicado, com zero violações e zero exceções utilizadas. Os máximos são GLIBC 2.28, GLIBCXX 3.4.26 e CXXABI 1.3.11. O primeiro verificador privado tentou aplicar `objdump -T` ao objeto relocável e falhou; esse resultado foi preservado, e a classificação passou a usar o tipo ELF. Payload e gate publicado permaneceram intactos.

O novo CI executou 10 testes do signer em três arquivos, 89 testes de contratos em 11 arquivos e sete testes de notices em três arquivos. São grupos identificados pelos logs, sem soma para alegar cobertura integral do upstream. A regressão ASR em Node e Electron usou a mesma amostra de 6,625 segundos e produziu a transcrição esperada. Os tempos são observações de compatibilidade desse run, sem alegação de benchmark comparativo.

O alvo é um diretório Linux x64 de desenvolvimento, sem instalador assinado e sem homologação macOS/Windows. Inclui daemon local e seu Node; os gates nativos carregaram o daemon e exercitaram PTY real. Não inclui `orcad-template`, necessário para implantar ou atualizar o servidor Orcad separado por esse desktop; esse uso conta com o release de servidor/Docker. A seleção de `orca serve` oferece o fallback Electron. A inspeção final dos bytes não executou novamente a GUI do pacote. O artefato `14f23f7a…` permanece histórico. Para lazy-val 1.0.5, preserva-se a declaração MIT original e identifica-se o texto padrão SPDX, com a lacuna do aviso de copyright upstream explícita. Procedimento: [DESKTOP_DISTRIBUTION.md](DESKTOP_DISTRIBUTION.md).

### Servidor Docker

O job de contêiner `125741459455` do [run 41582866839](https://github.com/oalexandrebelo/ab-brainmaster-orca/actions/runs/41582866839) passou em `13013d24dea66c1b9c6345b3cd6f72b7ac1d691c`. O estágio de aceitação/builder executou nove testes reais, sem skips. A imagem runtime final recebeu um ensaio separado: rede `none`, usuário não root, raiz somente leitura e reinício com identidade persistida. A inspeção conferiu 27 blobs, 13 camadas e os 498 arquivos do payload, com hashes, tamanhos e modos correspondentes.

Referência: `ab-brainmaster-orca:13013d24dea66c1b9c6345b3cd6f72b7ac1d691c`. Image ID: `sha256:47869e66575023af2b309df37f2fb05dafea0bfc0f1b3219a9b783f6b72551e6`. SHA-256 do arquivo Docker compactado: `a5b1c3d01d7872ae1a39c2e9b4857bfe3ccf4a0e2869d7645cef0676c4e3b3be`.

O ZIP tem **271.850.558 bytes** e SHA-256 `9e415693e7fcfb772f6663bc4ee7b7c77d7098228333effaf3c90a2205f03123`. A imagem compactada tem **204.271.814 bytes**. O payload soma **202.832.533 bytes**; o manifesto tem SHA-256 `f47b2d7dc7e061e7d3c79faf7541e0d08524a82eebc58f54a7c6a37d78429c37` e o tar, `3e1d6588badb0924f083a1bee4f35303be7ba0e7ccdd5584322bf117af3d7e12`. O inventário mantém 241 pacotes, 246 textos npm e dois OFL.

A reconstrução passiva do inventário efetivo das 13 posições de camada — 12 blobs de camada distintos, com repetição de uma camada vazia —, em ordem e com whiteouts/substituições, encontrou 500 arquivos de release idênticos ao archive separado: 498 do payload, mais manifesto e digest. Seis módulos de implantação coincidiram com os blobs do commit. As duas funções de entrada do host tiveram AST equivalente depois da normalização explícita de posições, grafia de literais, imports e aliases locais. O protocolo de publicação durável da chave também foi localizado e revisado no `orcad-server.js` efetivamente empacotado. Essas verificações são delimitadas às funções e recursos registrados; não são uma prova formal de equivalência de todo o bundle.

A inspeção dos arquivos não iniciou um segundo Docker. A execução do contêiner não substitui os boots da appliance, a implantação remota nem o provisionamento dos modelos. A distribuição anterior `8d1a8105…` permanece histórica e não recebe essas correções por associação.

O Compose configura 4 CPUs, 4 GiB, 256 processos, nenhuma capability, `no-new-privileges`, volumes dedicados e duas publicações em loopback. `docker load` seguido de `--no-build --pull never` reinstala os bytes verificados sem registry. Ollama e pesos são provisionados separadamente. Procedimento: [SERVER_DISTRIBUTION.md](SERVER_DISTRIBUTION.md).

### iOS

O ZIP do archive unsigned tem **81.084.121 bytes** e SHA-256:

```text
8a277e55ba92efffed6100a8a720bc64f98deb6af7591498859a83d6278cab37
```

O executável é Mach-O arm64 para `iPhoneOS`, com bundle ID `br.com.alexandrebelo.brainmaster.orca.mobile`, nome `AB BRAINMASTER`, versão 0.1.0/build 1 e piso iOS 15.1. O bundle Hermes tem 19.526.780 bytes e SHA-256 `bd699277ee8970293504bc370a53e4fabf14147817c731a8bac075c05652c22b`.

Foram conferidos 186 recursos de notices e o manifesto `734ed8686d53d5c9bff595ab79055b6acf61f8ec05451f6bec58c47f88b1e776`, idêntico ao recibo externo da fase Xcode. O inventário real contém 175 pacotes, 177 textos npm, quatro outputs gerados e dois OFL, incluindo Mermaid 11.17.2 e xterm. A redução de 182 para 177 em relação ao ensaio local anterior exclui cinco arquivos de código confundidos com documentos de licença; os LICENSE verdadeiros de Cytoscape e Lucide mantiveram seus hashes.

O manifesto de proveniência registra 6.626 fontes, com 6.576 correspondências de conteúdo e 50 referências PNG sem `sourcesContent`. A inspeção conferiu esses registros e sua vinculação ao recibo externo; o sourcemap não acompanhou o artefato baixado e seu hash não foi recalculado nessa inspeção. O limite de equivalência dos assets permanece explícito. O output real CocoaPods registra 27 blocos: 26 títulos de componentes e um rodapé sem título. Isso não representa 27 pods nem uma auditoria por símbolo das bibliotecas ligadas.

O app não contém assinatura ou perfil de distribuição. Este ZIP não é um IPA instalável. O fluxo manual de archive/exportação/verificação/instalação está em [IOS_DISTRIBUTION.md](IOS_DISTRIBUTION.md); depende de Mac disponível, perfil/certificado locais e aparelho autorizado. `ipatool` pesquisa/baixa aplicativos App Store e não substitui o Xcode para produzir e assinar o fork.

## Appliance

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

### Histórico: correções de inicialização e durabilidade

O ensaio QEMU preserva os limites originais: duas vCPUs, 4 GiB, TCG, nenhuma NIC e 600 segundos por boot. O primeiro boot usa a ISO normal e o host encerra a VM depois de observar `ab_host_ready`. Os dois seguintes usam a variante de aceitação e verificam pareamento, PTY, conteúdo e identidade persistente antes do desligamento pelo guest. Não houve troca para `-cpu max` ou extensão do prazo para obter aprovação.

A primeira tentativa não produziu saída serial, e a inspeção encontrou `timeout 0` nas duas variantes Syslinux. O commit `061a16ea…` aplicou `timeout 50` no template oficial, com substituição exata e releitura. O guest passou então a iniciar o kernel e o serviço, mas aquele run não registrou a prontidão do aplicativo dentro do prazo. `Started` em uma unidade `Type=simple` não demonstra prontidão.

O commit de observabilidade `eb376851…` preservou o marcador de sucesso e adicionou fases e durações. Seu run `41570947507` demonstrou um `EIO` no caminho de escrita direta para `/dev/ttyS0`; o serviço reiniciou e atingiu `ab_host_ready`. O staging observado nessa tentativa consumiu 20,603 segundos. Depois do encerramento da VM, o primeiro boot de aceitação falhou ao interpretar o JSON da trava `service.lock`. O disco persistente não acompanhou o artefato baixado; a evidência é o erro de parse, não uma medição direta de arquivo vazio.

O reparo troca a saída direta do terminal serial por `journal+console`. A trava de execução passa a ser gravada em um temporário privado, sincronizada e publicada por hardlink exclusivo, seguida da sincronização do diretório. A publicação não substitui uma trava existente. Remoção e recuperação ocorrem sob a mesma exclusão mútua SQLite e sincronizam o diretório. Uma trava malformada continua bloqueando a inicialização, em vez de ser apagada sem prova de propriedade.

O staging sincroniza arquivos e diretórios da árvore verificada antes do rename, e sincroniza `slots` e a raiz antes de confirmar sucesso. Reutilização e ativação repetem a sincronização necessária: isso cobre a interrupção entre o rename e a confirmação do diretório no disco. A criação de credenciais publica bytes completos com `fsync`, hardlink exclusivo e modo `0600`; a rotação usa rename após validar o destino. Ambas sincronizam o diretório pai em POSIX. A limpeza remove somente o temporário criado pela operação.

Também foi acrescentado `live-config.noautologin`: o gerador Debian tentava iniciar uma sessão para um usuário live ausente. Essa correção trata os loops de autenticação observados, sem atribuir a eles a causa do JSON incompleto.

Os testes reais exercitam proprietário vivo, exclusividade, morte por `SIGKILL`, recuperação concorrente, recusa de trava malformada, staging, conteúdo adulterado e rollback com retenção do perfil. Credenciais são verificadas em filesystem real, incluindo leitor aberto antes da rotação, permissões e recusas. Esses testes não substituem a prova dos boots da nova ISO. A sincronização de diretório é omitida no Windows, sem garantia equivalente homologada, e nenhuma execução QEMU equivale a ensaio de perda física de energia em qualquer hardware.

### Recuperação da appliance na revisão 13013d24

O job de contêiner do run `41575660003`, commit `8d1a8105d0fa36da2cf2547d2ddfa942f5a1ebfe`, passou. O job de appliance falhou: a imagem normal chegou a `ab_host_ready`; o primeiro boot de aceitação esgotou o prazo e o segundo não foi executado. Esses resultados pertencem a jobs distintos e permanecem separados nos recibos.

Os seriais dessa tentativa mostraram inicialização aleatória da identidade da máquina nos dois boots. O perfil Orca estava em disco persistente. O core consulta `/etc/machine-id` e distingue um dono local de um dono de outra máquina; portanto, preservar o perfil e trocar essa identidade viola o contrato de recuperação. A correção cria um identificador único por novo disco em `/var/lib/dbus/machine-id`, regular, `root:root`, modo `0444`, e persiste o diretório por bind. O systemd o escolhe durante a inicialização do PID1. A ISO permanece genérica. Copiar um disco existente também copia sua identidade; a criação de dois discos novos foi testada e produz identidades diferentes.

Um diagnóstico local manteve a ISO 8d intacta e mudou apenas o disco de estado. O primeiro boot chegou à prontidão em 188,129 s. O segundo escolheu novamente a identidade persistida, mas ainda apresentou saída do runtime. Foi interrompido deliberadamente para preservar o estado sintético, sem ser apresentado como aceitação bem-sucedida. Após replay do journal em uma cópia separada, os metadados de `profile/agent-session-authority.key` mostraram arquivo regular de 0 bytes, modo 0600, UID/GID 1000. Nenhum valor de chave foi lido ou publicado. Uma tentativa adicional de captura privada do erro não retornou veredito dentro de 600 s; não foi usada como prova causal.

Na revisão 8d1a8105, o loader cria a chave canônica por abertura exclusiva, escreve 32 bytes e fecha sem sincronização. Na próxima abertura, um arquivo existente vazio causa `agent_session_ownership_unknown`; regenerá-lo mudaria a identidade das sessões. A correção conserva esse erro e passa a publicar um temporário privado somente depois de escrever, sincronizar e fechar seus bytes. O helper existente de hardlink exclusivo impede sobrescrever o vencedor. Leitores e criadores sincronizam o arquivo final e os diretórios do mesmo filesystem antes de devolver o signer. Falhas de sincronização impedem sucesso. O formato de 32 bytes continua compatível com chaves válidas anteriores.

O supervisor também verifica a identidade do boot antes de sondar um PID de uma lease antiga. PIDs podem ser reutilizados após reinício. No mesmo boot, ausência de visibilidade em `/proc` não prova morte: a sondagem de existência ainda é exigida, e falta de permissão preserva a trava. Um teste real executou como UID 65534 diante de PID de root e observou `EPERM`, sem sinalizar nem encerrar esse processo. O fixture de boot anterior é identificado como sintético; não simula uma reinicialização física.

A unidade da appliance habilita uma barreira adicional, depois da prontidão upstream e antes de abrir a API de controle ou publicar `ab_host_ready`: `/usr/bin/sync --file-system -- <perfil>`, com limite de 30 s e saída limitada. Ela sincroniza o filesystem que contém o perfil; os binds de estado desta appliance compartilham o disco ext4. Não cobre buffers ainda mantidos em memória por aplicações, gravações futuras, defeitos físicos de hardware ou cache de dispositivo que ignore flush. O supervisor acompanha a saída do filho durante a barreira e limpa o runtime quando ela falha.

Os testes focados do core passaram em três arquivos, 10/10, incluindo oito workers concorrentes e preservação de arquivos inválidos de 0, 31 e 33 bytes. Os testes reais de contrato, runtime, lease e releases passaram 9/9, sem skips; a barreira local observada levou 11 ms, medida que não representa QEMU nem hardware final. A sincronização de diretórios POSIX e a publicação requerem suporte do filesystem e acesso aos ancestrais pertinentes. No Windows o arquivo é sincronizado, mas não há garantia equivalente de sincronização de diretório nesta implementação. Essas limitações constam dos freezes e das revisões independentes.

Referências primárias: [systemd 252, machine-id](https://www.freedesktop.org/software/systemd/man/252/machine-id.html), [Debian Bookworm, persistence.conf](https://manpages.debian.org/bookworm/live-boot-doc/persistence.conf.5.en.html), [Linux, syncfs](https://man7.org/linux/man-pages/man2/sync.2.html), [Linux, visibilidade de proc](https://man7.org/linux/man-pages/man5/proc.5.html).

A correção funcional foi publicada em `13013d24dea66c1b9c6345b3cd6f72b7ac1d691c`, árvore `30fe0545d2a0ebb8ec94e2702a2d4141b958e402`. O gate literal passou 21 de 22 verificações: a seleção automática de testes unitários relacionada aos arquivos atingiu o prazo de três minutos. A regra do `AGENTS.md` permite cobertura focada quando essa seleção se amplia excessivamente. Essa seleção passou 112 testes em 11 arquivos, em 19,591 segundos; dois casos preexistentes foram omitidos por suas condições de plataforma/UID: propriedade de diretório por outro UID quando o caller é root e criação/ACL nativa de Windows. Não se apresenta esse resultado como aprovação da suíte completa. O recibo vincula a mesma árvore antes e depois; o índice do checkout compartilhado permaneceu intacto.

## Alcance da independência e da recuperação

O [run 41582866804](https://github.com/oalexandrebelo/ab-brainmaster-orca/actions/runs/41582866804), commit `13013d24dea66c1b9c6345b3cd6f72b7ac1d691c`, concluiu a jornada `orcad → pareamento → PTY → CLI → MCP BBrainX → Ollama/Qwen → journal`. O ZIP de 25.088 bytes, SHA-256 `346d07fc8dcf49816955cc59e2204f201beab6aca91ef99b1f2fa266fb20d6f3`, contém dez membros verificados. Os sete arquivos de contexto coincidem com os objetos Git desse commit; resultado inicial, recuperado e idempotente são idênticos byte a byte. O CI registra pareamento, PTY e preservação da instalação, com mudança do identificador de runtime após o reinício.

O contêiner tinha somente loopback, `NetworkMode=none` e tentativa TCP externa recusada com `ENETUNREACH`. Ollama 0.40.13 e Qwen3:1.7B, digest `8f68893c685c3ddff2aa3fffce2aa60a30bb2da65ca488b61fff134a4d1730e7`, foram provisionados antes do isolamento. Os três critérios factuais passaram. O tempo do provedor nesta pergunta foi **15,239 segundos**, com 1.179 tokens de entrada avaliados e 42 gerados.

O perfil usou UID/GID 1001, 2 CPUs, 4 GiB de memória, `MemorySwap` de 8 GiB, remoção de todas as capabilities e `no-new-privileges`; a raiz desse contêiner era gravável. O contêiner de produção com raiz somente leitura tem uma prova separada. Não se declara p95, pico de memória, qualidade geral do modelo, funcionamento integral do IDE ou ensaio físico do iPhone.

As execuções anteriores `5ae456b9…` (run `41561063152`) e `8d1a8105…` (run `41575659816`) registraram 17,619 e 27,305 segundos de provedor, respectivamente. Os hashes do prompt, da resposta e dos sete arquivos de contexto permanecem iguais na execução atual. São observações individuais de CI; as diferenças de duração não demonstram ganho causado pela correção, benchmark ou regressão. Cada recibo mantém sua referência de fonte.

A API HTTP/SDK/CLI/MCP de `ab-control` expõe sete operações de observação. Tarefas usam o PTY autorizado ou a CLI/SDK de `ab-local-runtime`. O journal admite uma tarefa por diretório e proprietário local; não é uma fila distribuída ou lock para NFS. Saída do modelo é texto não confiável e não é executada.

O rollback ensaiado utilizou dois identificadores sobre o mesmo build do core. Ele verifica slots, hashes, ativação, reinício e retorno do estado, sem demonstrar reversibilidade de uma migração futura entre versões distintas. Bases e payloads são fixados e verificáveis; o APT ainda usa repositório móvel e não foi provada reconstrução bit a bit de toda a imagem.

## Gates externos e escopos ainda não homologados

- AB-S00S remoto e implantação Oficina: o projeto dedicado ainda não foi criado; a revisão automática rejeitou sua criação persistente e o fluxo da Oficina exige confirmação explícita do plano. O adapter não acessou outro projeto como substituto.
- iPhone 13 Pro: assinatura, IPA exportado, instalação e ensaio físico de pareamento, terminal, ditado e retorno de segundo plano permanecem separados da compilação nativa aprovada.
- Upstream Review: a CLI consultou o upstream real, e a UI mostrou falha de rede corretamente. O worker filtra variáveis de proxy e usa `execArgv: []`; habilitar proxy somente no processo Electron pai não produz um ensaio positivo do painel. A política foi preservada.
- Billion Context: toggle e sidecar foram exercitados em Electron real; o suporte ensaiado é novo terminal Claude com API key em pasta local. OAuth, worktrees Git, Windows, SSH/WSL, retomada e chat nativo não foram homologados por esse ensaio.
- O mapa P1–P5 é uma snapshot de arquitetura em `5ae456b9…`, com 39 referências em 28 arquivos e seis suplementares, validada offline. Não é uma declaração de funcionamento offline de todos os recursos opcionais do IDE.

Os gates locais são registrados por delta e por base Git. A integração nativa 5ae passou 41 checks; o ajuste assíncrono de teste a289 passou 41; o nome de licença Electron em 14f passou 13; o guard iOS em 1e660 passou 12, além de 25 testes iOS; a separação de artefatos em 52eec passou 3; o autoboot em 061a16 passou 2, além da validação Bash/Python. Não se somam suites sobrepostas para anunciar uma cobertura inexistente do upstream inteiro.

O reparo histórico `8d1a8105…` passou no gate literal `pnpm check:changed --base=eb3768517e1f5df1da005f9b9d90db3d6e076aee`: 13/13 checks em 167,3 segundos, 172,256 segundos incluindo o launcher. A árvore publicada `22cd7905ed9c3a7d1d97b45a0a91abe64efb8da0` é a mesma testada. A revisão independente conferiu os sete arquivos e os oito testes reais; isso não antecipa a aceitação dos novos binários.
