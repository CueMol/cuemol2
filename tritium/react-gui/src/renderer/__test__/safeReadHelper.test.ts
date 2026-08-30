import { describe, it, expect } from 'vitest';
import { safeRead } from '@renderer/worker/server/services/helpers/safeRead';

describe('safeRead', () => {
    it('returns the value produced by the read thunk', () => {
        expect(safeRead(() => 42)).toBe(42);
        expect(safeRead(() => 'hello')).toBe('hello');
    });

    it('returns undefined when the read thunk throws', () => {
        expect(
            safeRead(() => {
                throw new Error('boom');
            })
        ).toBeUndefined();
    });

    it('does not coerce falsy values returned by the thunk', () => {
        expect(safeRead(() => 0)).toBe(0);
        expect(safeRead(() => '')).toBe('');
        expect(safeRead(() => false)).toBe(false);
    });
});
