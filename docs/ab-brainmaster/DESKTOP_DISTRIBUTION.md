# Distribuição desktop AB: proveniência e gates

O perfil `config/electron-builder.ab.config.cjs` gera um diretório Linux de desenvolvimento. A workflow `.github/workflows/ab-desktop-native.yml` executa esse perfil para x64, preserva os gates de empacotamento upstream e arquiva os recibos junto do pacote. Esse alvo não é um instalador assinado.

## Pacote nativo verificado

O [run 41582866783](https://github.com/oalexandrebelo/ab-brainmaster-orca/actions/runs/41582866783), commit `13013d24dea66c1b9c6345b3cd6f72b7ac1d691c`, concluiu build, rebuild Sherpa, ASR real em Node/Electron, gate ELF e empacotamento. O tar `AB-BRAINMASTER-LINUX-X64-DEVELOPMENT.tar.gz` tem **261.285.782 bytes** e SHA-256 `27f30642861715c7f2a7d8dc6e5a8edcd04bcf88283af170b272c7885b4aee7c`. A correção da chave de autoridade está no ASAR final; o testemunho estático resolve também os imports dos helpers de publicação e fsync.

A inspeção conferiu 7.614 arquivos regulares e vinculou 2.054 registros aos bytes do pacote: 507 pacotes, 523 textos dessas dependências, 547 arquivos de notices ao todo e 76 fontes em cinco grupos. O ASAR tem 16.826.371 bytes e SHA-256 `7f017fe9eec91470ee270211030523c14c39e1197c2f8074d2e4f58ad491559b`. Os 39 arquivos de contexto foram ligados aos blobs do commit; o coordenador repetiu o rehash dos 81 arquivos de evidência e a leitura de três módulos e quatro fragmentos compilados do ASAR.

A varredura por magic em todos os arquivos regulares encontrou 21 imagens ELF executáveis/dinâmicas e um objeto relocável `node-pty/.../pty.o`, de 122.080 bytes. As 21 imagens correspondem exatamente ao collector de runtime publicado, com zero violações e zero exceções utilizadas. Os máximos são GLIBC 2.28, GLIBCXX 3.4.26 e CXXABI 1.3.11. O primeiro verificador privado tentou aplicar `objdump -T` ao objeto relocável e falhou; esse resultado foi preservado, e a classificação passou a usar o tipo ELF. Payload e gate publicado permaneceram intactos.

O novo CI executou 10 testes do signer em três arquivos, 89 testes de contratos em 11 arquivos e sete testes de notices em três arquivos. São grupos identificados pelos logs, sem soma para alegar cobertura integral do upstream. A regressão ASR em Node e Electron usou a mesma amostra de 6,625 segundos e produziu a transcrição esperada. Os tempos são observações de compatibilidade desse run, sem alegação de benchmark comparativo. O testemunho compilado e o inventário são inspeções estáticas, sem execução da GUI, instalador ou modelo pelo revisor. Não se declara completude jurídica dos avisos.

O diretório não inclui `orcad-template`. O desktop local e o fallback Electron de `orca serve` permanecem disponíveis; criação/conversão/atualização de servidor remoto gerenciado que exija esse template não está distribuída neste alvo. Use o release de servidor ou Docker documentados em [SERVER_DISTRIBUTION.md](SERVER_DISTRIBUTION.md). A consulta upstream executada pelo CLI teve sucesso. O painel da UI apresentou erro de rede no ambiente com proxy: o worker filtra variáveis de proxy. Não se declara sucesso online da UI nesse ambiente.

Recibos e limites da verificação: [CI_EVIDENCE_20261103.md](CI_EVIDENCE_20261103.md).

## Evidência do conteúdo distribuído

O plugin `config/build-plugins/ab-desktop-build-provenance.ts` registra os módulos que Rolldown informa com `renderedLength > 0`. Esse valor mede caracteres renderizados, sem ser apresentado como bytes de esbuild. Workers entram na proveniência quando o nome e o SHA256 do código capturado correspondem ao asset final emitido.

Os relatórios `out/reports/ab-release-desktop-{main,preload,renderer}.json` ligam esses módulos aos hashes dos outputs. Antes do empacotamento, o perfil AB rejeita relatórios vazios ou outputs alterados. Após o empacotamento, verifica novamente os bytes reais do ASAR, incluindo seus membros desempacotados. Os relatórios e os insumos de compilação em `out/ab-sherpa` ficam fora do payload.

Os módulos externos são selecionados pelas cópias que existem no diretório final de recursos. Um pacote apenas instalado não é suficiente para entrar no inventário. Os quatro runtimes declarativos de plugins são regenerados em memória com os metafiles reais de esbuild e comparados ao arquivo distribuído. O bundle mobile e seus geradores consomem o mesmo coletor de notices usado pelos outros alvos AB.

`resources/notices/ab-desktop/` contém:

- `dependencies.json`: pacotes identificados, motivo de inclusão, textos fornecidos, hashes e diferenças de proveniência conhecidas.
- `desktop-provenance.json`: outputs reais, cópias observadas, fontes, runtimes e módulo de fala.
- `assets/provenance.json`: fontes realmente encontradas no renderer, seus hashes, declarações incorporadas e textos completos que as acompanham.
- `native/provenance.json`, `rebuild.json` e `asr-*.json`: origem do addon, bibliotecas preservadas, toolchain e reconhecimento executado.
- Textos integrais de Electron/Chromium e do Node fixado, além da licença do núcleo Orca.

O coletor inclui `ThirdPartyNotices` dos pacotes selecionados e evita classificar arquivos de código como `copyright.mjs` ou `license-update.mjs` como documentos de licença.

## Fontes do renderer

O stager lê as fontes do ASAR final e exige correspondência SHA256 com `deploy/ab-brainmaster/licenses/desktop-font-pins.json`. Uma fonte desconhecida ou alterada bloqueia o pacote.

| Componente        | Vínculo utilizado                                                                                                                        |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Geist             | O WOFF2 local é idêntico ao arquivo de `geist@1.8.2`; `LICENSE.txt` integral do mesmo tarball.                                           |
| Symbols Nerd Font | Bytes do arquivo versionado e OFL integral adjacente.                                                                                    |
| KaTeX             | Declarações originais de copyright, nome reservado e OFL extraídas de cada fonte; texto padrão OFL 1.1 integral e identificado como tal. |
| Codicons          | Fonte idêntica ao `vscodeRef` declarado por `monaco-editor@0.55.1`; `ThirdPartyNotices.txt` integral desse mesmo commit.                 |
| PDF.js            | Fontes e textos Foxit/Liberation originais do pacote efetivamente distribuído.                                                           |

O caso KaTeX preserva os campos originais do próprio binário: não reconstrói anos, autoria ou nomes reservados. O texto padrão OFL não é apresentado como um arquivo de licença fornecido no tarball npm. No caso Codicons, o notice do VS Code identifica a versão 0.0.41, mas o VS Code modificou alguns glifos; a prova se refere ao commit do VS Code, sem atribuir identidade binária ao tarball npm Codicons.

## Sherpa 2.0.1 e piso glibc

As cinco variantes opcionais de Sherpa estão fixadas em 2.0.1. A alteração acompanha a remoção upstream de eSpeak/Piper anunciada pelo mantenedor na [issue 3731](https://github.com/k2-fsa/sherpa-onnx/issues/3731). O worker Orca usa APIs de reconhecimento de fala. Não houve alteração do worker ou da interface de usuário para esta migração.

O addon Linux x64 publicado no npm requer `GLIBC_2.32`, acima do piso 2.31 aplicado pelo projeto. O perfil AB recompila somente `sherpa-onnx.node` a partir do `gitHead` npm `af2d8d81dbfa61c4cea4c568da78f3982edca005`, usando o CMake oficial de `scripts/node-addon-api`. As bibliotecas `libsherpa-onnx-c-api.so`, `libsherpa-onnx-cxx-api.so` e `libonnxruntime.so` permanecem byte a byte iguais ao pacote 2.0.1.

`config/ab-sherpa-addon-pin.json` fixa o archive de fontes, Node-API 8.3.0, CMake 3.31.10, imagem GCC 10.5.0/bullseye por digest, arquivos npm e os notices ONNX Runtime 1.28.2. Os archives oficiais ONNX possuem `libonnxruntime.so` idêntico às variantes npm Linux correspondentes; os textos `LICENSE` e `ThirdPartyNotices.txt` são preservados integralmente.

O container de compilação executa sem rede, com insumos somente leitura, 2 CPUs e 4 GiB. Downloads ocorrem antes e são verificados pelos hashes fixados. A receita oficial permanece intacta; não há substituição de símbolos ou patch de binários. O recibo diferencia o hash do addon npm original do hash recompilado.

Após a compilação, o mesmo gate `verifyLinuxGlibcFloor` verifica o módulo e seus DSOs. O empacotamento substitui o addon somente depois de conferir todos os arquivos npm originais e executa novamente os gates upstream sobre o payload já substituído. O fluxo deve usar o perfil AB indicado acima; não há bypass do piso glibc no perfil base upstream.

## Reconhecimento real obrigatório

Antes de aceitar o addon recompilado, `verify-ab-sherpa-asr.mjs` executa `out/main/stt-worker.js` com o modelo Zipformer inglês 20M já fixado no catálogo e a amostra oficial `test_wavs/0.wav` em uma revisão imutável. Executa em Node e em Electron com `ELECTRON_RUN_AS_NODE=1`, sem janelas.

O resultado deve coincidir com a transcrição obtida pelo worker existente usando Sherpa 1.12.37 na mesma amostra. Trata-se de um teste de regressão sobre uma amostra identificada, sem pretensão de medir a acurácia geral do reconhecedor. Cada recibo registra os hashes de modelo, áudio, worker e addon, além da versão do runtime. Recibos ausentes ou incompatíveis bloqueiam o empacotamento.

Depois de instalar as dependências fixadas, gerar o host AB, o bundle mobile e o helper Wayland, a sequência nativa é:

```sh
export ORCA_BACKGROUND_LAUNCH=1
export ORCA_DISTRIBUTION=ab-brainmaster
export ROLLDOWN_WORKER_THREADS=2
export RAYON_NUM_THREADS=2
export NODE_OPTIONS=--max-old-space-size=4096

node config/scripts/ab-sherpa-addon.mjs x64
OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 node config/scripts/verify-ab-sherpa-asr.mjs x64
electron_path=$(node -p "require('electron')")
ELECTRON_RUN_AS_NODE=1 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 \
  "$electron_path" config/scripts/verify-ab-sherpa-asr.mjs x64

pnpm exec electron-builder \
  --config config/electron-builder.ab.config.cjs \
  --linux dir --x64 --publish never
```

A workflow versionada contém a preparação completa e preserva logs mesmo quando um gate falha. Os pins arm64 permitem o rebuild em runner Linux arm64 nativo; a workflow de entrega atual executa x64. A presença de pins macOS/Windows não equivale a testes nativos dessas plataformas.

## Diferenças documentadas de origem

Os registros de `format@0.2.2`, `react-remove-scroll-bar@2.3.8` e `lazy-val@1.0.5` carregam explicações específicas no índice. Para `react-remove-scroll-bar`, o LICENSE foi acrescentado posteriormente pelo próprio autor e não é atribuído ao gitHead npm indisponível. Para `lazy-val`, o pacote declara MIT, mas não fornece LICENSE completo: preservam-se o `package.json` original e o texto padrão MIT com seus placeholders intactos, identificado separadamente. Essas diferenças não são convertidas em uma afirmação geral de conformidade jurídica.
