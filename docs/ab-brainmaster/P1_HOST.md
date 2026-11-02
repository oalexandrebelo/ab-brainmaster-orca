# P1 — Host AB, identidade e módulos reais

## Resultado e escopo

O core deste checkout aceita os dois módulos existentes sem alterar a versão do aplicativo nem reduzir seus requisitos. A primeira execução completa do build Linux AB passou, e o aplicativo Electron real carregou os módulos locais mediante consentimento pelo fingerprint. O painel Contexto verificou executáveis reais, percorreu OFF → ON → OFF com interação de mouse/teclado e preservou o estado desligado. O painel Atualizações do Orca abriu e apresentou corretamente a indisponibilidade de rede desta sessão.

Há uma distribuição desktop AB explícita e separada do target upstream. O código não é uma publicação, instalador assinado, build macOS/Windows qualificado ou homologação de tarefa Claude com provedor externo. Nenhuma credencial de modelo foi utilizada nesta validação.

## A diferença entre versão do pacote e contrato de plugins

O `package.json` continua na versão upstream `1.4.214`. O arquivo upstream `src/shared/plugins/installation/plugin-host-version.ts` já define `pluginHostVersion(appVersion)` como o maior valor entre a versão informada e `PLUGIN_SCHEMA_NEWEST_SINCE`. Neste checkout, o schema mais novo é `1.4.248`.

O startup real, em `src/main/startup/main-process-plugins.ts`, já fornece `pluginHostVersion(app.getVersion())` aos caminhos de instalação, catálogo e serviço de plugins. Assim, o host anuncia efetivamente `1.4.248` para esse contrato. Isso admite `ab-upstream-review >=1.4.246` e `ab-bill-context >=1.4.248`. Não houve backport, bump de versão, redução do engine ou desvio do validador.

Os testes de schema dos módulos agora importam o resolver real. Eles mantêm a recusa de um host que anuncie diretamente `1.4.214`, validam os manifestos e conferem a aceitação pelo valor efetivamente usado no startup. As advertências anteriores que tratavam apenas o número do pacote como impedimento foram corrigidas.

## Identidade da distribuição

`src/shared/distribution-identities.json` é a fonte única dos valores; os adaptadores CJS de build e TypeScript de runtime usam o mesmo registro. `ORCA_DISTRIBUTION` seleciona o build; um valor desconhecido gera erro. O default continua sendo o target Orca.

| Propriedade                            | Target Orca                           | Target AB                                |
| -------------------------------------- | ------------------------------------- | ---------------------------------------- |
| Nome do produto                        | Orca                                  | AB Brainmaster                           |
| App ID                                 | `com.stablyai.orca`                   | `io.github.oalexandrebelo.abbrainmaster` |
| Perfil instalado                       | comportamento upstream                | `ab-brainmaster`                         |
| Perfil de desenvolvimento              | `orca-dev`                            | `ab-brainmaster-dev`                     |
| Executável Linux                       | `orca-ide`                            | `ab-brainmaster`                         |
| Registro de protocolo                  | `orca://`                             | nenhum registro upstream                 |
| Atualização automática                 | comportamento upstream                | desabilitada                             |
| Gerenciamento do comando global `orca` | comportamento upstream                | indisponível                             |
| Telemetria PostHog upstream            | gates upstream de build/consentimento | bloqueada por identidade                 |

A precedência da configuração explícita de perfil e do isolamento E2E foi preservada. AB não instala, remove nem repara o comando global `orca`; um teste com arquivo sentinela comprova a ausência de alteração. O updater AB não inicializa feed, timer, download, instalação ou troca de build. As ações manuais retornam uma mensagem explícita sobre instalação de um build AB revisado.

Mesmo que um ambiente de CI herde `ORCA_BUILD_IDENTITY`, `ORCA_POSTHOG_WRITE_KEY` ou `ORCA_DIAGNOSTICS_TOKEN_URL`, o target AB compila os três valores como `null`. A entrada de telemetria também verifica a identidade em runtime. O teste tenta habilitar telemetria com identidade oficial e consentimento positivo: nenhum transporte ou agendamento é criado. O target upstream conserva seu comportamento e sua suíte de início adiado passou.

O build emite `out/main/distribution.json`; o empacotamento AB recusa um marker de outro target. Os títulos HTML do renderer usam o nome AB. O monograma original `resources/build/ab-brainmaster.svg` e seu PNG são usados pelo pacote Linux e pelas janelas AB, preservando os arquivos e créditos upstream. Textos internos e referências funcionais ao Orca permanecem onde identificam o projeto de origem; não foi executada uma substituição global de marcas.

