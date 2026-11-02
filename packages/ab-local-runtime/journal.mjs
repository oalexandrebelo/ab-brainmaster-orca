import { randomUUID } from 'node:crypto'
import { chmodSync, mkdirSync } from 'node:fs'
import { hostname } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { LocalRuntimeError, requireValue, sha256 } from './policy.mjs'

function processExists(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) {
    return true
  }
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code !== 'ESRCH'
  }
}

export function openJournal(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const filename = path.join(directory, 'local-runtime.sqlite')
  const db = new DatabaseSync(filename)
  if (process.platform !== 'win32') {
    chmodSync(filename, 0o600)
  }
  const token = randomUUID()
  let closed = false
  const readRecord = (row) => {
    if (!row) {
      return null
    }
    requireValue(
      sha256(row.record) === row.sha256,
      'STATE_CORRUPT',
      'Stored task integrity verification failed.'
    )
    return JSON.parse(row.record)
  }
  const writeRecord = (record) => {
    const json = JSON.stringify(record)
    requireValue(
      Buffer.byteLength(json) <= 4194304,
      'STATE_TOO_LARGE',
      'The complete task record exceeds 4 MiB.'
    )
    db.prepare('UPDATE tasks SET record = ?, sha256 = ?, status = ? WHERE id = ?').run(
      json,
      sha256(json),
      record.status,
      record.id
    )
  }
  try {
    db.exec('PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;')
    const version = db.prepare('PRAGMA user_version').get().user_version
    requireValue(
      version === 0 || version === 1,
      'STATE_VERSION_UNSUPPORTED',
      'This runtime cannot open this state schema.'
    )
    db.exec(`
      CREATE TABLE IF NOT EXISTS owner (slot INTEGER PRIMARY KEY CHECK (slot = 1), token TEXT NOT NULL, pid INTEGER NOT NULL, hostname TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, key_hash TEXT NOT NULL UNIQUE, request_hash TEXT NOT NULL, status TEXT NOT NULL, record TEXT NOT NULL, sha256 TEXT NOT NULL);
      PRAGMA user_version = 1;
      BEGIN IMMEDIATE;
    `)
    const owner = db.prepare('SELECT * FROM owner WHERE slot = 1').get()
    requireValue(
      !owner || (owner.hostname === hostname() && !processExists(owner.pid)),
      'STATE_BUSY',
      'State is owned by a live or unverifiable process. Use a separate local state directory.'
    )
    db.prepare('INSERT OR REPLACE INTO owner (slot, token, pid, hostname) VALUES (1, ?, ?, ?)').run(
      token,
      process.pid,
      hostname()
    )
    const recovered = []
    for (const row of db
      .prepare("SELECT * FROM tasks WHERE status IN ('preparing', 'running')")
      .all()) {
      const record = readRecord(row)
      record.status = 'interrupted'
      record.finishedAt = new Date().toISOString()
      record.error = {
        code: 'PROCESS_INTERRUPTED',
        message:
          'The previous process ended before a durable result. Provider completion is indeterminate; this key is not retried automatically.'
      }
      record.recovery = {
        observedAt: record.finishedAt,
        previousStatus: row.status,
        automaticRetry: false
      }
      writeRecord(record)
      recovered.push(record.id)
    }
    db.exec('COMMIT')
    return {
      recovered,
      get(id) {
        return readRecord(db.prepare('SELECT * FROM tasks WHERE id = ?').get(id))
      },
      byKey(keyHash) {
        const row = db.prepare('SELECT * FROM tasks WHERE key_hash = ?').get(keyHash)
        return row ? { requestHash: row.request_hash, record: readRecord(row) } : null
      },
      insert(record, keyHash, requestHash) {
        const json = JSON.stringify(record)
        db.prepare(
          'INSERT INTO tasks (id, key_hash, request_hash, status, record, sha256) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(record.id, keyHash, requestHash, record.status, json, sha256(json))
      },
      save: writeRecord,
      list({ limit = 100, offset = 0 } = {}) {
        requireValue(
          Number.isInteger(limit) &&
            limit >= 1 &&
            limit <= 100 &&
            Number.isInteger(offset) &&
            offset >= 0,
          'INVALID_ARGUMENT',
          'Use limit 1–100 and a nonnegative offset.'
        )
        return db
          .prepare('SELECT * FROM tasks ORDER BY rowid DESC LIMIT ? OFFSET ?')
          .all(limit, offset)
          .map((row) => {
            const record = readRecord(row)
            return {
              id: record.id,
              status: record.status,
              createdAt: record.createdAt,
              finishedAt: record.finishedAt ?? null
            }
          })
      },
      close() {
        if (closed) {
          return
        }
        db.prepare('DELETE FROM owner WHERE slot = 1 AND token = ?').run(token)
        db.close()
        closed = true
      }
    }
  } catch (error) {
    try {
      db.exec('ROLLBACK')
    } catch {}
    db.close()
    if (error instanceof LocalRuntimeError) {
      throw error
    }
    throw new LocalRuntimeError(
      'STATE_UNAVAILABLE',
      'Could not open or recover the local state database.'
    )
  }
}
