/**
 * @file __test__/fileAssociationSync.test.ts
 * @description Pins the three per-platform file-association lists to each
 * other: mac.fileAssociations and linux.fileAssociations in
 * electron-builder.yml, and the addOpenWith macros in build/installer.nsh.
 *
 * The lists live in three different syntaxes with only a comment telling
 * maintainers to keep them in sync, which is exactly the kind of contract
 * that drifts silently. Extraction here is deliberately regex-based rather
 * than a YAML parser: no runtime dependency, and the shapes involved are a
 * flat `- ext: x` / `ext: [a, b]` / `!insertmacro addOpenWith "x"`.
 *
 * Also pins two Linux-specific constraints of app-builder-lib's
 * LinuxTargetHelper.computeMimeTypeFiles:
 *   - every entry needs a mimeType (entries without one are skipped, i.e.
 *     silently dropped from the shared-mime-info XML);
 *   - ext must be a single string, because the generator emits `*.${ext}`
 *     verbatim and an array would produce a broken glob like "*.pdb,ent".
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(__dirname, '..', '..', '..')
const builderYml = readFileSync(join(root, 'electron-builder.yml'), 'utf-8')
const installerNsh = readFileSync(join(root, 'build', 'installer.nsh'), 'utf-8')

/** Slice the yml between a top-level `key:` line and the next top-level key. */
function topLevelSection(src: string, key: string): string {
  const m = src.match(new RegExp(`^${key}:\\n([\\s\\S]*?)(?=^\\S|(?![\\s\\S]))`, 'm'))
  if (!m) throw new Error(`top-level section "${key}:" not found`)
  return m[1]
}

/** Every ext named in a section: `- ext: x` scalars and `ext: [a, b]` flows. */
function extsIn(section: string): string[] {
  const out: string[] = []
  for (const m of section.matchAll(/-\s+ext:\s*(?:\[([^\]]+)\]|([\w.]+))/g)) {
    if (m[1]) out.push(...m[1].split(',').map((s) => s.trim()))
    else out.push(m[2])
  }
  return out
}

const macSection = topLevelSection(builderYml, 'mac')
const linuxSection = topLevelSection(builderYml, 'linux')
const macExts = extsIn(macSection)
const linuxExts = extsIn(linuxSection)
const winExts = [...installerNsh.matchAll(/!insertmacro addOpenWith "(\w+)"/g)].map(
  (m) => m[1],
)

describe('file-association lists stay in sync across platforms', () => {
  it('extracts a plausible list from each source (guards the regexes themselves)', () => {
    // If a refactor changes the syntax these regexes miss, every set would
    // come back empty and the equality tests below would pass vacuously.
    expect(macExts.length).toBeGreaterThanOrEqual(10)
    expect(macExts).toContain('qsc')
    expect(winExts).toContain('qsc')
    expect(linuxExts).toContain('qsc')
  })

  it('linux covers exactly the mac extension set', () => {
    expect([...linuxExts].sort()).toEqual([...new Set(macExts)].sort())
  })

  it('windows (installer.nsh addOpenWith) covers exactly the mac extension set', () => {
    expect([...new Set(winExts)].sort()).toEqual([...new Set(macExts)].sort())
  })
})

describe('linux.fileAssociations satisfies the mime-XML generator', () => {
  it('declares one single-string ext per entry (an array would emit "*.a,b")', () => {
    for (const m of linuxSection.matchAll(/-\s+ext:\s*(.+)$/gm)) {
      expect(m[1], m[0]).not.toMatch(/[[\],]/)
    }
  })

  it('gives every entry a mimeType (entries without one are silently skipped)', () => {
    const entries = linuxSection.match(/-\s+ext:/g) ?? []
    const mimes = linuxSection.match(/^\s+mimeType:\s*\S+/gm) ?? []
    expect(entries.length).toBeGreaterThan(0)
    expect(mimes.length).toBe(entries.length)
  })

  it('never claims a bare .gz glob', () => {
    // Declaring ext: gz (or pdb.gz collapsing to gz) would match every
    // gzip file on the system.
    expect(linuxExts).not.toContain('gz')
  })
})
