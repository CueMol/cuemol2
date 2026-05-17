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

| ID | React | Mapping | Status | PR | ADR | Notes |
|----|-------|---------|--------|----|-----|-------|
| [`menu.color`](../uxp-inventory/menus.md#menucolor) | | | todo | | | Color picker popup; deferred pending color picker UI design |
| [`menu.cuemol2`](../uxp-inventory/menus.md#menucuemol2) | `menuTemplate` / `MenuBar` / `useMenuDispatch` | split | wip | | | Full 9-group menu structure added (File/Edit/Rendering/Scene/View/Tools/Window/Help); per-item implementation status is tracked below; `MenuBar` (React) is suppressed on macOS -- native Electron menu only |
| [`menu.cuemol2-macos`](../uxp-inventory/menus.md#menucuemol2-macos) | `main/menu.ts` (`macOnlyGroups`) | direct | wip | | | macOS App menu added; per-item implementation status is tracked below |
| [`menu.cuemol2-scripts`](../uxp-inventory/menus.md#menucuemol2-scripts) | — | dropped | done | | | XUL script loader overlay; Electron app handles module loading natively — no migration needed |

## Completion Summary

Completion counts treat `wired` and `native` as complete. `stub` means the menu item exists in Tritium but still falls through to the generic unimplemented menu warning.

| Scope | Complete | Stub / todo | Completion | Notes |
|-------|---------:|------------:|-----------:|-------|
| `menu.color` | 0 | 1 | 0% | Not migrated or itemized in Tritium yet |
| `menu.cuemol2` | 25 | 30 | 45% | Main menubar structure exists; 55 item-level migration points tracked (1 dropped counted as complete) |
| `menu.cuemol2-macos` | 6 | 1 | 86% | OS-native items complete; Preferences is stubbed |
| `menu.cuemol2-scripts` | 1 | 0 | 100% | Dropped intentionally because Electron module loading replaces the XUL script overlay |
| **Total** | **29** | **35** | **45%** | 64 inventory-derived menu migration points |

## Menu Item Implementation Status

Implementation status values:

- `wired` -- menu entry reaches a real Tritium command, dialog, or state update path
- `native` -- handled by Electron/OS role without CueMol-specific code
- `partial` -- visible and partly state-aware, but CueMol behavior is incomplete
- `stub` -- menu entry exists and sends IPC, but currently falls through to `console.warn('menu action not yet implemented:', channel)`
- `deferred` -- intentionally left for later
- `dropped` -- not migrated

Current source of truth: `tritium/react-gui/src/shared/menuTemplate.ts`, `tritium/react-gui/src/main/menu.ts`, `tritium/react-gui/src/renderer/hooks/useMenuDispatch.ts`, `tritium/react-gui/src/renderer/commands/useViewCommands.ts`, and `tritium/react-gui/src/renderer/worker/services/viewProjection.service.ts`.

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
| File | New Window | `new-window` / `menu:new-window` | `MENU_GENERIC` -> `console.warn` | stub | Entry exists in native menu and React `MenuBar` |
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
| Edit | Undo | `undo` / `menu:undo` | `CmdId.Undo` | wired | Native menu has a specific push channel |
| Edit | Redo | `redo` / `menu:redo` | `CmdId.Redo` | wired | Uses macOS accelerator override |
| Edit | Clear undo data | `clear-undo` / `menu:clear-undo` | `MENU_GENERIC` -> `console.warn` | stub | Command not connected |
| Edit | Merge molecule... | `merge-mol` / `menu:merge-mol` | `MENU_GENERIC` -> `console.warn` | stub | Tool dialog not connected from menu |
| Edit | Delete mol atoms... | `delete-mol-atoms` / `menu:delete-mol-atoms` | `MENU_GENERIC` -> `console.warn` | stub | Tool dialog not connected from menu |
| Edit | Change chain ID... | `change-chain-id` / `menu:change-chain-id` | `MENU_GENERIC` -> `console.warn` | stub | Tool dialog not connected from menu |
| Edit | Change residue number... | `change-resid-num` / `menu:change-resid-num` | `MENU_GENERIC` -> `console.warn` | stub | Tool dialog not connected from menu |
| Edit | Options | `options` / `menu:options` | `MENU_GENERIC` -> `console.warn` | stub | Non-macOS Edit menu item; macOS Preferences uses same channel |
| Rendering | POV-Ray rendering... | `pov-render` / `menu:pov-render` | `MENU_GENERIC` -> `console.warn` | stub | Render dialog not connected |
| Rendering | Animation rendering... | `anim-render` / `menu:anim-render` | `MENU_GENERIC` -> `console.warn` | stub | Animation render dialog not connected |
| Rendering | Export scene... | `export-scene` / `menu:export-scene` | `MENU_GENERIC` -> `console.warn` | stub | Export scene behavior not connected |
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
| View | View property... | `view-props` / `menu:view-props` | `MENU_GENERIC` -> `console.warn` | stub | View property dialog not connected |
| Tools | Molecular superposition... | `mol-superpose` / `menu:mol-superpose` | `MENU_GENERIC` -> `console.warn` | stub | Tool dialog not connected |
| Tools | Mol bond editor... | `bond-editor` / `menu:bond-editor` | `MENU_GENERIC` -> `console.warn` | stub | Tool dialog not connected |
| Tools | Interaction... | `interaction` / `menu:interaction` | `MENU_GENERIC` -> `console.warn` | stub | Tool dialog not connected |
| Tools | Reassign secondary str... | `reassign-2ndry` / `menu:reassign-2ndry` | `MENU_GENERIC` -> `console.warn` | stub | Tool dialog not connected |
| Tools | Mol morphing animation... | `morph-anim` / `menu:morph-anim` | `MENU_GENERIC` -> `console.warn` | stub | Tool dialog not connected |
| Tools | Mol surface generation... | `mol-surf` / `menu:mol-surf` | `MENU_GENERIC` -> `console.warn` | stub | Tool dialog not connected |
| Tools | Mol surface cutter... | `surf-cutter` / `menu:surf-cutter` | `MENU_GENERIC` -> `console.warn` | stub | Tool dialog not connected |
| Tools | APBS elepot calculation... | `apbs` / `menu:apbs` | `MENU_GENERIC` -> `console.warn` | stub | Tool dialog not connected |
| Tools | Execute script... | `exec-script` / `menu:exec-script` | `MENU_GENERIC` -> `console.warn` | stub | Script execution dialog not connected |
| Tools | Performance measure | `perf-meas` / `menu:perf-meas` | `MENU_GENERIC` -> `console.warn` | stub | Checkbox behavior not connected |
| Window | Show/Hide Topbar | `toggle-topbar` / `menu:toggle-topbar` | `MENU_GENERIC` -> `console.warn` | stub | Window layout action not connected |
| Window | Clear log contents | `clear-log` / `menu:clear-log` | `MENU_GENERIC` -> `console.warn` | stub | Log action not connected |
| Window | Restore default panel location | `restore-panels` / `menu:restore-panels` | `MENU_GENERIC` -> `console.warn` | stub | Layout reset action not connected |
| Help | About CueMol3-tritium | `about` / `menu:about` | `CmdId.UiAboutDialog` | wired | Non-macOS Help menu item; macOS uses App menu |
| Help | About plugins... | `about-plugins` / `menu:about-plugins` | `MENU_GENERIC` -> `console.warn` | stub | Dialog not connected |
| Help | About config... | `about-config` / `menu:about-config` | `MENU_GENERIC` -> `console.warn` | stub | Dialog not connected |
| Help | Addon manager... | `addon-mgr` / `menu:addon-mgr` | `MENU_GENERIC` -> `console.warn` | stub | Dialog not connected |
| Help | Console | `console` / `menu:console` | `MENU_GENERIC` -> `console.warn` | stub | Console action not connected |
| Help | Check for updates | `check-updates` / `menu:check-updates` | `MENU_GENERIC` -> `console.warn` | stub | Update check not connected |
