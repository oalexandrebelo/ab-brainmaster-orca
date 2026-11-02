import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import test from 'node:test'
import { stopOwnedChild } from '../runtime.mjs'

test(
  'cleanup confirms exit even when its own child ignores SIGTERM',
  { timeout: 10000, skip: process.platform === 'win32' },
  async (t) => {
    const child = spawn(
      process.execPath,
      [
        '-e',
        'process.on("SIGTERM", () => {}); process.stdout.write("ready"); setInterval(() => {}, 1000)'
      ],
      { stdio: ['ignore', 'pipe', 'ignore'] }
    )
    t.after(() => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL')
      }
    })
    await once(child.stdout, 'data')
    await stopOwnedChild(child)
    assert.equal(child.signalCode, 'SIGKILL')
    assert.throws(() => process.kill(child.pid, 0), { code: 'ESRCH' })
    await stopOwnedChild(child)
  }
)
