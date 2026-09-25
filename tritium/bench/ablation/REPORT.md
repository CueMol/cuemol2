# GPU coordinate-transfer ablation (ring x staging): report

Apple M2, run on 2026-09-24/25. Instructions: `docs/plans/ablation-bench-instructions.md`
(not on this branch; kept alongside it in the working copy).

The report, results and scripts are also copied to `bench/perf-harness`; the harness
code they were measured with (the `crdSend` / `texUpload` timers, the `createBuffer`
counter, the F/G/H patches) is on `bench/ablation` only.

All numbers below come from this run, under
`tritium/bench/results/ablation-m2-20260925/`. Earlier documents are used only as the
references of the acceptance checks (section 3).

## 1. Conditions

| condition | ring (#626, `538a0698`) | staging (#628, `47615503`) | source | HEAD |
|---|:-:|:-:|---|---|
| A | - | - | `3cfd40c7` (merge of #625) | `3cfd40c7` |
| B | yes | - | `98731d7e` (merge of #626) | `98731d7e` |
| C | - | yes | `ebb4bddb` + `git revert 538a0698` | `18550a45` (main run), `b3a703ce` (alloc rerun) |
| D | yes | yes | `ebb4bddb` (merge of #628) | `ebb4bddb` |

- C was rebuilt once, for the alloc rerun. The two revert commits have the same parent
  (`ebb4bddb`) and the same tree (`git diff 18550a45 b3a703ce` is empty).
- #625 (coordinate array as the source of truth) is in all four conditions and is not
  measured.

**Diff checks (section 1 of the instructions)**

- `3cfd40c7..98731d7e`, docs excluded: only `TextureStore.ts` (+67/-16).
- `98731d7e..ebb4bddb`, docs excluded: only the six files of #628 (#627 is docs only).
- The revert of `538a0698` on `ebb4bddb` applied without conflict. C's `TextureStore.ts`
  is identical to A's, i.e. the ring is gone and the #628 changes stay.

**Harness overlay**

The harness lives on `bench/perf-harness` and was laid over each condition as a patch:

```sh
git diff ebb4bddb <commit> -- . ':!tritium/bench/results' ':!docs' ':!tritium/docs'
```

| used for | from `bench/ablation` commit | SHA-256 |
|---|---|---|
| main run (132 cells), timer overhead | `bb85be19` | `406cbda3066ef3666399a1519412d41cf51b73edaf77d2a57e15452ddd063cf3` |
| alloc rerun, F/G/H | `0db6b5f6` (adds the `createBuffer` counter) | `c976f716719ee436e6dd210222aebd1ec0f98c677b47207b39effa9e918a26d5` |

- The merge-base of develop and the harness branch was not `ebb4bddb` as the
  instructions assumed: the harness branch had #629-#631 merged in. The patch therefore
  also carries those MD changes (`src/modules/mdtools`, the bulk atom removal in
  `MolCoord`/`MolChain`, `qlib::TaskGroup`). They are identical in the four conditions,
  and coord-morph, static-orbit and idle do not reach them.
- Apart from that, the patch adds the two timers of section 2 (`qlib/BenchTimer` in
  `CoordTexSupport::ctUpdate`, and the `texSubImage2D` timer in `TextureStore.ts`), and
  in A and B a `BenchScope` at the top of `EcFloatDataTexture::update()`, as instructed.
  No other product code was changed.

## 2. Setup

- **Machine**: Apple M2, 24 GB, macOS 26.5.2, on AC power, Low Power Mode off. `pmset
  -g therm` recorded no thermal or performance warning before or after any run.
- **Canvas**: 1920x1080 window, panels closed, canvas 1832x1010 at DPR 2.
- **Cells**: 5 structures x coord-morph, 5 x static-orbit, 4V6X x idle; 2 s warm-up,
  6 s measured; one process per cell; 10 s pause after each 3J3Q cell.
- **Order**: three repetitions, the conditions shuffled inside each (`run-ablation.js`).
  The shuffle of the main run was biased: repetitions 2 and 3 got the same order
  (rep 1 D B A C, reps 2 and 3 B D A C). The seed mixing was fixed before the alloc
  rerun, whose values agree with the main run within 1% (section 5).
- **Builds**: Release, one worktree per condition with its own `.build_out` and
  `node_modules`. Each run logs the addon path and the commit it was built from
  (`run-log.json`).
- 132 cells, none failed, ran out of memory or timed out.

**Timers**

| name | span | where |
|---|---|---|
| `crdSend` | one renderer's per-frame coordinate send: gather, (A/B) ArrayBuffer allocation and memcpy, `EcFloatDataTexture::update`/`updateFromStaging`, the JS `texSubImage2D` | entry to exit of `CoordTexSupport::ctUpdate` |
| `texUpload` | the JS `gl.texSubImage2D` call itself | `TextureStore.ts` |

`texUpload` uses the addon's steady_clock (`benchNowUs`), because the worker's
`performance.now()` steps by 100 us. `crdSend - texUpload` is the gather, allocation, copy
and N-API cost.

**Timer overhead**: D, 4V6X coord-morph, three runs each with the timers on and off
(`CUEMOL_BENCH_TIMERS=0`): update fps 60.04 against 59.93 (+0.18%), worker CPU 0.963
against 0.959 ms (+0.48%), frame 16.634 against 16.636 ms. All under 1%.

**GPU ms is not reported for coord-morph.** The `EXT_disjoint_timer_query` spans the GL
commands of a whole rAF tick, which includes the coordinate `texSubImage2D` and any wait
it causes. In coord-morph it is therefore not render time (in D it exceeds the frame
time, 20.5 against 17.2 ms). In static-orbit nothing is uploaded, so there it is the
render time and is used as the control (Fig D).

## 3. Acceptance checks (section 5 of the instructions)

`summarize.py` applies the checks literally; `checks.json` records the result. Five of
the six fail as computed. The reading below, per check, was agreed with the reviewer; no
criterion was relaxed in the script, and no cell was excluded.

| # | check | measured | as computed | reading |
|---|---|---|---|---|
| 1 | A reproduces the documented values (+-5%) | 4V6X coord-morph 60.04 fps (60.0), CPU 1.53 ms (1.58); 3J3Q coord-morph 36.98 fps (36.4); 4V6X static-orbit CPU 0.331 ms (0.30); 3J3Q texSubImage2D 18.90 ms (22.0) | fail | Reproduced. The documented 22.0 ms is the addon's `coordTexUpdate` (allocation, memcpy, N-API and the JS side), for which A measures 21.74 ms; the 18.90 ms is the new JS-only `texUpload`. The static-orbit CPU is 30 us off. |
| 2 | B 3J3Q coord-morph about 52-54 fps | 55.2 fps | fail | +2.4% over the 53.9 fps in the docs (the commit message says 52.4); direction and size of the effect agree (A 37.0 -> B 55.2 fps). |
| 3 | idle: no drawn frames, no GL calls | 0 drawn frames in all 12 cells; 0.029 GL calls per frame (about 7 in 240 frames) | fail | No redraw is running, which is what the check is for. The few calls fall in no counted category and are unrelated to drawing. Report as "0 drawn frames, <=0.03 GL calls per frame". |
| 4 | static-orbit CPU and GPU within +-3% across conditions | GPU within 1.5% for every structure; CPU off by up to 6% (4V6X) and 72% (3J3Q, 0.03-0.18 ms) | fail | GPU time, the render cost, agrees. The CPU values are 0.03-0.35 ms, where tens of microseconds are several percent. |
| 5 | fitted, pinned, input isolated; rendererProps equal | no violation | pass | |
| 6 | repetition CV under 3% | 46 cell x metric pairs above 3% | fail | Almost all are metrics below 0.1 ms, or worker CPU at 0.03-0.35 ms. Of the cells the claims rest on (3J3Q and 4V6X coord-morph), only A/B/C 4V6X GPU ms (not reported, see above), A/B 4V6X `texUpload` (0.16 ms) and D 3J3Q `texUpload` (3.2%) are above. The full list is in `checks.json`. |

Reporting rules that follow: mean +- SD; values below 0.1 ms are shown as such and not
used for any comparison; the claims rest on 3J3Q and 4V6X coord-morph, where the
differences between conditions are an order of magnitude or more above the spread.

## 4. Results

### coord-morph, all structures (update fps, mean of 3)

| structure | atoms | bytes/frame | A | B | C | D |
|---|---:|---:|---:|---:|---:|---:|
| 1CRN | 327 | 12 KB | 60.0 | 60.1 | 60.0 | 60.0 |
| 4HHB | 4,779 | 61 KB | 60.0 | 60.0 | 60.0 | 60.0 |
| 1AON | 58,870 | 0.71 MB | 60.0 | 60.0 | 60.0 | 60.0 |
| 4V6X | 237,685 | 2.86 MB | 60.0 | 60.0 | 60.0 | 60.0 |
| 3J3Q | 2,440,800 | 29.3 MB | **37.0 +- 0.2** | **55.2 +- 0.1** | **39.0 +- 0.1** | **57.9 +- 0.3** |

Below 3J3Q every condition holds 60 fps; the effect shows in the send time (Fig B) and
worker CPU (4V6X: A 1.53, B 1.56, C 1.03, D 1.02 ms).

### 3J3Q coord-morph

| condition | update fps | frame ms (mean / p95) | worker CPU ms | crdSend ms | texUpload ms | crdSend - texUpload ms | RSS |
|---|---:|---:|---:|---:|---:|---:|---:|
| A | 37.0 +- 0.2 | 26.93 / 31.47 | 24.11 +- 0.18 | 23.89 +- 0.21 | 18.90 +- 0.21 | 4.99 +- 0.02 | 4.68 GB |
| B | 55.2 +- 0.1 | 18.08 / 28.60 | 11.91 +- 0.15 | 11.68 +- 0.15 | 6.56 +- 0.11 | 5.12 +- 0.07 | 4.07 GB |
| C | 39.0 +- 0.1 | 25.53 / 27.43 | 23.46 +- 0.06 | 23.37 +- 0.06 | 21.37 +- 0.06 | 2.00 +- 0.01 | 4.86 GB |
| D | 57.9 +- 0.3 | 17.22 / 20.77 | 8.83 +- 0.25 | 8.70 +- 0.25 | 6.55 +- 0.21 | 2.15 +- 0.04 | 4.23 GB |

### 4V6X coord-morph

| condition | update fps | worker CPU ms | crdSend ms | texUpload ms | crdSend - texUpload ms |
|---|---:|---:|---:|---:|---:|
| A | 60.0 +- 0.1 | 1.53 +- 0.03 | 1.353 +- 0.024 | 0.162 +- 0.009 | 1.192 +- 0.017 |
| B | 60.0 +- 0.0 | 1.56 +- 0.02 | 1.375 +- 0.013 | 0.161 +- 0.006 | 1.213 +- 0.007 |
| C | 60.0 +- 0.0 | 1.03 +- 0.01 | 0.845 +- 0.009 | 0.200 +- 0.001 | 0.645 +- 0.009 |
| D | 60.0 +- 0.1 | 1.02 +- 0.01 | 0.836 +- 0.011 | 0.201 +- 0.004 | 0.636 +- 0.011 |

### Main effects and interaction (`effects.csv`)

Main effect = mean of the two conditions with the change minus the mean of the two
without; interaction = (D - C) - (B - A).

| structure | metric | ring | staging | interaction |
|---|---|---:|---:|---:|
| 3J3Q | update fps | +18.5 | +2.4 | +0.7 |
| 3J3Q | crdSend ms | -13.44 | -1.75 | -2.46 |
| 3J3Q | texUpload ms | -13.58 | +1.23 | -2.47 |
| 3J3Q | crdSend - texUpload ms | +0.14 | -2.98 | +0.02 |
| 4V6X | update fps | -0.01 | -0.00 | +0.10 |
| 4V6X | crdSend ms | +0.01 | -0.52 | -0.03 |
| 4V6X | crdSend - texUpload ms | +0.01 | -0.56 | -0.03 |

**Reading**

- **The two changes act on separate spans.** The ring acts on `texUpload` only
  (3J3Q A -> B: 18.90 -> 6.56 ms, while `crdSend - texUpload` stays at 5.0-5.1 ms). The
  staging buffer acts on `crdSend - texUpload` only (3J3Q A -> C: 4.99 -> 2.00 ms;
  4V6X: 1.19 -> 0.65 ms). D combines B's `texUpload` (6.55 ms) with C's remainder
  (2.15 ms).
- **The one interaction is in `texUpload`.** With the staging buffer alone (C), 3J3Q's
  `texUpload` gets slower, 18.90 -> 21.37 ms: with the preceding work shorter, the write
  meets the face the GPU is still reading sooner. The ring removes that wait (D 6.55 ms),
  which is the -2.47 ms interaction. At 4V6X (2.86 MB) neither the slowdown (+0.04 ms)
  nor the ring's effect shows.
- **In fps, the ring dominates at 3J3Q** (+18.5 against +2.4 fps). At 4V6X all four
  conditions are at 60 fps; there the staging buffer's effect is in worker CPU
  (1.53 -> 1.03 ms), not in fps.

### Allocation per frame (alloc rerun)

A counter on `EcFloatDataTexture`'s `createBuffer` was added (`0db6b5f6`), and 3J3Q and
4V6X coord-morph were rerun, three times per condition (24 cells, none missing). The
existing `alloc MB/f` counter (`ElecDisplayContext::allocBuffer`) reads 0 in every
condition because this allocation does not go through it.

| structure | A, B: MB per frame | at 60 fps | C, D: MB per frame |
|---|---:|---:|---:|
| 3J3Q | 29.30 | 1.76 GB/s | 0.0005 |
| 4V6X | 2.864 | 0.17 GB/s | 0.0005 |

The 0.5 KB left in C and D is not coordinate data and is common to all conditions. The
rerun's fps, `crdSend` and `texUpload` agree with the main run within 1% (3J3Q D:
57.94 fps, `crdSend` 8.46 ms, `texUpload` 6.33 ms).

### Control: static-orbit (Fig D)

| structure | GPU ms, A / B / C / D | worker CPU ms, A / B / C / D |
|---|---|---|
| 1CRN | 0.84 / 0.84 / 0.84 / 0.84 | 0.29 / 0.29 / 0.28 / 0.28 |
| 4HHB | 1.60 / 1.60 / 1.60 / 1.59 | 0.30 / 0.30 / 0.28 / 0.30 |
| 1AON | 4.18 / 4.25 / 4.25 / 4.26 | 0.32 / 0.30 / 0.31 / 0.31 |
| 4V6X | 8.27 / 8.41 / 8.42 / 8.47 | 0.33 / 0.32 / 0.31 / 0.35 |
| 3J3Q | 17.34 / 17.28 / 17.23 / 17.35 | <0.1 / 0.18 / <0.1 / 0.11 |

The render cost is the same in all four conditions (within 1.5%).

### idle

4V6X idle: 0 drawn frames in all 12 cells, render fps 60.0 (the loop runs, nothing is
drawn), worker CPU <0.1 ms, <=0.03 GL calls per frame.

## 5. Copies left inside ANGLE, and the conditions not adopted

D's remaining 6.55 ms of `texUpload` (29.3 MB, about 4.5 GB/s) was profiled in the GPU
process (`sample`, `profiles/angle-D-gpu.txt`). Inside `GL_TexSubImage2DRobustANGLE`,
about 7.4 ms of GPU-process CPU per frame (estimated) splits into:

| work | share | per frame (est.) |
|---|---:|---:|
| an ANGLE loop before `replaceRegion`, taken to be the RGB -> RGBA conversion (symbols are stripped) | 31% | ~2.3 ms |
| Metal `replaceRegion`, where the AGX driver twiddles the data into its tiled layout on the CPU (`agxsTwiddleAddressCommon<...16ul...>`: 16 bytes per texel, i.e. RGBA32F) | 68% | ~5.0 ms |

Three further conditions on top of D tested whether removing these helps. They are
experiments only (patches in `conditions/`, details in `conditions/README.md`).

| 3J3Q coord-morph, 3 runs each | D | F: PBO | G: RGBA32F | H: RGBA32F + PBO |
|---|---:|---:|---:|---:|
| update fps | 57.6 | 52.4 | 54.4 | 57.1 |
| texUpload ms | 6.68 | 8.99 | 8.59 | 6.30 |
| bytes per frame | 29.3 MB | 29.3 MB | 39.1 MB | 39.1 MB |
| GPU-process CPU for the upload (est.) | ~7.4 ms | ~2.2 ms | ~4.5 ms | ~2.1 ms |

(D was rerun alongside F/G/H, hence 57.6 rather than the main run's 57.9 fps.)

The PBO and RGBA32F remove the copies inside ANGLE but do not raise the frame rate; at
4V6X D has the lowest CPU time. **Neither is adopted**, and their code stays on this
branch only. What remains appears to be the renderer-to-GPU-process transfer, which was
not verified. Avoiding the driver's twiddle altogether needs something other than a
texture, e.g. a WebGPU storage buffer; that is a separate question.

## 6. Anomalies and missing data

- No cell failed or is missing (main run 132, alloc rerun 24, timer overhead 6).
- The main run's shuffle gave repetitions 2 and 3 the same order (section 2).
- 3J3Q static-orbit worker CPU varies widely between runs (CV 19-112%) at 0.03-0.18 ms.
- The GL calls in idle (about 7 per 240 frames) were not identified. Recording the
  function names in `glProxy` would identify them.

## 7. Figures

In `results/ablation-m2-20260925/`, each as PDF and PNG (`figures.py`):

- **Fig A** `fig_a_fps_vs_atoms`: coord-morph update fps against atom count, four
  conditions.
- **Fig B** `fig_b_send_time_vs_bytes`: `texUpload` and `crdSend - texUpload` against
  bytes per frame, log-log. The ring moves the left panel, the staging buffer the right.
  The region below 0.1 ms is shaded and not used for comparison.
- **Fig C** `fig_c_3j3q_2x2`: 3J3Q update fps and `crdSend` for the four conditions.
- **Fig D** `fig_d_static_orbit_control`: static-orbit worker CPU and GPU ms, the
  control.

## 8. Files

| path | content |
|---|---|
| `results/ablation-m2-20260925/raw/` | every cell's JSON and CSV, main run |
| `results/ablation-m2-20260925/{summary.csv, effects.csv, checks.json, run-log.json}` | summary, effects, acceptance checks, run log (commits, addon paths, machine state) |
| `results/ablation-m2-20260925/overhead/` | timer on/off check |
| `results/ablation-m2-20260925/alloc-rerun/` | `createBuffer` counter rerun |
| `results/ablation-m2-20260925/{pbo-F, rgba-pbo}/` | conditions F, G, H |
| `results/ablation-m2-20260925/profiles/` | GPU-process and renderer `sample` profiles, D/F/G/H |
| `ablation/setup-worktrees.sh`, `build-all.sh` | worktrees, patch, builds |
| `ablation/run-ablation.js`, `summarize.py`, `figures.py` | shuffled runner, summary and checks, figures |
| `ablation/conditions/` | F/G/H patches and notes |
