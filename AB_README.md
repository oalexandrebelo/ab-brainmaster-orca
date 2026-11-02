# AB-BRAINMASTER-ORCA

Fork de desenvolvimento do [Orca](https://github.com/stablyai/orca), preservando seu núcleo e acrescentando módulos AB delimitados. Base auditada: `d616c1b9eac49b4f4e1c73a1eb5e802c67c332bb`. Branch de trabalho: `ab-brainmaster/main`. A branch `main` do fork preserva a cópia do upstream criada no GitHub.

## Entrega atual

| Item                   | Estado                                                                                                                        |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Auditoria arquitetural | 84 fontes e 33 conclusões rastreáveis; leitura estática, sem alegar auditoria de todas as linhas.                             |
| Inventário             | 42.727 caminhos do commit base; resumo em `docs/ab-brainmaster/REPOSITORY_COVERAGE.md`.                                       |
| Mapas Archify          | Cinco especificações e recibo resumido; HTMLs interativos e evidências completas entregues como artefatos separados.          |
| Revisão upstream       | CLI funcional e fonte de painel/worker Orca; consulta GET explícita, sem aplicação automática.                                |
| Billion Context        | Candidato opcional para novos terminais Claude em **workspaces de pasta locais**; toggle inicial OFF e proxy próprio.         |
| BBrainX / AB-S00S      | Contratos inspecionados; registro e execução integrada ainda precisam de homologação. Fontes privadas não são redistribuídas. |
| Distribuição AB        | Build, identidade final, assinatura, instaladores, Docker e appliance ainda têm gates no plano.                               |

## Executar a revisão do upstream

Node 22+; ensaiado em Node 24.22.1:

```sh
node packages/ab-upstream-review/cli.mjs review
```

O JSON distingue enumeração completa, resultado parcial, offline, timeout e limitação. A classificação orienta revisão humana; não aprova código nem aplica atualizações. Consulte [o README do módulo](packages/ab-upstream-review/README.md) para limites e ambiente com proxy.

## Contexto opcional

[Documentação e código](packages/ab-bill-context/README.md). O pacote `billion-context` não é instalado automaticamente. O operador informa o entrypoint de uma versão compatível previamente obtida e aprovada. A preparação valida caminhos, workspace, versão e fingerprints. O lançamento cria a configuração privada e verifica PID, healthcheck e watchdog do proxy.

A opção de forjar aprovação é desabilitada. O proxy usa loopback, ownership e estado próprios; desligar o toggle não interrompe sessões ativas. A integração não declara suporte a worktrees Git, OAuth, Windows, SSH/WSL, sessões retomadas ou native chat. Esses caminhos precisam de contratos e ensaios específicos.

## Gate real de plugins

O checkout base declara versão `1.4.214`. O painel de revisão exige `>=1.4.246`; o plugin de contexto exige `>=1.4.248`. Os schemas reais aceitam os manifestos e recusam o host declarado inferior. Isso é uma incompatibilidade a resolver no processo de build/homologação, não uma instrução para reduzir artificialmente os requisitos.

Os plugins não foram instalados num desktop Orca construído nesta entrega. Workers são processos Node com acesso ao host; sua instalação é uma decisão de confiança. A CLI de revisão funciona independentemente do gate do painel.

## Testes delimitados

```sh
node --test --test-isolation=none packages/ab-bill-context/tests/*.test.mjs packages/ab-upstream-review/tests/*.test.mjs
```

Os testes de integração adicionais exigem caminhos explícitos para fontes/schema/dependências de ensaio, descritos nos READMEs. Sem esses pré-requisitos eles não constituem evidência de execução. [VERIFICATION.md](docs/ab-brainmaster/VERIFICATION.md) registra resultados, comandos e limites.

## Engenharia e operação

- [Plano completo e roadmap por gates](docs/ab-brainmaster/MASTER_PLAN.md).
- [Arquitetura real e fronteiras de confiança](docs/ab-brainmaster/ORCA_ARCHITECTURE.md).
- [Comparação pública e oportunidades](docs/ab-brainmaster/REFERENCE_COMPARISON.md).
- [Dez heurísticas aplicadas](docs/ab-brainmaster/UX_HEURISTICS.md).
- [Mapas e proveniência](docs/ab-brainmaster/maps/README.md).

Independência total exige autenticação, execução, inferência, conteúdo, atualização e observabilidade locais. Não está comprovada por um clone Git, por um CLI local que chama a nuvem ou por um healthcheck de proxy. O plano define o ensaio de tarefa real com saída de rede bloqueada.

## Licenças e identidade

O [LICENSE](LICENSE) original do Orca permanece preservado. Os avisos do Archify acompanham as especificações. A licença integral de Billion Context, incluindo atribuição adicional, está junto do módulo; não a resumir como MIT sem ressalva.

Esta branch não substitui o canal oficial de atualizações do Orca. Identidade do aplicativo, perfil de dados, feed de atualização e assinatura AB devem ser separados antes de distribuir binários.
