# tritium performance benchmark harness

Measures the CueMol3 rendering path -- C++ geometry generation, the N-API
boundary, and the WebGL2 frame loop in the Web Worker -- on real molecular
scenes.

**This directory lives on `bench/perf-harness` and is never merged into
`develop`.** Optimizations found with it are implemented on their own
`perf/<topic>` branch cut from `develop`, measured by merging that branch into
this one temporarily, and go to `develop` by pull request.

Every number here came from one machine: an Apple M2, where Electron reaches
the GPU through ANGLE's Metal backend. Results carry the machine with them
(`machine.unmaskedRenderer` in the JSON, `gpu` in the CSV) so a second one can
be told apart. To run this somewhere else, see
[RUNNING-ELSEWHERE.md](RUNNING-ELSEWHERE.md).

## One process per measured cell

`run.js` starts a fresh Electron process for every cell. Switching scene,
renderer or canvas size inside a live process leaves the previous cell's
allocations, heap fragmentation and driver state behind, and the next cell
measures those as much as itself. In the WebGPU proof of concept this work grew
out of, the same cell reported 11 ms of native frame time on its own and 71 ms
when it followed a large sweep in the same process -- a factor of six, entirely
from the order cells happened to run in.

## Getting the structures

```sh
./fetch.sh          # 1CRN, 4HHB, 1AON, 4V6X
./fetch.sh --all    # the above plus 3J3Q (several hundred MB)
```

Downloads from RCSB, through the same URL the Get PDB dialog uses
(`react-gui/src/renderer/worker/shared/pdbUrls.ts`), so these are the files the
application itself would open. Fetching is a separate step on purpose: a
download inside a run would put network variance straight into the `load`
scenario.

Everything is mmCIF. The two largest entries have more chains than the PDB
format can express and exist only as mmCIF, so mixing formats would mean the
`load` scenario compared two different readers.

| PDB ID | atoms | |
|---|---|---|
| 1CRN | 327 | crambin |
| 4HHB | 4,779 | haemoglobin |
| 1AON | 58,674 | GroEL/GroES |
| 4V6X | ~220,000 | human 80S ribosome |
| 3J3Q | 2,440,800 | HIV-1 capsid (opt in with `--all`) |

`data/` and `results/` are gitignored; `fetch.sh` writes `data/manifest.json`
with each file's size and SHA-256 so a corpus can be checked without
re-downloading it.

## Getting the MD trajectories

```sh
./fetch-md.py               # every entry in md-corpus.json
./fetch-md.py ifabp yiip    # named entries only
```

`md-playback` plays real trajectories, which RCSB does not serve, so they come
from public MD repositories that allow anonymous download. `md-corpus.json`
lists each entry's files with their source URL and SHA-256. `fetch-md.py`
downloads them into `data/md/<id>/` and refuses a file whose hash differs:
a cell measured on other bytes cannot be compared with one measured on these.
It records what it found in `data/md/manifest.json`.

| id | atoms | system | topology + frames | source |
|---|---:|---|---|---|
| `ifabp` | 12,445 | I-FABP in water with ions | PDB + DCD, 500 frames | MDAnalysisData `ifabp_water` (figshare, CC-BY 4.0) |
| `yiip` | 111,815 | YiiP in a POPE:POPG membrane, water, ions | PDB + XTC, 900 frames | MDAnalysisData `yiip_equilibrium_short` (figshare, CC-BY 4.0) |
| `mcv448` | 161,188 | SARS-CoV-2 budding system | PDB + XTC, first 300 of 8,001 frames | MDposit `MCV1900448` REST API (CC-BY 4.0) |
| `a4tail` | 3,940,938 | cyanopodophage A4 portal-tail complex in water with NaCl | GRO + XTC, first 100 of ~2,530 frames | Zenodo 20275758, cut out of a 41 GB tar by byte range (CC-BY 4.0) |

Three things about the corpus are not obvious:

- **The I-FABP DCD is big-endian**, written on a machine of that byte order,
  and CueMol's DCD reader reads little-endian only. `fetch-md.py` derives a
  little-endian copy (`-le.dcd`) that swaps bytes and changes nothing else.
  The spec plays the copy.
