<!--
Mapping values:
  direct      -- one-to-one React component
  split       -- split into multiple React components
  merged      -- merged into existing React component
  dropped     -- not migrated (feature removed)
  deferred    -- migration deferred

Status values:
  todo        -- not started
  wip         -- in progress
  review      -- PR open, under review
  done        -- merged
  blocked     -- blocked by dependency
-->

# Mapping — Menu

> `menu.cuemol2` (the single main-menubar overlay) was split into 8
> per-menu rows (File / Edit / Rendering / Scene / View / Tools / Window /
> Help) on 2026-07-11 — each menubar dropdown is a distinct `<menupopup>`
> surface and progresses on its own phase, so a single row's per-item
> status was too coarse. See `uxp-inventory/menus.md` for the inventory
> split. The item-level detail table further down is the source of truth
> for each group's completion count (`X/Y wired`); the `MenuBar` (React)
> is suppressed on macOS — native Electron menu only. The macOS
> Application menu is tracked in its own row (`menu.cuemol2-macos`).

| ID | React | Mapping | Status | PR | ADR | Notes |
|----|-------|---------|--------|----|-----|-------|
| [`menu.color`](../uxp-inventory/menus.md#menucolor) | `h3-kit/colorpicker/PalettePanel.tsx` | merged | done | | [ADR-0020](../adr/ADR-0020-color-picker-widget.md) | UXP color-menu presets merged into the color picker Palette panel (grayscale + 7 hue rows x 7 sat/bri variations). |
| [`menu.cuemol2.file`](../uxp-inventory/menus.md#menucuemol2file) | `menuTemplate` / `MenuBar` / `useMenuDispatch` / `useFileCommands` | split | done | | [ADR-0008](../adr/ADR-0008-get-pdb-streaming.md), [ADR-0009](../adr/ADR-0009-open-recent-mru.md), [ADR-0012](../adr/ADR-0012-save-scene-parity.md), [ADR-0014](../adr/ADR-0014-file-menu-save-reload.md), [ADR-0016](../adr/ADR-0016-window-close-quit-funnel.md) | 14/14 resolved. All items wired; New Window dropped (Electron cannot host multiple OS windows on one shared backend, 2026-07-11) and Open web page dropped. |
| [`menu.cuemol2.edit`](../uxp-inventory/menus.md#menucuemol2edit) | `menuTemplate` / `MenuBar` / `useMenuDispatch` | split | wip | | | 6/8 wired (Undo / Redo + Merge molecule / Delete mol atoms / Change chain ID / Change residue number, each opening its tool dialog via `ui.*Dialog`). Clear undo data + Options remain stubbed. |
| [`menu.cuemol2.rendering`](../uxp-inventory/menus.md#menucuemol2rendering) | `menuTemplate` / `MenuBar` / `useMenuDispatch` / `runSceneExportFlow` / `useSceneExportCaps` / `RenderWindowApp` | split | wip | | [ADR-0037](../adr/ADR-0037-scene-export-capability-gate.md) | 2/3 wired: POV-Ray rendering opens the modeless Rendering window (`ui.renderWindow`), Export scene submenu (PNG / Umbreon / POV / STL / MQO) wired. Export items are capability-gated -- an exporter not compiled into the running libcuemol2 (e.g. Umbreon without HAVE_UMBREON) is hidden from the submenu via a startup probe (ADR-0037). Animation rendering deferred -- to be folded into the Rendering window as a Still/Animation mode (menu item removed 2026-07-11). |
| [`menu.cuemol2.scene`](../uxp-inventory/menus.md#menucuemol2scene) | `menuTemplate` / `MenuBar` / `useMenuDispatch` / `sceneBgColor.service` | split | wip | | | 2/4 wired (Background White / Black). Use color proofing + Properties… stubbed (scene ctxmenu has color-proofing wired; menu path + scene property editor still pending). |
| [`menu.cuemol2.view`](../uxp-inventory/menus.md#menucuemol2view) | `menuTemplate` / `MenuBar` / `useMenuDispatch` / `useViewCommands` / `viewProjection.service` | split | done | | | 7/7 resolved. Perspective / Orthographic + Center mark Cross / Axis / None + View property (`ui.viewProperty` -> docked Generic inspector) wired; Hardware stereo dropped. |
| [`menu.cuemol2.tools`](../uxp-inventory/menus.md#menucuemol2tools) | `menuTemplate` / `MenuBar` / `useMenuDispatch` / `useToolCommands` | split | wip | | [ADR-0022](../adr/ADR-0022-mol-superpose.md) | 6/10 resolved: Molecular superposition / Interaction / Reassign secondary str / Mol surface generation / Mol surface cutter wired to their dialogs; Mol bond editor merged into the viewport "Add Bond" tool (menu item removed 2026-07-11). Morph animation / APBS / Execute script / Performance measure remain stubbed. |
| [`menu.cuemol2.window`](../uxp-inventory/menus.md#menucuemol2window) | (removed) | dropped | done | | | Whole Window menu dropped 2026-07-11: Show/Hide Topbar + Clear log contents + Restore default panel location no longer map onto the tritium UI structure. |
| [`menu.cuemol2.help`](../uxp-inventory/menus.md#menucuemol2help) | `menuTemplate` / `MenuBar` / `useMenuDispatch` | split | done | | | 6/6 resolved. About CueMol3-tritium wired (`ui.aboutDialog`); the Mozilla-specific About plugins / About config / Addon manager / Console / Check for updates were dropped 2026-07-11. On macOS the single-item Help group is empty (About lives in the App menu) and is filtered out. |
| [`menu.cuemol2-macos`](../uxp-inventory/menus.md#menucuemol2-macos) | `main/menu.ts` (`macOnlyGroups`) | direct | wip | | | macOS App menu added; per-item implementation status is tracked below (6/7; Preferences stubbed) |
| [`menu.cuemol2-scripts`](../uxp-inventory/menus.md#menucuemol2-scripts) | — | dropped | done | | | XUL script loader overlay; Electron app handles module loading natively — no migration needed |

## Completion Summary

Completion counts treat `wired` / `native` as complete and `dropped` / `merged` as resolved (intentional migration decisions). Only `stub` (falls through to the generic unimplemented warning) and `deferred` (planned follow-up) count against completion. Counts are derived from the source-of-truth `menuActionMap.ts`.

| Scope | Complete | Stub / todo | Completion | Notes |
|-------|---------:|------------:|-----------:|-------|
| `menu.color` | 1 | 0 | 100% | Presets merged into the color picker Palette panel (see ADR-0020) |
| `menu.cuemol2.file` | 14 | 0 | 100% | All wired; New Window + Open web page dropped (both count resolved) |
| `menu.cuemol2.edit` | 6 | 2 | 75% | Undo / Redo + Merge / Delete / Change chain / Change resid all wired; Clear undo + Options stub |
| `menu.cuemol2.rendering` | 2 | 1 | 67% | POV-Ray (render window) + Export scene wired; Animation rendering deferred (render-window integration) |
| `menu.cuemol2.scene` | 2 | 2 | 50% | Background White / Black wired; Use color proofing + Properties stubbed |
| `menu.cuemol2.view` | 7 | 0 | 100% | Projection + Center mark + View property wired; Hardware stereo dropped |
| `menu.cuemol2.tools` | 6 | 4 | 60% | Superpose / Interaction / Reassign-2ndry / Mol-surf / Surf-cutter wired + Bond editor merged (viewport tool); Morph anim / APBS / Exec script / Perf measure stub |
| `menu.cuemol2.window` | 3 | 0 | 100% | Whole Window menu dropped (topbar / log / panel-layout no longer map onto tritium) |
| `menu.cuemol2.help` | 6 | 0 | 100% | About wired; plugins / config / addon-mgr / console / updates dropped (Mozilla-specific) |
| `menu.cuemol2-macos` | 6 | 1 | 86% | OS-native items complete; Preferences is stubbed |
| `menu.cuemol2-scripts` | 1 | 0 | 100% | Dropped intentionally because Electron module loading replaces the XUL script overlay |
| **`menu.cuemol2` subtotal** | **46** | **9** | **84%** | Sum of the 8 `menu.cuemol2.*` group rows (55 item-level points; 6 dropped + 1 merged count resolved, 1 deferred + 8 stub outstanding) |
| **Total** | **54** | **10** | **84%** | 64 inventory-derived menu migration points (color 1 + cuemol2 55 + macos 7 + scripts 1) |

## Menu Item Implementation Status

Implementation status values:

- `wired` -- menu entry reaches a real Tritium command, dialog, or state update path
- `native` -- handled by Electron/OS role without CueMol-specific code
- `partial` -- visible and partly state-aware, but CueMol behavior is incomplete
- `stub` -- menu entry exists and sends IPC, but currently falls through to `console.warn('menu action not yet implemented:', channel)`
- `deferred` -- intentionally left for later
- `dropped` -- not migrated

Current source of truth: `tritium/react-gui/src/shared/menuActionMap.ts` (the channel -> dispatch map that drives wired-vs-stub), `tritium/react-gui/src/shared/menuTemplate.ts`, `tritium/react-gui/src/main/menu.ts`, `tritium/react-gui/src/renderer/hooks/useMenuDispatch.ts`, `tritium/react-gui/src/renderer/commands/useViewCommands.ts`, and `tritium/react-gui/src/renderer/worker/services/viewProjection.service.ts`.

View menu state notes:

- Projection check state is synced from the active MolView through `MenuState.viewProjection`.
- Center mark uses CueMol's string enum values (`none`, `crosshair`, `axis`) through `MenuState.viewCenterMark`.
- The React `MenuBar` exposes Center mark entries as radio menu items. The Electron native menu builds them as checkable items and updates them exclusively in `updateMenuState()` to avoid relying on Electron radio auto-check behavior.

| Menu | Item | Tritium entry | Dispatch / Implementation | Impl status | Notes |
|------|------|---------------|---------------------------|-------------|-------|
| macOS App | About CueMol3-tritium | `about-mac` / `menu:about` | `CmdId.UiAboutDialog` | wired | macOS native App menu is built in `main/menu.ts` from `macOnlyGroups` |
| macOS App | Preferences... | `mac-prefs` / `menu:options` | `MENU_GENERIC` -> `console.warn` | stub | Same channel as non-macOS Edit > Options |
| macOS App | Services | `role: services` | Electron role | native | OS-level item |
| macOS App | Hide CueMol | `role: hide` | Electron role | native | OS-level item |
| macOS App | Hide Others | `role: hideOthers` | Electron role | native | OS-level item |
| macOS App | Show All | `role: unhide` | Electron role | native | OS-level item |
| macOS App | Quit CueMol | `role: quit` | Electron role + `before-quit` closes every window → `win.on('close')` funnel → `IPC.WINDOW_CLOSE_REQUEST` → `useWindowCloseHandler` walks all tabs through `handleCloseTab` → `IPC.WINDOW_CLOSE_PROCEED` | wired | Window close button and Cmd+Q share one per-window confirm funnel; cancel aborts. See [ADR-0016](../adr/ADR-0016-window-close-quit-funnel.md). |
| File | New Window | (removed) | -- | dropped | Electron cannot host multiple OS windows against one shared libcuemol2 backend, so the UXP multi-window model is not carried forward (use New Tab). Menu item + channel removed 2026-07-11. |
| File | New Tab | `new-tab` / `menu:new-tab` | `CmdId.TabNew` → `useNewTabCommand` → `NewTabDialog` | done | UXP parity dialog (New Scene / New View + inherit camera); New Scene → `createNewSceneAndView`, New View → `createViewInScene`. Canvas one-shot bind / `addView` lifecycle and constraints recorded in [ADR-0011](../adr/ADR-0011-new-tab-canvas-lifecycle.md). |
| File | Open File... | `open-file` / `menu:open-file` | `CmdId.UiOpenObjDialog` | wired | Opens object-file dialog path |
| File | Get PDB... | `get-pdb` / `menu:get-pdb` | `CmdId.UiGetPdbDialog` → `GetPdbDialog` → `streamLoadFromUrl` / `streamLoadDensityMap` / `cancelStreamLoad` services | wired | Streaming via `StreamManager.supplyDataAsync` (no temp file); cancel drains IOThread. Coord (RCSB CIF / PDB) + density map (RCSB cif.gz / EBI MTZ) supported. Streaming path, .cif disambiguation, and PDB-ID history recorded in [ADR-0008](../adr/ADR-0008-get-pdb-streaming.md). |
| File | Open Recent > Clear Menu | `clear-recent` / `menu:clear-recent` | `IPC.RECENT_CLEAR` → `clearRecents` (`main/recentFiles.ts`) + `app.clearRecentDocuments` + menu rebuild | wired | Dynamic MRU via electron-store (cap 10); native menu and React MenuBar use different dispatch paths; OS Dock / JumpList mirrored via `app.addRecentDocument`. Storage / update points / dual-surface dispatch recorded in [ADR-0009](../adr/ADR-0009-open-recent-mru.md). |
| File | Save File As... | `save-file-as` / `menu:save-file-as` | `CmdId.ObjectSaveAs` → `useFileCommands` → object picker (when ≥2 objects) → `runObjectSaveFlow` (`getObjectSaveInfo` + `IPC.DIALOG_OBJECT_SAVE` + `saveObjectToFile`) | wired | Object (not scene) save; shares `runObjectSaveFlow` with the scene-tree `Save As…` context-menu action. Also bound to the Toolbar `Save As` button. See [ADR-0014](../adr/ADR-0014-file-menu-save-reload.md). |
| File | Save current view... | `save-current-view` / `menu:save-current-view` | `CmdId.SaveCurrentView` → `useFileCommands` → `saveViewToCamera('__current')` + `IPC.DIALOG_CAMERA_SAVE` + `saveCameraToFile` | wired | Saves the live view's camera to a `.cam` file (UXP `onSaveCurView`). See [ADR-0014](../adr/ADR-0014-file-menu-save-reload.md). |
| File | Close Tab | `close-tab` / `menu:close-tab` | `CmdId.TabClose` → `handleCloseTab` (async) | wired | Calls `getSceneCloseInfo`; shows `ConfirmCloseTabDialog` (Save/Don't Save/Cancel) when scene is modified and viewCount==1 (UXP `closeTabImpl` logic). Save button wired to `CmdId.FileSave` — same `handleCloseTab` chain used by the window-close/quit funnel, see [ADR-0016](../adr/ADR-0016-window-close-quit-funnel.md) and [ADR-0012](../adr/ADR-0012-save-scene-parity.md). |
| File | Open Scene... | `open-scene` / `menu:open-scene` | `CmdId.UiOpenSceneDialog` | wired | Opens scene-file dialog path |
| File | Reload Scene | `reload-scene` / `menu:reload-scene` | `CmdId.SceneReload` → `useFileCommands` → `getSceneSaveInfo` (src) + `getSceneCloseInfo` (modified) + `ConfirmReloadSceneDialog` + `loadScene` | wired | Reloads the scene from its source file; confirms first when there are unsaved changes. Also bound to the Toolbar `Reload Scene` button. See [ADR-0014](../adr/ADR-0014-file-menu-save-reload.md). |
| File | Save Scene | `save-scene` / `menu:save` | `CmdId.FileSave` → `getSceneSaveInfo` + `saveScene` services | wired | Falls through to Save As on empty/missing src; otherwise backup `<path>.bak` then write via `qsc_xml`. No option dialog on plain Save. See [ADR-0012](../adr/ADR-0012-save-scene-parity.md). |
| File | Save Scene As... | `save-scene-as` / `menu:save-scene-as` | `CmdId.FileSaveAs` → `IPC.DIALOG_SAVE_SCENE` + `QscWriterOptionDialog` + `saveScene` service | wired | Native save dialog → Blueprint option dialog (Embed / Compatibility / Compression / Encoding; QDF0 constraint) → backup + write. Accelerator `CmdOrCtrl+Shift+S`. See [ADR-0012](../adr/ADR-0012-save-scene-parity.md). |
| File | Open web page... | — | — | dropped | UXP entry removed from both `cuemol2-menus.xul` and `menuTemplate.ts`; not migrated |
| File | Quit/Exit | `role: quit` | Electron role + `before-quit` → per-window `win.on('close')` confirm funnel (see macOS App > Quit CueMol) | wired | Non-macOS File menu item — same window-close confirm funnel as macOS; the X button also routes through it. See [ADR-0016](../adr/ADR-0016-window-close-quit-funnel.md). |
| Edit | Undo | `undo` / `menu:undo` | `CmdId.Undo` | wired | Owned by `useUndoRedoState`; disabled at stack bottom via `MENU_UPDATE_STATE` (UXP `updateCmdUndoState` parity). Toolbar has a multi-step history dropdown ([ADR-0013](../adr/ADR-0013-toolbar-ribbon-port.md)) |
| Edit | Redo | `redo` / `menu:redo` | `CmdId.Redo` | wired | Owned by `useUndoRedoState`; disabled when redo stack empty. macOS accelerator override |
| Edit | Clear undo data | `clear-undo` / `menu:clear-undo` | `MENU_GENERIC` -> `console.warn` | stub | Command not connected |
| Edit | Merge molecule... | `merge-mol` / `menu:merge-mol` | `ui.mergeMolDialog` command -> merge-molecule dialog | wired | Opens the merge-molecule tool dialog (`dialog.tool.mol-merge`) |
| Edit | Delete mol atoms... | `delete-mol-atoms` / `menu:delete-mol-atoms` | `ui.deleteMolDialog` command -> delete-atoms dialog | wired | Opens the delete-atoms tool dialog (`dialog.tool.mol-delete`) |
| Edit | Change chain ID... | `change-chain-id` / `menu:change-chain-id` | `ui.changeChainIdDialog` command -> change-chain dialog | wired | Opens the change-chain-ID tool dialog (`dialog.tool.chg-chname`) |
| Edit | Change residue number... | `change-resid-num` / `menu:change-resid-num` | `ui.changeResidueIndexDialog` command -> change-residue-index dialog | wired | Opens the change-residue-index tool dialog (`dialog.tool.chg-resindex`) |
| Edit | Options | `options` / `menu:options` | `MENU_GENERIC` -> `console.warn` | stub | Non-macOS Edit menu item; macOS Preferences uses same channel |
| Rendering | POV-Ray rendering... | `pov-render` / `menu:pov-render` | `ui.renderWindow` command -> modeless Rendering window (`RenderWindowApp`) | wired | Opens the modeless Rendering window (target-view picker + backend settings + Start/progress/result); also on the Toolbar "Render" button. Backends include POV-Ray (`PovrayBackend`). |
| Rendering | Animation rendering... | (removed) | to be folded into the Rendering window as a Still/Animation mode | deferred | UXP had a separate animation-render window; tritium will add an Animation mode to the existing modeless Rendering window (follow-up). Menu item + channel removed 2026-07-11. |
| Rendering | Export scene | `export-scene` submenu (`menu:export-{png,umbreon,pov,stl,mqo}`) | `CmdId.Export{Png,Umbreon,Pov,Stl,Mqo}` -> `runSceneExportFlow` -> `exportScene` worker (StreamManager `createHandler(name, 2)`) | wired | Split into a per-file-type submenu (PNG / Umbreon ray-traced PNG / POV-Ray SDL / STL / MQO). One item per exporter so png vs umbreon (both `*.png`) stay distinct without relying on Electron's lost filter index. Image types reuse `ExportPngOptionsDialog` (size/alpha/DPI); POV writes a sibling `.inc`. Curated subset of UXP's category-2 exporters (LuxRender/Warabi/raw/qsl deferred). Items whose exporter is not compiled into libcuemol2 are hidden via the `getAvailableSceneExporters` startup probe (`useSceneExportCaps` -> `MenuState.exportCaps` -> `MenuItem.visible`; fail-open), so Umbreon is absent on builds without HAVE_UMBREON (ADR-0037). |
| Scene | Background > White | `bg-white` / `menu:bg-white` | `CmdId.SceneBgWhite` + `AsyncCueMol.setSceneBgColor('white')` + `updateMenuState` | wired | Radio state derived from scene.bgcolor RGB; uses StyleManager.compileColor('white') via makeColor helper |
| Scene | Background > Black | `bg-black` / `menu:bg-black` | `CmdId.SceneBgBlack` + `AsyncCueMol.setSceneBgColor('black')` + `updateMenuState` | wired | Radio state derived from scene.bgcolor RGB; uses StyleManager.compileColor('black') via makeColor helper |
| Scene | Use color proofing | `color-proof` / `menu:color-proof` | `MENU_GENERIC` -> `console.warn` | stub | Checkbox behavior not connected |
| Scene | Properties... | `scene-props` / `menu:scene-props` | `MENU_GENERIC` -> `console.warn` | stub | Scene property dialog not connected |
| View | Perspective | `view-perspective` / `menu:view-perspective` | `CmdId.ViewPerspective` + `updateMenuState` | wired | Checkbox state is updated through `MENU_UPDATE_STATE` |
| View | Orthographic | `view-orthographic` / `menu:view-orthographic` | `CmdId.ViewOrthographic` + `updateMenuState` | wired | Checkbox state is updated through `MENU_UPDATE_STATE` |
| View | Center mark > Cross | `center-mark-cross` / `menu:center-mark-cross` | `CmdId.ViewCenterMarkCross` + `AsyncCueMol.setViewCenterMark('crosshair')` + `updateMenuState` | wired | Uses CueMol enum value `crosshair`; menu state is updated from the successful command request |
| View | Center mark > Axis | `center-mark-axis` / `menu:center-mark-axis` | `CmdId.ViewCenterMarkAxis` + `AsyncCueMol.setViewCenterMark('axis')` + `updateMenuState` | wired | Uses CueMol enum value `axis`; menu state is updated from the successful command request |
| View | Center mark > None | `center-mark-none` / `menu:center-mark-none` | `CmdId.ViewCenterMarkNone` + `AsyncCueMol.setViewCenterMark('none')` + `updateMenuState` | wired | Uses CueMol enum value `none`; menu state is updated from the successful command request |
| View | Hardware stereo | — | removed from Tritium View menu | dropped | Removed by migration decision; hardware stereo menu is not carried forward |
| View | View property... | `view-props` / `menu:view-props` | `ui.viewProperty` command -> docked Generic inspector (View target) | wired | Routes the active view into the docked property inspector's Generic tab (`overlay.propeditor-generic`). |
| Tools | Molecular superposition... | `mol-superpose` / `menu:mol-superpose` | `CmdId.UiMolSuperpose` → `MolSuperposeDialog` → `superposeMol` service | wired | LSQ/SSM superposition via `MolAnlManager` under undo txn; RMSD-file output deferred. See [ADR-0022](../adr/ADR-0022-mol-superpose.md). |
| Tools | Mol bond editor... | (removed) | viewport tool: `ViewportToolPalette` "Add Bond" (`activeTool 'bondEdit'`, `useBondEditClickHandler` + `bondEdit.service`) | merged | UXP modal replaced by a viewport pick-to-add tool (`dialog.tool.bond-edit`); no menu entry needed. Menu item + channel removed 2026-07-11. |
| Tools | Interaction... | `interaction` / `menu:interaction` | `ui.interactionAnalysisDialog` command -> interaction dialog | wired | Opens the interaction-analysis dialog (`dialog.tool.intr-tool`) |
| Tools | Reassign secondary str... | `reassign-2ndry` / `menu:reassign-2ndry` | `ui.reassignProt2ndryDialog` command -> reassign-2ndry dialog | wired | Opens the secondary-structure reassign dialog (`dialog.tool.prot2ndry-tool`) |
| Tools | Mol morphing animation... | `morph-anim` / `menu:morph-anim` | `MENU_GENERIC` -> `console.warn` | stub | Tool dialog not connected (`dialog.tool.morphanim-tool` todo) |
| Tools | Mol surface generation... | `mol-surf` / `menu:mol-surf` | `ui.makeMolSurfDialog` command -> make-surface dialog | wired | Opens the mol-surface dialog (`dialog.tool.makesurf`) |
| Tools | Mol surface cutter... | `surf-cutter` / `menu:surf-cutter` | `ui.cutSurfByPlaneDialog` command -> cut-surface dialog | wired | Opens the surface cut-by-plane dialog (`dialog.tool.surf-cutbyplane`) |
| Tools | APBS elepot calculation... | `apbs` / `menu:apbs` | `MENU_GENERIC` -> `console.warn` | stub | Tool dialog not connected |
| Tools | Execute script... | `exec-script` / `menu:exec-script` | `MENU_GENERIC` -> `console.warn` | stub | Script execution dialog not connected |
| Tools | Performance measure | `perf-meas` / `menu:perf-meas` | `MENU_GENERIC` -> `console.warn` | stub | Checkbox behavior not connected |
| Window | Show/Hide Topbar | (removed) | -- | dropped | Window menu dropped 2026-07-11: the topbar / log / panel-layout actions no longer map onto the tritium UI structure. |
| Window | Clear log contents | (removed) | -- | dropped | Window menu dropped 2026-07-11 (see above). |
| Window | Restore default panel location | (removed) | -- | dropped | Window menu dropped 2026-07-11 (see above). |
| Help | About CueMol3-tritium | `about` / `menu:about` | `ui.aboutDialog` command -> `AboutDialog` | wired | The only carried-forward Help item; non-macOS Help menu (macOS shows it in the App menu, so the Help group is empty and dropped there). |
| Help | About plugins... | (removed) | -- | dropped | Mozilla-platform specific (`about:plugins`); dropped 2026-07-11. |
| Help | About config... | (removed) | -- | dropped | Mozilla-platform specific (`about:config`); dropped 2026-07-11. |
| Help | Addon manager... | (removed) | -- | dropped | Mozilla add-on manager; dropped 2026-07-11. |
| Help | Console | (removed) | -- | dropped | Mozilla error console; dropped 2026-07-11. |
| Help | Check for updates | (removed) | -- | dropped | Mozilla update system; dropped 2026-07-11. |
