/**
 * Contract tests for applyReaderOptions (worker helper).
 *
 * Pins the UXP-derived mapping from the file-open dialog's format options
 * onto concrete reader properties (uxp_gui/.../fopen-*opt-page ondlgok):
 *   - pdb / mmcif: per-property names, including the mmcif divergence
 *     (build2ndry -> loadsecstr = !build2ndry, no loadsegid).
 *   - mtzmap / ccp4map: column + numeric props.
 *   - msms: vertex_file (skipped when empty).
 *   - namdcoor: setSubPath('topo', psf) method, not a property.
 *   - unknown / mismatched nickname: no-op.
 *
 * The reader is a plain object whose property writes are observable; a
 * mismatch between the resolved nickname and format.kind must touch nothing.
 */
import { describe, it, expect, vi } from 'vitest'
import type { ObjReader } from '@cuemol/core/src/wrappers/ObjReader'
import type { FormatOptions } from '../components/fopen-opt-dlgs/types'
import { applyReaderOptions } from '../worker/server/services/helpers/applyReaderOptions'

function makeReader() {
    const setSubPath = vi.fn()
    const reader = { setSubPath } as Record<string, unknown> & { setSubPath: typeof setSubPath }
    return { reader, setSubPath }
}

const pdbFmt: FormatOptions = {
    kind: 'pdb',
    options: {
        loadModel: true, loadAnisou: true, loadAltConf: false,
        loadSegid: true, build2ndry: false, autoTopology: true,
    },
}

describe('applyReaderOptions', () => {
    it('pdb: maps every option to its reader property name', () => {
        const { reader } = makeReader()
        applyReaderOptions(reader as unknown as ObjReader, 'pdb', pdbFmt)
        expect(reader).toMatchObject({
            loadmodel: true,
            loadanisou: true,
            loadaltconf: false,
            loadsegid: true,
            build2ndry: false,
            autoTopoGen: true,
        })
    })

    it('mmcif: build2ndry inverts to loadsecstr and loadsegid is NOT wired', () => {
        const { reader } = makeReader()
        const fmt: FormatOptions = {
            kind: 'mmcif',
            options: {
                loadModel: true, loadAnisou: false, loadAltConf: true,
                loadSegid: true, build2ndry: true, autoTopology: false,
            },
        }
        applyReaderOptions(reader as unknown as ObjReader, 'mmcif', fmt)
        expect(reader).toMatchObject({
            loadmodel: true,
            loadanisou: false,
            loadaltconf: true,
            autoTopoGen: false,
            loadsecstr: false,  // = !build2ndry
        })
        expect('loadsegid' in reader).toBe(false)
        expect('build2ndry' in reader).toBe(false)
    })

    it('mtzmap: maps columns, resolution and grid (phase on, weight off)', () => {
        const { reader } = makeReader()
        const fmt: FormatOptions = {
            kind: 'mtz',
            options: {
                columnF: 'FWT', columnPhi: 'PHWT', phaseEnabled: true,
                columnW: 'FOM', weightEnabled: false,
                resolutionLimit: 2.5, gridSpacing: 0.25,
            },
        }
        applyReaderOptions(reader as unknown as ObjReader, 'mtzmap', fmt)
        expect(reader).toMatchObject({
            clmn_F: 'FWT', clmn_PHI: 'PHWT',
            clmn_WT: '',  // weight disabled -> empty
            resolution: 2.5, gridsize: 0.25,
        })
    })

    it('mtzmap: phase disabled -> clmn_PHI empty; weight enabled -> clmn_WT set', () => {
        const { reader } = makeReader()
        const fmt: FormatOptions = {
            kind: 'mtz',
            options: {
                columnF: 'FP', columnPhi: 'PHIM', phaseEnabled: false,
                columnW: 'FOMM', weightEnabled: true,
                resolutionLimit: 0, gridSpacing: 0.333333,
            },
        }
        applyReaderOptions(reader as unknown as ObjReader, 'mtzmap', fmt)
        expect(reader).toMatchObject({
            clmn_F: 'FP', clmn_PHI: '', clmn_WT: 'FOMM',
        })
    })

    it('ccp4map: maps normalize + truncate enable/value pairs', () => {
        const { reader } = makeReader()
        const fmt: FormatOptions = {
            kind: 'ccp4map',
            options: {
                normalize: true,
                truncateMinEnabled: true, truncateMin: -4,
                truncateMaxEnabled: false, truncateMax: 6,
            },
        }
        applyReaderOptions(reader as unknown as ObjReader, 'ccp4map', fmt)
        expect(reader).toMatchObject({
            normalize: true,
            truncate_min: true, min: -4,
            truncate_max: false, max: 6,
        })
    })

    it('msms: sets vertex_file when present', () => {
        const { reader } = makeReader()
        const fmt: FormatOptions = { kind: 'msms', options: { vertFilePath: '/data/x.vert' } }
        applyReaderOptions(reader as unknown as ObjReader, 'msms', fmt)
        expect(reader.vertex_file).toBe('/data/x.vert')
    })

    it('msms: skips vertex_file when empty', () => {
        const { reader } = makeReader()
        const fmt: FormatOptions = { kind: 'msms', options: { vertFilePath: '' } }
        applyReaderOptions(reader as unknown as ObjReader, 'msms', fmt)
        expect('vertex_file' in reader).toBe(false)
    })

    it('namdcoor: wires PSF via setSubPath("topo", path)', () => {
        const { reader, setSubPath } = makeReader()
        const fmt: FormatOptions = { kind: 'namdcoor', options: { psfFilePath: '/data/x.psf' } }
        applyReaderOptions(reader as unknown as ObjReader, 'namdcoor', fmt)
        expect(setSubPath).toHaveBeenCalledWith('topo', '/data/x.psf')
    })

    it('namdcoor: skips setSubPath when psf path empty', () => {
        const { reader, setSubPath } = makeReader()
        const fmt: FormatOptions = { kind: 'namdcoor', options: { psfFilePath: '' } }
        applyReaderOptions(reader as unknown as ObjReader, 'namdcoor', fmt)
        expect(setSubPath).not.toHaveBeenCalled()
    })

    it('amberprm: wires coord via setSubPath("coord", path)', () => {
        const { reader, setSubPath } = makeReader()
        const fmt: FormatOptions = { kind: 'amberprm', options: { coordFilePath: '/data/x.rst7' } }
        applyReaderOptions(reader as unknown as ObjReader, 'amberprm', fmt)
        expect(setSubPath).toHaveBeenCalledWith('coord', '/data/x.rst7')
    })

    it('amberprm: skips setSubPath when coord path empty (topology-only)', () => {
        const { reader, setSubPath } = makeReader()
        const fmt: FormatOptions = { kind: 'amberprm', options: { coordFilePath: '' } }
        applyReaderOptions(reader as unknown as ObjReader, 'amberprm', fmt)
        expect(setSubPath).not.toHaveBeenCalled()
    })

    it('unknown format: no-op', () => {
        const { reader } = makeReader()
        applyReaderOptions(reader as unknown as ObjReader, 'pdb', { kind: 'unknown', options: {} })
        // Only the setSubPath stub should remain; no option property written.
        expect(Object.keys(reader)).toEqual(['setSubPath'])
    })

    it('nickname / format.kind mismatch: no-op (safe)', () => {
        const { reader } = makeReader()
        // resolved reader is mtzmap but the dialog carried pdb options.
        applyReaderOptions(reader as unknown as ObjReader, 'mtzmap', pdbFmt)
        expect(Object.keys(reader)).toEqual(['setSubPath'])
    })
})
