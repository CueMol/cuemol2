# ADR-0020: Color picker widget — popover-panel port of UXP colpicker

- Status: accepted (rolled out to all colour-selection UIs)
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
- The widget is now the single colour-selection control across the app: the
  ColorPane decks (Solid / CPK / Rainbow / Bfac / Elepot) and Paint table
  cell, the DensityMap solid colour, the Inspector `ColorEditor`
  (renderer/render-settings property colours), and the App Settings colours.
  The native `<input type=color>` sites and the per-pane `NAMED_COLORS` /
  `resolveColorPreview` preview maps are removed.

## Full rollout (2026-05-30)

Extended the widget from the ColorPane decks to every remaining colour UI.

- **Shared plumbing.** `ColorPickerContext` / `PaneColorPicker` (previously
  private to `ColorPane.tsx`) are promoted to the widget module as
  `ColorPickerProvider` + `useColorPickerCtx` (`ColorPickerContext.tsx`) and a
  reusable `CueColorField` adapter (`CueColorField.tsx`). `CueColorField`
  reads `cm` / `sceneId` from the ambient provider and commits on completed
  changes only, so consumers supply just `value` + `onCommit`. This avoids
  threading `cm` / `sceneId` through the inspector's `PropGroupedEditor` ->
  `renderPropEditor` dispatcher (shared by `PropertiesTab` and
  `RenderSettingsEditor`); each consuming pane/panel wraps its subtree in
  `ColorPickerProvider`.
- **Restricted modes.** `ColorPicker` gains an optional `modes` prop. App
  Settings colours are scene-independent plain colours, so they expose only
  `['rgb', 'hsb', 'palette']` -- "Named" / "Mol" (which resolve against a
  scene's StyleManager, and `$molcol` in particular) make no sense there.
  Settings pass `sceneId={undefined}` (the service falls back to scope 0).
- **Representation-preserving open.** The popover opens on the panel that
  matches the current value's representation (`$molcol` -> Mol, `hsb(...)` ->
  HSB, `#hex` / `rgb(...)` -> RGB, bare name -> Named, clamped to the visible
  `modes`), and a named colour shows its list entry preselected. This avoids
  silently rewriting the value into another representation (e.g. a named
  colour becoming `#hex`) merely because the popover defaulted to RGB.
- **Sites migrated:** `components/inspector/PropEditors.tsx` (`ColorEditor`),
  `components/panes/ColorPane.tsx` (Paint table cell), `DensityMapPane.tsx`
  (solid colour), `components/panes/settings/SettingRow.tsx` +
  `SettingsPane.tsx`. `InspectorPanel` gains `cm` / `sceneId` props (wired
  from `App.tsx`).

## Notes

- Widget: `react-gui/src/renderer/components/widgets/colorpicker/ColorPicker.tsx`
  (+ `ColorSlider`, `RgbHsbPanel`, `NamedListPanel`, `PalettePanel`,
  `colorMath.ts`); styles in `react-gui/src/renderer/styles/_colorpicker.css`.
- Worker service: `react-gui/src/renderer/worker/server/services/colorPicker.service.ts`;
  `ServiceMap` rows `compileColor` / `getNamedColors` in
  `worker/shared/WorkerCalls.ts`.
- Shared adapter: `components/widgets/colorpicker/ColorPickerContext.tsx`
  (`ColorPickerProvider` / `useColorPickerCtx`) and `CueColorField.tsx`.
- Integration: `components/panes/ColorPane.tsx` (decks + Paint cell),
  `DensityMapPane.tsx`, `components/inspector/PropEditors.tsx`,
  `components/panels/InspectorPanel.tsx`,
  `components/panes/settings/SettingRow.tsx` + `SettingsPane.tsx`.
- UXP parity references: `uxp_gui/cuemol2/base/content/colpicker.js`,
  `colorSlider.xml`, `color-menu.xul`; colour maths from
  `uxp_gui/cuemol2/components/jsmods/cuemol2ui-lib/util.js`
  (`convHSB2RGB` / `convRGB2HSB` / `packToHTMLColor`).
- Tests: `__test__/colorMath.test.ts`, `__test__/colorPickerService.test.ts`,
  `__test__/ColorPicker.test.tsx` (incl. `modes` restriction),
  `__test__/cueColorField.test.tsx`, `__test__/settingRow.test.tsx`.
