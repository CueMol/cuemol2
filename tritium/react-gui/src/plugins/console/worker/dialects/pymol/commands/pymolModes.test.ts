/**
 * @file plugins/console/worker/dialects/pymol/commands/pymolModes.test.ts
 * @description What PyMOL's fetch types and distance modes become here.
 *
 * Both are small tables whose rows mean different operations -- a density
 * map instead of coordinates, a contact search instead of one centroid
 * distance -- so a wrong row is a silently different result.
 */

import { describe, it, expect } from 'vitest'
import { fetchKind, parseEmdbFetchCode } from './fileCommands'
import { contactMode } from './measureCommands'
import { fileStem } from './helpers'

describe('fetch type', () => {
  it.each([
    ['', { kind: 'coord', server: 'RCSB_CIF' }],
    ['pdb', { kind: 'coord', server: 'RCSB_PDB' }],
    ['pdb2', { kind: 'assembly', n: 2 }],
    ['2fofc', { kind: 'map', mapType: '2fofc' }],
    ['fofc', { kind: 'map', mapType: 'fofc' }],
    ['emd', { kind: 'emd' }],
  ])('reads %s', (type, kind) => {
    expect(fetchKind(type)).toEqual(kind)
  })

  it('refuses a type it has no source for', () => {
    expect(fetchKind('cc')).toBeNull()
  })

  // As in PyMOL, a prefixed code is an EMDB map whatever the type; bare
  // digits are one only with type=emd.
  it('reads an EMD- / emd_ code as an EMDB entry', () => {
    expect([parseEmdbFetchCode('EMD-3489'), parseEmdbFetchCode('emd_3489'), parseEmdbFetchCode('3489')]).toEqual(['3489', '3489', null])
  })
})

describe('distance mode', () => {
  it.each([
    // PyMOL's default: one distance; the centroid here.
    ['', '', { kind: 'centroid' }],
    ['4', '', { kind: 'centroid' }],
    // A cutoff alone, or an all-pairs mode, lists contacts.
    ['', '3.2', { kind: 'contacts', maxDist: 3.2, hbondOnly: false }],
    ['0', '', { kind: 'contacts', maxDist: 4.0, hbondOnly: false }],
    ['2', '', { kind: 'contacts', maxDist: 3.6, hbondOnly: true }],
  ])('mode %s cutoff %s', (mode, cutoff, expected) => {
    expect(contactMode(mode, cutoff)).toEqual(expected)
  })

  it('refuses modes CueMol has nothing for', () => {
    expect(contactMode('5', '')).toHaveProperty('error')
  })
})

describe('object names from file names', () => {
  it('drops a compression suffix as PyMOL does', () => {
    expect(fileStem('/data/1crn.pdb.gz')).toBe('1crn')
    expect(fileStem('map.ccp4')).toBe('map')
  })
})
