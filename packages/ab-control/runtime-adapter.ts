import { RuntimeClient } from '../../src/cli/runtime/client'
import { readPrivateFile } from './credentials.mjs'

export function createRuntimeClient(options: {
  profile: string
  pairingFile?: string
  timeoutMs: number
}) {
  return new RuntimeClient(
    options.profile,
    options.timeoutMs,
    options.pairingFile ? readPrivateFile(options.pairingFile) : null,
    null
  )
}

export { RuntimeClient }
