import { createReviewer } from './review.mjs'
import { ReviewError } from './github-contract.mjs'

export default function activate(orca) {
  const review = createReviewer()
  orca.panels.handle('upstream.review', async (input, context) => {
    if (
      !input ||
      typeof input !== 'object' ||
      Array.isArray(input) ||
      Object.keys(input).length !== 1 ||
      input.confirmed !== true
    ) {
      throw new ReviewError('invalid-input', 'Confirme a ação explícita de revisão.')
    }
    return review({ confirmed: true, signal: context.signal })
  })
}
