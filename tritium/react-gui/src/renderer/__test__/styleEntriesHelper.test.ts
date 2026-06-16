import { describe, it, expect, vi } from 'vitest';
import { fetchStyleEntries } from '../worker/server/services/helpers/styleEntries';
import type { WorkerContext } from '../worker/server/types/WorkerContext';

/** Build a minimal WorkerContext whose styleMgr returns `json` for any scope. */
function makeCtx(json: string | null | undefined): WorkerContext {
    return {
        styleMgr: { getStyleNamesJSON: vi.fn(() => json) },
    } as unknown as WorkerContext;
}

describe('fetchStyleEntries', () => {
    it('parses a JSON array of style entries, preserving fields', () => {
        const ctx = makeCtx(
            JSON.stringify([
                { name: 'DefaultCartoon', desc: 'Cartoon', type: 'cartoon' },
                { name: 'DefaultHSCPaint' },
            ])
        );
        expect(fetchStyleEntries(ctx, 0)).toEqual([
            { name: 'DefaultCartoon', desc: 'Cartoon', type: 'cartoon' },
            { name: 'DefaultHSCPaint' },
        ]);
    });

    it('returns [] for null/empty JSON from the style manager', () => {
        expect(fetchStyleEntries(makeCtx(null), 0)).toEqual([]);
        expect(fetchStyleEntries(makeCtx(''), 0)).toEqual([]);
    });

    it('returns [] on malformed JSON', () => {
        expect(fetchStyleEntries(makeCtx('{not valid json'), 0)).toEqual([]);
    });

    it('returns [] when the parsed payload is not an array', () => {
        expect(fetchStyleEntries(makeCtx('{"name":"x"}'), 0)).toEqual([]);
    });

    it('returns [] when getStyleNamesJSON throws', () => {
        const ctx = {
            styleMgr: {
                getStyleNamesJSON: vi.fn(() => {
                    throw new Error('boom');
                }),
            },
        } as unknown as WorkerContext;
        expect(fetchStyleEntries(ctx, 0)).toEqual([]);
    });
});
