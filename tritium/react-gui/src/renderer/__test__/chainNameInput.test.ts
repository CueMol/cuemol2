/**
 * Tests for `resolveChainNameInput` (Change chain ID dialog input rules).
 * Pins the UXP `chg_chname.js` validation branches so the dialog's confirm /
 * commit flow stays in sync with the documented behaviour.
 */

import { describe, it, expect } from 'vitest'
import { resolveChainNameInput } from '@renderer/dialogs/chainNameInput'

describe('resolveChainNameInput', () => {
    it('rejects an empty string', () => {
        expect(resolveChainNameInput('')).toEqual({ kind: 'empty' })
    })

    it('treats a single space as a blank chain ID ("_")', () => {
        expect(resolveChainNameInput(' ')).toEqual({ kind: 'blank', value: '_' })
    })

    it('treats whitespace-only input as a blank chain ID', () => {
        expect(resolveChainNameInput('   ')).toEqual({ kind: 'blank', value: '_' })
    })

    it('flags a trimmed value longer than one character as non-conforming', () => {
        expect(resolveChainNameInput('AB')).toEqual({ kind: 'long', value: 'AB' })
    })

    it('trims surrounding whitespace before length checks', () => {
        expect(resolveChainNameInput('  AB  ')).toEqual({ kind: 'long', value: 'AB' })
        expect(resolveChainNameInput(' A ')).toEqual({ kind: 'ok', value: 'A' })
    })

    it('accepts a single character directly', () => {
        expect(resolveChainNameInput('A')).toEqual({ kind: 'ok', value: 'A' })
    })
})
