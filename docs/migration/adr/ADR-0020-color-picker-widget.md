# ADR-0020: Color picker widget — popover-panel port of UXP colpicker

- Status: accepted (ColorPane decks wired; Paint table + Inspector deferred)
- Date: 2026-05-29
- Mapping rows: [`widget.colpicker`](../mapping/custom_widgets.md#widgetcolpicker), [`widget.colorslider`](../mapping/custom_widgets.md#widgetcolorslider), [`menu.color`](../mapping/menus.md#menucolor)

## Context

UXP implemented colour selection as a composite XBL widget (`colpicker.js` +
`colorSlider.xml` + `color-menu.xul`), embedded as `<mycolpicker>` in 17 XUL
files. The widget is a text box + caret menu (RGB / HSB / Named colors /
Palette / Use mol color); each mode opens a floating panel. Tritium's
ColorPane decks previously used a plain text input with a hardcoded
`NAMED_COLORS` preview map, so only `#hex` / `rgb()` strings previewed
correctly -- named colours and `hsb()` did not, and there was no mode-based
editing.

A first port reproduced UXP literally (caret menu -> second floating panel),
but the two-step popover flow was awkward, so the widget was reworked to a
single popover with an inline mode switch (see Decision).

## Decision

Ship a reusable React widget `ColorPicker`
(`react-gui/src/renderer/components/widgets/colorpicker/`): swatch +
`InputGroup` + caret. The caret opens a SINGLE Blueprint `Popover` whose top
row is a segmented `ButtonGroup` mode switch (RGB / HSB / Named / Palette /
Mol) and whose body shows the active mode's panel. RGB and HSB stay separate
modes (not merged). "Mol" has no editable params, so selecting it applies
`$molcol` immediately and shows a short note. Panels: `RgbHsbPanel` (three
gradient `ColorSlider`s + `NumericInput` spinners), `NamedListPanel` (scene +
global named colours), `PalettePanel` (UXP `buildPaletteBox` tile grid).
Colour resolution, the named-colour list, and the out-of-gamut check are
delegated to a new worker service `colorPicker.service.ts` (`compileColor` /
`getNamedColors`) so previews match the C++ StyleManager exactly; HSB<->RGB
maths and gradient/hsb-string formatting are pure local helpers in
`colorMath.ts` (no per-drag IPC).

The widget is controlled via `value` / `onChange(value, completed)`;
`completed=false` during slider drags and `true` on commit (panel close,
named/palette pick, text-box blur, mol-color pick). ColorPane consumes it
through a `ColorPickerContext` + thin `PaneColorPicker` adapter that forwards
only completed edits to the existing deck `onCommit`, so undo behaviour is
unchanged. Visual styling modernises the UXP look using design tokens
(`_colorpicker.css`); the legacy resizer handle, XUL listbox, and old spinner
chrome are not reproduced.

## Consequences

- Accurate previews everywhere the widget is used; named/HSB/tuple colours
  now render their true colour, and out-of-gamut colours show an amber
  warning swatch that clamps to the device colour on click.
- HSB editing keeps a separate working triple inside `RgbHsbPanel` (like
  UXP's `mHSBValue`) so dragging hue through a grey does not lose the hue to
  an RGB round-trip.
- Live slider edits update the widget's own swatch but are NOT pushed to the
  3D view until the gesture completes (commit-on-release), matching the prior
  blur-commit behaviour and avoiding undo-step spam. True live 3D preview is
  future work.
- Scope is the Solid / CPK / Bfac / Elepot decks. The Paint table cell (a
  distinct td-background layout) and the Inspector `ColorEditor` (native
  `<input type=color>`) are not yet migrated; `NAMED_COLORS` /
  `resolveColorPreview` remain only for the Paint table.

## Notes

- Widget: `react-gui/src/renderer/components/widgets/colorpicker/ColorPicker.tsx`
  (+ `ColorSlider`, `RgbHsbPanel`, `NamedListPanel`, `PalettePanel`,
  `colorMath.ts`); styles in `react-gui/src/renderer/styles/_colorpicker.css`.
- Worker service: `react-gui/src/renderer/worker/server/services/colorPicker.service.ts`;
  `ServiceMap` rows `compileColor` / `getNamedColors` in
  `worker/shared/WorkerCalls.ts`.
- Integration: `components/panes/ColorPane.tsx` (`ColorPickerContext`,
  `PaneColorPicker`, `SolidDeck`, `ColorField`, `ColorSwatchInline`).
- UXP parity references: `uxp_gui/cuemol2/base/content/colpicker.js`,
  `colorSlider.xml`, `color-menu.xul`; colour maths from
  `uxp_gui/cuemol2/components/jsmods/cuemol2ui-lib/util.js`
  (`convHSB2RGB` / `convRGB2HSB` / `packToHTMLColor`).
- Tests: `__test__/colorMath.test.ts`, `__test__/colorPickerService.test.ts`,
  `__test__/ColorPicker.test.tsx`.
