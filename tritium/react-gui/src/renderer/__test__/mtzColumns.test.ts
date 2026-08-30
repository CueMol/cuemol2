/**
 * Tests for computeMtzDefaults (default MTZ column selection).
 *
 * Pins the UXP selectDefaultColumns conventions: PHENIX, REFMAC5, SIGMAA,
 * RESOLVE, DM patterns plus the first-column fallback and the phase/weight
 * checkbox defaults.
 */
import { describe, it, expect } from 'vitest'
import { computeMtzDefaults } from '@renderer/dialogs/fopen-opt-dlgs/mtzColumns'
import type { MtzColumn } from '@renderer/worker/server/services/getMtzColumnInfo.service'

const col = (name: string, type: string): MtzColumn => ({ name, type })

describe('computeMtzDefaults', () => {
    it('PHENIX: picks 2FOFCWT / PH2FOFCWT, phase on, weight off', () => {
        const cols = [col('2FOFCWT', 'F'), col('PH2FOFCWT', 'P'), col('FOFCWT', 'F')]
        expect(computeMtzDefaults(cols)).toEqual({
            columnF: '2FOFCWT', columnPhi: 'PH2FOFCWT', columnW: '',
            phaseEnabled: true, weightEnabled: false,
        })
    })

    it('REFMAC5: picks FWT / PHWT', () => {
        const cols = [col('FWT', 'F'), col('PHWT', 'P')]
        expect(computeMtzDefaults(cols)).toMatchObject({ columnF: 'FWT', columnPhi: 'PHWT' })
    })

    it('SIGMAA: FWT / PHIC when PHWT absent', () => {
        const cols = [col('FWT', 'F'), col('PHIC', 'P')]
        expect(computeMtzDefaults(cols)).toMatchObject({ columnF: 'FWT', columnPhi: 'PHIC' })
    })

    it('RESOLVE: FP / PHIM / FOMM with weight enabled', () => {
        const cols = [col('FP', 'F'), col('PHIM', 'P'), col('FOMM', 'W')]
        expect(computeMtzDefaults(cols)).toEqual({
            columnF: 'FP', columnPhi: 'PHIM', columnW: 'FOMM',
            phaseEnabled: true, weightEnabled: true,
        })
    })

    it('DM: FDM / PHIDM / FOMDM with weight enabled', () => {
        const cols = [col('FDM', 'F'), col('PHIDM', 'P'), col('FOMDM', 'W')]
        expect(computeMtzDefaults(cols)).toEqual({
            columnF: 'FDM', columnPhi: 'PHIDM', columnW: 'FOMDM',
            phaseEnabled: true, weightEnabled: true,
        })
    })

    it('no known pattern: falls back to first column of each type', () => {
        const cols = [col('MYF', 'F'), col('MYP', 'P'), col('MYW', 'W')]
        expect(computeMtzDefaults(cols)).toEqual({
            columnF: 'MYF', columnPhi: 'MYP', columnW: 'MYW',
            phaseEnabled: true, weightEnabled: false,
        })
    })

    it('no phase columns: phaseEnabled false, columnPhi empty', () => {
        const cols = [col('MYF', 'F')]
        expect(computeMtzDefaults(cols)).toEqual({
            columnF: 'MYF', columnPhi: '', columnW: '',
            phaseEnabled: false, weightEnabled: false,
        })
    })

    it('empty column list: all empty, both checkboxes off', () => {
        expect(computeMtzDefaults([])).toEqual({
            columnF: '', columnPhi: '', columnW: '',
            phaseEnabled: false, weightEnabled: false,
        })
    })
})
