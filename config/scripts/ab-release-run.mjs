#!/usr/bin/env node
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { currentRelease } from './ab-release-store.mjs'

const release = await currentRelease(process.env.AB_RELEASE_ROOT)
const { main } = await import(pathToFileURL(join(release.directory, 'ab-control/host.mjs')).href)
await main()
