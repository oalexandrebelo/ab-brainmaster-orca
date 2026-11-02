;(function () {
  'use strict'
  const reviewButton = document.getElementById('review')
  const cancelButton = document.getElementById('cancel')
  const status = document.getElementById('status')
  const result = document.getElementById('result')
  let controller = null

  function line(parent, text, className) {
    const element = document.createElement('p')
    element.textContent = text
    if (className) {
      element.className = className
    }
    parent.appendChild(element)
  }

  function list(title, values) {
    const detail = document.createElement('details')
    const summary = document.createElement('summary')
    summary.textContent = title
    detail.appendChild(summary)
    const items = document.createElement('ul')
    for (const value of values) {
      const item = document.createElement('li')
      item.textContent = value
      items.appendChild(item)
    }
    detail.appendChild(items)
    result.appendChild(detail)
  }

  function render(report) {
    result.replaceChildren()
    status.textContent =
      report.status === 'complete'
        ? report.commits.length === 0
          ? 'Nenhum commit novo nesta comparação.'
          : 'Metadados recebidos. A revisão de código continua pendente.'
        : 'Consulta incompleta. Não conclua que todas as mudanças foram revisadas.'
    line(result, `Consultado em ${report.checkedAt}`)
    line(result, `Base AB: ${report.baseSha}`, 'literal')
    if (report.targetSha) {
      line(result, `main resolvido: ${report.targetSha}`, 'literal')
    }
    if (report.error) {
      line(result, report.error.message)
      if (report.error.retryAfter) {
        line(result, `Nova tentativa após ${report.error.retryAfter}.`)
      }
    }
    for (const warning of report.warnings) {
      line(result, warning)
    }
    if (report.comparison) {
      line(
        result,
        `Commits recebidos: ${report.commits.length} de ${report.comparison.totalCommits}. Arquivos recebidos: ${report.files.length}${report.filesComplete ? '.' : ' (lista não comprovadamente completa).'}`
      )
      line(result, `Histórico: ${report.comparison.status}.`)
    }
    const risks = report.risks.filter((risk) => risk.count > 0)
    if (risks.length) {
      list(
        'Áreas que precisam de revisão',
        risks.map(
          (risk) =>
            `${risk.label}: ${risk.count} arquivo(s). Exemplos: ${risk.examples.join(', ')}${risk.examplesTruncated ? ' (exemplos limitados)' : ''}`
        )
      )
    } else if (report.comparison) {
      line(
        result,
        'Os caminhos recebidos não acionaram as regras de atenção. Isso não confirma ausência de riscos.'
      )
    }
    if (report.commits.length) {
      list(
        `Commits (${report.commits.length})`,
        report.commits.map(
          (commit) =>
            `${commit.sha.slice(0, 12)} · ${commit.subject}${commit.subjectTruncated ? ' [título truncado]' : ''}`
        )
      )
    }
    if (report.files.length) {
      list(
        `Arquivos (${report.files.length})`,
        report.files.map(
          (file) =>
            `${file.filename}${file.previousFilename ? ` ← ${file.previousFilename}` : ''} · ${file.status} · +${file.additions} −${file.deletions}`
        )
      )
    }
    if (report.compareUrl) {
      line(result, `Comparação fixada: ${report.compareUrl}`, 'literal')
    }
    for (const limitation of report.limitations) {
      line(result, limitation, 'muted')
    }
  }

  reviewButton.addEventListener('click', async () => {
    if (controller) {
      return
    }
    controller = new AbortController()
    reviewButton.disabled = true
    cancelButton.hidden = false
    result.replaceChildren()
    const loading = setTimeout(() => {
      status.textContent = 'Consultando main e as páginas de comparação no GitHub…'
    }, 200)
    try {
      const response = await orca.host.call(
        'plugin.request',
        { name: 'upstream.review', input: { confirmed: true }, timeoutMs: 30000 },
        { signal: controller.signal }
      )
      render(response.output)
    } catch (error) {
      status.textContent = controller.signal.aborted
        ? 'Consulta cancelada. Você pode tentar novamente.'
        : `Consulta indisponível: ${String(error.message || error.code || 'erro do host').slice(0, 500)}`
    } finally {
      clearTimeout(loading)
      controller = null
      reviewButton.disabled = false
      cancelButton.hidden = true
    }
  })

  cancelButton.addEventListener('click', () => controller?.abort())
})()
