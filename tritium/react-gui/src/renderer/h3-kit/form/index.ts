/**
 * @file h3-kit/form/index.ts
 * @description Form-kit catalog: the canonical, size-owning building blocks for
 * label+control UI. Compose these instead of hand-laying-out rows/controls so a
 * size is never re-chosen per component. Canonical sizing lives in
 * `styles/_form-kit.css` (driven by the `--field-*` / `--form-*` tokens).
 *
 * @module form
 */

export { Field } from './Field';
export type { FieldProps } from './Field';
export { FieldGroup } from './FieldGroup';
export type { FieldGroupProps } from './FieldGroup';
export { FieldSection } from './FieldSection';
export type { FieldSectionProps } from './FieldSection';
export { FieldGrid, FieldGridRow } from './FieldGrid';
export type { FieldGridProps, FieldGridRowProps } from './FieldGrid';
export { SectionHeader } from './SectionHeader';
export type { SectionHeaderProps } from './SectionHeader';
export { TextField } from './TextField';
export type { TextFieldProps } from './TextField';
export { SelectField } from './SelectField';
export type { SelectFieldProps } from './SelectField';
export { NumericField } from './NumericField';
export type { NumericFieldProps } from './NumericField';
export { DragNumericField } from './DragNumericField';
export type { DragNumericFieldProps } from './DragNumericField';
export { SwitchField } from './SwitchField';
export type { SwitchFieldProps } from './SwitchField';
export { ColorField } from './ColorField';
export type { ColorFieldProps } from './ColorField';
export { ButtonRow, FormButton } from './ButtonRow';
export type { ButtonRowProps } from './ButtonRow';
export { SegmentField } from './SegmentField';
export type { SegmentFieldProps, SegmentFieldOption } from './SegmentField';
