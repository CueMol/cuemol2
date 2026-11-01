import { describe, it, expect, vi } from 'vitest';
import { fetchStyleEntries } from '@renderer/worker/server/services/helpers/styleEntries';
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';

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

    it('keeps only the last entry of a style redefined by a newer style set', () => {
        // newest set first: cuemol3_style.xml's override, then default_style.xml
        const ctx = makeCtx(
            JSON.stringify([
                { name: 'DefaultRibbon', desc: 'Default', type: 'renderer' },
                { name: 'DefaultPymRendPreset', type: 'MolCoord-rendpreset' },
                { name: 'RoundRibbon', desc: 'Round', type: 'renderer' },
                { name: 'DefaultRibbon', desc: 'Default', type: 'renderer' },
            ])
        );
        expect(fetchStyleEntries(ctx, 0).map((e) => e.name)).toEqual([
            'DefaultPymRendPreset', 'RoundRibbon', 'DefaultRibbon',
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
