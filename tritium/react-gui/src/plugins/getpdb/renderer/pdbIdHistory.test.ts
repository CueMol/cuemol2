import { describe, it, expect, beforeEach } from 'vitest'
import {
    STORAGE_KEY,
    MAX_ENTRIES,
    getHistory,
    pushHistory,
    clearHistory,
    MAX_ENTRY_LENGTH,
} from './pdbIdHistory'

describe('pdbIdHistory', () => {
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

    it('round-trips a pushed value (lowercased)', () => {
        pushHistory('1MBN')
        expect(getHistory()).toEqual(['1mbn'])
    })

    it('most recent push appears first (LRU)', () => {
        pushHistory('1mbn')
        pushHistory('6vxx')
        expect(getHistory()).toEqual(['6vxx', '1mbn'])
    })

    it('deduplicates: re-pushing an existing value moves it to the front', () => {
        pushHistory('1mbn')
        pushHistory('6vxx')
        pushHistory('1mbn')
        expect(getHistory()).toEqual(['1mbn', '6vxx'])
    })

    it('case-insensitive dedup: differing case does not create duplicates', () => {
        pushHistory('1mbn')
        pushHistory('1MBN')
        expect(getHistory()).toEqual(['1mbn'])
    })

    it('keeps searched keywords alongside IDs; skips blank and over-long input', () => {
        pushHistory('')
        pushHistory('   ')
        pushHistory('x'.repeat(MAX_ENTRY_LENGTH + 1))
        pushHistory('  photosystem   I ')   // whitespace collapsed
        pushHistory('emd_11638')            // canonical EMDB form
        expect(getHistory()).toEqual(['EMD-11638', 'photosystem I'])
    })

    it('caps at MAX_ENTRIES', () => {
        // Generate MAX_ENTRIES + 5 unique 4-char PDB IDs (digit + 3 alnum).
        const charset = '0123456789abcdefghijklmnop'
        const pdbids = Array.from({ length: MAX_ENTRIES + 5 }, (_, i) => {
            const a = String(i % 10)
            const b = charset[Math.floor(i / 10) % charset.length]
            const c = charset[(Math.floor(i / 10) + 1) % charset.length]
            const d = charset[(Math.floor(i / 10) + 2) % charset.length]
            return `${a}${b}${c}${d}`
        })
        for (const id of pdbids) pushHistory(id)
        const hist = getHistory()
        expect(hist.length).toBe(MAX_ENTRIES)
        // Most recently pushed appears first.
        expect(hist[0]).toBe(pdbids[pdbids.length - 1])
    })

    it('filters out malformed entries when reading (defense against corrupt storage)', () => {
        // Manually write a payload mixing valid entries and garbage.
        globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify([
            '1mbn',
            123,           // not a string
            null,          // not a string
            '',            // blank
            'photosystem I',
        ]))
        expect(getHistory()).toEqual(['1mbn', 'photosystem I'])
    })

    it('clearHistory removes the storage entry', () => {
        pushHistory('1mbn')
        clearHistory()
        expect(getHistory()).toEqual([])
    })
})
