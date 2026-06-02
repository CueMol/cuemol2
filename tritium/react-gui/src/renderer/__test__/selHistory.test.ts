import { describe, it, expect, beforeEach } from 'vitest'
import {
    STORAGE_KEY,
    MAX_ENTRIES,
    getHistory,
    pushHistory,
    clearHistory,
} from '../h3-kit/MolSelList/selHistory'

describe('selHistory', () => {
    beforeEach(() => {
        globalThis.localStorage.clear()
    })

    it('returns [] when storage is empty', () => {
        expect(getHistory()).toEqual([])
    })

    it('returns [] when storage holds invalid JSON', () => {
        globalThis.localStorage.setItem(STORAGE_KEY, 'not-json')
        expect(getHistory()).toEqual([])
    })

    it('returns [] when stored payload is not an array', () => {
        globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify({ foo: 1 }))
        expect(getHistory()).toEqual([])
    })

    it('round-trips a pushed value', () => {
        pushHistory('chain.A')
        expect(getHistory()).toEqual(['chain.A'])
    })

    it('most recent push appears first (LRU)', () => {
        pushHistory('chain.A')
        pushHistory('resi.1:10')
        expect(getHistory()).toEqual(['resi.1:10', 'chain.A'])
    })

    it('deduplicates: re-pushing an existing value moves it to the front', () => {
        pushHistory('chain.A')
        pushHistory('resi.1:10')
        pushHistory('chain.A')
        expect(getHistory()).toEqual(['chain.A', 'resi.1:10'])
    })

    it('skips empty / "*" / "none"', () => {
        pushHistory('')
        pushHistory('*')
        pushHistory('none')
        pushHistory('   ')
        expect(getHistory()).toEqual([])
    })

    it('caps at MAX_ENTRIES', () => {
        for (let i = 0; i < MAX_ENTRIES + 5; ++i) {
            pushHistory(`sel${i}`)
        }
        const hist = getHistory()
        expect(hist.length).toBe(MAX_ENTRIES)
        expect(hist[0]).toBe(`sel${MAX_ENTRIES + 4}`)
    })

    it('clearHistory removes the storage entry', () => {
        pushHistory('chain.A')
        clearHistory()
        expect(getHistory()).toEqual([])
    })
})
