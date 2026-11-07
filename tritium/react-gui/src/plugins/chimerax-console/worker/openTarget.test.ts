/**
 * @file plugins/chimerax-console/worker/openTarget.test.ts
 * @description What `open` reads a name as: a file, or an entry of which database.
 *
 * Pins ChimeraX's precedence (`fetches_vs_files`): a file of the name wins
 * unless `fromDatabase` names a database, so the same command does not open
 * a local file in one directory and fetch in another. Also that `C:\...` stays
 * a path and that refused databases say so rather than fall back to a file.
 */

import { describe, expect, it } from 'vitest'
import { openTarget } from './openTarget'

const none = () => false
const all = () => true

describe('openTarget', () => {
  it('fetches with fromDatabase even when the file exists, and opens the file otherwise', () => {
    expect(openTarget('1crn', 'pdbe', '', all)).toMatchObject({ kind: 'entry', source: 'pdbe' })
    expect(openTarget('1crn', '', '', all)).toEqual({ kind: 'file' })
    // db:id and fromDatabase are the same fetch.
    expect(openTarget('pdbe:1crn', '', 'pdb', none)).toEqual(openTarget('1crn', 'pdbe', 'pdb', none))
    expect(openTarget('1crn', '', '', none)).toEqual({ kind: 'entry', source: 'pdb', id: '1crn', format: null })
    expect(openTarget('emdb:1080', '', '', none)).toEqual({ kind: 'emdb', id: 'EMD-1080', mirror: 'WWPDB' })
    expect(openTarget('C:\\data\\x.pdb', '', '', none)).toEqual({ kind: 'file' })
    expect(openTarget('emdb_japan:1080', '', '', none)).toEqual({ kind: 'emdb', id: 'EMD-1080', mirror: 'PDBJ' })
    expect(openTarget('https://example.org/m/x.mrc', '', '', none)).toMatchObject({ kind: 'mapUrl' })
  })

  it('refuses a database it cannot open, saying why', () => {
    expect(openTarget('smiles:CCO', '', '', none)).toMatchObject({ kind: 'error', error: expect.stringContaining('smiles is not supported') })
    expect(openTarget('foo:1abc', '', '', none)).toMatchObject({ kind: 'error', error: expect.stringContaining('unknown database') })
  })
})
