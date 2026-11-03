/**
 * @file version.ts
 * @description `tritium_cli --version`: this command's version and the app's.
 *
 * The version is not built into the bundle: the npm release is published only
 * when the bundle's bytes change (local-api-server.md, npm distribution), and
 * a version inside would change them every release. Installed from npm, the
 * package.json beside dist/ says it; shipped inside the app, there is none,
 * and the command is the app's own.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CONSOLE_PROTOCOL } from '@cuemol/console-kit'
import type { ConsoleInfoResponse } from '@cuemol/console-kit'

const PACKAGE_NAME = '@cuemol/tritium-cli'

/** The npm package's version, or null when this copy came with the app. */
export function packageVersion(moduleUrl: string = import.meta.url): string | null {
  try {
    const file = path.join(path.dirname(fileURLToPath(moduleUrl)), '..', 'package.json')
    const pkg = JSON.parse(fs.readFileSync(file, 'utf8')) as { name?: string; version?: string }
    return pkg.name === PACKAGE_NAME && typeof pkg.version === 'string' ? pkg.version : null
  } catch {
    return null
  }
}

/** The lines `--version` prints. */
export function versionLines(pkgVersion: string | null, app: ConsoleInfoResponse | null): string[] {
  const cli = pkgVersion
    ? `tritium_cli ${pkgVersion} (protocol ${CONSOLE_PROTOCOL})`
    : `tritium_cli (bundled with CueMol3, protocol ${CONSOLE_PROTOCOL})`
  const appLine = app
    ? `CueMol3 ${app.version}${app.build ? ` (build ${app.build})` : ''}, protocol ${app.protocol ?? 'unknown'}`
    : 'CueMol3 is not running (or command line access is off)'
  return [cli, appLine]
}
