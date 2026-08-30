/**
 * @file __test__/numericMath.test.ts
 * @description Unit tests for the shared form-kit numeric math helpers. Pins the
 * precision / clamp / snap contract that both DragNumericField and SliderField
 * rely on, so the extraction stays behaviour-preserving and a future change to
 * the rounding rules is caught here rather than per-widget.
 */

import { describe, it, expect } from 'vitest';
import {
    decimalsOf,
    quantize,
    clampAndQuantize,
    snapTo,
} from '@renderer/h3-kit/form/numericMath';

describe('numericMath', () => {
    describe('decimalsOf', () => {
        it('derives decimal places from the step', () => {
            expect(decimalsOf(1)).toBe(0);
            expect(decimalsOf(0.1)).toBe(1);
            expect(decimalsOf(0.01)).toBe(2);
            expect(decimalsOf(0.001)).toBe(3);
        });
        it('treats non-positive / non-finite step as integer precision', () => {
            expect(decimalsOf(0)).toBe(0);
            expect(decimalsOf(-1)).toBe(0);
            expect(decimalsOf(NaN)).toBe(0);
            expect(decimalsOf(Infinity)).toBe(0);
        });
        it('clamps a step > 1 to 0 decimals (no negative places)', () => {
            expect(decimalsOf(10)).toBe(0);
        });
    });

    describe('quantize', () => {
        it('strips IEEE-754 drift to the step precision', () => {
            expect(quantize(0.1 + 0.2, 0.1)).toBe(0.3);
            expect(quantize(0.30000000000000004, 0.1)).toBe(0.3);
        });
        it('rounds to integer for step 1', () => {
            expect(quantize(2.4, 1)).toBe(2);
            expect(quantize(2.6, 1)).toBe(3);
        });
        it('returns the value unchanged for a non-positive step', () => {
            expect(quantize(2.345, 0)).toBe(2.345);
            expect(quantize(2.345, NaN)).toBe(2.345);
        });
    });

    describe('clampAndQuantize', () => {
        it('clamps below min and above max', () => {
            expect(clampAndQuantize(-5, 0, 10, 1)).toBe(0);
            expect(clampAndQuantize(15, 0, 10, 1)).toBe(10);
        });
        it('quantizes an in-range value', () => {
            expect(clampAndQuantize(0.1 + 0.2, 0, 1, 0.1)).toBe(0.3);
        });
        it('clamps then quantizes (bound is already on the step grid)', () => {
            expect(clampAndQuantize(10.94, 0, 10.9, 0.1)).toBe(10.9);
        });
    });

    describe('snapTo', () => {
        it('snaps to the nearest multiple of snap', () => {
            expect(snapTo(7, 5)).toBe(5);
            expect(snapTo(8, 5)).toBe(10);
            expect(snapTo(0.23, 0.1)).toBeCloseTo(0.2, 10);
        });
        it('leaves the value unchanged for a non-positive / non-finite snap', () => {
            expect(snapTo(7.3, 0)).toBe(7.3);
            expect(snapTo(7.3, NaN)).toBe(7.3);
        });
    });
});
