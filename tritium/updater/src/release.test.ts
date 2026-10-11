import { describe, expect, it } from 'vitest'
import { findUpdate, type RawRelease } from './release'
import { parseVersion } from './version'

const asset = (name: string) => ({ name, browser_download_url: `https://x/${name}`, size: 10, digest: 'sha256:00' })
const raw = (assets: RawRelease['assets']): RawRelease => ({
  tag_name: 'v2.3.22.550', html_url: 'https://github.com/CueMol/cuemol2/releases/tag/v2.3.22.550', body: 'notes', assets,
})
const current = parseVersion('2.3.21.544')!

describe('findUpdate', () => {
  it('picks the macOS installer among the other platforms and CueMol2 archives', () => {
    const r = findUpdate(raw([
      asset('cuemol2_2.3.22.550_macOS_ARM64.tar.bz2'),
      asset('CueMol3-2.3.22.550-Windows-x64-Setup.exe'),
      asset('CueMol3-2.3.22.550-macOS-arm64-Installer.dmg'),
    ]), current, 'darwin-arm64')
    expect(r?.version).toBe('2.3.22.550')
    expect(r?.asset.name).toBe('CueMol3-2.3.22.550-macOS-arm64-Installer.dmg')
  })

  it('reports no update while the release lacks this OS installer', () => {
    expect(findUpdate(raw([asset('CueMol3-2.3.22.550-Linux-x64.AppImage')]), current, 'darwin-arm64')).toBeNull()
  })
})
