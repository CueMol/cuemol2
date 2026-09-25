# MD trajectory playback: results

All the `md-playback` results in one place: what was measured, how it
changed as #628-#631 went in, and which numbers are superseded.

The per-step write-ups remain where they were written:
- `README.md`, "Playing a trajectory"
- `docs/plans/260919-tritium-perf-benchmark-plan.md`, the two md-playback sections

Every number below is recomputed from the raw results in `results/`.

**Machine and setup**
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

Raw results, all on this branch:
- `results/bench-2026-09-24T08-28-26-187Z` (baseline) through
  `bench-2026-09-24T12-38-35-250Z` (after #631)
- `results/ablation-m2-20260925/` (the transfer-path ablation)
