# AB BRAINMASTER ORCA para iPhone — distribuição e evidências

O cliente reaproveita o aplicativo React Native/Expo de `mobile/`. O alvo de distribuição pessoal é o iPhone 13 Pro de Alexandre Belo. A configuração AB tem identidade própria e um processo de arquivo, exportação e verificação. **Este documento não declara que um IPA assinado foi entregue ou instalado.** A compilação nativa só é comprovada por uma execução concluída do workflow ou do Xcode; a instalação exige evidência no aparelho.

## Identidade e compatibilidade

| Item                       | Configuração AB                                     |
| -------------------------- | --------------------------------------------------- |
| Nome Expo                  | `AB BRAINMASTER ORCA`                               |
| Nome na tela inicial       | `AB BRAINMASTER`                                    |
| Bundle ID padrão           | `br.com.alexandrebelo.brainmaster.orca.mobile`      |
| URL scheme                 | `ab-brainmaster-orca`                               |
| Versão / build iniciais    | `0.1.0` / `1`                                       |
| Arquitetura de dispositivo | `arm64`                                             |
| Deployment target          | iOS `15.1`                                          |
| Base nativa                | Expo SDK 55; React Native 0.83.10; nova arquitetura |
| Ambiente APNs              | `disabled`, até configurar capacidades e gateway AB |
| Atualização                | Manual, usando um novo pacote AB assinado           |

O bundle ID é uma configuração proposta do fork. Ele ainda precisa existir na conta Apple responsável e corresponder ao perfil fornecido; não há declaração de registro ou propriedade desse App ID. O nome, o esquema e o identificador separam a instalação AB do aplicativo `com.stably.orca.mobile`. Ícones e partes do conteúdo visual permanecem derivados do Orca. Isso não representa uma revisão visual completa do companion.

