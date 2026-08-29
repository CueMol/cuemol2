# ADR-0027: Interaction-list editor — getDefsJSON contract and stable-index delete

- Status: accepted (host E2E verified; PR pending)
- Date: 2026-06-12
- Mapping rows: [`dialog.tool.aintr-edit`](../mapping/tool_dlgs.md#dialogtoolaintr-edit), [`panel.workspace.ctxmenu.renderer`](../mapping/panels.md#panelworkspacectxmenurenderer)

## Context

An `atomintr` renderer stores a list of distance / angle / torsion definitions.
The UXP "Edit interaction list" dialog (`tools/aintr-edit-dlg`) shows that list
(columns Atom0..Atom3) with a Delete button. Tritium had no list editor: the
`AtomIntr*Section` inspector page edits display properties only, and
`dialog.atomintr` explicitly excluded append/remove editing. The renderer
context menu listed "Edit interaction list" as a Phase 6c pending item.

The C++ `AtomIntrRenderer` exposes `getDefsJSON()` and `boolean remove(int id)`.
Two contract details had to be pinned before building on them:
- `getDefsJSON()` returns `[{ id, mode, a0, a1[, a2[, a3]] }, ...]` where
  `mode` is 1 = distance, 2 = angle, 3 = torsion and `a0..a3` are formatted atom
  labels. `id` is the element's index in the renderer's `m_data` vector.
- `remove(id)` does `m_data[id] = AtomIntrData()` — it **empties the slot in
  place** (the emptied entry has `mode == 0` and is skipped by `getDefsJSON`),
  rather than erasing and shifting the vector.

## Decision

Add a worker service `atomIntrEdit.service` and a modal
`EditInteractionListDialog`, launched from the renderer context menu:

- `listAtomIntrDefs` parses `getDefsJSON` into `{ id, mode, atoms[] }` rows
  (2 / 3 / 4 atoms by mode).
- `removeAtomIntrDefs` calls `remove(id)` for each requested id inside one undo
  txn. Because `remove` empties the slot in place (no shifting), the ids stay
  valid regardless of delete order — no descending-sort or re-fetch between
  deletes is needed. This is the load-bearing reason the batch delete is safe.
- The dialog prefetches the list once, lets the user delete rows from a working
  copy, and on OK returns the set of removed ids (`originalIds - remainingIds`);
  the dispatch handler calls `removeAtomIntrDefs` with them. Cancel discards.
- The "Edit interaction list…" menu item is gated on the renderer type being
  `atomintr` via a new `canEditInteractions` payload flag (mirrors the
  `canGenSurfObj` isosurf gate); the dispatch action is `editInteractionList`.

This is a modal (not a viewport tool like the bond editor, ADR-0024) because it
is pure list management — no atom picking — so the "move the dialog aside to
pick" problem that drove ADR-0024 does not apply.

## Consequences

- No C++/`.qif` changes — the renderer already exposed list + remove.
- Editing is delete-only, matching the UXP dialog (adding interactions happens
  via the measure tool / analyze flow, not here).
- The prefetch-once / commit-on-OK model means concurrent external mutations to
  the same renderer during the dialog session are not reflected; acceptable for
  a short-lived modal, and a stale id simply fails its `remove` (counted out).

## Notes

- Implementation: `worker/server/services/atomIntrEdit.service.ts`
  (`listAtomIntrDefs` / `removeAtomIntrDefs`; `ServiceMap` rows in
  `worker/shared/calls/`); `components/dialogs/EditInteractionListDialog.tsx`
  (+ Provider, registered in `contexts/DialogContext.tsx`); gating in
  `shared/types/sceneCtxMenu.ts` (`editInteractionList` action + `canEditInteractions`
  payload), `hooks/sceneContextMenu/buildSceneCtxPayload.ts`,
  `main/contextMenu/sceneCtxTemplates.ts` (renderer branch item),
  `hooks/sceneContextMenu/dispatchSceneCtxAction.ts` (case),
  `hooks/useSceneContextMenu.ts` (dialog-hook threading).
- C++ contract: `src/modules/molvis/AtomIntrRenderer.qif` / `.cpp` —
  `getDefsJSON` (id = `m_data` index; entries with `mode > 0`) and
  `remove(id)` (empties `m_data[id]` in place).
- Reuses the ctxmenu dialog-hook threading pattern from ADR-0026.
- Tests: `__test__/atomIntrEditService.test.ts`,
  `__test__/editInteractionListDialog.test.tsx`.
