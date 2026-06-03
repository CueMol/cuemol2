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
| `dialog.property.anisou` (no UXP dedicated dialog) | `inspector/AnIsoURendererSection`, `inspector/BallStickRendererSection` | split | done | | | `anisou` は専用 UXP property dialog を持たず generic dialog のみだったため、inventory entry は無し。`AnIsoURenderer` は `BallStickRenderer` を継承するので、継承した base 制御 (detail/bondw/sphr/ring/thickness/ringcolor) は共有 `BallStickRendererSection` を再利用 ("Ball and stick" accordion)、ORTEP disc 固有プロパティ (`drawdisc` Draw disc / `discscale` Disc scale / `discthick` Disc thickness、real は min0/max3/step0.05/fine0.01/coarse0.5/2桁) を新 `AnIsoUDiscSection` ("Anisotropic displacement" accordion) に実装。`drawdisc` off 時に scale/thickness を disable (C++ `drawSphere` の `if (m_fDrawDisc)` gating parity)。内部の GLU 頂点上限 `maxverts` は表示外観の制御ではないため curated page に出さず Generic タブに残す。`rendererPropSections` registry に `type_name "anisou"` で登録、`NumRow`/`BoolRow` を `RendererCommonSection` から再利用。 |
| [`dialog.property.ballstick`](../uxp-inventory/prop_dlgs.md#dialogpropertyballstick) | `inspector/BallStickRendererSection` | merged | done | | | UXP "Ball & Stick" タブの `detail` (int, min2/max20/step1) + `bondw` (Bond width) + `sphr` (Atom radius) + `ring` (Show ring) + `thickness` + `ringcolor` (Ring color、real は min0/max3/step0.01/unit Å) を Inspector Properties タブの独立 accordion entry ("Ball and stick") として実装。`rendererPropSections` registry に `type_name "ballstick"` で登録、`NumRow`/`BoolRow`/`ColorRow` (DragNumericField, realtime preview + 単一 undo) を `RendererCommonSection` から再利用。`ring` off 時に thickness/ringcolor を disable (UXP `updateEnabledState` parity)。 |
| [`dialog.property.cartoon`](../uxp-inventory/prop_dlgs.md#dialogpropertycartoon) | | | todo | | | |
| [`dialog.property.contour`](../uxp-inventory/prop_dlgs.md#dialogpropertycontour) | | | todo | | | |
| [`dialog.property.cpk`](../uxp-inventory/prop_dlgs.md#dialogpropertycpk) | `inspector/CPKRendererSection` | merged | done | | | UXP "Atom radii" タブを Inspector Properties タブの 2 accordion に実装: "Atom radii" (7 元素 van der Waals 半径 `vdwr_C`…`vdwr_X`, real, min0/max3/step0.01/2桁/unit Å) と "Detail" (`detail`, int, min2/max20/step1)。UXP の groupbox 外に置かれた detail を別 section に分離。`rendererPropSections` registry に `type_name "cpk"` で `CPKAtomRadiiSection`/`CPKDetailSection` を登録、`NumRow` (DragNumericField, realtime preview + 単一 undo) を `RendererCommonSection` から再利用。 |
| [`dialog.property.disorder`](../uxp-inventory/prop_dlgs.md#dialogpropertydisorder) | | | todo | | | |
| [`dialog.property.isosurf`](../uxp-inventory/prop_dlgs.md#dialogpropertyisosurf) | | | todo | | | |
| [`dialog.property.molsurf`](../uxp-inventory/prop_dlgs.md#dialogpropertymolsurf) | | | todo | | | |
| [`dialog.property.nucl`](../uxp-inventory/prop_dlgs.md#dialogpropertynucl) | | | todo | | | |
| [`dialog.property.object`](../uxp-inventory/prop_dlgs.md#dialogpropertyobject) | | | todo | | | |
| [`dialog.property.renderer`](../uxp-inventory/prop_dlgs.md#dialogpropertyrenderer) | `inspector/RendererCommonSection`, `inspector/PropertiesTab` | merged | wip | | | renderer-common-page (Basic settings + Edge lines) を Inspector の Properties タブに実装、live `getGenericProps`/`setGenericProp` 連携。renderer type 別 section は `rendererPropSections` registry で今後追加 (現状は Common + 折りたたみ dummy)。 |
| [`dialog.property.ribbon`](../uxp-inventory/prop_dlgs.md#dialogpropertyribbon) | | | todo | | | |
| [`dialog.property.simple`](../uxp-inventory/prop_dlgs.md#dialogpropertysimple) | `inspector/SimpleRendererSection` | merged | done | | | UXP "Simple" タブ唯一の Line width を Inspector Properties タブの独立 accordion entry ("Simple") として実装。`rendererPropSections` registry に `type_name "simple"` で登録、DragNumericField (realtime preview + 単一 undo, min0/max10/step0.2/unit px) で `width` を編集。`NumRow` を `RendererCommonSection` から再利用。 |
| [`dialog.property.tube`](../uxp-inventory/prop_dlgs.md#dialogpropertytube) | | | todo | | | |
