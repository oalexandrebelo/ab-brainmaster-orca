import assert from 'node:assert/strict'
import net from 'node:net'
import { networkInterfaces } from 'node:os'

export async function verifyBlockedEgress() {
  assert.equal(
    process.platform,
    'linux',
    'This isolation proof is defined for the Linux container.'
  )
  const interfaces = Object.entries(networkInterfaces()).flatMap(([name, entries]) =>
    entries.map((entry) => ({ name, address: entry.address, internal: entry.internal }))
  )
  assert.ok(
    interfaces.length > 0 && interfaces.every((entry) => entry.internal),
    'The proof container must expose only loopback interfaces.'
  )
  const probe = await new Promise((resolve, reject) => {
    const startedAt = new Date().toISOString()
    const socket = net.createConnection({ host: '1.1.1.1', port: 443 })
    socket.setTimeout(1500)
    socket.once('connect', () => {
      socket.destroy()
      reject(new Error('External TCP egress succeeded; offline proof is invalid.'))
    })
    socket.once('timeout', () => {
      socket.destroy()
      resolve({ host: '1.1.1.1', port: 443, startedAt, blocked: true, outcome: 'timeout' })
    })
    socket.once('error', (error) =>
      resolve({ host: '1.1.1.1', port: 443, startedAt, blocked: true, outcome: error.code })
    )
  })
  return {
    mechanism: 'Docker --network none (container inspection recorded by workflow)',
    interfaces,
    probe
  }
}
