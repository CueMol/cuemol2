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

## Results

The raw results of every run are in `results/`, one JSON and one CSV per run. The
write-ups of the results (tables, analysis) are kept outside this repository.
