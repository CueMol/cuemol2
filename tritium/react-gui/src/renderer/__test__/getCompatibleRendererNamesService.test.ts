/**
 * Pin getCompatibleRendererNames service contract:
 *  - explicit readerName branch: bypass getInfoJSON2 and call createHandler(readerName, 0)
 *  - extension-fallback branch: scan getInfoJSON2 by ext, first hit wins
 *
 * Specifically pins the ".cif ambiguity" case: mmcifmap (structure factor)
 * and mmcif (coord) both register .cif. Without an explicit readerName,
 * extension lookup picks the first JSON entry — when that entry is mmcifmap,
 * a coord PDB is mis-typed as a density map. Get PDB passes readerName to
 * defeat this.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { WorkerContext } from '../worker/server/types/WorkerContext'
import { services } from '../worker/server/services/getCompatibleRendererNames.service'

const { getCompatibleRendererNames } = services

interface FakeReaderHandle {
    name: string;
    setPath: ReturnType<typeof vi.fn>;
    createDefaultObj: () => {
        searchCompatibleRendererNames: () => string;
        getClassName?: () => string | undefined;
    } | null;
}

function makeEnv(opts: {
    /** Reader name to renderer-types mapping. mmcif → coord renderers, mmcifmap → density. */
    readerRendTypes: Record<string, string>;
    /** Reader info JSON used by ext fallback. Order matters (first hit wins). */
    info: Array<{ name: string; fext: string; category: number }>;
    /** Optional reader name → object class name (returned by tmpObj.getClassName()). */
    readerClassNames?: Record<string, string | undefined>;
}) {
    const createHandler = vi.fn((name: string, _cat: number): FakeReaderHandle => ({
        name,
        setPath: vi.fn(),
        createDefaultObj: () => ({
            searchCompatibleRendererNames: () => opts.readerRendTypes[name] ?? '',
            getClassName: () => opts.readerClassNames?.[name],
        }),
    }))
    const getInfoJSON2 = vi.fn(() => JSON.stringify(opts.info))

    const ctx = {
        strMgr: { createHandler, getInfoJSON2 },
    } as unknown as WorkerContext

    return { ctx, createHandler, getInfoJSON2 }
}

describe('getCompatibleRendererNames — explicit readerName branch', () => {
    beforeEach(() => { vi.clearAllMocks() })

    it('uses createHandler(readerName, 0) directly without consulting getInfoJSON2', () => {
        const env = makeEnv({
            readerRendTypes: { mmcif: 'simple,cartoon,tube,ribbon' },
            readerClassNames: { mmcif: 'MolCoord' },
            info: [],
        })
        const result = getCompatibleRendererNames(env.ctx, {
            filePath: '1mbn.cif',
            readerName: 'mmcif',
        })

        expect(env.getInfoJSON2).not.toHaveBeenCalled()
        expect(env.createHandler).toHaveBeenCalledTimes(1)
        expect(env.createHandler).toHaveBeenCalledWith('mmcif', 0)
        expect(result).toEqual({
            types: ['simple', 'cartoon', 'tube', 'ribbon'],
            objType: 'MolCoord',
        })
    })

    it('filters out test-renderers and *-prefixed special entries', () => {
        const env = makeEnv({
            readerRendTypes: { mmcif: 'simple,*selection,ms2test,symm,cartoon' },
            readerClassNames: { mmcif: 'MolCoord' },
            info: [],
        })
        const result = getCompatibleRendererNames(env.ctx, {
            filePath: '1mbn.cif',
            readerName: 'mmcif',
        })
        expect(result).toEqual({ types: ['simple', 'cartoon'], objType: 'MolCoord' })
    })

    it('returns empty objType when tmpObj.getClassName() is undefined', () => {
        const env = makeEnv({
            readerRendTypes: { mmcif: 'simple,cartoon' },
            readerClassNames: { mmcif: undefined },
            info: [],
        })
        const result = getCompatibleRendererNames(env.ctx, {
            filePath: '1mbn.cif',
            readerName: 'mmcif',
        })
        expect(result).toEqual({ types: ['simple', 'cartoon'], objType: '' })
    })
})

