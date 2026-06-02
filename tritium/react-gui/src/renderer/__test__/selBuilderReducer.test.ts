import { describe, it, expect } from 'vitest'
import {
    initBuilderState,
    builderReducer,
    selectTerm,
    canApplyUnary,
    canUndo,
    canRedo,
    type BuilderState,
} from '../components/panes/selection/selBuilderReducer'

// The real default keyword is `hierarchical` (see initBuilderState); these
// reducer-behaviour fixtures pin a single-value keyword (chain) so the term
// composition is exercised independently of whatever the default happens to be.
function withCurrent(current: string, over: Partial<BuilderState> = {}): BuilderState {
    return { ...initBuilderState(current), keyword: 'chain', ...over }
}

describe('initBuilderState', () => {
    it('seeds current and defaults to the property/hierarchical source', () => {
        const s = initBuilderState('chain A')
        expect(s.current).toBe('chain A')
        expect(s.source).toBe('property')
        expect(s.keyword).toBe('hierarchical')
    })
})

describe('selectTerm', () => {
    it('derives the property term from keyword + fields', () => {
        const s = withCurrent('', { fields: { value: 'A' } })
        expect(selectTerm(s)).toBe("chain 'A'")
    })

    it('uses the picked expression for named / history', () => {
        const s = withCurrent('', { source: 'named', picked: 'protein' })
        expect(selectTerm(s)).toBe('protein')
    })

    it('returns null for an empty draft', () => {
        expect(selectTerm(withCurrent('', { fields: { value: '' } }))).toBeNull()
        expect(selectTerm(withCurrent('', { source: 'history', picked: '' }))).toBeNull()
    })
})

describe('builderReducer', () => {
    it('SET_KEYWORD resets fields (bfac gets a default op)', () => {
        const s = builderReducer(withCurrent('', { fields: { value: 'A' } }), {
            type: 'SET_KEYWORD',
            keyword: 'bfac',
        })
        expect(s.keyword).toBe('bfac')
        expect(s.fields).toEqual({ op: '<', value: '' })
    })

    it('SET_FIELD merges a single field', () => {
        const s = builderReducer(withCurrent(''), { type: 'SET_FIELD', name: 'value', value: 'CA' })
        expect(s.fields.value).toBe('CA')
    })

    it('APPLY_BINARY set replaces current with the term', () => {
        const s = builderReducer(withCurrent('chain A', { fields: { value: 'B' } }), {
            type: 'APPLY_BINARY',
            op: 'set',
        })
        expect(s.current).toBe("chain 'B'")
    })

    it('APPLY_BINARY add ORs current and term', () => {
        const s = builderReducer(withCurrent('chain A', { fields: { value: 'B' } }), {
            type: 'APPLY_BINARY',
            op: 'add',
        })
        expect(s.current).toBe("(chain A) or (chain 'B')")
    })

    it('APPLY_BINARY add is a no-op when current is empty', () => {
        const before = withCurrent('', { fields: { value: 'B' } })
        const after = builderReducer(before, { type: 'APPLY_BINARY', op: 'add' })
        expect(after).toBe(before)
    })

    it('APPLY_BINARY is a no-op when the term is incomplete', () => {
        const before = withCurrent('chain A', { fields: { value: '' } })
        const after = builderReducer(before, { type: 'APPLY_BINARY', op: 'set' })
        expect(after).toBe(before)
    })

    it('APPLY_UNARY not wraps current', () => {
        const s = builderReducer(withCurrent('chain A'), { type: 'APPLY_UNARY', op: 'not' })
        expect(s.current).toBe('not (chain A)')
    })

    it('APPLY_UNARY around requires a distance', () => {
        const before = withCurrent('chain A', { distance: '' })
        expect(builderReducer(before, { type: 'APPLY_UNARY', op: 'around' })).toBe(before)
        const ok = builderReducer(withCurrent('chain A', { distance: '5' }), {
            type: 'APPLY_UNARY',
            op: 'around',
        })
        expect(ok.current).toBe('(chain A) around 5')
    })

    it('CLEAR empties current but keeps the draft', () => {
        const s = builderReducer(withCurrent('chain A', { fields: { value: 'B' } }), {
            type: 'CLEAR',
        })
        expect(s.current).toBe('')
        expect(s.fields.value).toBe('B')
    })
})

describe('undo / redo', () => {
    it('UNDO restores the previous current; REDO reapplies', () => {
        let s = withCurrent('', { fields: { value: 'A' } })
        s = builderReducer(s, { type: 'APPLY_BINARY', op: 'set' }) // "chain 'A'"
        s = builderReducer({ ...s, fields: { value: 'B' } }, { type: 'APPLY_BINARY', op: 'add' })
        expect(s.current).toBe("(chain 'A') or (chain 'B')")
        s = builderReducer(s, { type: 'UNDO' })
        expect(s.current).toBe("chain 'A'")
        s = builderReducer(s, { type: 'UNDO' })
        expect(s.current).toBe('')
        s = builderReducer(s, { type: 'REDO' })
        expect(s.current).toBe("chain 'A'")
    })

    it('UNDO is a no-op with empty history', () => {
        const before = withCurrent('chain A')
        expect(builderReducer(before, { type: 'UNDO' })).toBe(before)
    })

    it('a new operation clears the redo stack', () => {
        let s = withCurrent('', { fields: { value: 'A' } })
        s = builderReducer(s, { type: 'APPLY_BINARY', op: 'set' })
        s = builderReducer(s, { type: 'UNDO' })
        expect(canRedo(s)).toBe(true)
        s = builderReducer({ ...s, fields: { value: 'C' } }, { type: 'APPLY_BINARY', op: 'set' })
        expect(canRedo(s)).toBe(false)
    })

    it('SET_CURRENT (re-open) resets the history', () => {
        let s = withCurrent('', { fields: { value: 'A' } })
        s = builderReducer(s, { type: 'APPLY_BINARY', op: 'set' })
        expect(canUndo(s)).toBe(true)
        s = builderReducer(s, { type: 'SET_CURRENT', value: 'chain X' })
        expect(canUndo(s)).toBe(false)
        expect(s.current).toBe('chain X')
    })
})

describe('canApplyUnary', () => {
    it('blocks everything on empty current', () => {
        expect(canApplyUnary(withCurrent(''), 'not')).toBe(false)
    })

    it('around / expand are enabled by default (distance pre-filled)', () => {
        // initBuilderState seeds DEFAULT_DISTANCE, so the buttons are usable
        // as soon as there is a current selection.
        expect(canApplyUnary(withCurrent('chain A'), 'around')).toBe(true)
        expect(canApplyUnary(withCurrent('chain A'), 'expand')).toBe(true)
    })

    it('around / expand require a valid non-negative distance', () => {
        expect(canApplyUnary(withCurrent('chain A', { distance: '' }), 'around')).toBe(false)
        expect(canApplyUnary(withCurrent('chain A', { distance: 'abc' }), 'around')).toBe(false)
        expect(canApplyUnary(withCurrent('chain A', { distance: '0' }), 'around')).toBe(true)
        expect(canApplyUnary(withCurrent('chain A', { distance: '3.5' }), 'expand')).toBe(true)
    })
})
