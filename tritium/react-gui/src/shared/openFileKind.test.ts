/**
 * @file shared/openFileKind.test.ts
 * @description The one rule every way of opening a file shares: a scene
 * opens as a scene, one reader claiming the extension decides, anything
 * else is sniffed.
 */

import { describe, it, expect } from 'vitest'
import { classifyOpenFile } from './openFileKind'

const OBJ = [
  { name: 'All Supported', extensions: ['pdb', 'pdb.gz', 'cif', 'map'] },
  { name: 'PDB', extensions: ['pdb', 'pdb.gz'] },
  { name: 'mmCIF', extensions: ['cif'] },
  { name: 'CCP4 map', extensions: ['map'] },
  { name: 'Other map', extensions: ['map'] },
  { name: 'All Files', extensions: ['*'] },
]
const SCENE = [{ name: 'All Supported', extensions: ['qsc'] }, { name: 'Scene', extensions: ['qsc'] }]

describe('classifyOpenFile', () => {
  it('lets one claiming reader decide, and sniffs when several or none do', () => {
    expect(classifyOpenFile('/w/1crn.pdb.gz', OBJ, SCENE)).toEqual({ kind: 'obj', contentFirst: false })
    expect(classifyOpenFile('/w/a.map', OBJ, SCENE)).toEqual({ kind: 'obj', contentFirst: true })
    expect(classifyOpenFile('/w/a.qsc', OBJ, SCENE)).toEqual({ kind: 'scene', contentFirst: false })
    expect(classifyOpenFile('/w/1crn.txt', OBJ, SCENE)).toEqual({ kind: 'unsupported', contentFirst: false })
  })
})
