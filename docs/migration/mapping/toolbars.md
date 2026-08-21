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
| [`toolbar.cuemol2-ribbon`](../uxp-inventory/toolbars.md#toolbarcuemol2-ribbon) | `Toolbar` / `ViewportToolPalette` / `useNaviClickHandler` / `useMeasureClickHandler` / `NaviContextMenu` / `MeasureOptionsPopover` | split | wip | | [ADR-0013](../adr/ADR-0013-toolbar-ribbon-port.md), [ADR-0023](../adr/ADR-0023-measure-tool.md), [ADR-0049](../adr/ADR-0049-create-symm-mol.md) | **Toolbar**: ribbon Home-tab non-tool buttons ported to a tab-less Navbar — New Tab / Open File / Open Scene / Save Scene / Get PDB wired; Undo / Redo wired with enable/disable at stack ends + a working history dropdown that jumps multiple steps (`getUndoState` service + `useUndoRedoState`, UXP `populateUndoMenu`/`updateCmdUndoState` parity); object `Save As` and Reload Scene are wired (`CmdId.ObjectSaveAs` / `CmdId.SceneReload`, see ADR-0014); object `Save` (overwrite-in-place) is still a mock placeholder (see ADR-0013). **Tool palette**: Navigate/RectSelect mode buttons done; navigate tool wired (`naviTool.service` — left/right/double-click, context menu actions center/select/add-select/unselect/invert/sidechain/around/centerSymm done). **Measure tool done** (distance/angle/torsion): `measure.service` pick state machine (2/3/4-atom), atomintr label create/reuse under undo, 3D `DistPickDrawObj` crosshair feedback, reset on tool/view change + Esc, target label-set popover (`MeasureOptionsPopover` + `measureListTargets`, default name "measure", cross-molecule) — see ADR-0023. lassoSelect is a tritium-only tool with no UXP counterpart. **Create SYMM mol done** (viewport ctxmenu on a `*symm` hit -> `getCreateSymmMolOptions`/`createSymmMol` services; shared NewRendererDialog reused unchanged with its editable object name consumed as the new MolCoord's name; `copyAtoms`+`xformByMat` under one 'Create symm mol' undo txn -- see ADR-0049). rect-select drag pending; file/undo/redo ops also tracked in menus.md |
| [`toolbar.anim-ribbon`](../uxp-inventory/toolbars.md#toolbaranim-ribbon) | `AnimTransport` / `useAnimTransport` / `animation.service` | merged | done | | [ADR-0029](../adr/ADR-0029-anim-timeline-strip-model.md) | UXP anim transport ribbon (Play/Pause/Stop/Loop + position slider + readout) realized as the AnimationPanel transport header (`AnimTransport`); no separate toolbar in tritium. Tracked under `panel.anim`. |
