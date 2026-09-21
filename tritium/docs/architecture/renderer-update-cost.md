# Renderer Update Cost (measured, 2026-09)

## Summary

Viewing a structure is not a performance problem at any size this project has
tested. Changing one is, and the cost is not where the WebGL backend's design
would suggest: the C++/JS boundary, the vertex-buffer uploads and the uniform
uploads together account for under 4% of a frame that rebuilds geometry. The
rest is renderer-side work in `libcuemol2`, most of it per-atom overhead that
produces no geometry.

This is a record of what was measured, not a plan. Nothing here has been
changed. It exists so the next person to look at renderer performance starts
from numbers instead of from guesses, and so the residual that
[buffer-alloc-routing.md](buffer-alloc-routing.md) identified but did not
explain -- "the dominant cost of frame 0 (~172 ms, ~82%) is C++ renderer-side
geometry generation" -- has an accounting.

Measured on the `bench/perf-harness` branch, whose `tritium/bench/README.md`
has the method, the corpus and the full tables. Apple M2, macOS 26.5, Release
build, 1832x1010, three repeats per cell in separate processes, spread under 1%
of the mean.

## What holds up

Every cell that only turns the camera holds vsync, from crambin (327 atoms) to
the 80S ribosome (237,685):

| structure | atoms | renderer | fps | cpu ms | gpu ms |
|---|---:|---|---:|---:|---:|
| 1CRN | 327 | cpk | 60.0 | 0.36 | 0.81 |
| 1AON | 58,870 | cpk | 60.0 | 3.54 | 4.24 |
| 4V6X | 237,685 | cpk | 60.0 | 5.35 | 8.72 |
| 4V6X | 237,685 | ribbon | 60.0 | 5.48 | 8.66 |

At the top of the ladder the GPU uses 8.7 ms of a 16.6 ms budget. Raising the
canvas to 4.83 Mpx -- 2.6 times the pixels -- costs 1.2 to 1.4 times the GPU
time and still holds 60 fps, so it is not fill-rate bound either.

## What does not

Two things a user does routinely fall off a cliff. Changing a colour, once per
frame:

| structure | atoms | renderer | fps | cpu ms | gpu ms | alloc MB/frame |
|---|---:|---|---:|---:|---:|---:|
| 1AON | 58,870 | cpk | 25.4 | 38.9 | 4.96 | 5.7 |
| 1AON | 58,870 | ribbon | 2.8 | 346.6 | 4.90 | 78.2 |
| 4V6X | 237,685 | cpk | 5.2 | 183.8 | 9.15 | 22.8 |

And moving every atom without changing the topology, which is what trajectory
playback does:

| structure | atoms | cpk fps | ribbon fps | cpk buffers realloc/frame | ribbon buffers realloc/frame |
|---|---:|---:|---:|---:|---:|
| 1CRN | 327 | 60.0 | 60.0 | 0 | 4 |
| 4HHB | 4,779 | 60.0 | 38.1 | 0 | 4 |
| 1AON | 58,870 | 60.0 | 2.5 | 0 | 4 |
| 4V6X | 237,685 | 24.9 | 1.1 | 0 | 4 |

The GPU time in both tables is unchanged from the static case. All of it is
CPU.

The second table is the more useful one, because the two renderers differ by
design rather than by degree. `cpk` puts positions in a coordinate texture and
uploads 40-348 us of texture per frame, reallocating no vertex buffer at any
size. `ribbon` regenerates its mesh, reallocating four buffers and 185 MB per
frame at the top of the ladder. The fast path for moving atoms already exists
and works; the mesh renderers do not have it.

Colour is a separate problem from coordinates. A colour change invalidates the
whole display cache (`SplineRenderer::propChanged` -> `invalidateDisplayCache`),
so positions and normals that the change did not affect are recomputed with it.

## Where the time goes

The addon's own counters (`BenchStats`, bench branch) bound the boundary cost:

| cell | cpu ms | UBO uploads | buffer create | coord texture | accounted |
|---|---:|---:|---:|---:|---:|
| 4V6X cpk static-orbit | 5.35 | 16 us | 0 | 0 | 0.3% |
| 1AON cpk prop-change | 38.86 | 18 us | 329 us | 93 us | 1.1% |
| 1AON ribbon prop-change | 346.63 | 31 us | 11,446 us | 0 | 3.3% |
| 4V6X cpk prop-change | 183.80 | 25 us | 4,222 us | 375 us | 2.5% |