## Instalação e exercício dos módulos no aplicativo

A validação usou Electron `43.8.4`, Node `24.22.1`, Xvfb isolado e o workflow da skill Electron oficial do próprio upstream, recuperada do commit público `3b8b3a8bb85896a8ff99c09cc987449e478c0455`. Playwright CLI `0.1.23` anexou via CDP a uma porta livre. `ORCA_BACKGROUND_LAUNCH=1` permaneceu ativo; não houve chamada de show, focus ou bringToFront.

O helper oficial `tests/e2e/helpers/electron-home-isolation.ts` criou HOME e userData descartáveis. O aplicativo não reutilizou perfil ou credenciais pessoais. Os módulos foram instalados por `window.api.plugins.install({ kind: 'local-path', ... })` e aprovados por `window.api.plugins.consent` com o fingerprint retornado pelo host. Não houve edição manual do banco para contornar consentimento. O teste separado de integração instancia `PluginService` real e o worker compilado real; também comprova que um módulo não aprovado não inicia.

Foi criado um workspace local de pasta real, sem converter a identidade de worktrees Git legados. A preparação no painel verificou:

| Componente          | Versão executada     |
| ------------------- | -------------------- |
| Node                | `v24.22.1`           |
| billion-context     | `0.1.212 (daa082ea)` |
| Claude Code oficial | `2.1.316`            |

O Claude foi instalado em área isolada e executado apenas com `--version`, sem login. O limite de 16.000 tokens no plano foi um valor de QA para configuração/health, sem invocar nem alegar a capacidade de qualquer deployment de modelo.

O painel passou de “Configuração pendente” para “Configuração verificada”. O switch confirmou `aria-checked=false`, depois `true` com “Ligado para novos terminais”, depois `false` novamente usando a tecla Espaço. O estado final permaneceu desligado após reinstalação/consentimento do módulo atualizado. O toggle não encerra sessões já abertas.

O mesmo plano escrito pelo painel iniciou o proxy real por `startSidecar`: health confirmou `ok=true`, versão `0.1.212`, PID do filho criado e watchdog armado para o supervisor correto. Não houve encaminhamento para um provedor. O encerramento revelou uma corrida prévia: após SIGKILL, a função podia retornar antes do evento de término. A correção acrescenta espera limitada, devolve erro quando não confirma o término, protege a tentativa de parar o sidecar mesmo se o cliente falhar e só grava `closed.json` depois de cleanup bem-sucedido. O teste executa um filho próprio que ignora SIGTERM e exige término confirmado por SIGKILL. A repetição com o proxy real confirmou `stopped=true`, `signal=SIGKILL` e health indisponível.

O painel Atualizações do Orca iniciou seu worker somente quando usado, e uma consulta foi acionada pelo botão. O resultado mostrou “Consulta incompleta” e “Não foi possível acessar o GitHub”. O host filtra o ambiente de workers por allowlist e remove flags do processo pai; `HTTP_PROXY`, `HTTPS_PROXY`, `NODE_OPTIONS` e flags `--use-env-proxy` não são herdados. Essa proteção não foi relaxada para fazer a prova passar. A prova online da CLI com proxy é separada da validação desse painel.

Durante a instalação sequencial inicial, o worker de Contexto registrou uma reinicialização quando o catálogo invalidou seu consentimento durante refresh; ele retornou ao estado `running` e o ciclo UI passou. A integração isolada com o serviço/worker real passou com zero reinicializações. Esses resultados não são apresentados como a mesma medição.

## Build e verificações

Comandos reproduzíveis a partir da raiz, após as dependências exigidas pelo projeto:

```sh
ORCA_BACKGROUND_LAUNCH=1 ORCA_CLI_BUILD_COMPILER=tsrs node config/scripts/build-ab-host.mjs
ORCA_BACKGROUND_LAUNCH=1 ORCA_CLI_BUILD_COMPILER=tsrs node config/scripts/build-ab-host.mjs --pack
```

Há também `pnpm ab:build:host` e `pnpm ab:pack:host`. O caminho `tsrs` foi usado porque o runner padrão deste checkout exige Bun `1.4.4`, ausente inicialmente. O build não instala o CLI no PATH. O empacotamento é limitado a Linux `--dir --publish never`; outros sistemas e formatos são recusados antes de empacotar. Os gates originais de dependências nativas, ripgrep, mobile-web e recursos permanecem ativos.

O upstream permite builds locais sem o template orcad; uma release com `ORCA_REQUIRE_ORCAD_TEMPLATE=1` continua exigindo o template completo. A matriz nativa multi-target não foi fabricada. A disponibilidade do runtime Linux separado pertence à evidência de P3.

