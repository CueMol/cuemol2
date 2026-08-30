/**
 * @file worker/client/EventSlots.ts
 * @description Renderer-side slot table for worker `event-notify` messages.
 *
 * `WorkerTransport` receives `event-notify` messages from the Web Worker
 * (which mirror `qlib::ScrEventManager` callbacks) and dispatches each one
 * into this table. Subscribers register against a numeric `slotId` returned
 * by the worker when they call `addEventListener`.
 */
import type { EventNotifyArgs } from './WorkerTransport';

/**
 * Slot registry for renderer-side worker event listeners.
 *
 * @remarks One instance is owned by `AsyncCueMol`. Slot IDs are allocated
 *   by the worker (`qlib::ScrEventManager`) and returned through
 *   `addEventListener`, so the renderer side is purely a routing table.
 */
/** How many notifies were delivered, and how many actually cost a parse. */
export interface EventSlotStats {
    /** Notifies dropped because no observer was registered for the slot. */
    skipped: number;
    /** Payloads actually parsed (an observer read `args.obj`). */
    parsed: number;
}

export class EventSlots {
    private _slot: { [key: string]: any } = {};
    private _stats: EventSlotStats = { skipped: 0, parsed: 0 };

    /** Notify counters; see {@link EventSlotStats}. */
    getStats(): Readonly<EventSlotStats> { return this._stats; }

    /**
     * Decode the event-specific payload. `""` and a missing document both mean
     * "no payload", which is the majority of events.
     */
    private static _parsePayload(evtStr: unknown): any {
        if (typeof evtStr !== 'string') {
            console.log('unknown evtStr type', evtStr);
            return {};
        }
        return evtStr.length > 0 ? JSON.parse(evtStr) : {};
    }

    /**
     * Register an observer for the given slot ID.
     *
     * @param slotId - Slot identifier returned by the worker's
     *   `addEventListener` reply.
     * @param observer - Either a function `(args) => void` or an object
     *   with a `notify(args)` method.
     */
    register(slotId: number, observer: any): void {
        this._slot[slotId.toString()] = observer;
    }

    /**
     * Forget the observer for the given slot ID.
     *
     * @param slotId - Slot identifier previously passed to `register`.
     */
    unregister(slotId: number): void {
        delete this._slot[slotId.toString()];
    }

    /**
     * Dispatch a worker `event-notify` payload to the registered observer.
     *
     * @param args - Tuple `[slot, category, srcCat, evtType, srcUID, evtStr]`
     *   forwarded from `WorkerTransport`. `evtStr` is the JSON-encoded
     *   event-specific payload (`""` means an empty object).
     * @returns Observer return value, or `null` if no observer is bound.
     */
    notify(...args: EventNotifyArgs): any {
        const [slot, category, srcCat, evtType, srcUID, evtStr] = args;

        // Look the observer up BEFORE touching the payload. Nothing here is
        // free: `evtStr` is a JSON document the C++ side serialised, and a
        // scene load fires hundreds of these. Parsing one for a slot nobody
        // is subscribed to is pure waste, and the common case during a load
        // is exactly that.
        const obs = this._slot[slot.toString()];
        if (obs === undefined) {
            this._stats.skipped++;
            return null;
        }

        // Even with an observer, most handlers only ever debounce a refetch
        // and never read `obj`. Parse on first access instead of eagerly, so
        // those pay nothing either.
        let parsed: unknown;
        let didParse = false;
        const stats = this._stats;
        const dict_args = {
            method: category,
            srcCat: srcCat,
            evtType: evtType,
            srcUID: srcUID,
            get obj(): any {
                if (!didParse) {
                    didParse = true;
                    parsed = EventSlots._parsePayload(evtStr);
                    stats.parsed++;
                }
                return parsed;
            },
        };

        if (typeof obs === 'function') return obs(dict_args);
        if ('notify' in obs && typeof obs.notify === 'function') {
            return obs.notify(dict_args);
        }
        console.log('warning : event for slot ' + slot + ' is not delivered!!');
        return null;
    }
}
