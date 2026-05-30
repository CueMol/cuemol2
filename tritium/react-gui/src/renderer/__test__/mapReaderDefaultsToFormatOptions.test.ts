/**
 * Degrade-detection tests for `mapReaderDefaultsToFormatOptions`.
 *
 * This pure mapping is the single translation from C++ reader property names
 * to the file-open dialog's option fields. Pinning it guards the topology
 * regression (autoTopoGen -> autoTopology) and the mmCIF build2ndry inversion
 * (build2ndry = !loadsecstr), which are easy to get wrong silently.
 */
import { describe, it, expect } from 'vitest'
import { mapReaderDefaultsToFormatOptions } from '../components/fopen-opt-dlgs/types'

describe('mapReaderDefaultsToFormatOptions', () => {
    it('maps PDB reader props 1:1 onto dialog fields (autoTopoGen -> autoTopology)', () => {
        const res = mapReaderDefaultsToFormatOptions('pdb', {
            loadmodel: false, loadanisou: true, loadaltconf: true,
            loadsegid: false, build2ndry: true, autoTopoGen: true,
        })
        expect(res).toEqual({
            kind: 'pdb',
            options: {
                loadModel: false, loadAnisou: true, loadAltConf: true,
                loadSegid: false, build2ndry: true, autoTopology: true,
            },
        })
    })

    it('inverts loadsecstr to build2ndry for mmCIF and has no loadSegid prop', () => {
        const res = mapReaderDefaultsToFormatOptions('mmcif', {
            loadmodel: false, loadanisou: true, loadaltconf: true,
            loadsecstr: false, autoTopoGen: true,
        })
        expect(res).toEqual({
            kind: 'mmcif',
            options: {
                loadModel: false, loadAnisou: true, loadAltConf: true,
                loadSegid: false, build2ndry: true, autoTopology: true,
            },
        })
        // loadsecstr=true -> recompute disabled (build2ndry=false).
        const res2 = mapReaderDefaultsToFormatOptions('mmcif', { loadsecstr: true })
        expect((res2 as { options: { build2ndry: boolean } }).options.build2ndry).toBe(false)
    })

    it('maps CCP4 map reader props onto dialog fields', () => {
        const res = mapReaderDefaultsToFormatOptions('ccp4map', {
            normalize: false, truncate_min: false, min: 0, truncate_max: false, max: 5,
        })
        expect(res).toEqual({
            kind: 'ccp4map',
            options: {
                normalize: false, truncateMinEnabled: false, truncateMin: 0,
                truncateMaxEnabled: false, truncateMax: 5,
            },
        })
    })
})
