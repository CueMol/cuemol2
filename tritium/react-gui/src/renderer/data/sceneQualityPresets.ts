/**
 * @file data/sceneQualityPresets.ts
 * @description Preset ladders for the Scene inspector's live-view GTAO /
 * post-AA sections, in the shape of the umbreon render-quality axes
 * (`RenderQualityAxis`): each axis is one dropdown whose step is DERIVED from
 * the live property values (never stored) and whose selection applies its
 * patch as one undo step.
 *
 * Contracts (mirroring renderSettings.ts / renderBackends.ts):
 * - Every step of an axis writes the same keys.
 * - The default step's patch must exactly match the C++ property defaults
 *   (Scene.qif), so a fresh scene reads as that step and not as Custom.
 * - The AO axis is a tuned LOOK set, not a pure quality ladder: aoRadius is
 *   the depth-reach knob the user actually changes, aoSteps rises with it so
 *   the wider radius is not undersampled (cost is slices*steps, linear), and
 *   aoIntensity falls to keep large radii from crushing the image to black.
 *   aoSlices is deliberately absent: it barely changes the denoised image
 *   (and gtao_frag.glsl clamps it to 16).
 * - aoHalfRes rides along with that cost: Medium and High raise the per-pixel
 *   AO work, so they take the adaptive half-resolution path (half-res only
 *   while the camera moves, full res once it settles, always full res for
 *   off-screen export) to keep tumbling responsive. Low is cheap enough to
 *   stay full resolution, which is also the C++ default the default step must
 *   match.
 */
import { RENDER_QUALITY_CUSTOM } from "./renderSettings";
import type { RenderQualityAxis } from "./renderSettings";

/** AO look preset: depth reach + sampling to match + darkness compensation. */
export const SCENE_AO_PRESET_AXIS: RenderQualityAxis = {
  key: "sceneAoPreset",
  label: "Preset",
  defaultStep: "low",
  steps: [
    // = C++ defaults (Scene.qif)
    { id: "low", label: "Low", patch: { aoRadius: 4, aoSteps: 3, aoIntensity: 2.2, aoHalfRes: false } },
    { id: "medium", label: "Medium", patch: { aoRadius: 8, aoSteps: 4, aoIntensity: 1.9, aoHalfRes: true } },
    { id: "high", label: "High", patch: { aoRadius: 12, aoSteps: 5, aoIntensity: 1.7, aoHalfRes: true } },
  ],
};

/**
 * AA quality: spatial method plus temporal jitter supersampling. Jitter only
 * accumulates while the camera is still (idle-driven), so High/Ultra cost
 * convergence time after the view settles, not interactivity. Picking SMAA in
 * the Method row reads as Custom here (a tuning choice outside the ladder).
 */
export const SCENE_AA_QUALITY_AXIS: RenderQualityAxis = {
  key: "sceneAaQuality",
  label: "Quality",
  defaultStep: "standard",
  steps: [
    { id: "off", label: "Off", patch: { aa_method: "none", aaJitterLevel: 0 } },
    // = C++ defaults (Scene.qif)
    { id: "standard", label: "Standard (FXAA)", patch: { aa_method: "fxaa", aaJitterLevel: 0 } },
    { id: "high", label: "High (FXAA + 8x SS)", patch: { aa_method: "fxaa", aaJitterLevel: 3 } },
    { id: "ultra", label: "Ultra (FXAA + 32x SS)", patch: { aa_method: "fxaa", aaJitterLevel: 5 } },
  ],
};

/**
 * `stepOf` variant with epsilon comparison for numbers. The AO patch holds
 * reals (aoIntensity 2.2/1.9/1.7) whose C++ double -> JSON -> JS number round
 * trip must not break the strict === used by renderSettings.stepOf.
 */
export function sceneStepOf(
  axis: RenderQualityAxis,
  read: (key: string) => string | number | boolean | undefined,
): string {
  const eq = (a: unknown, b: unknown) =>
    typeof a === "number" && typeof b === "number" ? Math.abs(a - b) < 1e-6 : a === b;
  for (const step of axis.steps) {
    if (Object.entries(step.patch).every(([key, value]) => eq(read(key), value))) {
      return step.id;
    }
  }
  return RENDER_QUALITY_CUSTOM;
}
