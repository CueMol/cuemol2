/**
 * @file components/fopen-opt-dlgs/presetUtils.ts
 * @description Naming helpers for renderer presets.
 *
 * A preset style id conventionally ends with 'RendPreset'
 * (e.g. 'Default1RendPreset'). UXP used the raw style id as the default
 * renderer-name prefix, producing clunky names like 'Default1RendPreset1';
 * tritium derives a short lowercase prefix instead (ADR-0046).
 */

/**
 * Derive the proposeUniqName prefix for a preset: strip the conventional
 * 'RendPreset' suffix, lowercase, and append '_' so the numeric suffix
 * reads as a counter ('Default1RendPreset' -> 'default1_' -> 'default1_1').
 * A name without the suffix falls back to its whole lowercased form.
 */
export function presetNamePrefix(styleName: string): string {
  const base = styleName.replace(/RendPreset$/, '') || styleName;
  return base.toLowerCase() + '_';
}
