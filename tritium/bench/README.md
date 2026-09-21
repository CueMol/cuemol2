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
