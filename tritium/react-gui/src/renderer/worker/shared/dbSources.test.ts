/**
 * @file worker/shared/dbSources.test.ts
 * @description Where an entry is fetched from: URL, reader, gzip and name per database.
 *
 * Pins what a wrong row would get quietly wrong: PDBj's gzip-only answers read
 * as plain text, an AlphaFold id taken apart differently from ChimeraX, or a
 * URL read with the wrong reader.
 */

import { describe, expect, it } from 'vitest'
import { structureFetch, urlFetch } from './dbSources'

const spec = (r: ReturnType<typeof structureFetch>) => (r.ok ? r.spec : r.error)

describe('structureFetch', () => {
  it('builds each database URL with its reader, gzip and name', () => {
    expect(spec(structureFetch('pdbj', '1CRN', 'pdb'))).toEqual({
      url: 'https://pdbj.org/rest/downloadPDBfile?format=pdb&id=1crn', readerName: 'pdb', gzip: true, name: '1crn',
    })
    expect(spec(structureFetch('alphafold', 'AF-q8n9c0-2-F1-v4', null))).toEqual({
      url: 'https://alphafold.ebi.ac.uk/files/AF-Q8N9C0-2-F1-model_v4.cif', readerName: 'mmcif', gzip: false, name: 'AF-Q8N9C0-2-F1',
    })
    expect(spec(structureFetch('pubchem', '2244', null))).toMatchObject({ readerName: 'sdf', name: 'pubchem_2244' })
    expect(spec(urlFetch('https://example.org/x/1abc.pdb.gz?dl=1'))).toEqual({
      url: 'https://example.org/x/1abc.pdb.gz?dl=1', readerName: 'pdb', gzip: true, name: '1abc',
    })
  })

  it('refuses ids it cannot fetch', () => {
    expect(structureFetch('pdbe', '1crnx', null).ok).toBe(false)
    expect(structureFetch('alphafold', 'NOS3_HUMAN', null).ok).toBe(false)
    expect(structureFetch('pubchem', '2244', 'pdb').ok).toBe(false)
  })
})
