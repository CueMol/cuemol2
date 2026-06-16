/**
 * @file h3-kit/SliderNumericField.tsx
 * @description Back-compat re-export of the form-kit `SliderField`.
 *
 * This widget moved into the form catalog (`h3-kit/form/SliderField.tsx`) as
 * part of the control-sizing reunification: the slider + numeric input + custom
 * stepper row now lives next to the other catalog controls, and its sizing is
 * owned by `.h3-form-sliderfield*` in `styles/_form-kit.css`. The `scale`
 * transform, clamp validation, IEEE-754 quantization and empty-field guard are
 * all carried by `SliderField` unchanged.
 *
 * The original `SliderNumericField` name (and `SliderNumericFieldProps`) is kept
 * here as an alias so existing consumers (the coloring panel's Rainbow deck, the
 * density-map panel, the component catalog) need no rename. Prefer importing
 * `SliderField` from `h3-kit/form` in new code.
 */

export { SliderField as SliderNumericField } from './form/SliderField';
export type { SliderFieldProps as SliderNumericFieldProps } from './form/SliderField';
