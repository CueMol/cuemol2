# Surface scalar colouring: `ScalarColorSupport` and `DirectSurfRendererBase`

How the surface renderers (`molsurf`, `dsurface`, `dsurf2`) colour a
surface by a scalar field (electrostatic potential ramp, multi-gradient),
and why that code now lives in one mixin plus one shared base instead of
three copies. Not a UXP migration item: the direct surface renderers
never had multi-gradient colouring in UXP either.

Date: 2026-09-03. Branch: `fix/rendgroup-name-dsurf-multigrad`.

## Problem

- `molsurf` (`MolSurfRenderer`) had `colormode = solid | potential |
  molecule | multigrad`; `dsurface` (`DirectSurfRenderer`, EDTSurf) and
  `dsurf2` (`DirectSurfRenderer2`, distance field) only had
  `potential | molecule`, although a multi-gradient is the same thing as
  the potential ramp with the stops taken from a `MultiGradient`.
- The potential block (`elepot`, `lowpar/midpar/highpar`,
  `lowcol/midcol/highcol`, `ramp_above`, `ramp_value`), its setters and the
  three-stop ramp function were verbatim copies in all three renderers,
  and the `target` (reference molecule) resolution code was a fourth copy
  that the direct surface pair never used for colouring (they colour by
  the client molecule).
- `dsurf2` computed vertex colours twice: once for its GPU primitive
  (`computeShownColors`, device codes) and once for the display-list /
  file-export path (`render()`), under a "same logic/order as render()"
  comment that had to be kept true by hand.
- An earlier attempt to share storage between `color_mapname` and
  `elepot` (`834f0217`) broke qsc loading, because a scene load runs
  `readFrom2()` and then `reapplyStyle()`, which resets every property
  still flagged "default"; whichever of the two names was still default
  wiped the other. The regression test lives in
  `src/tests/modules/surface/test_molsurf_serialize.cpp`.

## Structure

```
qsys::DispListRenderer            molstr::MolRenderer
        |                                  |
        |   molstr::ColSchmHolder          |   surface::ScalarColorSupport (mixin)
        |         |                        |         |
  surface::MolSurfRenderer         surface::DirectSurfRendererBase   <- abstract, scriptable
     (molsurf: also mixes in                    |
      ScalarColorSupport)          +------------+-------------+
                                   |                          |
                        DirectSurfRenderer            DirectSurfRenderer2
                        (dsurface: EDTSurf,           (dsurf2: distance field,
                         `surfalgor`)                  GPU path over the resolver)
```

### `ScalarColorSupport` (`src/modules/surface/ScalarColorSupport.{hpp,cpp}`)

Non-scriptable mixin in the style of `ColSchmHolder`. It owns the eleven
scalar-colouring properties and evaluates them:

| API | Meaning |
|---|---|
| `getTgtElePotName/setTgtElePotName` (`elepot`) | scalar object name for the ramp |
| `get/setLowPar/MidPar/HighPar`, `get/setLowCol/MidCol/HighCol` | the three ramp stops |
| `isRampAbove/setRampAbove`, `get/setRampValue` | sample the field `ramp_value` above the surface along the normal |
| `getMultiGrad/setMultiGrad` (`multi_grad`) | the `MultiGradient` node list |
| `getColorMapName/setColorMapName` (`color_mapname`) | scalar object name for the multi-gradient |
| `getScalarTargetName(mode)` | `elepot` for `SCM_RAMP`, `color_mapname` for `SCM_MULTIGRAD` |
| `resolveScalarObj(scene, mode)` | the named object as `qsys::ScalarObject*`, or `NULL` |
| `rampColor(par)` / `scalarColor(par, mode)` | ramp or gradient lookup |
| `samplePos(pos, norm)` | `pos`, or `pos + norm * ramp_value` with `ramp_above` |
| `getScalarColor(sca, pos, norm, mode, col)` | the whole per-vertex evaluation; `false` when nothing resolves |

Every setter calls the pure virtual `scalarColorPropChanged()`. A host
implements it as "invalidate the display cache when a scalar colour mode
is active", so the ramp stops, `ramp_above` and `ramp_value` redraw in
both the potential and the multigrad mode (before this change molsurf
ignored `ramp_above` edits in multigrad mode), and nothing redraws in
the molecule or solid modes.

