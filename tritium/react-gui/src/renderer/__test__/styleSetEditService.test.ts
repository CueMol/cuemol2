/**
 * Degrade-detection tests for `styleSetEdit` (worker service backing the style
 * editor, UXP `style/style_editor.xul`).
 *
 * Pins the wire contract:
 *   - getStyleSetContents parses colors (name + hex), selections (name + value
 *     from the "sel" str-data category), and style entries (name + type);
 *   - setStyleSetColor compiles the colour string then calls setColor; the
 *     remove* / setStyleSetSelection writers call the matching StyleSet method
 *     under an undo txn and fire pending events;
 *   - missing manager / set -> { ok: false }.
 */

import { describe, it, expect, vi } from 'vitest'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'

vi.mock('@renderer/worker/server/services/helpers/sceneResolver', () => ({
    getSceneOrNull: (ctx: { __scene?: unknown }) => ctx.__scene ?? null,
}))
vi.mock('@renderer/worker/server/services/withUndoTxn', () => ({
    withUndoTxn: (_scene: unknown, _label: string, fn: () => void) => fn(),
}))

import { services } from '@renderer/worker/server/services/styleSetEdit.service'

const {
    getStyleSetContents,
    setStyleSetColor,
    removeStyleSetColor,
    setStyleSetSelection,
    removeStyleSetSelection,
    removeStyleSetStyle,
} = services

function makeSet() {
    return {
        name: 'myStyle',
        readonly: false,
        getColorDefsJSON: () => '["red","blue"]',
        getColor: () => ({ r: () => 255, g: () => 0, b: () => 0 }),
        setColor: vi.fn(() => true),
        removeColor: vi.fn(() => true),
        getStrDataNamesJSON: (cat: string) => (cat === 'sel' ? '["sel1"]' : '[]'),
        getStrData: () => 'A.10',
        setStrData: vi.fn(() => true),
        removeStrData: vi.fn(() => true),
        getStyleNamesJSON: () => '[{"name":"st1","type":"renderer"}]',
        removeStyle: vi.fn(() => true),
    }
}

function makeCtx(set: unknown) {
    const compileColor = vi.fn((s: string) => ({ __color: s }))
    const firePendingEvents = vi.fn()
    const mgr = { getStyleSet: () => set, compileColor, firePendingEvents }
    const ctx = {
        __scene: {},
        svc: { getService: (n: string) => (n === 'StyleManager' ? mgr : null) },
    } as unknown as WorkerContext
    return { ctx, compileColor, firePendingEvents }
}

describe('styleSetEdit.getStyleSetContents', () => {
    it('parses colors / selections / styles', () => {
        const { ctx } = makeCtx(makeSet())
        const res = getStyleSetContents(ctx, { styleSetId: 5 })
        expect(res.ok).toBe(true)
        expect(res.name).toBe('myStyle')
        expect(res.colors).toEqual([
            { name: 'red', hex: '#ff0000' },
            { name: 'blue', hex: '#ff0000' },
        ])
        expect(res.selections).toEqual([{ name: 'sel1', value: 'A.10' }])
        expect(res.styles).toEqual([{ name: 'st1', type: 'renderer' }])
    })

    it('returns ok:false when the set is missing', () => {
        const { ctx } = makeCtx(null)
        expect(getStyleSetContents(ctx, { styleSetId: 5 }).ok).toBe(false)
    })
})

describe('styleSetEdit writers', () => {
    it('setStyleSetColor compiles then setColor + fires events', () => {
        const set = makeSet()
        const { ctx, compileColor, firePendingEvents } = makeCtx(set)
        const res = setStyleSetColor(ctx, {
            sceneId: 1, styleSetId: 5, scopeId: 0, name: 'green', colorStr: '#00ff00',
        })
        expect(res.ok).toBe(true)
        expect(compileColor).toHaveBeenCalledWith('#00ff00', 0)
        expect(set.setColor).toHaveBeenCalledWith('green', { __color: '#00ff00' })
        expect(firePendingEvents).toHaveBeenCalled()
    })

    it('removeStyleSetColor / Selection / Style call the matching methods', () => {
        const set = makeSet()
        const { ctx } = makeCtx(set)
        removeStyleSetColor(ctx, { sceneId: 1, styleSetId: 5, name: 'red' })
        setStyleSetSelection(ctx, { sceneId: 1, styleSetId: 5, name: 'sel2', value: 'A.20' })
        removeStyleSetSelection(ctx, { sceneId: 1, styleSetId: 5, name: 'sel1' })
        removeStyleSetStyle(ctx, { sceneId: 1, styleSetId: 5, name: 'st1' })
        expect(set.removeColor).toHaveBeenCalledWith('red')
        expect(set.setStrData).toHaveBeenCalledWith('sel', 'sel2', 'A.20')
        expect(set.removeStrData).toHaveBeenCalledWith('sel', 'sel1')
        expect(set.removeStyle).toHaveBeenCalledWith('st1')
    })

    it('rejects an empty colour name without touching the set', () => {
        const set = makeSet()
        const { ctx } = makeCtx(set)
        expect(setStyleSetColor(ctx, { sceneId: 1, styleSetId: 5, scopeId: 0, name: '  ', colorStr: '#fff' }).ok).toBe(false)
        expect(set.setColor).not.toHaveBeenCalled()
    })
})
