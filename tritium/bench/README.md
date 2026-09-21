# tritium performance benchmark harness

Measures the CueMol3 rendering path -- C++ geometry generation, the N-API
boundary, and the WebGL2 frame loop in the Web Worker -- on real molecular
scenes.

**This directory lives on `bench/perf-harness` and is never merged into
`develop`.** Optimizations found with it are implemented on their own
`perf/<topic>` branch cut from `develop`, measured by merging that branch into
this one temporarily, and go to `develop` by pull request.

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

| scenario | per frame | read |
|---|---|---|
| `static-orbit` | rotate the view; geometry never changes | `render_fps`, frame-time percentiles, GPU ms, GL calls per frame |
| `md-playback` | advance one trajectory frame **per displayed frame** | `update_fps` -- how many new frames actually reached the screen |
| `prop-change` | change a renderer property | `update_fps`, `gl_buffer_sub_data_bytes` |
| `load` | nothing; the load already happened | `load_ms` |
| `idle` | nothing at all | a self-check: this must draw zero frames |

## Reading the numbers

`render_fps` is how often the picture was redrawn. `update_fps` is how often
the scenario's payload actually advanced -- a trajectory frame consumed, a
property change taken up. A scenario that changes nothing reports zero for it
by definition, and the meaningful number there is `render_fps`.

Both are capped by vsync at 60, so below a few hundred thousand atoms every
configuration sits at 60 and the differences are in the frame-time
percentiles, the GPU time and the GL call counts instead.

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
| `react-gui/src/renderer/worker/server/gfx/ViewLoopController.ts` | per-frame timing |
| `react-gui/src/renderer/worker/server/gfx_manager.ts` | `enableBenchCounters()` |
| `react-gui/src/renderer/worker/server/WorkerService.ts` | two accessors for the harness |

The result travels back on the console behind a `[BENCH_RESULT]` marker, which
main watches for. That is why nothing was added to the shared IPC contract or
the preload surface -- the two files this branch would otherwise conflict with
`develop` over most often.

## Baseline (2026-09-21)

Apple M2, macOS 26.5, Release build, 1832x1010 canvas (a 1920x1080 window at
DPR 2, panels closed), `static-orbit`, 6 s after a 2 s warm-up. `uboUs/f` and
`drawUs/f` are the addon's own timers divided by the frame count.

| structure | atoms | renderer | load ms | gpu ms | draws/f | gl/f | uboUs/f | drawUs/f | rss MB |
|---|---|---|---|---|---|---|---|---|---|
| 1CRN | 327 | cpk | 266 | 0.47 | 2.0 | 42 | 48.1 | 17.1 | 227 |
| 1CRN | 327 | ballstick | 264 | 0.36 | 3.0 | 63 | 67.4 | 19.9 | 225 |
| 1CRN | 327 | cartoon | 264 | 0.43 | 2.0 | 37 | 64.6 | 19.6 | 227 |
| 1CRN | 327 | dsurface | 266 | 0.39 | 2.0 | 39 | 64.5 | 21.2 | 233 |
| 1CRN | 327 | simple | 265 | 0.34 | 2.0 | 42 | 57.2 | 14.8 | 226 |
| 4HHB | 4,779 | cpk | 296 | 3.18 | 2.0 | 42 | 59.6 | 14.7 | 233 |
| 4HHB | 4,779 | ballstick | 296 | 0.83 | 3.0 | 64 | 82.4 | 23.1 | 238 |
| 4HHB | 4,779 | cartoon | 297 | 0.91 | 2.0 | 37 | 67.9 | 20.2 | 255 |
| 4HHB | 4,779 | dsurface | 296 | 2.63 | 7.0 | 169 | 60.3 | 36.7 | 260 |
| 1AON | 58,870 | cpk | 792 | 4.34 | 2.2 | 46 | 33.8 | 10.2 | 312 |
| 1AON | 58,870 | ballstick | 781 | 2.00 | 3.0 | 63 | 40.9 | 11.7 | 344 |
| 1AON | 58,870 | cartoon | 1,123 | 8.71 | 7.0 | 165 | 31.6 | 18.6 | 697 |
| 4V6X | 237,685 | cpk | 2,553 | 8.69 | 2.0 | 42 | 15.8 | 5.0 | 531 |
| 4V6X | 237,685 | cartoon | 34,213 | 8.21 | 2.0 | 37 | 11.7 | 3.7 | 1,396 |

Every cell holds 60 render fps -- vsync, and the GPU time never exceeds 8.7 ms
of the 16.6 ms budget -- so nothing here is limited by drawing. What the table
is really about is the fixed cost per frame and what it is spent on.

**Uniform uploads cost three to four times what the draws do, at every size.**
Three UBO uploads per drawn object per frame (matrices, fog, draw params), each
allocating a fresh ArrayBuffer in C++ and doing a bufferSubData in JS, against
one draw call. At 1CRN -- 327 atoms, two objects -- that is already 48 us a
frame against 17 us of drawing. The matrices and the fog are identical for
every object in a pass, so most of it is the same 192 and 32 bytes re-sent for
each object. This is the first thing to fix.

**The per-frame cost does not scale with the structure.** 4V6X has 727 times
the atoms of 1CRN and a *lower* per-frame uniform cost (15.8 us against 48.1),
because the cost follows the number of drawn objects, which barely moves. A
molecular scene is a handful of big buffers, so the fixed overhead is what
there is to win -- and it is the same win at every size.

**`dsurface` at 4,779 atoms draws seven times per frame for 169 GL calls**,
where the same structure as cartoon draws twice for 37. The edge/silhouette
pass re-draws the same buffer with a second program, and it shows.

**Loading dominates the large end.** 4V6X cartoon takes 34 s to load against
2.6 s for cpk, and holds 1.4 GB resident. That is geometry generation on the
C++ side, not transfer.

`idle` draws 0 of 240 frames with no GL calls at both 327 and 237,685 atoms, so
the pins hold across the range and the numbers above are of the scenario rather
than of a background redraw.
