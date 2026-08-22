/**
 * Pins the argv-slicing and filtering rules for OS-shell / command-line file
 * open (main/helpers/parseFileArgs.ts).
 *
 * The dev-vs-packaged slice difference is the whole reason the helper exists:
 * electron-vite spawns `electron <entry> ...args`, so a dev run carries one
 * extra leading argument. Everything else here guards against opening
 * something that is not a file the user named.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { parseFileArgs } from '../../main/helpers/parseFileArgs'

/** Treat every path as an existing file unless it is listed as absent. */
const allExist = () => true

afterEach(() => {
  vi.restoreAllMocks()
})

describe('parseFileArgs', () => {
  it('yields the same paths for a dev and a packaged command line', () => {
    const packaged = parseFileArgs({
      argv: ['/Applications/CueMol3.app/Contents/MacOS/CueMol3', '/d/1crn.pdb'],
      isPackaged: true,
      cwd: '/work',
      isFile: allExist,
    })
    const dev = parseFileArgs({
      // electron-vite preview: spawn(electronPath, [entry, ...args])
      argv: ['/nm/.bin/electron', '.', '/d/1crn.pdb'],
      isPackaged: false,
      cwd: '/work',
      isFile: allExist,
    })
    expect(packaged).toEqual({ paths: ['/d/1crn.pdb'], missing: [] })
    expect(dev).toEqual(packaged)
  })

  it('opens nothing when a dev run gets no file argument', () => {
    // The literal '.' entry must never be treated as a path to open.
    expect(
      parseFileArgs({ argv: ['electron', '.'], isPackaged: false, cwd: '/work', isFile: allExist }),
    ).toEqual({ paths: [], missing: [] })
  })

  it("drops '.' and '..' even when the slice already removed the entry", () => {
    expect(
      parseFileArgs({
        argv: ['exe', '.', '..', '/d/1crn.pdb'],
        isPackaged: true,
        cwd: '/work',
        isFile: allExist,
      }).paths,
    ).toEqual(['/d/1crn.pdb'])
  })

  it('drops switch-style arguments', () => {
    // Chromium switches, macOS process serial numbers, and the UXP -file /
    // -url marker tokens. The path following a marker survives on its own.
    const r = parseFileArgs({
      argv: [
        'exe', '--no-sandbox', '--remote-debugging-port=9222', '-psn_0_12345',
        '-NSDocumentRevisionsDebugMode', '-file', '/d/1crn.pdb',
      ],
      isPackaged: true,
      cwd: '/work',
      isFile: allExist,
    })
    expect(r.paths).toEqual(['/d/1crn.pdb'])
    expect(r.missing).toEqual([])
  })

  it('resolves relative paths against the given cwd', () => {
    expect(
      parseFileArgs({
        argv: ['exe', 'sub/1crn.pdb'],
        isPackaged: true,
        cwd: '/work',
        isFile: allExist,
      }).paths,
    ).toEqual(['/work/sub/1crn.pdb'])
  })

  it('de-duplicates after resolving', () => {
    expect(
      parseFileArgs({
        argv: ['exe', '/d/1crn.pdb', '/d/./1crn.pdb', '1crn.pdb'],
        isPackaged: true,
        cwd: '/d',
        isFile: allExist,
      }).paths,
    ).toEqual(['/d/1crn.pdb'])
  })

  it('separates files that do not exist without mixing them into paths', () => {
    const r = parseFileArgs({
      argv: ['exe', '/d/gone.pdb', '/d/1crn.pdb'],
      isPackaged: true,
      cwd: '/work',
      isFile: (p) => p !== '/d/gone.pdb',
    })
    expect(r.paths).toEqual(['/d/1crn.pdb'])
    expect(r.missing).toEqual(['/d/gone.pdb'])
  })

  it('treats a directory as not openable', () => {
    // macOS can hand a folder to 'open-file'; isFile() is false for it.
    const r = parseFileArgs({
      argv: ['exe', '/d/somedir'],
      isPackaged: true,
      cwd: '/work',
      isFile: () => false,
    })
    expect(r.paths).toEqual([])
    expect(r.missing).toEqual(['/d/somedir'])
  })

  it('treats a Windows drive-letter path as a path, not a URL scheme', () => {
    // "C:\..." must never be mistaken for a URL with scheme "c" -- this is
    // the Explorer "Open with" / shell-association argv shape on Windows.
    const r = parseFileArgs({
      argv: ['exe', 'C:\\data\\1crn.pdb'],
      isPackaged: true,
      cwd: 'C:\\work',
      isFile: allExist,
    })
    expect(r.paths).toHaveLength(1)
    expect(r.paths[0].endsWith('1crn.pdb')).toBe(true)
    expect(r.missing).toEqual([])
  })

  it('resolves a file: URL and discards any other scheme', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const r = parseFileArgs({
      argv: ['exe', 'file:///d/1crn.pdb', 'http://example.com/2abc.pdb'],
      isPackaged: true,
      cwd: '/work',
      isFile: allExist,
    })
    expect(r.paths).toEqual(['/d/1crn.pdb'])
    // A non-file URL names no local file, so it is neither opened nor
    // reported as missing (UXP discarded these silently too).
    expect(r.missing).toEqual([])
  })
})
