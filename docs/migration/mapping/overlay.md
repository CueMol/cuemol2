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

# Mapping — Overlay

| ID | React | Mapping | Status | PR | ADR | Notes |
|----|-------|---------|--------|----|-----|-------|
| [`overlay.coloring-deck-bfac`](../uxp-inventory/overlay.md#overlaycoloring-deck-bfac) | | | todo | | | |
| [`overlay.coloring-deck-cpk`](../uxp-inventory/overlay.md#overlaycoloring-deck-cpk) | | | todo | | | |
| [`overlay.coloring-deck-elepot`](../uxp-inventory/overlay.md#overlaycoloring-deck-elepot) | | | todo | | | |
| [`overlay.coloring-deck-paint`](../uxp-inventory/overlay.md#overlaycoloring-deck-paint) | | | todo | | | |
| [`overlay.coloring-deck-rainbow`](../uxp-inventory/overlay.md#overlaycoloring-deck-rainbow) | | | todo | | | |
| [`overlay.coloring-deck-script`](../uxp-inventory/overlay.md#overlaycoloring-deck-script) | | | todo | | | |
| [`overlay.config-keybind`](../uxp-inventory/overlay.md#overlayconfig-keybind) | | | todo | | | |
| [`overlay.config-misc`](../uxp-inventory/overlay.md#overlayconfig-misc) | | | todo | | | |
| [`overlay.config-mouse`](../uxp-inventory/overlay.md#overlayconfig-mouse) | | | todo | | | |
| [`overlay.fopen-ccp4map`](../uxp-inventory/overlay.md#overlayfopen-ccp4map) | | | todo | | | |
| [`overlay.fopen-mmcifopt`](../uxp-inventory/overlay.md#overlayfopen-mmcifopt) | | | todo | | | |
| [`overlay.fopen-msmsopt`](../uxp-inventory/overlay.md#overlayfopen-msmsopt) | | | todo | | | |
| [`overlay.fopen-mtzopt`](../uxp-inventory/overlay.md#overlayfopen-mtzopt) | | | todo | | | |
| [`overlay.fopen-namdcooropt`](../uxp-inventory/overlay.md#overlayfopen-namdcooropt) | | | todo | | | |
| [`overlay.fopen-pdbopt`](../uxp-inventory/overlay.md#overlayfopen-pdbopt) | | | todo | | | |
| [`overlay.fopen-renderopt`](../uxp-inventory/overlay.md#overlayfopen-renderopt) | | | todo | | | |
| [`overlay.propeditor-generic`](../uxp-inventory/overlay.md#overlaypropeditor-generic) | InspectorPanel / GenericTab | merged | wip | | [ADR-0015](../adr/ADR-0015-generic-property-inspector.md) | Generic tab of the docked inspector pane; live-apply, no OK/Cancel. First stage edits primitive types (string/int/real/bool/enum); color/vector/timeval/nested-object deferred. Targets object/renderer/scene (ScenePane tree) and View (View menu > View property...); follows content-tab switches via per-scene memory. Replaces the retired `NodePropertyDialog` modal. |
| [`overlay.propeditor-radii-common`](../uxp-inventory/overlay.md#overlaypropeditor-radii-common) | | | todo | | | |
| [`overlay.property.cartoon-coil`](../uxp-inventory/overlay.md#overlaypropertycartoon-coil) | | | todo | | | |
| [`overlay.property.cartoon-helix`](../uxp-inventory/overlay.md#overlaypropertycartoon-helix) | | | todo | | | |
| [`overlay.property.cartoon-sheet`](../uxp-inventory/overlay.md#overlaypropertycartoon-sheet) | | | todo | | | |
| [`overlay.property.molsurf`](../uxp-inventory/overlay.md#overlaypropertymolsurf) | | | todo | | | |
| [`overlay.property.renderer-common`](../uxp-inventory/overlay.md#overlaypropertyrenderer-common) | | | todo | | | |
| [`overlay.property.ribbon-coil`](../uxp-inventory/overlay.md#overlaypropertyribbon-coil) | | | todo | | | |
| [`overlay.property.ribbon-helix`](../uxp-inventory/overlay.md#overlaypropertyribbon-helix) | | | todo | | | |
| [`overlay.property.ribbon-sheet`](../uxp-inventory/overlay.md#overlaypropertyribbon-sheet) | | | todo | | | |
| [`overlay.property.tube`](../uxp-inventory/overlay.md#overlaypropertytube) | | | todo | | | |
| [`overlay.anim.animobj-common-proppage`](../uxp-inventory/overlay.md#overlayanimanimobj-common-proppage) | | | todo | | | |
