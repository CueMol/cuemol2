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
| [`widget.colorslider`](../uxp-inventory/custom_widgets.md#widgetcolorslider) | `h3-kit/colorpicker/ColorSlider.tsx` | direct | done | | [ADR-0020](../adr/ADR-0020-color-picker-widget.md) | Gradient-track range slider; linear + hue gradients via CSS. Used by `RgbHsbPanel`. |
| [`widget.colpicker`](../uxp-inventory/custom_widgets.md#widgetcolpicker) | `h3-kit/colorpicker/ColorPicker.tsx` | direct | done | | [ADR-0020](../adr/ADR-0020-color-picker-widget.md) | Single popover + segmented mode switch (RGB/HSB/Named/Palette/Mol) + out-of-gamut warning; `compileColor`/`getNamedColors` worker services. Now the single colour control app-wide via shared `ColorPickerProvider`/`CueColorField`: ColorPane decks + Paint cell, DensityMap, Inspector ColorEditor, App Settings (RGB/HSB/Palette only). |
| [`widget.mainview`](../uxp-inventory/custom_widgets.md#widgetmainview) | | | todo | | | |
| [`widget.molsellist`](../uxp-inventory/custom_widgets.md#widgetmolsellist) | `h3-kit/MolSelList/MolSelList.tsx` (generic picker) + `panes/selection/SelectionBuilder.tsx` / `useSelectionValues.ts` (SelectionPane-specific) | direct | wip | | [ADR-0021](../adr/ADR-0021-selection-builder.md) | First consumer: `RendererOptionsPane` (file-open dialog). Editable `InputGroup` + chevron-only `HTMLSelect` (CSS-shrunk to ~30 px, hidden empty sentinel option keeps the display blank — no "Pick…" text). Click chevron → OS-native dropdown listbox with `<optgroup>` Preset / History / Scene / Global, sidesteps Dialog flip/overflow. History via `localStorage`. Worker services `getSelDefs` (StyleManager scene+global named-sel defs) / `validateSelection` added. Optional `enableBuilder` **replaces** the native picker with a Selection Builder popover (Builder / Library / History tabs; Library folds in the picker's Preset / Macros / Scene / Global lists; one-way builder→text emit; async molecule-value autocomplete via `getMolChains`/`getMolResidues`/`getMolAtoms`); enabled in RendererOptionsPane, off in PaintSelCell (Popover portal vs blur-commit, keeps native picker). Emitted grammar verified against `parser_sel.yxx` + gtest guards. See [ADR-0021](../adr/ADR-0021-selection-builder.md). |
| [`widget.paintpanel`](../uxp-inventory/custom_widgets.md#widgetpaintpanel) | | | todo | | | |
| [`widget.selection-widget`](../uxp-inventory/custom_widgets.md#widgetselection-widget) | | | todo | | | |
| [`widget.sidepanelholder`](../uxp-inventory/custom_widgets.md#widgetsidepanelholder) | `SidePanel` | direct | wip | | | Collapsible/resizable side-panel host (Allotment) with per-view pane sets + size persistence. UXP user drag-drop panel reorder not ported (panes are config-driven via `buildViewPaneConfigs`) |
| [`widget.camerasel`](../uxp-inventory/custom_widgets.md#widgetcamerasel) | | | todo | | | |
| [`widget.anim-slider`](../uxp-inventory/custom_widgets.md#widgetanim-slider) | | | todo | | | |
| [`widget.multiselect`](../uxp-inventory/custom_widgets.md#widgetmultiselect) | | | todo | | | |
| [`widget.timeedit`](../uxp-inventory/custom_widgets.md#widgettimeedit) | | | todo | | | |
