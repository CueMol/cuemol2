/**
 * @file __test__/multiGradPresets.test.ts
 * @description Pins the preset node values/colors against the UXP
 * multigrad_editor.js onPresetSel implementation.
 */

import { describe, expect, it } from 'vitest';
import {
  MULTIGRAD_PRESETS,
  buildPresetNodes,
} from '../components/multigrad/multiGradPresets';

const stats = { min: -2, max: 8 }; // span 10

describe('buildPresetNodes', () => {
  it('rainbow1: 6 colors at regular intervals (UXP parity)', () => {
    const nodes = buildPresetNodes('rainbow1', stats)!;
    expect(nodes.map((n) => n.value)).toEqual([-2, 0, 2, 4, 6, 8]);
    expect(nodes.map((n) => n.color)).toEqual([
      '#FF0000',
      '#FFFF00',
      '#00FF00',
      '#00FFFF',
      '#0000FF',
      '#FF00FF',
    ]);
  });

  it('resmap1: 5 colors at regular intervals (UXP parity)', () => {
    const nodes = buildPresetNodes('resmap1', stats)!;
    expect(nodes.map((n) => n.value)).toEqual([-2, 0.5, 3, 5.5, 8]);
    expect(nodes.map((n) => n.color)).toEqual([
      '#0F77CF',
      '#87E3E7',
      '#FFFFFF',
      '#CF8FAF',
      '#9E205E',
    ]);
  });

  it('heatmap1: named Red/Yellow/White at min, min+0.6666*span, max (UXP parity)', () => {
    const nodes = buildPresetNodes('heatmap1', stats)!;
    expect(nodes).toHaveLength(3);
    expect(nodes[0]).toEqual({ value: -2, color: 'Red' });
    expect(nodes[1].value).toBeCloseTo(-2 + 10 * 0.6666);
    expect(nodes[1].color).toBe('Yellow');
    expect(nodes[2]).toEqual({ value: 8, color: 'White' });
  });

  it('degenerate range (< 0.001) returns null for every preset', () => {
    for (const p of MULTIGRAD_PRESETS) {
      expect(buildPresetNodes(p.id, { min: 1, max: 1.0005 })).toBeNull();
    }
  });
});
