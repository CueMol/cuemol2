/**
 * Unit test for shared/recentFilesLogic.ts dedup / cap semantics.
 *
 * The persistence side (main/recentFiles.ts) is a thin wrapper around
 * these pure helpers + electron-store + fs.existsSync; covering the
 * logic here is sufficient to pin the contract.
 */
import { describe, it, expect } from 'vitest'
import { addToRecents, MAX_RECENTS } from '../../shared/recentFilesLogic'

describe('shared/recentFilesLogic', () => {
    it('inserts a new entry at the head', () => {
        const a = addToRecents([], { path: '/a.pdb', ftype: 'obj' })
        const b = addToRecents(a, { path: '/b.qsc', ftype: 'scene' })
        expect(b).toEqual([
            { path: '/b.qsc', ftype: 'scene' },
            { path: '/a.pdb', ftype: 'obj' },
        ])
    })

    it('promotes an existing path to the head without duplicating', () => {
        let list = addToRecents([], { path: '/a.pdb', ftype: 'obj' })
        list = addToRecents(list, { path: '/b.qsc', ftype: 'scene' })
        list = addToRecents(list, { path: '/a.pdb', ftype: 'obj' })
        expect(list.length).toBe(2)
        expect(list[0].path).toBe('/a.pdb')
        expect(list[1].path).toBe('/b.qsc')
    })

    it('caps the list at MAX_RECENTS, dropping the oldest', () => {
        let list: ReturnType<typeof addToRecents> = []
        for (let i = 0; i < MAX_RECENTS + 3; i++) {
            list = addToRecents(list, { path: `/p${i}.pdb`, ftype: 'obj' })
        }
        expect(list.length).toBe(MAX_RECENTS)
        // Newest first; the first three insertions should have been evicted.
        expect(list[0].path).toBe(`/p${MAX_RECENTS + 2}.pdb`)
        expect(list[list.length - 1].path).toBe('/p3.pdb')
    })

    it('overwrites ftype when re-adding an existing path', () => {
        let list = addToRecents([], { path: '/x.qsc', ftype: 'scene' })
        list = addToRecents(list, { path: '/x.qsc', ftype: 'obj' })
        expect(list).toEqual([{ path: '/x.qsc', ftype: 'obj' }])
    })

    it('ignores empty paths', () => {
        const list = addToRecents([{ path: '/a.pdb', ftype: 'obj' }], { path: '', ftype: 'obj' })
        expect(list).toEqual([{ path: '/a.pdb', ftype: 'obj' }])
    })

    it('does not mutate the input array', () => {
        const original: ReturnType<typeof addToRecents> = [
            { path: '/a.pdb', ftype: 'obj' },
        ]
        addToRecents(original, { path: '/b.qsc', ftype: 'scene' })
        expect(original).toEqual([{ path: '/a.pdb', ftype: 'obj' }])
    })
})
