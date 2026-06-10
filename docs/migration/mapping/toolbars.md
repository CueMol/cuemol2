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
| [`toolbar.cuemol2-ribbon`](../uxp-inventory/toolbars.md#toolbarcuemol2-ribbon) | `Toolbar` / `ViewportToolPalette` / `useNaviClickHandler` / `useMeasureClickHandler` / `NaviContextMenu` / `MeasureOptionsPopover` | split | wip | | [ADR-0013](../adr/ADR-0013-toolbar-ribbon-port.md), [ADR-0023](../adr/ADR-0023-measure-tool.md) | **Toolbar**: ribbon Home-tab non-tool buttons ported to a tab-less Navbar — New Tab / Open File / Open Scene / Save Scene / Get PDB / Undo / Redo wired; object Save / Save As, Reload Scene and the Undo/Redo history dropdown are mock placeholders (see ADR-0013). **Tool palette**: Navigate/RectSelect mode buttons done; navigate tool wired (`naviTool.service` — left/right/double-click, context menu actions center/select/add-select/unselect/invert/sidechain/around/centerSymm done). **Measure tool done** (distance/angle/torsion): `measure.service` pick state machine (2/3/4-atom), atomintr label create/reuse under undo, 3D `DistPickDrawObj` crosshair feedback, reset on tool/view change + Esc, target label-set popover (`MeasureOptionsPopover` + `measureListTargets`, default name "measure", cross-molecule) — see ADR-0023. lassoSelect is a tritium-only tool with no UXP counterpart. Create SYMM mol deferred; rect-select drag pending; file/undo/redo ops also tracked in menus.md |
| [`toolbar.anim-ribbon`](../uxp-inventory/toolbars.md#toolbaranim-ribbon) | | | todo | | | |
