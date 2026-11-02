# Mapas Archify

Cinco visões complementares foram geradas com **Archify 3.2.0**, revisão `a4065941f12be7967436261d9934784e381d423c`. O mapa do alvo AB é uma especificação; os quatro mapas Orca possuem fontes por componente no commit auditado.

| Especificação            | Escopo                                                            |
| ------------------------ | ----------------------------------------------------------------- |
| `MAPA_ORCA_PROJETO.json` | Clientes, runtime, execução, plugins, estado e relay opcional.    |
| `MAPA_ORCA_DESKTOP.json` | Renderer, preload, Electron, daemon, Git e SQLite.                |
| `MAPA_ORCA_REMOTO.json`  | Socket local, WebSocket, cliente web, runtime e orcad.            |
| `MAPA_ORCA_PLUGINS.json` | Pacote, consentimento, perfis, painel, worker e recursos do host. |
| `MAPA_AB_ALVO.json`      | Proposta AB e pontos de integração, com limites explícitos.       |

`validation-summary.json` registra cinco aprovações dos gates `validate`, `deliver`, `check` e `browser-check`, com zero diagnósticos. O Chromium de ensaio foi 134.0.6998.35. Não foi feita declaração de revisão perceptual manual: o recibo indica `visualReview: not-requested`.

Os HTMLs interativos, recibos completos e o inventário integral acompanham os artefatos entregues separadamente. Arquivos gerados de apresentação não são pré-requisito de compilação do produto. O JSON é a fonte de regeneração; não editar o HTML emitido para contornar gates.

## Regeneração

Obtenha a revisão do Archify indicada e siga seu `archify/SKILL.md`. Use também um checkout limpo de `stablyai/orca` no commit base, com origin correspondente à proveniência declarada. O fork AB tem outro origin; ele não deve substituir essa evidência por uma URL artificial. A partir do diretório pai de um checkout chamado `ab-brainmaster-orca`, um exemplo é:

```sh
node /caminho/archify/archify/bin/archify.mjs finalize architecture \
  ab-brainmaster-orca/docs/ab-brainmaster/maps/MAPA_ORCA_DESKTOP.json \
  ab-brainmaster-orca/docs/ab-brainmaster/maps/MAPA_ORCA_DESKTOP.html \
  --repo-root /caminho/orca-upstream-audit --quality showcase \
  --out-dir ab-brainmaster-orca/docs/ab-brainmaster/maps/evidence/regenerated-desktop --json
```

Defina `ARCHIFY_CHROME` para um navegador suportado quando necessário. Para `MAPA_AB_ALVO`, omita `--repo-root`: ele é uma proposta e não deve fingir proveniência de implementação. Se alterar a especificação, use um diretório novo de evidências e execute novamente todos os gates.

A interface dos mapas usa o catálogo português de exemplo do Archify, com 25 chaves completadas nesta entrega. Os avisos e as licenças do gerador ficam em `licenses/`.
