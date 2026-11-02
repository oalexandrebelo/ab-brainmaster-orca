# AB-BRAINMASTER · revisão de upstream

Módulo funcional sem dependências de runtime: CLI Node e painel Orca com o botão **Revisar atualizações do Orca**. Ambos executam a mesma triagem de metadados de `stablyai/orca`, somente após ação explícita.

## Uso imediato pela CLI

Requer Node 22+; validado em Node 24.22.1. A partir da raiz do fork:

```sh
node packages/ab-upstream-review/cli.mjs review
node --test --test-isolation=none packages/ab-upstream-review/tests/*.test.mjs
```

O comando emite JSON no stdout. Código de saída `0` significa **enumeração completa dos metadados dentro dos limites**. Código `2` significa consulta parcial, indisponível, truncada, cancelada ou com erro. Isso não é aprovação de uma atualização. Sem `review`, a CLI apenas explica o uso e não acessa a rede.

Em um ambiente que exige proxy e já usa Node 24 com suporte ao sinalizador:

```sh
node --use-env-proxy packages/ab-upstream-review/cli.mjs review
```

O programa não lê tokens, não imprime variáveis de ambiente e não usa uma chave GitHub. O proxy é configuração do runtime e da organização. Não habilitamos isso automaticamente nem registramos endereços ou credenciais do proxy.

## Compatibilidade e habilitação do painel

O manifesto exige `engines.orca >=1.4.246`, perfil `trusted-worker`, sem capabilities de host e sem hooks. Os campos reservados `skills`, `mcpServers`, `taskSources`, `connections`, `sidebarCards` e `agentHarnesses` ficam vazios.

**Gate aberto:** o `package.json` no checkout-base declara **1.4.214**, inferior à versão mínima do manifesto. Portanto o painel não foi habilitado nem homologado nesse build. Não alterar artificialmente a versão do app nem reduzir o engine do plugin. O responsável pelo build deve comprovar a versão executável compatível; então validar, inspecionar acesso, aprovar conscientemente o worker e executar `plugin test/check` conforme `skill-guides/orca-plugin-authoring.md`. O worker tem acesso real ao host por ser código Node; ausência de capabilities adicionais não o transforma em sandbox. A CLI independe desse gate.

Contrato real: o painel chama `orca.host.call('plugin.request', { name: 'upstream.review', input: { confirmed: true }, timeoutMs: 30000 }, { signal })` e recebe `{ output }`. O worker registra `orca.panels.handle`. O campo `data` não pertence ao schema desse método. Fontes: `src/shared/plugins/workers/plugin-host-api-panel-methods.ts` e `skill-guides/orca-plugin-authoring/references/host-api.md`.

O teste opcional `tests/orca-schema.integration.mjs` importa o parser TypeScript e Zod reais do Orca; requer Node com `registerHooks`, `AB_ORCA_TEST_SOURCE` apontando para esse checkout e `AB_ORCA_TEST_ZOD` apontando para `zod/index.js` instalado no ambiente de validação. Sem ambas as variáveis o teste é explicitamente ignorado. Ele não substitui execução do painel num build compatível.

## O que é comparado

1. Base fixa: `d616c1b9eac49b4f4e1c73a1eb5e802c67c332bb`.
2. Um GET de `https://api.github.com/repos/stablyai/orca/git/ref/heads/main` resolve o alvo.
3. Os GETs seguintes usam os dois SHAs imutáveis em `/compare/BASE...TARGET?per_page=100&page=N`. Mudança de `main` durante a consulta não muda o alvo.
4. O relatório contém commits, caminhos e estatísticas dos arquivos recebidos, ancestralidade, áreas de atenção e condições de completude. O SHA fixo da comparação aparece na interface.

Só são usados GETs nesses endpoints, sem redirects. Nenhuma URL, repositório, branch, token ou comando remoto pode ser informado ao worker. Não há pull, merge, checkout, instalação, escrita no repositório, execução de patch ou execução de conteúdo retornado. Nenhum prompt ou dado do workspace é enviado. Este módulo é específico para o upstream GitHub `stablyai/orca`; não substitui o suporte GitLab/genérico do núcleo.

## Limites e estados

