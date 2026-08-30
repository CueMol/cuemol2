/**
 * Tests for `pickReaderName` reader inference, focused on the rule that
 * internal `qdf*` readers are never chosen (they would otherwise win a
 * content sniff over the intended reader, e.g. qdfpdb over pdb).
 */

import { describe, it, expect, vi } from 'vitest'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import { pickReaderName } from '@renderer/worker/server/services/helpers/pickReaderName'
import { DEFAULT_SNIFF_CAP } from '@renderer/worker/shared/sniffConfig'

interface ReaderInfo { name: string; fext: string; category: number }

function makeCtx(readers: ReaderInfo[], sniff: (csv: string) => string) {
    const searchReaderByContent = vi.fn(
        (_path: string, csv: string, _category: number, _compression: boolean, _maxBytes: number) =>
            sniff(csv),
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

// The 5th argument of searchReaderByContent is the ceiling of the C++
// escalating sniff budget (64 KiB first, x8 while cut off, up to the
// ceiling). tritium must always pass a finite ceiling.
describe('pickReaderName -- sniff ceiling', () => {
    function ceilingOfFirstCall(searchReaderByContent: ReturnType<typeof vi.fn>): number {
        return searchReaderByContent.mock.calls[0][4] as number
    }

    it('passes DEFAULT_SNIFF_CAP when maxSniffBytes is omitted', () => {
        const { ctx, searchReaderByContent } = makeCtx(PDB_READERS, () => 'mmcif')
        pickReaderName(ctx, '/x/foo.cif', true)
        expect(ceilingOfFirstCall(searchReaderByContent)).toBe(DEFAULT_SNIFF_CAP)
    })

    it('maps 0 to DEFAULT_SNIFF_CAP instead of the C++ "no ceiling" mode', () => {
        const { ctx, searchReaderByContent } = makeCtx(PDB_READERS, () => 'mmcif')
        pickReaderName(ctx, '/x/foo.cif', true, 0)
        expect(ceilingOfFirstCall(searchReaderByContent)).toBe(DEFAULT_SNIFF_CAP)
    })

    it('forwards an explicit positive ceiling unchanged (content-first and ext-first)', () => {
        const a = makeCtx(PDB_READERS, () => 'mmcif')
        pickReaderName(a.ctx, '/x/foo.cif', true, 4096)
        expect(ceilingOfFirstCall(a.searchReaderByContent)).toBe(4096)

        const b = makeCtx(PDB_READERS, () => 'mmcif')
        pickReaderName(b.ctx, '/x/foo.cif', false, 4096)
        expect(ceilingOfFirstCall(b.searchReaderByContent)).toBe(4096)
    })

    it('DEFAULT_SNIFF_CAP is large enough for a marker several hundred KB in', () => {
        expect(DEFAULT_SNIFF_CAP).toBeGreaterThanOrEqual(1 << 20)
    })
})

/**
 * Readers declare multi-dot extensions -- the PDB reader's fext is
 * "*.pdb; *.ent; *.pdb.gz". Reducing the path to its last dot-segment turned
 * "znub.pdb.gz" into "gz", which matched no reader, so the ext-first branch
 * returned "" and the open failed with "could not determine a compatible
 * reader". It only surfaced once inferContentFirst started routing such files
 * here instead of to the content sniff.
 */
describe('pickReaderName -- multi-dot extensions', () => {
    const GZ_READERS: ReaderInfo[] = [
        { name: 'pdb', fext: '*.pdb;*.ent;*.pdb.gz', category: 0 },
        { name: 'mmcif', fext: '*.cif;*.cif.gz', category: 0 },
    ]

    it('resolves a .pdb.gz to the PDB reader without sniffing', () => {
        const { ctx, searchReaderByContent } = makeCtx(GZ_READERS, () => '')
        expect(pickReaderName(ctx, '/x/znub.pdb.gz', false)).toBe('pdb')
        expect(searchReaderByContent).not.toHaveBeenCalled()
    })

    it('resolves a .cif.gz to the mmCIF reader', () => {
        const { ctx } = makeCtx(GZ_READERS, () => '')
        expect(pickReaderName(ctx, '/x/znub.cif.gz', false)).toBe('mmcif')
    })

    it('still resolves a plain .pdb', () => {
        const { ctx } = makeCtx(GZ_READERS, () => '')
        expect(pickReaderName(ctx, '/x/znub.pdb', false)).toBe('pdb')
    })

    it('prefers the most specific extension when two readers overlap', () => {
        // A generic gzip reader must not win over the one claiming pdb.gz.
        const readers: ReaderInfo[] = [
            ...GZ_READERS,
            { name: 'anygz', fext: '*.gz', category: 0 },
        ]
        const { ctx, searchReaderByContent } = makeCtx(readers, () => '')
        expect(pickReaderName(ctx, '/x/znub.pdb.gz', false)).toBe('pdb')
        expect(searchReaderByContent).not.toHaveBeenCalled()
    })

    it('returns "" for an extension no reader claims', () => {
        const { ctx } = makeCtx(GZ_READERS, () => '')
        expect(pickReaderName(ctx, '/x/znub.xyz', false)).toBe('')
    })
})
