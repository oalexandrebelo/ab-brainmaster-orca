import { spawnProcess } from '@orca/process-host'
import {
  forceTerminateProcessTree,
  signalProcessTree
} from '@orca/process-host/process-tree-termination'
import { ReadBuffer, serializeMessage } from '@modelcontextprotocol/sdk/shared/stdio.js'
import { LIMITS } from './contracts.mjs'
import { ContextBridgeError, requireCondition } from './errors.mjs'

export class OrcaStdioTransport {
  constructor(spec) {
    this.spec = spec
    this.buffer = new ReadBuffer({ maxBufferSize: LIMITS.messageBytes })
    this.started = false
    this.closing = null
  }

  async start() {
    requireCondition(!this.started, 'CONNECTION_STATE', 'This transport was already started.')
    this.started = true
    this.child = spawnProcess({
      ...this.spec,
      detached: process.platform !== 'win32',
      stdio: 'pipe'
    })
    const child = this.child
    const streamError = () => {
      this.onerror?.(
        new ContextBridgeError('CONNECTION_UNAVAILABLE', 'The MCP process stream failed.')
      )
      void this.close()
    }
    child.stdin.on('error', streamError)
    child.stdout.on('error', streamError)
    child.stderr.on('error', streamError)
    child.stderr.resume()
    child.stdout.on('data', (chunk) => {
      try {
        this.buffer.append(chunk)
        let message
        while ((message = this.buffer.readMessage()) !== null) {
          this.onmessage?.(message)
        }
      } catch {
        this.onerror?.(
          new ContextBridgeError(
            'MALFORMED_RESPONSE',
            'The MCP stream exceeded its limit or contained invalid JSON-RPC.'
          )
        )
        void this.close()
      }
    })
    child.once('close', () => {
      this.buffer.clear()
      this.onclose?.()
    })
    await new Promise((resolve, reject) => {
      child.once('spawn', resolve)
      child.on('error', () => {
        const error = new ContextBridgeError(
          'CONNECTION_UNAVAILABLE',
          'The configured MCP process could not start.'
        )
        reject(error)
        this.onerror?.(error)
      })
    })
  }

  async send(message) {
    requireCondition(
      this.child && !this.closing,
      'CONNECTION_UNAVAILABLE',
      'The MCP process is not connected.'
    )
    const wire = serializeMessage(message)
    requireCondition(
      Buffer.byteLength(wire) <= LIMITS.messageBytes,
      'REQUEST_TOO_LARGE',
      'The MCP request exceeds the byte limit.'
    )
    await new Promise((resolve, reject) =>
      this.child.stdin.write(wire, (error) =>
        error
          ? reject(
              new ContextBridgeError(
                'CONNECTION_UNAVAILABLE',
                'The MCP request could not be written.'
              )
            )
          : resolve()
      )
    )
  }

  async close() {
    if (this.closing) {
      return this.closing
    }
    this.closing = (async () => {
      const child = this.child
      if (!child) {
        return
      }
      child.stdin.end()
      const exited = () => child.exitCode !== null || child.signalCode !== null
      const wait = () =>
        new Promise((resolve) => {
          if (exited()) {
            resolve()
            return
          }
          const finish = () => {
            clearTimeout(timer)
            child.off('close', finish)
            resolve()
          }
          const timer = setTimeout(finish, 1000)
          child.once('close', finish)
        })
      await wait()
      if (!exited()) {
        await signalProcessTree(child)
        await wait()
      }
      if (!exited()) {
        await forceTerminateProcessTree(child)
        await wait()
      }
      this.buffer.clear()
    })()
    return this.closing
  }
}
