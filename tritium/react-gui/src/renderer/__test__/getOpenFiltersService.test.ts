/**
 * Pin the getOpenFilters exclusion contract.
 *
 * The filter list has two consumers that want different things from it, and
 * getting either wrong produces a false "cannot open" message:
 *
 *  - The File > Open dialog must NOT offer a trajectory-block format
 *    (`*.dcd` / `*.xtc` / `*.trr` / AMBER NetCDF). Those files carry
 *    coordinate frames and need a topology, so picking one there is a dead
 *    end by construction.
 *  - The drop classifier MUST see them, because it decides what a dropped
 *    file is by testing it against these filters. A file missing from the
 *    list is reported as "no reader accepts this file" -- untrue, and the
 *    very failure mode this list exists to avoid.
 *
 * qdf* internal handlers stay excluded either way.
 */

import { describe, it, expect, vi } from 'vitest'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import { services } from '@renderer/worker/server/services/file/file.service'

const { getOpenFilters } = services

const READER_INFO = [
    { name: 'pdb', descr: 'PDB (*.pdb)', fext: '*.pdb;*.ent', category: 0 },
    { name: 'xtctraj', descr: 'GROMACS XTC trajectory (*.xtc)', fext: '*.xtc', category: 0 },
    { name: 'dcdtraj', descr: 'CHARMM/NAMD DCD trajectory (*.dcd)', fext: '*.dcd', category: 0 },
    { name: 'trrtraj', descr: 'GROMACS TRR trajectory (*.trr)', fext: '*.trr', category: 0 },
    { name: 'ambnetcdftraj', descr: 'AMBER NetCDF trajectory (*.nc)', fext: '*.nc', category: 0 },
    { name: 'qdfpdb', descr: 'QDF PDB', fext: '*.qdf', category: 0 },
    { name: 'qsc_xml', descr: 'CueMol scene (*.qsc)', fext: '*.qsc', category: 3 },
]

function makeCtx(): WorkerContext {
    return {
        strMgr: { getInfoJSON2: vi.fn(() => JSON.stringify(READER_INFO)) },
    } as unknown as WorkerContext
}

/** Every extension the filter list mentions, across all of its rows. */
function allExtensions(filters: Array<{ extensions: string[] }>): string[] {
    return filters.flatMap((f) => f.extensions)
}

describe('getOpenFilters', () => {
    it('omits trajectory-block formats by default and includes them on request', () => {
        const ctx = makeCtx()

        const forDialog = getOpenFilters(ctx, { catId: 0 })
        expect(allExtensions(forDialog)).not.toContain('xtc')
        expect(allExtensions(forDialog)).not.toContain('dcd')
        expect(allExtensions(forDialog)).not.toContain('trr')
        expect(allExtensions(forDialog)).not.toContain('nc')

        const forClassifier = getOpenFilters(ctx, { catId: 0, includeTrajReaders: true })
        expect(allExtensions(forClassifier)).toEqual(
            expect.arrayContaining(['xtc', 'dcd', 'trr', 'nc']),
        )

        // Ordinary readers are unaffected, and qdf* stays hidden either way.
        for (const filters of [forDialog, forClassifier]) {
            expect(allExtensions(filters)).toEqual(expect.arrayContaining(['pdb', 'ent']))
            expect(allExtensions(filters)).not.toContain('qdf')
        }
    })
})
