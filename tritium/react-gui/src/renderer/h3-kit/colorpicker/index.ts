/**
 * @file h3-kit/colorpicker/index.ts
 * @description Colour-picker catalog: the popover picker itself, the field that
 * opens it, the provider that supplies the scene-scoped colour lists, and the
 * RGB/HSB conversions the panels share.
 *
 * Unlike `form/` and `list/`, this corner of the kit talks to CueMol -- the
 * named-colour and palette panels read the scene's colour table through the
 * worker transport. It stays in the kit because it is a reusable widget with
 * no knowledge of any particular pane.
 *
 * @module colorpicker
 */

export { ColorPicker } from './ColorPicker';
export type { Mode } from './ColorPicker';
export { CueColorField } from './CueColorField';
export { ColorPickerProvider, useColorPickerCtx } from './ColorPickerContext';
export type { ColorPickerCtx } from './ColorPickerContext';
export { ColorSlider } from './ColorSlider';
export { NamedListPanel } from './NamedListPanel';
export { PalettePanel } from './PalettePanel';
export { RgbHsbPanel } from './RgbHsbPanel';
export type { SliderMode } from './RgbHsbPanel';
export { hsbToRgb, rgbToHsb, packToHex, packToHsbString } from './colorMath';
export type { Rgb, Hsb } from './colorMath';
