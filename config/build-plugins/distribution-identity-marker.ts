import type { Plugin } from 'vite'

export function createDistributionMarkerPlugin(identity: { id: string }): Plugin {
  return {
    name: 'orca-distribution-marker',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'distribution.json',
        source: JSON.stringify(identity)
      })
    }
  }
}

export function createDistributionTitlePlugin(identity: { productName: string }): Plugin {
  return {
    name: 'orca-distribution-title',
    transformIndexHtml(html) {
      return html.replace(/<title>Orca(?= |<\/title>)/u, `<title>${identity.productName}`)
    }
  }
}
