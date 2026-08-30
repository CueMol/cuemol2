/**
 * @file features/inspector/schema/scene.ts
 * @description The Scene's pages (C++ `qsys::Scene`, node type "scene").
 *
 * The Scene has no dedicated UXP property dialog -- its rendering settings
 * were only editable through the generic property tree. These pages surface
 * the meaningful subset (ambient occlusion / GTAO, post-process
 * anti-aliasing, background colour, CMYK colour proofing).
 *
 * The AO and AA pages are deliberately preset-only, one dropdown each: the
 * individual tuning knobs stay in the generic property tree, and a hand edit
 * there reads back into the dropdown as "Custom" rather than being duplicated
 * as rows here.
 *
 * Registered under the key "Scene", which is the typeLabel `getGenericProps`
 * reports for a scene node and therefore what `PropertiesTab` resolves the
 * pages by -- not the lowercase tree node type.
 */

import { isOff } from './predicates'
import { qualityPresetRow } from '@renderer/features/inspector/rows'
import { SCENE_AA_QUALITY_AXIS, SCENE_AO_PRESET_AXIS } from '@renderer/data/sceneQualityPresets'
import type { SchemaSectionDef } from './types'
import type { PropMultiWrite } from '@renderer/features/inspector/rendererPropSections'

const ICC_INTENT_LABELS: Record<string, string> = {
  perceptual: 'Perceptual',
  relative_colorimetric: 'Relative colorimetric',
  saturation: 'Saturation',
  absolute_colorimetric: 'Absolute colorimetric',
}

/** Seeded when proofing is switched on with no profile named (UXP parity). */
const DEFAULT_ICC_PROFILE = 'GenericCMYK.icm'

export const SCENE_SECTIONS: SchemaSectionDef[] = [
  {
    key: 'scene-ao',
    title: 'Ambient occlusion',
    defaultExpanded: true,
    rows: [
      { kind: 'bool', key: 'aoEnabled', label: 'Enabled' },
      {
        kind: 'custom',
        key: 'ao-preset',
        // Nothing to preset while the effect is off.
        disabledWhen: isOff('aoEnabled'),
        Component: qualityPresetRow(SCENE_AO_PRESET_AXIS),
      },
    ],
  },
  {
    key: 'scene-aa',
    title: 'Anti-aliasing',
    defaultExpanded: false,
    // Anti-aliasing is independent of ambient occlusion, so it is never gated.
    rows: [
      { kind: 'custom', key: 'aa-preset', Component: qualityPresetRow(SCENE_AA_QUALITY_AXIS) },
    ],
  },
  {
    key: 'scene-bg',
    title: 'Background',
    defaultExpanded: false,
    rows: [{ kind: 'color', key: 'bgcolor', label: 'Color' }],
  },
  {
    key: 'scene-proof',
    title: 'Color proofing',
    defaultExpanded: false,
    rows: [
      {
        kind: 'bool',
        key: 'use_colproof',
        label: 'Enabled',
        // Proofing with no profile named does nothing, so switching it on
        // seeds a default CMYK one in the same undo step (UXP
        // `toggleSceneColorProofing`).
        commit: (ctx, on) => {
          const flag = ctx.get('use_colproof')!
          const writes: PropMultiWrite[] = [
            { key: flag.key, valueType: flag.type, value: on },
          ]
          const icc = ctx.get('icc_filename')
          if (on && icc && !String(icc.value)) {
            writes.push({ key: icc.key, valueType: icc.type, value: DEFAULT_ICC_PROFILE })
          }
          return writes
        },
      },
      { kind: 'text', key: 'icc_filename', label: 'Profile', placeholder: 'ICC profile' },
      { kind: 'mappedEnum', key: 'icc_intent', label: 'Intent', labels: ICC_INTENT_LABELS },
    ],
  },
]
