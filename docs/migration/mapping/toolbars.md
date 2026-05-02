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

# Mapping — Toolbar

| ID | React | Mapping | Status | PR | ADR | Notes |
|----|-------|---------|--------|----|-----|-------|
| [`toolbar.cuemol2-ribbon`](../uxp-inventory/toolbars.md#toolbarcuemol2-ribbon) | `ViewportToolPalette` / `useNaviClickHandler` / `NaviContextMenu` | split | wip | | | Navigate/RectSelect mode buttons done; left-click (status+atom label toggle), right-click (atom context menu shell), double-click (residue select toggle/extend) done; context menu actions (center/select/add-select/unselect/invert/sidechain/around/centerSymm) done; Create SYMM mol deferred; measurement tool, rect-select drag pending; file/undo/redo ops tracked in menus.md |
| [`toolbar.anim-ribbon`](../uxp-inventory/toolbars.md#toolbaranim-ribbon) | | | todo | | | |
