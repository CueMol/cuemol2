/**
 * Regression test for the open-file extension/content-sniff routing.
 *
 * `inferContentFirst` decides whether a chosen file should be routed
 * through C++ content sniffing (true) or extension-based reader pick
 * (false). The bug being pinned here: a reader-specific filter row
 * may itself carry multiple extensions (e.g. PDB Coordinates ->
 * *.pdb;*.ent;*.pdb.gz). An earlier version skipped any row whose
 * `extensions.length > 1`, treating the PDB row as the aggregate
 * "All Supported" catch-all and forcing content-first mode -- which
 * routed PDB opens through the full reader-iteration sniff path,
 * returning UNKNOWN for every reader and leaving the renderer-type
 * dropdown empty.
 */

import { describe, it, expect } from 'vitest'
import { inferContentFirst, type FileFilter } from '@main/helpers/inferContentFirst'

// Realistic filter set produced by getOpenFilters.service.ts for the
// object-reader category. PDB and CCP4/MRC have multi-extension rows;
// .map is shared between CCP4 and Xplor.
const FILTERS: FileFilter[] = [
    { name: 'All Supported', extensions: ['pdb', 'ent', 'pdb.gz', 'mmcif', 'cif', 'map', 'ccp4', 'mrc', 'cns'] },
    { name: 'PDB Coordinates (*.pdb;*.ent;*.pdb.gz)', extensions: ['pdb', 'ent', 'pdb.gz'] },
    { name: 'mmCIF (*.mmcif;*.cif)', extensions: ['mmcif', 'cif'] },
    { name: 'mmCIF Structure-factor (*.cif)', extensions: ['cif'] },
    { name: 'CCP4 Density Map (*.map;*.ccp4;*.mrc)', extensions: ['map', 'ccp4', 'mrc'] },
    { name: 'XPLOR Density Map (*.map;*.cns)', extensions: ['map', 'cns'] },
    { name: 'All Files', extensions: ['*'] },
]

describe('inferContentFirst', () => {
    it('returns false for a PDB file: exactly one reader-specific filter (the multi-ext PDB row) matches', () => {
        // Regression: this previously returned true because the PDB
        // row's `extensions.length === 3` was incorrectly treated as
        // the aggregate "All Supported" catch-all.
        expect(inferContentFirst('/data/1ubq.pdb', FILTERS)).toBe(false)
    })

    it('returns false for a unique single-extension file (.mrc -> only CCP4 row matches)', () => {
        expect(inferContentFirst('/data/foo.mrc', FILTERS)).toBe(false)
    })

    it('returns true when multiple reader-specific filters share the extension (.cif -> mmcif coord + SF)', () => {
        expect(inferContentFirst('/data/1mbn.cif', FILTERS)).toBe(true)
    })

    it('returns true when multiple filters share the extension (.map -> CCP4 + XPLOR)', () => {
        expect(inferContentFirst('/data/foo.map', FILTERS)).toBe(true)
    })

    it('returns true for an unknown extension matched only by the All Files row', () => {
        expect(inferContentFirst('/data/foo.xyz', FILTERS)).toBe(true)
    })

    it('skips the "All Supported" aggregate by name even when its extensions claim the ext', () => {
        // An ext that only the aggregate row carries (no reader-specific
        // row claims it) must still be treated as unmatched.
        const only_aggregate: FileFilter[] = [
            { name: 'All Supported', extensions: ['pdb'] },
            { name: 'All Files', extensions: ['*'] },
        ]
        expect(inferContentFirst('/data/foo.pdb', only_aggregate)).toBe(true)
    })

    it('skips the wildcard row by extension regardless of name', () => {
        // The "All Files" row uses extensions=['*'] and must not be
        // counted, no matter what its display name is.
        const wildcard_named: FileFilter[] = [
            { name: 'Anything', extensions: ['*'] },
            { name: 'PDB Coordinates', extensions: ['pdb', 'ent', 'pdb.gz'] },
        ]
        expect(inferContentFirst('/data/foo.pdb', wildcard_named)).toBe(false)
    })

    it('is case-insensitive on the file extension', () => {
        expect(inferContentFirst('/data/1UBQ.PDB', FILTERS)).toBe(false)
    })
})
