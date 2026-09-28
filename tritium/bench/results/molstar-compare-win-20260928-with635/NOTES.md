# molstar-compare-win-20260928-with635

CueMol cells only (`run-compare.js --tools=cuemol --repeat=3`), at `bench/molstar-compare-with635`
(origin/bench/molstar-compare merged with develop through #649, so it contains #633-#635), plus the
harness fix that re-sends the canvas layout size before a cell and fails a cell whose drawing buffer
differs after the warm-up.

- 45 cells, 44 ok. `a4all-md-loadsel` rep 1 crashed (render-process-gone, exit 0xC0000094,
  integer divide by zero in native code).
- `046-cuemol-a4all-md-loadsel-r1-rerun.json` replaces that rep: it is the first successful
  attempt after it, copied from `../molstar-compare-win-20260928-with635-loadsel-rerun2/`.
  The attempt between them (`-loadsel-rerun`) crashed the same way.
- 13 of the 45 cells bound the canvas with a height of 0; the harness fix brought every one of
  them to 1832x1010.
