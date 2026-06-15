# ADR-0013: Top Toolbar — UXP ribbon port as a tab-less Navbar

- Status: accepted (object Save pending; Reload Scene and undo/redo history done)
- Date: 2026-05-16
- Mapping rows: [`toolbar.cuemol2-ribbon`](../mapping/toolbars.md)

## Context

The UXP GUI top toolbar (`uxp_gui/cuemol2/base/content/topbar/cuemol2-ribbon.xul`)
is a tabbed ribbon — Home / Measure / Animation tabs, each a separate toolbar.
Switching tabs to reach a button is poor UX: the buttons a user needs are
hidden behind a tab they are not currently on.

The tritium top toolbar (`Toolbar.tsx`) already rendered a single flat Navbar,
but its button set was an ad-hoc mix: 12 buttons of which only 4 were wired,
`Renderer` / `Snapshot` had neither a `CmdId` nor a defined behaviour, and
`Load Mol` duplicated `Open`. The component also took a fixed 3-prop interface
(`onOpenFile` / `onSave` / `onNewTab`), so every new button required editing
both `Toolbar.tsx` and `App.tsx`.

## Decision

Port the **non-tool** buttons of the UXP ribbon Home tab into a single
tab-less Navbar. The viewport interaction tools (Navigate / Rect Select /
measurement) stay in `ViewportToolPalette` and are out of scope here.

Final button set (9 buttons), defined declaratively in the `TOOLBAR_ITEMS`
array in `Toolbar.tsx`:

```
[New Tab] | [Open File] [Save]* [Save As]* | [Open Scene] [Reload Scene]* [Save Scene] | [Get PDB] | [Undo ▾] [Redo ▾]
```

`Toolbar` no longer takes props — it calls `useCommands().dispatch(CmdId.X)`
directly (renderer-internal command bus). `App.tsx` renders `<Toolbar />`.

Buttons marked `*` are **mock**: they are placed for layout parity but their
backing implementation does not exist yet, so their click handler only emits a
`console.warn` placeholder. New worker services and C++ wiring are explicitly
out of scope for this change.

- Real-wired: New Tab (`TabNew`), Open File (`UiOpenObjDialog`), Open Scene
  (`UiOpenSceneDialog`), Save Scene (`FileSave`), Get PDB (`UiGetPdbDialog`),
  Undo (`Undo`, single step), Redo (`Redo`, single step).
- Mock at the time of this ADR: object Save / object Save As / Reload Scene,
  plus the Undo/Redo history dropdown.

> **Update (2026-05-16, [ADR-0014](ADR-0014-file-menu-save-reload.md)):** the
> File-menu migration added `ObjectSaveAs` and `SceneReload` commands, so the
> Toolbar `Save As` and `Reload Scene` buttons are now real-wired. Only the
> object `Save` (overwrite-in-place) button and the Undo/Redo history dropdown
> remain mock.
>
> **Update (2026-06-15):** the Undo/Redo history dropdown and the
> enable/disable behaviour are now implemented (UXP `populateUndoMenu` /
> `updateCmdUndoState` parity). A `getUndoState` worker service exposes
> `isUndoable` / `isRedoable` + the `getUndoDesc(i)` / `getRedoDesc(i)` lists;
> `hooks/useUndoRedoState.ts` owns the state, registers `CmdId.Undo`/`Redo`,
> refreshes on `SCE_SCENE_UNDOINFO` (and after each undo/redo, which fires no
> event) + tab switch, and pushes the enabled flags to the native Edit menu via
> `MENU_UPDATE_STATE`. Picking history entry `i` calls `scene.undo(i)` (undoes
> `i+1` txns). Only the object `Save` button remains mock.

## Consequences

- The toolbar is now a coherent file/scene-I/O + undo/redo strip, matching the
  UXP ribbon Home tab intent without the tab indirection.
- `Renderer` / `Snapshot` / `View` / `Run` / `Log` and the duplicate `Load Mol`
  buttons were removed. `View` operations (perspective / orthographic / center
  mark) remain reachable through the menu bar; `Renderer` / `Snapshot` had no
  defined spec, so dropping them removes dead UI rather than feature.
- Adding a button is now a one-line `TOOLBAR_ITEMS` array edit.
- Object Save/Save As stay mock because tritium's command layer only has
  scene-level save (`FileSave` / `FileSaveAs`); object save needs new
  `ObjectSave` / `ObjectSaveAs` commands plus an object-picker UI. Reload Scene
  stays mock because no `SceneReload` command or worker service exists. These
  are tracked as follow-up work.
- The Undo/Redo split button shows a caret dropdown listing the transaction
  descriptions; picking an entry jumps multiple steps. The body buttons disable
  at the ends of the stack. State is enumerated by the `getUndoState` worker
  service (`Scene.getUndoSize` / `getUndoDesc`) and owned by `useUndoRedoState`
  (see the 2026-06-15 update above).

## Notes

- Implementation: `components/Toolbar.tsx` (`TOOLBAR_ITEMS` array),
  `components/toolbar/UndoRedoSplitButton.tsx`, `App.tsx` toolbar callsite.
- Test: `__test__/Toolbar.test.tsx` pins that real buttons dispatch their
  `CmdId`, mock buttons dispatch nothing, and Undo/Redo body buttons dispatch
  the edit commands.
- UXP parity references: `cuemol2-ribbon.xul` (Home tab buttons),
  `tool-ribbon.js`, `cuemol2.js` (`onNewTabWindow`, `undo`/`redo`,
  `populateUndoMenu`), `fileopen.js` (`onFileSaveAs`, `onReloadScene`).
- Follow-up work: object Save/Save As commands, `SceneReload` command +
  `reloadScene.service.ts`, undo/redo history worker service for the dropdown.