O SDK 55 exige iOS 15.1+ e Xcode 26.2+, segundo a [matriz oficial Expo](https://docs.expo.dev/versions/v55.0.0/). O modelo iPhone 13 Pro é compatível com o piso de hardware/arquitetura, mas a versão instalada do iOS e o UDID de Alexandre não foram observados nesta sessão. A verificação de compatibilidade precisa ser concluída no aparelho. O preflight lista apenas modelo, versão do sistema, disponibilidade e correspondência ao dispositivo solicitado, sem publicar o UDID.

As personalizações nativas upstream para APIs mais novas usam guardas de disponibilidade; por isso o workflow seleciona Xcode 26.2 e mantém iOS 15.1 como deployment target. Somente uma compilação efetiva valida essa combinação. O [inventário oficial de runners macOS 15](https://github.com/actions/runner-images/blob/main/images/macos/macos-15-Readme.md) informa a instalação de Xcode 26.2 nesse runner.

## Archive nativo verificado

O [run 41565349527](https://github.com/oalexandrebelo/ab-brainmaster-orca/actions/runs/41565349527), commit `1e66053e1fbb5c82fcae6d06283d4fb4cf38c418`, concluiu os 25 testes selecionados do fluxo de distribuição em macOS e o archive Release nativo. Os testes de scripts não são testes de interface no iPhone. O ZIP `AB-BRAINMASTER-ORCA-iOS-UNSIGNED-1e66053e.zip` tem 81.084.121 bytes e SHA-256 `8a277e55ba92efffed6100a8a720bc64f98deb6af7591498859a83d6278cab37`.

A inspeção independente confirmou Mach-O arm64/iPhoneOS, deployment target 15.1, bundle ID `br.com.alexandrebelo.brainmaster.orca.mobile`, nome AB BRAINMASTER, versão 0.1.0/build 1 e JavaScript Release Hermes. A fase de avisos executou antes de `ARCHIVE SUCCEEDED`: 175 pacotes, 177 textos npm, dois OFL e acknowledgements reais do CocoaPods. São 27 blocos de acknowledgements: 26 componentes com título e um rodapé, não 27 pods.

Os 186 recursos, além do manifesto, foram conferidos contra os hashes incorporados e o recibo externo. O sourcemap não está no ZIP: sua declaração de hash e os registros de proveniência foram vinculados ao recibo, mas o revisor não recalculou o hash de um arquivo ausente. As limitações de cobertura nativa e de assets permanecem descritas abaixo.

O pacote não contém assinatura nem perfil de provisioning e não foi instalado no aparelho. A existência do App ID na conta Apple e os requisitos de assinatura/dispositivo continuam sendo pré-requisitos locais. Recibos: [CI_EVIDENCE_20261103.md](CI_EVIDENCE_20261103.md).

A comparação dos objetos Git entre esse archive e o servidor `13013d24dea66c1b9c6345b3cd6f72b7ac1d691c` confirmou igualdade da árvore `mobile`, da árvore `src/shared`, do `package.json` raiz e dos lockfiles/workspace. O archive mantém seu commit original; esse vínculo não substitui um ensaio físico do cliente contra o servidor novo.

## O que foi implementado

- `mobile/config/ab-ios-identity.cjs`: resolve identidade, versão, permissões localizadas e ambiente de push; recusa bundle IDs upstream e configurações malformadas.
- `mobile/app.config.js`: ativa a variante quando `AB_IOS_VARIANT=brainmaster`. Sem essa variável, mantém o caminho upstream para facilitar atualizações do fork.
- `mobile/plugins/ab-ios-push-capability.js`: remove a capacidade APNs e o modo de push em segundo plano quando desativados, inclusive após a aplicação automática de plugins pelo Expo.
- `mobile/scripts/ab-ios.mjs`: comandos `config`, `preflight`, `build`, `verify` e `install`, documentados em `--help`.
- `.github/workflows/ab-ios-native.yml`: compilação Release para dispositivo em macOS, com assinatura desativada, ações fixadas por SHA, permissões somente de leitura e limite de 45 minutos.
- Runtime nativo: não registra tokens remotos quando push está desativado; utiliza o ambiente APNs embutido quando ativado; não consulta atualizações da App Store upstream; a tela de bloqueio de versão explica a atualização manual AB. Na variante AB, a tela de diagnóstico mantém a cópia local do relatório e não oferece envio ao suporte Orca; a função de envio também recusa a chamada antes de acessar a rede.

O caminho AB não usa as lanes `build_and_upload` / `release` de `mobile/fastlane/Fastfile`: elas pertencem à distribuição upstream e publicam no App Store Connect. O fluxo AB não faz login Apple, compra, upload, registro automático de dispositivos, importação de chave privada ou alteração de permissões do Keychain.

## Preparação no Mac

Use um clone completo do repositório, pois o mobile importa código compartilhado fora de `mobile/` e seu lockfile inclui um link para `src/packages/process-host`.

1. Instale e abra Xcode 26.2 ou superior. Conclua a inicialização e aceite seus termos diretamente no Xcode. Selecione a instalação correta nas configurações de Command Line Tools ou por `DEVELOPER_DIR`.
2. Disponibilize Node 24+, pnpm **12.14.0**, Ruby/Bundler e as dependências fixadas no lockfile. O preflight recusa versão diferente de pnpm e informa pendências, sem aceitar termos ou instalar componentes do Xcode.
3. Para ad hoc, obtenha um App ID explícito AB, um certificado Apple Distribution com sua chave privada já acessível no Keychain e um perfil ad hoc que contenha o UDID do iPhone. Para desenvolvimento, use certificado/perfil de desenvolvimento. Não envie `.p12`, senhas, chaves `.p8` ou Apple ID ao chat ou ao repositório.
4. O proprietário deve aprovar diretamente eventuais diálogos de acesso à chave, confiança no computador e Developer Mode. O script não desbloqueia o Keychain nem aprova esses diálogos.

Instalação das dependências, a partir da raiz do clone:

```bash
cd mobile
pnpm install --frozen-lockfile
BUNDLE_FROZEN=true bundle install
node scripts/ab-ios.mjs config
node scripts/ab-ios.mjs preflight --unsigned
```

O modo `--unsigned` serve apenas para verificar e compilar os insumos nativos. Ele não exige perfil ou certificado e nunca produz um arquivo `.ipa`.

## Gerar o IPA para o iPhone

O fluxo ad hoc segue os requisitos de [distribuição para dispositivos registrados da Apple](https://developer.apple.com/documentation/xcode/distributing-your-app-to-registered-devices) e de [criação de perfil ad hoc](https://developer.apple.com/help/account/provisioning-profiles/create-an-ad-hoc-provisioning-profile). O pacote só pode rodar nos dispositivos incluídos no perfil; nome do aparelho e modelo não substituem o UDID.

No terminal do Mac, dentro de `mobile/`, forneça os dados reais do perfil e do aparelho. Os comandos abaixo pedem entrada local e não contêm credenciais fictícias:

```bash
printf 'Caminho absoluto do perfil .mobileprovision: '
IFS= read -r AB_IOS_PROFILE
printf 'UDID do iPhone autorizado: '
IFS= read -r AB_IOS_DEVICE_UDID
export AB_IOS_PROFILE AB_IOS_DEVICE_UDID
export AB_IOS_APS_ENVIRONMENT=disabled

node scripts/ab-ios.mjs preflight --method ad-hoc
node scripts/ab-ios.mjs build --method ad-hoc --output build/ab-iphone13pro-001

AB_IOS_IPA="$(node -p "require('./build/ab-iphone13pro-001/build-evidence.json').ipa")"
node scripts/ab-ios.mjs verify --method ad-hoc --ipa "$AB_IOS_IPA"
node scripts/ab-ios.mjs install --method ad-hoc --ipa "$AB_IOS_IPA"
```

Use um novo diretório de saída em cada build. Um diretório existente é recusado para impedir que um IPA antigo seja tratado como resultado da execução atual. O build move um projeto `ios/` anterior para `previous-ios` dentro da saída antes de executar um prebuild novo. Não mantenha alterações manuais exclusivamente nesse diretório gerado.

`build` executa preflight, Expo prebuild, CocoaPods, `xcodebuild archive` em Release, `xcodebuild -exportArchive` com assinatura manual e valida o IPA resultante. O perfil fornecido é copiado para a pasta de perfis locais do Xcode. A versão e o build não são alterados durante a exportação. `verify` confere bundle ID, versão, deployment target, arquitetura arm64, JavaScript embutido, assinatura com `codesign`, entitlements, validade do perfil e inclusão do iPhone. O SHA-256 do IPA e a evidência são gravados na saída. Isso comprova os itens verificados; não comprova execução do aplicativo.

`install` repete a verificação e usa `xcrun devicectl device install app` no UDID selecionado. Não inicia o aplicativo nem afirma ter validado sua interface. Alternativamente, a Apple documenta a instalação do IPA pelo Xcode, em Devices and Simulators, ou pelo Apple Configurator. Developer Mode e confiança no computador devem estar resolvidos no próprio aparelho quando requeridos.

Para desenvolvimento, substitua `--method ad-hoc` por `--method development` em todos os comandos e forneça o perfil correspondente. O script ainda gera Release com JavaScript embutido. Para um futuro envio à Apple, `--method app-store` exporta localmente; envio, TestFlight e publicação são etapas distintas e não são executados por esse fluxo. Um IPA exportado para App Store não é instalável diretamente por `devicectl`.

Overrides opcionais: `AB_IOS_BUNDLE_ID`, `AB_IOS_VERSION`, `AB_IOS_BUILD_NUMBER`, `APPLE_TEAM_ID` e `AB_IOS_SIGNING_IDENTITY` (SHA-1 da identidade existente). `AB_IOS_PNPM_BIN` seleciona um executável pnpm fora do PATH. O Team ID e a identidade são inferidos do perfil e do Keychain quando não há restrição explícita. O certificado precisa constar no perfil e possuir uma identidade válida no Keychain.

## Rede, pareamento e privacidade

O aplicativo é um companion: o processamento dos agentes e os terminais continuam no desktop/`orcad`. Ele precisa de um host real disponível. O caminho direto reaproveita o pareamento Orca e a proteção E2EE existente; nenhum token ou endpoint pessoal foi embutido no aplicativo AB.

No host desktop, o serviço mobile herdado pode ser habilitado na porta 6768 para pareamento na mesma LAN. Conceda a permissão de rede local no iPhone quando solicitada. Esse número não é uma porta reservada ou publicada automaticamente no AB-PCSRV.

Para Docker/appliance, siga a rota privada e a oferta `--mobile-pairing` de [SERVER_DISTRIBUTION.md](SERVER_DISTRIBUTION.md). A configuração padrão publica o runtime apenas em loopback no servidor; o telefone precisa de uma rota própria alcançável, com listener/proxy TLS autorizado e endereço `--pairing-address` correspondente. O plano AB usa VPN administrada pelo proprietário. A compatibilidade herdada com Tailscale continua opcional e exige conectividade de ambos os dispositivos à rede autorizada.

A configuração mantém `NSAllowsLocalNetworking` e as exceções de faixa usadas pelo upstream para Tailscale (`100.64.0.0/10` e `fd7a:115c:a1e0::/48`). A documentação atual da Apple admite IPs e faixas CIDR em `NSExceptionDomains` a partir do iOS 17: [NSExceptionDomains](https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity/nsexceptiondomains) e [NSAllowsLocalNetworking](https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity/nsallowslocalnetworking). Essa configuração não demonstra conectividade efetiva e não substitui a permissão de rede local, VPN ou firewall.

Câmera é utilizada para o pareamento; microfone para ditado enviado ao computador pareado; fotos escolhidas podem ser anexadas às sessões. As mensagens de permissão AB foram adaptadas nos idiomas existentes. O manifesto de privacidade de SDKs e as declarações de criptografia existentes continuam sujeitos a revisão antes de uma submissão pública à Apple. Não se declara que os formulários de privacidade da App Store foram preenchidos ou que uma política upstream cobre automaticamente a implantação de Alexandre.

Push remoto fica desativado no pacote AB inicial. Notificações locais e eventos enquanto o app está conectado seguem os recursos existentes. iOS pode suspender a conexão quando o app entra em segundo plano; uma conexão WebSocket não é uma garantia de entrega em background. Para APNs real, registre a capacidade no App ID AB, emita o perfil correspondente e configure um gateway próprio com `ORCA_PUSH_APNS_TOPIC` igual ao bundle ID AB e credenciais da equipe responsável. O servidor upstream usa um tópico próprio; suas credenciais não são reutilizadas. Só então selecione `AB_IOS_APS_ENVIRONMENT=development` para desenvolvimento ou `production` para ad hoc/App Store. O preflight recusa ambiente incompatível com perfil e método de exportação.

## Papel do ipatool

O [`majd/ipatool`](https://github.com/majd/ipatool) pesquisa aplicativos e baixa pacotes da App Store para uma conta Apple autorizada. Ele **não compila o código deste repositório, não emite certificados, não assina o fork e não instala o IPA próprio no iPhone**. O AB ainda não possui uma listagem App Store verificada, portanto não há um download AB disponível a alegar.

O binário oficial **2.7.0** foi executado nesta sessão com `--version` e `download --help`; o pacote consultado correspondeu ao SHA-256 oficial da release. Não houve `auth login`, compra, download de aplicativo associado a uma conta, contorno de DRM ou alteração de provisioning. O comando `download --help` informa as opções `--bundle-identifier`, `--output`, `--platform` e a opção separada `--purchase`.

Após uma futura publicação AB e autenticação feita pelo proprietário no terminal, um download autorizado pode ser solicitado assim, mantendo a identificação obtida da configuração real:

```bash
AB_STORE_BUNDLE_ID="$(node -p "require('./config/ab-ios-identity.cjs').resolveAbIosIdentity().bundleIdentifier")"
ipatool --non-interactive download --bundle-identifier "$AB_STORE_BUNDLE_ID" --platform iphone --output AB-BRAINMASTER-ORCA-AppStore.ipa
```

Esse comando é documentação para uma publicação futura, não uma execução realizada. Não inclui `--purchase`; falta de licença deve ser tratada pelo proprietário. Um IPA App Store conserva as restrições de distribuição Apple e não substitui o fluxo de exportação local do fork.

## Evidência e pendências da fase 2

### Avisos de licença no recurso nativo

O archive do commit `a4300ad0e05fee7d0a93cd021fa1d2ad5c7486de` passou na [execução nativa 41548928170](https://github.com/oalexandrebelo/ab-brainmaster-orca/actions/runs/41548928170). A inspeção posterior confirmou arm64 e JavaScript embutido, mas não encontrou arquivos de licença/NOTICE/OFL/acknowledgements no app; Mermaid estava presente sem seu texto MIT. Esse artefato anterior **não comprova cobertura dos avisos de licença**.

O fluxo corrigido instala no projeto Xcode a fase **AB Include Third Party Notices**, depois de **Bundle React Native code and images** e das demais fases de cópia de recursos, antes da assinatura realizada pelo Xcode. O próprio bundle nativo agora emite `SOURCEMAP_FILE`; a fase de avisos usa esse mapa, inclusive sua composição com Hermes, e não faz um segundo export Metro. O projeto gerado pelo Expo foi inspecionado localmente para confirmar a ordem e a ausência de duplicação da fase.

A seleção JavaScript considera apenas índices de fontes referenciados nos segmentos do sourcemap. A métrica é quantidade de referências, não bytes. `stageDependencyNotices()` recebe essas fontes explicitamente e expande os três relatórios dos geradores mobile, que descrevem quatro outputs. Um output só é expandido quando o mapa o referencia; seus bytes devem coincidir com o conteúdo original do mapa e com o hash do relatório do gerador. Fontes ou relatórios desatualizados interrompem o build.

A composição upstream React Native/Hermes normaliza caminhos como `/../src/shared/` para `/src/shared/`. O leitor considera o caminho integral sob `mobile/` e a raiz do checkout, exige que o caminho real permaneça no checkout e seleciona JavaScript somente por correspondência SHA-256 com `sourcesContent`. Ausência de conteúdo ou de correspondência, assim como duas correspondências, interrompe o build. Não há busca por basename nem alteração do compilador. Para PNG cujo `sourcesContent` esteja vazio, é necessário um único candidato pelo caminho integral; o recibo registra `contentVerification: not-in-source-map` e o hash local, sem afirmar equivalência ao asset transformado copiado no aplicativo.

Os recursos são gravados em `ABThirdPartyNotices/` dentro do produto que o Xcode ainda está construindo. Incluem o MIT upstream do Orca, índice e textos completos das dependências npm selecionadas, os OFL dos assets explicitamente descritos pelos geradores, o Markdown e o plist de acknowledgements produzidos pelo CocoaPods para o target da aplicação e o `Podfile.lock` correspondente. A fase recusa um produto que já contenha `_CodeSignature`; não remenda um archive exportado ou aplicativo assinado. Nenhum texto é baixado nessa fase: ausências devem ser resolvidas antes, com origem oficial e hash fixados no repositório.

`manifest.json` registra hashes de todos os recursos, do `main.jsbundle` final e do sourcemap utilizado. Um recibo fora do app, em `ios-notice-receipt.json` na saída do build, permite comparar o manifesto encontrado no archive com o que a fase produziu. `inspectApp()` e `verifyIpa()` recusam arquivos ausentes, alterados ou não listados, mudança no bundle, divergências entre o índice e os textos e divergência em relação ao recibo quando disponível. O sourcemap completo não é redistribuído no app; `metro-provenance.json` contém fontes, hashes e contagens, sem os conteúdos-fonte.

Na verificação local com o `export:embed` real, o mapa Metro selecionou **6.626 arquivos de fonte**, **4.734.885 referências** e **três módulos virtuais**. A coleta produziu **175 pacotes npm, 182 arquivos de licença, quatro outputs gerados incluídos e dois textos OFL de fontes**. Os textos MIT de Mermaid 11.17.2 e xterm estão incluídos e possuem hashes no índice. Vinte e um pacotes Expo/React Native/Metro sem texto no tarball instalado receberam pins de licença vinculados ao `gitHead` da versão npm e ao arquivo oficial por commit; os textos já existentes foram reutilizados após comparação de hash. Esses números descrevem o teste local; o archive nativo atual registrou 177 textos npm, após excluir cinco arquivos de código indevidamente classificados. Os LICENSE reais e os 175 pacotes foram preservados.

A prova foi repetida após compilar esse bundle com o Hermes instalado e compor os mapas pelo script original do React Native. O mapa final manteve os mesmos **6.626 arquivos**, sem inclusões ou exclusões, e registrou **1.761.924 referências**, **6.576 correspondências exatas de conteúdo** e **50 PNG sem conteúdo no mapa**. A coleta manteve os mesmos 175 pacotes, 182 textos, quatro outputs gerados e dois OFL. Essa prova local verifica a composição efetivamente usada pelo fluxo; não é compilação nativa iOS.

A rodada histórica de 18 testes de regressão cobriu assinatura, seleção por referências, fonte ausente, índice inválido, output gerado obsoleto, caminhos normalizados/ambíguos, fuga por symlink, limite dos PNG, ordem/idempotência da fase, remoção/alteração de textos, mudança do bundle, recibo divergente e recusa de produto assinado. O teste de cópia CocoaPods usa dados nativos sintéticos identificados como fixture; a presença dos acknowledgements reais foi posteriormente conferida no archive do run `41565349527`. Os avisos nativos refletem o output de acknowledgements do target agregado CocoaPods; não são uma auditoria independente de símbolos do executável ou de toda declaração de licença de cada pod. Os dois assets de fontes têm evidência explícita; outras imagens/mídias não receberam auditoria independente além da licença do pacote proprietário mapeado ou do código Orca. Módulos virtuais de runtime/roteamento estão listados separadamente. Os recibos conservam esses limites e não declaram aprovação jurídica, de privacidade ou da App Store.

Verificado no Linux: instalação `pnpm 12.14.0 --frozen-lockfile`; resolução pública do Expo; prebuild iOS completo; bundle ID, nome, deployment target e entitlements nativos gerados; testes das recusas de assinatura e do comportamento de push/atualização; lint dos arquivos alterados. O prebuild gerou `ABBRAINMASTERORCA.xcodeproj` e um arquivo `.entitlements` vazio no modo sem APNs. **Prebuild não é compilação Xcode.**

O workflow `AB iOS native archive (unsigned)` usa Xcode 26.2 no runner macOS 15, compila para dispositivo e valida o executável e seu bundle Release. O run atual aprovado está identificado acima; ele publicou um `.xcarchive.tar.gz` explicitamente `UNSIGNED`, logs e `build-evidence.json`. O artefato unsigned não é um IPA e não instala no iPhone. A referência do archive deve ser preservada ao comparar builds futuros.

Às 05:24 UTC de 2026-11-03, os dois Macs cadastrados continuavam offline no inventário remoto; não foi iniciado processo remoto. Ainda faltam: um Mac online para assinatura/instalação, conta e App ID Apple adequados, certificado com chave privada, perfil correspondente, UDID e versão iOS do aparelho, confiança/Developer Mode quando aplicáveis, exportação assinada real e validação de pareamento, terminal, arquivos, ditado e retorno de segundo plano no iPhone. O fluxo falha explicitamente quando os insumos necessários estão ausentes.
