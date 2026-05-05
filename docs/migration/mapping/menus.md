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
| `menu.cuemol2` | 12 | 43 | 22% | Main menubar structure exists; 55 item-level migration points tracked |
| `menu.cuemol2-macos` | 6 | 1 | 86% | OS-native items complete; Preferences is stubbed |
| `menu.cuemol2-scripts` | 1 | 0 | 100% | Dropped intentionally because Electron module loading replaces the XUL script overlay |
| **Total** | **19** | **45** | **30%** | 64 inventory-derived menu migration points |

## Menu Item Implementation Status

Implementation status values:

- `wired` -- menu entry reaches a real Tritium command, dialog, or state update path
- `native` -- handled by Electron/OS role without CueMol-specific code
- `partial` -- visible and partly state-aware, but CueMol behavior is incomplete
- `stub` -- menu entry exists and sends IPC, but currently falls through to `console.warn('menu action not yet implemented:', channel)`
- `deferred` -- intentionally left for later
- `dropped` -- not migrated

Current source of truth: `tritium/react-gui/src/shared/menuTemplate.ts`, `tritium/react-gui/src/main/menu.ts`, and `tritium/react-gui/src/renderer/hooks/useMenuDispatch.ts`.

| Menu | Item | Tritium entry | Dispatch / Implementation | Impl status | Notes |
|------|------|---------------|---------------------------|-------------|-------|
| macOS App | About CueMol3-tritium | `about-mac` / `menu:about` | `CmdId.UiAboutDialog` | wired | macOS native App menu is built in `main/menu.ts` from `macOnlyGroups` |
| macOS App | Preferences... | `mac-prefs` / `menu:options` | `MENU_GENERIC` -> `console.warn` | stub | Same channel as non-macOS Edit > Options |
| macOS App | Services | `role: services` | Electron role | native | OS-level item |
| macOS App | Hide CueMol | `role: hide` | Electron role | native | OS-level item |
| macOS App | Hide Others | `role: hideOthers` | Electron role | native | OS-level item |
| macOS App | Show All | `role: unhide` | Electron role | native | OS-level item |
| macOS App | Quit CueMol | `role: quit` | Electron role | native | OS-level item |
| File | New Window | `new-window` / `menu:new-window` | `MENU_GENERIC` -> `console.warn` | stub | Entry exists in native menu and React `MenuBar` |
| File | New Tab | `new-tab` / `menu:new-tab` | `CmdId.TabNew` | wired | Native menu has a specific push channel; React menu dispatches directly |
| File | Open File... | `open-file` / `menu:open-file` | `CmdId.UiOpenObjDialog` | wired | Opens object-file dialog path |
| File | Get PDB... | `get-pdb` / `menu:get-pdb` | `MENU_GENERIC` -> `console.warn` | stub | UXP command not yet connected |
| File | Open Recent > Clear Menu | `clear-recent` / `menu:clear-recent` | `MENU_GENERIC` -> `console.warn` | stub | Dynamic MRU population is not implemented |
| File | Save File As... | `save-file-as` / `menu:save-file-as` | `MENU_GENERIC` -> `console.warn` | stub | Separate from current `Save Scene` path |
| File | Save current view... | `save-current-view` / `menu:save-current-view` | `MENU_GENERIC` -> `console.warn` | stub | Camera/image export behavior not connected |
| File | Close Tab | `close-tab` / `menu:close-tab` | `CmdId.TabClose` | wired | No-op if there is no active tab |
| File | Open Scene... | `open-scene` / `menu:open-scene` | `CmdId.UiOpenSceneDialog` | wired | Opens scene-file dialog path |
| File | Reload Scene | `reload-scene` / `menu:reload-scene` | `MENU_GENERIC` -> `console.warn` | stub | Accelerator exists, behavior not connected |
| File | Save Scene | `save-scene` / `menu:save` | `CmdId.FileSave` | wired | Current save command path |
| File | Save Scene As... | `save-scene-as` / `menu:save-scene-as` | `MENU_GENERIC` -> `console.warn` | stub | Save-as behavior not connected |
| File | Open web page... | `open-webpage` / `menu:open-webpage` | `MENU_GENERIC` -> `console.warn` | stub | UXP web-page command not connected |
| File | Quit/Exit | `role: quit` | Electron role | native | Non-macOS File menu item |
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
| Scene | Background > White | `bg-white` / `menu:bg-white` | `MENU_GENERIC` -> `console.warn` | stub | Background color state/action not connected |
| Scene | Background > Black | `bg-black` / `menu:bg-black` | `MENU_GENERIC` -> `console.warn` | stub | Background color state/action not connected |
| Scene | Use color proofing | `color-proof` / `menu:color-proof` | `MENU_GENERIC` -> `console.warn` | stub | Checkbox behavior not connected |
| Scene | Properties... | `scene-props` / `menu:scene-props` | `MENU_GENERIC` -> `console.warn` | stub | Scene property dialog not connected |
| View | Perspective | `view-perspective` / `menu:view-perspective` | `CmdId.ViewPerspective` + `updateMenuState` | wired | Checkbox state is updated through `MENU_UPDATE_STATE` |
| View | Orthographic | `view-orthographic` / `menu:view-orthographic` | `CmdId.ViewOrthographic` + `updateMenuState` | wired | Checkbox state is updated through `MENU_UPDATE_STATE` |
| View | Center mark > Cross | `center-mark-cross` / `menu:center-mark-cross` | `MENU_GENERIC` -> `console.warn` | stub | Radio/check state not connected |
| View | Center mark > Axis | `center-mark-axis` / `menu:center-mark-axis` | `MENU_GENERIC` -> `console.warn` | stub | Radio/check state not connected |
| View | Center mark > None | `center-mark-none` / `menu:center-mark-none` | `MENU_GENERIC` -> `console.warn` | stub | Radio/check state not connected |
| View | Hardware stereo | `hw-stereo` / `menu:hw-stereo` | `MENU_GENERIC` -> `console.warn` | stub | Checkbox behavior not connected |
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
