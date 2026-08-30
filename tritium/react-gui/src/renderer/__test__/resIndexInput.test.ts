/**
 * Tests for `resolveResIndexInput` (Change residue index dialog input rules).
 * Pins the UXP `chg_resindex.js` validation branches.
 */

import { describe, it, expect } from 'vitest'
import { resolveResIndexInput } from '@renderer/dialogs/resIndexInput'

describe('resolveResIndexInput', () => {
    it('rejects a non-numeric value in shift mode', () => {
        expect(resolveResIndexInput('shift', 'abc').kind).toBe('invalid')
    })

    it('rejects a non-numeric value in start mode', () => {
        expect(resolveResIndexInput('start', '').kind).toBe('invalid')
    })

    it('rejects a zero shift', () => {
        const r = resolveResIndexInput('shift', '0')
        expect(r.kind).toBe('invalid')
    })

    it('accepts a non-zero shift (including negative)', () => {
        expect(resolveResIndexInput('shift', '5')).toEqual({ kind: 'ok', value: 5 })
        expect(resolveResIndexInput('shift', '-3')).toEqual({ kind: 'ok', value: -3 })
    })

    it('accepts a zero start (start of 0 is valid)', () => {
        expect(resolveResIndexInput('start', '0')).toEqual({ kind: 'ok', value: 0 })
    })

    it('accepts an in-range start number', () => {
        expect(resolveResIndexInput('start', '100')).toEqual({ kind: 'ok', value: 100 })
    })

    it('warns when a start number exceeds 4 digits', () => {
        const r = resolveResIndexInput('start', '10000')
        expect(r.kind).toBe('pdb-warn')
        expect(r).toMatchObject({ value: 10000 })
    })

    it('warns when a start number is below -999', () => {
        expect(resolveResIndexInput('start', '-1000').kind).toBe('pdb-warn')
    })

    it('parses surrounding/trailing characters like parseInt', () => {
        expect(resolveResIndexInput('start', '42abc')).toEqual({ kind: 'ok', value: 42 })
    })
})
