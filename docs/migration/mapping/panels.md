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

# Mapping — Panel

| ID | React | Mapping | Status | PR | ADR | Notes |
|----|-------|---------|--------|----|-----|-------|
| [`panel.anim`](../uxp-inventory/panels.md#panelanim) | | | todo | | | |
| [`panel.btmpanel-holder`](../uxp-inventory/panels.md#panelbtmpanel-holder) | | | todo | | | |
| [`panel.coloring`](../uxp-inventory/panels.md#panelcoloring) | | | todo | | | |
| [`panel.densitymap`](../uxp-inventory/panels.md#paneldensitymap) | | | todo | | | |
| [`panel.fakedial`](../uxp-inventory/panels.md#panelfakedial) | | | todo | | | |
| [`panel.molstruct`](../uxp-inventory/panels.md#panelmolstruct) | | | todo | | | |
| [`panel.selection`](../uxp-inventory/panels.md#panelselection) | | | todo | | | |
| [`panel.symmetry`](../uxp-inventory/panels.md#panelsymmetry) | | | todo | | | |
| [`panel.workspace`](../uxp-inventory/panels.md#panelworkspace) | `ScenePane` / `useSceneTree` / `useSceneContextMenu` / `sceneTree.service` / `sceneOps.service` / `main/sceneContextMenu` / `NodePropertyDialog` | split | wip | | | Phase 1 done: live tree (scene/object/renderer/rendGroup + cameraRoot/styleRoot synthesised), eye-icon visibility toggle (undo-wrapped), node selection, auto-refresh via cm.addEventListener (SEM_SCENE\|OBJECT\|RENDERER\|CAMERA\|STYLE). Phase 2 done: toolbar Focus / Delete / Property buttons; property dialog is read-only key/value stub. Phase 3a done: native context menu (`IPC.SCENE_CTX_SHOW`) with Show/Hide, Rename (window.prompt), Delete, Properties for scene/object/renderer/rendGroup/camera/style; renameNode worker service. Phase 3b: object selection submenu. Phase 3c: renderer paint/color/style. Phase 4: drag-drop + copy/paste. Phase 5: camera/style file I/O + real property dialog. Phase 6: around-byres / change-type / generate surface. Add Renderer and multi-select remain deferred. |
