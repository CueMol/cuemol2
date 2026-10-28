/**
 * @file worker/shared/pdbUrls.test.ts
 * @description Pins what Get PDB accepts as an accession code and where an
 * EMDB map is downloaded from.
 */

import { describe, it, expect } from 'vitest'
import { parseAccession, pickEmdbMapUrl } from './pdbUrls'

describe('parseAccession / pickEmdbMapUrl', () => {
    it('reads PDB and EMDB codes in canonical form and builds the EMDB map URL', () => {
        expect(parseAccession(' 1MBN ')).toEqual({ kind: 'pdb', id: '1mbn' })
        for (const t of ['EMD-11638', 'emd_11638', 'emd11638']) {
            expect(parseAccession(t)).toEqual({ kind: 'emdb', id: 'EMD-11638', num: '11638' })
        }
        // Bare digits are a PDB ID when there are four, never an EMDB code.
        expect(parseAccession('1234')).toEqual({ kind: 'pdb', id: '1234' })
        expect(parseAccession('11638')).toBeNull()
        expect(parseAccession('photosystem')).toBeNull()

        expect(pickEmdbMapUrl('11638', 'WWPDB')).toEqual({
            url: 'https://files.wwpdb.org/pub/emdb/structures/EMD-11638/map/emd_11638.map.gz',
            readerName: 'ccp4map',
            gzip: true,
        })
        expect(pickEmdbMapUrl('11638', 'EBI').url).toBe(
            'https://ftp.ebi.ac.uk/pub/databases/emdb/structures/EMD-11638/map/emd_11638.map.gz',
        )
    })
})
