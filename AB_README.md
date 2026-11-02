# AB-BRAINMASTER-ORCA

Fork de desenvolvimento do [Orca](https://github.com/stablyai/orca), preservando seu núcleo e acrescentando módulos AB delimitados. Base auditada: `d616c1b9eac49b4f4e1c73a1eb5e802c67c332bb`. Branch de trabalho: `ab-brainmaster/main`. A branch `main` do fork preserva a cópia do upstream criada no GitHub.

## Entrega atual

| Item                   | Estado                                                                                                                                               |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auditoria arquitetural | 84 fontes e 33 conclusões rastreáveis; leitura estática, sem alegar auditoria de todas as linhas.                                                    |
| Inventário             | 42.727 caminhos do commit base; resumo em `docs/ab-brainmaster/REPOSITORY_COVERAGE.md`.                                                              |
| Mapas Archify          | Cinco especificações e recibo resumido; HTMLs interativos e evidências completas entregues como artefatos separados.                                 |
| Revisão upstream       | CLI funcional, painel instalado e worker real; consulta GET explícita, sem aplicação automática. O resultado online do painel exige rede disponível. |
| Billion Context        | Toggle OFF → ON → OFF exercitado na interface; proxy real com health e cleanup. Escopo: novos terminais Claude em **workspaces de pasta locais**.    |
| BBrainX / AB-S00S      | Bridge SDK/CLI e BBrainX real verificados com escopo e proveniência. O adaptador AB-S00S aguarda implantação e homologação no serviço autorizado.    |
| Host AB                | Identidade, perfil, ícone e atualização separados; build real e workers consentidos. Empacotamento nativo tem workflow próprio.                      |
| Servidor e controle    | `orcad` persistente; HTTP, SDK, CLI e MCP de observação, com pareamento, reconexão e revogação testados.                                             |
| Modelo local           | Runtime durável, contexto BBrainX e inferência Ollama real. Qualidade da resposta, recuperação e bloqueio de rede são gates separados.               |
| Docker e appliance     | Receitas e verificação por manifesto/slots. Cada imagem e boot precisam do recibo de execução correspondente.                                        |
| iOS                    | Variante AB, fluxo Xcode/IPA e instalação com verificação de perfil/aparelho. Archive unsigned, IPA assinado e instalação são entregas distintas.    |

O estado completo e os limites de cada gate estão em [PHASES_P1_P5.md](docs/ab-brainmaster/PHASES_P1_P5.md). A presença de uma receita ou workflow não substitui seu resultado de execução.

## Executar a revisão do upstream

Node 22+; ensaiado em Node 24.22.1:

```sh
node packages/ab-upstream-review/cli.mjs review
```

O JSON distingue enumeração completa, resultado parcial, offline, timeout e limitação. A classificação orienta revisão humana; não aprova código nem aplica atualizações. Consulte [o README do módulo](packages/ab-upstream-review/README.md) para limites e ambiente com proxy.

## Contexto opcional

[Documentação e código](packages/ab-bill-context/README.md). O pacote `billion-context` não é instalado automaticamente. O operador informa o entrypoint de uma versão compatível previamente obtida e aprovada. A preparação valida caminhos, workspace, versão e fingerprints. O lançamento cria a configuração privada e verifica PID, healthcheck e watchdog do proxy.

A opção de forjar aprovação é desabilitada. O proxy usa loopback, ownership e estado próprios; desligar o toggle não interrompe sessões ativas. A integração não declara suporte a worktrees Git, OAuth, Windows, SSH/WSL, sessões retomadas ou native chat. Esses caminhos precisam de contratos e ensaios específicos.

## Compatibilidade efetiva dos plugins

**Correção da investigação inicial:** a versão `1.4.214` do `package.json` não representa, sozinha, a versão da API de plugins. O host usa `pluginHostVersion(appVersion)`, em `src/shared/plugins/installation/plugin-host-version.ts`, que considera também a versão dos contratos implementados. A inicialização real usa essa função. Portanto, a comparação inicial apenas com a versão do pacote não comprovava incompatibilidade.

Os testes atuais exercitam essa função real e preservam os requisitos dos manifestos: revisão `>=1.4.246` e contexto `>=1.4.248`. Nenhum piso foi reduzido e nenhuma versão do aplicativo foi aumentada para contornar a validação. O build de desenvolvimento AB e a instalação dos dois módulos com workers reais foram executados na continuação P1. A homologação visual, a distribuição e seus limites são registrados separadamente nas evidências.

Workers são processos Node com acesso ao host; consentimento por fingerprint e instalação de uma fonte conhecida continuam necessários. Compatibilidade do manifesto não constitui isolamento de segurança do código do plugin.

## Testes delimitados

```sh
node --test --test-isolation=none packages/ab-bill-context/tests/*.test.mjs packages/ab-upstream-review/tests/*.test.mjs
```

Os testes de integração adicionais exigem caminhos explícitos para fontes/schema/dependências de ensaio, descritos nos READMEs. Sem esses pré-requisitos eles não constituem evidência de execução. [VERIFICATION.md](docs/ab-brainmaster/VERIFICATION.md) registra resultados, comandos e limites.

## Engenharia e operação

- [Plano completo e roadmap por gates](docs/ab-brainmaster/MASTER_PLAN.md).
- [Continuação implementada P1–P5](docs/ab-brainmaster/PHASES_P1_P5.md).
- [Build e identidade do host AB](docs/ab-brainmaster/P1_HOST.md).
- [Contexto BBrainX e AB-S00S](docs/ab-brainmaster/CONTEXT_INTEGRATION.md).
- [Runtime e recuperação local](docs/ab-brainmaster/LOCAL_RUNTIME.md).
- [Servidor, API, Docker, appliance e rollback](docs/ab-brainmaster/SERVER_DISTRIBUTION.md).
- [Distribuição iOS e IPA](docs/ab-brainmaster/IOS_DISTRIBUTION.md).
- [Arquitetura real e fronteiras de confiança](docs/ab-brainmaster/ORCA_ARCHITECTURE.md).
- [Comparação pública e oportunidades](docs/ab-brainmaster/REFERENCE_COMPARISON.md).
- [Dez heurísticas aplicadas](docs/ab-brainmaster/UX_HEURISTICS.md).
- [Mapas e proveniência](docs/ab-brainmaster/maps/README.md).

Independência total exige autenticação, execução, inferência, conteúdo, atualização e observabilidade locais. Não está comprovada por um clone Git, por um CLI local que chama a nuvem ou por um healthcheck de proxy. O plano define o ensaio de tarefa real com saída de rede bloqueada.

## Licenças e identidade

O [LICENSE](LICENSE) original do Orca permanece preservado. Os avisos do Archify acompanham as especificações. A licença integral de Billion Context, incluindo atribuição adicional, está junto do módulo; não a resumir como MIT sem ressalva.

Esta branch usa identidade e perfil AB separados, sem o atualizador oficial do Orca. Assinatura, notarização e instalação em cada plataforma continuam exigindo evidências específicas; não são herdadas do upstream.
