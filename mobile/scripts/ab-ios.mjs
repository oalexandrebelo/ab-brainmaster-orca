#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { parseArgs } from 'node:util'
import { collectPreflight, mobileRoot } from './ab-ios-preflight.mjs'
import { exportOptionsPlist } from './ab-ios-signing.mjs'
import { inspectApp, verifyIpa } from './ab-ios-verify.mjs'
import { resolveAbIosIdentity } from '../config/ab-ios-identity.cjs'
import { installIosNoticePhase } from './ab-ios-notice-phase.mjs'

const HELP = `AB BRAINMASTER ORCA iOS
  node scripts/ab-ios.mjs config
  node scripts/ab-ios.mjs preflight [--unsigned] [--method ad-hoc|development|app-store]
  node scripts/ab-ios.mjs build [--unsigned] [--method ad-hoc|development|app-store] [--output directory]
  node scripts/ab-ios.mjs verify --ipa file.ipa [--method ad-hoc|development|app-store]
  node scripts/ab-ios.mjs install --ipa file.ipa [--method ad-hoc|development]

AB_IOS_PROFILE: existing .mobileprovision path
AB_IOS_DEVICE_UDID: intended physical iPhone UDID, required for device distributions
AB_IOS_BUNDLE_ID, AB_IOS_VERSION, AB_IOS_BUILD_NUMBER: optional AB identity overrides
AB_IOS_APS_ENVIRONMENT: disabled (default), development, or production
AB_IOS_PNPM_BIN: optional path to the pinned pnpm executable
APPLE_TEAM_ID, AB_IOS_SIGNING_IDENTITY: optional constraints on the supplied signing assets
Build exports locally. It never uploads, purchases, logs into Apple, or provisions accounts.
--unsigned produces an explicitly unsigned .xcarchive, never an IPA.`

async function run(command, args, { cwd = mobileRoot, logPath } = {}) {
  console.log(`[ab-ios] ${path.basename(command)} ${args[0] ?? ''}`)
  const log = logPath ? fs.openSync(logPath, 'w', 0o600) : null
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd,
        env: { ...process.env, AB_IOS_VARIANT: 'brainmaster', CI: '1', EXPO_NO_TELEMETRY: '1' },
        stdio: log === null ? 'inherit' : ['ignore', log, log]
      })
      child.once('error', reject)
      child.once('exit', (code, signal) =>
        code === 0
          ? resolve()
          : reject(
              new Error(
                `${path.basename(command)} failed (${signal ?? code}).${logPath ? ` See ${logPath}` : ''}`
              )
            )
      )
    })
  } finally {
    if (log !== null) {
      fs.closeSync(log)
    }
  }
}

function json(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
}

