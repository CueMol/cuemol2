import { describe, it, expect } from 'vitest'
import {
    rewriteAround,
    invertSelStr,
    toggleSidechainStr,
} from '@renderer/worker/server/services/helpers/selStrTransforms'

describe('selStrTransforms', () => {
    describe('rewriteAround', () => {
        it('wraps a fresh selection with "around <dist>"', () => {
            expect(rewriteAround('protein', 5, false)).toBe('protein around 5')
        })

        it('prefixes "byres " when byres flag is true', () => {
            expect(rewriteAround('protein', 5, true)).toBe('byres protein around 5')
        })

        it('unwraps and rewrites form III (XXXX around N)', () => {
            expect(rewriteAround('protein around 3', 7, false)).toBe('protein around 7')
        })

        it('unwraps form II (byres XXXX around N) reusing the inner sel', () => {
            expect(rewriteAround('byres ligand around 3', 5, false)).toBe('ligand around 5')
        })

        it('unwraps form I (byres ( XXXX around N )) reusing the inner sel', () => {
            expect(rewriteAround('byres ( water around 4 )', 6, true)).toBe('byres water around 6')
        })
    })

    describe('invertSelStr', () => {
        it('returns "*" when previous selection is empty', () => {
            expect(invertSelStr('')).toBe('*')
        })

        it('wraps a non-inverted selection in !( ... )', () => {
            expect(invertSelStr('protein')).toBe('!(protein)')
        })

        it('strips an existing !( ... ) wrapper', () => {
            expect(invertSelStr('!(protein)')).toBe('protein')
        })
    })

    describe('toggleSidechainStr', () => {
        it('prefixes a non-sidechain selection with "bysidech "', () => {
            expect(toggleSidechainStr('protein')).toBe('bysidech protein')
        })

        it('strips an existing "bysidech " prefix', () => {
            expect(toggleSidechainStr('bysidech protein')).toBe('protein')
        })
    })
})
