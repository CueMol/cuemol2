/**
 * @file shared/fileExt.test.ts
 * @description Pins suffix matching against declared extensions.
 *
 * Readers declare multi-dot extensions (`"*.pdb; *.ent; *.pdb.gz"`). Taking a
 * path's last dot-segment reduced `1crn.pdb.gz` to `gz`, which matches no
 * reader -- so the file fell through to whatever the no-match branch did.
 */

import { describe, it, expect } from 'vitest'
import { hasExt, matchExtLength, parseExtList } from './fileExt'

describe('parseExtList', () => {
    it('strips the glob prefix and normalises case and spacing', () => {
        expect(parseExtList('*.pdb; *.ent; *.PDB.GZ')).toEqual(['pdb', 'ent', 'pdb.gz'])
    })

    it('accepts a bare or dotted list', () => {
        expect(parseExtList('pdb;.ent')).toEqual(['pdb', 'ent'])
    })

    it('drops empty entries', () => {
        expect(parseExtList('*.pdb;;  ;*.ent')).toEqual(['pdb', 'ent'])
    })
})

describe('hasExt', () => {
    it('matches a multi-dot extension', () => {
        expect(hasExt('/tmp/1crn.pdb.gz', 'pdb.gz')).toBe(true)
    })

    it('matches a plain extension', () => {
        expect(hasExt('/tmp/1crn.pdb', 'pdb')).toBe(true)
    })

    it('is case insensitive on both sides', () => {
        expect(hasExt('/tmp/1CRN.PDB.GZ', '*.pdb.gz')).toBe(true)
    })

    it('does not match a different extension', () => {
        expect(hasExt('/tmp/1crn.cif', 'pdb')).toBe(false)
    })

    it('does not match a bare substring', () => {
        // "mypdb" must not count as ".pdb".
        expect(hasExt('/tmp/mypdb', 'pdb')).toBe(false)
    })

    it('is not fooled by a dot in a parent directory', () => {
        expect(hasExt('/Users/me/v1.2/output', 'pdb')).toBe(false)
    })
})

describe('matchExtLength', () => {
    it('reports the longest matching extension so the most specific wins', () => {
        // A reader claiming pdb.gz must beat one claiming only gz.
        expect(matchExtLength('/tmp/1crn.pdb.gz', ['gz'])).toBe(2)
        expect(matchExtLength('/tmp/1crn.pdb.gz', ['pdb', 'ent', 'pdb.gz'])).toBe(6)
    })

    it('reports 0 when nothing matches', () => {
        expect(matchExtLength('/tmp/1crn.xyz', ['pdb', 'cif'])).toBe(0)
        expect(matchExtLength('/tmp/1crn.xyz', [])).toBe(0)
    })
})
