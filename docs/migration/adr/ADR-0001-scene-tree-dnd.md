# ADR-0001: Scene-tree drag-and-drop detection strategy

- Status: accepted
- Date: 2026-05-12
- Mapping rows: [`panel.workspace.tree`](../mapping/panels.md#panelworkspacetree)

## Context

UXP's workspace panel lets the user reorder objects and renderers (and
move renderers across groups) by dragging a tree row onto another. The
underlying `_moveToImpl` algorithm is a bubble-sort over `ui_order` slots
plus a `rend.group` reassignment for cross-group moves.

The Tritium scene tree uses `@blueprintjs/core`'s `Tree` component, which
owns its own row event handlers. We need a drop target that:

1. Detects the source node id, target node id, and a 3-state vertical
   orientation (`-1` above the target row, `0` onto the target row, `+1`
   below).
2. Maps tree node ids to parent ids so the worker can resolve the affected
   `obj.rend_uids` slot range.
3. Routes the resulting `{ source, target, ori }` triple to a single
   worker service that ports `_moveToImpl` (otherwise we would round-trip
   per-slot reorders over IPC).

## Decision

Wrap each Blueprint tree row label in an HTML5-draggable `<span>` carrying
an `application/x-scene-node` payload. `ScenePane` resolves source / target
via a parent map kept alongside the tree state and computes `ori` from the
top/middle/bottom thirds of the label's bounding rect (`-1` / `0` / `+1`).
The triple is dispatched to a single worker service `reorderSceneNode`,
which ports UXP `_moveToImpl` literally: enumerate objects via
`getSceneDataJSON` / renderers via `obj.rend_uids`, swap `ui_order` along
the source→target slot range, and assign `rend.group` for cross-group
moves under "Reorder objects" / "Reorder renderers" undo transactions.

Special case: dropping a renderer ONTO a `rendGroup` (`ori === 0`) routes
through the group's first child (or the group uid itself when the group is
empty) so the worker treats it as a group-update-only path with no slot
reorder.

## Consequences

- **One IPC round-trip per drop**, not one per slot — reorders of large
  groups stay snappy.
- **Worker-side algorithm is pure C++ wrapper code**, which mirrors UXP
  exactly and is unit-tested in isolation (`reorderSceneNode.service`
  tests pass).
- **The HTML5 draggable wrapper lives inside the Blueprint row**, so
  Blueprint still owns selection / expand/collapse. This is what causes
  the Known issue below — Blueprint's row handlers can intercept events
  before they reach our `<span>`.
- **No mid-drag visual feedback** beyond the browser's default ghost
  image; an indicator line for `ori = -1 / +1` is a follow-up.

## Notes

### Implementation pointers

- `tritium/react-gui/src/renderer/components/panes/ScenePane.tsx` — DnD
  wiring around the Blueprint Tree row label
- `tritium/react-gui/src/renderer/worker/server/services/reorderSceneNode.service.ts`
  — `_moveToImpl` port + undo txn
- `tritium/react-gui/src/renderer/__test__/reorderSceneNodeService.test.ts`
  — algorithm pinning

### UXP parity

- `uxp_gui/cuemol2/base/content/workspace_panel.js` — `_moveToImpl` (the
  bubble-sort and `rend.group` assignment)

### Resolved issues

**In-app DnD did not fire (2026-05-12, fixed 2026-05-16).** The root
cause was hitbox geometry, not Blueprint event interception: the
`<span draggable>` wrapping the row label used `display: inline-block`,
so it occupied only the label-text width. The visible row
(`.bp5-tree-node-content`, full width / 22px) had no DnD handlers, so
`dragover` / `drop` outside the glyphs landed on an unhandled element,
were never `preventDefault`-ed, and the browser rejected the drop.
Blueprint's row `<div>` binds only click / contextmenu / dblclick /
mouseenter / mouseleave (no `mousedown`), so it does not block
`dragstart`.

**Fix.** The label span now uses `display: block; width: 100%` so it
fills the Blueprint label cell (a `flex: 1` region covering most of the
row). A drag-over insertion indicator (top/bottom line for `ori ±1`,
inset highlight for `ori 0`) was added; the dragged node is stashed in a
ref at `dragstart` so `dragover` can validate the drop via
`planSceneNodeMove` and show the indicator only on accepted positions.
The icon / caret strip stays outside the hitbox — acceptable for tree
DnD. Pinned by `__test__/scenePaneDnd.test.tsx`.

### Related ADRs

- [ADR-0002](ADR-0002-scene-tree-inline-rename.md) — Inline rename on the
  same tree rows (different interaction, shares the row hit-box question)
- [ADR-0007](ADR-0007-scene-tree-multi-select.md) — Multi-select Cmd/Ctrl
  + click on the same Blueprint Tree (Blueprint event handling is the
  shared concern)
