/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 4 -*-
*/

var debug = require("debug_util");
var dd = debug.dd;

var EventManager =
( function () {
//   const Cc = Components.classes;
//   const Ci = Components.interfaces;
//   const Cu = Components.utils;
//   const Cr = Components.results;

const {Cc,Ci,Cu,Cr} = require("chrome");

var cuemol;
var _mgr;

//////////

var EventListener = function (aMgr)
{
  this.mParent = aMgr;
}

EventListener.prototype.notify = function (args)
{
  try {
    // dd("***** EventManager (listener) notify called: "+args+"\n");
    return this.mParent.notify(args);
  }
  catch (e) {
    debug.exception(e);
  }
}

//////////

var ctor = function ()
{
  dd("EventManager ctor...");

  cuemol = Cc["@cuemol.org/XPCCueMol"].getService(Ci.qICueMol);
  if (!cuemol) {
    dd("FATAL ERROR: XPCCueMol is not loaded");
    return;
  }

  var listener = new EventListener(this);
  _mgr = cuemol.getService("ScrEventManager");
  _mgr.invokeWithCallback1("addListener", listener);

  var obss = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);
  obss.addObserver(this, "quit-application", false);

  this.mSlot = new Object();
}

ctor.prototype.addListener = function (aCatStr, aSrcType, aEvtType, aSrcID, aObs)
{
  var slot_id = _mgr.invoke4("append", aCatStr, aSrcType, aEvtType, aSrcID);
  //dd("event listener registered: <"+aCatStr+">, id="+slot_id);
  
  this.mSlot[slot_id.toString()] = aObs;
  return slot_id;
}

ctor.prototype.removeListener = function (nID)
{
  if (_mgr)
    _mgr.invoke1("remove", nID);
  
  //dd("EventManager, unload slot: "+nID);
  //this.mSlot[nID.toString()] = null;
  delete this.mSlot[nID.toString()];

  // dd(" --> removed: "+this.mSlot[nID.toString()]);
}

ctor.prototype.notify = function (args)
{
  var slot = args[0];
  args.shift();
  // dd("EventManager notify called for slot "+slot+": "+args);

  var arg4 = args[4];
  var json = null;
  var jobj = null;

  if (typeof arg4 == 'string') {
    json = arg4;
    try {
      if (json && json.length>0)
        jobj = JSON.parse(json);
      else
        jobj = new Object();
    }
    catch (e) {
      dd("JSON.parse error: "+json);
      debug.exception(e);
      dd("ERROR: EVENT IS LOST");
      return;
    }
  }
  else {
    let cm = require("cuemol");
    //jobj = arg4;
    jobj = cm.convPolymObj(arg4);
    dd("Event notify arg4=obj, "+jobj);
  }
    
  var newargs = new Object();
  newargs.method = args[0];
  newargs.srcCat = args[1];
  newargs.evtType = args[2];
  newargs.srcUID = args[3];
  newargs.obj = jobj;
  newargs.raw = args;

  var strslot = slot.toString();
  if (strslot in this.mSlot) {
    var obs = this.mSlot[strslot];
    if (typeof obs == "function")
      return obs(newargs);
    else if ("notify" in obs && typeof obs.notify == "function")
      return obs.notify(newargs);
    else
      dd("warning : event for slot "+strslot+" is not delivered!!");
  }
}

ctor.prototype.observe = function (aSubj, aTopic, aData)
{
  dump("**** Event.JS QUIT-APPLICATION CALLED!! ****\n");
  _mgr.invoke1("removeListener", 0);
  cuemol = null;
  _mgr = null;
}

ctor.prototype.SEM_ANY = -1;

// source category ID definition
ctor.prototype.SEM_LOG      = 0x0001;
ctor.prototype.SEM_INDEV    = 0x0002;
ctor.prototype.SEM_SCENE    = 0x0004;
ctor.prototype.SEM_OBJECT   = 0x0008;
ctor.prototype.SEM_RENDERER = 0x0010;
ctor.prototype.SEM_VIEW     = 0x0020;
ctor.prototype.SEM_CAMERA   = 0x0040;
ctor.prototype.SEM_STYLE    = 0x0080;
ctor.prototype.SEM_ANIM     = 0x0100;
ctor.prototype.SEM_EXTND    = 0x8000;

// event type ID definition
ctor.prototype.SEM_ADDED = 1;
ctor.prototype.SEM_REMOVING = 2;
ctor.prototype.SEM_PROPCHG = 3;
ctor.prototype.SEM_CHANGED = 4;
ctor.prototype.SEM_OTHER = 9999;

/*
require("unload").when(
  function() {
    dump("**** Event.JS UNLOAD CALLED!! ****\n");
    //_mgr.invoke1("removeListener", 0);
    //cuemol = null;
    //_mgr = null;
  });
*/

return ctor;
} ) ();

exports.manager = new EventManager();

