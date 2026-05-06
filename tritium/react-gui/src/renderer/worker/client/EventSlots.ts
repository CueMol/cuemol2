import type { EventNotifyArgs } from './WorkerTransport';

export class EventSlots {
    private _slot: { [key: string]: any } = {};

    register(slotId: number, observer: any): void {
        this._slot[slotId.toString()] = observer;
    }

    unregister(slotId: number): void {
        delete this._slot[slotId.toString()];
    }

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
