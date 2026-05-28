# Planning Brief: `GROFileReader` (GROMACS `.gro` format) for CueMol

## What this task is

Produce an **implementation plan** for a new reader, `GROFileReader`, that loads
GROMACS `.gro` coordinate/structure files into CueMol's molecular structure object.

This is a **planning task, not an implementation task.** The deliverable is a written
plan: findings from investigating the codebase, a proposed design, edge cases, and a
test strategy. **Do not write production code in this task.**

## Scope

- **In scope:** reading the `.gro` (GROMOS87) text format only.
- **Out of scope (future, separate tasks):** `.g96`, `.xtc`, `.trr`, `.trj`.
  Do not design for them now. You may avoid choices that needlessly block them later,
  but do not spend effort accommodating them.

## What you must investigate yourself (CueMol side)

This brief intentionally does **not** prescribe any CueMol-internal design. Before
writing the plan, investigate the existing codebase to determine the correct pattern.
At minimum, find out:

- How an existing molecular-coordinate file reader is structured — **use the existing
  PDB reader as the reference template.** Determine its base class, what object it
  builds, and its read/lifecycle methods.
- How readers are registered and discovered (module definition, build system wiring,
  extension-based format dispatch).
- Existing helpers for streamed text input and for constructing atoms / residues /
  chains, and the coordinate/unit conventions CueMol uses internally.

Base the `GROFileReader` design on whatever pattern you find; mirror the PDB reader.

## File format: authoritative information sources

Understand the `.gro` format from primary sources, not assumptions:

- GROMACS official file-format reference:
  <https://manual.gromacs.org/current/reference-manual/file-formats.html>
  (see the `gro` entry and the surrounding structure-file description).
- Confirm fixed-column layout and field precision against the current GROMACS manual.

## Key format characteristics the plan must account for

Confirm each against the sources above.

- Plain **fixed-format text** (GROMOS87 layout). Parse by **column position**, not by
  whitespace splitting — residue/atom names can contain spaces, and adjacent numeric
  fields can run together.
- **Line 1:** free-form title. May embed a time value as `t=...` (used when frames are
  concatenated).
- **Line 2:** integer atom count.
- **One line per atom:** residue number, residue name, atom name, atom number, then
  `x y z`, and **optionally** `vx vy vz`. The standard widths follow
  `%5d%-5s%5s%5d` for labels with `%8.3f` positions / `%8.4f` velocities, **but
  higher-precision variants with more decimals exist** — derive field widths robustly
  rather than hard-coding.
- **Velocities are optional;** handle both present and absent.
- **Final line:** box vectors — 3 values (rectangular) or up to 9 (triclinic). Confirm
  the GROMACS component ordering.
- **Units are nanometers (nm).** CueMol's convention (PDB-derived) is Ångström, so the
  plan must include the **nm → Å (×10)** conversion for coordinates and box. This is the
  single most important correctness point.
- A `.gro` file may contain **multiple concatenated frames** ("makeshift trajectory").
  The plan must make an explicit decision: does the first version handle single-frame
  only, or multi-frame?

## Libraries

- For `.gro`, **no external or binary parsing library is required** — it is plain text.
  Implement a native parser.
- **Reference implementations** to study for parsing logic and the nm→Å handling (both
  are permissively licensed; respect their license terms — reference, don't wholesale-copy):
  - **chemfiles `GROFormat`** — BSD-licensed, native C++ `.gro` reader/writer.
    Source: <https://github.com/chemfiles/chemfiles>
  - **VMD molfile `gromacsplugin`** (`Gromacs.h` / `gromacsplugin.C`) — UIUC Open Source
    License (a permissive BSD-derivative). It explicitly documents that `.gro` positions
    are assumed to be nm and converted to Å.
- For context only (not this task): the future `.xtc`/`.trr` work will use a vendored
  BSD `xdrfile` fork or chemfiles' native XTC/TRR. `.gro` depends on none of this.

## What the produced plan should contain

At minimum:

1. **Integration approach** derived from the existing reader pattern you investigated
   (class placement, base class, registration, build wiring) — as findings + proposed steps.
2. **Parsing design:** line handling, fixed-column field extraction, robust precision
   handling, optional velocities, box parsing, nm→Å conversion.
3. **Scope decision:** single-frame vs multi-frame for the initial version.
4. **Edge cases / error handling:** malformed lines, atom-count mismatch, missing box
   line, high-precision files, empty or `t=`-bearing title.
5. **Test strategy:** representative sample `.gro` files (with/without velocities,
   rectangular vs triclinic box, high-precision, multi-frame) and how to validate parsed
   coordinates and units.
6. **Open questions / decisions** to confirm with the maintainer.
