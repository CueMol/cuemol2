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
export class EventSlots {
    private _slot: { [key: string]: any } = {};

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
        let json: string | null = null;
        let jobj: any = null;

        if (typeof evtStr === 'string') {
            json = evtStr;
            if (json && json.length > 0) jobj = JSON.parse(json);
            else jobj = new Object();
        } else {
            console.log('unknown evtStr type', evtStr);
        }

        const dict_args = {
            method: category,
            srcCat: srcCat,
            evtType: evtType,
            srcUID: srcUID,
            obj: jobj,
        };

        const strslot = slot.toString();
        if (strslot in this._slot) {
            const obs = this._slot[strslot];
            if (typeof obs === "function") return obs(dict_args);
            else if ("notify" in obs && typeof obs.notify === "function")
                return obs.notify(dict_args);
            else
                console.log("warning : event for slot " + strslot + " is not delivered!!");
        }
        return null;
    }
}
