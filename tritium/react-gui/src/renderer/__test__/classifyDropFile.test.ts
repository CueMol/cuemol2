/**
 * Pins the extension-classification rules for OS file drop
 * (utils/classifyDropFile.ts).
 *
 * The rules that matter and are easy to regress: the two synthetic filter
 * rows getOpenFilters adds must not identify a reader, compound extensions
 * (`.pdb.gz`) must match, matching must be case-insensitive, and object
 * readers must win over scene readers (UXP openNsFileImpl order).
 */

import { describe, it, expect } from 'vitest'
import {
  classifyDropFile,
  dragItemsMayContainOpenable,
  isDeniedMime,
} from '../utils/classifyDropFile'
import type { ElectronFileFilter } from '@shared/types/fileDialog'

/** Shape getOpenFilters returns: All Supported + concrete rows + All Files. */
const OBJ_FILTERS: ElectronFileFilter[] = [
  { name: 'All Supported', extensions: ['pdb', 'ent', 'pdb.gz', 'cif', 'ccp4', 'qsc'] },
  { name: 'PDB file', extensions: ['pdb', 'ent', 'pdb.gz'] },
  { name: 'mmCIF file', extensions: ['cif'] },
  { name: 'mmCIF density map', extensions: ['cif'] },
  { name: 'CCP4 density map', extensions: ['ccp4'] },
  { name: 'All Files', extensions: ['*'] },
]

const SCENE_FILTERS: ElectronFileFilter[] = [
  { name: 'All Supported', extensions: ['qsc', 'pse'] },
  { name: 'CueMol scene file', extensions: ['qsc'] },
  { name: 'PyMOL session', extensions: ['pse'] },
  { name: 'All Files', extensions: ['*'] },
]

describe('classifyDropFile', () => {
  it('classifies a uniquely-matched object file with contentFirst false', () => {
    expect(classifyDropFile('1abc.pdb', OBJ_FILTERS, SCENE_FILTERS)).toEqual({
      kind: 'obj',
      contentFirst: false,
    })
  })

  it('matches case-insensitively and on compound extensions', () => {
    expect(classifyDropFile('MODEL.PDB', OBJ_FILTERS, SCENE_FILTERS).kind).toBe('obj')
    expect(classifyDropFile('map.pdb.gz', OBJ_FILTERS, SCENE_FILTERS).kind).toBe('obj')
  })

  it('sets contentFirst when the extension matches more than one reader', () => {
    // .cif is claimed by both the coordinate and the density-map reader, so
    // the reader must be resolved by sniffing the content.
    expect(classifyDropFile('7xyz.cif', OBJ_FILTERS, SCENE_FILTERS)).toEqual({
      kind: 'obj',
      contentFirst: true,
    })
  })

  it('classifies a scene file, never with contentFirst', () => {
    expect(classifyDropFile('test.qsc', SCENE_FILTERS.slice(0, 1), SCENE_FILTERS)).toEqual({
      kind: 'scene',
      contentFirst: false,
    })
  })

  it('prefers an object reader when both categories claim the extension', () => {
    // .qsc appears in the obj 'All Supported' union row above but in no
    // concrete obj row, so it must still resolve as a scene.
    expect(classifyDropFile('test.qsc', OBJ_FILTERS, SCENE_FILTERS).kind).toBe('scene')
    // A concrete obj row claiming .qsc flips it to obj (obj is tried first).
    const objClaimsQsc = [...OBJ_FILTERS, { name: 'Fake reader', extensions: ['qsc'] }]
    expect(classifyDropFile('test.qsc', objClaimsQsc, SCENE_FILTERS).kind).toBe('obj')
  })

  it('ignores the All Supported and All Files rows', () => {
    // Only the synthetic rows are present, so nothing identifies a reader.
    const syntheticOnly: ElectronFileFilter[] = [
      { name: 'All Supported', extensions: ['pdb'] },
      { name: 'All Files', extensions: ['*'] },
    ]
    expect(classifyDropFile('1abc.pdb', syntheticOnly, syntheticOnly).kind).toBe('unsupported')
  })

  it('reports unsupported for unknown and extension-less names', () => {
    expect(classifyDropFile('README.txt', OBJ_FILTERS, SCENE_FILTERS).kind).toBe('unsupported')
    expect(classifyDropFile('Makefile', OBJ_FILTERS, SCENE_FILTERS).kind).toBe('unsupported')
  })
})

describe('isDeniedMime', () => {
  it('denies documents, media and archives', () => {
    const denied = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.oasis.opendocument.text',
      'application/vnd.apple.pages',
      'image/png',
      'video/mp4',
      'audio/mpeg',
      'application/zip',
      'text/html',
    ]
    for (const m of denied) expect(isDeniedMime(m), m).toBe(true)
  })

  it('allows the types CueMol formats actually arrive as', () => {
    // Anything not certainly a document/media/archive must stay droppable:
    // .pdb is typeless or text/plain depending on the OS, .pdb.gz is gzip.
    const allowed = ['', '  ', 'application/gzip', 'application/x-gzip', 'text/plain',
      'application/octet-stream', 'chemical/x-pdb']
    for (const m of allowed) expect(isDeniedMime(m), m).toBe(false)
  })

  it('matches case-insensitively', () => {
    expect(isDeniedMime('IMAGE/PNG')).toBe(true)
    expect(isDeniedMime('Application/PDF')).toBe(true)
  })
})

describe('dragItemsMayContainOpenable', () => {
  const items = (specs: Array<{ kind: string; type: string }>) =>
    ({
      length: specs.length,
      ...Object.fromEntries(specs.map((s, i) => [i, s])),
    }) as unknown as DataTransferItemList

  it('rejects a drag whose every file is a denied type', () => {
    expect(
      dragItemsMayContainOpenable(
        items([
          { kind: 'file', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
          { kind: 'file', type: 'application/pdf' },
        ]),
      ),
    ).toBe(false)
  })

  it('accepts a mixed drag so the openable file still loads', () => {
    expect(
      dragItemsMayContainOpenable(
        items([{ kind: 'file', type: '' }, { kind: 'file', type: 'application/pdf' }]),
      ),
    ).toBe(true)
  })

  it('fails open when no file item is readable', () => {
    // Item list absent, empty, or carrying only non-file entries: fall back to
    // accepting and let the post-drop extension check decide.
    expect(dragItemsMayContainOpenable(undefined)).toBe(true)
    expect(dragItemsMayContainOpenable(items([]))).toBe(true)
    expect(dragItemsMayContainOpenable(items([{ kind: 'string', type: 'text/plain' }]))).toBe(true)
  })
})
