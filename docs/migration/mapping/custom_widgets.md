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

# Mapping — Custom Widget

| ID | React | Mapping | Status | PR | ADR | Notes |
|----|-------|---------|--------|----|-----|-------|
| [`widget.wheelbtn`](../uxp-inventory/custom_widgets.md#widgetwheelbtn) | | | todo | | | |
| [`widget.numslider`](../uxp-inventory/custom_widgets.md#widgetnumslider) | | | todo | | | |
| [`widget.colorslider`](../uxp-inventory/custom_widgets.md#widgetcolorslider) | `components/widgets/colorpicker/ColorSlider.tsx` | direct | done | | [ADR-0020](../adr/ADR-0020-color-picker-widget.md) | Gradient-track range slider; linear + hue gradients via CSS. Used by `RgbHsbPanel`. |
| [`widget.colpicker`](../uxp-inventory/custom_widgets.md#widgetcolpicker) | `components/widgets/colorpicker/ColorPicker.tsx` | direct | wip | | [ADR-0020](../adr/ADR-0020-color-picker-widget.md) | Single popover + segmented mode switch (RGB/HSB/Named/Palette/Mol) + out-of-gamut warning; `compileColor`/`getNamedColors` worker services. Wired into ColorPane Solid/CPK/Bfac/Elepot decks; Paint table cell + Inspector ColorEditor still pending. |
| [`widget.mainview`](../uxp-inventory/custom_widgets.md#widgetmainview) | | | todo | | | |
| [`widget.molsellist`](../uxp-inventory/custom_widgets.md#widgetmolsellist) | `components/widgets/MolSelList/MolSelList.tsx` | direct | wip | | | First consumer: `RendererOptionsPane` (file-open dialog). Editable `InputGroup` + chevron-only `HTMLSelect` (CSS-shrunk to ~30 px, hidden empty sentinel option keeps the display blank — no "Pick…" text). Click chevron → OS-native dropdown listbox with `<optgroup>` Preset / History / Scene / Global, sidesteps Dialog flip/overflow. History via `localStorage`. Worker services `getSelDefs` (StyleManager scene+global named-sel defs) / `validateSelection` added. |
| [`widget.paintpanel`](../uxp-inventory/custom_widgets.md#widgetpaintpanel) | | | todo | | | |
| [`widget.selection-widget`](../uxp-inventory/custom_widgets.md#widgetselection-widget) | | | todo | | | |
| [`widget.sidepanelholder`](../uxp-inventory/custom_widgets.md#widgetsidepanelholder) | | | todo | | | |
| [`widget.camerasel`](../uxp-inventory/custom_widgets.md#widgetcamerasel) | | | todo | | | |
| [`widget.anim-slider`](../uxp-inventory/custom_widgets.md#widgetanim-slider) | | | todo | | | |
| [`widget.multiselect`](../uxp-inventory/custom_widgets.md#widgetmultiselect) | | | todo | | | |
| [`widget.timeedit`](../uxp-inventory/custom_widgets.md#widgettimeedit) | | | todo | | | |
