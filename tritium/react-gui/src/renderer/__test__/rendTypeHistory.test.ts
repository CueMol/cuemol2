/**
 * Pin contract for fopen-opt-dlgs/rendTypeHistory.ts.
 *
 * Mirrors UXP `pref.get/set("cuemol2.ui.histories.new_renderer_type" + obj_type)`
 * semantics on top of localStorage: per-objType last-used renderer type,
 * resilient to corrupt JSON, and a no-op on empty keys/values.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
    STORAGE_KEY,
    getDefaultRendType,
    setDefaultRendType,
    clearRendTypeHistory,
} from '../components/fopen-opt-dlgs/rendTypeHistory'

describe('rendTypeHistory', () => {
    beforeEach(() => {
        globalThis.localStorage.clear()
    })

    it('returns undefined when storage is empty', () => {
        expect(getDefaultRendType('MolCoord')).toBeUndefined()
    })

    it('round-trips a value per objType', () => {
        setDefaultRendType('MolCoord', 'ribbon')
        expect(getDefaultRendType('MolCoord')).toBe('ribbon')
    })

    it('keeps entries for different objTypes independent', () => {
        setDefaultRendType('MolCoord', 'ribbon')
        setDefaultRendType('DensityMap', 'contour')
        expect(getDefaultRendType('MolCoord')).toBe('ribbon')
        expect(getDefaultRendType('DensityMap')).toBe('contour')
    })

    it('overwrites the existing value for the same objType', () => {
        setDefaultRendType('MolCoord', 'ribbon')
        setDefaultRendType('MolCoord', 'cartoon')
        expect(getDefaultRendType('MolCoord')).toBe('cartoon')
    })

    it('returns undefined when stored JSON is corrupt', () => {
        globalThis.localStorage.setItem(STORAGE_KEY, 'not-json')
        expect(getDefaultRendType('MolCoord')).toBeUndefined()
    })

    it('returns undefined when stored payload is not a plain object', () => {
        globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(['ribbon']))
        expect(getDefaultRendType('MolCoord')).toBeUndefined()
    })

    it('returns undefined for an objType key whose stored value is not a string', () => {
        globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify({ MolCoord: 123 }))
        expect(getDefaultRendType('MolCoord')).toBeUndefined()
    })

    it('set is a no-op when objType is empty', () => {
        setDefaultRendType('', 'ribbon')
        expect(globalThis.localStorage.getItem(STORAGE_KEY)).toBeNull()
    })

    it('set is a no-op when rendType is empty', () => {
        setDefaultRendType('MolCoord', '')
        expect(globalThis.localStorage.getItem(STORAGE_KEY)).toBeNull()
    })

    it('clearRendTypeHistory removes the storage entry', () => {
        setDefaultRendType('MolCoord', 'ribbon')
        clearRendTypeHistory()
        expect(getDefaultRendType('MolCoord')).toBeUndefined()
    })
})
