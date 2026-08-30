/**
 * Pin getCompatibleRendererNames service contract:
 *  - explicit readerName branch: bypass getInfoJSON2 and call createHandler(readerName, 0)
 *  - extension-fallback branch: scan getInfoJSON2 by ext, first hit wins
 *
 * and the renderer-type filtering: the synthetic / test / legacy types are
 * dropped, and so is one that would come up empty on an object nothing has
 * been drawn on or measured in yet.
 *
 * Specifically pins the ".cif ambiguity" case: mmcifmap (structure factor)
 * and mmcif (coord) both register .cif. Without an explicit readerName,
 * extension lookup picks the first JSON entry -- when that entry is mmcifmap,
 * a coord PDB is mis-typed as a density map. Get PDB passes readerName to
 * defeat this.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import { services } from '@renderer/worker/server/services/getCompatibleRendererNames.service'
import { DEFAULT_SNIFF_CAP } from '@renderer/worker/shared/sniffConfig'

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
    /** Reader name to renderer-types mapping. mmcif -> coord renderers, mmcifmap -> density. */
    readerRendTypes: Record<string, string>;
    /** Reader info JSON used by ext fallback. Order matters (first hit wins). */
    info: Array<{ name: string; fext: string; category: number }>;
    /** Optional reader name -> object class name (returned by tmpObj.getClassName()). */
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
    const searchReaderByContent = vi.fn(() => (opts as { sniffResult?: string }).sniffResult ?? '')

    const ctx = {
        strMgr: { createHandler, getInfoJSON2, searchReaderByContent },
    } as unknown as WorkerContext

    return { ctx, createHandler, getInfoJSON2, searchReaderByContent }
}

describe('getCompatibleRendererNames — explicit readerName branch', () => {
    beforeEach(() => { vi.clearAllMocks() })

    it('hides legacy renderer types (gpu_mapmesh) from the density-map type list', () => {
        const env = makeEnv({
            readerRendTypes: { ccp4map: 'contour,isosurf,gpu_mapmesh,gpu_mapvol,*unitcell' },
            readerClassNames: { ccp4map: 'DensityMap' },
            info: [],
        })
        const result = getCompatibleRendererNames(env.ctx, {
            filePath: 'emd_11668.map',
            readerName: 'ccp4map',
        })
        expect(result.types).toEqual(['contour', 'isosurf', 'gpu_mapvol'])
    })

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
            readerName: 'mmcif',
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
        expect(result).toEqual({ types: ['simple', 'cartoon'], objType: 'MolCoord', readerName: 'mmcif' })
    })

    it('does not offer a renderer that would come up empty on a new object', () => {
        // A disorder overlay follows a main-chain renderer and an atomintr
        // draws measurements; the object being read has neither yet, so both
        // would draw nothing. They stay available from the add-renderer
        // dialog once there is something for them to work with.
        const env = makeEnv({
            readerRendTypes: { mmcif: 'simple,disorder,atomintr,cartoon' },
            readerClassNames: { mmcif: 'MolCoord' },
            info: [],
        })
        const result = getCompatibleRendererNames(env.ctx, {
            filePath: '1mbn.cif',
            readerName: 'mmcif',
        })
        expect(result.types).toEqual(['simple', 'cartoon'])
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
        expect(result).toEqual({ types: ['simple', 'cartoon'], objType: '', readerName: 'mmcif' })
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
        expect(result).toEqual({ types: ['simple', 'cartoon'], objType: 'MolCoord', readerName: 'pdb' })
    })

    it('returns empty types and empty objType when no reader matches the extension', () => {
        const env = makeEnv({
            readerRendTypes: {},
            info: [{ name: 'pdb', fext: '*.pdb', category: 0 }],
        })
        const result = getCompatibleRendererNames(env.ctx, { filePath: '/x/unknown.xyz' })
        expect(result).toEqual({ types: [], objType: '', readerName: '' })
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
        expect(result).toEqual({ types: ['simple', 'cartoon'], objType: 'MolCoord', readerName: 'mmcif' })
    })
})

