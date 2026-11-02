# Verificação da base P0 e correções posteriores

Data: 2 de novembro de 2026. Base de comportamento auditada: `d616c1b9eac49b4f4e1c73a1eb5e802c67c332bb`. Plataforma de execução: Linux, Node 24.22.1. As tabelas abaixo preservam a evidência da entrega P0; verificações posteriores não alteram retroativamente esses resultados. Os escopos diferentes não devem ser somados como certificação do aplicativo inteiro.

A implementação posterior e os gates próprios de host, contexto, servidor, modelo local, contêiner, appliance e iOS estão em [PHASES_P1_P5.md](PHASES_P1_P5.md).

## Correção de compatibilidade na continuação P1

A conclusão inicial de incompatibilidade baseada somente em `package.json` estava incompleta. O runtime usa `pluginHostVersion(appVersion)`, que escolhe a maior versão entre o aplicativo e os contratos de plugin implementados. `src/main/startup/main-process-plugins.ts` aplica essa versão efetiva. Os dois ensaios de schema foram corrigidos para testar a função real. Ambos passaram sem reduzir requisitos dos manifestos ou alterar a versão do pacote. A instalação imutável, consentimento por fingerprint, processos worker e bridge dos dois módulos também passaram no ensaio de runtime P1. Esses resultados não equivalem, por si só, à validação visual de todos os clientes e plataformas.

## Ensaios executados

| Grupo                             |                       Resultado | O que demonstra                                                                                                             |
| --------------------------------- | ------------------------------: | --------------------------------------------------------------------------------------------------------------------------- |
| Contratos dos dois módulos AB     |                19/19, sem skips | Estados, limites, escopo de workspace, parsing adversarial, cache e comportamento do painel testável.                       |
| Schemas/identidade reais do Orca  |                  2/2, sem skips | Manifestos válidos, pisos de engine preservados e diferença de identidade de pasta/worktree.                                |
| CLI e proxy Billion Context reais |                  2/2, sem skips | Versão/help, processo próprio, health/watchdog, preservação de porta ocupada, forwarding e veredito de bloqueio preservado. |
| Lint dos módulos                  |           Exit 0 após correções | Conformidade com as regras aplicadas pelo oxlint do repositório.                                                            |
| Formatação dos módulos            |           Exit 0 após correções | Conformidade com o oxfmt do repositório.                                                                                    |
| Revisão independente              | Achados corrigidos no candidato | Escopo de workspace, incompatibilidade de identidade Git e persistência dos documentos.                                     |

O upstream HTTP usado no ensaio de Billion Context é um servidor controlado de teste. O binário `bili` é o pacote npm real `billion-context@0.1.212`, build `daa082ea`. Não houve chamada a modelo real, sessão real Claude ou medição de economia de tokens. A fonte auditada no GitHub tem revisão `dec393f430cb7495a54133e3d7fad4bc2bea8968`; não foi tratada como byte-idêntica ao build npm.

A preparação do contexto e o lançamento são etapas distintas. A primeira valida caminhos, versão, workspace e fingerprints; o segundo cria configuração própria e verifica identidade do processo, healthcheck e watchdog. O candidato suporta somente novos terminais Claude com chave de API em workspaces de pasta locais. Worktrees Git são recusados antes da ativação.

## Consulta real de upstream

Em `2026-11-02T17:46:56.857Z`, a CLI resolveu `main` para `509461af4f25cd1b65d9c153b62ae299fb1bda65`: um commit e 56 arquivos depois da base auditada. A consulta fez dois GETs e recebeu 391.552 bytes em 888 ms. Esse tempo é uma observação pontual da consulta, não um benchmark de performance do produto. Nenhuma atualização foi aplicada.

O resultado completo e a tentativa anterior que retornou `offline` estão em `upstream-evidence.json`.

## Mapas

Os cinco mapas usam Archify 3.2.0 e Chromium 134.0.6998.35. Os recibos finais são vinculados aos bytes finais da especificação e do HTML. Depois da formatação do JSON, os gates foram executados novamente; hashes de recibos não foram editados manualmente para simular revalidação.

As fontes Orca são verificadas em checkout limpo do upstream no SHA base. O `origin` do fork aponta para outro repositório e não é usado para fingir correspondência com a origem declarada dos mapas. `maps/validation-summary.json` é o resumo dos resultados; recibos completos e HTMLs acompanham os artefatos de apresentação.

## Integração dos testes ao repositório

`config/scripts/check-test-file-runners.mjs` registra os dois globs de testes unitários AB e os testes de integração que exigem pré-requisitos locais explícitos. O workflow `.github/workflows/ab-extensions.yml` executa os testes sem dependências em Node 24.22.1, com permissões somente de leitura e sem credenciais persistidas pelo checkout. Os testes de integração permanecem identificados como manuais; não há afirmação de que o workflow executa um proxy ou um modelo real.

A definição do workflow não constitui um resultado de execução no GitHub. O histórico local e os resultados de CI são evidências distintas.

## Gate geral e escopo

Foi executado `pnpm check:changed` com pnpm 12.14.0 e a base auditada. A primeira execução instalou as dependências pelo lockfile, construiu `process-host` e preparou dependências nativas. Encontrou problemas de formatação/lint, testes AB sem runner registrado e um timeout de um minuto no passo Vitest. Os dois primeiros grupos e o registro do runner foram corrigidos antes da publicação. O resultado do ciclo final de verificação é registrado no dossiê da entrega.

Preparar dependências nativas não significa compilar, instalar ou homologar o aplicativo desktop. Docker e Xcode não foram utilizados; não há declaração de build macOS/iOS, assinatura, notarização, ISO inicializável ou imagem Docker testada.

## Comandos reproduzíveis

Contratos locais:

```sh
node --test --test-isolation=none \
  packages/ab-bill-context/tests/*.test.mjs \
  packages/ab-upstream-review/tests/*.test.mjs
```

Schemas reais, com Zod instalado pelo lockfile do Orca:

```sh
AB_ORCA_TEST_SOURCE="$PWD" \
AB_ORCA_TEST_ZOD="$PWD/node_modules/zod/index.js" \
node --test --test-isolation=none \
  packages/ab-bill-context/tests/orca-schema.integration.mjs \
  packages/ab-upstream-review/tests/orca-schema.integration.mjs
```

Proxy real, depois de obter e aprovar a versão indicada de Billion Context em ambiente de ensaio:

```sh
AB_BILI_TEST_ENTRY=/caminho/isolado/node_modules/billion-context/dist/index.js \
node --test --test-isolation=none \
  packages/ab-bill-context/tests/sidecar.integration.mjs
```

Gate geral:

```sh
pnpm check:changed \
  --base=d616c1b9eac49b4f4e1c73a1eb5e802c67c332bb \
  --maxWorkers=2 --timeout=5
```

## Gates registrados ao término de P0

- A hipótese de incompatibilidade pelo número `1.4.214` foi corrigida na continuação P1 conforme a seção inicial. Build, instalação e interface devem continuar sendo provados separadamente.
- Carregamento e uso dos painéis em um build desktop compatível, incluindo teclado, contraste, leitor de tela e clientes remotos.
- Ponte de identidade para worktrees Git antes de ampliar o toggle de contexto.
- Integração instalada com BBrainX/AB-S00S, embora os contratos de fonte tenham sido inspecionados.
- Sessão real com modelo e avaliação de qualidade de compressão/recuperação.
- Identidade, dados, atualização e assinatura próprias antes de distribuição AB.
- Tarefa completa em rede isolada para comprovar independência, além de backups/restauração e benchmarks definidos no plano.
