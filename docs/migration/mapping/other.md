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
| [`other.cuemol2`](../uxp-inventory/other.md#othercuemol2) | `App` / `ContentArea` / `TabBar` / `SidePanel` / `BottomPanel` / `StatusBar` / `ConfirmCloseTabDialog` / `useQuitHandler` | split | wip | | [ADR-0010](../adr/ADR-0010-quit-chain.md), [ADR-0011](../adr/ADR-0011-new-tab-canvas-lifecycle.md) | Main window layout (panels, tab view, status bar) and quit chain wired. Quit chain: see ADR-0010. Canvas lifecycle (always-mounted MolViewPane, one-shot bind): see ADR-0011. ConfirmCloseTabDialog Save button uses `CmdId.FileSave`. |
| [`other.hidden-window`](../uxp-inventory/other.md#otherhidden-window) | | | todo | | | |
| [`other.mybrowser`](../uxp-inventory/other.md#othermybrowser) | | | todo | | | |
| [`other.config-dialog`](../uxp-inventory/other.md#otherconfig-dialog) | | | todo | | | |
