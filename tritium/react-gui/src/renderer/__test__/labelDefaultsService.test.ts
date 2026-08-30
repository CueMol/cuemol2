/**
 * Degrade-detection tests for `labelDefaults` (worker service).
 *
 * Pins the C++ StyleManager contract mirrored from UXP `config-dialog.js`:
 *   - reads resolve global scope, all sets:  getStyleValue(0, "", "DefaultLabel.<prop>")
 *   - writes go to the "user" set:           setStyleValue(0, "user", "DefaultLabel.<prop>", str)
 *   - bold  <-> font_weight ("bold"/"normal")
 *   - italic<-> font_style  ("italic"/"normal")
 *   - font_size number is stringified; only provided fields are written
 *   - firePendingEvents() is fired after a write so live labels refresh
 */

import { describe, it, expect, vi } from 'vitest'
import { services } from '@renderer/worker/server/services/view/view.service'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'

const { getLabelDefaults, setLabelDefaults } = services

function makeCtx(styleValues: Record<string, string> = {}) {
    const getStyleValue = vi.fn(
        (_scene: number, _set: string, key: string) => styleValues[key] ?? '',
    )
    const setStyleValue = vi.fn()
    const firePendingEvents = vi.fn()
    const compileColor = vi.fn((str: string) => {
        if (str === 'Yellow') return { r: () => 255, g: () => 255, b: () => 0 }
        if (str.startsWith('#')) {
            const n = parseInt(str.slice(1), 16)
            return { r: () => (n >> 16) & 0xff, g: () => (n >> 8) & 0xff, b: () => n & 0xff }
        }
        return null
    })
    const ctx = {
        styleMgr: { getStyleValue, setStyleValue, firePendingEvents, compileColor },
    } as unknown as WorkerContext
    return { ctx, getStyleValue, setStyleValue, firePendingEvents, compileColor }
}

describe('labelDefaults service', () => {
    describe('getLabelDefaults', () => {
        it('reads DefaultLabel.<prop> at (0, "") and maps style strings to typed fields', () => {
            const { ctx, getStyleValue } = makeCtx({
                'DefaultLabel.font_name': 'Menlo',
                'DefaultLabel.font_size': '14',
                'DefaultLabel.color': 'Yellow',
                'DefaultLabel.font_weight': 'bold',
                'DefaultLabel.font_style': 'italic',
            })
            const res = getLabelDefaults(ctx, {})
            expect(res.ok).toBe(true)
            expect(res.defaults).toEqual({
                fontName: 'Menlo',
                fontSize: 14,
                color: '#ffff00', // resolved via compileColor
                bold: true,
                italic: true,
            })
            for (const prop of ['font_name', 'font_size', 'color', 'font_weight', 'font_style']) {
                expect(getStyleValue).toHaveBeenCalledWith(0, '', `DefaultLabel.${prop}`)
            }
        })

        it('maps non-"bold"/"italic" (incl. empty) to false, and falls back on empty size', () => {
            const { ctx } = makeCtx({
                'DefaultLabel.font_weight': 'normal',
                'DefaultLabel.font_style': '',
                // font_size absent -> '' -> fallback 12
            })
            const res = getLabelDefaults(ctx, {})
            expect(res.defaults.bold).toBe(false)
            expect(res.defaults.italic).toBe(false)
            expect(res.defaults.fontSize).toBe(12)
        })
    })

    describe('setLabelDefaults', () => {
        it('writes only font_size (stringified) and fires pending events', () => {
            const { ctx, setStyleValue, firePendingEvents } = makeCtx()
            expect(setLabelDefaults(ctx, { fontSize: 14 })).toEqual({ ok: true })
            expect(setStyleValue).toHaveBeenCalledTimes(1)
            expect(setStyleValue).toHaveBeenCalledWith(0, 'user', 'DefaultLabel.font_size', '14')
            expect(firePendingEvents).toHaveBeenCalledTimes(1)
        })

        it('maps bold -> font_weight and italic -> font_style with normal fallback', () => {
            const { ctx, setStyleValue } = makeCtx()
            setLabelDefaults(ctx, { bold: true })
            expect(setStyleValue).toHaveBeenCalledWith(0, 'user', 'DefaultLabel.font_weight', 'bold')

            const { ctx: ctx2, setStyleValue: set2 } = makeCtx()
            setLabelDefaults(ctx2, { italic: false })
            expect(set2).toHaveBeenCalledWith(0, 'user', 'DefaultLabel.font_style', 'normal')
        })

        it('passes color and font name through verbatim', () => {
            const { ctx, setStyleValue } = makeCtx()
            setLabelDefaults(ctx, { color: '#00ff00', fontName: 'Arial' })
            expect(setStyleValue).toHaveBeenCalledWith(0, 'user', 'DefaultLabel.color', '#00ff00')
            expect(setStyleValue).toHaveBeenCalledWith(0, 'user', 'DefaultLabel.font_name', 'Arial')
        })
    })
})
