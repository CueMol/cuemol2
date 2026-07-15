import { describe, it, expect } from 'vitest'
import {
    initBuilderState,
    builderReducer,
    selectTerm,
    canApplyUnary,
    type BuilderState,
} from '../components/panes/selection/selBuilderReducer'

// The real default keyword is `hierarchical` (see initBuilderState); these
// reducer-behaviour fixtures pin a single-value keyword (chain) so the term
// composition is exercised independently of whatever the default happens to be.
function draft(over: Partial<BuilderState> = {}): BuilderState {
    return { ...initBuilderState(), keyword: 'chain', ...over }
}

describe('initBuilderState', () => {
    it('defaults to the property/hierarchical source (no current owned here)', () => {
        const s = initBuilderState()
        expect(s.source).toBe('property')
        expect(s.keyword).toBe('hierarchical')
        // The reducer no longer owns the current selection (mol.sel is SoT).
        expect('current' in s).toBe(false)
    })
})

describe('selectTerm', () => {
    it('derives the property term from keyword + fields', () => {
        expect(selectTerm(draft({ fields: { value: 'A' } }))).toBe("chain 'A'")
    })

    it('uses the picked expression for named / history', () => {
        expect(selectTerm(draft({ source: 'named', picked: 'protein' }))).toBe('protein')
    })

    it('returns null for an empty draft', () => {
        expect(selectTerm(draft({ fields: { value: '' } }))).toBeNull()
        expect(selectTerm(draft({ source: 'history', picked: '' }))).toBeNull()
    })
})

describe('builderReducer', () => {
    it('SET_SOURCE switches the active source', () => {
        expect(builderReducer(draft(), { type: 'SET_SOURCE', source: 'named' }).source).toBe('named')
    })

    it('SET_KEYWORD resets fields (bfac gets a default op)', () => {
        const s = builderReducer(draft({ fields: { value: 'A' } }), {
            type: 'SET_KEYWORD',
            keyword: 'bfac',
        })
        expect(s.keyword).toBe('bfac')
        expect(s.fields).toEqual({ op: '<', value: '' })
    })

    it('SET_FIELD merges a single field', () => {
        expect(
            builderReducer(draft(), { type: 'SET_FIELD', name: 'value', value: 'CA' }).fields.value,
        ).toBe('CA')
    })

    it('SET_PICKED / SET_DISTANCE set their values', () => {
        expect(builderReducer(draft(), { type: 'SET_PICKED', value: 'water' }).picked).toBe('water')
        expect(builderReducer(draft(), { type: 'SET_DISTANCE', value: '8' }).distance).toBe('8')
    })

    it('RESET_DRAFT clears fields + picked but keeps the keyword', () => {
        const s = builderReducer(draft({ fields: { value: 'B' }, picked: 'protein' }), {
            type: 'RESET_DRAFT',
        })
        expect(s.keyword).toBe('chain')
        expect(s.fields).toEqual({})
        expect(s.picked).toBe('')
    })

    it('INIT returns the initial draft (full reset)', () => {
        const s = builderReducer(draft({ source: 'named', picked: 'protein', distance: '9' }), {
            type: 'INIT',
        })
        expect(s).toEqual(initBuilderState())
    })
})

describe('canApplyUnary', () => {
    it('blocks everything on an empty current selection', () => {
        expect(canApplyUnary(draft(), 'not', '')).toBe(false)
    })

    it('around / expand are enabled by default (distance pre-filled)', () => {
        expect(canApplyUnary(draft(), 'around', 'chain A')).toBe(true)
        expect(canApplyUnary(draft(), 'expand', 'chain A')).toBe(true)
    })

    it('around / expand require a valid non-negative distance', () => {
        expect(canApplyUnary(draft({ distance: '' }), 'around', 'chain A')).toBe(false)
        expect(canApplyUnary(draft({ distance: 'abc' }), 'around', 'chain A')).toBe(false)
        expect(canApplyUnary(draft({ distance: '0' }), 'around', 'chain A')).toBe(true)
        expect(canApplyUnary(draft({ distance: '3.5' }), 'expand', 'chain A')).toBe(true)
    })
})
