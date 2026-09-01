/**
 * @file worker/shared/newSceneTypes.ts
 * @description The scene properties a freshly created scene starts with.
 *
 * The renderer resolves its preset ids (`data/newSceneDefaults`) into these
 * concrete values before handing them over, so the worker never needs to know
 * what a preset is and `data/` stays out of the worker bundle. Every field is
 * optional: an absent one leaves the C++ default alone.
 */

export interface NewSceneInitialProps {
  /** Post-process AA method: 'none' | 'fxaa' | 'smaa' (a C++ enum, by id). */
  aa_method?: string
  /** Temporal jitter supersampling level, 0 (off) .. 5. */
  aaJitterLevel?: number
  aoEnabled?: boolean
  aoRadius?: number
  aoSteps?: number
  aoIntensity?: number
  aoHalfRes?: boolean
  /** A CueMol colour string ('#rrggbb', 'hsb(...)', a named colour). */
  bgcolor?: string
  /** CMYK colour proofing; enabling it also seeds a profile when none is set. */
  use_colproof?: boolean
}
