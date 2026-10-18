/**
 * @file appLocator.test.ts
 * @description Finding an installed CueMol3 from what each platform's installer leaves behind.
 */

import { describe, it, expect } from 'vitest'
import { locateApp, type LocatorEnv } from './appLocator'

function sys(over: Partial<LocatorEnv> & { files?: string[]; texts?: Record<string, string> }): LocatorEnv {
  const files = new Set(over.files ?? [])
  return {
    platform: 'darwin',
    env: {},
    home: '/Users/u',
    isFile: (p) => files.has(p),
    readText: (p) => over.texts?.[p] ?? null,
    run: () => null,
    ...over,
  }
}

describe('locateApp', () => {
  it('prefers CUEMOL3_APP, and returns null when nothing is installed', () => {
    const exe = '/Applications/CueMol3.app/Contents/MacOS/CueMol3'
    const other = '/Volumes/x/CueMol3.app'
    expect(locateApp(sys({ files: [exe, `${other}/Contents/MacOS/CueMol3`], env: { CUEMOL3_APP: other } }))).toBe(
      `${other}/Contents/MacOS/CueMol3`,
    )
    expect(locateApp(sys({ files: [exe] }))).toBe(exe)
    expect(locateApp(sys({}))).toBeNull()
  })

  it('reads the install directory the Windows installer and the .deb record', () => {
    const reg = [
      'HKEY_LOCAL_MACHINE\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{other}',
      '    InstallLocation    REG_SZ    C:\\Tools\\Other',
      'HKEY_LOCAL_MACHINE\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\5b2c-guid',
      '    InstallLocation    REG_SZ    D:\\Apps\\CueMol3',
      '',
    ].join('\r\n')
    const win = sys({
      platform: 'win32',
      files: ['D:\\Apps\\CueMol3\\CueMol3.exe'],
      run: (cmd, args) => (cmd === 'reg' && args[1].startsWith('HKLM') ? reg : null),
    })
    expect(locateApp(win)).toBe('D:\\Apps\\CueMol3\\CueMol3.exe')

    const wrapper = 'dir=$(cd "$(dirname "$self")" && pwd)\nELECTRON_RUN_AS_NODE=1 exec "$dir/../../cuemol3" "$dir/tritium_cli.mjs" "$@"\n'
    const linux = sys({
      platform: 'linux',
      files: ['/opt/CueMol3/cuemol3'],
      texts: { '/opt/CueMol3/resources/cli/tritium_cli': wrapper },
    })
    expect(locateApp(linux)).toBe('/opt/CueMol3/cuemol3')
  })
})
