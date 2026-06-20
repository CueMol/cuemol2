/**
 * @file __test__/renderSizeUnits.test.ts
 * @description Pins the image-size unit conversion shared by the renderer
 * (Inspector size fields) and the worker (POV-Ray pixel output).
 *
 * These are a direct port of UXP `render-pov-dlg.js` `convImgSizeUnit` /
 * `convPixToUnit`, so the tritium output matches CueMol2 for a given
 * width / height / unit / DPI. `pixelImageSize` is what the backend and the
 * Render Result tab use, so a regression here would silently render the
 * wrong physical size again.
 */

import { describe, it, expect } from 'vitest';
import {
    sizeUnitToPx,
    pxToSizeUnit,
    SIZE_UNIT_FIELD_META,
    type ImageSizeUnit,
} from '../data/renderSettings';
import { pixelImageSize } from '../worker/server/services/renderBackends/RenderBackend';
import type { PropDef } from '../data/rendererProperties';

const imageProps = (o: {
    width: number;
    height: number;
    unit: string;
    dpi: number;
}): PropDef[] => [
    { key: 'width', label: 'Width', type: 'real', value: o.width, group: 'Image' },
    { key: 'height', label: 'Height', type: 'real', value: o.height, group: 'Image' },
    { key: 'unit', label: 'Size unit', type: 'enum', value: o.unit, group: 'Image' },
    { key: 'dpi', label: 'DPI', type: 'integer', value: o.dpi, group: 'Image' },
];

describe('sizeUnitToPx', () => {
    it('passes px through unchanged', () => {
        expect(sizeUnitToPx(1200, 600, 'px')).toBe(1200);
    });
    it('converts inch via value * dpi', () => {
        expect(sizeUnitToPx(2, 600, 'in')).toBe(1200);
    });
    it('converts mm via 1in = 25.4mm', () => {
        expect(sizeUnitToPx(25.4, 600, 'mm')).toBeCloseTo(600, 6);
    });
    it('converts cm via 1in = 2.54cm', () => {
        expect(sizeUnitToPx(2.54, 600, 'cm')).toBeCloseTo(600, 6);
    });
});

describe('pxToSizeUnit', () => {
    it('rounds px to a whole pixel', () => {
        expect(pxToSizeUnit(1200.4, 600, 'px')).toBe(1200);
    });
    it('inverts the inch conversion', () => {
        expect(pxToSizeUnit(1200, 600, 'in')).toBe(2);
    });
    it('inverts the mm conversion', () => {
        expect(pxToSizeUnit(600, 600, 'mm')).toBeCloseTo(25.4, 6);
    });
    it('inverts the cm conversion', () => {
        expect(pxToSizeUnit(600, 600, 'cm')).toBeCloseTo(2.54, 6);
    });
});

describe('pixelImageSize', () => {
    it('passes px sizes through', () => {
        expect(pixelImageSize(imageProps({ width: 1200, height: 900, unit: 'px', dpi: 600 })))
            .toEqual({ width: 1200, height: 900 });
    });
    it('applies unit + DPI for inch', () => {
        expect(pixelImageSize(imageProps({ width: 2, height: 1.5, unit: 'in', dpi: 600 })))
            .toEqual({ width: 1200, height: 900 });
    });
    it('applies unit + DPI for mm', () => {
        expect(pixelImageSize(imageProps({ width: 25.4, height: 25.4, unit: 'mm', dpi: 600 })))
            .toEqual({ width: 600, height: 600 });
    });
    it('clamps to at least 1 pixel', () => {
        expect(pixelImageSize(imageProps({ width: 0.0001, height: 0.0001, unit: 'in', dpi: 1 })))
            .toEqual({ width: 1, height: 1 });
    });
});

describe('SIZE_UNIT_FIELD_META drag range', () => {
    it('keeps px ranging 100..10000', () => {
        expect(SIZE_UNIT_FIELD_META.px.min).toBe(100);
        expect(SIZE_UNIT_FIELD_META.px.max).toBe(10000);
    });

    it('sizes every unit step so one drag spans min..max (~150 steps or fewer)', () => {
        // The drag moves ~1 step / ~8px, so an edge-to-edge swipe covers
        // ~130-150 steps. A range that needs many more steps than that is not
        // draggable (the original 1px step needed ~9900 steps for px).
        for (const unit of Object.keys(SIZE_UNIT_FIELD_META) as ImageSizeUnit[]) {
            const m = SIZE_UNIT_FIELD_META[unit];
            const steps = (m.max - m.min) / m.step;
            expect(steps, `${unit} steps`).toBeGreaterThan(0);
            expect(steps, `${unit} steps`).toBeLessThanOrEqual(160);
        }
    });
});
