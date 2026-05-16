import { describe, it, expect, beforeEach } from 'vitest'
import { loadJSON, saveJSON, removeKey } from '../utils/localStorageJSON'

const KEY = 'test.localStorageJSON.key'

const asStringArray = (raw: unknown): string[] | null => {
    if (!Array.isArray(raw)) return null
    return raw.filter((v): v is string => typeof v === 'string')
}

describe('localStorageJSON', () => {
    beforeEach(() => {
        globalThis.localStorage.clear()
    })

    it('returns the fallback when the key is unset', () => {
        expect(loadJSON(KEY, asStringArray, [])).toEqual([])
    })

    it('round-trips a typed value via saveJSON', () => {
        saveJSON(KEY, ['a', 'b'])
        expect(loadJSON(KEY, asStringArray, [])).toEqual(['a', 'b'])
    })

    it('returns the fallback when the stored payload is malformed JSON', () => {
        globalThis.localStorage.setItem(KEY, '{not-json')
        expect(loadJSON(KEY, asStringArray, [])).toEqual([])
    })

    it('returns the fallback when the guard rejects the parsed value', () => {
        globalThis.localStorage.setItem(KEY, JSON.stringify({ not: 'an array' }))
        expect(loadJSON(KEY, asStringArray, [])).toEqual([])
    })

    it('lets the guard return a sanitised value (e.g. filtered array)', () => {
        globalThis.localStorage.setItem(KEY, JSON.stringify(['ok', 42, null, 'fine']))
        expect(loadJSON(KEY, asStringArray, [])).toEqual(['ok', 'fine'])
    })

    it('removeKey clears the stored payload', () => {
        saveJSON(KEY, ['x'])
        removeKey(KEY)
        expect(loadJSON(KEY, asStringArray, [])).toEqual([])
    })
})
