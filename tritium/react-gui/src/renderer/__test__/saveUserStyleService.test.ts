/**
 * Degrade-detection tests for `saveUserStyle` (worker lifecycle).
 *
 * Pins the UXP `Qm2Main.onUnLoad` (cuemol2.js:297-304) mirror:
 *   - resolve the user set uid via hasStyleSet("user", 0)
 *   - write it with saveStyleSetToFile(0, uid, path)
 *   - when no user set exists (uid < 0) nothing is written and it returns false
 */

import { describe, it, expect, vi } from 'vitest'
import { saveUserStyle } from '@renderer/worker/server/workerLifecycle'
import type { CueMol } from '@cuemol/core/src/cuemol'

function makeCm(opts: { uid?: number; saveResult?: boolean; noStyleMgr?: boolean } = {}) {
    const hasStyleSet = vi.fn(() => opts.uid ?? 3)
    const saveStyleSetToFile = vi.fn(() => opts.saveResult ?? true)
    const stylem = { hasStyleSet, saveStyleSetToFile }
    const getService = vi.fn((name: string) =>
        opts.noStyleMgr ? null : name === 'StyleManager' ? stylem : null,
    )
    const cm = { getService } as unknown as CueMol
    return { cm, hasStyleSet, saveStyleSetToFile, getService }
}

describe('saveUserStyle (worker lifecycle)', () => {
    it('resolves the user set uid and writes it to the given path', () => {
        const { cm, hasStyleSet, saveStyleSetToFile } = makeCm({ uid: 7 })
        expect(saveUserStyle(cm, '/tmp/user_styles.xml')).toBe(true)
        expect(hasStyleSet).toHaveBeenCalledWith('user', 0)
        expect(saveStyleSetToFile).toHaveBeenCalledWith(0, 7, '/tmp/user_styles.xml')
    })

    it('does not write and returns false when no "user" set exists (uid < 0)', () => {
        const { cm, saveStyleSetToFile } = makeCm({ uid: -1 })
        expect(saveUserStyle(cm, '/tmp/user_styles.xml')).toBe(false)
        expect(saveStyleSetToFile).not.toHaveBeenCalled()
    })

    it('returns false when StyleManager is unavailable', () => {
        const { cm } = makeCm({ noStyleMgr: true })
        expect(saveUserStyle(cm, '/tmp/user_styles.xml')).toBe(false)
    })

    it('propagates the saveStyleSetToFile result', () => {
        const { cm } = makeCm({ uid: 2, saveResult: false })
        expect(saveUserStyle(cm, '/tmp/user_styles.xml')).toBe(false)
    })
})
