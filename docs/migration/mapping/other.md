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
| [`other.cuemol2`](../uxp-inventory/other.md#othercuemol2) | `App` / `ContentArea` / `TabBar` / `SidePanel` / `BottomPanel` / `StatusBar` / `ConfirmCloseTabDialog` / `useQuitHandler` | split | wip | | | Main window layout (panels, tab view, status bar) is implemented. UXP `onCloseEvent` quit chain wired: `before-quit` (`main/index.ts`) preventDefaults and pushes `IPC.APP_QUIT_REQUEST` to the renderer; `useQuitHandler` walks every tab via `handleCloseTab` (which still uses the existing `ConfirmCloseTabDialog` + `getSceneCloseInfo` flow for modified-scene gating); on success the renderer invokes `IPC.APP_QUIT_PROCEED` to let main re-issue `app.quit()`. Cancel on any tab aborts the chain. ConfirmCloseTabDialog Save button is now wired to `CmdId.FileSave`. |
| [`other.hidden-window`](../uxp-inventory/other.md#otherhidden-window) | | | todo | | | |
| [`other.mybrowser`](../uxp-inventory/other.md#othermybrowser) | | | todo | | | |
| [`other.config-dialog`](../uxp-inventory/other.md#otherconfig-dialog) | | | todo | | | |
