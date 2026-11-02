export function evaluateAnswer(text) {
  let answer = null
  try {
    answer = JSON.parse(text.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, ''))
  } catch {}
  const evaluation = {
    publicMethods:
      Array.isArray(answer?.publicMethods) &&
      JSON.stringify([...answer.publicMethods].sort()) === JSON.stringify(['discover', 'retrieve']),
    staleError: answer?.staleError === 'INDEX_STALE',
    sourceCitation: typeof answer?.source === 'string' && answer.source.includes('bridge.mjs')
  }
  return {
    promptVersion: 'explicit-extraction-v2',
    checked: [
      'publicMethods equals discover/retrieve',
      'staleError equals INDEX_STALE',
      'answer cites bridge.mjs'
    ],
    extracted: answer,
    evaluation,
    passed: Object.values(evaluation).every(Boolean),
    gatesTransportProof: false,
    limitation:
      'One narrow repository question does not establish general model quality or full IDE capability.'
  }
}
