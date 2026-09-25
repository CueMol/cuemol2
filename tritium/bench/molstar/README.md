# Mol* comparison harness

The CueMol3 / Mol\* MD playback comparison. The work instructions are in
[molstar-compare-instructions.md](molstar-compare-instructions.md); this page
says how the harness implements them and what to check when running it on
another machine. Results and write-ups do not live here (cuemol2 keeps the
harness and raw data only).

## What is here

| file | role |
|---|---|
| `main.js`, `index.html`, `renderer.js` | the Mol\* side: a minimal Electron app that loads Mol\*'s prebuilt viewer bundle, takes the same `--bench` arguments as CueMol, and prints the same result shape |
| `glcount.js` | GL call and byte counting, the same rule as CueMol's `glProxy.ts` |
| `appmetrics.js` | process memory from `app.getAppMetrics()`, a copy of CueMol's `main/bench/appMetrics.ts` |
| `run-compare.js` | runs both tools, one process per cell, shuffled per repetition |
| `../specs-compare/` | the cells, in CueMol's spec format plus a `tools` list |

Mol\* is pinned in `package.json` (`molstar` 5.11.0). Its Electron dependency
is only there for the lockfile: both tools run on the Electron binary that
`tritium/react-gui` installed, so they share one Chromium. `npm install` here
may skip Electron's own download; that is fine.

## Running

```sh
# once: CueMol built (task build_tritium), the MD corpus and its derived files
cd tritium/bench && python fetch-md.py      # derived files need MDAnalysis in that Python
cd molstar && npm install

node run-compare.js --only=ifabp-md,yiip-md,yiip-idle --repeat=1   # check first (below)
node run-compare.js --snapshots     # frame 0 of each data set, both tools
node run-compare.js --repeat=3      # the matrix
node run-compare.js --profile       # Mol* CPU profiles (yiip, a4nosol)
```

Results go to `../results/molstar-compare-<win|mac>-<date>/`. Summaries and
figures are made from its `cells/` by the scripts in cuemol3_paper_data
(`molstar-compare/summarize.py`, `figures.py`, `profile_summary.py`).

## Check before the matrix

From the first check cells (instructions 6.1):

- both tools report the same `canvas` (the GL drawing buffer), same `dpr`;
- the same `atomCount` per data set;
- idle draws 0 frames on both;
- the same `machine.unmaskedRenderer`.

## Canvas size: re-check on every machine

Both tools run with `--force-device-scale-factor=1`, so the canvas is in whole
device pixels. `--canvas` sizes the window's content; what is left for the
view depends on each tool's UI around it, so `CANVAS` in `run-compare.js`
holds a size per tool that makes both draw 1832x1010:

- Windows 11: CueMol `1876x1045` (its UI takes 44x35), Mol\* `1834x1012`.
- **macOS: not measured.** The menu bar is outside the window there and the
  window frame differs, so both values will change. Run one idle cell per tool,
  read `canvas` from the result, and adjust `CANVAS` until both read 1832x1010.

Pinning the DPR to 1 was needed on Windows, whose 150% scaling puts the two
layouts on different pixel grids. On a Retina display the alternative is to
drop the switch and size both at DPR 2 (the earlier M2 runs drew 1832x1010 at
DPR 2); either way both tools must draw the same size.

## Differences from the instructions, as run on Windows

- Both tools turn the camera 1 degree per frame, as CueMol's md-playback does.
- a4tail with all atoms is swept at 25 / 50 / 100 frames (the frames in the
  corpus), yiip at 100 / 300 / 901.
- Mol\*'s `sequential` playback at `maxFps: 60` shows a new frame on about 40
  of 60 draws; that is its own gating, recorded as is.
