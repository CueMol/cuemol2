# MD trajectory playback: results

All the `md-playback` results in one place: what was measured, how it
changed as #628-#631 went in, how long the 3.9M-atom structure takes
to load (#633), the same runs on Windows / RTX 4070, and which numbers
are superseded.

The per-step write-ups remain where they were written:
- `README.md`, "Playing a trajectory"
- `docs/plans/260919-tritium-perf-benchmark-plan.md`, the two md-playback sections

Every number below is recomputed from the raw results in `results/`.

**Machine and setup** (all sections except "Windows 11 / RTX 4070")
- Apple M2 (4 performance + 4 efficiency cores, 24 GB), ANGLE on Metal,
  Electron with the renderer running in a Web Worker.
- 1920x1080 window with panels closed (canvas 1832x1010, DPR 2).
- cpk renderer unless noted. Release builds.
- 2 s warm-up, then 6 s measured. Each cell is its own process.
- Cells from the final state ran 2-3 times; the table shows means.

## The corpus

| id | atoms | system | frames | source |
|---|---:|---|---:|---|
| `ifabp` | 12,445 | I-FABP in water with ions | 500 (DCD) | MDAnalysisData `ifabp_water`, figshare, CC-BY 4.0 |
| `yiip` | 111,815 | YiiP in a POPE:POPG membrane, water, ions | 901 (XTC) | MDAnalysisData `yiip_equilibrium_short`, figshare, CC-BY 4.0 |
| `mcv448` | 161,188 | SARS-CoV-2 budding system | 300 of 8,001 (XTC) | MDposit `MCV1900448`, CC-BY 4.0 |
| `a4tail` | 3,940,938 | A4 portal-tail complex in water with NaCl; 91% of the atoms are water | 100 of ~2,530 (XTC) | Zenodo 20275758, cut out of a 41 GB tar by byte range, CC-BY 4.0 |

`fetch-md.py` fetches and checks all four (`md-corpus.json`). Notes on
the corpus:
- The ifabp DCD is big-endian; `fetch-md.py` derives a little-endian copy.
- The yiip PDB is replaced by a derived GRO. Its chains share one chain ID
  and its residue numbers overflow the PDB columns, so the PDB reader
  merges atoms.
- Solvated public trajectories of about 10^6 atoms or more are rare, and
  a4tail was the only one found. MDposit, GPCRmd, MDRepo, the Amaro lab
  and Folding@home were all checked; see `README.md`.

## Reading the numbers

- **update, first**: the time the scenario step spends moving to a frame
  shown for the first time in the run. This includes the decode.
- **update, again**: the same for a frame shown before. Before #629 such a
  frame was always still held, so this was the copy alone. From #629 on,
  the cache limit may have released it, so it can include a new decode.
  At 3.9M atoms the limit holds about 45 frames.
- **GPU ms is not reported for md-playback.** The timer query spans the
  whole frame, including the coordinate upload and any wait it causes, so
  it is not render time. See the ablation findings in
  `ablation/conditions/README.md` and the ablation report.
- Up to #629 the update was reported as a single mean. A trajectory with
  fewer frames than the run shows mixes the two kinds of update. mcv448 is
  such a case (300 frames, about 480 shown), and its first figures (2.20 ms)
  are a mix.

## Mid-size systems (cpk, 60 fps throughout)

| cell | measured | baseline | after #628 | after #629 | after #631 |
|---|---|---:|---:|---:|---:|
| ifabp (DCD) | update, first | 0.60 ms | 0.59 | 0.61 | (not rerun) |
| yiip (XTC, lazy) | update, first | 3.34 ms | 3.47 | 2.81 | **0.59** |
| yiip (XTC, eager) | update | 0.30 ms | 0.32 | 0.33 | (not rerun) |
| | load | 2.3 s | 2.3 | 1.9 | |
| mcv448 (XTC, lazy) | update, first | 4.07 ms (*) | 4.20 | 3.30 | **0.63** |
| | update, again | 0.32 ms (*) | 0.38 | 0.41 | 0.45 |
| yiip / ribbon | fps | 26.8 | 26.5 | 27.2 | (not rerun) |
| | update, first | 1.98 ms | 1.96 | 1.30 | |

(*) The split between first and repeated showings was added after the
baseline run, so these two come from a separate run at the same state.

- #628 (the staging buffer for the coordinate texture) does not touch
  decoding. Its effect is on the upload, which is inside the frame, not
  inside the update.
- #629 speeds up the XTC decode. yiip goes 3.47 -> 2.81 ms and mcv448
  4.20 -> 3.30 ms. In a tight loop the decode is 1.30 -> 0.86 ms per frame
  for yiip and 1.92 -> 1.24 ms for mcv448.
- #631 decodes the next frames in the background, so a first showing costs
  about what a repeated one does (yiip 0.59 ms, mcv448 0.63 ms).
- The ribbon cell stays at 27 fps throughout. Its 35 ms of CPU per frame is
  the mesh rebuild; that is a separate item, not part of this work.
- The ribbon cell's update (1.30 ms after #629) is shorter than the cpk
  cell's (2.81 ms) for the same decode. A CPU busy with the ribbon rebuild
  runs the decode at full clock, while an idle one does not.

## The 3.9M-atom system (a4tail)

| cell | stage | fps | update, first | update, again | CPU ms | load | RSS |
|---|---|---:|---:|---:|---:|---:|---:|
| all atoms drawn | after #629 | 19.1 | 44.3 ms | 6.3 ms | 21.5 | 27.0 s | 3.5 GB |
| all atoms drawn | after #631 | 22.5 | 17.8 ms | 10.0 ms | 30.5 | 27.2 s | 3.9 GB |
| water hidden by the renderer (`selection`) | after #629 | 30.2 | 43.2 ms | 20.5 ms | 0.56 | 23.4 s | 4.9 GB |
| water not loaded (`loadSelection`) | #630, one atom removed at a time | 52.0 | 35.4 ms | 0.48 ms | 0.94 | 150.2 s | 2.4 GB |
| water not loaded | #630 final (bulk removal) | 52.8 | 33.2 ms | 0.51 ms | 1.01 | 21.0 s | 3.7 GB |
| water not loaded | after #631 | **60.0** | (**) | 0.43 ms | 1.09 | 21.2 s | 3.5 GB |
| water not loaded, first pass only (`-cold`) | after #631 | **60.0** | **1.09 ms** | | 0.55 | 21.1 s | 4.8 GB |
| the same, `CUEMOL_TBB_THREADS=1` (no prefetch) | after #631 | 29.9 | 32.5 ms | | 0.56 | 21.0 s | 5.0 GB |

(**) With the default 2 s warm-up, a 100-frame trajectory at 60 fps is past
its first pass before collection starts. The `-cold` cell has a 100 ms
warm-up and measures the first pass itself.

**The limits at this size**

- **With every atom drawn, the GPU is the limit.** A static view of all
  3.9M atoms runs at 30.8 fps; with the water hidden it runs at 60 fps
  (GPU 11.5 ms). The cost is the layers of water spheres filling the
  screen. That is a benchmark artefact, since solvated systems are viewed
  without their water, so it was not optimised.
- **Hiding the water only in the renderer is not enough.** Every frame is
  still decoded, held and copied for all 3.9M atoms (47 MB), and the
  2 GiB cache holds about 45 frames.
- **Not loading the water (#630)** cuts the held and copied data to 348,642
  atoms (4.2 MB per frame). The whole 100-frame trajectory then fits in
  the cache.
- **Prefetching (#631)** hides the one cost left, the decode of the whole
  3.9M-atom frame (34 ms on one thread, 9.5 ms per frame on four). The
  result is 60 fps from the first frame.

## Windows 11 / RTX 4070

Every md-playback spec, repeat 3, on the state after #631 (6ab2e9d8, before
the #633 GRO work). The corpus was copied from the M2 machine and checked
against `md-corpus.json`.

**Machine**: Windows 11, i9-14900KF, RTX 4070 on PCIe 4.0 x16, ANGLE on
D3D11, Release build, DPR 1.5.

**The recorded canvas size is wrong; the drawn size is not known exactly.**
Every Windows result file records the canvas as 300x150, the default size
of an HTML canvas element, while the M2 files record 1832x1010. The harness
read the size from the DOM canvas element, which keeps whatever size it had
when it was transferred to the worker, so on Windows it recorded the size
from before layout. The runs were made with the panels closed and the
molecule view as the main area, as on the M2, so the view was drawn at the
window's size; the exact window size was not noted. The harness now records
the GL drawing buffer instead (`canvas.width` / `height`, with the DOM
element's size kept as `domWidth` / `domHeight`); on the M2 both read
1832x1010. Even at the same window size the pixel count differs: DPR 1.5
against the M2's 2 is about 0.56x the pixels. Compare the GPU-bound cells
(a4tail with the water drawn) with that in mind.

| cell | measured | M2 (after #631) | Windows |
|---|---|---:|---:|
| ifabp (DCD) | fps / update, first | 60 / 0.61 ms (after #629) | 60.0 / 0.19 ms |
| yiip (XTC, lazy) | fps / update, first | 60 / 0.59 ms | 60.0 / 0.50 ms |
| yiip (XTC, eager) | fps / update | 60 / 0.33 ms (after #629) | 60.0 / 0.20 ms |
| mcv448 (XTC, lazy) | update, first / again | 0.63 / 0.45 ms | 0.66 / 0.24 ms |
| yiip / ribbon | fps / CPU ms | 27.2 / 35 (after #629) | **20.3 / 48.1** |
| a4tail, all atoms drawn | fps | 22.5 | 36.7 |
| | update, first / again | 17.8 / 10.0 ms | 14.6 / 9.9 ms |
| | load / RSS | 27.2 s / 3.9 GB | 30.0 s / **12.8 GB** |
| a4tail, water hidden by the renderer | fps | 30.2 (after #629) | 50.0 |
| | update, first / again | 43.2 / 20.5 ms (after #629) | 17.6 / 11.4 ms |
| | load / RSS | 23.4 s / 4.9 GB (after #629) | 26.5 s / **12.2 GB** |
| a4tail, water not loaded | fps / update, again | 60.0 / 0.43 ms | 60.0 / 0.46 ms |
| | load / RSS | 21.2 s / 3.5 GB | 25.6 s / 4.4 GB |
| the same, first pass only (`-cold`) | fps / update, first | 60.0 / 1.09 ms | 60.0 / 1.31 ms |

- The mid-size systems and a4tail with the water not loaded hold 60 fps, as
  on the M2, with updates at or below the M2's.
- With every atom drawn, a4tail runs faster than on the M2 (36.7 against
  22.5 fps, and 50.0 against 30.2 with the water hidden), consistent with
  those cells being GPU-bound. See the canvas-size note above.
- Two things are worse on Windows, and neither is investigated yet:
  - yiip / ribbon runs at 20.3 fps with 48 ms of CPU per frame (M2: 27.2 fps,
    35 ms). The mesh rebuild is the cost on both machines.
  - a4tail with every atom loaded peaks at about 12 GB resident (M2: about
    4 GB). With the water not loaded it is 4.4 GB, close to the M2.
- The M2 column mixes stages where the M2 cell was not rerun after #631;
  those entries are marked.

The coordinate-texture staging buffer (#628) was also measured on this
machine (`eab7a0ce`): 3J3Q coord-morph goes from 40.0 to 58.6 fps, and the
coordinate upload from 8.7 to 4.3 ms per update (4V6X stays at 60 fps).

## Loading the 3.9M-atom structure (GRO, #633)

Reading a4tail's `em.gro` into a molecule: parsing, residues, topology
(bonds) and secondary structure. The timing comes from a temporary gtest
that runs `GROFileReader` on the file (Release, one run per step). A hash
over every atom (id, chain, residue, name, element, position), every
residue's `secondary` property and the bond count was identical at every
step.

| step | load | change |
|---|---:|---|
| before | 12.5 s | |
| secondary structure without all-pairs scans | 10.0 s | H-bond partners from a 9 A grid of CA atoms; bridges tried only against the residues their H-bonds name |
| coordinate parsing | 7.2 s | plain fixed-point fields parsed directly to the exact `strtod` value, instead of an `istringstream` per field; element guess cached per atom name |
| backbone lookup stops at the first missing atom | 6.5 s | a miss scans the residue, and 91% of the residues are water |
| atom lookup by ID in constant time | **4.8 s** | `MolCoord::getAtom` used a `std::map` of 3.9M nodes; a vector index now sits beside it |

- The atom index costs 8 bytes per atom ID, about 32 MB here, against a
  peak of 4.19 GB for the whole load.
- The remaining 4.8 s is spread out: line reading, field slicing, adding
  atoms, topology and secondary structure take 0.4-0.8 s each. Taking it
  further means changing shared code (the qlib line reader), so it stops
  here.
- Replacing the atom map with a vector that owns the atoms would save a
  further estimated 200-250 MB (5-6%). It is recorded as future work in
  `docs/plans/260925-molcoord-atom-vector-plan.md`.
- The **load** column of the a4tail table above predates #633 and was not
  rerun. It also includes opening the trajectory and, for the
  `loadSelection` cells, removing the water.

## The decode itself

Lazily decoding each frame in turn, in a tight loop (temporary checksum
test, output bit-identical before and after):

| trajectory | atoms | before #629 | after #629 |
|---|---:|---:|---:|
| yiip | 111,815 | 1.39-1.41 ms | 0.95-1.02 ms |
| mcv448 | 161,188 | 2.04-2.10 ms | 1.35-1.42 ms |
| a4tail | 3,940,938 | 53-55 ms | 34-39 ms |

Decoding independent frames in parallel with `qlib::parallel_for` (oneTBB).
The output was identical at every thread count:

| threads | a4tail, ms/frame | yiip, ms/frame |
|---:|---:|---:|
| 1 | 33.9 | 0.90 |
| 2 | 17.3 | 0.45 |
| 4 | 9.5 | 0.24 |
| 8 | 7.9 | 0.19 |

In-app figures run higher than the tight loop, because a CPU mostly idle
between frames decodes at a lower clock.

## Superseded numbers

- **The 5-frame a4tail trial** (25.1 fps, update 2.77 ms). Every measured
  frame was already held, so the 2.77 ms is a copy, not a decode. The
  100-frame cells replace it.
- **"coord-morph stands in for md-playback"** (the plan's original
  reasoning). It holds for the renderer side, but misses the frame decode,
  which turned out to be the main cost of playing a real trajectory.
- **mcv448 at 2.20 ms** in the first README table. It is a mix of first
  and repeated showings (see above).

## Where each change lives

| PR | change | spec |
|---|---|---|
| #628 | coordinate-texture staging buffer | `docs/architecture` (renderer update cost) |
| #629 | frame cache limit; faster XTC decode | `docs/architecture/md-trajectory-lazy-loading.md` |
| #630 | `Trajectory::applyLoadSel`, `MolCoord::removeAtoms` | the same page |
| #631 | next-frame prefetch (`qlib::TaskGroup`) | the same page |
| #633 | faster GRO load (secondary structure, atom lookup, coordinate parsing) | `docs/plans/260925-molcoord-atom-vector-plan.md` (the follow-up) |

Raw results, all on this branch:
- `results/bench-2026-09-24T08-28-26-187Z` (baseline) through
  `bench-2026-09-24T12-38-35-250Z` (after #631)
- `results/ablation-m2-20260925/` (the transfer-path ablation)
- `results/bench-2026-09-25T02-58-09-447Z` (Windows md-playback)
- `results/bench-2026-09-24T02-12-31-976Z` and `bench-2026-09-24T04-44-55-351Z`
  (Windows, before and after #628)
