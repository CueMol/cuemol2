# ADR-0041: umbreon group-alpha blend — the pass weights are a partition of unity

- Status: accepted
- Date: 2026-07-25
- Mapping rows: [`dialog.tool.render-pov`](../mapping/tool_dlgs.md#dialogtoolrender-pov)
- Related: [ADR-0039](ADR-0039-umbreon-pt2-integrator.md) (the umbreon backend),
  [ADR-0017](ADR-0017-povray-rendering-ui.md) (the POV-Ray pipeline this mirrors)

## Context

Rendering a scene with the umbreon backend blew **opaque** renderers out to
pure white. The reproducing scene had two renderers at `alpha = 0.95` and the
rest at `alpha = 1.0`; the white-out hit the opaque ribbon, which the
translucent renderers did not even overlap. POV-Ray rendered the same scene
correctly.

Section transparency ("group alpha") is CueMol's `blendpng` post-process:
instead of blending each overlapping primitive of a renderer over the next
(which double-darkens the overlaps), the whole section is rendered opaque in
its own pass and the finished frames are combined. `UmbreonDisplayContext`
maps one CueMol section to one umbreon transparency group and hands umbreon a
`Scene::groupBlend` entry `{group, alpha}` per translucent section
(`appendIntData`). umbreon realises that as the closed form of blendpng's
`solvebeta` + front-to-back lerp chain:

```
out = (1 - sum_i a_i) * render(scene minus every blend group)
    + sum_i a_i       * render(scene with group i kept, other groups hidden)
```

## Decision

The defect is in umbreon, not in libcuemol2. `renderImpl` clamped the
background coefficient at zero:

```cpp
const float bgW = std::fmax(0.0f, 1.0f - sumA);
```

**The pass weights must sum to exactly 1.** Geometry outside every blend group
— all the opaque renderers — appears identically in every pass, so it is
reproduced unchanged only while `(1 - sum) + sum == 1`. Clamping leaves the
total at `sum`, scaling the whole frame by that factor. With two sections at
0.95 the factor is 1.9; `srgbDecodeF` clamps its input to `[0, 1]`, so every
pixel above `srgbEnc(C) >= 1/1.9 ~ 0.53` (linear ~0.24, i.e. mid-grey and up)
collapses to pure white.

A negative background coefficient is the correct value, not an error state:
blendpng produces `1 - sum(beta)` directly and lets it go negative, clamping
only the final pixel. Fixed in
[CueMol/umbreon#66](https://github.com/CueMol/umbreon/pull/66) by taking
`1.0f - sumA` as it is and dropping the "weights sum to > 1" warning.

libcuemol2 keeps a cross-layer regression test
(`UmbreonExport.OpaqueSectionSurvivesTwoTranslucentSections`) and logs the
blend table it hands to umbreon (`Umbreon> group alpha: ...`, including the
background weight).

## Consequences

- Scenes with several nearly-opaque renderers render correctly. libcuemol2
  needed no change: it was already feeding umbreon the same weights POV-Ray
  gets.
- libcuemol2 now requires an umbreon at or after that fix. CI builds umbreon
  from source at `UMBREON_GIT_REF` (`build_scripts/deplibs.env`, currently
  `main`), so the umbreon change had to land first. A local checkout with a
  stale umbreon fails the regression test — which is the intended signal.
- Two blend groups that **overlap each other** can still overshoot: asking for
  0.95 + 0.95 in one pixel yields `-0.9*B + 0.95*G1 + 0.95*G2`, which can
  exceed 1 and clip. This is inherent to the model and blendpng behaves the
  same way; not addressed.
- One extra full render pass per translucent section remains the cost of the
  model. The new log line makes that visible (`N of M sections`).

## Notes

### Why POV-Ray never showed it

`PovDisplayContext::startSection` quantises the alpha to one decimal digit for
its `m_blendTab` string key and returns early when `intalp >= 10`, so
`alpha >= 0.95` is treated as fully opaque and never becomes a blend layer.
The same table also merges all sections sharing a quantised alpha into one
layer. Neither is a deliberate guard — both fall out of the string-keyed blend
table — but together they keep POV-Ray out of the `sum > 1` region for this
scene. umbreon has no such constraint and correctly keeps `alpha = 0.95` as a
95% blend; that divergence in the `[0.95, 1.0)` range is intentional and not
"fixed" by matching POV's cutoff.

### Reproduction

`src/tests/modules/rendering/test_umbreon_export.cpp`
`OpaqueSectionSurvivesTwoTranslucentSections`: a bright opaque triangle plus
`N` translucent sections placed off to the sides so they never cover it.

| translucent sections | `sum(alpha)` | pass weight total | opaque pixel |
|---|---|---|---|
| 0 | 0.00 | 1.00 | 217 |
| 1 (0.95) | 0.95 | 1.00 | 217 |
| 2 (0.95 x 2) | 1.90 | 1.90 | 255 (white) |

umbreon's own unit-level guard is `T9` in
`tests/test_render_transparency.cpp`.

### Implementation pointers

- `src/modules/rendering/UmbreonDisplayContext.cpp` — `appendIntData` assigns
  one group per section and pushes the `groupBlend` entry; `render()` hands
  `scene.groupBlend` over and logs the summary.
- `src/utils/blendpng.cpp` — `solvebeta` (`:281`) and the lerp chain
  (`:466-480`). Expanding it for `beta = [0.9, 0.8]` gives coefficients
  `(-0.7, 0.9, 0.8)`, summing to 1: the reference for the closed form above.
- umbreon: `src/umbreon/umbreon.cpp` `renderImpl`, `src/umbreon/scene.hpp`
  `GroupBlend`.
