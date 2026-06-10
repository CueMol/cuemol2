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

> Many UXP overlays are XUL fragments injected into a host dialog/panel; in
> tritium they are not separate widgets but parts of a parent component. Such
> rows use `merged` and carry the parent's status, with a cross-reference to
> the parent mapping row (e.g. `fopen-*` panes -> `dialog.fopen-option`,
> `property.*` sections -> `dialog.property.*`). Counting them is intentional:
> they pin per-fragment migration, mirrored from the parent.

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
| [`overlay.fopen-ccp4map`](../uxp-inventory/overlay.md#overlayfopen-ccp4map) | `Ccp4MapOptionsPane` | merged | done | | | CCP4 map options pane of `FileOpenOptionDialog` (`dialog.fopen-option`) |
| [`overlay.fopen-mmcifopt`](../uxp-inventory/overlay.md#overlayfopen-mmcifopt) | | | todo | | | |
| [`overlay.fopen-msmsopt`](../uxp-inventory/overlay.md#overlayfopen-msmsopt) | `MsmsOptionsPane` | merged | done | | | MSMS surface options pane of `FileOpenOptionDialog` (`dialog.fopen-option`) |
| [`overlay.fopen-mtzopt`](../uxp-inventory/overlay.md#overlayfopen-mtzopt) | `MtzOptionsPane` (`mtzColumns.ts`) | merged | done | | | MTZ reflection options pane of `FileOpenOptionDialog` (`dialog.fopen-option`) |
| [`overlay.fopen-namdcooropt`](../uxp-inventory/overlay.md#overlayfopen-namdcooropt) | `NamdCoorOptionsPane` | merged | done | | | NAMD coordinate options pane of `FileOpenOptionDialog` (`dialog.fopen-option`) |
| [`overlay.fopen-pdbopt`](../uxp-inventory/overlay.md#overlayfopen-pdbopt) | `PdbOptionsPane` | merged | done | | | PDB options pane of `FileOpenOptionDialog` (`dialog.fopen-option`) |
| [`overlay.fopen-renderopt`](../uxp-inventory/overlay.md#overlayfopen-renderopt) | `RendererOptionsPane` | merged | done | | | Renderer options pane shared by `FileOpenOptionDialog` (`dialog.fopen-option`) and `NewRendererDialog` (`dialog.setup-renderer`) |
| [`overlay.propeditor-generic`](../uxp-inventory/overlay.md#overlaypropeditor-generic) | InspectorPanel / GenericTab | merged | wip | | [ADR-0015](../adr/ADR-0015-generic-property-inspector.md) | Generic tab of the docked inspector pane; live-apply, no OK/Cancel. First stage edits primitive types (string/int/real/bool/enum); color/vector/timeval/nested-object deferred. Targets object/renderer/scene (ScenePane tree) and View (View menu > View property...); follows content-tab switches via per-scene memory. Replaces the retired `NodePropertyDialog` modal. |
| [`overlay.propeditor-radii-common`](../uxp-inventory/overlay.md#overlaypropeditor-radii-common) | | | todo | | | |
| [`overlay.property.cartoon-coil`](../uxp-inventory/overlay.md#overlaypropertycartoon-coil) | `CartoonRendererSection` | merged | done | | | Coil accordion of the Inspector section for `dialog.property.cartoon` (done) |
| [`overlay.property.cartoon-helix`](../uxp-inventory/overlay.md#overlaypropertycartoon-helix) | `CartoonRendererSection` | merged | done | | | Helix accordion of the Inspector section for `dialog.property.cartoon` (done) |
| [`overlay.property.cartoon-sheet`](../uxp-inventory/overlay.md#overlaypropertycartoon-sheet) | `CartoonRendererSection` | merged | done | | | Sheet accordion of the Inspector section for `dialog.property.cartoon` (done) |
| [`overlay.property.molsurf`](../uxp-inventory/overlay.md#overlaypropertymolsurf) | `MolSurfRendererSection` | merged | done | | | Inspector section for `dialog.property.molsurf` (done) |
| [`overlay.property.renderer-common`](../uxp-inventory/overlay.md#overlaypropertyrenderer-common) | `RendererCommonSection` | merged | wip | | | Common (Basic settings + Edge lines) section of the Inspector Properties tab; tracked under `dialog.property.renderer` (wip) |
| [`overlay.property.ribbon-coil`](../uxp-inventory/overlay.md#overlaypropertyribbon-coil) | `RibbonRendererSection` | merged | done | | | Coil accordion of the Inspector section for `dialog.property.ribbon` (done) |
| [`overlay.property.ribbon-helix`](../uxp-inventory/overlay.md#overlaypropertyribbon-helix) | `RibbonRendererSection` | merged | done | | | Helix accordion of the Inspector section for `dialog.property.ribbon` (done) |
| [`overlay.property.ribbon-sheet`](../uxp-inventory/overlay.md#overlaypropertyribbon-sheet) | `RibbonRendererSection` | merged | done | | | Sheet accordion of the Inspector section for `dialog.property.ribbon` (done) |
| [`overlay.property.tube`](../uxp-inventory/overlay.md#overlaypropertytube) | `TubeRendererSection` | merged | done | | | Inspector section for `dialog.property.tube` (done) |
| [`overlay.anim.animobj-common-proppage`](../uxp-inventory/overlay.md#overlayanimanimobj-common-proppage) | | | todo | | | |
