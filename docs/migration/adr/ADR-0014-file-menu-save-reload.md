# ADR-0014: File menu — Save File As, Save current view, Reload Scene

- Status: accepted
- Date: 2026-05-16
- Mapping rows: [`menu.cuemol2.file`](../mapping/menus.md#menucuemol2file) (File > Save File As, Save current view, Reload Scene)

## Context

Three File-menu items were registered in `menuTemplate.ts` but unwired —
`useMenuDispatch` had no `case` for their channels, so they fell through to the
`MENU_GENERIC` → `console.warn` stub:

- **Save File As...** — save a scene *object* to a file (UXP `onFileSaveAs`)
- **Save current view...** — save the live view's camera to a `.cam` file
  (UXP `onSaveCurView`)
- **Reload Scene** — re-read the current scene from its source file
  (UXP `onReloadScene`)

The fourth unwired File item, **New Window**, was deliberately deferred: it
needs a multi-`BrowserWindow` architecture with a per-window Web Worker and
OffscreenCanvas bind, which is out of scope here.

All three worker services already existed (`objectSave`, `cameraFile`,
`loadScene`); only the renderer command layer was missing.

## Decision

Add three `CmdId`s — `ObjectSaveAs` (`'object.saveAs'`), `SaveCurrentView`
(`'file.saveCurrentView'`), `SceneReload` (`'scene.reload'`) — handled by a new
`commands/useFileCommands.ts` hook (kept separate from `useEditCommands`, which
is scoped to scene save/undo). `useMenuDispatch` gains the three `case` arms.

Routing follows `option-ux-guidelines.md`: Save File As / Save current view are
one-shot file writes → native OS save dialog; Reload Scene is destructive →
small confirm dialog.

- **Save File As**: the object-save sequence (`getObjectSaveInfo` →
  `IPC.DIALOG_OBJECT_SAVE` → `saveObjectToFile`) already lived inline in the
  scene-tree context menu (`dispatchSceneCtxAction` `saveAsObject`). It was
  extracted into a shared `hooks/sceneContextMenu/runObjectSaveFlow.ts` helper
  so the context menu and the File-menu command share one implementation. The
  File menu has no right-clicked node, so the target object is resolved from
  the active scene: 0 objects → no-op, 1 → save it directly, ≥2 → a new
  `ObjectPickerDialog` (radio list).
- **Save current view**: `saveViewToCamera` writes the live view into the
  transient `'__current'` camera (the same name `saveScene` uses), then
  `saveCameraToFile` writes it out via `IPC.DIALOG_CAMERA_SAVE`.
- **Reload Scene**: `getSceneSaveInfo` supplies the source path (no-op when
  empty); `getSceneCloseInfo` reports modified state; when modified, a new
  `ConfirmReloadSceneDialog` (2-button OK/Cancel) confirms before `loadScene`.

The new `ObjectSaveAs` / `SceneReload` commands also back the Toolbar `Save As`
and `Reload Scene` buttons, which were mock placeholders under
[ADR-0013](ADR-0013-toolbar-ribbon-port.md).

## Consequences

- `ConfirmReloadSceneDialog` is a purpose-built 2-button dialog rather than a
  reuse of `ConfirmCloseTabDialog`: the latter hard-codes three outcomes
  (save / discard / cancel) and "Unsaved Changes" copy, semantically wrong for
  a discard-and-reload confirm. A new ~40-line dialog is cleaner than threading
  a mode flag through the close-tab dialog.
- `runObjectSaveFlow` removes the duplicated object-save sequence; the context
  menu behaviour is unchanged.
- `'__current'` is a transient camera name overwritten on each Save current
  view; no persistent camera node is created in the scene tree.
- New Window remains unimplemented (separate multi-window task).
- The object `Save` (overwrite-in-place) Toolbar button stays mock — there is
  still no command for saving an object back to its own `src`.

## Notes

- Implementation: `commands/useFileCommands.ts`, `commands/ids.ts` /
  `CommandMap.ts` (3 rows), `hooks/useMenuDispatch.ts` (3 cases),
  `hooks/sceneContextMenu/runObjectSaveFlow.ts`,
  `components/dialogs/ObjectPickerDialog{,Provider}.tsx`,
  `components/dialogs/ConfirmReloadSceneDialog{,Provider}.tsx`,
  `components/Toolbar.tsx` (mock → cmd).
- Worker services reused (all pre-existing, ServiceMap-registered):
  `getObjectSaveInfo` / `saveObjectToFile`, `saveViewToCamera` /
  `saveCameraToFile`, `getSceneSaveInfo` / `getSceneTree` / `loadScene`;
  `cm.getSceneCloseInfo` for modified state.
- UXP parity: `fileopen.js` `onFileSaveAs` / `onSaveCurView` / `onReloadScene`.
- Tests: `__test__/fileCommands.test.tsx`, plus `menuDispatch` / `Toolbar`
  test updates.
