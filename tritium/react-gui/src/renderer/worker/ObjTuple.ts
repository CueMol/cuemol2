
export class ObjTuple {
    _obj_id: string;
    _class_name: string;

    constructor(obj_id: string, class_name: string) {
        this._obj_id = obj_id;
        this._class_name = class_name;
    }

    get objId(): string {
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
