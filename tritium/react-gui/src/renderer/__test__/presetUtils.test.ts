import { describe, it, expect } from 'vitest'
import { presetNamePrefix } from '../components/fopen-opt-dlgs/presetUtils'

describe('presetNamePrefix', () => {
    it('strips the RendPreset suffix, lowercases and appends an underscore', () => {
        expect(presetNamePrefix('Default1RendPreset')).toBe('default1_')
        expect(presetNamePrefix('Simple1RendPreset')).toBe('simple1_')
    })

    it('falls back to the whole lowercased name when the suffix is absent', () => {
        expect(presetNamePrefix('MyPreset')).toBe('mypreset_')
    })

    it('keeps the raw name when stripping would leave it empty', () => {
        expect(presetNamePrefix('RendPreset')).toBe('rendpreset_')
    })
})
