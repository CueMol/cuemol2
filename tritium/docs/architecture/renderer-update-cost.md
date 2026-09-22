# Renderer Update Cost (measured, 2026-09)

## Summary

Viewing a structure is not a performance problem at any size this project has
tested. Changing one is, and the cost is not where the WebGL backend's design
would suggest: the C++/JS boundary, the vertex-buffer uploads and the uniform
uploads together account for under 4% of a frame that rebuilds geometry. The
rest is renderer-side work in `libcuemol2`, most of it per-atom overhead that
produces no geometry.

This exists so the next person to look at renderer performance starts from
numbers instead of from guesses, and so the residual that
[buffer-alloc-routing.md](buffer-alloc-routing.md) identified but did not
explain -- "the dominant cost of frame 0 (~172 ms, ~82%) is C++ renderer-side
geometry generation" -- has an accounting.

Apple M2, macOS 26.5, Release build, 1832x1010, three repeats per cell in
separate processes, spread under 1% of the mean.

The measurements come from a benchmark harness that is **not on this branch**.
It lives on `bench/perf-harness`, which is never merged here: it adds a
`--bench` mode to the application, accumulating timers inside the addon, and a
GL call-counting proxy, none of which belong in a release. That branch's
`tritium/bench/README.md` has the method, the corpus (structures fetched from
RCSB by `fetch.sh`) and the full tables; `profile_report.py` there reduces a
macOS `sample` call graph to the areas quoted below. Reproducing any number
here means starting from that branch, which takes `develop` periodically.

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

### Why the sphere renderer falls off at 237,685 atoms

`cpk` holds 60 fps under `coord-morph` up to 58,870 atoms and drops to 24.9
(26.0 ms of CPU, 6.4 ms of GPU) at 237,685. Sampling that cell, with inclusive
shares of the worker thread:

| | share |
|---|---:|
| `MolCoord::getAtom(int)`, all callers | 55.1% |
| `MorphMol::update` (writing the new positions) | 32.6% |
| `CPK2Renderer::updateCoordTex` (reading them back) | 31.4% |
| `AtomIterator::first` | 20.5% |
| `isSelected` | 18.2% |
| `SelectionRenderer::display` | 11.4% |
| the texture upload itself (`EcFloatDataTexture`) | 0.8% |
| the draw itself (`SphereIdxGpuPrim::draw`) | 0.1% |

The work the frame exists to do is 0.9% of it. The rest is resolving atom IDs
back to atoms:

- **`MolCoord::getAtom(int)` is over half the frame.** `updateCoordTex` caches
  atom *IDs* in `m_aidcache` and looks each one up again every frame, and
  `MorphMol::update` does the same from `m_id2aid`; each lookup is a map probe
  returning a reference-counted `MolAtomPtr` that is immediately destroyed.
  At 237,685 atoms that is several hundred thousand probes and handle
  round-trips per frame, for coordinates whose addresses did not change.
- **`SelectionRenderer` spends 11.4% drawing nothing.** With an empty
  selection its `updateCoordTex` returns false on `m_aidcache.empty()`, so
  `display()` calls `invalidateDisplayCache()` and returns; the next frame
  finds the GpuPrim invalid, runs `renderCoordTexImpl`, walks every atom
  evaluating the selection, produces no geometry, and leaves the GpuPrim
  invalid again. The loop repeats for as long as nothing is selected, which is
  the normal case.

Caching the atom pointers rather than the IDs would remove the first, and not
re-entering the rebuild path on an empty selection the second -- together about
three quarters of this frame, which would put 237,685 atoms back at 60 fps.
The `MorphMol::update` share is partly an artefact of how this scenario drives
the coordinates (see the caveats); the renderer-side shares are not.

## What was changed, and what it cost

Candidates 3 to 5 below were superseded: rather than making the per-atom
lookups cheaper, the coordinate array became the source of truth and the
lookups went away. `AnimMol` owns the array, `update()` fills it from the frame
data, each atom holds a binding to its slot so `getPos()` reads it from there,
and the coordinate-texture renderers resolve an atom to an array index once at
build time. Separately, a renderer that finds nothing to draw now remembers it
instead of rebuilding its layout every frame.

Same machine and corpus as the tables above, three repeats per cell:

| cell | before | after |
|---|---|---|
| 4V6X `coord-morph` | 24.9 fps, 26.01 ms CPU | **60.0 fps, 1.58 ms** |
| 1AON `coord-morph` | 60.0 fps, 7.32 ms CPU | 60.0 fps, **0.78 ms** |
| 4HHB `coord-morph` | 60.0 fps, 1.57 ms CPU | 60.0 fps, **0.33 ms** |
| 4V6X `static-orbit` | 60.0 fps, 5.35 ms CPU | 60.0 fps, **0.30 ms** |
| 1AON `static-orbit` | 60.0 fps, 3.54 ms CPU | 60.0 fps, **0.31 ms** |

Static-viewing CPU is now flat at about 0.3 ms from 327 atoms to 237,685,
where it used to climb with the structure -- that climb was the empty-selection
rebuild, not the drawing. GPU time is unchanged either side (8.46 against
8.72 ms at 4V6X), which is the check that the picture did not change.

Sampling the same two cells afterwards:

| | before | after |
|---|---:|---:|
| `coord-morph`: `MolCoord::getAtom`, all callers | 55.1% | **0.0%** |
| `coord-morph`: `MorphMol::update` | 32.6% | 2.6% |
| `coord-morph`: `CPK2Renderer::updateCoordTex` | 31.4% | 6.1% |
| `coord-morph`: `Scene::display` | 65.0% | **6.7%** |
| `static-orbit`: `SelectionRenderer::renderCoordTexImpl` | 31.4% | **0.0%** |
| `static-orbit`: `Scene::display` | 31.6% | **0.6%** |

