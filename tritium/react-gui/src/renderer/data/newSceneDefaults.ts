/**
 * @file data/newSceneDefaults.ts
 * @description What a new scene starts out looking like, as the New Tab
 * dialog offers it and the preference remembers it.
 *
 * The preference stores preset IDS, not the values behind them: a later
 * retune of `sceneQualityPresets` then reaches scenes made from a preference
 * saved before it, which storing the expanded patch would not.
 * `toInitialProps` is the one place that expands them, and it runs on the
 * renderer side so `data/` stays out of the worker bundle.
 *
 * `FACTORY_NEW_SCENE_DEFAULTS` must read as the C++ defaults (Scene.qif) --
 * the same contract the preset axes carry -- so that a user who has never
 * touched the dialog gets exactly the scene they got before it existed.
 */

import type { NewSceneInitialProps } from '@renderer/worker/shared/newSceneTypes'
import type { NewSceneDefaultsPrefs } from '@shared/types/uiPrefs'
import type { RenderQualityAxis } from './renderSettings'
import { SCENE_AA_QUALITY_AXIS, SCENE_AO_PRESET_AXIS } from './sceneQualityPresets'

export interface NewSceneDefaults {
  /** Step id of `SCENE_AA_QUALITY_AXIS`. */
  aaPreset: string
  aoEnabled: boolean
  /** Step id of `SCENE_AO_PRESET_AXIS`. */
  aoPreset: string
  /** A CueMol colour string. */
  bgcolor: string
  useColproof: boolean
}

/** = the C++ property defaults (Scene.qif). */
export const FACTORY_NEW_SCENE_DEFAULTS: NewSceneDefaults = {
  aaPreset: SCENE_AA_QUALITY_AXIS.defaultStep,
  aoEnabled: false,
  aoPreset: SCENE_AO_PRESET_AXIS.defaultStep,
  bgcolor: '#000000',
  useColproof: false,
}

function presetOr(axis: RenderQualityAxis, id: unknown): string {
  return typeof id === 'string' && axis.steps.some((s) => s.id === id) ? id : axis.defaultStep
}

/**
 * Read the persisted preference into a value the dialog can show.
 *
 * A preset id the axis no longer has falls back to its default step rather
 * than reaching the worker as a name nothing expands.
 */
export function sanitizeNewSceneDefaults(prefs?: NewSceneDefaultsPrefs): NewSceneDefaults {
  if (!prefs) return FACTORY_NEW_SCENE_DEFAULTS
  return {
    aaPreset: presetOr(SCENE_AA_QUALITY_AXIS, prefs.aaPreset),
    aoEnabled:
      typeof prefs.aoEnabled === 'boolean'
        ? prefs.aoEnabled
        : FACTORY_NEW_SCENE_DEFAULTS.aoEnabled,
    aoPreset: presetOr(SCENE_AO_PRESET_AXIS, prefs.aoPreset),
    bgcolor:
      typeof prefs.bgcolor === 'string' && prefs.bgcolor !== ''
        ? prefs.bgcolor
        : FACTORY_NEW_SCENE_DEFAULTS.bgcolor,
    useColproof:
      typeof prefs.useColproof === 'boolean'
        ? prefs.useColproof
        : FACTORY_NEW_SCENE_DEFAULTS.useColproof,
  }
}

/** Expand the preset ids into the concrete properties the worker writes. */
export function toInitialProps(defaults: NewSceneDefaults): NewSceneInitialProps {
  const aa = SCENE_AA_QUALITY_AXIS.steps.find((s) => s.id === defaults.aaPreset)
  const ao = SCENE_AO_PRESET_AXIS.steps.find((s) => s.id === defaults.aoPreset)
  return {
    ...(aa?.patch as NewSceneInitialProps),
    ...(ao?.patch as NewSceneInitialProps),
    aoEnabled: defaults.aoEnabled,
    bgcolor: defaults.bgcolor,
    use_colproof: defaults.useColproof,
  }
}
