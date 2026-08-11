/**
 * @file components/multigrad/multiGradPresets.ts
 * @description Gradient presets ported from the UXP multigrad_editor.js
 * onPresetSel handler. Node values are derived from the color-map object's
 * density range; colors are CueMol color strings (hex or named), passed
 * verbatim to the C++ write path.
 */

/** Preset identifiers, matching the UXP menu values. */
export type MultiGradPresetId = 'rainbow1' | 'resmap1' | 'heatmap1';

/** Density statistics of the color-map object. */
export interface MapStats {
  min: number;
  max: number;
  mean: number;
  sigma: number;
}

/** A gradient node to write: value + CueMol color string. */
export interface GradNode {
  value: number;
  color: string;
}

/** Presets shown in the UI, in UXP menu order. */
export const MULTIGRAD_PRESETS: { id: MultiGradPresetId; label: string }[] = [
  { id: 'rainbow1', label: 'Rainbow' },
  { id: 'resmap1', label: 'Resmap' },
  { id: 'heatmap1', label: 'Heatmap' },
];

/**
 * Build the node list for a preset over the map's [min, max] range.
 * Ported 1:1 from UXP multigrad_editor.js onPresetSel.
 *
 * @returns the nodes, or null when the range is degenerate
 *   (max - min < 0.001) and the preset cannot be applied.
 */
export function buildPresetNodes(
  preset: MultiGradPresetId,
  stats: Pick<MapStats, 'min' | 'max'>,
): GradNode[] | null {
  const dmin = stats.min;
  const dmax = stats.max;
  if (!(dmax - dmin >= 0.001)) return null;

  switch (preset) {
    case 'rainbow1': {
      // rainbow colors at regular intervals between min and max
      const delta = (dmax - dmin) / 5.0;
      return [
        { value: dmin, color: '#FF0000' },
        { value: dmin + delta, color: '#FFFF00' },
        { value: dmin + delta * 2, color: '#00FF00' },
        { value: dmin + delta * 3, color: '#00FFFF' },
        { value: dmin + delta * 4, color: '#0000FF' },
        { value: dmin + delta * 5, color: '#FF00FF' },
      ];
    }
    case 'resmap1': {
      // resmap colors at regular intervals between min and max
      const delta = (dmax - dmin) / 4.0;
      return [
        { value: dmin, color: '#0F77CF' },
        { value: dmin + delta, color: '#87E3E7' },
        { value: dmin + delta * 2, color: '#FFFFFF' },
        { value: dmin + delta * 3, color: '#CF8FAF' },
        { value: dmin + delta * 4, color: '#9E205E' },
      ];
    }
    case 'heatmap1': {
      // heatmap: red -> yellow -> white (named colors, as in UXP)
      const delta = dmax - dmin;
      return [
        { value: dmin, color: 'Red' },
        { value: dmin + delta * 0.6666, color: 'Yellow' },
        { value: dmax, color: 'White' },
      ];
    }
  }
}
