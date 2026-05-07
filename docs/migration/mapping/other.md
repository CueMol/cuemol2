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
| [`other.cuemol2`](../uxp-inventory/other.md#othercuemol2) | `App` / `ContentArea` / `TabBar` / `SidePanel` / `BottomPanel` / `StatusBar` / `ConfirmCloseTabDialog` | split | wip | | | Main window layout (panels, tab view, status bar) is implemented. `onCloseEvent`/`closeTabImpl` UXP behavior — close-tab confirmation dialog (modified scene check, viewCount==1 gate) — implemented via `ConfirmCloseTabDialog` + `getSceneCloseInfo` worker service. Window-level close event (all-tabs drain on app quit) is not yet wired. |
| [`other.hidden-window`](../uxp-inventory/other.md#otherhidden-window) | | | todo | | | |
| [`other.mybrowser`](../uxp-inventory/other.md#othermybrowser) | | | todo | | | |
| [`other.config-dialog`](../uxp-inventory/other.md#otherconfig-dialog) | | | todo | | | |
