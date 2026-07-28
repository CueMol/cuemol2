# ADR-0042: Umbreon quality presets — a Lighting method plus one dropdown per independent quality axis

- Status: accepted (host E2E pending)
- Date: 2026-07-28
- Mapping rows: [`dialog.tool.render-pov`](../mapping/tool_dlgs.md)
- Related: [ADR-0035](ADR-0035-render-window.md) (the Rendering window and its
  Render / Image tabs), [ADR-0040](ADR-0040-animation-rendering.md) (movie
  rendering, which uses the same settings)

## Context

`UmbreonSceneExporter` exposes a couple of dozen render properties. Presented
as flat accordion groups they gave no usable answer to "make this look good":
the user had to know that AO and GI are alternatives, that supersample costs
`ss²`, that AO samples and GI samples live on different scales, and that
shadows are independent of both.

The umbreon repository documents exactly this problem and its intended client
UI in `docs/quality_presets.md`: decompose `RenderOptions` into a few
independent axes, give each a 3-4 step ladder, and let a client drive them
either per axis or from one composite dropdown (its section 6).

Three of its findings shaped this work:

- **The axes are independent.** Image quality, the depth cue and shadows have
  nothing to do with each other, so each is set on its own rather than folded
  into a single overall level (the guide's "per-axis dropdown" mode).
- **AO and GI are alternatives, not switches.** Both express "concave dark,
  convex bright" by different means; enabling both is meaningless, and some
  AO accelerations are not supported alongside GI. The guide recommends a
  single "method" selector.
- **Quality axes must be separated from look axes.** Raising `giBounces` with
  spp makes a step brighter and flatter — a *different picture*, not a better
  one. Only settings that converge to the same image belong in a ladder.

Two live defects on our side also surfaced:

- umbreon's `aoDiffuseFactor` defaults to `0.0`, so AO darkens only the ambient
  term. CueMol's default lighting puts most of its energy in the direct lights,
  so AO as wired was very nearly invisible — and, with `aoResDiv` unset, always
  ran the exact per-hit gather (the guide measures 256 spp inline at roughly
  50x the coarse-grid recipe). Neither property was exposed by the `.qif`.
- `aoDistance` was a fixed world radius, which the guide explicitly warns
  against: AO only finds occluders inside that radius, so one setting darkened
  a small peptide and did nothing on a large complex.

## Decision

Add backend-declared quality axes (`RenderQualityConfig` in
`data/renderSettings.ts`, `UMBREON_QUALITY` in `data/renderBackends.ts`) and
render them as a Quality section at the top of the Rendering window's Render
tab: a **Lighting** dropdown (Raytrace only / Ambient Occlusion / Global
Illumination) followed by one dropdown per axis that applies to the selected
method.

| Axis | Dropdown | Steps | Writes |
|---|---|---|---|
| A | Supersampling | 1x (off) / 2x / 3x / 4x | `supersample` |
| B-AO | AO quality | Low / Medium / High | `aoSamples` + the AO recipe flags |
| B-GI | GI quality | Low / Medium / High / Reference | `giSamples`, `denoise` |
| C | Shadows | Off / Hard / Soft / Very soft | `shadows`, `shadowSamples`, `lightRadius` |

- **One axis, one dropdown.** Axis B's dropdown swaps with the method (and
  disappears for Raytrace only); A and C are always shown, because they are
  unrelated to which depth cue is active. Each axis' steps are the guide's own
  (`Low/Medium/High` for AO, `+ Reference` for GI).
- **Supersampling is plain grid only.** umbreon's adaptive AA (`aaMode` /
  `aaDepth`) refines just the pixels an edge crosses and would make the low
  steps far cheaper -- but it is unsupported alongside GI, so the same step
  would mean a different thing per lighting method (and "1x" would go from a
  3x3 edge lattice to no antialiasing at all). It is therefore wired in C++
  and left out of the UI; `UmbreonDisplayContext` still forces grid under GI
  so a scripted caller cannot hit umbreon's warning-and-fallback path. The
  step also governs edge-line quality, which resolves at the supersample
  factor regardless of any AA refinement -- hence 3x as the default.
- **Look knobs stay out of the ladders.** GI intensity / environment, AO
  distance / intensity and the edge settings are in no patch, so a step only
  trades noise and edge quality for time.
- **Lighting is derived, never stored.** `lightingOf()` reads the method from
  `aoEnabled` / `useGI`, so the selector cannot disagree with the props it
  represents. Switching method writes the exclusive pair and re-applies that
  method's axis at its selected step; the shared axes are left alone.
- **Steps write real props; manual edits win.** A step writes into the same
  `PropDef` values the accordions edit, and editing a prop drops *only its
  owning axis* to Custom (`axisOwning`) — the other dropdowns still describe
  their props correctly. The snapshot / `UmbreonBackend` path is unchanged:
  steps produce ordinary prop values.
- **The unselected method's group disappears** from the accordions, along with
  the `aoEnabled` / `useGI` switches the selector now owns.
