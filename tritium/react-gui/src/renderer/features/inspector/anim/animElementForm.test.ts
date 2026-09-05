/**
 * @file features/inspector/anim/animElementForm.test.ts
 * @description Contract for the animation inspector's conversions.
 *
 * These decide what the fields show and which axis preset the dropdown lands
 * on -- both silent when wrong: a mis-wrapped angle looks like a valid value,
 * and a missed preset just shows "Cartesian" for a vector that is exactly an
 * axis. The boundaries are what these pin.
 */

import { describe, it, expect } from 'vitest';
import {
    axisPreset,
    buildTimeRefOptions,
    fmtAxis,
    legacyStartNote,
    wrapAngle,
} from './animElementForm';

describe('wrapAngle', () => {
    it('leaves an angle already in range alone', () => {
        expect(wrapAngle(0)).toBe(0);
        expect(wrapAngle(180)).toBe(180);
        expect(wrapAngle(360)).toBe(360);
    });

    it('brings a negative angle up into range', () => {
        expect(wrapAngle(-90)).toBe(270);
        expect(wrapAngle(-360)).toBe(0);
        // More than one turn below: the loop has to run twice.
        expect(wrapAngle(-450)).toBe(270);
    });

    it('brings an angle past a full turn back down', () => {
        expect(wrapAngle(450)).toBe(90);
        // The upper bound is inclusive -- `> 360`, not `>= 360` -- so a full
        // turn stays 360 rather than snapping to 0. Dragging up through the
        // top of the range therefore reads continuously instead of jumping
        // back to zero, and 360 and 0 are the same rotation anyway.
        expect(wrapAngle(720)).toBe(360);
        expect(wrapAngle(725)).toBe(5);
    });
});

describe('axisPreset', () => {
    it('names each cardinal axis', () => {
        expect(axisPreset(1, 0, 0)).toBe('x');
        expect(axisPreset(0, 1, 0)).toBe('y');
        expect(axisPreset(0, 0, 1)).toBe('z');
    });

    it('falls back to cartesian for anything else', () => {
        expect(axisPreset(1, 1, 0)).toBe('cart');
        expect(axisPreset(0, 0, 0)).toBe('cart');
        // A scaled axis is not the preset: the dropdown would misreport the
        // vector's length as unit.
        expect(axisPreset(2, 0, 0)).toBe('cart');
        expect(axisPreset(-1, 0, 0)).toBe('cart');
    });
});

describe('fmtAxis', () => {
    it('rounds to four decimals and drops trailing zeros', () => {
        expect(fmtAxis(1)).toBe('1');
        expect(fmtAxis(0.5)).toBe('0.5');
        expect(fmtAxis(0.123456)).toBe('0.1235');
        // The IEEE-754 noise a drag produces must not reach the field.
        expect(fmtAxis(0.30000000000000004)).toBe('0.3');
    });
});

describe('buildTimeRefOptions', () => {
    const sib = (name: string, usable = true, reason?: string) =>
        reason === undefined ? { name, usable } : { name, usable, reason };

    it('lists usable candidates plainly and disables the rest with the reason in the label', () => {
        const { options, dangling } = buildTimeRefOptions({ timeRefName: 'A' }, [
            sib('A'),
            sib('B', false, 'would create a cycle'),
            sib('C', false, 'duplicate name'),
        ]);
        expect(dangling).toBeNull();
        expect(options.map((o) => [o.value, o.label, o.disabled])).toEqual([
            ['A', 'A', false],
            ['B', 'B (would create a cycle)', true],
            ['C', 'C (duplicate name)', true],
        ]);
    });

    it('represents a reference that no longer exists as a selected, disabled entry', () => {
        const { options, dangling } = buildTimeRefOptions({ timeRefName: 'Gone' }, [sib('A')]);
        expect(dangling).toBe('Gone');
        expect(options[0]).toMatchObject({ value: 'Gone', label: '(missing: Gone)', disabled: true });
        expect(options.map((o) => o.value)).toEqual(['Gone', 'A']);
    });

    it('drops empty and repeated names, and never calls the absolute state dangling', () => {
        const { options, dangling } = buildTimeRefOptions({ timeRefName: '' }, [
            sib(''),
            sib('A'),
            sib('A'),
        ]);
        expect(dangling).toBeNull();
        expect(options.map((o) => o.value)).toEqual(['A']);
        expect(new Set(options.map((o) => o.key)).size).toBe(options.length);
    });
});

describe('legacyStartNote', () => {
    it('is null for a non-negative start', () => {
        expect(legacyStartNote(0)).toBeNull();
        expect(legacyStartNote(1500)).toBeNull();
    });

    it('states a negative stored start as a signed timecode', () => {
        expect(legacyStartNote(-500)).toBe(
            'Stored start is -0:00.500 (legacy negative offset); it is kept until you set a new start.',
        );
    });
});