Sampling the worker thread locates the rest. Shares are of that thread's own
self time; `cuemol_internal.node` is 0.0% of it.

| area | ribbon coord-morph | cpk coord-morph | cpk prop-change |
|---|---:|---:|---:|
| mesh emission | 14.0% | 0.0% | 0.0% |
| scriptable smart pointer (`LSupScrSp`) | 8.1% | 15.6% | 18.8% |
| per-element lookup (`getAtom`/`getResidue`/`getParent`) | 6.0% | 22.8% | 14.4% |
| RTTI (`dynamic_cast`) | 5.4% | 0.0% | 11.8% |
| colour resolution | 4.3% | 0.0% | 4.5% |
| selection test | 1.1% | 6.4% | 4.0% |

The overhead concentrates in a handful of per-atom call sites:
`MolAtom::getParentResidue`, `MolAtom::getParent`, `MolResidue::getParentChain`,
`MolResidue::getAtom`, `ColSchmHolder::getColor`, `PaintColoring::getAtomColor`,
`SelCommand::isSelected`.

Two mechanisms explain them, and both are in `qlib::LScrSp`
(`src/qlib/LScrSmartPtr.hpp`):

- Its converting copy constructors do a `dynamic_cast` (lines 186, 204, 225).
  Same-type copies use the cached pointer and are cheap; the conversions are
  not. Walking one step up the molecular hierarchy returns a converted handle,
  so every `getParentResidue()` in a per-atom loop pays RTTI.
- The colouring and selection interfaces take `LScrSp<>` **by value**, so each
  atom costs a reference-counted handle constructed and destroyed.

## Candidate fixes, in the order the numbers suggest

None of these has been attempted. They are listed with what each would have to
prove, because two earlier candidates -- hoisting the per-object uniform
uploads to pass level, and giving the vertex buffers a ring or an orphaning
usage hint -- were dropped after measurement put them at 0.3% and 2.5-3.3% of
the frame respectively.

1. **Do not rebuild geometry for a colour change.** The largest single effect
   available: a colour change currently discards positions and normals too.
   Needs each renderer to be able to re-run its colour assignment over existing
   draw elements, which is a real interface change, not a local one.
2. **Give the mesh renderers a coordinate fast path.** `cpk` shows a 24x
   difference on the same structure under the same motion. Whether a spline
   mesh can be updated rather than regenerated when only coordinates move is
   an open question; the spline coefficients genuinely do change.
3. **Pass `LScrSp<>` by const reference** in `ColSchmHolder::getColor`,
   `PaintColoring::getAtomColor`, `MolColorRef::modifyColor` and the
   `isSelected` family. Mechanical, local, and worth 8-19% by the profile.
4. **Remove the `dynamic_cast` from the hierarchy accessors**, by holding the
   typed pointer rather than converting on each call. Worth 5-12%, and the same
   change helps everything that walks the hierarchy, not just rendering.
5. **Reuse the geometry `ArrayBuffer`** when a rebuild produces the same size.
   `ElecDisplayContext::allocBuffer` allocates a fresh one every time; at
   78-185 MB per frame that churn shows up as `madvise` and V8 time. This one
   is in the WebGL backend rather than the core, and it is only worth doing if
   1 and 2 do not make the rebuild rare enough to stop mattering.

3 and 4 are in `libcuemol2` and would benefit the desktop build equally. 1 and
2 are renderer interface work. Only 5 is specific to this backend.

## Caveats

- The coordinate-change scenario is driven by `MorphMol` interpolating between
  a structure and a displaced copy, not by a trajectory reader. `MorphMol::update`
  ends in `fireAtomsMoved` exactly as a trajectory frame change does, so the
  renderers see the same event, but `MorphMol::update` also does its own
  per-atom scatter, which a trajectory would not do identically. The mesh-vs-
  texture comparison is unaffected -- both renderers see the same event -- but
  the absolute `cpk` numbers carry some harness cost.
- The sampling shares come from macOS `sample`, which attributes to the nearest
  exported symbol. `libcuemol2` frames are reliable; Electron Framework frames
  are not, and are reported only as an aggregate.
- One structure (1AON) at one canvas size was sampled. The counter-based
  numbers cover the whole corpus; the profile does not.
