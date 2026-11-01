/**
 * @file __test__/updaterLauncher.test.ts
 * @description Pins the contract between the Windows updater launcher and the app.
 *
 * The launcher (build/updater-launcher.nsi, built at package time) and the
 * app's WinInstaller (@cuemol/updater) meet only on a Windows machine in the
 * middle of an update, so a drift between them shows up as a failed update
 * rather than a failed build. Both are checked here as text.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { WIN_APP_GUID } from '@cuemol/updater'

const root = join(__dirname, '..', '..', '..')
const readText = (file: string) => readFileSync(file, 'utf-8').replace(/\r\n/g, '\n')
/** The NSIS script without its comment lines. */
const nsi = readText(join(root, 'build', 'updater-launcher.nsi'))
  .split('\n')
  .filter((l) => !l.trimStart().startsWith(';'))
  .join('\n')
const { appGuid } = createRequire(import.meta.url)(join(root, 'build', 'updaterLauncher.js')) as {
  appGuid: (appId: string) => string
}

describe('updater launcher', () => {
  it('backs up the registry keys the installer of this appId writes', () => {
    // The installer, the launcher and WinInstaller's InstallLocation check
    // must all name the same GUID.
    const appId = readText(join(root, 'electron-builder.yml')).match(/^appId:\s*(\S+)/m)?.[1]
    expect(appId).toBeDefined()
    expect(appGuid(appId!)).toBe(WIN_APP_GUID)
  })

  it('runs the staged installer silently into the recorded location', () => {
    // WinInstaller stages the installer under this fixed name. A /D= would
    // pick the directory instead of InstallLocation; passed through a
    // command line it was once cut at the space (C:\Program).
    expect(nsi).toContain(String.raw`StrCpy $Setup "$Work\staging\CueMol3-Setup.exe"`)
    expect(nsi).toContain(`ExecWait '"$Setup" /S --updated' $R1`)
    expect(nsi).not.toMatch(/\/D=/)
  })
})
