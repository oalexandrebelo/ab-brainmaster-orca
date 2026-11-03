import fs from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { IOSConfig } = require('expo/config-plugins')
export const NOTICE_PHASE = 'AB Include Third Party Notices'
const BUNDLE_PHASE = 'Bundle React Native code and images'
const SOURCE_MAP_MARKER = '# ab-ios: archive source map for notices'
const sourceMapSetup = `${SOURCE_MAP_MARKER}
export SOURCEMAP_FILE="$DERIVED_FILE_DIR/ab-ios-main.jsbundle.map"
rm -f "$SOURCEMAP_FILE"
`
const noticeScript = `set -eu
if [ -f "$PODS_ROOT/../.xcode.env" ]; then . "$PODS_ROOT/../.xcode.env"; fi
if [ -f "$PODS_ROOT/../.xcode.env.local" ]; then . "$PODS_ROOT/../.xcode.env.local"; fi
: "\${NODE_BINARY:?NODE_BINARY is required for iOS notices}"
"$NODE_BINARY" "$PROJECT_DIR/../scripts/ab-ios-notices.mjs" from-xcode
`

export function configureIosNoticePhase(project) {
  const targets = Object.entries(project.hash.project.objects.PBXNativeTarget ?? {}).filter(
    ([, target]) =>
      typeof target === 'object' && target.productType === '"com.apple.product-type.application"'
  )
  if (targets.length !== 1) {
    throw new Error('iOS notices require exactly one application target.')
  }
  const [targetId, target] = targets[0]
  const phases = project.hash.project.objects.PBXShellScriptBuildPhase ?? {}
  const bundleRef = target.buildPhases.find(
    (phase) => phases[phase.value]?.name === JSON.stringify(BUNDLE_PHASE)
  )
  if (!bundleRef) {
    throw new Error('The application has no React Native bundle phase.')
  }
  const bundle = phases[bundleRef.value]
  const script = JSON.parse(bundle.shellScript)
  if (!script.includes(SOURCE_MAP_MARKER)) {
    bundle.shellScript = JSON.stringify(sourceMapSetup + script)
  }
  const existing = target.buildPhases.filter(
    (phase) => phases[phase.value]?.name === JSON.stringify(NOTICE_PHASE)
  )
  if (existing.length > 1) {
    throw new Error('The Xcode target has duplicate iOS notice phases.')
  }
  let phaseId = existing[0]?.value
  if (!phaseId) {
    phaseId = project.addBuildPhase([], 'PBXShellScriptBuildPhase', NOTICE_PHASE, targetId, {
      shellPath: '/bin/sh',
      shellScript: ''
    }).uuid
  }
  Object.assign(phases[phaseId], {
    shellScript: JSON.stringify(noticeScript),
    alwaysOutOfDate: 1,
    showEnvVarsInLog: 0,
    inputPaths: [
      '"$(CONFIGURATION_BUILD_DIR)/$(UNLOCALIZED_RESOURCES_FOLDER_PATH)/main.jsbundle"',
      '"$(DERIVED_FILE_DIR)/ab-ios-main.jsbundle.map"'
    ],
    outputPaths: [
      '"$(TARGET_BUILD_DIR)/$(UNLOCALIZED_RESOURCES_FOLDER_PATH)/ABThirdPartyNotices/manifest.json"'
    ]
  })
  target.buildPhases = target.buildPhases.filter((phase) => phase.value !== phaseId)
  target.buildPhases.push({ value: phaseId, comment: NOTICE_PHASE })
  return {
    bundlePhase: BUNDLE_PHASE,
    noticePhase: NOTICE_PHASE,
    order: target.buildPhases.map((phase) => phase.comment)
  }
}

export function installIosNoticePhase(projectRoot) {
  const project = IOSConfig.XcodeUtils.getPbxproj(projectRoot)
  const evidence = configureIosNoticePhase(project)
  fs.writeFileSync(project.filepath, project.writeSync())
  return evidence
}
