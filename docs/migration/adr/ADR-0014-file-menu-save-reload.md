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

## Addendum (2026-08-10): object Save As UXP parity pass

The initial port left four gaps against UXP `fileopen.js` `onSaveAsObj` /
`onFileSaveAs`. All four are now closed.

### 1. Remembered writer -- realized by reordering, not preselection

UXP restores pref `cuemol2.ui.histories.save_writer_name` (default `"pdb"`)
into `nsIFilePicker.filterIndex`. Electron's `showSaveDialog` has **no
filter-preselect option at all**, so the writer is instead moved to the head
of the filter list: `getObjectSaveInfo` takes a `preferredWriter` argument and
`filters[0]` becomes that writer. One change covers three effects -- the
native format popup defaults to it, the no-`src` default file name takes its
extension, and the `defaultFilterIndex: 0` fallback in `handleObjectSaveDialog`
resolves to it. The value is persisted in `UiState.saveWriterName`
(electron-store) by `runObjectSaveFlow` after a successful write.

**Known divergence**: the filter index is still recovered from the chosen
file extension, so an explicitly typed extension beats the remembered writer
(e.g. remembered `qdfmol` + the prefilled `copy_of_1crn.pdb` writes PDB). This
is deliberate -- preferring `defaultFilterIndex` over the extension would write
QDF bytes into a file named `.pdb`. UXP has no equivalent case because its
dialog reports the real `filterIndex`.

### 2. Failure alert and success log

`runObjectSaveFlow` now returns a discriminated
`{status: 'saved' | 'cancelled' | 'no-writer' | 'error'}` instead of a boolean.
Both call sites (`useFileCommands` `ObjectSaveAs`, `dispatchSceneCtxAction`
`saveAsObject`) show `useShowErrorAlert` with the UXP text
`Failed to save file: <path>` on `'error'`; the alert lives in the callers
because `runObjectSaveFlow` is a plain function, not a hook, so
`DispatchSceneCtxActionCtx` gained a required `showErrorAlert` field.

This also fixes a real defect: `invokeService` resolves rather than throws, so
`saveObjectToFile` returning `{ok: false}` previously read as success. The
result flag is now checked explicitly.

On success, `saveObjectToFile` writes `File: [<path>] is saved.` to the C++
`MsgLog` service (UXP `putLogMsg`), so it lands in the log pane. The call is
guarded -- a missing or failing MsgLog must never fail a completed write.

### 3. Writer-filtered object picker

UXP `onFileSaveAs` excludes objects whose `findCompatibleWriterNamesForObj` is
empty and alerts `No object to save` when nothing remains. A new worker service
`listSavableObjects` applies the same filter in one round-trip (per-object
compatibility checks from the renderer would be N+1 IPC calls), and the picker
rows now use the UXP label format `<name> (<type>, id=<ID>)`.

### Implementation / tests

- `shared/types/uiPrefs.ts` (`UiState.saveWriterName`),
  `worker/server/services/objectSave.service.ts` (`preferredWriter` reorder,
  `writeMsgLog`, `listSavableObjects`), `worker/shared/calls/` (1 row),
  `hooks/sceneContextMenu/runObjectSaveFlow.ts`, `dispatchSceneCtxAction.ts`,
  `hooks/useSceneContextMenu.ts`, `commands/useFileCommands.ts`.
- Tests: `__test__/runObjectSaveFlow.test.ts` (new), plus additions to
  `objectSaveService`, `fileCommands`, `dispatchSceneCtxAction` and
  `fileDialogs` (the previously untested `handleObjectSaveDialog`
  extension-to-filterIndex recovery).

### 4. Internal QDF writers are hidden (deviation from UXP)

UXP `makeFilter` applies its QDF-hiding rule to readers only (`nCatID==0`), so
its object save dialog offers `qdfmol`, `qdfmap`, `qdfsurf`, `qdfpot` and
`qdflwobj`. Tritium hides them on the write side too: QDF is the cuemol2
internal storage format, not a user-facing one, and the read side already
excludes it (`helpers/readerFilter.ts`, shared by both directions).

The filter is applied once in `compatibleWriterNames`, which backs both
`getObjectSaveInfo` and `listSavableObjects`, so an object left with no writer
disappears from the picker rather than being offered and then failing.

**Accepted consequence**: `MolCoord` keeps `pdb` / `sdf` / `pqr` / `xyzr`, but
`DensityMap`, `MolSurfObj`, `ElePotMap` and `LWObject` have no non-QDF writer
at all, so those objects can no longer be saved via Save File As -- they are
omitted from the object picker, and a scene holding only such objects reports
"No object to save". Re-exposing them would mean re-exposing the QDF format.
