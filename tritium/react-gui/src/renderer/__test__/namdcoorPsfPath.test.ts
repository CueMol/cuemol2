/**
 * Tests for the NAMD coordinate option dialog's PSF path helpers:
 *   - deriveDefaultPsfPath: coord path -> .psf path (UXP splitFileName + .psf).
 *   - psfPathHistory: localStorage-backed last-used path round-trip.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { deriveDefaultPsfPath } from '@renderer/dialogs/fopen-opt-dlgs/types'
import { getLastPsfPath, setLastPsfPath, STORAGE_KEY } from '@renderer/dialogs/fopen-opt-dlgs/psfPathHistory'
import {
    getLastCoordPath,
    setLastCoordPath,
    STORAGE_KEY as COORD_STORAGE_KEY,
} from '@renderer/dialogs/fopen-opt-dlgs/coordPathHistory'

describe('deriveDefaultPsfPath', () => {
    it('replaces a .coor extension with .psf', () => {
        expect(deriveDefaultPsfPath('/data/run.coor')).toBe('/data/run.psf')
    })

    it('replaces any final extension with .psf', () => {
        expect(deriveDefaultPsfPath('/data/run.namdbin')).toBe('/data/run.psf')
    })

    it('appends .psf when there is no extension', () => {
        expect(deriveDefaultPsfPath('/data/run')).toBe('/data/run.psf')
    })

    it('only strips the final extension, not dots in the directory', () => {
        expect(deriveDefaultPsfPath('/data.v2/run.coor')).toBe('/data.v2/run.psf')
    })

    it('returns empty string for empty input', () => {
        expect(deriveDefaultPsfPath('')).toBe('')
    })
})

describe('psfPathHistory', () => {
    beforeEach(() => {
        localStorage.removeItem(STORAGE_KEY)
    })

    it('returns undefined when nothing stored', () => {
        expect(getLastPsfPath()).toBeUndefined()
    })

    it('round-trips a stored path', () => {
        setLastPsfPath('/data/run.psf')
        expect(getLastPsfPath()).toBe('/data/run.psf')
    })

    it('ignores an empty set', () => {
        setLastPsfPath('')
        expect(getLastPsfPath()).toBeUndefined()
    })
})

describe('coordPathHistory (AMBER)', () => {
    beforeEach(() => {
        localStorage.removeItem(COORD_STORAGE_KEY)
    })

    it('returns undefined when nothing stored', () => {
        expect(getLastCoordPath()).toBeUndefined()
    })

    it('round-trips a stored coord path', () => {
        setLastCoordPath('/data/system.rst7')
        expect(getLastCoordPath()).toBe('/data/system.rst7')
    })

    it('ignores an empty set', () => {
        setLastCoordPath('')
        expect(getLastCoordPath()).toBeUndefined()
    })
})
