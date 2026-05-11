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
| [`panel.workspace`](../uxp-inventory/panels.md#panelworkspace) | `ScenePane` / `useSceneTree` / `sceneTree.service` | split | wip | | | Phase 1 done: live tree (scene/object/renderer/rendGroup), eye-icon visibility toggle (undo-wrapped), node selection. Camera/style/group operations and toolbar buttons land in later phases. |
