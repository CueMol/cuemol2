# Running the benchmark on another machine

Every number in [README.md](README.md) came from one machine: an Apple M2,
where Electron reaches the GPU through ANGLE's Metal backend. That is a
narrower claim than it looks.

The coordinate-texture ring in particular is built around what a driver does
when you write into a texture the GPU is still reading. Metal, D3D11 and
Vulkan do not handle that the same way -- some drivers rename the resource
internally, which would do the ring's job already and leave it measuring
nothing. And an Apple M2 shares one pool of memory between CPU and GPU, while a
discrete card does not, so an upload is a fundamentally different operation on
each. A second machine is what turns "this helped here" into something worth
writing down.

This is what to run there, and what to send back.

## What you need

- The repository, on the `bench/perf-harness` branch. It carries the harness;
  `develop` does not, on purpose.
- A build toolchain per the repository's own setup (`CLAUDE.md`, `build_scripts/`).
- About 1 GB of disk for the structures, and an internet connection to fetch
  them once.
- A real GPU. A remote desktop session, a VM without passthrough or a headless
  runner will measure its software rasteriser, not the machine.

Nothing in the harness is macOS-specific: `run.js`, `fetch.sh` and `perturb.py`
contain no platform branches. The one exception is `profile_report.py`, which
parses the output of macOS `sample`; it is only needed to attribute CPU time
inside the renderer, which this exercise does not require.

## 1. Build, in Release

The default POSIX build is Debug, and `MB_DPRINTLN` sits in the render path
there. A Debug build will produce numbers, and they will be wrong.

```sh
cd build_scripts
task rebuild_libcuemol2 CONFIG=Release
task build_tritium CONFIG=Release
```

Check it starts before going further:

```sh
task run_tritium FRESH=1
```

## 2. Fetch the structures

```sh
cd tritium/bench
./fetch.sh          # 1CRN, 4HHB, 1AON, 4V6X -- about 35 MB
./fetch.sh --all    # the above plus 3J3Q -- 242 MB more
```

`fetch.sh` downloads from RCSB using the same URL the application's Get PDB
dialog uses, derives a displaced copy of each for the coordinate-change
scenario, and writes `data/manifest.json` with each file's size and SHA-256.
Check the manifest matches the one in this branch: a different file means a
different measurement.

Include `--all` if the machine has the memory for it. 3J3Q is 2,440,800 atoms
and the run reaches about 3 GB resident; it is also the cell where the ring
mattered most, so it is the interesting one. Skip it rather than swap.

## 3. Run

```sh
node run.js --repeat=3
```

One process per cell, so no cell inherits the previous one's allocations or
driver state. Expect 30-60 minutes for the default matrix, longer with 3J3Q.

To run a subset:

```sh
node run.js --specs=4v6x-cpk-coord-morph,4v6x-cpk-static-orbit --repeat=3
node run.js --specs=3j3q-cpk-coord-morph --repeat=1     # run this one alone
```

**Leave the machine alone while it runs.** A window over the Electron one, a
screen that sleeps, a background build -- all of it lands in the frame times.
Do not move the mouse across the benchmark window: hover is switched off
inside the run, but the compositor is not.

Results land in `results/` as CSV and JSON, one pair per invocation.

## 4. Check the run before trusting it

Open the JSON and look at these, for any cell:

| field | expected | if not |
|---|---|---|
| `machine.unmaskedRenderer` | names the real GPU | a software renderer, or the extension is blocked; the run is not comparable |
| `view.fitted` | `true` | the camera did not frame the structure, so most of it is off-screen and the cell measures the viewport |
| `unpinned` | empty | a confounder (jitter AA, ambient occlusion) could not be switched off and is in the frame times |
| `input.gpuPickOff` | `true` | the hover hit test may have run |
| `gpuMs` | a number | `EXT_disjoint_timer_query_webgl2` is missing on this driver -- everything else is still valid, note it |

Then run the self-check:

```sh
node run.js --specs=1crn-cpk-idle,4v6x-cpk-idle --repeat=1
```

Both cells must report `drawnFrames: 0`. A non-zero count means something is
redrawing an idle scene, and every other number on the machine is inflated by
whatever that is.

## 5. Send back

- the whole `results/` directory from the run, and
- `data/manifest.json`, and
- anything unusual you noticed while it ran.

The results carry the machine with them -- `machine.unmaskedRenderer`,
`machine.version`, the platform, the Electron build -- so they identify
themselves. The CSV has the same in its `gpu`, `gl_version` and `platform`
columns.

## What the comparison is for

Two things, specifically.

**Does the coordinate-texture ring help here too?** Compare `coord-morph`
against this branch's parent with `TextureStore`'s `COORD_TEX_RING` set to 1.
On the M2 the upload halved on 3J3Q and the cell went from 36.4 to 53.9 fps.
If a D3D11 driver already renames the texture, the ring will show nothing --
which is worth knowing and is not a failure.

**Does the shape of the result hold?** The M2 numbers say static viewing costs
about 0.3 ms of CPU regardless of structure size, and that moving atoms is
bounded by the upload rather than by anything per-atom. Those are claims about
the architecture rather than about one machine, and a second machine is what
decides whether they are.