The qif files keep redirecting to these accessor names; a scripting
property can redirect to a method inherited from a non-scriptable mixin
(`MolRenderer.qif`'s `coloring` is the precedent).

### `DirectSurfRendererBase` (`src/modules/surface/DirectSurfRendererBase.{qif,hpp,cpp}`)

Abstract scriptable base (`runtime_class DirectSurfRendererBase extends
MolRenderer { scriptable; abstract; smartptr; }`, the same shape as
`MainChainRenderer.qif`). It declares every property the two concrete
renderers share, so `DirectSurfRenderer.qif` only adds `surfalgor` and
`DirectSurfRenderer2.qif` adds nothing. The wrappers (`*_wrap.cpp`,
`tritium/core/src/wrappers/*.ts`) are generated at build time as usual.

The base owns:

- the property storage and setters (`colormode`, `detail`, `proberad`,
  `surftype`, `cullface`, `drawmode`, `width`, `showsel`, `vdwr_*`, the
  potential block, the multigrad block, `target`);
- `preRender` / `postRender` / `render()` (the display-list and
  file-export path) and `propChanged`;
- the per-vertex resolver used by every path:
  `beginVertexColors(env)` starts the colouring schemes and resolves the
  scalar object once, `isVertexShown(env, vert, atom)` applies `showsel`,
  `resolveVertexColor(env, vert, atom, col)` answers by mode
  (`DS_MOLFANC`: `ColSchmHolder::getColor(atom)` memoised per atom id;
  `DS_SCAPOT` / `DS_MULTIGRAD`: `getScalarColor`), and
  `endVertexColors(env)` closes the schemes.

Subclasses implement `buildMeshCache()` (fill `m_verts` / `m_faces`,
`MSVert::info` = atom id) and may override `invalidateMeshCache()` and
`onShowSelChanged()`; `dsurf2` uses both to drop or keep its GPU
primitive, and its `computeShownColors()` is now a thin loop over the
resolver that turns the returned colours into device codes.

## Contracts

- **Unresolved vertex = `defaultcolor`.** A vertex without an atom id in
  molecule mode, or any vertex when the scalar object cannot be found or
  the scheme returns nothing, is painted the renderer's `defaultcolor`.
  The old display-list loop left `gfx::Mesh`'s current colour untouched,
  so such a vertex silently inherited the previous vertex's colour; the
  GPU path had the same carry-over with `curDev`.
- **Both dsurf2 paths agree by construction** because they share the
  resolver. `Dsurf2PathsFixture.GpuAndDisplayListColorsAgree` compares
  the device code of every shown vertex between `render()` and
  `computeShownColors()` in molecule, potential and unresolved-potential
  mode.
- **Per-mode target names are stored separately** (`m_sTgtElePot`,
  `m_sColorMap`) and must never alias each other (see Problem).
- **`setupParentData("multi_grad")`** must run in the constructor of a
  class whose wrapper declares `multi_grad`; the base constructor does
  it. A gradient stop edit then reaches `propChanged` as an event whose
  parent name is `multi_grad`, and since `qsys::Renderer::propChanged`
  does not invalidate on its own, the base invalidates when the mode is
  `DS_MULTIGRAD` (dsurf2's `invalidateDisplayCache` override turns that
  into a colour-only refresh of the GPU primitive, which is what makes
  stop dragging live).
- **`DS_MULTIGRAD = 4`** matches `MolSurfRenderer::SFREND_MULTIGRAD`;
  enum values serialise by name, so the number is free, but keeping them
  equal avoids surprises in scripts.
- **`target` is a persisted string only** on the direct surface pair. It
  stays declared so old scene files still load and the value round
  trips, but no UID is resolved, no listener is attached and nothing
  reads it: colours come from the client molecule. `molsurf` keeps its
  own `target` resolution because its molecule mode really colours by a
  reference molecule through `AtomPosMap2`.
- **Sampling outside the map returns 0** (`ElePotMap::getValueAt`), so a
  large `ramp_value` with `ramp_above` pushes vertices to the mid stop
  rather than to an end stop. This is the pre-existing map behaviour,
  recorded here because the ramp tests had to be written around it.

## tritium

No UI change was needed. `ColorPane` gates the Multi-gradient item on a
`multi_grad` property probe (`multiGradCapable`), reads the `colormode`
enum definition from the live wrapper, writes `color_mapname`, and calls
`getColorMapObj()` for the map statistics / histogram; the direct surface
pair now answers all four. Only the fixtures changed:
`__test__/rendererColoringService.test.ts` (`COLORMODE_ENUMDEF`) and
`features/inspector/__fixtures__/rendererProps.json` (`dsurface` /
`dsurf2` `colormode.enumdef`). `dialog.dsurf` in
[`mapping/other_dlgs.md`](../migration/mapping/other_dlgs.md) and
`panel.coloring.shell` in
[`mapping/panels.md`](../migration/mapping/panels.md) link here.

## Tests

| File | Pins |
|---|---|
| `src/tests/modules/surface/test_scalar_color_support.cpp` | ramp stops and interpolation, coincident stops (no division by zero), gradient lookup, `samplePos`, per-mode target names, one hook call per setter, scene resolution, and that molsurf redraws ramp changes in both scalar modes |
| `src/tests/modules/surface/test_dsurf_color.cpp` (parametrised over `dsurface` / `dsurf2`) | potential and multigrad colours on a synthetic x-valued `ElePotMap`, `defaultcolor` fallback for an unresolved map in both modes, `ramp_above` changing the sampled colours, which setters redraw in which mode (incl. `setNodesJSON` through the nested-property path), qsc round trips of `elepot` / `color_mapname` / `target`, legacy potential and multigrad qsc files, and the dsurf2 GPU / DL parity |
| `src/tests/modules/surface/test_molsurf_serialize.cpp` | the `color_mapname` / `elepot` separation on molsurf (unchanged; helpers moved to `qsc_roundtrip_util.hpp`) |

Run them with `cd build_scripts && task build_libcuemol2 && task run_gtest`
(binary: `test_surface`).

## Not done / later

- `molsurf` still has its own vertex loop (its molecule mode maps
  positions to atoms through `AtomPosMap2`, the direct surfaces carry the
  atom id on the vertex); it only shares the mixin, not the resolver.
- The MSMS surface algorithm option of `dsurface` (`surfalgor = msms`) is
  still unimplemented (`buildMeshCache` asserts on it), unchanged here.
- The per-atom colour memo assumes a colouring scheme answers the same
  for the same atom within one `start()` / `end()` pass, which every
  scheme in `molstr` satisfies today.
