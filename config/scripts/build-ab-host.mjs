import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'

const require = createRequire(import.meta.url)
const root = resolve(import.meta.dirname, '../..')
const args = process.argv.slice(2)
if (args.some((arg) => arg !== '--pack') || args.length > 1) {
  throw new Error('Usage: node config/scripts/build-ab-host.mjs [--pack]')
}
if (args.includes('--pack') && process.platform !== 'linux') {
  throw new Error('AB packaging currently supports Linux directory builds only.')
}
const env = {
  ...process.env,
  ORCA_DISTRIBUTION: 'ab-brainmaster',
  ORCA_BACKGROUND_LAUNCH: '1',
  ORCA_BUILD_IDENTITY: '',
  ORCA_POSTHOG_WRITE_KEY: '',
  ORCA_DIAGNOSTICS_TOKEN_URL: ''
}

function run(script, scriptArgs = []) {
  const result = spawnSync(process.execPath, [script, ...scriptArgs], {
    cwd: root,
    env,
    stdio: 'inherit'
  })
  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

run('config/scripts/build-workspace-packages.mjs')
run('config/scripts/build-cli.mjs')
run('config/scripts/run-electron-vite-build.mjs')
if (args.includes('--pack')) {
  run('config/scripts/ensure-native-runtime.mjs', ['--runtime=electron'])
  const builder = join(dirname(require.resolve('electron-builder/package.json')), 'cli.js')
  run(builder, [
    '--config',
    'config/electron-builder.ab.config.cjs',
    '--linux',
    '--dir',
    '--publish',
    'never'
  ])
}