- **Defaults are applied on backend selection**, not left at each prop's
  declared value: GI (the guide's recommended depth cue) at Medium, 3x
  supersampling, shadows off. So the dropdowns describe the actual values from
  the first render.
- **The Camera group follows the render target.** Picking a target view reads
  its projection over a `RENDER_VIEW_CAMERA_GET` round trip (the same shape as
  the existing view-size trip, since the view lives in the main window's
  worker) and defaults `projection` to it, so a render starts from what the
  user is looking at. Only settings with a real counterpart are taken: the
  view's stereo mode is a DISPLAY mode (parallel / cross / hardware) while the
  render's stereo picks an eye, so stereo is left alone, and `clipPlane` /
  `edgeLines` already default to what the GL view shows.

libcuemol2 gained the properties these axes need:

- AO recipe: `aoDiffuseFactor`, `aoMultiScale`, `aoBentNormal`,
  `aoLowDiscrepancy`, `aoResDiv`. The renderer-side default for
  `aoDiffuseFactor` is the recipe value `1.0`, not umbreon's `0.0`; the C++
  constructor keeps umbreon's default so a caller that sets nothing renders as
  before. `aoResDiv` is surfaced as an `aoGather` enum ("Per output pixel" =
  coarse grid, "Per shading hit" = exact) rather than a raw divisor.
- Antialiasing: `aaMode`, `aaDepth`.
- **Scene-scaled AO radius**: `aoDistance <= 0` now means "derive it from this
  scene". `UmbreonDisplayContext` takes the bounding box of everything it
  built — mesh triangles *plus* spheres and cylinders, since a CPK or
  ball-and-stick representation has no triangles at all — and uses 0.7x its
  diagonal, mid-range of the guide's 0.5-0.85. This mirrors umbreon's own auto
  distances (`giMaxDistance`, `giRecordSpacing`). The UI default is 0, so AO
  strength no longer depends on molecule size; a positive value still pins a
  fixed world radius.

## Consequences

- "Make this look good" is a short list of dropdowns, each answering one
  question, and each axis can be moved without disturbing the others.
- AO is finally visible: `aoDiffuseFactor = 1.0` is what lets it darken the
  direct diffuse term under CueMol's mostly-direct lighting. Anyone who had
  tuned around the old, nearly-invisible AO will see a stronger effect.
- AO strength is now scene-independent, but the auto radius is derived from
  the *whole* scene: a very elongated or sparsely occupied scene gets a larger
  radius than its local feature scale would suggest. The fixed-radius override
  remains for that case.
- The umbreon defaults changed (GI on at Medium, 2x supersampling, adaptive
  AA), so a default render differs from before — deliberately, since the old
  default was flat local shading at 3x grid.
- AO at High deliberately uses the exact per-hit gather at 256 samples, which
  the guide measures in tens of seconds. GI reaches comparable depth far faster
  (its denoiser makes low sample counts usable), which is why the guide — and
  this table's `defaultLighting` — treat GI as the better depth cue.
- POV-Ray declares no `quality` table, so its editor is unchanged; the section
  simply does not render.

## Notes

- Implementation pointers:
  - Axes + helpers: `data/renderSettings.ts` (`RenderQualityConfig`,
    `RenderQualityAxis`, `axesFor`, `stepPatch`, `lightingPatch`,
    `lightingOf`, `axisOwning`), `data/renderBackends.ts` (`UMBREON_QUALITY`,
    the new AA / AO props).
  - State: `hooks/useRenderSettings.ts` (`lighting`, `qualitySteps`,
    `setLighting`, `setQualityStep`; per-axis Custom fallback inside
    `handleChange`; `backendPropsWithDefaults` on backend selection).
  - UI: `components/inspector/RenderSettingsEditor.tsx` (Quality section,
    per-axis dropdowns, inactive-method group filtering).
  - Mapping to the renderer: `renderBackends/UmbreonBackend.ts` (`AO_GATHER`,
    `AA_MODE`).
  - libcuemol2: `src/modules/rendering/UmbreonSceneExporter.{qif,hpp,cpp}`,
    `UmbreonDisplayContext.{hpp,cpp}` (`UmbreonRenderParams` ->
    `RenderOptions`, `sceneDiagonal`).
  - Tests: `__test__/useRenderSettings.test.ts` (per-axis application, method
    exclusivity, per-axis Custom fallback), `__test__/renderSettingsEditor.test.tsx`
    (which axes are shown per method, step reporting), and the gtests
    `UmbreonExport.AoDiffuseFactorDarkensOccludedGeometry` /
    `AutoAoDistanceScalesWithTheScene` / `AdaptiveAaRefinesEdges` /
    `AoRecipeFlagsReachTheRenderer`.
- Upstream source of the values: umbreon `docs/quality_presets.md` sections
  1 (axis A), 2a (AO), 2b (GI), 3 (shadows) and 6 (the composite bundle).
- Known gaps, deliberately out of scope here:
  - GI's ambient energy split (`scene.ambientColor`) is fixed in
    `UmbreonDisplayContext`; the guide treats it as a client-tuned balance.
  - Adaptive AA is reachable only from a script (`aaMode` / `aaDepth` on the
    exporter). Offering it in the UI needs a per-method answer to "what does
    this step mean under GI"; `aaThreshold` stays unexposed either way.
  - The axes are not persisted: like every render setting they reset when the
    Rendering window closes (see ADR-0035).