- **The MDposit trajectory is exported on request** by the server, so no
  published hash exists to pin it against. Its hash is recorded in the
  manifest, so two machines can still tell whether they measured the same
  bytes.
- **The 10^6-atom rung comes out of a 41 GB archive without downloading it.**
  Solvated public trajectories of this size are rare. MDposit's largest entry
  is 161,188 atoms. MDRepo needs a token. GPCRmd says downloading requires an
  account. The Amaro lab's 1.7M-atom spike system is a single structure, and
  its trajectories are solvent-stripped. The A4 portal-tail system is
  published as one uncompressed tar. `fetch-md.py` finds the members by
  reading only the tar headers over HTTP Range, then fetches `em.gro` and
  the first `xtcFrames` frames of `prod.xtc`, measured frame by frame from
  their XTC headers. The frames are about 15 MB each, and a decoded frame is
  47 MB of memory.
- `run.js` skips a cell whose data is not present and says so, rather than
  reporting a load failure.

The topology is read onto an mdtools `Trajectory` with the reader the spec
names (`trajectory.topologyReader`, else the spec's `reader`). A public
trajectory ships its topology as PDB rather than the `.gro` the application's
open dialog asks for. `Trajectory::append` throws when a frame's atom count
differs from the topology's, so a reader that dropped or merged atoms fails
the cell instead of scrambling it.

## Running

```sh
node run.js                              # every spec in specs/
node run.js --specs=1crn-cpk-orbit       # one, by file stem
node run.js --canvases=1920x1080,2880x1800
node run.js --repeat=3
```

Results land in `results/` as CSV and JSON. A single cell can also be run by
hand:

```sh
cd ../react-gui
LIBCUEMOL2_ROOT=../../.build_out/cuemol2 CUEMOL_FRESH_PREFS=1 \
  npx electron . --bench=../bench/specs/1crn-cpk-orbit.json \
                 --bench-out=/tmp/cell.json --canvas=1920x1080
```

**Build Release first.** The POSIX default is Debug, which has `MB_DPRINTLN`
on the hot path and is not worth measuring:

```sh
cd ../../build_scripts
task rebuild_libcuemol2 CONFIG=Release
task build_tritium CONFIG=Release
```

## What a spec says

```json
{
  "file": "../data/1crn.cif",
  "reader": "mmcif",
  "renderer": "cpk",
  "scenario": "static-orbit",
  "warmupMs": 2000,
  "measureMs": 6000
}
```

An `md-playback` spec names the topology as `file` and adds the frames:

```json
{
  "file": "../data/md/yiip/YiiP_system.pdb",
  "reader": "pdb",
  "renderer": "cpk",
  "scenario": "md-playback",
  "trajectory": { "files": ["../data/md/yiip/YiiP_system_9ns_center.xtc"], "lazy": true }
}
```

`lazy` is the readers' `lazy_load`. With `true`, the default and what a user
gets, every frame is read from the file and XTC-decompressed when it is shown.
With `false`, every frame is decoded once at open, which leaves the copy and
the renderer's own work. `nevery` keeps every Nth frame.

| scenario | per frame | read |
|---|---|---|
| `static-orbit` | rotate the view; geometry never changes | `render_fps`, frame-time percentiles, GPU ms, GL calls per frame |
| `coord-morph` | interpolate one step along a two-frame morph, so every atom moves and the topology does not | `update_fps`, `bufferData` per frame -- whether the renderer rebuilt |
| `md-playback` | advance one trajectory frame **per displayed frame**, back and forth through the whole trajectory | `update_fps` -- how many new frames actually reached the screen; `update_ms` -- what setting the frame cost (decode + copy + `atomsMoved`) |
| `prop-change` | change a renderer property | `update_fps`, `gl_buffer_sub_data_bytes` |
| `input-latency` | one step of a synthetic left drag | `input_latency_ms` percentiles -- what the worker's own handling costs, not motion-to-photon |
| `load` | nothing; the load already happened | `load_ms` |
| `idle` | nothing at all | a self-check: this must draw zero frames |

## Reading the numbers

`render_fps` is how often the picture was redrawn. `update_fps` is how often
the scenario's payload actually advanced -- a trajectory frame consumed, a
property change taken up. A scenario that changes nothing reports zero for it
by definition, and the meaningful number there is `render_fps`.

Both are capped by vsync at 60. Every `static-orbit` cell in the corpus sits
there, so what separates those is the frame-time percentiles, the GPU time and
the GL call counts rather than the rate. The scenarios that change something
fall well below 60 and the rate is the result.

## Pinned confounders

Temporal jitter supersampling and adaptive half-resolution AO each keep
`GUIView::needsContinuousRedraw()` true, so with either on the frame loop goes
on drawing full frames when nothing changed. `aa_method` defaults to `fxaa`,
which routes every frame through the off-screen post-process pipeline. The
harness forces all three (`aaJitterLevel: 0`, `aoEnabled: false`,
`aoHalfRes: false`, `aa_method: "none"`) and reports any it could not set as
`unpinned` in the result -- a pin that silently did nothing would leave a run
looking measured while a confounder stayed on.

Run the `idle` spec after changing anything here. It must report zero drawn
frames and no GL calls; anything else means a confounder is still live.

A measured run also opens with every panel closed, so the 3D view is the whole
window: the canvas backing store is the surface being measured, and with the
normal chrome in place a 1920x1080 window leaves the view about 1312x490.

## Where the hooks are

The harness is new files plus a handful of one-line hooks, so that merging
`develop` into this branch stays cheap:

| file | hook |
|---|---|
| `react-gui/src/main/index.ts` | parse `--bench` at startup |
| `react-gui/src/main/windows/mainWindow.ts` | window size, result watcher, spec in the load query |
| `react-gui/src/renderer/App.tsx` | mount `BenchRoot` |
| `react-gui/src/renderer/shell/{AppShell,MainLayout}.tsx` | start with the panels closed |
| `react-gui/src/renderer/shell/ContentPane.tsx` | do not mount the hover label |
| `react-gui/src/renderer/features/molview/MolViewPane.tsx` | do not bind the canvas mouse listeners |
| `react-gui/src/renderer/worker/server/gfx/ViewLoopController.ts` | per-frame timing |
| `react-gui/src/renderer/worker/server/gfx_manager.ts` | `enableBenchCounters()` |
| `react-gui/src/renderer/worker/server/WorkerService.ts` | two accessors for the harness |

The result travels back on the console behind a `[BENCH_RESULT]` marker, which
main watches for. That is why nothing was added to the shared IPC contract or
the preload surface -- the two files this branch would otherwise conflict with
`develop` over most often.

## Keeping the measurement honest

Three things decide whether two cells can be compared at all, and each is
recorded in the result rather than assumed.

**The camera is fitted to the structure.** The load path only recentres the
view (`setupRenderer`'s `recenterIfRequested`), which leaves the zoom where it
was: a large structure then hangs off every edge of the viewport and most of
its triangles are clipped, so the frame cost would follow the viewport rather
than the structure. `runBench` calls `MolCoord.fitView` and reports
`view.fitted`; a cell with `fitted: false` is not comparable with one without.

**Stray input cannot reach the frame loop.** A hover hit test runs an extra
scene pass into the ID buffer and reads it back with a synchronous
`readPixels`, so one mouse move over the window would stall the pipeline and
land in the frame times. A measured run does not mount the hover handler
(`shell/ContentPane.tsx`), switches off `ViewInputConfig.gpu_pick` underneath
it, and does not bind the canvas mouse listeners at all -- a drag would
otherwise rotate the view under the scenario. All three are reported as
`input`.

**The renderer's own settings travel with the result.** A surface renderer
chooses between `distfield`, `meshms` and `edtsurf`, and a tessellation level
decides how much geometry any renderer emits; both change the thing being
measured by more than the optimizations do. They used to be visible only in
the log, so `rendererProps` now carries them.

## Baseline

The tables below are the **before** state, taken on `develop` as it stood on
2026-09-21. The coordinate path has since been rebuilt (PR #625, now merged),
and the after numbers are alongside them in
[renderer-update-cost.md](../docs/architecture/renderer-update-cost.md). In
short: 4V6X under `coord-morph` went from 24.9 fps to vsync, and static-viewing
CPU is now flat at about 0.3 ms across the whole ladder instead of climbing
with the structure. They are kept as taken, because what they measure -- where
a frame went before anything was changed -- is the reason the change happened.

Apple M2, macOS 26.5, Release build. The canvas is 1832x1010 -- a 1920x1080
window at DPR 2 with the panels closed -- and each cell measures for 6 s after
a 2 s warm-up, three times, in its own process. Spread across the three
repeats is under 1% of the mean everywhere, so the tables give means only.

The tables below were taken with two renderers, `cpk` and `ribbon`, because
they take different paths: `cpk` puts atom positions in a coordinate texture
and never rebuilds a vertex buffer to move them, while `ribbon` builds a mesh
and regenerates it. `ballstick` is the same path as `cpk`, `dsurface` the same
path as `ribbon`, and `simple` is too cheap to move under any of this.

**`ribbon` is not in the spec set any more.** It measures geometry generation
that has not been optimised, so its numbers say how slow that code is rather
than anything about the backend, and they say it once -- which is the point of
[renderer-update-cost.md](../docs/architecture/renderer-update-cost.md). Its
results stay in this document and in `results/` as the evidence behind that
note. Further runs use `cpk`, which is the path a well-behaved renderer takes
and therefore the one worth tracking.

### Turning the camera (`static-orbit`)

| structure | atoms | renderer | fps | frame ms (mean/p95) | cpu ms | gpu ms |
|---|---:|---|---:|---|---:|---:|
| 1CRN | 327 | cpk | 60.0 | 16.62 / 17.43 | 0.36 | 0.81 |
| 1CRN | 327 | ribbon | 60.0 | 16.62 / 17.27 | 0.32 | 0.44 |
| 4HHB | 4,779 | cpk | 60.0 | 16.62 / 17.47 | 0.86 | 1.58 |
| 4HHB | 4,779 | ribbon | 60.0 | 16.62 / 17.57 | 0.71 | 0.77 |
| 1AON | 58,870 | cpk | 60.0 | 16.62 / 17.63 | 3.54 | 4.24 |
| 1AON | 58,870 | ribbon | 60.0 | 16.62 / 17.63 | 3.41 | 4.94 |
| 4V6X | 237,685 | cpk | 60.0 | 16.62 / 17.47 | 5.35 | 8.72 |
| 4V6X | 237,685 | ribbon | 60.0 | 16.62 / 17.43 | 5.48 | 8.66 |

Every cell holds vsync across nearly three orders of magnitude of structure
size. At the top of the ladder the GPU is using 8.7 ms of a 16.6 ms budget and
the CPU 5.5 ms, so neither is close to the limit. Nothing about viewing a
structure is a problem at any size this corpus reaches.

Raising the canvas to 2792x1730 -- 4.83 Mpx, 2.6 times the pixels -- leaves
4V6X at 60 fps in both renderers, with the GPU going from 8.72 to 10.56 ms
(`cpk`) and 8.66 to 11.85 ms (`ribbon`). Times the pixels by 2.6 and the GPU
time rises by 1.2 to 1.4, so even the largest structure on the largest canvas
here is not fill-rate bound.

### Changing a display property (`prop-change`) -- reference only

One colour change per frame.

**Read this one differently from the others.** Nobody changes a colour sixty
times a second: a colour scheme is changed once, by hand, and 40 ms of it is a
blink. The cell is a synthetic load that isolates what a rebuild costs, not a
rate anybody experiences. It is kept because that cost is worth knowing and
because a regression in it would mean a rebuild got more expensive -- not
because the frame rate here is a result.

The scenarios above and below are the ones that run every frame while a user
watches.

| structure | atoms | renderer | fps | frame ms | cpu ms | gpu ms | bufferData/f | alloc MB/f |
|---|---:|---|---:|---:|---:|---:|---:|---:|
| 1AON | 58,870 | cpk | 25.4 | 39.11 | 38.86 | 4.96 | 2.0 | 5.7 |
| 1AON | 58,870 | ribbon | 2.8 | 334.63 | 346.63 | 4.90 | 4.0 | 78.2 |
| 4V6X | 237,685 | cpk | 5.2 | 185.94 | 183.80 | 9.15 | 2.0 | 22.8 |

The GPU time is unchanged from `static-orbit` -- around 5 ms -- while the frame
takes up to 335 ms. All of it is CPU, and a colour change discards and rebuilds
geometry that its own colour did not invalidate.

### Moving the atoms (`coord-morph`)

Coordinates change every frame and the topology does not, which is what a
trajectory drives.

| structure | atoms | cpk fps | ribbon fps | cpk cpu ms | ribbon cpu ms | cpk bufferData/f | ribbon bufferData/f |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1CRN | 327 | 60.0 | 60.0 | 0.28 | 3.88 | 0 | 4.0 |
| 4HHB | 4,779 | 60.0 | 38.1 | 1.57 | 25.44 | 0 | 4.0 |
| 1AON | 58,870 | 60.0 | 2.5 | 7.32 | 398.27 | 0 | 4.0 |
| 4V6X | 237,685 | 24.9 | 1.1 | 26.01 | 919.02 | 0 | 4.0 |

This is the clearest result in the set. The same structure under the same
motion runs 24 times faster with the renderer that has a coordinate-texture
path: `cpk` reallocates no vertex buffer at any size and spends 40-348 us a
frame uploading a texture, while `ribbon` reallocates four buffers a frame and
185 MB at the top of the ladder. The fast path exists and works; it is only
the mesh renderers that lack it.

### Playing a trajectory (`md-playback`)

The consolidated results, from the first run through #631, are in
[MD-RESULTS.md](MD-RESULTS.md). The subsections below were written step by step
as the work went in, and some of their earlier figures are superseded there.

Real MD trajectories from the MD corpus, one frame per displayed frame.
Apple M2 / ANGLE-Metal, 1920x1080, 3 repeats.

| cell | atoms | fps | update ms (mean / p95) | cpu ms | coord tex us/f | load ms |
|---|---:|---:|---:|---:|---:|---:|
| ifabp cpk (DCD) | 12,445 | 60.0 | 0.60 / 1.00 | 0.44 | 135 | 308 |
| yiip cpk (XTC, lazy) | 111,815 | 60.0 | 3.34 / 3.70 | 0.47 | 228 | 1,042 |
| yiip cpk (XTC, eager) | 111,815 | 60.0 | 0.30 / 0.43 | 1.04 | 526 | 2,311 |
| yiip ribbon (XTC, lazy) | 111,815 | 26.8 | 1.98 / 2.13 | 34.7 | - | 1,049 |
| mcv448 cpk (XTC, lazy) | 161,188 | 60.0 | 2.20 / 4.33 | 0.89 | 461 | 2,078 |
| a4tail cpk (XTC, lazy, 5 frames) | 3,940,938 | 25.1 | 2.77 / 3.30 | 34.7 | 30,588 | 28,561 |

**A lazily read frame is decoded once and then kept** (`TrajBlock::load`
sets a per-frame loaded flag). Playing back and forth over fewer frames than
the run shows therefore measures the decode on the first pass only. Each
`md-playback` result now splits the update into `updateSplit.first`, a frame
shown for the first time, and `updateSplit.cached`, one already held.

- mcv448 plays 300 frames in a run that shows about 480, so its 2.20 ms mixes
  the two. A later run split it into 4.07 ms first (n=179) and 0.32 ms cached
  (n=181).
- ifabp and yiip have more frames than the run shows, so their numbers are
  all first showings.
- The a4tail row was a 5-frame trial, so every measured frame was cached. Its
  2.77 ms is the 47 MB copy and not the decode. What the row does show is the
  cost of the size itself: 25 fps, 31 ms a frame uploading the coordinate
  texture, 28.6 s to load and 3.5 GB resident. The 100-frame cell is below,
  under "After #628 and #629".

`coord-morph` stood in for this scenario on the grounds that a renderer cannot
tell a morph from a trajectory, and for the renderer that holds: `cpk` keeps
60 fps and reallocates nothing at every size here. What the morph did not have
is the frame decode. Reading lazily, as a user does, a YiiP frame costs about
3 ms of XTC decompression (lazy 3.34 ms vs eager 0.30 ms). That is inside the
frame budget. Decoding everything at open removes it, but costs 1.3 s of load
and 0.6 GB of memory.

`ribbon` at 27 fps is the mesh-rebuild gap from `coord-morph`, now on a real
trajectory: 35 ms of CPU and four buffers reallocated per frame, for only the
protein part of the system.

The ribbon cell's update step (1.98 ms) is shorter than the cpk cell's
(3.34 ms), although both decode the same lazily read XTC. This is the CPU's
state, not the work. A cpk cell leaves the CPU nearly idle between frames, so
the decode runs cold. The ribbon cell keeps the CPU busy, and its figure is
close to what a tight decode loop measures: 1.30 ms before #629 and 0.86 ms
after. Compare update times only between cells under the same load.

#### After #628 and #629

These results are with #628 (coordinate-texture staging buffer) and #629
merged in. #629 bounds the frames a lazy trajectory keeps decoded (2 GiB per
block) and speeds up XTC decoding by about a third, bit for bit.

| cell | atoms | fps | update first / cached ms | cpu ms | gpu ms | rss MB |
|---|---:|---:|---:|---:|---:|---:|
| yiip cpk (XTC, lazy) | 111,815 | 60.0 | 2.81 / - | 0.38 | - | 1,074 |
| yiip ribbon (XTC, lazy) | 111,815 | 27.2 | 1.30 / - | 34.9 | - | 730 |
| mcv448 cpk (XTC, lazy) | 161,188 | 60.0 | 3.30 / 0.41 | 0.61 | - | 1,047 |
| a4tail cpk (XTC, lazy, 100 frames) | 3,940,938 | 19.0 | 44.3 / 6.3 | 21.5 | 47.4 | 3,000-4,000 |
| a4tail cpk, water hidden (`!resn SOL`, ~348k drawn) | 3,940,938 | 28.3-32.0 | 43.2 / 20.5 | 0.6 | 8.6 | 4,200-5,700 |

**"cached" means shown before, not necessarily still held.** The cache
holds about 45 frames at 3.9M atoms. The water-hidden cell runs at about 30
fps and shows about 170 frames going back and forth, so on the way back it
reaches frames the limit has already released and decodes them again. That
is its 20 ms. The all-atom cell shows fewer frames and finds them still
held (6 ms). In both cells the decode is the frame's largest CPU cost.

**Hiding the water does not shrink the per-frame work.** The GPU drops from
47 to 9 ms, but the XTC holds whole frames, so every frame still decodes all
3.9M atoms (34 ms in a tight loop). `fillCrdArray` also copies all of them
(47 MB) into the coordinate array, although the renderer gathers only the
348k it draws. What would help is a reader that keeps only the selected
atoms and decodes frames ahead in parallel. Decoding independent frames on
oneTBB threads scales almost linearly on the M2 (4 performance + 4
efficiency cores):

| threads | 3.9M atoms, ms/frame | 112k atoms, ms/frame |
|---:|---:|---:|
| 1 | 33.9 | 0.90 |
| 2 | 17.3 | 0.45 |
| 4 | 9.5 | 0.24 |
| 8 | 7.9 | 0.19 |

The output is identical at every thread count. This was measured with a
temporary test that decodes whole frames through `qlib::parallel_for`, with
the file already in the OS page cache.

#### Loading only the selected atoms, and decoding ahead

Two further changes follow from that. `Trajectory.applyLoadSel()` keeps
only the selected atoms, so frames are stored and copied for those alone
(`trajectory.loadSelection` in a spec). A lazily read XTC block then decodes
the next frames in the playback direction on oneTBB threads
(`TrajBlock::setPrefetchDepth`, 4 by default).

| a4tail cpk, 3.9M atoms in the file | fps | update, first showing | load | rss |
|---|---:|---:|---:|---:|
| water hidden only | 26-32 | 40-48 ms | 24 s | 4.0-4.9 GB |
| water not loaded (`loadSelection`) | 52-53 | 33-34 ms | 21 s | 2.0-2.8 GB |
| water not loaded, with prefetch | **60.0** | **1.1 ms** | 21 s | |
| the same, first pass only (`-loadsel-cold`) | 60.0 | 1.1 ms | | |
| the same, first pass, `CUEMOL_TBB_THREADS=1` | 30 | 32.5 ms | | |

With prefetching, the frame shown for the first time costs about the same
as one shown before: yiip goes from 2.81 to 0.58 ms and mcv448 from 3.30 to
0.63 ms. The all-atom a4tail cell rises from 19 to 22-23 fps; it is bound
by the GPU. The `-cold` cell has a 100 ms warm-up, so it measures the first
pass over the frames. With the 2 s default warm-up, a 100-frame trajectory
at 60 fps is past its first pass before collection starts.

- **The frame cache limit holds.** The a4tail cell shows 115 frames at 47 MB
  each and stays at 3-4 GB.
- **At 3.9M atoms the frame is bound by the GPU**: 47 ms of about 52 ms. The
  decode runs on the worker thread largely in parallel with it, so
  prefetching frames on another thread would not raise the rate much.

### Opening a file (`load`)

File on disk through to the first drawn frame, and the resident set once it is
up.

| structure | atoms | renderer | load ms | sd | rss MB |
|---|---:|---|---:|---:|---:|
| 1AON | 58,870 | cpk | 782 | 8 | 304 |
| 1AON | 58,870 | ribbon | 944 | 5 | 687 |
| 4V6X | 237,685 | cpk | 2,587 | 38 | 527 |
| 4V6X | 237,685 | ribbon | 3,476 | 137 | 1,256 |

Four times the atoms costs a little over three times the load, so nothing here
is worse than linear. The mesh renderer's resident set is what stands out: a
ribbon of the ribosome holds 1.26 GB against the sphere renderer's 527 MB for
the same structure, which is the same geometry that `coord-morph` shows being
rebuilt from scratch every frame.

### Answering the pointer (`input-latency`)

A synthetic left drag, one move per frame, timed from handing the event to the
worker's mouse handler to that handler returning -- by which point the frame
has been built, because a view drag draws synchronously (`View::forceRedraw`
calls `drawScene()` itself rather than raising a flag for the frame loop).

| structure | atoms | p50 | p95 | p99 | max |
|---|---:|---:|---:|---:|---:|
| 1CRN | 327 | 0.30 | 0.40 | 0.40 | 0.53 |
| 4HHB | 4,779 | 0.30 | 0.40 | 0.40 | 0.53 |
| 1AON | 58,870 | 0.30 | 0.47 | 0.50 | 0.57 |
| 4V6X | 237,685 | 0.30 | 0.43 | 0.53 | 0.57 |

Flat across three orders of magnitude, and about 2% of a 16.6 ms frame at the
tail.

**This is not motion-to-photon.** It excludes everything before the event
reaches the worker -- the OS, the browser's event loop, the hop from the
renderer thread -- and everything after the frame is built: compositing, and
the display's own latency. Those are the larger terms in what a user feels, and
none of them is visible from inside the worker. What the number covers is the
part between this architecture's own two ends.

A cell here reports `drawnFrames: 0`, correctly: the drawing happens inside the
mouse handler, not in the frame loop the GL counters wrap, so the loop sees a
frame that drew nothing.

### The largest entry that exists (`3j3q`)

2,440,800 atoms, a 242 MB mmCIF -- an order of magnitude past the rest of the
ladder, and kept out of the default matrix because fetching and parsing it
dwarf everything else. One run each, to show whether it loads at all.

| scenario | fps | frame ms | cpu ms | gpu ms | load | rss |
|---|---:|---:|---:|---:|---:|---:|
| `static-orbit` | 60.0 | 16.64 | 0.27 | 17.18 | 15.3 s | 3,261 MB |
| `coord-morph` | 53.9 | 18.55 | 12.44 | 21.76 | 56.2 s | 2,967 MB |

It loads, and it holds vsync while being viewed. The CPU figure for static
viewing -- 0.27 ms -- is the same as at 237,685 atoms and at 327, which is the
clearest statement of the point: after the coordinate work, viewing cost does
not follow the structure at all.

Moving every atom is where this size finally costs something, and it is the
only cell where the GPU leads (21.8 against 12.4 ms of CPU) rather than the CPU
dominating. It reads 28 MB of coordinates into a texture every frame; giving
that texture a second face to write into took the upload from 22.0 to 9.9 ms
and the cell from 36.4 to 53.9 fps (see
[renderer-update-cost.md](../docs/architecture/renderer-update-cost.md)).
Loading is the practical limit: 56 s for the morph cell, which reads the
structure twice.

### Doing nothing (`idle`)

A self-check, not a result. With jitter AA, ambient occlusion and hover
highlighting all left at their defaults an idle frame is a full frame, and
then no scenario measures what it claims to.

| structure | atoms | draws/frame | gl calls/frame | cpu ms |
|---|---:|---:|---:|---:|
| 1CRN | 327 | 0 | 0 | 0.07 |
| 4HHB | 4,779 | 0 | 0 | 0.04 |
| 1AON | 58,870 | 0 | 0 | 0.08 |
| 4V6X | 237,685 | 0 | 0 | 0.05 |

Zero drawn frames out of 240 at every size, so the pins hold.

## Where the time goes

The counters in the addon answer what crossing into JS costs, and on every
scenario that rebuilds geometry the answer is: not much.

| cell | cpu ms | UBO uploads | buffer create | coord texture | accounted for |
|---|---:|---:|---:|---:|---:|
| 1AON cpk static-orbit | 3.54 | 38 us | 0 | 0 | 1.1% |
| 4V6X cpk static-orbit | 5.35 | 16 us | 0 | 0 | 0.3% |
| 1AON cpk prop-change | 38.86 | 18 us | 329 us | 93 us | 1.1% |
| 1AON ribbon prop-change | 346.63 | 31 us | 11,446 us | 0 | 3.3% |
| 4V6X cpk prop-change | 183.80 | 25 us | 4,222 us | 375 us | 2.5% |

This is worth stating plainly because the harness was built expecting the
opposite. The three per-object UBO uploads are 0.3% of the frame at the size
that struggles, and the buffer uploads 2.5-3.3%; the vertex-buffer transfer
work this project's WebGPU predecessor found so decisive -- a VBO ring beating
a single buffer by 27x -- has almost nothing to act on here, because that
benchmark generated its geometry from a lookup table and this one generates it
for real.

Sampling the worker thread (`profile_report.py` over macOS `sample`) says where
the rest is. Shares are of the worker thread's own self time:

| area | ribbon coord-morph | cpk coord-morph | cpk prop-change |
|---|---:|---:|---:|
| mesh emission | 14.0% | 0.0% | 0.0% |
| scriptable smart pointer (`LSupScrSp`) | 8.1% | 15.6% | 18.8% |
| per-element lookup (`getAtom`/`getResidue`/`getParent`) | 6.0% | 22.8% | 14.4% |
| RTTI (`dynamic_cast`) | 5.4% | 0.0% | 11.8% |
| colour resolution | 4.3% | 0.0% | 4.5% |
| selection test | 1.1% | 6.4% | 4.0% |
| allocation | 1.3% | 0.0% | 1.0% |

with the overhead charged to a handful of call sites: `MolAtom::getParentResidue`,
`MolResidue::getAtom`, `ColSchmHolder::getColor`, `PaintColoring::getAtomColor`,
`SelCommand::isSelected` -- per-atom accessors and per-atom colour resolution,
each taking and releasing a reference-counted scriptable handle, and several
doing a `dynamic_cast` to walk one step up the molecular hierarchy.

The addon's own binary (`cuemol_internal.node`) is 0.0% of that thread.

So the cost that remains is in the renderer core, which the desktop build
shares, and not in anything this port introduced. That answers the question the
harness was built to ask, and it moves the optimization work somewhere the
original plan did not point.