| Proteção      | Limite / comportamento                                                                                                                    |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Tempo         | 6 s por GET; 24 s pela revisão; bridge 30 s                                                                                               |
| Paginação     | 5 páginas de 100 commits, mais o GET da referência: até 6 pedidos                                                                         |
| Resposta      | 4 MiB por resposta descomprimida; 12 MiB somados; leitura por stream                                                                      |
| Arquivos      | Até 300 fornecidos na primeira página; atingir 300 marca incompleto, pois a API pode omitir os demais                                     |
| Saída         | Até 900 KiB, abaixo do teto de 1 MiB da bridge; acima disso listas são removidas com aviso explícito                                      |
| Cache         | Memória do processo/worker, 15 min, até 6 entradas e 2 MiB; só conteúdo validado e ETag com formato permitido                             |
| Revalidação   | Mesmo com cache sempre há GET condicional. `304` exige entrada válida; falha de rede nunca vira sucesso com dados antigos                 |
| Limite GitHub | `429` ou `403` com indicação de rate limit gera `rate-limited`; cooldown respeita retry/reset válido ou 60 s; sem retry automático        |
| Estados       | `complete`, `partial`, `offline`, `rate-limited`, `timeout`, `cancelled`, `size-limit`, `invalid-response`, `access-denied`, `http-error` |

Uma consulta por worker de cada vez; cliques duplicados são bloqueados. Abertura do painel e ativação do worker não fazem consultas. Cancelar propaga `AbortSignal`. Reiniciar o worker elimina cache e cooldown locais; eventual rate limit continua sendo imposto pelo GitHub. A CLI usa cache efêmero apenas durante sua invocação; o benefício de ETag aparece em consultas repetidas no mesmo worker.

A API de comparação não garante listar mais de 300 arquivos e só traz esses arquivos na primeira página. Completude dos commits depende de contagens, páginas consistentes, ausência de duplicação e confirmação do SHA final. Atingir limites, faltar página ou divergir ancestralidade não produz revisão completa. [Contrato GitHub](https://docs.github.com/en/rest/commits/commits#compare-two-commits).

## Riscos e interpretação

As regras sinalizam **autenticação/credenciais, schema/persistência, runtime nativo, APIs de plugins, dependências/lockfiles, licenças e possível sobreposição AB**. Conferem o nome atual e o anterior de arquivos renomeados. São heurísticas de caminho; zero correspondências não prova ausência de risco. Sobreposição AB é potencial, pois o módulo não lê o diff local. Antes de incorporar atualizações, revisar patches e confrontar a lista com a superfície AB real.

Dados recebidos são exibidos apenas com `textContent`. Não há `innerHTML`, Markdown remoto, scripts remotos nem links vindos da API. Os URLs exibidos são construídos localmente com SHAs validados. Commits exibem primeira linha de até 200 caracteres, com truncamento indicado. A interface mantém ação primária única, cancelamento, status acessível, erros persistentes e detalhes recolhíveis; usa tokens `--orca-*`. Validação visual, teclado e leitor de tela no Orca ainda dependem do gate do build.

## Evidência desta entrega

- 12 testes unitários e adversariais: clique explícito, bridge real, dados hostis, cache/304, expiração, rate limit, cancelamento, tempo limite, bytes, contagens, páginas, ancestralidade e nomes renomeados.
- 1 teste adicional passou com o schema TypeScript real e Zod 4.6.7: manifesto válido, engine recusando 1.4.214 e aceitando 1.4.246. Total desta validação: 13 testes aprovados, sem skips.
- `node_modules/.bin/oxlint packages/ab-upstream-review` e `node_modules/.bin/oxfmt --check packages/ab-upstream-review` passaram após a adequação às regras do upstream. As verificações de caracteres de controle usam códigos numéricos, com casos adversariais de regressão.
- Consulta real em **2026-11-02T17:46:56.857Z**, com Node 24 e proxy: alvo `509461af4f25cd1b65d9c153b62ae299fb1bda65`, 1 commit, 56 arquivos, 2 GETs, 391.552 bytes, 888 ms. Esse é um registro pontual da coleta, não benchmark nem garantia de que `main` permaneceu nesse SHA.
- Uma primeira execução sem configuração do proxy retornou `offline` corretamente, sem apresentar dados antigos como sucesso.
- Evidência completa da consulta e fontes no relatório `brainmaster-research/upstream-evidence.json` mantido junto aos documentos do projeto.

## Licença

MIT. Preservar o `LICENSE` e a atribuição do Orca/Lovecast. O módulo não incorpora código de DeepGEMM, llama.cpp, vLLM, SGLang, Qdrant, ClickHouse ou modelos. Licenças desses projetos e dos pesos continuam independentes e devem ser verificadas na revisão de cada adoção.
