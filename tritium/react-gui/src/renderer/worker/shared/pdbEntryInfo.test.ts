/**
 * @file worker/shared/pdbEntryInfo.test.ts
 * @description Pins how the RCSB and EMDB API responses are read: which map
 * kind an entry gets, and which contour level is the recommended one.
 */

import { describe, it, expect } from 'vitest'
import { parseEmdbMap, parseRcsbEntries, parseRcsbSearch, rcsbSearchRequest } from './pdbEntryInfo'

function entry(id: string, method: string, emdbIds: string[] | null, compat = 'Y') {
    return {
        rcsb_id: id,
        struct: { title: `title ${id}` },
        exptl: [{ method }],
        rcsb_entry_info: { resolution_combined: [2.0] },
        rcsb_entry_container_identifiers: { emdb_ids: emdbIds },
        pdbx_database_status: { pdb_format_compatible: compat },
    }
}

describe('parseRcsbEntries', () => {
    it('decides the map kind by the EMDB volume first, then the method; drops unknown IDs', () => {
        const res = parseRcsbEntries({ data: { entries: [
            entry('1MBN', 'X-RAY DIFFRACTION', null),
            // Electron crystallography with an EMDB map: the EMDB map wins.
            entry('6AXZ', 'ELECTRON CRYSTALLOGRAPHY', ['EMD-7051']),
            entry('2K39', 'SOLUTION NMR', null),
            entry('7A4P', 'ELECTRON MICROSCOPY', ['EMD-11640'], 'N'),
            // An ID RCSB does not know comes back with every field null.
            { rcsb_id: '9ZZZ', struct: null, exptl: null },
        ] } })
        expect(res.map((e) => [e.id, e.kind])).toEqual([
            ['1mbn', 'xtal'], ['6axz', 'em'], ['2k39', 'other'], ['7a4p', 'em'],
        ])
        expect(res[3].pdbFormatAvailable).toBe(false)
        expect(res[3].emdbIds).toEqual(['EMD-11640'])
    })
})

describe('parseEmdbMap', () => {
    it('takes the primary contour, else the first, else none', () => {
        const map = (contour: unknown[]) => ({ map: { contour_list: { contour }, size_kbytes: 67109 } })
        expect(parseEmdbMap('EMD-1', map([{ level: 0.2 }, { level: 0.116, primary: true }])).recommendedLevel).toBe(0.116)
        expect(parseEmdbMap('EMD-1', map([{ level: 0.2 }])).recommendedLevel).toBe(0.2)
        const none = parseEmdbMap('EMD-1', map([]))
        expect(none.recommendedLevel).toBeNull()
        expect(none.sizeBytes).toBe(67109000)
    })
})

describe('rcsbSearchRequest / parseRcsbSearch', () => {
    it('sends the method as an exact-match clause and the order as a server-side sort', () => {
        expect(rcsbSearchRequest('psi', 'all', 'score', 0, 25)).toEqual({
            query: { type: 'terminal', service: 'full_text', parameters: { value: 'psi' } },
            return_type: 'entry',
            request_options: { paginate: { start: 0, rows: 25 } },
        })
        const req = rcsbSearchRequest('psi', 'em', 'resolution', 25, 25) as {
            query: { logical_operator: string; nodes: { parameters: Record<string, string> }[] }
            request_options: unknown
        }
        expect(req.query.logical_operator).toBe('and')
        expect(req.query.nodes[1].parameters).toEqual({
            attribute: 'exptl.method', operator: 'exact_match', value: 'ELECTRON MICROSCOPY',
        })
        expect(req.request_options).toEqual({
            paginate: { start: 25, rows: 25 },
            sort: [{ sort_by: 'rcsb_entry_info.resolution_combined', direction: 'asc' }],
        })
        expect(parseRcsbSearch({ total_count: 1088, result_set: [{ identifier: '1JB0' }, { identifier: '6VPV' }] }))
            .toEqual({ total: 1088, ids: ['1jb0', '6vpv'] })
    })
})
