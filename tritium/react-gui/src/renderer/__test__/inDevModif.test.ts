/**
 * @file __test__/inDevModif.test.ts
 * @description Unit test pinning the C++ InDevEvent OUTPUT modifier bits
 * mirrored in worker/shared/inDevModif.ts, plus the decodeClick helper.
 *
 * The literal values are the contract the click handlers rely on
 * (LBTN gate, RBTN context-menu branch, SHIFT extend-select). If the
 * mirror drifts from src/qsys/InDevEvent.hpp this test must go red.
 */
import { describe, it, expect } from 'vitest'
import {
    INDEV_SHIFT,
    INDEV_CTRL,
    INDEV_ALT,
    INDEV_LBTN,
    INDEV_MBTN,
    INDEV_RBTN,
    decodeClick,
} from '@renderer/worker/shared/inDevModif'

describe('inDevModif bits (mirror of InDevEvent.hpp)', () => {
    it('match the C++ enum values verbatim', () => {
        expect(INDEV_SHIFT).toBe(1)
        expect(INDEV_CTRL).toBe(2)
        expect(INDEV_ALT).toBe(4)
        expect(INDEV_LBTN).toBe(8)
        expect(INDEV_MBTN).toBe(16)
        expect(INDEV_RBTN).toBe(32)
    })
})

describe('decodeClick', () => {
    it('extracts x / y / mod from the event payload', () => {
        expect(decodeClick({ obj: { x: 3, y: 4, mod: INDEV_LBTN } })).toEqual({
            x: 3,
            y: 4,
            mod: 8,
        })
    })

    it('returns null when any field is missing', () => {
        expect(decodeClick({ obj: { x: 3, y: 4 } })).toBeNull()
        expect(decodeClick({ obj: {} })).toBeNull()
        expect(decodeClick(null)).toBeNull()
        expect(decodeClick(undefined)).toBeNull()
    })

    it('treats 0 coordinates / mod as present (not missing)', () => {
        expect(decodeClick({ obj: { x: 0, y: 0, mod: 0 } })).toEqual({ x: 0, y: 0, mod: 0 })
    })
})
