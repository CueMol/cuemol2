# Surface atom colouring: `AtomColorMemo` and the shared colouring pass

How the surface renderers colour a vertex by the atom it belongs to (the
`molecule` colour mode, and `showsel` visibility), and the molstr pieces the
three renderers share for it. The scalar modes (potential ramp,
multi-gradient) are in [surface-scalar-coloring.md](surface-scalar-coloring.md).
Not a UXP migration item.

## Renderers

| Renderer | Vertex -> atom | Paths |
|---|---|---|
| `dsurface` (`DirectSurfRendererBase`) | the mesh builder stores the atom id in `MSVert::info` ([direct-surface-renderer.md](direct-surface-renderer.md)) | GPU primitive + display list |
| `molsurf` (`MolSurfRenderer`) | nearest atom of the `target` molecule (among `sel`), searched per render | display list |
| map isosurface (`xtal::MapSurfRenderer`) | nearest atom of the `target` molecule, cached in the mesh cache (`resolveAidCache`) until the mesh or the molecule changes | GPU primitive + display list |

## Shared pieces (molstr)

Both `surface` and `xtal` depend on `molstr`, so the pieces live there.

- **`ColSchmHolder::startColoring(pMol, pRend)` / `endColoring(pMol)`**
  bracket a colouring pass. `ColSchmHolder::getColor(atom)` evaluates two
  schemes, the renderer's and the molecule's own (`MolCoord` is a
  `ColSchmHolder`), and a stateful scheme such as rainbow prepares its
  tables in `start()`, so both are started and ended. A null scheme is
  skipped.
- **`AtomColorMemo(pMol, pHolder, pShowSel, sceneID, bColor = true)`**
  answers, per atom id, whether the atom is shown (`showsel`), its colour
  (`pHolder->getColor(atom)`) and that colour's device code in the scene.
  Each atom is resolved once and kept in flat arrays indexed by atom id
  (ids are dense pool indices; an id at or above 2^26 is resolved without
  memoizing).
- **`AtomPosMap2::searchNearestAtoms(n, posAt, aids)`** runs
  `searchNearestAtom` for n points in parallel (`qlib::parallel_for`) after
  forcing the lazy kd-tree build (`ensureBuilt`). `posAt` must be safe to
  call concurrently.

## Contracts

- **An unknown atom is shown and has no colour.** A negative id, or one that
  names no atom (`NO_ATOM_ID` reads as -1), gives `bAtom = false`,
  `bShown = true`, null colour. The caller decides what "no colour" means:
  `defaultcolor` (dsurface), the base colour (map GPU path), or keeping the
  previous colour (molsurf and the map display-list path; historical
  behaviour).
- **Colour is resolved only for shown atoms, and only with `bColor`.**
  A hidden atom never reaches a colouring scheme. With `bColor = false`
  only visibility is resolved and no scheme is called, so the pass needs no
  `startColoring()`; molsurf uses this when only `showsel` applies
  (non-molecule colour modes). dsurface passes `colormode == molecule`.
- **One memo per pass.** The memo is built after `startColoring()` and
  dropped before `endColoring()`; colours are never carried across passes,
  so a scheme or `showsel` change takes effect on the next pass without
  invalidation hooks.
- **`get()` returns a reference valid until the next `get()`** (the arrays
  grow on demand). Callers copy what they need before the next lookup.
- **The selection never sees a null atom.** `showsel` is only evaluated on a
  resolved atom (the selection nodes dereference it).

## Per renderer

- **dsurface**: `beginVertexColors()` starts the schemes and creates the
  memo; `isVertexShown()` / `resolveVertexColor()` (display list) and
  `resolveShownDevCode()` (GPU, both answers in one lookup) read it.
- **molsurf**: `render()` searches each vertex's nearest atom once, in
  parallel, and reads `showsel` and the colour from the memo. Previously it
  searched twice per vertex (once for `showsel`, once for the colour),
  serially, and asked the scheme for every vertex. It also started only its
  own scheme, not the molecule's: with a stateful molecule scheme the
  molsurf colours could differ from the other renderers; they now match.
- **map isosurface**: `setupColorEnv()` / `cleanupColorEnv()` bracket the
  pass with `startColoring()` / `endColoring()`; `resolveAidCache()` uses
  `searchNearestAtoms()`; the display-list replay and the GPU colour pass
  read one memo each.

## Measurements

70632 atoms (1CRN on a 6 x 6 x 6 lattice, 35 A apart), 8 cores (4P+4E),
Release:

| | before | after |
|---|--:|--:|
| molsurf render, 832k vertices | 398 ms | 83 ms |
| molsurf render, 1.35M vertices | 623 ms | 119 ms |
| molsurf render with `showsel`, 1.35M vertices | 426 ms | 102 ms |
| dsurface GPU colours (`computeShownColors`), 1.43M vertices | 76 ms | 17 ms |
| dsurface GPU colours, 4.62M vertices | 226 ms | 29 ms |

The dsurface cost was mostly the per-vertex `getDevCode()` (a colour
profile lookup and transform) and a hash-map probe per vertex. molsurf's
remaining cost is the per-render kd-tree build, the parallel search and
building the display-list mesh.

## Tests

| Test | Pins |
|---|---|
| `src/tests/modules/surface/test_surf_atom_color.cpp` | molsurf: every vertex takes its nearest atom's colour; `showsel` hides the vertices of the atoms it leaves out |
| `src/tests/modules/xtal/test_mapsurf_atom_color.cpp` | map isosurface: the same on the display-list and the GPU path |
| `src/tests/modules/surface/atom_color_test_util.hpp` | shared fixtures of the two files above: two atoms coloured differently, a display context that records drawn vertices in world coordinates, a brute-force nearest-atom expectation |
| `DsurfPathsFixture.GpuAndDisplayListColorsAgree` (`test_dsurf_color.cpp`) | dsurface: the GPU and display-list paths give every shown vertex the same colour |

## Not done / later

- molsurf rebuilds the `AtomPosMap2` kd-tree and searches every vertex on
  each render (any colour change invalidates the display list). Caching
  the atom per vertex, as the map isosurface does, needs invalidation on
  surface, target molecule, `sel` and transform changes.
- The molvis renderers start the two schemes by hand
  (`getColSchm()->start(...)` + `pMol->getColSchm()->start(...)`); they
  could use `startColoring()` / `endColoring()`.
- The map isosurface's display-list replay still falls back to a
  per-vertex nearest-atom search and scheme call (`setVertexColor()` ->
  `getColorMol()`) when the atom column is not resolved.
