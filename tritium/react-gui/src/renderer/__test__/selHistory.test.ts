import { describe, it, expect, beforeEach } from 'vitest'
import {
    STORAGE_KEY,
    MAX_ENTRIES,
    getHistory,
    pushHistory,
    clearHistory,
    recordAppliedSel,
    recordIncrementalSel,
} from '@renderer/h3-kit/MolSelList'

describe('selHistory', () => {
    beforeEach(() => {
        // Also forgets the incremental-run state kept by recordIncrementalSel.
        clearHistory()
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

    it('recordAppliedSel records selStr / selStrs of an ok result only', () => {
        recordAppliedSel(undefined)
        recordAppliedSel({ ok: false, selStr: 'nope' })
        recordAppliedSel({ ok: true })
        recordAppliedSel({ ok: true, selStr: 'protein' })
        recordAppliedSel({ ok: true, selStrs: ['aid 1:3', 'aid 7'] })
        expect(getHistory()).toEqual(['aid 7', 'aid 1:3', 'protein'])
    })

    it('recordIncrementalSel keeps only the latest state of a run of picks', () => {
        recordIncrementalSel("'A'.10.*")
        recordIncrementalSel("'A'.10:11.*")
        expect(getHistory()).toEqual(["'A'.10:11.*"])
        // Another surface records in between: the run ends, both entries stay.
        pushHistory('protein')
        recordIncrementalSel("'A'.10:12.*")
        expect(getHistory()).toEqual(["'A'.10:12.*", 'protein', "'A'.10:11.*"])
        // Clearing the selection records nothing and keeps the last state.
        recordIncrementalSel('')
        expect(getHistory()).toEqual(["'A'.10:12.*", 'protein', "'A'.10:11.*"])
    })
})
