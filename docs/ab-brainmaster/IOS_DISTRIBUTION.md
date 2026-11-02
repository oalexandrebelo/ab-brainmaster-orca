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

Para uma primeira instalação, use iPhone e computador na mesma LAN, abra o serviço mobile do host na porta 6768 e escaneie o QR code de pareamento. Conceda a permissão de rede local no iPhone quando solicitada. Em acesso por Tailscale, ambos precisam estar conectados à rede autorizada e conseguir alcançar o endereço do host. Não exponha a porta diretamente à internet para substituir uma rota privada.

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

Verificado no Linux: instalação `pnpm 12.14.0 --frozen-lockfile`; resolução pública do Expo; prebuild iOS completo; bundle ID, nome, deployment target e entitlements nativos gerados; testes das recusas de assinatura e do comportamento de push/atualização; lint dos arquivos alterados. O prebuild gerou `ABBRAINMASTERORCA.xcodeproj` e um arquivo `.entitlements` vazio no modo sem APNs. **Prebuild não é compilação Xcode.**

O workflow `AB iOS native archive (unsigned)` usa Xcode 26.2 no runner macOS 15, compila para dispositivo e valida o executável e seu bundle Release. Ao passar, publica por sete dias um arquivo `.xcarchive.tar.gz` explicitamente `UNSIGNED`, logs e `build-evidence.json`. A execução, seu commit e resultado devem ser registrados no relatório final; a simples presença do workflow não prova sucesso. O artefato unsigned não é um IPA e não instala no iPhone.

Os dois Macs cadastrados estavam offline no inventário remoto desta sessão; não foi iniciado processo remoto. Ainda faltam: um Mac online para assinatura/instalação, conta e App ID Apple adequados, certificado com chave privada, perfil correspondente, UDID e versão iOS do aparelho, confiança/Developer Mode quando aplicáveis, exportação assinada real e validação de pareamento, terminal, arquivos, ditado e retorno de segundo plano no iPhone. O fluxo falha explicitamente quando os insumos necessários estão ausentes.
