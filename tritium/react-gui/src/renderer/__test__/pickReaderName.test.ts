/**
 * Tests for `pickReaderName` reader inference, focused on the rule that
 * internal `qdf*` readers are never chosen (they would otherwise win a
 * content sniff over the intended reader, e.g. qdfpdb over pdb).
 */

import { describe, it, expect, vi } from 'vitest'
import type { WorkerContext } from '../worker/server/types/WorkerContext'
import { pickReaderName } from '../worker/server/services/helpers/pickReaderName'

interface ReaderInfo { name: string; fext: string; category: number }

function makeCtx(readers: ReaderInfo[], sniff: (csv: string) => string) {
    const searchReaderByContent = vi.fn(
        (_path: string, csv: string) => sniff(csv),
    )
    const ctx = {
        strMgr: {
            getInfoJSON2: vi.fn(() => JSON.stringify(readers)),
            searchReaderByContent,
        },
    } as unknown as WorkerContext
    return { ctx, searchReaderByContent }
}

const PDB_READERS: ReaderInfo[] = [
    { name: 'pdb', fext: '*.pdb;*.ent', category: 0 },
    { name: 'qdfpdb', fext: '*.pdb', category: 0 },
    { name: 'mmcif', fext: '*.cif', category: 0 },
    { name: 'mmcifmap', fext: '*.cif', category: 0 },
]

describe('pickReaderName -- qdf* exclusion', () => {
    it('content-first never sniffs qdf* readers (csv excludes them)', () => {
        const { ctx, searchReaderByContent } = makeCtx(PDB_READERS, () => 'pdb')

        const name = pickReaderName(ctx, '/x/foo.pdb', true)

        expect(name).toBe('pdb')
        // The candidate CSV passed to the C++ sniff must not contain any qdf* reader.
        const csv = searchReaderByContent.mock.calls[0][1] as string
        const names = csv.split(',')
        expect(names).toContain('pdb')
        expect(names).toContain('mmcif')
        expect(names.some((n) => n.startsWith('qdf'))).toBe(false)
    })

    it('content-first returns "" when no user-facing reader is registered', () => {
        const onlyQdf: ReaderInfo[] = [{ name: 'qdfpdb', fext: '*.pdb', category: 0 }]
        const { ctx, searchReaderByContent } = makeCtx(onlyQdf, () => 'qdfpdb')

        const name = pickReaderName(ctx, '/x/foo.pdb', true)

        expect(name).toBe('')
        expect(searchReaderByContent).not.toHaveBeenCalled()
    })

    it('ext-first drops qdf* candidates: a lone non-qdf reader wins without sniff', () => {
        // .pdb is claimed by both pdb and qdfpdb; after exclusion only pdb remains.
        const { ctx, searchReaderByContent } = makeCtx(PDB_READERS, () => 'qdfpdb')

        const name = pickReaderName(ctx, '/x/foo.pdb', false)

        expect(name).toBe('pdb')
        expect(searchReaderByContent).not.toHaveBeenCalled()
    })

    it('ext-first disambiguates among non-qdf candidates only', () => {
        // .cif is claimed by mmcif and mmcifmap (both non-qdf) -> content sniff.
        const { ctx, searchReaderByContent } = makeCtx(PDB_READERS, () => 'mmcif')

        const name = pickReaderName(ctx, '/x/foo.cif', false)

        expect(name).toBe('mmcif')
        const csv = searchReaderByContent.mock.calls[0][1] as string
        expect(csv.split(',').sort()).toEqual(['mmcif', 'mmcifmap'])
    })
})
