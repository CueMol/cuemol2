import { wrapper_map } from './wrapper_loader';

export class CueMol {
  constructor(myapi) {
    this._internal = myapi.internal;
  }

  get internal() {
    return this._internal;
  }

  initCueMol(config) {
    this.internal.initCueMol(config);
  }

  bindView(id, view) {}

  createWrapper(native_obj) {
    if (typeof native_obj === 'undefined') {
      return null;
    }
    // console.log('native_obj:', native_obj);
    const className = native_obj.getClassName();
    // console.log('className:', className);
    const Klass = wrapper_map[className];
    const obj = new Klass(native_obj, this);
    // console.log('wrapper created:', obj);
    return obj;
  }

  createObj(className) {
    const obj = this.internal.createObj(className);
    return this.createWrapper(obj);
  }

  getService(className) {
    const obj = this.internal.getService(className);
    return this.createWrapper(obj);
  }
}

export class EventManager {

  // event constants
  // TODO: get values from C++ impl
  get SEM_ANY() { return -1; }
  
  // source category ID definition
  get SEM_LOG() { return 0x0001; }
  get SEM_INDEV() { return 0x0002; }
  get SEM_SCENE() { return 0x0004; }
  get SEM_OBJECT() { return 0x0008; }
  get SEM_RENDERER() { return 0x0010; }
  get SEM_VIEW() { return 0x0020; }
  get SEM_CAMERA() { return 0x0040; }
  get SEM_STYLE() { return  0x0080; }
  get SEM_ANIM () { return   0x0100; }
  get SEM_EXTND() { return   0x8000; }
  
  // event type ID definition
  get SEM_ADDED() { return  1; }
  get SEM_REMOVING() { return  2; }
  get SEM_PROPCHG() { return 3; }
  get SEM_CHANGED() { return  4; }
  get SEM_OTHER() { return 9999; }
  
  constructor(cuemol) {
    this._cuemol = cuemol;
    this._mgr = cuemol.getService('ScrEventManager');
    this._mgr.addListener((...args) => {
      try {
        this.notify(...args);
      } catch (e) {
        console.log('event manager notify failed:', e);
      }
    });
    this._slot = {};
  }

  addListener(aCatStr, aSrcType, aEvtType, aSrcID, aObs) {
    const slot_id = this._mgr.append(aCatStr, aSrcType, aEvtType, aSrcID);
    //dd("event listener registered: <"+aCatStr+">, id="+slot_id);
    this._slot[slot_id.toString()] = aObs;
    return slot_id;
  }

  removeListener(nID) {
    if (this._mgr)
      this._mgr.remove(nID);
    
    //dd("EventManager, unload slot: "+nID);
    //this.mSlot[nID.toString()] = null;
    delete this._slot[nID.toString()];
    
    // dd(" --> removed: "+this.mSlot[nID.toString()]);
  }

  notify(slot, category, srcCat, evtType, srcUID, evtStr) {
    let json = null;
    let jobj = null;

    // console.log('notify called:', slot, category, srcCat, evtType, srcUID, evtStr);
    
    if (typeof evtStr == 'string') {
      json = evtStr;
      if (json && json.length>0)
        jobj = JSON.parse(json);
      else
        jobj = new Object();
    }
    else {
      // TODO: impl??
      // let cm = require("cuemol");
      // jobj = cm.convPolymObj(evtStr);
      // dd("Event notify arg4=obj, "+jobj);
      console.log('unknown evtStr type', evtStr);
    }

    const dict_args = {
      method: category,
      srcCat: srcCat,
      evtType: evtType,
      srcUID: srcUID,
      obj: jobj,
      // raw: args,
    };

    const strslot = slot.toString();
    if (strslot in this._slot) {
      const obs = this._slot[strslot];
      if (typeof obs == "function")
        return obs(dict_args);
      else if ("notify" in obs && typeof obs.notify == "function")
        return obs.notify(dict_args);
      else
        console.log("warning : event for slot "+strslot+" is not delivered!!");
    }
    return null;
  }
}
