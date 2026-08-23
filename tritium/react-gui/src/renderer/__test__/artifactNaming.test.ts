/**
 * @file __test__/artifactNaming.test.ts
 * @description Pins how release artifacts are named and iconned.
 *
 * These are user-facing strings that nothing else checks: no code reads an
 * installer filename (every CI consumer is an extension glob), so a
 * regression here is invisible until someone downloads a release and cannot
 * tell which file is for their machine. That is exactly what happened before
 * this convention existed -- one release shipped `arm64`, `x64`, `amd64` and
 * `x86_64` for two machines, with no OS name anywhere.
 *
 * Extraction is regex-based rather than a YAML parse, matching
 * `fileAssociationSync.test.ts`: no runtime dependency, and the shapes
 * involved are flat `key: value` lines inside a known block.
 */

import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(__dirname, '..', '..', '..')
const builderYml = readFileSync(join(root, 'electron-builder.yml'), 'utf-8')
const packageSh = readFileSync(
  join(root, '..', 'packaging', 'package.sh'),
  'utf-8',
)

/** Slice the yml between a top-level `key:` line and the next top-level key. */
function topLevelSection(src: string, key: string): string {
  const m = src.match(new RegExp(`^${key}:\\n([\\s\\S]*?)(?=^\\S|(?![\\s\\S]))`, 'm'))
  if (!m) throw new Error(`top-level section "${key}:" not found`)
  return m[1]
}

/** The `artifactName:` declared in a section. */
function artifactNameIn(section: string): string {
  const m = section.match(/^\s*artifactName:\s*(\S+)\s*$/m)
  if (!m) throw new Error('no artifactName in section')
  return m[1]
}

/** Every `arch:` listed under a section's `target:` list. */
function archesIn(section: string): string[] {
  return [...section.matchAll(/^\s*arch:\s*(\S+)\s*$/gm)].map((m) => m[1])
}

const mac = topLevelSection(builderYml, 'mac')
const win = topLevelSection(builderYml, 'win')
const linux = topLevelSection(builderYml, 'linux')
const dmg = topLevelSection(builderYml, 'dmg')
const nsis = topLevelSection(builderYml, 'nsis')

/** The four shipped targets, keyed by the section that names them. */
const TARGETS = [
  { label: 'mac (dmg)', section: mac, os: 'macOS', arch: 'arm64', role: 'Installer' },
  { label: 'win (nsis)', section: win, os: 'Windows', arch: 'x64', role: 'Setup' },
  { label: 'linux (AppImage + deb)', section: linux, os: 'Linux', arch: 'x64', role: null },
] as const

describe('release artifact names identify OS, arch and role', () => {
  it.each(TARGETS)('$label names its OS and arch literally', (t) => {
    const name = artifactNameIn(t.section)
    expect(name).toContain(`-${t.os}-`)
    expect(name).toContain(`-${t.arch}`)
  })

  it.each(TARGETS)('$label does not use ${arch} (the cause of the drift)', (t) => {
    // ${arch} expands to each target's own spelling, which is how one release
    // came to carry four words for two machines.
    expect(artifactNameIn(t.section)).not.toContain('${arch}')
  })

  it.each(TARGETS)('$label declares exactly one arch, so a literal is safe', (t) => {
    // The literal arch above is only correct while a target builds one arch.
    // Adding a second would silently make two builds collide on one filename.
    const arches = archesIn(t.section)
    expect(arches.length).toBeGreaterThan(0)
    expect(new Set(arches)).toEqual(new Set([t.arch]))
  })

  it.each(TARGETS)('$label carries the 4-part version, not the semver', (t) => {
    // ${version} is the 3-part semver electron-builder requires, so it drops
    // the build number -- two builds of one revision would be indistinguishable.
    const name = artifactNameIn(t.section)
    expect(name).toContain('${env.CM_FULL_VERSION}')
    expect(name).not.toContain('${version}')
  })

  it('marks dmg and exe as installers, and leaves AppImage / deb unmarked', () => {
    // Only the two that hand the user something to run BEFORE they have the
    // app get a role word; an AppImage is the application.
    expect(artifactNameIn(mac)).toContain('-Installer.')
    expect(artifactNameIn(win)).toContain('-Setup.')
    expect(artifactNameIn(linux)).not.toMatch(/-(Installer|Setup)\./)
  })

  it('keeps a top-level fallback name for any target added later', () => {
    // Without one, a new target derives its filename from the scoped package
    // name (@cuemol/react-gui) and fpm fails on the '/'.
    expect(builderYml).toMatch(/^artifactName:\s*\S+/m)
  })

  it('exports CM_FULL_VERSION from the packaging script', () => {
    // The names above resolve to an empty version without it.
    expect(packageSh).toMatch(/^export CM_FULL_VERSION=/m)
  })
})

describe('installers are visually distinct from the app', () => {
  it('points the DMG volume and the NSIS wizard at the badged artwork', () => {
    expect(dmg).toMatch(/^\s*icon:\s*build\/installer-icon\.icns\s*$/m)
    expect(nsis).toMatch(/^\s*installerIcon:\s*build\/installer-icon\.ico\s*$/m)
    expect(nsis).toMatch(/^\s*uninstallerIcon:\s*build\/installer-icon\.ico\s*$/m)
  })

  it('ships both installer icons and both app icons', () => {
    // The app icons are found by name from buildResources, so nothing else
    // would notice if one went missing.
    for (const f of [
      'installer-icon.icns', 'installer-icon.ico',
      'icon.icns', 'icon.ico', 'icon.png',
    ]) {
      expect(existsSync(join(root, 'build', f)), f).toBe(true)
    }
  })

  it('does not try to put the 4-part version in the DMG volume title', () => {
    // dmg.title does not expand ${env.*}: a build with it set mounted a volume
    // literally named 'CueMol3 ${env.CM_FULL_VERSION}'. Leaving the key unset
    // is the only correct option, so pin that it stays unset.
    expect(dmg).not.toMatch(/^\s*title:/m)
  })
})
