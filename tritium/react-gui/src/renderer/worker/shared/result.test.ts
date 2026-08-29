/**
 * @file worker/shared/result.test.ts
 * @description Pins the wire shape of a service result.
 */

import { describe, it, expect } from 'vitest'
import { ok, fail, failFrom, isOk, type Result } from './result'

describe('ok', () => {
    it('is a bare success with no data', () => {
        expect(ok()).toEqual({ ok: true })
    })

    it('spreads data beside the flag', () => {
        expect(ok({ objId: 7 })).toEqual({ ok: true, objId: 7 })
    })

    it('does not let data override the flag', () => {
        // Structurally impossible through the types, but the runtime spread
        // order is what makes it so.
        expect(ok({ ok: false } as unknown as { objId: number })).toEqual({ ok: true })
    })
})

describe('fail', () => {
    it('always carries a reason', () => {
        expect(fail('no such scene')).toEqual({ ok: false, error: 'no such scene' })
    })

    it('carries a code when given one', () => {
        expect(fail('gone', 'not-found')).toEqual({ ok: false, error: 'gone', code: 'not-found' })
    })

    it('omits the code key entirely when not given', () => {
        expect('code' in fail('x')).toBe(false)
    })
})

describe('failFrom', () => {
    it('uses the Error message, not the "Error: " prefixed String()', () => {
        expect(failFrom(new Error('boom'))).toEqual({ ok: false, error: 'boom', code: 'native' })
    })

    it('stringifies a non-Error throw', () => {
        expect(failFrom('raw')).toEqual({ ok: false, error: 'raw', code: 'native' })
        expect(failFrom({ toString: () => 'obj' })).toEqual({ ok: false, error: 'obj', code: 'native' })
    })

    it('takes an explicit code', () => {
        expect(failFrom(new Error('404'), 'io').code).toBe('io')
    })
})

describe('isOk', () => {
    it('narrows the union', () => {
        const r: Result<{ objId: number }> = Math.random() < 2 ? ok({ objId: 1 }) : fail('x')
        if (isOk(r)) {
            expect(r.objId).toBe(1)
        } else {
            throw new Error('unreachable')
        }
    })

    it('is structurally cloneable (crosses postMessage)', () => {
        expect(() => structuredClone(ok({ objId: 1 }))).not.toThrow()
        expect(() => structuredClone(fail('x', 'io'))).not.toThrow()
    })
})
