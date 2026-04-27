
export type ObjId = string | { future: number };

export class ObjTuple {
    _obj_id: ObjId;
    _class_name: string;

    constructor(obj_id: ObjId, class_name: string) {
        this._obj_id = obj_id;
        this._class_name = class_name;
    }

    get objId(): ObjId {
        return this._obj_id;
    }

    get className(): string {
        return this._class_name;
    }
}

export function isObjTuple(obj: any): boolean {
    if (obj && typeof obj === 'object') {
        if ('_obj_id' in obj && '_class_name' in obj) {
            return true;
        }
    }
    return false;
}

export function isFutureRef(obj_id: ObjId): obj_id is { future: number } {
    return typeof obj_id === 'object' && 'future' in obj_id;
}
