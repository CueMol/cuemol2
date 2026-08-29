/**
 * @file __test__/propModel.test.ts
 * @description Unit tests for the inspector per-property reset model helpers
 * (`components/inspector/propModel.ts`): the `isModified` predicate, the reset
 * key-set math, and the default-value annotation formatter.
 */

import { describe, it, expect } from 'vitest';
import {
    isModified,
    isResettable,
    modifiedKeys,
    formatDefaultLabel,
} from '../components/inspector/propModel';
import type { GenericPropEntry } from '@renderer/worker/shared/genericProps';

/** Build a minimal entry; override only the fields a case cares about. */
function entry(over: Partial<GenericPropEntry> & { key: string }): GenericPropEntry {
    return {
        key: over.key,
        type: over.type ?? 'real',
        value: over.value ?? 0,
        readonly: over.readonly ?? false,
        hasdefault: over.hasdefault ?? false,
        isdefault: over.isdefault ?? false,
        enumdef: over.enumdef,
        isContainer: over.isContainer ?? false,
        depth: over.depth ?? 0,
    };
}

describe('isModified', () => {
    it('is false when the property has no default', () => {
        expect(isModified(entry({ key: 'name', hasdefault: false, isdefault: false }))).toBe(false);
    });

    it('is false when the property is at its default', () => {
        expect(isModified(entry({ key: 'alpha', hasdefault: true, isdefault: true }))).toBe(false);
    });

    it('is true when the property has a default and differs from it', () => {
        expect(isModified(entry({ key: 'alpha', hasdefault: true, isdefault: false }))).toBe(true);
    });
});

describe('isResettable', () => {
    it('is false without a default', () => {
        expect(isResettable(entry({ key: 'foo', hasdefault: false }))).toBe(false);
    });

    it('is true for a normal property with a default', () => {
        expect(isResettable(entry({ key: 'alpha', hasdefault: true }))).toBe(true);
    });

    it('is false for the never-reset keys even with a default', () => {
        expect(isResettable(entry({ key: 'name', hasdefault: true }))).toBe(false);
        expect(isResettable(entry({ key: 'sel', hasdefault: true }))).toBe(false);
    });
});

describe('modifiedKeys', () => {
    it('returns only resettable modified keys, preserving input order', () => {
        const entries = [
            entry({ key: 'name', hasdefault: false }),
            entry({ key: 'alpha', hasdefault: true, isdefault: false }),
            entry({ key: 'visible', hasdefault: true, isdefault: true }),
            entry({ key: 'width', hasdefault: true, isdefault: false }),
        ];
        expect(modifiedKeys(entries)).toEqual(['alpha', 'width']);
    });

    it('excludes never-reset keys (name / sel) even when modified', () => {
        const entries = [
            entry({ key: 'name', hasdefault: true, isdefault: false }),
            entry({ key: 'sel', hasdefault: true, isdefault: false }),
            entry({ key: 'alpha', hasdefault: true, isdefault: false }),
        ];
        expect(modifiedKeys(entries)).toEqual(['alpha']);
    });

    it('returns an empty array when nothing is modified', () => {
        expect(modifiedKeys([entry({ key: 'a', hasdefault: true, isdefault: true })])).toEqual([]);
    });
});

describe('formatDefaultLabel', () => {
    it('returns undefined when no default value is known', () => {
        expect(formatDefaultLabel({ type: 'real' })).toBeUndefined();
    });

    it('formats booleans as on/off', () => {
        expect(formatDefaultLabel({ type: 'boolean', defaultValue: true })).toBe('on');
        expect(formatDefaultLabel({ type: 'boolean', defaultValue: false })).toBe('off');
    });

    it('formats reals with two decimals', () => {
        expect(formatDefaultLabel({ type: 'real', defaultValue: 1 })).toBe('1.00');
    });

    it('coerces a string-form real default (style-resolved values)', () => {
        expect(formatDefaultLabel({ type: 'real', defaultValue: '2' })).toBe('2.00');
    });

    it('passes through other types as strings', () => {
        expect(formatDefaultLabel({ type: 'enum', defaultValue: 'none' })).toBe('none');
        expect(formatDefaultLabel({ type: 'integer', defaultValue: 3 })).toBe('3');
    });
});