Verificações realizadas:

- Primeiro build completo CLI/main/preload/renderer: passou; versão do pacote preservada.
- Build E2E do mesmo host para instrumentação de QA: passou; a execução Electron/CDP descrita acima foi real.
- Contratos de perfil, protocolo, updater, CLI e regressões do updater upstream: 42 testes passaram em seis arquivos.
- Identidade/egress, bloqueio AB de PostHog e regressões do início adiado upstream: 31 testes passaram em três arquivos.
- Integração do serviço/worker real dos dois módulos: passou; reexecutada após os ajustes.
- Schema real dos dois módulos: 2 testes passaram, sem skips.
- Typecheck Node com `tsrs`: passou.
- Oxlint e Oxfmt dos arquivos alterados: sem pendências na última rodada.

O rebuild final CLI/main/preload/renderer passou após liberação de memória, com `ROLLDOWN_WORKER_THREADS=2 RAYON_NUM_THREADS=2`. O renderer levou 11,62 s e passou seu gate de boot com 208 chunks / 6.934,8 KB. O marker AB e o título HTML “AB Brainmaster” foram inspecionados no output final. Uma tentativa intermediária terminou com `fatal library error, lookup self` sob concorrência com outro gate pesado; a repetição passou sem relaxar gates.

**Empacotamento ainda bloqueado:** a execução real de electron-builder `--linux --dir --publish never` chegou ao `beforePack`; a validação de mobile-web passou (181 assets, 12.530.617 bytes), mas `build-wayland-clipboard.mjs` falhou com `spawnSync docker ENOENT`. O build oficial desse helper usa Docker, compila contra o piso glibc suportado e executa os testes de protocolo/X11. Não foi criado binário substituto, stamp artificial ou exceção no gate. É necessário disponibilizar Docker e construir o helper oficial (ou usar cache verificável produzido por esse workflow) antes de repetir o empacotamento. Não existe aqui um pacote Linux completo declarado como aprovado.

O caminho para concluir esse gate está preparado em `.github/workflows/ab-desktop-native.yml`: runner Ubuntu com Docker, ações pinadas por SHA, `contents: read`, branches `ab-brainmaster/**`, dependências lockadas, testes de identidade/workers, build real do helper Wayland e electron-builder com todos os hooks. Só após sucesso são gerados tarball de desenvolvimento, checksum e recibo que confere identidade/versão dentro do ASAR e ausência de feed de atualização. Logs são preservados mesmo em falha. A execução e o download do artefato desse CI são uma etapa posterior à autoria local; não estão implicitamente aprovados por este documento.

A abertura final do build normal confirmou o título “AB Brainmaster”, a identidade retornada pelo host e `window.__store` ausente. Ambos os módulos persistiram instalados e consentidos; Contexto iniciou com zero reinicializações nessa abertura. Esse recibo está em `ui-final-runtime.log`. O botão Contexto no build normal criou o webview com a URL do módulo atualizado (`ui-final-frame-inspection.log`), mas a sessão final do CLI não o enumerou como página separada; o ciclo OFF → ON → OFF não foi repetido nessa última abertura. A prova completa desse ciclo permanece a execução Electron/CDP anterior, no build E2E real, descrita acima.

## Evidências e limites

Os logs desta execução ficam em `brainmaster-phase2/p1` no workspace de entrega: `build-host.log`, `build-host-e2e.log`, `build-and-pack-final.log`, `build-and-pack-final-retry.log`, `host-contracts.log`, `identity-egress-tests.log`, `final-contracts.log`, `typecheck-node-final.log`, `plugin-runtime-test.log`, `cleanup-test.log`, `ui-context-cycle.log`, `ui-final-install.log`, `ui-updated-context.log`, `ui-review-initial.log`, `ui-review-result.log` e `sidecar-health-final.log`. O perfil temporário e os planos locais foram preservados para inspeção; não contêm uma credencial de modelo introduzida por esta validação.

Capturas do webview oculto temporizaram no compositor. A evidência de UI disponível consiste em snapshots acessíveis, valores DOM, respostas reais do host e logs dos processos; não há uma captura visual de sucesso presumida.

Permanecem externos à homologação de P1: sessão Claude autenticada com tarefa real, compressão longa e avaliação de qualidade, sucesso online do reviewer dentro de worker neste ambiente, installers assinados, macOS/Windows e matriz completa de deploy SSH. O bridge BBrainX/AB-S00S de P2 não foi conectado silenciosamente a esses painéis.
