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

# Mapping — Other

| ID | React | Mapping | Status | PR | ADR | Notes |
|----|-------|---------|--------|----|-----|-------|
| [`other.cuemol2`](../uxp-inventory/other.md#othercuemol2) | `App` / `ContentArea` / `TabBar` / `SidePanel` / `BottomPanel` / `StatusBar` / `ConfirmCloseTabDialog` / `useWindowCloseHandler` / `useFileDrop` | split | wip | | [ADR-0016](../adr/ADR-0016-window-close-quit-funnel.md), [ADR-0011](../adr/ADR-0011-new-tab-canvas-lifecycle.md) | Main window layout (panels, tab view, status bar) and window-close/quit funnel wired. Window close button and Cmd+Q share one per-window confirm funnel: see ADR-0016 (supersedes ADR-0010). Canvas lifecycle (always-mounted MolViewPane, one-shot bind): see ADR-0011. ConfirmCloseTabDialog Save button uses `CmdId.FileSave`. OS file drag-and-drop open (`dragdropopen.js` `onDrop` / `openNsFileImpl` parity) wired via `useFileDrop`: window-level capture-phase listeners, extension classification (obj readers before scene readers), then the same `CmdId.OpenObjByPath` / `OpenSceneByPath` commands as File > Open. A drag whose every file carries a certainly-unopenable MIME type (docx, pdf, media, archives) is refused during `dragover` so the OS shows a no-drop cursor; names and contents are unreadable until the drop, so this is a deny-list that fails open (see `_index.md` 2026-08-17). OS shell / command-line open (`openFromShell` / `convCmdLineFiles` parity) wired via `useShellOpenFiles` + `main/shellOpenQueue`: macOS `open-file`, `process.argv` and a `second-instance` handover all queue in main, and the renderer pulls the queue once CueMol and the launch scene are up, then reuses the same batch opener as the drop path (`useOpenFilePaths`). `requestSingleInstanceLock` added, so a second launch raises the running window instead of starting another app. macOS document types are declared with `LSHandlerRank: Alternate` so CueMol2 keeps the double-click default. Not migrated from `dragdropopen.js`: `.js` / `.py` script drop / open, and Windows / Linux shell association (command line works on both). |
| [`other.hidden-window`](../uxp-inventory/other.md#otherhidden-window) | | dropped | done | | | UXP/XUL background hidden window has no Electron equivalent; the Electron main process owns the app lifecycle (window management, IPC, menus) without a hidden window. Not migrated. |
| [`other.mybrowser`](../uxp-inventory/other.md#othermybrowser) | | dropped | done | | | UXP embedded XUL web-browser window dropped; external links open in the system browser via `shell.openExternal` (consistent with the dropped "Open web page" menu item). Not migrated. |
| [`other.config-dialog`](../uxp-inventory/other.md#otherconfig-dialog) | `SettingsPane` / `AppSettingsContext` | merged | done | | | UXP Options prefwindow (Misc / Key / Mouse pane host) realized as the left-panel `SettingsPane` (nav tree via `useSettingsPaneNav` + `settingsConfig`, not a modal). Panes tracked separately: Misc = `overlay.config-misc` (wip), Mouse = `overlay.config-mouse` (wip), Key = `overlay.config-keybind` (deferred). |
