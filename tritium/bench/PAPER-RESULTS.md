# Results for the paper: where they are

One entry point for the benchmark results the paper draws on. This page gives the
headline numbers and points to the page that owns each set; the numbers and their
caveats live there, recomputed from the raw files under `results/`.

## Machines

| machine | GPU path | canvas | used for |
|---|---|---|---|
| Apple M2 (4P + 4E cores, 24 GB), macOS 26.5 | ANGLE on Metal | 1832x1010 (1920x1080 window, DPR 2, panels closed) | everything below |
| Windows 11, i9-14900KF, RTX 4070 (PCIe 4.0 x16) | ANGLE on D3D11 | window size not recorded, DPR 1.5 (see the Windows section) | #628 and md-playback, second machine |

Release builds, 2 s warm-up, 6 s measured, one process per cell, three repetitions.

## 1. Main result: the coordinate-transfer path (ring x staging, M2)

Owner: [`ablation/REPORT.md`](ablation/REPORT.md); figures A-D, raw data and checks in
`results/ablation-m2-20260925/`.

The two changes to the GPU coordinate path (#626 ring, #628 staging buffer), measured in
all four combinations:

| 3J3Q coord-morph (2,440,800 atoms, 29.3 MB/frame) | A: neither | B: ring | C: staging | D: both |
|---|---:|---:|---:|---:|
| update fps | 37.0 +- 0.2 | 55.2 +- 0.1 | 39.0 +- 0.1 | 57.9 +- 0.3 |
| crdSend ms | 23.89 | 11.68 | 23.37 | 8.70 |
| texUpload ms | 18.90 | 6.56 | 21.37 | 6.55 |
| crdSend - texUpload ms | 4.99 | 5.12 | 2.00 | 2.15 |
| allocation per frame | 29.3 MB | 29.3 MB | ~0 | ~0 |

- The ring acts on `texUpload` only, the staging buffer on `crdSend - texUpload` only;
  the one interaction is in `texUpload` (-2.47 ms).
- Below 3J3Q every condition holds 60 fps; the staging buffer shows in worker CPU
  (4V6X 1.53 -> 1.03 ms).
- Control: static-orbit GPU time agrees within 1.5% across the four conditions.
- Five of the six acceptance checks fail as computed; the report gives each check's
  values and why the data stands. Reporting rules: mean +- SD, values below 0.1 ms not
  used for comparison, no coord-morph GPU ms (the timer query includes the upload).
- The copies left inside ANGLE (RGB -> RGBA conversion, AGX twiddle) were profiled; PBO
  and RGBA32F (conditions F/G/H) remove them without raising the frame rate and are not
  adopted.

## 2. Before the transfer work: where a frame went (M2)

Owner: [`README.md`](README.md), "Baseline", and
`tritium/docs/architecture/renderer-update-cost.md` on develop (before/after #625).

- 4V6X under coord-morph went from 24.9 fps to vsync with #625; static-viewing CPU is
  flat at about 0.3 ms across the whole structure ladder.

## 3. MD trajectory playback (M2 and Windows)

Owner: [`MD-RESULTS.md`](MD-RESULTS.md).

- Corpus: ifabp (12k atoms, DCD), yiip (112k, XTC), mcv448 (161k, XTC), a4tail (3.9M,
  XTC, 91% water), all public, CC-BY 4.0, hashes pinned in `md-corpus.json`.
- Mid-size systems play at 60 fps; with next-frame prefetch (#631) a first showing
  costs about what a repeated one does (yiip 0.59 ms, mcv448 0.63 ms, M2).
- a4tail with the water not loaded (#630) plays at 60 fps from the first frame on both
  machines.
- Loading the 3.9M-atom GRO: 12.5 -> 4.8 s (#633), content unchanged.

## 4. Windows / RTX 4070

Raw files: `results/bench-2026-09-24T02-12-31-976Z` (full matrix before #628),
`bench-2026-09-24T04-44-55-351Z` and `bench-2026-09-24T05-32-42-606Z` (after #628),
`bench-2026-09-25T02-58-09-447Z` (md-playback, owned by `MD-RESULTS.md`).

**The staging buffer (#628) on Windows**

| 3J3Q coord-morph | before #628 | after #628 |
|---|---:|---:|
| update fps | 40.0 | 58.6 (58.0 after merging develop back in) |
| coordinate upload (`coordTexUpdate`) per update | 8.67 ms | 4.26 ms |
| worker CPU | 11.9 ms | 7.3 ms |

4V6X coord-morph is at 60 fps before and after (worker CPU 0.88 -> 0.51 ms).

**Full matrix before #628** (cpk, means of 3)

| structure | static-orbit CPU / GPU ms | coord-morph fps / CPU ms | prop-change fps |
|---|---|---|---:|
| 1CRN | 0.11 / 0.93 | 60.0 / 0.15 | |
| 4HHB | 0.12 / 1.84 | 60.0 / 0.18 | |
| 1AON | 0.11 / 3.42 | 60.0 / 0.37 | 18.0 |
| 4V6X | 0.10 / 4.26 | 60.0 / 0.88 | 3.75 |
| 3J3Q | 0.12 / 5.32 | 40.0 / 11.9 | |

Idle cells draw no frames; input-latency cells run at about 59.5 updates per second.

**Caveats for the Windows numbers**

- The canvas size recorded in every Windows file (300x150) is a harness fault, not the
  drawn size; the runs were made with the panels closed and the view as the main area,
  but the window size was not noted. The harness now records the drawing buffer
  (`ceafbc1a`).
- The 2026-09-24 files carry no build provenance (commit, addon path); that was added to
  the harness afterwards. They are placed before/after #628 by when they were run.
- DPR 1.5 against the M2's 2 means about 0.56x the pixels at the same window size, so
  GPU-bound cells do not compare directly between the machines.

## Not done yet

**Windows**
- Rerun with the fixed harness, so that the drawn canvas size and the build are
  recorded (at least md-playback and the #628 cells).
- The ring x staging ablation (instructions, section 7, optional). It needs the four
  condition worktrees built on Windows (`ablation/setup-worktrees.sh`,
  `ablation/build-all.sh`) and the harness overlay from `bench/ablation`.
- Two things worse than on the M2, not investigated: yiip / ribbon at 20.3 fps with
  48 ms of CPU per frame, and a4tail with every atom loaded peaking at about 12 GB
  resident (M2 about 4 GB).

**M2**
- The renderer-to-GPU-process transfer, which appears to be what remains after the
  ANGLE copies, has not been verified.
- The GL calls in idle (about 7 per 240 frames) have not been identified.
- The app-level a4tail load times in `MD-RESULTS.md` predate #633 (optional rerun).
