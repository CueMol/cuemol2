# Code review: molanl/mmdb and molanl/ssmlib

Status: reviewed 2026-06-05. Scope: `src/modules/molanl/mmdb` (vendored CCP4
MMDB) and `src/modules/molanl/ssmlib` (SSM structural superposition), plus the
directly-related caller `src/modules/molanl/MolAnlManager.cpp`.

This document records bugs, logical problems, and latent (future) risks found
in these legacy libraries. The behavior-preserving low-risk fixes (see
"Applied fixes") have been implemented; the rest are recorded as deferred
recommendations. Regression is guarded by `test_molanl`
(`src/tests/modules/molanl/test_ssm_superpose.cpp`).

## Verification notes (claims that turned out to be wrong)

These were flagged by an automated pass but disproved on inspection:

- No removed-in-C++17 dynamic exception specifications (`throw(X)`) and no
  `register` keyword exist in either library (grep-confirmed). Nothing here
  fails to compile under C++17 today.
- `mmdb_graph.cpp:1491 P = new imatrix[n]; P = P-1;` is NOT a double free. It is
  a 1-based-index idiom paired with `FreeMemory()`'s `P = P+1; delete[] P;`
  (mmdb_graph.cpp:1450-1451). It is still UB (see risk #9) but internally
  consistent.
- `#define strlen (int)strlen` (mattype_.h:102) is guarded by `#ifdef _MVS`
  (MSVC only); it is inactive on the gcc/clang builds.

## A-1. Real bugs / logic problems

1. [High] `MolAnlManager.cpp` `superposeSSM_impl` — `pMol1`/`pMol2` (and `pAln`)
   leak when `copySelected()` throws or `Align()` returns `rc!=0`; the cleanup
   ran only on the success path. Reachable every time SSM fails (e.g. small
   structures returning `SSM_noGraph`). **Fixed.**
2. [High] `MolAnlManager.cpp` `superposeSSM_rmsd` — returned `pAln->rmsd`
   without deleting `pAln`; leaked on every call. **Fixed.**
3. [Low] `MolAnlManager.cpp` `seq3to1` — duplicated `ARG` branch; the second is
   unreachable dead code. **Fixed.**
4. [Low-Med] `MolAnlManager.cpp` superposeSSM1 — `acos(sqrt(e3)*0.5)` can take an
   argument > 1 (when `e3 > 4`), yielding NaN in the logged rotation angle.
   **Fixed** (clamped into [-1,1]).
5. [Low-Med] `ssm_align.cpp` `CSSMAlign::Align` — `return i+2;` is a magic-value
   remap of the 2nd-graph error code. Correct today (noGraph 3->5,
   noVertices 4->6) but fragile against constant changes. **Fixed** (explicit
   mapping to `SSM_noGraph2`/`SSM_noVertices2`, value-identical).
6. [Low-Med] `MolAnlManager.cpp` superposeSSM_impl alignment-printing block —
   `rlist1.at(ind1+1+j)` / `rlist2.at(ind2+1+j)` index gaps without checking
   against `rlist.size()`; a degenerate/unexpected alignment can throw
   `std::out_of_range` (only under `bPrintLog`, where the surrounding try/catch
   swallows it). **Deferred** (belongs with the alignment-formatting refactor).

## A-2. Latent / future risks (compiles today, dangerous later)

7. [Med-High] `mmdb/mattype_.h:94-97` — `#define strchr FirstOccurence` /
   `#define strrchr LastOccurence` are unconditional macros that rewrite the
   `<cstring>` names everywhere this header is included. Depending on include
   order this can break std or other modules. **Deferred.**
8. [Med] `mmdb/mattype_.h:110,122-123` — `typedef byte Boolean;` plus
   `#define True/False`. `Boolean` (= unsigned char) spreads across 57 files and
   the `True`/`False` macros can collide with other identifiers; not
   `bool`-compatible. **Deferred.**
9. [Med] `mmdb_graph.cpp:1491-1492,1515-1516` and the `Get*Memory` helpers —
   `P = P-1` forms a pointer before the start of the allocation (UB). Works in
   practice but is hostile to UBSan (`pointer-overflow`) and aggressive
   optimizers. **Deferred** (RAII migration).
10. [Med] mmdb overall — raw `new`/`delete`, no RAII, leak-prone early-return /
    exception paths (e.g. `ssm_align.cpp:186-189` leaks `G1` if `G2` is null,
    relying on `~CSSMAlign`); `sprintf` x136, `strcpy` x731. **Deferred.**
11. [Med, low reachability] `mmdb_model.cpp:4165,4183,4185`, `mmdb_file.cpp:1353`
    — `sprintf("%s_%i...", chainID, ...)` writes a variable-length `%s` into a
    fixed `ChainID` (`char[10]`) with no bound. Real PDB chain ids are 1-2 chars
    so overflow is rare, but it is UB. **Fixed** (these four sites converted to
    `snprintf(buf, sizeof(buf), ...)`; the other 130+ sprintf sites were left
    untouched).
12. [Low-Med] mmdb/ssmlib overall — `NULL` (55 files), C-style casts, missing
    `override`, polymorphic bases relying on implicitly-virtual destructors.
    Not broken now; candidates for warning->error under stricter flags.
    **Deferred.**
13. [Low] `ssm_superpose.cpp:174,124-127` etc. — divisions / `sqrt` are guarded
    (`if (r>0.0)`, `if (vl2<=0) return`), so currently safe. Noted so the guards
    are preserved through any refactor. **No change.**

## Applied fixes (this change)

Behavior-preserving only; `test_molanl` (4 cases) still passes.

- `MolAnlManager.cpp`: `unique_ptr` for `pMol1`/`pMol2`; `delete pAln` before the
  failure `throw`; `superposeSSM_rmsd` deletes `pAln` before returning; removed
  duplicate `ARG`; clamped the `acos` argument; added `#include <memory>`.
- `ssm_align.cpp`: explicit `SSM_noGraph2`/`SSM_noVertices2` mapping.
- `mmdb_model.cpp`, `mmdb_file.cpp`: 4 ChainID `sprintf` -> `snprintf`.

## Deferred recommendations (separate, larger refactor)

Items #6, #7, #8, #9, #10, #12 above. They can change observable behavior or
touch 50+ files, so they should be done as a dedicated modernization pass,
paired with expanded regression coverage (e.g. golden values from a homolog
structure pair that exercises the gap/alignment path).
