# ADR-0024: Bond editor — viewport pick tool, not a modal

- Status: accepted (host E2E verified)
- Date: 2026-06-12
- Mapping rows: [`dialog.tool.bond-edit`](../mapping/tool_dlgs.md#dialogtoolbond-edit)

## Context

UXP's "Tools > Mol bond editor" (`uxp_gui/cuemol2/base/content/tools/bond-edit-dlg.{xul,js}`)
edits a molecule's non-standard (persistent) bonds. Its **add-bond** flow is the
problem: the user focuses an "Atom ID" textbox, moves the modal dialog aside,
clicks an atom in the MolView, and the picked atom id is written back into the
textbox (via the `atom-picker` module's `setHandler` callback wired into the
tool ribbon's hit-test); repeat for the second atom, then press Add. This is
not discoverable — nothing on screen says "click two atoms" — and a blocking
modal fights the 3D view it depends on. Its **remove-bond** flow (a tree of
existing non-standard bonds + a Delete button) is acceptable.

"Add bond = pick two atoms" is structurally identical to the tritium measure
tool (distance = pick two atoms), which is already a non-modal viewport tool
(ADR-0023). `docs/migration/option-ux-guidelines.md` classifies bond editing as
an interactive viewport tool ("Tool mode + contextual panel ... never a modal").
The C++ API (`MolAnlManager.makeBond` / `removeBond` / `getNostdBondsJSON`) is
already exposed to tritium via the generated wrapper and records its own undo
`EditInfo` (`MolBondEditInfo`) while a transaction is open.

## Decision

Replace the modal with a **`bondEdit` viewport tool** mirroring the measure
tool. Add is the in-viewport two-pick gesture; remove + the bond list live in
the tool-options popover. No new C++ / wrappers.

- **Tool**: a new `bondEdit` `ToolId` in the palette's `edit` category
  (`data/viewportTools.ts`, icon `tool.bondEdit` = Phosphor `LineSegment`,
  shortcut `E`). The empty `edit` category slot was already reserved.
- **Add**: `hooks/useBondEditClickHandler.ts` (cloned from
  `useMeasureClickHandler`) forwards left-clicks to the worker service
  `bondEditPick` (`worker/server/services/bondEdit.service.ts`). A module-level
  per-view buffer remembers the first atom; the second atom in the **same
  molecule** triggers `MolAnlManager.makeBond(mol, aid1, aid2)` inside one
  `withUndoTxn(scene, 'Add bond', ...)`. Crosshair feedback reuses the measure
  tool's `DistPickDrawObj` (the two tools are never active at once).
- **Remove + list**: `components/BondEditOptionsPopover.tsx` (cloned from
  `MeasureOptionsPopover`), reached from a parallel `cat === 'edit'` branch in
  `ViewportToolPalette.tsx`. It reuses the shared `ObjectSelect`
  (`objectFilters.molCoord`) for the molecule, lists bonds via
  `bondEditListBonds` (`getNostdBondsJSON`), and removes via
  `bondEditRemoveBond` (`removeBond`, batching multiple pairs into one undo
  step). The list refetches on open / molecule change / after edit and on a
  debounced `SEM_OBJECT|SEM_RENDERER` topology event so undo/redo/script edits
  stay in sync.

## Consequences

- Maximum reuse: clones the measure infrastructure (ADR-0023), needs no C++,
  wrapper, or new draw object; the cheapest correct path. Undo is recorded once
  (C++ `MolBondEditInfo` inside the worker's single `withUndoTxn`).
- The add gesture is self-documenting via status messages and is consistent
  with the measure tool a user already knows. The molecule is implicit (the
  picked atoms' molecule), so no molecule selector is needed for adding.
- **Load-bearing worker guards**: `makeBond` takes a single `MolCoord` and does
  not reject `aid1 == aid2` (it would create a degenerate self-bond) nor
  cross-molecule atoms (a foreign aid throws `IllegalArgumentException`). The
  worker therefore rejects a second pick in a different molecule and a
  same-atom second pick, keeping the first pick so the user can retry.
- C++ throw strings inside `makeBond` are copy-paste mislabeled (`"removeBond:
  ..."`); the worker maps any throw to a clean "Failed to add bond." message and
  `withUndoTxn` rolls back.
- **Single-bond only** (parity): `makeBond` takes no bond-order argument, so
  double/aromatic bonds are out of scope (would need a `.qif` extension).
- `getNostdBondsJSON` lists only persistent bonds (`isPersist()`); auto-topology
  bonds are intentionally not editable here.
- The options cap stays hardcoded per category (`cat === 'measure'` /
  `cat === 'edit'`); each future tool category accretes a bespoke branch rather
  than a data-driven cap. Accepted as consistent with the existing pattern.

## Notes

- Worker service: `worker/server/services/bondEdit.service.ts`
  (`bondEditPick` / `bondEditReset` / `bondEditListBonds` /
  `bondEditRemoveBond`); contract rows in `worker/shared/WorkerCalls.ts`.
- Click handler: `hooks/useBondEditClickHandler.ts` (gated on
  `activeTool === 'bondEdit'`; `useNaviClickHandler` is an allowlist of
  `navigate`/`rectSelect`, so the bond tool is auto-isolated).
- Popover: `components/BondEditOptionsPopover.tsx`; palette branch in
  `components/ViewportToolPalette.tsx`; click handler wired in
  `components/panes/ContentPane.tsx`.
- C++ source of truth: `src/modules/molanl/MolAnlManager.cpp`
  (`makeBond` / `removeBond` / `getNostdBondsJSON` / `getAtomJSON`,
  `MolBondEditInfo` undo). The non-std-bond JSON is an array of
  `[atom0, atom1]` pairs; each atom is `{aid, chain, resid, resn, aname,
  altc?}` (`resid` is a string that may carry an insertion code).
- UXP reference: `uxp_gui/cuemol2/base/content/tools/bond-edit-dlg.js`
  (`onAddCmd` / `onDeleteCmd` / `buildData`) and the rejected pick UX in
  `onFocusAidText` + `topbar/tool-ribbon.js` (`atom-picker`).
- Rejected alternatives: a modal port (reproduces the bad UX; against
  option-ux-guidelines); a dedicated Activity-bar side panel (most files
  touched, permanent global slot for a niche editor); a selection-driven
  "Create bond on 2-atom selection" (its live selected-count gate has no
  no-poll path — `MolCoord::setSelection` fires no event).
- Related: [ADR-0023](ADR-0023-measure-tool.md) (the measure tool this clones).
- Known limitation: `DistPickDrawObj` only dots the picked atoms; it cannot draw
  a connector between pick 1 and pick 2, so there is no preview of the bond that
  will form. A richer cue needs a new C++ draw object (deferred).