**`prop-change` moved the other way**, from 38.86 to 42.93 ms of CPU at 1AON
and 183.80 to 197.35 at 4V6X -- about 10%. Its buffer reallocations and its
allocation volume are identical either side (2.00 per frame, 5.65 and 22.82 MB),
so the path is unchanged; the cost is that building a layout now fills the
coordinate texture in its own pass rather than in the same loop that writes the
radii and colours. A cell that rebuilds once and then draws never notices;
`prop-change` rebuilds every frame by construction, so it pays it every frame.
That is the scenario whose real problem is that a colour change discards
positions and normals it did not affect (candidate 1), which is untouched here.

## The transfer became visible once the lookups went

Taking the per-atom lookups out did not only make the frame shorter; it changed
what the frame is spent on. The coordinate texture is uploaded with one
`texSubImage2D` over a single RGB32F texture, and the addon's own timer around
that call reads differently either side of the change -- same bytes, same
format, same call:

| structure | bytes/frame | before | after |
|---|---:|---:|---:|
| 1CRN | 12 KB | 41 us | 62 us |
| 4HHB | 60 KB | 61 us | 94 us |
| 1AON | 696 KB | 119 us | 306 us |
| 4V6X | 2.7 MB | 346 us | 874 us |
| 3J3Q | 28 MB | -- | 22,031 us |

Uploading the same data takes two and a half times as long as it did. Nothing
about the upload changed; what changed is that the 26 ms of `getAtom` that used
to sit around it is gone, so the write now lands while the GPU is still reading
the texture it is writing into. 3J3Q is the clearest case: it is the first cell
in the corpus where GPU and CPU are comparable (24.44 against 24.78 ms), and
22 ms of that CPU is the upload call itself.

This is the same shape as the finding the WebGPU prototype this work grew out
of made about vertex buffers, where writing into a buffer the GPU was reading
cost 27x against a two-buffer ring. That finding was measured here early on and
set aside at 2.5-3.3% of the frame -- correctly at the time, and wrongly as a
conclusion: the transfer was cheap only because something slower was standing
in front of it.

### And a second face fixes it

Each name now owns a ring of two textures: an update writes the next face and
makes it current, so the draw that follows binds what was just written and
leaves the one the GPU is still reading alone. It is 67 lines in
`TextureStore.ts`; the C++ side addresses these textures by name and never sees
the ring.

| cell | before | after |
|---|---|---|
| 3J3Q `coord-morph` upload | 22,031 us | **9,902 us** |
| 3J3Q `coord-morph` | 36.4 fps, 24.78 ms CPU | **53.9 fps, 12.44 ms** |
| 4V6X `coord-morph` upload | 874 us | **787 us** |
| 4V6X `coord-morph` | 60.0 fps | 60.0 fps (more headroom) |

Uploading the same bytes takes half as long. At sizes already at vsync the
upload still drops but the frame rate cannot show it, which is what a headroom
improvement looks like from outside.

`static-orbit` does not move at any size and reports no upload time at all,
which is the check that the ring is confined to the path that writes: a
renderer that only turns the camera never touches the texture.

The cost is one more texture per name -- 77 MB at capsid scale, nothing at the
sizes people work at. Two faces and not three: a third would only help if a
draw outlived two of its own updates, and the frame loop issues one update per
draw.

The same reasoning still applies to `BufferStore`, which is still a single VBO with
`STATIC_DRAW` and a full `bufferSubData` at offset 0 -- untouched by this work
because the coordinate-texture renderers do not re-upload vertex buffers. It
matters for the mesh renderers, which reallocate four buffers every frame, and
that is worth measuring again after candidate 1 below, which should make those
rebuilds rare.

## What is still open

Items 3 to 5 below were what the numbers first suggested and are superseded by
the change above, which removed the lookups rather than making them cheaper.
**1 and 2 have not been attempted**, and are listed with what each would have
to prove.

The coordinate texture's own double buffering, which used to head this list,
is done -- see above.

One earlier candidate was dropped for good: hoisting the per-object uniform
uploads to pass level, at 0.3% of the frame at the size that struggles. The
other, giving the vertex buffers a ring or an orphaning usage hint, was dropped
at 2.5-3.3%, came back as the texture ring above, and is still open for
`BufferStore` itself -- but the renderers that would benefit are the mesh ones,
which rebuild for reasons candidate 1 addresses, so that is worth measuring
again afterwards rather than now.

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

1 and 2 are renderer interface work, and 1 is what `prop-change` needs: that
scenario rebuilds every frame precisely because a colour change throws away
geometry the colour did not affect.

## Caveats

- The coordinate-change scenario is driven by `MorphMol` interpolating between
  a structure and a displaced copy, not by a trajectory reader. Both are now
  `AnimMol`s that fill the same array and end in `fireAtomsMoved`, so a
  renderer cannot tell them apart; what differs is upstream, where `MorphMol`
  interpolates between frames and `Trajectory` copies one (or averages a
  window). The before numbers additionally carried `MorphMol`'s own per-atom
  scatter, which was 32.6% of that cell and is gone with the write-back.
- The sampling shares come from macOS `sample`, which attributes to the nearest
  exported symbol. `libcuemol2` frames are reliable; Electron Framework frames
  are not, and are reported only as an aggregate.
- The profiles are of one structure at one canvas size: 1AON before, 4V6X
  before and after. The counter-based numbers cover the whole corpus; the
  profiles do not.
