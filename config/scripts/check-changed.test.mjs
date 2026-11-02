import { expect, it } from 'vitest'
import { parseArgs, runPool } from './check-changed.mjs'

it('accepts a task concurrency cap independently of test workers', () => {
  expect(parseArgs(['--concurrency=1', '--maxWorkers=2'])).toMatchObject({
    concurrency: 1,
    maxWorkers: '2'
  })
  expect(parseArgs([]).concurrency).toBeNull()
})

it.each(['0', '-1', '1.5', '65', 'NaN', ''])('rejects invalid concurrency %s', (value) => {
  expect(() => parseArgs([`--concurrency=${value}`])).toThrow(
    'Concurrency must be an integer from 1 to 64.'
  )
})

it.each([1, 2])(
  'runs every gate exactly once with at most %i active tasks',
  async (concurrency) => {
    const tasks = [0, 1, 2, 3, 4]
    const completed = []
    let active = 0
    let peak = 0
    const results = await runPool(tasks, concurrency, async (task) => {
      active += 1
      peak = Math.max(peak, active)
      await Promise.resolve()
      completed.push(task)
      active -= 1
      return task
    })
    expect(peak).toBe(concurrency)
    expect(active).toBe(0)
    expect(completed).toEqual(tasks)
    expect(results).toEqual(tasks)
  }
)
