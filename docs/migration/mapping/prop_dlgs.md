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

# Mapping — Dialog_property

> Option-specification UX: pick a pattern per row using
> [option-ux-guidelines.md](../option-ux-guidelines.md). Renderer property
> dialogs are recommended to consolidate into one docked Properties panel.

| ID | React | Mapping | Status | PR | ADR | Notes |
|----|-------|---------|--------|----|-----|-------|
| [`dialog.property.ballstick`](../uxp-inventory/prop_dlgs.md#dialogpropertyballstick) | | | todo | | | |
| [`dialog.property.cartoon`](../uxp-inventory/prop_dlgs.md#dialogpropertycartoon) | | | todo | | | |
| [`dialog.property.contour`](../uxp-inventory/prop_dlgs.md#dialogpropertycontour) | | | todo | | | |
| [`dialog.property.cpk`](../uxp-inventory/prop_dlgs.md#dialogpropertycpk) | | | todo | | | |
| [`dialog.property.disorder`](../uxp-inventory/prop_dlgs.md#dialogpropertydisorder) | | | todo | | | |
| [`dialog.property.isosurf`](../uxp-inventory/prop_dlgs.md#dialogpropertyisosurf) | | | todo | | | |
| [`dialog.property.molsurf`](../uxp-inventory/prop_dlgs.md#dialogpropertymolsurf) | | | todo | | | |
| [`dialog.property.nucl`](../uxp-inventory/prop_dlgs.md#dialogpropertynucl) | | | todo | | | |
| [`dialog.property.object`](../uxp-inventory/prop_dlgs.md#dialogpropertyobject) | | | todo | | | |
| [`dialog.property.renderer`](../uxp-inventory/prop_dlgs.md#dialogpropertyrenderer) | `inspector/RendererCommonSection`, `inspector/PropertiesTab` | merged | wip | | | renderer-common-page (Basic settings + Edge lines) を Inspector の Properties タブに実装、live `getGenericProps`/`setGenericProp` 連携。renderer type 別 section は `rendererPropSections` registry で今後追加 (現状は Common + 折りたたみ dummy)。 |
| [`dialog.property.ribbon`](../uxp-inventory/prop_dlgs.md#dialogpropertyribbon) | | | todo | | | |
| [`dialog.property.simple`](../uxp-inventory/prop_dlgs.md#dialogpropertysimple) | `inspector/SimpleRendererSection` | merged | done | | | UXP "Simple" タブ唯一の Line width を Inspector Properties タブの独立 accordion entry ("Simple") として実装。`rendererPropSections` registry に `type_name "simple"` で登録、DragNumericField (realtime preview + 単一 undo, min0/max10/step0.2/unit px) で `width` を編集。`NumRow` を `RendererCommonSection` から再利用。 |
| [`dialog.property.tube`](../uxp-inventory/prop_dlgs.md#dialogpropertytube) | | | todo | | | |
