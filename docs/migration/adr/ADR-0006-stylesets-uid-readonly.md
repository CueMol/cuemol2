# ADR-0006: StyleSets — uid keying, read-only toggle, save/load semantics

- Status: accepted
- Date: 2026-05-13
- Mapping rows: [`panel.workspace.ctxmenu.style`](../mapping/panels.md#panelworkspacectxmenustyle)

## Context

UXP exposes StyleSets in the workspace tree as named entries under a
synthesised "Style" root. The StyleSet operations include New / Copy /
Paste / Delete / Read-only toggle / Load / Save / Save As / Reload.

Two facts shape the design:

1. **StyleSets do have stable C++ uids** (unlike cameras — see
   [ADR-0005](ADR-0005-camera-name-keyed.md)), exposed via
   `StyleManager.getStyleSetsJSON(scopeId)`. We can — and should — key
   on uid like Object / Renderer.
2. **There are two scopes** — global (`scopeId = 0`) and per-scene
   (`scopeId = scene.uid`). Many operations behave differently in the
   global scope (e.g. Copy is disallowed, Delete is gated, Read-only
   toggle is rejected).

UXP also has a quirk: Style file Load is always read-only, and Save
falls through to Save As when `StyleSet.src` is empty (matching the
generic file-path-empty pattern used by Camera files and the Scene Save
path).

## Decision

**Tree rows carry real C++ StyleSet uids.** `sceneTree.service` switched
from the older `getStyleNamesJSON` to `getStyleSetsJSON(0)` ∪
`getStyleSetsJSON(scene.uid)`. Each style node embeds `styleInfo =
{ scopeId, src, readonly, modified }` synthesised by `buildStyleRoot`.

**New Style.** `createStyleSet` worker (`StyleManager.createStyleSet`
under "Create style" undo txn) + the existing `TextPromptDialog`.
Default name pre-fetched via `proposeUniqName` extended with a
`styleSet` kind that walks `style_0`, `style_1`, ... against
`StyleManager.hasStyleSet`.

**Copy / Paste.** Reuses the shared `sceneClipboard.service` with a
new `'style'` `ClipboardKind`:

- *Copy* serialises `StyleManager.getStyleSet(uid)` via `strMgr.toXML`
  and **rejects global rows** (`scopeId === 0`, matches UXP
  `onCopyStyle`).
- *Paste* decodes via `strMgr.fromXML(_, sceneId)` and calls
  `StyleManager.registerStyleSet(set, 0, sceneId)` under "Paste style"
  txn. Name collisions auto-uniquify via `StyleManager.hasStyleSet`
  (UXP's confirm-to-replace dialog is dropped to match our
  object/renderer paste pattern).

**Delete.** Extends `sceneOps.deleteNode` with a style branch that
takes `scopeId` and runs `StyleManager.destroyStyleSet(scopeId,
styleSetId)` under "Destroy style" txn. Global rows are refused at the
main-process menu enable gate.

**Read-only toggle.** `toggleStyleSetReadOnly` worker mirrors UXP
`onStyToggleRo`:

- Global scope (`scope === 0`) → rejected.
- RW → RO → refused when `set.modified` (the main-process menu disables
  the item in that case).
- RO → RW → unconditional.

**Style file submenu.**

- *Load…* uses `DIALOG_STYLE_OPEN` IPC + `loadStyleSetFromFile` worker.
  **Always loads as read-only** — matches UXP `onStyLoadFile` `bReadOnly
  = true` parity. Calls `StyleManager.firePendingEvents` after success.
- *Save / Save As…* use `DIALOG_STYLE_SAVE` IPC + `saveStyleSetToFile`
  worker ("Change style's source" undo txn). *Save* first tries
  `saveStyleSetToCurrentSrc` (uses the existing `StyleSet.src` path
  under "Save style file" txn) and falls back to *Save As* when `src`
  is empty (UXP `onStySaveFile` parity).
- *Reload* is wired but stubbed (UXP itself logs "Not implemented").

**Properties** still routes through the panel-wide read-only
`getNodeInfo` stub but now resolves style nodes too (name / src /
readonly / modified).

**Rename** is omitted — UXP has only an XUL menuitem with no JS
handler, so there's nothing to port.

## Consequences

- **Uid keying** matches Object / Renderer and lets the standard
  Delete / lookup paths flow through `deleteNode`'s shared scaffolding
  (with a small per-kind branch for `destroyStyleSet`).
- **Global vs scene-scope branching** is centralised at the menu enable
  gate (main process) and the worker (`scopeId === 0` rejection) — no
  scope check leaks into the tree row code.
- **Load-as-readonly** is the same gotcha as UXP — users who load a
  file expecting to edit it must explicitly toggle Read-only off.
  Documented in CLAUDE.md if needed; current behaviour is the parity
  choice.
- **Save fallback to Save As** matches the same pattern used by
  Camera files (see [ADR-0005](ADR-0005-camera-name-keyed.md)) and the
  Scene Save path. This consistency is intentional.

## Notes

### Implementation pointers

- `tritium/react-gui/src/renderer/worker/server/services/styleOps.service.ts`
  — `createStyleSet` / `toggleStyleSetReadOnly`
- `tritium/react-gui/src/renderer/worker/server/services/styleFile.service.ts`
  — Load / Save / Save As / Reload
- `tritium/react-gui/src/renderer/worker/server/services/sceneClipboard.service.ts`
  — `'style'` ClipboardKind branch
- `tritium/react-gui/src/renderer/worker/server/services/sceneOps.service.ts`
  — `deleteNode` style branch
- `tritium/react-gui/src/renderer/worker/server/services/sceneTree.service.ts`
  — `getStyleSetsJSON` + `buildStyleRoot`
- `tritium/react-gui/src/renderer/worker/server/services/proposeUniqName.service.ts`
  — `styleSet` kind

### UXP parity

- `uxp_gui/cuemol2/base/content/workspace_panel_ctxtmenu.js` — style
  branch (`onCopyStyle`, `onStyToggleRo`, `onStyLoadFile`,
  `onStySaveFile`)

### Pending

- Style editor dialog (UXP `style_editor.xul`, Phase 5a)
- Reload (UXP itself stubbed; revisit if upstream implements)