describe('getCompatibleRendererNames — .cif ambiguity (regression)', () => {
    beforeEach(() => { vi.clearAllMocks() })

    // Set up the JSON so mmcifmap (structure factor -> density map) appears
    // BEFORE mmcif (coord). Under the old extension-only logic this
    // produced the contour-renderer-for-coordinate-CIF bug.
    const ambiguousInfo = [
        { name: 'mmcifmap', fext: '*.cif', category: 0 },
        { name: 'mmcif',    fext: '*.cif', category: 0 },
    ]
    const rendTypes = {
        mmcif:    'simple,cartoon,tube,ribbon',
        mmcifmap: 'contour,isosurf',
    }

    const classNames = { mmcif: 'MolCoord', mmcifmap: 'DensityMap' }

    // Ext-first mode (default): the two candidates share the extension,
    // so the service must consult the C++ sniffer (searchReaderByContent)
    // with the candidate list, and use the verdict instead of the first
    // JSON hit.
    it('ext-first mode: sniff verdict overrides JSON-order first hit', () => {
        const env = makeEnv({
            readerRendTypes: rendTypes,
            readerClassNames: classNames,
            info: ambiguousInfo,
            sniffResult: 'mmcif',  // canHandleContent disambiguation hit
        } as never)
        const result = getCompatibleRendererNames(env.ctx, { filePath: '1mbn.cif' })
        expect(env.searchReaderByContent).toHaveBeenCalledWith('1mbn.cif', 'mmcifmap,mmcif', 0, false, DEFAULT_SNIFF_CAP)
        expect(env.createHandler).toHaveBeenCalledWith('mmcif', 0)
        expect(result).toEqual({ types: ['simple', 'cartoon', 'tube', 'ribbon'], objType: 'MolCoord', readerName: 'mmcif' })
    })

    // When the sniffer returns empty (e.g. header too short, both readers
    // returned UNKNOWN), fall back to the first extension-matched candidate
    // so the load still has a chance to proceed.
    it('ext-first mode: sniff empty -> falls back to first candidate', () => {
        const env = makeEnv({
            readerRendTypes: rendTypes,
            readerClassNames: classNames,
            info: ambiguousInfo,
            sniffResult: '',
        } as never)
        const result = getCompatibleRendererNames(env.ctx, { filePath: '1mbn.cif' })
        expect(env.createHandler).toHaveBeenCalledWith('mmcifmap', 0)
        expect(result).toEqual({ types: ['contour', 'isosurf'], objType: 'DensityMap', readerName: 'mmcifmap' })
    })

    // Content-first mode: the extension is ignored entirely; the sniffer is
    // called with the CSV of every user-facing reader in the category (qdf*
    // internal readers excluded so they can never win the sniff).
    it('content-first mode: sniff over all user-facing readers drives the choice', () => {
        const env = makeEnv({
            readerRendTypes: rendTypes,
            readerClassNames: classNames,
            info: ambiguousInfo,
            sniffResult: 'mmcif',
        } as never)
        const result = getCompatibleRendererNames(env.ctx, {
            filePath: '1mbn.cif',
            contentFirst: true,
        })
        expect(env.searchReaderByContent).toHaveBeenCalledWith('1mbn.cif', 'mmcifmap,mmcif', 0, false, DEFAULT_SNIFF_CAP)
        expect(env.createHandler).toHaveBeenCalledWith('mmcif', 0)
        expect(result).toEqual({ types: ['simple', 'cartoon', 'tube', 'ribbon'], objType: 'MolCoord', readerName: 'mmcif' })
    })

    it('with readerName="mmcif": explicit override skips the lookup entirely', () => {
        const env = makeEnv({ readerRendTypes: rendTypes, readerClassNames: classNames, info: ambiguousInfo })
        const result = getCompatibleRendererNames(env.ctx, {
            filePath: '1mbn.cif',
            readerName: 'mmcif',
        })
        expect(env.searchReaderByContent).not.toHaveBeenCalled()
        expect(env.createHandler).toHaveBeenCalledWith('mmcif', 0)
        expect(result).toEqual({ types: ['simple', 'cartoon', 'tube', 'ribbon'], objType: 'MolCoord', readerName: 'mmcif' })
    })
})
