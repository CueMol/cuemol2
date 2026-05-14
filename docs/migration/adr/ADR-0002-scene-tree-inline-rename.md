# ADR-0002: Scene-tree inline rename — three triggers, single controller

- Status: accepted
- Date: 2026-05-13
- Mapping rows: [`panel.workspace.tree`](../mapping/panels.md#panelworkspacetree)

## Context

UXP renames a scene-tree row via a modal `window.prompt` dialog launched
from the right-click "Rename…" item. We want a Tritium experience that
matches OS file-manager conventions (Finder / Explorer): the user can
rename inline by typing into the row label without opening a modal, and
the rename can be triggered by **F2**, the **right-click menu**, or a
**Finder-style click-pause-click**.

The three triggers must agree on which row is being edited. If each
trigger owned its own state, the UI would have race conditions (e.g. F2
opens the editor, but a stale ctxmenu callback also tries to open it on a
different row). The click-pause-click trigger also needs to coexist with
real double-click (Apply-to-view on camera rows, Properties on others)
without firing on every single click.

Camera rows have an extra constraint: at the C++ Scene API level cameras
have no in-place name setter once registered. A rename must atomically
destroy and re-register the camera under the new name.

## Decision

The App-level `sceneEditingNodeId` state is the **single controller**.
All three triggers route through it via a `beginInlineRename(idStr)`
callback. The Blueprint `<InputGroup>` overlay is rendered when
`sceneEditingNodeId === node.id`.

**Triggers:**

1. **F2** on the selected row — instant.
2. **Ctxmenu "Rename…"** — instant (the `useSceneContextMenu` `rename`
   case just calls `beginInlineRename(idStr)`).
3. **Finder/Explorer-style click-pause-click** — clicking an
   already-selected, single-selected, renameable row schedules
   `beginInlineRename` after a 500 ms delay. A real double-click within
   the window cancels the schedule (so selection / Apply-to-view /
   Properties still work normally).

**Edit semantics:** Enter or blur commits, Esc cancels, empty or
unchanged input is a no-op.

**Renameable rows:** object / renderer / rendGroup / camera. Scene /
cameraRoot / styleRoot / style rows do not show the editor.

**Commit routing:**

- Camera rows → `renameCamera` worker (atomic
  `destroyCamera(old) + setCamera(new, cam)`).
- Other rows → generic `renameNode` worker.

## Consequences

- **Single source of truth** eliminates the multi-trigger race. Adding a
  fourth trigger later (e.g. a toolbar Rename button) means routing it
  through `beginInlineRename` — no new state.
- **Click-pause-click adds a 500 ms perceived latency** on the pause
  path, but only when the user clicks an already-selected row. Real
  double-clicks still feel snappy because we cancel the schedule.
- **Camera atomic rename** keeps the UXP `onRenameCamera` parity but
  costs an extra C++ object lifecycle per rename. This is unavoidable
  given the Scene API surface and matches UXP behaviour.
- **The editor sits inside the Blueprint row label**, so the row hit-box
  is again a concern (same family as [ADR-0001](ADR-0001-scene-tree-dnd.md)).
  Empirically the InputGroup captures focus / typing correctly because
  Blueprint's row handlers do not interfere with input elements.

## Notes

### Implementation pointers

- `tritium/react-gui/src/renderer/App.tsx` — `sceneEditingNodeId` state
  and `beginInlineRename` callback wiring
- `tritium/react-gui/src/renderer/components/panes/ScenePane.tsx` — the
  InputGroup overlay and click-pause-click 500 ms scheduler
- `tritium/react-gui/src/renderer/hooks/useSceneContextMenu.ts` —
  `rename` case calls `beginInlineRename`
- `tritium/react-gui/src/renderer/worker/server/services/renameCamera.service.ts`
  — atomic destroy + setCamera
- `tritium/react-gui/src/renderer/worker/server/services/sceneOps.service.ts`
  — `renameNode` (generic non-camera path)

### UXP parity

- `uxp_gui/cuemol2/base/content/workspace_panel.js` — `onRenameCmd`,
  `onRenameCamera`

### Related ADRs

- [ADR-0001](ADR-0001-scene-tree-dnd.md) — DnD on the same row hit-box
- [ADR-0007](ADR-0007-scene-tree-multi-select.md) — Multi-select trigger
  interaction (single-selected-row check is required for click-pause-click)
