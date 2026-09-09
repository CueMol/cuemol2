# umbreon group-alpha blend — the pass weights are a partition of unity

Why section transparency ("group alpha") in the umbreon backend is realised as
a multi-pass blend whose weights must sum to exactly 1, what breaks when they
do not, and why the background coefficient is allowed to go negative. Written
up after opaque renderers blew out to white in a scene with two nearly-opaque
sections (fixed in [CueMol/umbreon#66](https://github.com/CueMol/umbreon/pull/66),
host-verified from tritium on 2026-07-25), and extended after black edge lines
came out **white** under two translucent sections of the same alpha — the same
formula, read per pixel (see "Sections sharing an alpha are one veil").

Related: [umbreon の Electron メモリ制約と process 分離設計](../plans/umbreon-process-isolation-plan.md).

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
    + sum_i a_i       * render(scene with veil i kept, other veils hidden)
```

where `i` runs over **veils**: entries sharing an alpha are one veil (see
below), so the host's per-section entries are the input, not the layer list.

## The defect: clamping the background weight

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

## Sections sharing an alpha are one veil

A second scene (`transp/transp_test1.qsc`: `dsurf2 @0.6`, `ballstick @1.0` with
black edge lines, `cpk @0.6`) drew those **black edge lines white**. The log
read `sum=1.200, bg weight=-0.200`: two sections at the same alpha reached
umbreon as two separate blend entries, so that one veil was counted twice.

The formula above is a global weighted sum, but its effect is per pixel. For a
pixel covered by the veil set `K`, collapsing the passes gives

```
out = (1 - sum_{i in K} a_i) * B  +  sum_{i in K} a_i * S_i
```

because a veil pass shows the opaque geometry `B` wherever its own veil does
not cover. So a pixel under **one** 0.6 veil is fine (`0.4*B + 0.6*S`) even
with a negative global weight — that is why nothing looked wrong outside the
overlap. Where **both** 0.6 veils cover, the coefficient of `B` is `-0.2`, and
a negative coefficient inverts contrast: black ink contributes nothing while
its lit surroundings subtract, so the ink comes out the brightest thing in the
frame.

The fix bucket the entries by alpha in umbreon's `renderImpl` (1e-4 tolerance;
first appearance names the veil's alpha and its pass order), one pass per
**distinct** alpha showing every group of that veil. Two 0.6 sections are then
one 0.6 veil, `bg weight = 0.4`, and the scene renders in 2 passes instead of 3.

**Why the merge is umbreon's and not the host's.** `appendIntData` assigns the
transparency group id, but that id is also the key of the edge-group table
(`edgeGroupOf` -> `Scene::edgeGroupOfGroup`), of `Scene::groupHatchStyle` and of
the objectId AOV. `edgeGroupFor(group)` is a *function of group id*, so two
sections sharing an id could not sit in different edge groups at all — merging
ids host-side would silently collapse edge groups. The id therefore stays a
per-section **identity**; the veils (by alpha) and the edge groups (by the
table) partition the same ids independently, and any combination is
expressible. The legacy POV path merged in the same place: the layering lives
in the render driver (`povrender.js`), not in section identity.

The host consequently stopped restating the arithmetic: its log line now reports
only which sections are translucent and at what alpha, and umbreon logs the
veil/weight table (`group-alpha: 2 blend group(s) -> 1 veil(s), sum 0.600, bg
weight 0.400`) plus a warning whenever the background weight is still negative.

## Per-pixel compositing (the overlap case)

Merging equal alphas removes the reported defect but not its cause: the weights
are global while the coverage set is per pixel, so two **distinct** alphas that
sum above 1 (0.6 + 0.5) still give an overlapped pixel a negative background
coefficient. No choice of global weights fixes that, and rescaling the alphas to
force the sum under 1 would change the transparency the user asked for.

umbreon therefore has a second mode (`RenderOptions::groupBlendMode`, exposed as
the `perPixelBlend` render setting and the Rendering window's *Per-pixel
transparency* switch, default **off**). It composites at the stage where coverage
still exists -- the supersampled, linear frame, before the box-downsample that
turns per-sample coverage into partial pixels -- with weights built per sample
from the veils covering it:

```
T   = prod_{i in K} (1 - a_i)              the background's weight
w_i = a_i * (1 - T) / sum_{j in K} a_j
```

Properties: non-negative and summing to 1 for any alphas and any `K`, so nothing
inverts; `T > 0` always (an alpha-1 section is not a veil), so what lies behind a
veil is never lost; and a sample covered by a SINGLE veil reproduces that veil's
alpha exactly (`T = 1 - a`, `w = a`) -- the alphas are never approximated. The
difference from the layer mode is confined to overlaps, where the background
keeps its physical transmittance (0.6 and 0.5 leave 0.2) instead of going
negative. Note the mode also mixes in **linear light**, so even a single veil is
numerically a little different from the layer mode, which mixes the
display-encoded finished frames as blendpng did.

Cost is unchanged (one pass per veil plus one), and only three extra hi-res
buffers are needed -- the veils' weighted color, the alpha sum and the
transmittance product -- so no pass's color has to be kept and nothing is
rendered twice. Coverage comes from the pass depths: both passes trace the same
opaque geometry, so a veil covers a sample exactly when that pass's frontmost hit
is nearer than the background pass's.

What it does not do: the weights are order-free, so within an overlap the veils
do not attenuate each other by depth (a true front-to-back `over` would need a
depth buffer per veil). Shadow / GI interaction between veils stays the
per-pass approximation it always was.

Pinned by `UmbreonExport.PerPixelBlendKeepsDarkFeatureUnderDistinctAlphas`
(host, 0.6 + 0.5 over a dark feature) and umbreon's `P1` / `P2` / `P3` in
`tests/test_render_transparency.cpp` (overlap weights, a lone veil's exact
alpha, and edge groups staying independent of the veils).

## Consequences and limits

- Scenes with several nearly-opaque renderers render correctly. libcuemol2
  needed no change: it was already feeding umbreon the same weights POV-Ray
  gets.
- libcuemol2 now requires an umbreon at or after that fix. CI builds umbreon
  from source at `UMBREON_GIT_REF` (`build_scripts/deplibs.env`, currently
  `main`), so the umbreon change had to land first. A local checkout with a
  stale umbreon fails the regression test — which is the intended signal.
- Veils that **overlap each other** can still overshoot, but only with two or
  more **distinct** alphas: 0.6 + 0.5 in one pixel yields
  `-0.1*B + 0.6*G1 + 0.5*G2`, which inverts `B` there exactly as the same-alpha
  case did. This is inherent to a model that weights whole frames; blendpng
  behaves the same way. umbreon warns when the background weight goes negative,
  so the case is announced instead of silent, and the per-pixel mode above is
  the fix for it (opt-in).
- One extra full render pass per **veil** is the cost of the model, so equal
  alphas are also cheaper: the log lines make both visible (host: which sections
  are translucent; umbreon: groups -> veils and the weights).

## Why POV-Ray never showed it

`PovDisplayContext::startSection` quantises the alpha to one decimal digit for
its `m_blendTab` string key and returns early when `intalp >= 10`, so
`alpha >= 0.95` is treated as fully opaque and never becomes a blend layer.
The same table also merges all sections sharing a quantised alpha into one
layer. Neither is a deliberate guard — both fall out of the string-keyed blend
table — but together they keep POV-Ray out of the `sum > 1` region for this
scene. umbreon has no such constraint and correctly keeps `alpha = 0.95` as a
95% blend; that divergence in the `[0.95, 1.0)` range is intentional and not
"fixed" by matching POV's cutoff.

Merging equal alphas, on the other hand, is a real rule and umbreon now has it
(above). Only POV's **quantisation** is the accident: `povrender.js:329` renders
the quantised weight (`0.<key>`), so 0.64 and 0.55 both come out as 0.6. umbreon
merges within 1e-4 and renders the alpha it was given.

## Reproduction

`src/tests/modules/rendering/test_umbreon_export.cpp`
`OpaqueSectionSurvivesTwoTranslucentSections`: a bright opaque triangle plus
`N` translucent sections placed off to the sides so they never cover it.

| translucent sections | `sum(alpha)` | pass weight total | opaque pixel |
|---|---|---|---|
| 0 | 0.00 | 1.00 | 217 |
| 1 (0.95) | 0.95 | 1.00 | 217 |
| 2 (0.95 + 0.9) | 1.85 | 1.00 | 217 |

(The two-section case uses **distinct** alphas: equal ones are now one veil and
would not reach `sum > 1` at all.)

The same-alpha inversion is pinned by
`UmbreonExport.DarkFeatureStaysDarkUnderTwoSameAlphaSections` in the same file:
a black patch on an opaque section, covered by two 0.6 sections, must stay
darker than the lit part of that section (both sampled pixels sit under both
veils, so the veil term cancels and only the background weight is compared).

umbreon's own unit-level guards are `T9` (distinct alphas keep the negative
background weight) and `T10` (equal alphas are one veil) in
`tests/test_render_transparency.cpp`.

## Implementation pointers

- `src/modules/rendering/UmbreonDisplayContext.cpp` — `appendIntData` assigns
  one group per section and pushes the `groupBlend` entry; `render()` hands
  `scene.groupBlend` over and logs which sections are translucent (the veil /
  weight table is umbreon's and is logged there).
- `src/utils/blendpng.cpp` — `solvebeta` (`:281`) and the lerp chain
  (`:466-480`). Expanding it for `beta = [0.9, 0.8]` gives coefficients
  `(-0.7, 0.9, 0.8)`, summing to 1: the reference for the closed form above.
- umbreon: `src/umbreon/umbreon.cpp` `renderImpl`, `src/umbreon/scene.hpp`
  `GroupBlend`.
