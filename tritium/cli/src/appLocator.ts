/**
 * @file appLocator.ts
 * @description Finding an installed CueMol3 when tritium_cli runs on its own
 * (installed from npm, run by the system Node) rather than through the
 * wrapper shipped inside the app, which knows its app already.
 *
 * Only the usual install places are looked at; CUEMOL3_APP names the app (or
 * its executable) anywhere else, e.g. an AppImage.
 */

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { execFileSync } from 'node:child_process'

/** Where to get CueMol3 when it is not installed. */
export const DOWNLOAD_URL = 'https://github.com/CueMol/cuemol2/releases/latest'

const PRODUCT = 'CueMol3'
const BUNDLE_ID = 'org.cuemol.cuemol3'

/** What the lookup reads from the system; replaced in tests. */
export interface LocatorEnv {
  platform: NodeJS.Platform
  env: NodeJS.ProcessEnv
  home: string
  isFile: (p: string) => boolean
  readText: (p: string) => string | null
  /** stdout of a command, or null when it fails or is missing. */
  run: (command: string, args: string[]) => string | null
}

function isFile(p: string): boolean {
  try {
    return fs.statSync(p).isFile()
  } catch {
    return false
  }
}

function readText(p: string): string | null {
  try {
    return fs.readFileSync(p, 'utf8')
  } catch {
    return null
  }
}

function run(command: string, args: string[]): string | null {
  try {
    return execFileSync(command, args, { encoding: 'utf8', timeout: 5000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] })
  } catch {
    return null
  }
}

const systemEnv = (): LocatorEnv => ({
  platform: process.platform,
  env: process.env,
  home: os.homedir(),
  isFile,
  readText,
  run,
})

/** The executable inside a macOS app bundle, when `p` is a bundle. */
function macExe(sys: LocatorEnv, p: string): string | null {
  const exe = path.join(p, 'Contents', 'MacOS', PRODUCT)
  return sys.isFile(exe) ? exe : null
}

function locateMac(sys: LocatorEnv): string | null {
  for (const b of [path.join('/Applications', `${PRODUCT}.app`), path.join(sys.home, 'Applications', `${PRODUCT}.app`)]) {
    const exe = macExe(sys, b)
    if (exe) return exe
  }
  // Spotlight finds a bundle moved anywhere else.
  const found = sys.run('mdfind', [`kMDItemCFBundleIdentifier == '${BUNDLE_ID}'`]) ?? ''
  for (const b of found.split('\n').filter((l) => l.endsWith('.app'))) {
    const exe = macExe(sys, b)
    if (exe) return exe
  }
  return null
}

/**
 * The installer records its install directory as InstallLocation under an
 * Uninstall key (the key name is a GUID electron-builder derives), so every
 * InstallLocation is tried for the executable: the directory can be changed
 * at install time.
 */
function locateWin(sys: LocatorEnv): string | null {
  const dirs: string[] = []
  for (const root of ['HKLM', 'HKCU']) {
    const out = sys.run('reg', ['query', `${root}\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall`, '/s', '/v', 'InstallLocation'])
    for (const m of (out ?? '').matchAll(/^\s*InstallLocation\s+REG_\w+\s+(.+?)\s*$/gm)) dirs.push(m[1].replace(/^"|"$/g, ''))
  }
  for (const base of [sys.env.ProgramFiles, sys.env.LOCALAPPDATA && path.win32.join(sys.env.LOCALAPPDATA, 'Programs')]) {
    if (base) dirs.push(path.win32.join(base, PRODUCT))
  }
  for (const d of dirs) {
    const exe = path.win32.join(d, `${PRODUCT}.exe`)
    if (sys.isFile(exe)) return exe
  }
  return null
}

/**
 * The .deb installs to /opt/CueMol3. The executable's name comes from the
 * package name, so it is read from the tritium_cli wrapper the package
 * ships, which runs `"$dir/../../<executable>"`.
 */
function locateLinux(sys: LocatorEnv): string | null {
  const cliDir = path.join('/opt', PRODUCT, 'resources', 'cli')
  const m = /"\$dir\/(\.\.\/\.\.\/[^"/]+)"/.exec(sys.readText(path.join(cliDir, 'tritium_cli')) ?? '')
  if (!m) return null
  const exe = path.resolve(cliDir, m[1])
  return sys.isFile(exe) ? exe : null
}

/**
 * The CueMol3 executable to start, or null when none is installed.
 *
 * CUEMOL3_APP comes first; a macOS bundle path is accepted for it as well as
 * the executable.
 */
export function locateApp(sys: LocatorEnv = systemEnv()): string | null {
  const named = sys.env.CUEMOL3_APP
  if (named) {
    if (sys.platform === 'darwin' && named.endsWith('.app')) return macExe(sys, named)
    return sys.isFile(named) ? named : null
  }
  if (sys.platform === 'darwin') return locateMac(sys)
  if (sys.platform === 'win32') return locateWin(sys)
  return locateLinux(sys)
}