async function build(values) {
  const { report, signing } = collectPreflight(values)
  if (report.blockers.length) {
    throw new Error(report.blockers.join('\n'))
  }
  const output = path.resolve(
    mobileRoot,
    values.output || `build/ab-ios/${new Date().toISOString().replaceAll(':', '-')}`
  )
  if (
    output === path.join(mobileRoot, 'ios') ||
    output.startsWith(path.join(mobileRoot, 'ios') + path.sep)
  ) {
    throw new Error('The output directory cannot be inside the generated ios/ project.')
  }
  if (fs.existsSync(output)) {
    throw new Error(
      'Choose a new output directory; an existing build must not be mistaken for this run.'
    )
  }
  fs.mkdirSync(output, { recursive: true, mode: 0o700 })
  json(path.join(output, 'preflight.json'), report)
  const native = path.join(mobileRoot, 'ios')
  if (fs.existsSync(native)) {
    fs.renameSync(native, path.join(output, 'previous-ios'))
  }
  await run(process.execPath, [
    path.join(mobileRoot, 'node_modules/expo/bin/cli'),
    'prebuild',
    '--platform',
    'ios',
    '--no-install'
  ])
  await run('bundle', ['exec', 'pod', 'install'], {
    cwd: native,
    logPath: path.join(output, 'pods.log')
  })
  json(path.join(output, 'notice-phase.json'), installIosNoticePhase(mobileRoot))
  const noticeReceiptPath = path.join(output, 'ios-notice-receipt.json')
  const workspaces = fs.readdirSync(native).filter((entry) => entry.endsWith('.xcworkspace'))
  if (workspaces.length !== 1) {
    throw new Error('Expected a single generated iOS workspace.')
  }
  const workspace = path.join(native, workspaces[0])
  const listed = spawnSync('xcodebuild', ['-list', '-json', '-workspace', workspace], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024
  })
  if (listed.error || listed.status !== 0) {
    throw new Error('Could not list the generated Xcode schemes.')
  }
  const schemes = JSON.parse(listed.stdout).workspace?.schemes ?? []
  const scheme = path.basename(workspace, '.xcworkspace')
  if (!schemes.includes(scheme)) {
    throw new Error(`The generated application scheme ${scheme} was not found.`)
  }
  const archive = path.join(
    output,
    values.unsigned ? 'AB-BRAINMASTER-ORCA-UNSIGNED.xcarchive' : 'AB-BRAINMASTER-ORCA.xcarchive'
  )
  const signingArgs = values.unsigned
    ? ['CODE_SIGNING_ALLOWED=NO', 'CODE_SIGNING_REQUIRED=NO', 'CODE_SIGN_IDENTITY=']
    : [
        `DEVELOPMENT_TEAM=${signing.teamId}`,
        'CODE_SIGN_STYLE=Manual',
        `CODE_SIGN_IDENTITY=${signing.identityHash}`,
        `PROVISIONING_PROFILE_SPECIFIER=${signing.profileUuid}`
      ]
  if (!values.unsigned) {
    const profiles = path.join(
      os.homedir(),
      'Library/Developer/Xcode/UserData/Provisioning Profiles'
    )
    fs.mkdirSync(profiles, { recursive: true })
    const installed = path.join(profiles, `${signing.profileUuid}.mobileprovision`)
    if (path.resolve(signing.profilePath) !== path.resolve(installed)) {
      fs.copyFileSync(signing.profilePath, installed)
    }
  }
  await run(
    'xcodebuild',
    [
      '-workspace',
      workspace,
      '-scheme',
      scheme,
      '-configuration',
      'Release',
      '-destination',
      'generic/platform=iOS',
      '-sdk',
      'iphoneos',
      '-archivePath',
      archive,
      '-derivedDataPath',
      path.join(output, 'DerivedData'),
      `AB_IOS_NOTICE_RECEIPT=${noticeReceiptPath}`,
      ...signingArgs,
      'archive'
    ],
    { logPath: path.join(output, 'archive.log') }
  )
  const apps = path.join(archive, 'Products/Applications')
  const appNames = fs.readdirSync(apps).filter((name) => name.endsWith('.app'))
  if (appNames.length !== 1) {
    throw new Error('The archive must contain one application.')
  }
  const noticeReceipt = JSON.parse(fs.readFileSync(noticeReceiptPath, 'utf8'))
  if (!/^[a-f0-9]{64}$/.test(noticeReceipt.manifestSha256 ?? '')) {
    throw new Error('The iOS notice build phase did not produce a valid manifest receipt.')
  }
  const built = inspectApp(path.join(apps, appNames[0]), report.identity, {
    expectedNoticeManifestSha256: noticeReceipt.manifestSha256
  })
  if (values.unsigned) {
    const evidence = {
      ...built,
      signed: false,
      installableIpa: false,
      archive,
      installedOnDevice: false
    }
    json(path.join(output, 'build-evidence.json'), evidence)
    console.log(JSON.stringify(evidence, null, 2))
    return
  }
  const exportOptions = path.join(output, 'ExportOptions.plist')
  fs.writeFileSync(
    exportOptions,
    exportOptionsPlist({ ...report.identity, ...signing, method: values.method }),
    { mode: 0o600 }
  )
  const exported = path.join(output, 'export')
  await run(
    'xcodebuild',
    [
      '-exportArchive',
      '-archivePath',
      archive,
      '-exportPath',
      exported,
      '-exportOptionsPlist',
      exportOptions
    ],
    { logPath: path.join(output, 'export.log') }
  )
  const ipas = fs.readdirSync(exported).filter((entry) => entry.endsWith('.ipa'))
  if (ipas.length !== 1) {
    throw new Error('Xcode did not export exactly one IPA.')
  }
  const ipa = path.join(exported, ipas[0])
  const evidence = verifyIpa(ipa, {
    identity: report.identity,
    method: values.method,
    deviceUdid: process.env.AB_IOS_DEVICE_UDID,
    teamId: signing.teamId,
    expectedNoticeManifestSha256: noticeReceipt.manifestSha256
  })
  json(path.join(output, 'build-evidence.json'), { ...evidence, ipa })
  console.log(JSON.stringify({ ...evidence, ipa }, null, 2))
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      unsigned: { type: 'boolean', default: false },
      method: { type: 'string', default: 'ad-hoc' },
      output: { type: 'string' },
      ipa: { type: 'string' },
      help: { type: 'boolean' }
    }
  })
  const [command] = positionals
  if (values.help || !command) {
    return console.log(HELP)
  }
  if (command === 'config') {
    return console.log(JSON.stringify(resolveAbIosIdentity(), null, 2))
  }
  if (command === 'preflight') {
    const { report } = collectPreflight(values)
    console.log(JSON.stringify(report, null, 2))
    process.exitCode = report.blockers.length ? 2 : 0
    return
  }
  if (command === 'build') {
    return build(values)
  }
  if (command === 'verify' || command === 'install') {
    if (!values.ipa) {
      throw new Error('--ipa is required.')
    }
    const evidence = verifyIpa(values.ipa, {
      identity: resolveAbIosIdentity(),
      method: values.method,
      deviceUdid: process.env.AB_IOS_DEVICE_UDID,
      teamId: process.env.APPLE_TEAM_ID
    })
    if (command === 'verify') {
      return console.log(JSON.stringify(evidence, null, 2))
    }
    if (values.method === 'app-store') {
      throw new Error('An App Store export is installed through Apple distribution, not devicectl.')
    }
    if (!process.env.AB_IOS_DEVICE_UDID) {
      throw new Error('AB_IOS_DEVICE_UDID is required for installation.')
    }
    const extracted = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-ios-install-'))
    try {
      await run('ditto', ['-x', '-k', path.resolve(values.ipa), extracted])
      const payload = path.join(extracted, 'Payload')
      const app = fs.readdirSync(payload).find((entry) => entry.endsWith('.app'))
      await run('xcrun', [
        'devicectl',
        'device',
        'install',
        'app',
        '--device',
        process.env.AB_IOS_DEVICE_UDID,
        path.join(payload, app)
      ])
      console.log(
        JSON.stringify({ ...evidence, installedOnDevice: true, launchedOnDevice: false }, null, 2)
      )
    } finally {
      fs.rmSync(extracted, { recursive: true, force: true })
    }
    return
  }
  throw new Error(`Unknown command: ${command}\n${HELP}`)
}

main().catch((error) => {
  console.error(`[ab-ios] ${error.message}`)
  process.exitCode = 1
})
