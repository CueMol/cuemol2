# ADR-0007: Scene-tree multi-select bulk dispatch

- Status: accepted
- Date: 2026-05-12
- Mapping rows: [`panel.workspace.ctxmenu.multi`](../mapping/panels.md#panelworkspacectxmenumulti),
  [`panel.workspace.tree`](../mapping/panels.md#panelworkspacetree)

## Context

UXP's workspace panel supports multi-row selection (Cmd/Ctrl+click) and
exposes a multi-only context menu with Show / Hide / Delete that operate
on every selected row at once. Each bulk action runs as **one undo
transaction**, not one txn per row — see UXP `onShowHideCmd`.

For Tritium we need:

1. A multi-select state on the React side that the ctxmenu and toolbar
   both observe.
2. A worker-side dispatcher that runs the per-row mutation under a single
   undo transaction.
3. Toolbar gating that disables actions which only make sense on a single
   row (Focus, Property) when multiple rows are selected.

## Decision

**Renderer state.** `useSceneTree` exposes `selectedIds: Set<string>`
alongside the primary `selectedId`. ScenePane's `onNodeClick` toggles
membership when Cmd/Ctrl is held; otherwise it resets to a single-row
selection. Shift+range select is deferred.

**Right-click semantics.** Right-clicking a member when
`selectedIds.size > 1` opens the multi-only context menu (Show / Hide /
Delete) — matches UXP `wspcPanelMulCtxtMenu`. Right-clicking a non-member
falls back to the single-row menu (and also resets the selection to that
row, matching UXP).

**Worker dispatch.** Two services in `bulkSceneNodeOps.service`:

- `bulkSetNodeVisible({ scene, ids, visible })` — wraps the per-id
  `setNodeVisible` loop in one "Show multiple" / "Hide multiple" undo
  transaction.
- `bulkDeleteNode({ scene, ids })` — same pattern, "Delete multiple" txn.

**Toolbar gating.** Focus and Property are disabled when
`selectedIds.size > 1`. Delete stays enabled and dispatches via the same
bulk service.

## Consequences

- **One undo entry per bulk action** matches UXP and keeps Undo
  predictable for the user.
- **Set-based state** makes existence checks O(1) and trivial to reason
  about, at the cost of needing membership checks at the few points where
  the primary `selectedId` is used.
- **No Shift+range select yet** — UXP supports it, but it requires a flat
  visible-row order, which we do not currently compute. Tracked as
  follow-up.
- **Copy is single-item only** — UXP's multi-Copy is renderer-only and
  same-parent-only; not implemented here.

## Notes

### Implementation pointers

- `tritium/react-gui/src/renderer/hooks/useSceneTree.ts` — `selectedIds`
  state, Cmd/Ctrl+click toggle
- `tritium/react-gui/src/renderer/components/panes/ScenePane.tsx` —
  `onNodeClick` modifier-key handling, toolbar gating
- `tritium/react-gui/src/renderer/hooks/useSceneContextMenu.ts` —
  multi-only branch
- `tritium/react-gui/src/main/sceneContextMenu.ts` — multi branch of the
  Electron native menu builder
- `tritium/react-gui/src/renderer/worker/server/services/bulkSceneNodeOps.service.ts`
  — `bulkSetNodeVisible` / `bulkDeleteNode`

### UXP parity

- `uxp_gui/cuemol2/base/content/workspace_panel.js` — `onShowHideCmd`,
  multi-select handling
- `uxp_gui/cuemol2/base/content/workspace_panel_ctxtmenu.js` —
  `wspcPanelMulCtxtMenu`

### Resolved issues

**Cmd/Ctrl+click multi-selection (raised 2026-05-12, confirmed working
2026-05-16).** An earlier pass could not reach the multi-select state by
natural input. Cmd/Ctrl+click on a second row now correctly toggles its
membership in `selectedIds` in the running app — `ScenePane.onNodeClick`
receives the modifier flags and routes to `onToggleSelect`. The worker
bulk services and unit tests continue to pin the dispatch semantics.

### Related ADRs

- [ADR-0001](ADR-0001-scene-tree-dnd.md) — DnD on the same Blueprint
  Tree (event handling is the shared concern)
- [ADR-0002](ADR-0002-scene-tree-inline-rename.md) — Inline rename
  click-pause-click trigger requires a single-selected-row check, which
  reads the same `selectedIds` state
