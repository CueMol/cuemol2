/**
 * The New Scene defaults' two standing contracts.
 *
 *   1. The factory defaults must expand to the C++ property defaults
 *      (Scene.qif). A user who has never opened the dialog must get exactly
 *      the scene they got before the dialog existed -- and, because
 *      `applyInitialSceneProps` skips a property already holding its value,
 *      a drift here would start writing entries into every saved `.qsc`.
 *   2. A persisted preset id the axis no longer has falls back to the axis
 *      default, rather than reaching the worker as a name nothing expands
 *      (which would silently leave those properties at whatever they were).
 */

import { describe, it, expect } from 'vitest'
import {
  FACTORY_NEW_SCENE_DEFAULTS,
  sanitizeNewSceneDefaults,
  toInitialProps,
} from '@renderer/data/newSceneDefaults'

/** The C++ defaults from src/qsys/Scene.qif. */
const CPP_DEFAULTS = {
  aa_method: 'fxaa',
  aaJitterLevel: 0,
  aoEnabled: false,
  aoRadius: 4,
  aoSteps: 3,
  aoIntensity: 2.2,
  aoHalfRes: false,
  bgcolor: '#000000',
  use_colproof: false,
}

describe('newSceneDefaults', () => {
  it('expands the factory defaults to the C++ property defaults', () => {
    expect(toInitialProps(FACTORY_NEW_SCENE_DEFAULTS)).toEqual(CPP_DEFAULTS)
  })

  it('reads a stored preference back', () => {
    expect(
      sanitizeNewSceneDefaults({
        aaPreset: 'ultra',
        aoEnabled: true,
        aoPreset: 'high',
        bgcolor: '#ffffff',
        useColproof: true,
      }),
    ).toEqual({
      aaPreset: 'ultra',
      aoEnabled: true,
      aoPreset: 'high',
      bgcolor: '#ffffff',
      useColproof: true,
    })
  })

  it('falls back to the factory value for an unknown preset or a missing field', () => {
    expect(sanitizeNewSceneDefaults({ aaPreset: 'gone', aoPreset: 'gone' })).toEqual(
      FACTORY_NEW_SCENE_DEFAULTS,
    )
    expect(sanitizeNewSceneDefaults({})).toEqual(FACTORY_NEW_SCENE_DEFAULTS)
    expect(sanitizeNewSceneDefaults(undefined)).toEqual(FACTORY_NEW_SCENE_DEFAULTS)
  })

  it('expands a chosen preset into the properties behind it', () => {
    const props = toInitialProps({
      ...FACTORY_NEW_SCENE_DEFAULTS,
      aaPreset: 'off',
      aoEnabled: true,
      aoPreset: 'high',
    })
    expect(props.aa_method).toBe('none')
    expect(props.aoEnabled).toBe(true)
    expect(props.aoRadius).toBe(12)
  })
})