describe('getCompatibleRendererNames — extension fallback branch', () => {
    beforeEach(() => { vi.clearAllMocks() })

    it('looks up reader by extension when readerName is omitted', () => {
        const env = makeEnv({
            readerRendTypes: { pdb: 'simple,cartoon' },
            readerClassNames: { pdb: 'MolCoord' },
            info: [
                { name: 'pdb', fext: '*.pdb;*.ent', category: 0 },
            ],
        })
        const result = getCompatibleRendererNames(env.ctx, { filePath: '/x/foo.pdb' })
        expect(env.getInfoJSON2).toHaveBeenCalled()
        expect(env.createHandler).toHaveBeenCalledWith('pdb', 0)
        expect(result).toEqual({ types: ['simple', 'cartoon'], objType: 'MolCoord' })
    })

    it('returns empty types and empty objType when no reader matches the extension', () => {
        const env = makeEnv({
            readerRendTypes: {},
            info: [{ name: 'pdb', fext: '*.pdb', category: 0 }],
        })
        const result = getCompatibleRendererNames(env.ctx, { filePath: '/x/unknown.xyz' })
        expect(result).toEqual({ types: [], objType: '' })
    })

    it('respects category filter (only OBJECT_READER, category=0)', () => {
        const env = makeEnv({
            readerRendTypes: { mmcif: 'simple,cartoon' },
            readerClassNames: { mmcif: 'MolCoord' },
            info: [
                { name: 'mmcifWriter', fext: '*.cif', category: 1 }, // wrong category
                { name: 'mmcif',        fext: '*.cif', category: 0 },
            ],
        })
        const result = getCompatibleRendererNames(env.ctx, { filePath: '1mbn.cif' })
        expect(env.createHandler).toHaveBeenCalledWith('mmcif', 0)
        expect(result).toEqual({ types: ['simple', 'cartoon'], objType: 'MolCoord' })
    })
})

describe('getCompatibleRendererNames — .cif ambiguity (regression)', () => {
    beforeEach(() => { vi.clearAllMocks() })

    // Set up the JSON so mmcifmap (structure factor → density map) appears
    // BEFORE mmcif (coord). This is the configuration that causes the bug
    // observed in production.
    const ambiguousInfo = [
        { name: 'mmcifmap', fext: '*.cif', category: 0 },
        { name: 'mmcif',    fext: '*.cif', category: 0 },
    ]
    const rendTypes = {
        mmcif:    'simple,cartoon,tube,ribbon',
        mmcifmap: 'contour,isosurf',
    }

    const classNames = { mmcif: 'MolCoord', mmcifmap: 'DensityMap' }

    it('without readerName: extension lookup picks the first JSON hit (mmcifmap)', () => {
        const env = makeEnv({ readerRendTypes: rendTypes, readerClassNames: classNames, info: ambiguousInfo })
        const result = getCompatibleRendererNames(env.ctx, { filePath: '1mbn.cif' })
        expect(env.createHandler).toHaveBeenCalledWith('mmcifmap', 0)
        expect(result).toEqual({ types: ['contour', 'isosurf'], objType: 'DensityMap' })
    })

    it('with readerName="mmcif": explicit override defeats the ambiguity', () => {
        const env = makeEnv({ readerRendTypes: rendTypes, readerClassNames: classNames, info: ambiguousInfo })
        const result = getCompatibleRendererNames(env.ctx, {
            filePath: '1mbn.cif',
            readerName: 'mmcif',
        })
        expect(env.createHandler).toHaveBeenCalledWith('mmcif', 0)
        expect(result).toEqual({ types: ['simple', 'cartoon', 'tube', 'ribbon'], objType: 'MolCoord' })
    })
})
