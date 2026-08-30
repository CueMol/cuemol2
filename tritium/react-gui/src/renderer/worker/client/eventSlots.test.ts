/**
 * @file worker/client/eventSlots.test.ts
 * @description What the slot table must not do.
 *
 * A scene load fires hundreds of `event-notify` messages, each carrying a JSON
 * document the C++ side serialised. Two kinds of them cost nothing to deliver
 * and used to cost a parse anyway: one whose slot has no observer, and one
 * whose observer only debounces a refetch and never reads the payload. These
 * pin both, because the saving is invisible -- nothing breaks if it regresses,
 * it just gets slower again.
 */

import { describe, it, expect, vi } from 'vitest';
import { EventSlots } from './EventSlots';

/** A payload big enough that parsing it is clearly not free. */
const PAYLOAD = JSON.stringify({ target_uid: 42, propname: 'visible' });

describe('EventSlots.notify', () => {
    it('does not parse a payload for a slot nobody is watching', () => {
        const slots = new EventSlots();
        const parse = vi.spyOn(JSON, 'parse');

        slots.notify(9, 'cat', 1, 2, 3, PAYLOAD);

        expect(parse).not.toHaveBeenCalled();
        expect(slots.getStats().skipped).toBe(1);
        expect(slots.getStats().parsed).toBe(0);
        parse.mockRestore();
    });

    it('does not parse when the observer never reads the payload', () => {
        const slots = new EventSlots();
        const seen: unknown[] = [];
        slots.register(1, (args: unknown) => { seen.push(args); });
        const parse = vi.spyOn(JSON, 'parse');

        slots.notify(1, 'cat', 1, 2, 3, PAYLOAD);

        expect(seen).toHaveLength(1);
        expect(parse).not.toHaveBeenCalled();
        expect(slots.getStats().parsed).toBe(0);
        parse.mockRestore();
    });

    it('parses on first read, and only once however often obj is read', () => {
        const slots = new EventSlots();
        let obj1: unknown;
        let obj2: unknown;
        slots.register(1, (args: { obj: unknown }) => {
            obj1 = args.obj;
            obj2 = args.obj;
        });
        const parse = vi.spyOn(JSON, 'parse');

        slots.notify(1, 'cat', 1, 2, 3, PAYLOAD);

        expect(parse).toHaveBeenCalledTimes(1);
        expect(obj1).toEqual({ target_uid: 42, propname: 'visible' });
        expect(obj2).toBe(obj1);
        expect(slots.getStats().parsed).toBe(1);
        parse.mockRestore();
    });

    it('gives an empty object for an empty payload, without parsing', () => {
        const slots = new EventSlots();
        let obj: unknown;
        slots.register(1, (args: { obj: unknown }) => { obj = args.obj; });
        const parse = vi.spyOn(JSON, 'parse');

        slots.notify(1, 'cat', 1, 2, 3, '');

        expect(obj).toEqual({});
        expect(parse).not.toHaveBeenCalled();
        parse.mockRestore();
    });

    it('still passes the scalar fields through untouched', () => {
        const slots = new EventSlots();
        let got: Record<string, unknown> | undefined;
        slots.register(5, (args: Record<string, unknown>) => { got = args; });

        slots.notify(5, 'sceneLoaded', 2, 4, 100, PAYLOAD);

        expect(got!.method).toBe('sceneLoaded');
        expect(got!.srcCat).toBe(2);
        expect(got!.evtType).toBe(4);
        expect(got!.srcUID).toBe(100);
    });

    it('supports an observer object with a notify method', () => {
        const slots = new EventSlots();
        const notify = vi.fn();
        slots.register(1, { notify });

        slots.notify(1, 'cat', 1, 2, 3, '');

        expect(notify).toHaveBeenCalledTimes(1);
    });

    it('stops delivering once the slot is unregistered', () => {
        const slots = new EventSlots();
        const cb = vi.fn();
        slots.register(1, cb);
        slots.unregister(1);

        slots.notify(1, 'cat', 1, 2, 3, '');

        expect(cb).not.toHaveBeenCalled();
        expect(slots.getStats().skipped).toBe(1);
    });
});
