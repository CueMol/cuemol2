# ADR-0022: Molecular superposition dialog — algorithm dispatch and dropped RMSD-file output

- Status: accepted (in-app verified). RMSD-file output: dropped (won't implement).
- Date: 2026-06-06 (updated 2026-06-07: RMSD-file output decided out of scope)
- Mapping rows: [`dialog.tool.ssm-sup`](../mapping/tool_dlgs.md#dialogtoolssm-sup)

## Context

UXP `tools/ssm_sup.xul` + `ssm_sup.js` ("Molecular superposition") lets the user
superpose one molecule (moving) onto another (reference) using either a
least-squares fit (LSQ) or secondary-structure matching (SSM). Each side picks a
MolCoord plus an atom selection. Three options follow: "Auto recenter" (fit the
view onto the moving selection afterwards), "Use xformMat property" (store the
transform instead of applying it), and — LSQ only — "Write RMSD info file", which
opens a native save dialog and writes `MolAnlManager.calcRMSD(...)` output to a
chosen path.

The Tools menu item (`menu:mol-superpose`) already existed in tritium but was
unwired. The dialog is structurally identical to the already-ported
`dialog.tool.chg-chname` (ObjectSelect + MolSelList + a worker service calling
`MolAnlManager` under an undo txn), so it reuses that pattern wholesale.

## Decision

Implemented `MolSuperposeDialog` (h3-kit `Dialog` + `FieldSection` / `SegmentField`
/ `ObjectSelect` (molCoord filter) / `MolSelList` / `SwitchField`), wired through
`MolSuperposeDialogProvider` -> `useToolCommands` -> `CmdId.UiMolSuperpose` ->
`useMenuDispatch` case `'menu:mol-superpose'`. OK commits via a new worker service
`superposeMol` (`worker/server/services/superposeMol.service.ts`) which compiles
both selections (`makeSel`), then under a single "Mol superpose" undo txn calls
`MolAnlManager.superposeSSM1` (algo='SSM') or `superposeLSQ1` (algo='LSQ'). On a
thrown superpose the txn rolls back (UXP `rollbackUndoTxn` parity) and the dialog
stays open showing the error. When "Auto recenter" is set, after commit the
service probes `MolCoord.fitView2(view, movSel)` (duck-typed) on the moving mol.

Last-used reference/moving molecule uids, algorithm, and the two checkbox states
persist to localStorage (`molSuperposeHistory`, key
`cuemol2.ui.histories.mol_superpose`); selection-string history flows through the
shared `MolSelList` `selHistory` store. Initial molecule defaults: restored
history when still present, else reference=first / moving=second MolCoord (UXP
`onLoad`).

The **"Write RMSD info file" option is dropped (won't implement)** — it needs a
native save-file dialog (main-process round-trip) to obtain a path before calling
`MolAnlManager.calcRMSD`. The decision is not to port it because: (a) the RMSD
value is already obtainable from the log, and (b) introducing a main<->worker
file-path contract for this low-frequency option is not worth the cost. If a
shared native-save infrastructure lands later for other "compute -> write file"
tools, this can be revisited. The checkbox is omitted from the ported dialog.

## Consequences

- Core superposition (LSQ / SSM, both selections, auto-recenter, useprop, undo) is
  at full UXP parity and reuses the `chg-chname` tool-dialog scaffolding, so no new
  UI primitives were introduced.
- RMSD-file output is not provided; users who need the RMSD value read it from the
  log (SSM logs RMSD; a future `superposeSSM_rmsd` / `calcRMSD` surface can expose
  it inline if demand arises).
- Dropping it keeps this change free of a new main↔worker file-path contract; that
  contract can be designed once and shared with other "compute → write file" tools
  if/when one is actually needed.

## Notes

- Service: `worker/server/services/superposeMol.service.ts` (`superposeMol`),
  registered in `worker/shared/WorkerCalls.ts` `ServiceMap`.
- Dialog: `components/dialogs/MolSuperposeDialog.tsx` +
  `MolSuperposeDialogProvider.tsx`; history `components/dialogs/molSuperposeHistory.ts`.
- Command/menu: `commands/ids.ts` (`UiMolSuperpose`), `commands/CommandMap.ts`,
  `commands/useToolCommands.ts`, `hooks/useMenuDispatch.ts` (`'menu:mol-superpose'`).
- UXP parity: `uxp_gui/cuemol2/base/content/tools/ssm_sup.js`
  (`gSSMSupDlg.onDialogAccept`, `onLoad`, `writeRmsdFile`).
- Contract: `MolAnlManager.superposeSSM1(refMol, refSel, movMol, movSel, useprop)`
  returns a `Matrix`; `superposeLSQ1(...)` returns void; both transform the moving
  mol. `calcRMSD(...)` (deferred path) returns the RMSD and writes a file.
- Degrade-detection tests: `__test__/superposeMolService.test.ts` (algo dispatch,
  selection gate, auto-recenter gating + moving-selection argument, rollback).
- Related: [ADR-0021](ADR-0021-selection-builder.md) (MolSelList),
  [ADR-0017](ADR-0017-povray-rendering-ui.md) (a prior "compute → file" feature
  with a deferred sub-scope).
